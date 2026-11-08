import {test} from 'node:test';
import assert from 'node:assert/strict';
import express from 'express';
import {once} from 'node:events';
import {pool} from '../src/config/db.js';
import {colegioComprasService} from '../src/services/colegioComprasService.js';
import router from '../src/routes/colegioComprasRouter.js';
import {contratoService} from '../src/services/contratoService.js';

test('consulta colegios: cantidades distribuidas, varios proveedores y sin duplicar al consolidar',async()=>{
  const queryOriginal=pool.query,conexionOriginal=pool.getConnection;
  const listarOriginal=contratoService.listarEscolares,obtenerOriginal=contratoService.obtenerPorId;
  contratoService.listarEscolares=async()=>[{id_contrato:8,colegio:'Melchórita'},{id_contrato:99,colegio:'Melchórita nueva'}];
  contratoService.obtenerPorId=async()=>({colegio:'Melchórita nueva',cliente:'Cliente',productos:[{id_modelo:10,modelo:'Modelo A',cantidad:20},{id_modelo:11,modelo:'Modelo A variante',cantidad:5},{id_modelo:12,modelo:'Anuario',cantidad:6},{id_modelo:13,modelo:'Modelo A',cantidad:2},{id_modelo:14,modelo:'No solicitado',cantidad:9}]});
  const consultas=[];let vinculada=false;
  const origen=[
    {id_distribucion:1,id_contrato:1,id_detalle_contrato:11,id_producto:10,modelo:'Modelo A',id_proveedor:1,proveedor:'LALO',id_orden:1,codigo_pedido:'OC-LAL-0001',cantidad:5},
    {id_distribucion:2,id_contrato:1,id_detalle_contrato:11,id_producto:10,modelo:'Modelo A',id_proveedor:1,proveedor:'LALO',id_orden:2,codigo_pedido:'OC-LAL-0002',cantidad:11},
    {id_distribucion:3,id_contrato:1,id_detalle_contrato:12,id_producto:11,modelo:'Modelo A variante',id_proveedor:2,proveedor:'Joselito',id_orden:3,codigo_pedido:'OC-JOS-0001',cantidad:3},
    {id_distribucion:4,id_contrato:1,id_detalle_contrato:13,id_producto:12,modelo:'Anuario',id_proveedor:3,proveedor:'LíderBook',id_orden:4,codigo_pedido:'OC-LIB-0001',cantidad:6},
    {id_distribucion:5,id_contrato:1,id_detalle_contrato:14,id_producto:13,modelo:'Modelo A',id_proveedor:1,proveedor:'LALO',id_orden:5,codigo_pedido:'OC-LAL-0003',cantidad:2},
  ];
  const antes=JSON.stringify(origen);
  pool.query=async(sql,args)=>{consultas.push({sql,args});return [[{id_contrato:1,id_contrato_api:8,colegio:'Melchórita'}]];};
  pool.getConnection=async()=>({
    async query(sql,args){
      consultas.push({sql,args});
      if(sql.startsWith('START'))return [];
      if(sql.includes('FROM contratos_referencia'))return [args[0]===999?[]:[{id_contrato:args[0],id_contrato_api:8,colegio:'Melchórita'}]];
      assert.match(sql,/LEFT JOIN solicitud_ordenes/);assert.match(sql,/cd.id_contrato=?/);assert.doesNotMatch(sql,/UNION|cantidad_requerida/);
      return [args[0]===2?[]:origen.map(r=>({...r,producto_contrato:r.id_producto,id_modelo_api:r.id_producto,id_solicitud:vinculada&&r.id_orden<=2?100:null,codigo_masiva:vinculada&&r.id_orden<=2?'ORDEN-MAS-LAL-001':null,proveedor_masiva:vinculada&&r.id_orden<=2?1:null}))];
    },async commit(){},async rollback(){},release(){},
  });
  let server;
  try{
    await colegioComprasService.buscar('MELCHÓ_%');
    assert.deepEqual(consultas[0].args,['%melcho=_=%%']);assert.match(consultas[0].sql,/utf8mb4_unicode_ci/);
    const busqueda=await colegioComprasService.buscar('MELCHÓ');
    assert.equal(busqueda.colegios.length,2,'Une API y registros locales sin duplicar el contrato');
    assert.equal(busqueda.colegios[1].id_contrato,'api-99');
    assert.equal((await colegioComprasService.buscar('')).total,2,'Sin filtro cuenta contratos distintos');
    contratoService.listarEscolares=async()=>{throw Error('API caída');};
    const incompleta=await colegioComprasService.buscar('melcho');
    assert.equal(incompleta.colegios.length,1);assert.match(incompleta.aviso,/API/);
    contratoService.listarEscolares=async()=>[{id_contrato:8,colegio:'Melchórita'},{id_contrato:99,colegio:'Melchórita nueva',estado_trabajo:'entregado'}];
    const queryStub=pool.query;
    pool.query=async()=>[[]];
    const sinPedido=await colegioComprasService.obtener('api-99');
    assert.equal(sinPedido.total,0);assert.equal(sinPedido.productos.length,5);assert.ok(sinPedido.productos.every(p=>p.cantidad===0&&p.situacion==='Por solicitar'));assert.equal(sinPedido.productos[0].cantidad_por_solicitar,20);
    pool.query=queryStub;
    for(const q of [[],{},'a'.repeat(201)])await assert.rejects(colegioComprasService.buscar(q),e=>e.status===400);
    const pendiente=await colegioComprasService.obtener(1);
    assert.equal(pendiente.total,27);assert.equal(pendiente.modelos,5);assert.equal(pendiente.proveedores,3);assert.equal(pendiente.productos.length,5);
    assert.equal(pendiente.productos.find(p=>p.id_modelo===10).cantidad,16);assert.equal(pendiente.productos.find(p=>p.id_modelo===10).cantidad_por_solicitar,4);assert.equal(pendiente.productos.find(p=>p.id_modelo===14).situacion,'Por solicitar');
    vinculada=true;
    const generada=await colegioComprasService.obtener(1);
    assert.equal(generada.total,27);assert.equal(generada.productos.length,5);
    const masiva=generada.productos.find(p=>p.referencias.some(r=>r.id_solicitud===100));
    assert.equal(masiva.cantidad,16);assert.equal(masiva.situacion,'Parcial');assert.equal(masiva.pedidos.length,2);assert.equal(masiva.distribuciones.length,2);
    assert.equal(generada.productos.filter(p=>p.modelo==='Modelo A').length,2,'IDs diferentes no se fusionan por nombre');
    assert.equal((await colegioComprasService.obtener(2)).total,0,'No incluye compras de otros colegios');
    await assert.rejects(colegioComprasService.obtener(999),e=>e.status===404);
    for(const id of [0,-1,1.5,NaN])await assert.rejects(colegioComprasService.obtener(id),e=>e.status===400);
    const app=express();app.use('/api/colegios-compras',router);server=app.listen(0,'127.0.0.1');await once(server,'listening');
    const base='http://127.0.0.1:'+server.address().port+'/api/colegios-compras';
    assert.equal((await fetch(base+'?q=melcho')).status,200);
    assert.equal((await(await fetch(base+'/1')).json()).data.total,27);
    for(const method of ['POST','PUT','PATCH','DELETE'])assert.equal((await fetch(base+'/1',{method})).status,404);
    assert.equal(JSON.stringify(origen),antes);
    assert.ok(consultas.every(q=>/^\s*(SELECT|START TRANSACTION)/.test(q.sql)),'Solo consultas de lectura');
    const detalleAPI=contratoService.obtenerPorId;
    contratoService.obtenerPorId=async()=>({colegio:'Contrato realmente vacío',productos:[]});
    const vacio=await colegioComprasService.obtener(2);
    assert.equal(vacio.modelos,0);assert.deepEqual(vacio.productos,[]);
    contratoService.obtenerPorId=detalleAPI;
    contratoService.obtenerPorId=async()=>{throw Object.assign(Error('Error de consulta a la API'),{status:502});};
    await assert.rejects(colegioComprasService.obtener(1),e=>e.status===502,'No interpreta una API caída como contrato vacío');
  }finally{
    if(server){server.closeAllConnections();await new Promise(r=>server.close(r));}
    pool.query=queryOriginal;pool.getConnection=conexionOriginal;
    contratoService.listarEscolares=listarOriginal;contratoService.obtenerPorId=obtenerOriginal;
  }
});
test('todos los modelos: cero compras, una compra, completas, parciales y varios proveedores',async()=>{
  const original=pool.getConnection,apiOriginal=contratoService.obtenerPorId;
  let rows=[];
  contratoService.obtenerPorId=async()=>({colegio:'Colegio de prueba',productos:[1,2,3].map(id=>({id_modelo:id,modelo:'Modelo '+id,categoria:id===3?'Book':'Cuadro',cantidad:10}))});
  pool.getConnection=async()=>({async query(sql){
    if(sql.startsWith('START'))return [];
    if(sql.includes('FROM contratos_referencia'))return [[{id_contrato:1,id_contrato_api:94,colegio:'Colegio de prueba'}]];
    return [rows];
  },async commit(){},async rollback(){},release(){}});
  const compra=(id,modelo,cantidad,masiva=false,proveedor=1)=>({id_distribucion:id,id_detalle_contrato:modelo,producto_contrato:modelo,id_producto:modelo,id_modelo_api:modelo,modelo:'Modelo '+modelo,cantidad,id_orden:id,codigo_pedido:'OC-PRU-'+id,id_proveedor:proveedor,proveedor:'Proveedor '+proveedor,id_solicitud:masiva?100:null,codigo_masiva:masiva?'ORDEN-MAS-PRU-001':null,proveedor_masiva:masiva?proveedor:null});
  try{
    let d=await colegioComprasService.obtener(1);
    assert.equal(d.productos.length,3);assert.ok(d.productos.every(p=>p.situacion==='Por solicitar'&&p.cantidad===0&&p.cantidad_por_solicitar===10&&p.proveedor==='Sin asignar'));
    assert.deepEqual(d.productos.map(p=>p.categoria),['Cuadro','Cuadro','Book'],'Conserva categorías reales de la API sin depender de compras');
    rows=[compra(1,1,10)];d=await colegioComprasService.obtener(1);
    assert.equal(d.productos.length,3);assert.equal(d.productos[0].situacion,'Pedido pendiente');assert.equal(d.productos[1].situacion,'Por solicitar');
    rows=[1,2,3].map(id=>compra(id,id,10,true));d=await colegioComprasService.obtener(1);
    assert.equal(d.total,30);assert.ok(d.productos.every(p=>p.situacion==='Generada'&&p.cantidad_por_solicitar===0));
    rows=[compra(1,1,3),compra(2,1,2,true,2)];d=await colegioComprasService.obtener(1);
    assert.equal(d.productos.length,3);assert.equal(d.productos[0].cantidad,5);assert.equal(d.productos[0].cantidad_por_solicitar,5);assert.equal(d.productos[0].proveedores.length,2);assert.equal(d.productos[0].referencias.length,2);assert.equal(d.total,5);
  }finally{pool.getConnection=original;contratoService.obtenerPorId=apiOriginal;}
});
test.after(async()=>{await pool.end();});
