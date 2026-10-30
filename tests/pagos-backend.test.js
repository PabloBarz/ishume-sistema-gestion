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
import {importeCentimos,fechaValida} from '../src/services/pagoValidaciones.js';
import {validarContenidoArchivo} from '../src/services/archivoPagoService.js';

const png=Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jRZkAAAAASUVORK5CYII=','base64');
test('importes y contenido de documentos: valida backend sin confiar en extensión',()=>{
  assert.equal(importeCentimos('0.29'),29);assert.equal(importeCentimos('0',true),0);
  for(const v of ['-1','0','1.001','1e3','Infinity','10000000000'])assert.throws(()=>importeCentimos(v));
  assert.throws(()=>fechaValida('2026-02-30'));
  assert.equal(validarContenidoArchivo(png,'foto.png','image/png').tipo,'image/png');
  assert.throws(()=>validarContenidoArchivo(Buffer.from('texto'), 'foto.jpg','image/jpeg'));
  assert.throws(()=>validarContenidoArchivo(png,'foto.pdf','application/pdf'));
  assert.throws(()=>validarContenidoArchivo(png,'../foto.png','image/png'));
  assert.throws(()=>validarContenidoArchivo(Buffer.alloc(10485761),'foto.png','image/png'));
});

test('Pagos: transacciones simuladas y archivos privados reales; reintentos, abonos, correcciones y HTTP',async()=>{
  const originales={query:pool.query,conexion:pool.getConnection,storage:process.env.PAGOS_STORAGE_DIR};
  const directorio=await mkdtemp(join(tmpdir(),'ishume-pagos-backend-'));process.env.PAGOS_STORAGE_DIR=directorio;
  let db={cuentas:[],versiones:[],abonos:[]},ids=0,cola=Promise.resolve(),fallar=false;
  const cabeceras=[10,11].map((id,i)=>({id_solicitud:id,id_proveedor:i+1,codigo:i?'ORDEN-MAS-LAL-001':'ORDEN-MAS-JOS-001',proveedor:i?'LALO':'Joselito',estado:'Generada',fecha:'30/10/2026',unidades:'18'}));
  function consulta(sql,args,estado) {
    if(sql.includes('information_schema'))return [[{n:11}]];
    if(sql.startsWith('SELECT s.id_solicitud'))return [cabeceras.filter(o=>o.id_solicitud===args[0])];
    if(sql.startsWith('SELECT s.*'))return [estado.versiones.filter(v=>v.id_solicitud===args[0]).sort((a,b)=>b.version-a.version).slice(0,1)];
    if(sql.startsWith('SELECT a.id_pago'))return [estado.abonos.filter(a=>a.id_solicitud===args[0]).map(a=>({...a,motivo_anulacion:null}))];
    if((sql.startsWith('SELECT id_solicitud,huella FROM')||sql.startsWith('SELECT id_solicitud,documento_huella')))return [(sql.includes('FROM pagos_proveedor')?estado.abonos:estado.versiones).filter(r=>r.clave_operacion===args[0])];
    if(sql.startsWith('UPDATE solicitudes_cotizacion')){
      if(fallar){fallar=false;throw Error('Fallo SQL simulado');}
      const [version,importe_acordado,fecha_documento,archivo_clave,archivo_nombre,archivo_mime,clave_operacion,huella,id_solicitud]=args;
      estado.versiones=estado.versiones.filter(v=>v.id_solicitud!==id_solicitud);
      estado.versiones.push({id_solicitud,version,importe_acordado,fecha_documento,archivo_clave,archivo_nombre,archivo_mime,clave_operacion,huella});return [{affectedRows:1}];
    }
    if(sql.startsWith('INSERT INTO pagos_proveedor')){
      const [id_solicitud,monto,fecha_pago,metodo_pago,numero_operacion,clave_operacion,huella]=args;
      estado.abonos.push({id_abono:++ids,id_solicitud,monto,fecha_pago,metodo_pago,numero_operacion,clave_operacion,huella});return [{insertId:ids}];
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
    const first=await pagosService.guardarDocumento(10,p,png,'image/png','foto.png');
    assert.equal(first.abonado,'200.00');assert.equal(first.saldo,'1300.00');assert.equal(first.estado_economico,'Parcial');
    assert.equal(first.historial.length,1);assert.equal((await readdir(directorio)).length,1);
    const repeat=await pagosService.guardarDocumento(10,p,png,'image/png','foto.png');
    assert.equal(repeat.repetida,true);assert.equal(db.abonos.length,1);assert.equal((await readdir(directorio)).length,1);
    await assert.rejects(pagosService.guardarDocumento(10,{...p,importe:'1600.00'},png,'image/png','foto.png'),/otros datos/);
    const pago={clave_operacion:randomUUID(),monto:'300.00',fecha_pago:'2026-10-30',metodo_pago:'Yape',numero_operacion:'OP-002'};
    const second=await pagosService.abonar(10,pago);assert.equal(second.abonado,'500.00');assert.equal(second.saldo,'1000.00');
    const doble=await Promise.all([pagosService.abonar(10,pago),pagosService.abonar(10,pago)]);
    assert.ok(doble.every(r=>r.abonado==='500.00'));assert.equal(db.abonos.length,2);
    await assert.rejects(pagosService.abonar(10,{...pago,clave_operacion:randomUUID(),monto:'1000.01'}),/superar/);
    await assert.rejects(pagosService.abonar(11,{...pago,clave_operacion:randomUUID()}),/Primero registra/);
    assert.equal((await pagosService.obtener(11)).importe,null,'No mezcla órdenes de otro proveedor');
    await assert.rejects(pagosService.guardarDocumento(10,{...p,clave_operacion:randomUUID(),version_esperada:1,motivo:'Cambio',importe:'400',adelanto:'0'},png,'image/png','foto.png'),/inferior/);
    const mod=await pagosService.guardarDocumento(10,{...p,clave_operacion:randomUUID(),version_esperada:1,motivo:'Nuevo documento del proveedor',importe:'1600',adelanto:'0'},png,'image/png','foto.png');
    assert.equal(mod.documento.version,2);assert.equal(mod.abonado,'500.00');assert.equal(db.versiones.length,1);assert.equal((await readdir(directorio)).length,2);
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
    const app=express();app.use(express.json());app.use('/api/pagos',pagosRouter);server=app.listen(0,'127.0.0.1');await once(server,'listening');
    const base='http://127.0.0.1:'+server.address().port;
    const doc=await fetch(base+'/api/pagos/ordenes/11/archivo?version=1');assert.equal(doc.status,200);assert.deepEqual(Buffer.from(await doc.arrayBuffer()),pdf);
    const recuperada=await(await fetch(base+'/api/pagos/ordenes/10')).json();assert.equal(recuperada.data.saldo,'0.00');
    const repetidoHttp=await fetch(base+'/api/pagos/ordenes/10/documento',{method:'POST',headers:{'Content-Type':'application/octet-stream','X-Pagos-Datos':encodeURIComponent(JSON.stringify(p)),'X-Pagos-Nombre':'foto.png','X-Pagos-Mime':'image/png'},body:png});
    assert.equal(repetidoHttp.status,409,'Reintento de documento sustituido no duplica adelanto');
    const invalidoHttp=await fetch(base+'/api/pagos/ordenes/11/abonos',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({clave_operacion:randomUUID(),monto:'-1',fecha_pago:'2026-10-30',metodo_pago:'Yape'})});assert.equal(invalidoHttp.status,400);
    const noAutorizado=await fetch(base+'/api/pagos/ordenes/10',{headers:{Origin:'https://sitio-ajeno.example'}});assert.equal(noAutorizado.status,403);
    assert.equal(cabeceras[0].codigo,'ORDEN-MAS-JOS-001');
  }finally{
    if(server){server.closeAllConnections();await new Promise(r=>server.close(r));}
    pool.query=originales.query;pool.getConnection=originales.conexion;
    if(originales.storage===undefined)delete process.env.PAGOS_STORAGE_DIR;else process.env.PAGOS_STORAGE_DIR=originales.storage;
    assert.ok(directorio.startsWith(resolve(tmpdir())+sep+'ishume-pagos-backend-'));
    await rm(directorio,{recursive:true,force:true});
  }
});
test.after(async()=>{await pool.end();});



test('esquema definitivo: exactamente 19 tablas y pagos relacionados con solicitudes',async()=>{
  const sql=await readFile(new URL('../database/ishume.sql',import.meta.url),'utf8');
  assert.equal((sql.match(/CREATE TABLE/g)||[]).length,19);
  assert.doesNotMatch(sql,/CREATE TABLE (?:cotizaciones_masivas|abonos_masivos|series_ordenes_masivas)/);
  const pagos=sql.slice(sql.indexOf('CREATE TABLE pagos_proveedor'),sql.indexOf('CREATE TABLE solicitud_ordenes'));
  assert.match(pagos,/FOREIGN KEY \(id_solicitud\) REFERENCES solicitudes_cotizacion/);
  assert.doesNotMatch(pagos,/id_orden/);
  assert.match(sql,/uq_proveedor_prefijo_masivo/);
  assert.match(sql,/uq_sc_codigo/);
  for(const nombre of ['../migrations/propuestas/003_pagos_ordenes_masivas.sql','../migrations/004_series_ordenes_masivas.sql']) {
    const migracion=await readFile(new URL(nombre,import.meta.url),'utf8');
    assert.doesNotMatch(migracion,/CREATE TABLE|DELETE FROM|TRUNCATE|DROP DATABASE/);
  }
});
