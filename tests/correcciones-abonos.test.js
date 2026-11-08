import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {randomUUID} from 'node:crypto';
import mysql from 'mysql2/promise';
import express from 'express';
import {once} from 'node:events';
import 'dotenv/config';
import {validarCorreccionAbono} from '../src/services/pagoValidaciones.js';

const entrada=(extra={})=>({monto:'350.00',fecha_pago:'2026-11-06',metodo_pago:'Transferencia',observaciones:'Comprobante corregido',motivo:'Corrección del registro',version_esperada:0,clave_operacion:randomUUID(),...extra});
test('correcciones: importes exactos, fecha real, método, observación, motivo y versión',()=>{
  assert.equal(validarCorreccionAbono(entrada()).monto,35000);
  for(const monto of ['0','-1','1.001','NaN','10000000000','1e2',1])assert.throws(()=>validarCorreccionAbono(entrada({monto})));
  for(const fecha_pago of ['2026-02-30','0000-00-00','0999-12-31','2026-13-01','06/11/2026',''])assert.throws(()=>validarCorreccionAbono(entrada({fecha_pago})));
  for(const metodo_pago of ['Efectivo','Plin',''])assert.throws(()=>validarCorreccionAbono(entrada({metodo_pago})));
  for(const extra of [{motivo:' '},{motivo:'x'.repeat(501)},{version_esperada:-1},{version_esperada:'0'}])assert.throws(()=>validarCorreccionAbono(entrada(extra)));
  assert.equal(Object.hasOwn(validarCorreccionAbono(entrada()),'observaciones'),false);
  assert.equal(Object.hasOwn(validarCorreccionAbono(entrada({observaciones:null})),'observaciones'),false);
});

test('MariaDB/MySQL aislado: edición, auditoría, concurrencia, idempotencia, rollback y recuperación',{
  skip:process.env.TEST_CORRECCIONES_MYSQL!=='1',timeout:60000,
},async()=>{
  // Nunca usa bd_ishume para operaciones de escritura. Servicio importado tras elegir base temporal.
  const base='ishume_test_correcciones_'+randomUUID().replaceAll('-','');
  assert.match(base,/^ishume_test_correcciones_[a-f0-9]{32}$/);
  const opciones={host:process.env.DB_HOST||'localhost',user:process.env.DB_USER,password:process.env.DB_PASSWORD,port:Number(process.env.DB_PORT||3306),multipleStatements:true};
  const admin=await mysql.createConnection(opciones),nombreAnterior=process.env.DB_NAME;
  let pool,server;
  try{
    await admin.query('CREATE DATABASE `'+base+'` CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci');
    await admin.query('USE `'+base+'`');
    let esquema=await readFile(new URL('../database/ishume.sql',import.meta.url),'utf8');
    esquema=esquema.replaceAll('bd_ishume',base);
    assert.ok(!esquema.includes('bd_ishume'));
    await admin.query(esquema);
    // Prueba la actualización real 007 -> 008, sin modificar archivos ni la base del usuario.
    await admin.query('DROP TABLE correcciones_pago_proveedor');
    await admin.query(await readFile(new URL('../migrations/propuestas/007_correcciones_abonos.sql',import.meta.url),'utf8'));
    const ampliacion=(await readFile(new URL('../migrations/008_datos_correcciones_abonos.sql',import.meta.url),'utf8')).replaceAll('bd_ishume',base);
    await admin.query(ampliacion);
    process.env.DB_NAME=base;
    ({pool}=await import('../src/config/db.js'));
    const {pagosService}=await import('../src/services/pagosService.js');
    const [[identidad]]=await pool.query('SELECT DATABASE() AS nombre');assert.equal(identidad.nombre,base);
    const [[proveedor]]=await pool.query('SELECT id_proveedor FROM proveedores LIMIT 1');
    const [o]=await pool.query(`INSERT INTO solicitudes_cotizacion (codigo,id_proveedor,fecha_emision,clave_operacion,huella,contenido_json,importe_acordado,archivo_clave,archivo_nombre,archivo_mime,documento_revision)
      VALUES ('ORDEN-MAS-PRU-001',?,CURRENT_DATE,?,?,'{"total":10}',1000.00,'prueba.png','prueba.png','image/png',1)`,[proveedor.id_proveedor,randomUUID(),'a'.repeat(64)]);
    const id=o.insertId;
    const primero=await pagosService.abonar(id,{monto:'300.00',metodo_pago:'Yape',clave_operacion:randomUUID()});
    assert.equal(primero.abonado,'300.00');
    const segundo=await pagosService.abonar(id,{monto:'200.00',metodo_pago:'Transferencia',clave_operacion:randomUUID()});
    const pago=segundo.historial.find(p=>p.monto==='200.00'),otro=segundo.historial.find(p=>p.monto==='300.00');
    const [[columna]]=await pool.query("SELECT COUNT(*) AS n FROM information_schema.COLUMNS WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='pagos_proveedor' AND COLUMN_NAME='observaciones'");assert.equal(columna.n,0);
    const original=JSON.stringify(otro),peticion=entrada();
    const resultados=await Promise.all([pagosService.corregirAbono(id,pago.id_abono,peticion),pagosService.corregirAbono(id,pago.id_abono,peticion)]);
    assert.ok(resultados.some(r=>r.repetida));
    let data=await pagosService.obtener(id);
    assert.equal(data.abonado,'650.00');assert.equal(data.saldo,'350.00');assert.equal(data.historial.length,2);assert.equal(data.correcciones.length,1);
    assert.equal(JSON.stringify(data.historial.find(p=>p.id_abono===otro.id_abono)),original,'Otro pago permanece intacto');
    assert.equal(data.correcciones[0].monto_anterior,'200.00');assert.equal(data.correcciones[0].monto_nuevo,'350.00');assert.equal(data.correcciones[0].responsable_identificador,null);
    assert.match(data.correcciones[0].fecha_correccion,/^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}$/);
    await assert.rejects(pagosService.corregirAbono(id,pago.id_abono,{...peticion,monto:'360.00'}),/otra corrección/);
    const version=data.historial.find(p=>p.id_abono===pago.id_abono).version_correccion;
    await assert.rejects(pagosService.corregirAbono(id,pago.id_abono,entrada()),/cambió/);
    await assert.rejects(pagosService.corregirAbono(id,pago.id_abono,entrada({monto:'701.00',version_esperada:version})),/supera/);
    await assert.rejects(pagosService.corregirAbono(id,999999,entrada()),/no existe/);
    await assert.rejects(pagosService.corregirAbono(id+1,pago.id_abono,entrada()),/no encontrada/);
    for(const cambios of [{fecha_pago:'2026-11-05'},{metodo_pago:'Yape'}]){
      const actual=data.historial.find(p=>p.id_abono===pago.id_abono);
      data=await pagosService.corregirAbono(id,pago.id_abono,entrada({monto:actual.monto,fecha_pago:actual.fecha_pago,metodo_pago:actual.metodo_pago,version_esperada:actual.version_correccion,...cambios}));
    }
    assert.ok(data.historial.every(p=>!Object.hasOwn(p,'observaciones')));
    assert.equal(data.correcciones.length,3,'Auditoría acumulativa incluso al cambiar solo fecha u observación');
    const actual=data.historial.find(p=>p.id_abono===pago.id_abono);
    const concurrentes=await Promise.allSettled([360,370].map(n=>pagosService.corregirAbono(id,pago.id_abono,entrada({monto:n+'.00',version_esperada:actual.version_correccion}))));
    assert.equal(concurrentes.filter(r=>r.status==='fulfilled').length,1,'Dos ediciones no se pisan');
    data=await pagosService.obtener(id);
    const {default:router}=await import('../src/routes/pagosRouter.js');
    const app=express();app.use(express.json());app.use('/api/pagos',router);server=app.listen(0,'127.0.0.1');await once(server,'listening');
    const url='http://127.0.0.1:'+server.address().port+'/api/pagos/ordenes/'+id+'/abonos/'+pago.id_abono;
    const cuerpo=entrada({monto:'400.00',version_esperada:data.historial.find(p=>p.id_abono===pago.id_abono).version_correccion});
    const patch=async(extra={})=>fetch(url,{method:'PATCH',headers:{'Content-Type':'application/json',...extra},body:JSON.stringify(cuerpo)});
    assert.equal((await patch({Origin:'https://origen-no-autorizado.invalid'})).status,403);
    let respuesta=await patch();assert.equal(respuesta.status,200);assert.equal((await respuesta.json()).data.abonado,'700.00');
    respuesta=await patch();assert.equal(respuesta.status,200);assert.equal((await respuesta.json()).data.repetida,true);
    const lectura=await fetch(url.replace('/abonos/'+pago.id_abono,''));assert.equal((await lectura.json()).data.saldo,'300.00');
    const [otra]=await pool.query(`INSERT INTO solicitudes_cotizacion (codigo,id_proveedor,fecha_emision,clave_operacion,huella,contenido_json) VALUES ('ORDEN-MAS-PRU-002',?,CURRENT_DATE,?,?,'{}')`,[proveedor.id_proveedor,randomUUID(),'b'.repeat(64)]);
    await assert.rejects(pagosService.corregirAbono(otra.insertId,pago.id_abono,entrada()),/no pertenece/);
    data=await pagosService.obtener(id);const antes=JSON.stringify(data);
    await admin.query("CREATE TRIGGER prueba_fallo_auditoria BEFORE INSERT ON correcciones_pago_proveedor FOR EACH ROW SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='Fallo auditoria de prueba'");
    await assert.rejects(pagosService.corregirAbono(id,pago.id_abono,entrada({monto:'380.00',version_esperada:data.historial.find(p=>p.id_abono===pago.id_abono).version_correccion})),/auditoria/);
    await admin.query('DROP TRIGGER prueba_fallo_auditoria');
    assert.equal(JSON.stringify(await pagosService.obtener(id)),antes,'Rollback restaura abono si falla auditoría');
    const conn=await pool.getConnection();try{const [[r]]=await conn.query('SELECT COUNT(*) AS n FROM pagos_proveedor');assert.equal(r.n,2);}finally{conn.release();}
    await pool.query("UPDATE solicitudes_cotizacion SET estado='Cancelada' WHERE id_solicitud=?",[id]);
    await assert.rejects(pagosService.corregirAbono(id,pago.id_abono,entrada()),/cancelada/);
    await pool.query("UPDATE solicitudes_cotizacion SET estado='Generada' WHERE id_solicitud=?",[id]);
    await admin.query('DROP TABLE correcciones_pago_proveedor');
    await assert.rejects(pagosService.corregirAbono(id,pago.id_abono,entrada()),/007 y 008/);
  }finally{
    if(server){server.closeAllConnections();await new Promise(resolve=>server.close(resolve));}
    if(pool)await pool.end();
    if(nombreAnterior===undefined)delete process.env.DB_NAME;else process.env.DB_NAME=nombreAnterior;
    try{await admin.query('DROP DATABASE `'+base+'`');}finally{await admin.end();}
  }
});
