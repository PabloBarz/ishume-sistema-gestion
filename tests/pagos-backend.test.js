import {test} from 'node:test';
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {mkdtemp,readdir,readFile,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join,resolve,sep} from 'node:path';
import express from 'express';
import {once} from 'node:events';
import {jsPDF} from 'jspdf';
import {pool} from '../src/config/db.js';
import {pagosService} from '../src/services/pagosService.js';
import pagosRouter from '../src/routes/pagosRouter.js';
import {importeCentimos,fechaValida,validarAbono} from '../src/services/pagoValidaciones.js';
import {validarContenidoArchivo} from '../src/services/archivoPagoService.js';

const png=Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jRZkAAAAASUVORK5CYII=','base64');
test('importes y contenido de documentos: valida backend sin confiar en extensión',()=>{
  assert.equal(importeCentimos('0.29'),29);assert.equal(importeCentimos('0',true),0);
  for(const v of ['-1','0','1.001','1e3','Infinity','10000000000'])assert.throws(()=>importeCentimos(v));
  assert.throws(()=>fechaValida('2026-02-30'));
  const abono={monto:'10',fecha_pago:'2026-10-30',metodo_pago:'Yape'};
  for(const metodo_pago of ['Efectivo','Plin','', 'Otro'])assert.throws(()=>validarAbono({...abono,metodo_pago},1000));
  for(const metodo_pago of ['Yape','Transferencia'])assert.equal(validarAbono({...abono,metodo_pago},1000).metodo,metodo_pago);
  assert.equal(validarAbono({...abono,fecha_pago:'fecha ignorada del navegador'},1000).metodo,'Yape');
  assert.equal(validarContenidoArchivo(png,'foto.png','image/png').tipo,'image/png');
  assert.throws(()=>validarContenidoArchivo(Buffer.from('texto'), 'foto.jpg','image/jpeg'));
  assert.throws(()=>validarContenidoArchivo(png,'foto.pdf','application/pdf'));
  assert.throws(()=>validarContenidoArchivo(png,'../foto.png','image/png'));
  assert.throws(()=>validarContenidoArchivo(Buffer.alloc(10485761),'foto.png','image/png'));
});

test('Pagos: transacciones simuladas y archivos privados reales; reintentos, abonos, correcciones y HTTP',async()=>{
  const originales={query:pool.query,conexion:pool.getConnection,storage:process.env.PAGOS_STORAGE_DIR};
  const directorio=await mkdtemp(join(tmpdir(),'ishume-pagos-backend-'));process.env.PAGOS_STORAGE_DIR=directorio;
  const edicionAnterior=process.env.PAGOS_EDITAR_COTIZACIONES;process.env.PAGOS_EDITAR_COTIZACIONES='true';
  let db={cuentas:[],versiones:[],abonos:[]},ids=0,cola=Promise.resolve(),fallar=false;
  const cabeceras=[10,11,12].map((id,i)=>({id_solicitud:id,id_proveedor:i+1,codigo:i?'ORDEN-MAS-LAL-001':'ORDEN-MAS-JOS-001',proveedor:i?'LALO':'Joselito',estado:'Generada',fecha:'30/10/2026',unidades:'18'}));
  function consulta(sql,args,estado) {
    if(sql.includes('information_schema'))return [[{n:11,relacion:1,registro:1}]];
    if(sql.startsWith('SELECT s.id_solicitud'))return [cabeceras.filter(o=>o.id_solicitud===args[0])];
    if(sql.startsWith('SELECT s.*'))return [estado.versiones.filter(v=>v.id_solicitud===args[0]).sort((a,b)=>b.version-a.version).slice(0,1)];
    if(sql.startsWith('SELECT a.id_pago'))return [estado.abonos.filter(a=>a.id_solicitud===args[0]).map(a=>({...a,motivo_anulacion:null}))];
    if((sql.startsWith('SELECT id_solicitud,huella FROM')||sql.startsWith('SELECT id_solicitud,documento_huella')))return [(sql.includes('FROM pagos_proveedor')?estado.abonos:estado.versiones).filter(r=>r.clave_operacion===args[0])];
    if(sql.startsWith('UPDATE solicitudes_cotizacion')){
      assert.match(sql,/fecha_registro_documento=CONVERT_TZ\(UTC_TIMESTAMP\(\),'\+00:00','-05:00'\)/);
      assert.doesNotMatch(sql,/fecha_documento=/);
      if(fallar){fallar=false;throw Error('Fallo SQL simulado');}
      const [version,importe_acordado,archivo_clave,archivo_nombre,archivo_mime,clave_operacion,huella,id_solicitud]=args;
      const anterior=estado.versiones.find(v=>v.id_solicitud===id_solicitud);
      estado.versiones=estado.versiones.filter(v=>v.id_solicitud!==id_solicitud);
      estado.versiones.push({id_solicitud,version,importe_acordado,fecha_registro_documento:'2026-10-30 00:30:00',archivo_clave:archivo_clave??anterior?.archivo_clave,archivo_nombre:archivo_nombre??anterior?.archivo_nombre,archivo_mime:archivo_mime??anterior?.archivo_mime,clave_operacion,huella});return [{affectedRows:1}];
    }
    if(sql.startsWith('INSERT INTO pagos_proveedor')){
      assert.match(sql,/CONVERT_TZ\(UTC_TIMESTAMP\(\),'\+00:00','-05:00'\)/);
      const [id_solicitud,monto,metodo_pago,numero_operacion,clave_operacion,huella]=args;
      const fecha_pago='2026-10-30',fecha_registro='2026-10-30 00:30:00';
      estado.abonos.push({id_abono:++ids,id_solicitud,monto,fecha_pago,fecha_registro,metodo_pago,numero_operacion,clave_operacion,huella});return [{insertId:ids}];
    }
    if(sql.startsWith('SELECT archivo_clave'))return [estado.versiones.filter(v=>sql.includes('WHERE archivo_clave')?v.archivo_clave===args[0]:v.id_solicitud===args[0]&&v.version===args[1])];
    throw Error('Consulta inesperada: '+sql);
  }
  pool.query=async(sql,args=[])=>consulta(sql,args,db);
  pool.getConnection=async()=>{
    let tx=null,liberar=null;
    return {async query(sql,args=[]){
      if(sql.startsWith('START TRANSACTION')){tx=structuredClone(db);return [[]];}
      if(sql.includes('FOR UPDATE')&&!liberar){const previo=cola;cola=new Promise(r=>{liberar=r;});await previo;tx=structuredClone(db);}
      return consulta(sql,args,tx||db);
    },async beginTransaction(){},async commit(){if(tx&&liberar)db=tx;tx=null;liberar?.();liberar=null;},async rollback(){tx=null;liberar?.();liberar=null;},release(){}};
  };
  let server;
  const p={clave_operacion:randomUUID(),importe:'1500.00',adelanto:'200.00',fecha_documento:'2026-10-30',fecha_pago:'2026-10-30',metodo_pago:'Transferencia',version_esperada:0};
  try{

    await assert.rejects(pagosService.guardarDocumento(10,{...p,metodo_pago:''},png,'image/png','foto.png'),/Selecciona un/);
    const [first,concurrente]=await Promise.all([pagosService.guardarDocumento(10,p,png,'image/png','foto.png'),pagosService.guardarDocumento(10,p,png,'image/png','foto.png')]);
    assert.equal(concurrente.repetida,true,'Doble confirmacion conserva un solo adelanto');
    assert.equal(first.abonado,'200.00');assert.equal(first.saldo,'1300.00');assert.equal(first.estado_economico,'Parcial');
    assert.equal(first.documento.fecha_registro,'2026-10-30 00:30:00');
    assert.equal(first.historial[0].fecha_registro,'2026-10-30 00:30:00');
    assert.equal(first.historial.length,1);assert.equal((await readdir(directorio)).length,1);
    const repeat=await pagosService.guardarDocumento(10,{...p,fecha_documento:'dato ignorado del navegador'},png,'image/png','foto.png');
    assert.equal(repeat.repetida,true);assert.equal(db.abonos.length,1);assert.equal((await readdir(directorio)).length,1);
    await assert.rejects(pagosService.guardarDocumento(10,{...p,importe:'1600.00'},png,'image/png','foto.png'),/otros datos/);
    process.env.PAGOS_EDITAR_COTIZACIONES='false';
    const antesBloqueo=JSON.stringify(db);
    await assert.rejects(pagosService.guardarDocumento(10,{...p,clave_operacion:randomUUID(),version_esperada:1,adelanto:'0',motivo:'Cambio'},png,'image/png','foto.png'),e=>e.status===403);
    await assert.rejects(pagosService.guardarDocumento(10,{...p,clave_operacion:randomUUID(),version_esperada:0},png,'image/png','foto.png'),e=>e.status===403);
    const reintentoInicial=await pagosService.guardarDocumento(10,p,png,'image/png','foto.png');assert.equal(reintentoInicial.repetida,true,'Registro inicial puede reintentarse con edicion bloqueada');
    assert.equal(JSON.stringify(db),antesBloqueo,'Edicion deshabilitada no escribe datos');
    process.env.PAGOS_EDITAR_COTIZACIONES='true';
    const pago={clave_operacion:randomUUID(),monto:'300.00',fecha_pago:'2026-10-30',metodo_pago:'Yape',numero_operacion:'OP-002'};
    const second=await pagosService.abonar(10,pago);assert.equal(second.abonado,'500.00');assert.equal(second.saldo,'1000.00');
    const doble=await Promise.all([pagosService.abonar(10,pago),pagosService.abonar(10,pago)]);
    assert.ok(doble.every(r=>r.abonado==='500.00'));assert.equal(db.abonos.length,2);
    await assert.rejects(pagosService.abonar(10,{...pago,clave_operacion:randomUUID(),monto:'1000.01'}),/superar/);
    await assert.rejects(pagosService.abonar(11,{...pago,clave_operacion:randomUUID()}),/Primero registra/);
    assert.equal((await pagosService.obtener(11)).importe,null,'No mezcla órdenes de otro proveedor');
    await assert.rejects(pagosService.guardarDocumento(10,{...p,clave_operacion:randomUUID(),version_esperada:1,motivo:'Cambio',importe:'400',adelanto:'0'},png,'image/png','foto.png'),/inferior/);
    const mod=await pagosService.guardarDocumento(10,{...p,clave_operacion:randomUUID(),version_esperada:1,motivo:'Nuevo documento del proveedor',importe:'1600',adelanto:'0'},Buffer.alloc(0),'','');
    assert.equal(mod.documento.version,2);assert.equal(mod.abonado,'500.00');assert.equal(db.versiones.length,1);assert.equal((await readdir(directorio)).length,1,'Editar importe conserva el archivo sin descargarlo ni duplicarlo');
    const validos=await Promise.allSettled([600,600].map(monto=>pagosService.abonar(10,{...pago,clave_operacion:randomUUID(),monto:String(monto)})));
    assert.equal(validos.filter(v=>v.status==='fulfilled').length,1,'Concurrencia no permite sobrepago');
    const saldo=(await pagosService.obtener(10)).saldo;
    const final=await pagosService.abonar(10,{...pago,clave_operacion:randomUUID(),monto:saldo});
    assert.equal(final.saldo,'0.00');assert.equal(final.estado_economico,'Pagado');assert.equal(final.porcentaje,100);
    const pdf=Buffer.from(new jsPDF().output('arraybuffer'));
    const p2={...p,clave_operacion:randomUUID(),adelanto:'0'};
    fallar=true;const cantidadArchivos=(await readdir(directorio)).length;
    await assert.rejects(pagosService.guardarDocumento(11,p2,pdf,'application/pdf','nota.pdf'),/Fallo SQL/);
    assert.equal((await readdir(directorio)).length,cantidadArchivos,'Fallo limpia archivo y revierte datos');
    assert.equal((await pagosService.obtener(11)).documento,null);
    await pagosService.guardarDocumento(11,p2,pdf,'application/pdf','nota.pdf');
    assert.equal((await pagosService.obtener(11)).historial.length,0,'Adelanto cero no inserta pago');
    await assert.rejects(pagosService.archivo(10,1),e=>e.status===404);const r=await pagosService.archivo(10,2);assert.deepEqual(await readFile(r.ruta),png);
    const antesReemplazo=db.abonos.length;
    await assert.rejects(pagosService.guardarDocumento(10,{...p,clave_operacion:randomUUID(),version_esperada:2,motivo:'',importe:'1600',adelanto:'0'},Buffer.alloc(0),'',''),/motivo/);
    const reemplazo=await pagosService.guardarDocumento(10,{...p,clave_operacion:randomUUID(),version_esperada:2,motivo:'Reemplazar documento',importe:'1600',adelanto:'0'},pdf,'application/pdf','actualizado.pdf');
    assert.equal(reemplazo.documento.version,3);assert.equal(reemplazo.saldo,'0.00');assert.equal(db.abonos.length,antesReemplazo,'Reemplazar archivo conserva todos los abonos');
    const archivoActual=await pagosService.archivo(10,3);assert.deepEqual(await readFile(archivoActual.ruta),pdf);
    const app=express();app.use(express.json());app.use('/api/pagos',pagosRouter);server=app.listen(0,'127.0.0.1');await once(server,'listening');
    const base='http://127.0.0.1:'+server.address().port;
    const doc=await fetch(base+'/api/pagos/ordenes/11/archivo?version=1');assert.equal(doc.status,200);assert.deepEqual(Buffer.from(await doc.arrayBuffer()),pdf);
    const recuperada=await(await fetch(base+'/api/pagos/ordenes/10')).json();assert.equal(recuperada.data.saldo,'0.00');
    const repetidoHttp=await fetch(base+'/api/pagos/ordenes/10/documento',{method:'POST',headers:{'Content-Type':'application/octet-stream','X-Pagos-Datos':encodeURIComponent(JSON.stringify(p)),'X-Pagos-Nombre':'foto.png','X-Pagos-Mime':'image/png'},body:png});
    assert.equal(repetidoHttp.status,409,'Reintento de documento sustituido no duplica adelanto');
    const invalidoHttp=await fetch(base+'/api/pagos/ordenes/11/abonos',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({clave_operacion:randomUUID(),monto:'-1',fecha_pago:'2026-10-30',metodo_pago:'Yape'})});assert.equal(invalidoHttp.status,400);
    const pagosAntesCorreccion=JSON.stringify(db.abonos);
    for(const [metodo,ruta] of [['PATCH','/ordenes/10/abonos/1'],['PUT','/ordenes/10/abonos/1'],['DELETE','/ordenes/10/abonos/1'],['POST','/ordenes/10/abonos/1/corregir'],['POST','/ordenes/10/abonos/1/correcciones']]) {
      const intento=await fetch(base+ ruta,{method:metodo,headers:{'Content-Type':'application/json'},body:JSON.stringify({monto:'1.00',metodo_pago:'Yape',motivo:'Intento directo'})});
      assert.equal(intento.status,404,'No existe una operacion para modificar abonos: '+metodo+' '+ruta);
    }
    assert.equal(JSON.stringify(db.abonos),pagosAntesCorreccion,'Solicitudes directas no modifican pagos');
    process.env.PAGOS_EDITAR_COTIZACIONES='false';
    const antesEdicionHttp=JSON.stringify(db);
    const edicionBloqueada=await fetch(base+'/api/pagos/ordenes/10/documento',{method:'POST',headers:{'Content-Type':'application/octet-stream','X-Pagos-Datos':encodeURIComponent(JSON.stringify({...p,clave_operacion:randomUUID(),version_esperada:3,adelanto:'0',motivo:'Intento directo'}))},body:new Uint8Array()});
    assert.equal(edicionBloqueada.status,403,'Edicion directa rechazada por backend');
    assert.equal(JSON.stringify(db),antesEdicionHttp,'Rechazo HTTP conserva pagos y documento');
    process.env.PAGOS_EDITAR_COTIZACIONES='true';
    const noAutorizado=await fetch(base+'/api/pagos/ordenes/10',{headers:{Origin:'https://sitio-ajeno.example'}});assert.equal(noAutorizado.status,403);
    const completo={...p,clave_operacion:randomUUID(),importe:'500.00',adelanto:'500.00',metodo_pago:'Yape'};
    const liquidada=await pagosService.guardarDocumento(12,completo,png,'image/png','total.png');
    assert.equal(liquidada.abonado,'500.00');assert.equal(liquidada.saldo,'0.00');assert.equal(liquidada.historial.length,1);
    const repetidaTotal=await pagosService.guardarDocumento(12,completo,png,'image/png','total.png');
    assert.equal(repetidaTotal.repetida,true);assert.equal(repetidaTotal.historial.length,1,'Adelanto total no se duplica');
    assert.equal(cabeceras[0].codigo,'ORDEN-MAS-JOS-001');
  }finally{
    if(server){server.closeAllConnections();await new Promise(r=>server.close(r));}
    if(edicionAnterior===undefined)delete process.env.PAGOS_EDITAR_COTIZACIONES;else process.env.PAGOS_EDITAR_COTIZACIONES=edicionAnterior;
    pool.query=originales.query;pool.getConnection=originales.conexion;
    if(originales.storage===undefined)delete process.env.PAGOS_STORAGE_DIR;else process.env.PAGOS_STORAGE_DIR=originales.storage;
    assert.ok(directorio.startsWith(resolve(tmpdir())+sep+'ishume-pagos-backend-'));
    await rm(directorio,{recursive:true,force:true});
  }
});
test('corregir abono no depende de observaciones ni las consulta o modifica',async()=>{
  const originales={query:pool.query,getConnection:pool.getConnection};
  const permiso=process.env.PAGOS_CORREGIR_ABONOS;process.env.PAGOS_CORREGIR_ABONOS='true';
  const observacion='  Observación original que debe conservarse  ';
  let pago,auditoria;
  const consultar=async(sql,args=[])=>{
    assert.doesNotMatch(sql,/observaci(?:on|ones)/i);
    if(sql.includes('information_schema'))return [[{n:11,columnas:13,relacion:1,unica:1,cambio:1,registro:1}]];
    if(sql.startsWith('SELECT s.id_solicitud'))return [[{id_solicitud:1,id_proveedor:1,codigo:'ORDEN-MAS-PRU-001',estado:'Generada'}]];
    if(sql.startsWith('SELECT id_pago,id_solicitud'))return [[{...pago}]];
    if(sql.startsWith('SELECT id_pago,huella'))return [[]];
    if(sql.startsWith('SELECT s.*'))return [[{version:1,importe_acordado:'1000.00',archivo_nombre:'archivo.pdf',archivo_mime:'application/pdf'}]];
    if(sql.startsWith('SELECT a.id_pago')){const {observaciones,...campos}=pago;return [[{...campos,id_abono:10}]];}
    if(sql.startsWith('SELECT c.id_correccion'))return [auditoria];
    if(sql.startsWith('UPDATE pagos_proveedor')){
      assert.doesNotMatch(sql,/observaciones\s*=/);
      [pago.monto,pago.fecha_pago,pago.metodo_pago]=args;return [{affectedRows:1}];
    }
    if(sql.startsWith('INSERT INTO correcciones_pago_proveedor')){
      assert.equal(args[7],'Motivo separado');
      auditoria.push({id_correccion:1,id_pago:10,motivo:args[7]});return [{insertId:1}];
    }
    throw Error('Consulta inesperada '+sql);
  };
  pool.query=consultar;
  pool.getConnection=async()=>({query:consultar,async beginTransaction(){},async commit(){},async rollback(){},release(){}});
  try{
    for(const extra of [{},{observaciones:''},{observaciones:null},{observaciones:'Reemplazo no permitido'}]){
      pago={id_pago:10,id_solicitud:1,monto:'200.00',fecha_pago:'2026-11-01',metodo_pago:'Yape',observaciones:observacion};auditoria=[];
      const data=await pagosService.corregirAbono(1,10,{clave_operacion:randomUUID(),version_esperada:0,monto:'300.00',fecha_pago:'2026-11-02',metodo_pago:'Transferencia',motivo:'Motivo separado',...extra});
      assert.equal(pago.observaciones,observacion);assert.equal(Object.hasOwn(data.historial[0],'observaciones'),false);
      assert.equal(data.abonado,'300.00');assert.equal(data.saldo,'700.00');assert.equal(auditoria.length,1);
    }
  }finally{pool.query=originales.query;pool.getConnection=originales.getConnection;if(permiso===undefined)delete process.env.PAGOS_CORREGIR_ABONOS;else process.env.PAGOS_CORREGIR_ABONOS=permiso;}
});
test.after(async()=>{await pool.end();});



test('instalacion limpia: 25 tablas unificadas y auditoria; pagos vinculados a solicitudes',async()=>{
  const sql=await readFile(new URL('../database/ishume_bd_unificada.sql',import.meta.url),'utf8');
  assert.equal((sql.match(/CREATE TABLE/g)||[]).length,25);
  assert.doesNotMatch(sql,/ALTER TABLE/);
  assert.doesNotMatch(sql,/fecha_documento DATE/);
  const migracionPagos=await readFile(new URL('../migrations/propuestas/003_pagos_ordenes_masivas.sql',import.meta.url),'utf8');
  assert.ok(migracionPagos.indexOf('IF EXISTS')<migracionPagos.indexOf('ALTER TABLE'),'Verifica pagos antes de cualquier DDL');
  assert.doesNotMatch(sql,/CREATE TABLE (?:cotizaciones_masivas|abonos_masivos|series_ordenes_masivas)/);
  const pagos=sql.match(/CREATE TABLE (?:IF NOT EXISTS )?pagos_proveedor\s*\([\s\S]*?\) ENGINE=InnoDB/)[0];
  assert.match(pagos,/FOREIGN KEY \(id_solicitud\)\s+REFERENCES solicitudes_cotizacion/);
  assert.doesNotMatch(pagos,/id_orden/);
  assert.match(sql,/uq_proveedor_prefijo_masivo/);
  assert.match(sql,/uq_sc_codigo/);
  for(const nombre of ['../migrations/propuestas/003_pagos_ordenes_masivas.sql','../migrations/004_series_ordenes_masivas.sql']) {
    const migracion=await readFile(new URL(nombre,import.meta.url),'utf8');
    assert.doesNotMatch(migracion,/CREATE TABLE|DELETE FROM|TRUNCATE|DROP DATABASE/);
  }
});


test('MySQL real: guardar, reintentar y recuperar abono sin dejar datos ni consumir IDs',{skip:process.env.TEST_PAGOS_MYSQL_ROLLBACK!=='1'},async()=>{
  const originales={query:pool.query,getConnection:pool.getConnection};
  const lista=await pagosService.listar();
  assert.equal(lista.economia_disponible,true);
  const orden=lista.ordenes.find(o=>o.importe!==null&&importeCentimos(o.saldo,true)>=1);
  assert.ok(orden,'Se requiere una orden con documento y saldo para esta prueba reversible');
  const conn=await pool.getConnection(),idPrueba=-2147480000;
  const [[existente]]=await conn.query('SELECT COUNT(*) AS n FROM pagos_proveedor WHERE id_pago=?',[idPrueba]);assert.equal(existente.n,0);
  const [[contador]]=await conn.query("SELECT AUTO_INCREMENT AS numero FROM information_schema.TABLES WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='pagos_proveedor'");
  let iniciada=false;
  try {
    await conn.beginTransaction();iniciada=true;
    const ejecutar=async(sql,args=[])=>{
      if(sql.startsWith('START TRANSACTION'))return [[]];
      if(sql.startsWith('INSERT INTO pagos_proveedor')){
        sql=sql.replace('INSERT INTO pagos_proveedor (','INSERT INTO pagos_proveedor (id_pago,').replace('VALUES (','VALUES (?,');args=[idPrueba,...args];
      }
      return conn.query(sql,args);
    };
    const conexion={query:ejecutar,async beginTransaction(){},async commit(){},async rollback(){},release(){}};
    pool.query=ejecutar;pool.getConnection=async()=>conexion;
    const datos={clave_operacion:randomUUID(),monto:'0.01',metodo_pago:'Transferencia'};
    const guardado=await pagosService.abonar(orden.id_solicitud,datos);
    const reintento=await pagosService.abonar(orden.id_solicitud,datos);assert.equal(reintento.repetida,true);
    const recuperado=await pagosService.obtener(orden.id_solicitud);
    const fila=recuperado.historial.find(p=>p.id_abono===idPrueba);assert.ok(fila);
    const [[fecha]]=await conn.query("SELECT DATE_FORMAT(CONVERT_TZ(UTC_TIMESTAMP(),'+00:00','-05:00'),'%Y-%m-%d') AS peru");
    assert.equal(fila.fecha_pago,fecha.peru);assert.equal(fila.metodo_pago,'Transferencia');assert.equal(String(fila.monto),'0.01');
    assert.equal(recuperado.historial.filter(p=>p.id_abono===idPrueba).length,1);
    assert.equal(importeCentimos(guardado.saldo,true),importeCentimos(orden.saldo,true)-1);
  }finally{
    pool.query=originales.query;pool.getConnection=originales.getConnection;
    if(iniciada)await conn.rollback();conn.release();
  }
  const [[despues]]=await pool.query('SELECT COUNT(*) AS n FROM pagos_proveedor WHERE id_pago=?',[idPrueba]);assert.equal(despues.n,0);
  const [[contadorFinal]]=await pool.query("SELECT AUTO_INCREMENT AS numero FROM information_schema.TABLES WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='pagos_proveedor'");assert.equal(contadorFinal.numero,contador.numero);
});
