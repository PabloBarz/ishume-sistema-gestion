import {test} from 'node:test';
import assert from 'node:assert/strict';
import {pool} from '../src/config/db.js';
import {pagosService} from '../src/services/pagosService.js';

test('vista general: consulta limitada y saldos desconocidos sin pagos internos',async()=>{
  const original=pool.query;const llamadas=[];
  pool.query=async(sql,args)=>{
    llamadas.push({sql,args});
    if(sql.includes('information_schema'))return [[{n:0}]];
    if(sql.startsWith('SELECT s.id_proveedor,COUNT'))return [[{id_proveedor:7,cantidad:21,cotizadas:0,total:null,abonado:null,saldo:null}]];
    return [Array.from({length:21},(_,i)=>({id_solicitud:30-i,id_proveedor:7,codigo:'OC-MAS-'+(30-i),proveedor:'LíderBook',fecha:'30/10/2026',unidades:'18'}))];
  };
  try {
    const data=await pagosService.listar({q:'LÍDERBOOK_%',pagina:2});
    assert.equal(data.ordenes.length,20);assert.equal(data.hayMas,true);assert.equal(data.pagina,2);
    assert.equal(data.economia_disponible,false);
    assert.equal(data.proveedores[0].total,null);assert.equal(data.proveedores[0].cantidad,21);
    assert.deepEqual(llamadas[2].args,[7]);assert.doesNotMatch(llamadas[2].sql,/LIKE|LIMIT|OFFSET/);
    assert.ok(data.ordenes.every(o=>o.importe===null&&o.abonado===null&&o.saldo===null&&o.estado_economico===null));
    assert.equal(data.ordenes[0].unidades,18);
    assert.deepEqual(llamadas[1].args,['%liderbook=_=%%','%liderbook=_=%%',20]);
    assert.match(llamadas[1].sql,/^SELECT/);assert.match(llamadas[1].sql,/LIMIT 21 OFFSET/);
    assert.match(llamadas[1].sql,/utf8mb4_unicode_ci/);assert.match(llamadas[1].sql,/ORDEN-MAS/);
    assert.doesNotMatch(llamadas[1].sql,/pagos_proveedor|INSERT|UPDATE|DELETE/);
    for(const entrada of [{pagina:0},{pagina:1.5},{q:[]},{q:'x'.repeat(201)},{estado:'pagado'}])await assert.rejects(pagosService.listar(entrada),e=>e.status===400);
    assert.equal(llamadas.length,3,'Validación previa a consultar');
    pool.query=async()=>[[]];
    assert.deepEqual((await pagosService.listar()).ordenes,[]);
  }finally{pool.query=original;}
});
test.after(async()=>{await pool.end();});

test('no habilita guardado si las columnas existen pero la FK no apunta a la orden masiva',async()=>{
  const original=pool.query;
  pool.query=async(sql)=>sql.includes('information_schema')?[[{n:11,relacion:0,registro:1}]]:[[]];
  try {
    const data=await pagosService.listar();
    assert.equal(data.economia_disponible,false);
    await assert.rejects(pagosService.guardarDocumento(1,{},Buffer.from(''),'',''),e=>e.status===503);
  } finally {pool.query=original;}
});

test('sin fecha_registro mantiene el esquema base disponible',async()=>{
  const original=pool.query;
  pool.query=async(sql)=>sql.includes('information_schema')?[[{n:11,relacion:1,registro:0}]]:[[]];
  try {
    assert.equal((await pagosService.listar()).economia_disponible,true);

  } finally {pool.query=original;}
});
