import { test } from 'node:test';
import assert from 'node:assert/strict';
import express from 'express';
import { once } from 'node:events';
import { inflateSync } from 'node:zlib';
import { generarOrdenCompraPdf } from '../src/services/ordenCompraPdfService.js';
import { compraMasivaService } from '../src/services/compraMasivaService.js';
import compraRouter from '../src/routes/compraMasivaRouter.js';
import { pool } from '../src/config/db.js';

function contenido(pdf) {
  // Inspecciona los streams FlateDecode y el texto WinAnsi de los documentos generados.
  const text = pdf.toString('latin1');
  const streams = [];
  for (const match of text.matchAll(/stream\r?\n([\s\S]*?)\r?\nendstream/g)) {
    try { streams.push(inflateSync(Buffer.from(match[1], 'latin1')).toString('latin1')); } catch { /* No es un stream de texto. */ }
  }
  return streams.join('\n').replace(/\[([^\]]*)\]\s*TJ/g, (_, array) =>
    [...array.matchAll(/<([a-f0-9]+)>/gi)].map((m) => Buffer.from(m[1], 'hex').toString('latin1')).join(''));
}

const orden={id_orden:12,codigo:'ORDEN-MAS-LAL-123',version_documento:4,fecha:'31/10/2026',proveedor:'LALO',id_proveedor:1,total:23,
  productos:[{id_producto:1,modelo:'Modelo A',cantidad:19},{id_producto:2,modelo:'Modelo B',cantidad:4}],
  distribuciones:[{id_producto:1,id_contrato:1,colegio:'Colegio A',modelo:'Modelo A',cantidad:5},{id_producto:1,id_contrato:2,colegio:'Colegio B',modelo:'Modelo A',cantidad:11},{id_producto:1,id_contrato:3,colegio:'Colegio C',modelo:'Modelo A',cantidad:3},{id_producto:2,id_contrato:1,colegio:'Colegio A',modelo:'Modelo B',cantidad:4}]};
test('PDF consolidado: una tabla por identidad, sin colegios y sin modificar datos',()=>{
  const antes=JSON.stringify(orden),texto=contenido(generarOrdenCompraPdf(orden));
  for(const dato of ['ISHUME',orden.codigo,'LALO','31/10/2026','Modelo A','Modelo B','19','23 UNIDADES'])assert.ok(texto.includes(dato),dato);
  for(const dato of ['Colegio A','Colegio B','Colegios','Total del colegio','Precio unitario'])assert.ok(!texto.includes(dato),dato);
  assert.equal(texto.split('Modelo A').length-1,1);assert.equal(JSON.stringify(orden),antes);
  assert.throws(()=>generarOrdenCompraPdf({...orden,total:22}),/total/);
  assert.throws(()=>generarOrdenCompraPdf({...orden,distribuciones:[{...orden.distribuciones[0],cantidad:30}]}),/distribuci/);
});
test('PDF consolidado multipagina: todos los modelos una vez y una cabecera principal',()=>{
  const productos=Array.from({length:110},(_,i)=>({id_producto:i+1,modelo:'MODELO-'+String(i).padStart(3,'0'),cantidad:i+1}));
  const total=productos.reduce((n,p)=>n+p.cantidad,0);
  const data={...orden,productos,total,distribuciones:productos.map(p=>({...p,id_contrato:1,colegio:'No debe mostrarse'}))};
  const pdf=generarOrdenCompraPdf(data),texto=contenido(pdf);assert.ok([...pdf.toString('latin1').matchAll(/\/Type \/Page\b/g)].length>1);
  for(const p of productos)assert.equal(texto.split(p.modelo).length-1,1,p.modelo);
  assert.equal(texto.split('ORDEN DE COMPRA').length-1,1);assert.equal(texto.split('TOTAL GENERAL:').length-1,1);
});

test('HTTP: descarga repetible y errores sin llamar al guardado', async () => {
  const original = compraMasivaService.obtenerOrden;
  const confirmar = compraMasivaService.confirmar;
  let lecturas = 0;
  compraMasivaService.obtenerOrden = async (id) => {
    lecturas++;
    if (id === 404) throw Object.assign(new Error('Orden de compra no encontrada.'), { status: 404 });
    if (id !== 12) throw Object.assign(new Error('ID inválido.'), { status: 400 });
    return orden;
  };
  compraMasivaService.confirmar = () => { throw new Error('Descargar nunca debe guardar'); };
  const app = express(); app.use('/api/compras-masivas', compraRouter);
  const server = app.listen(0, '127.0.0.1'); await once(server, 'listening');
  const base = `http://127.0.0.1:${server.address().port}/api/compras-masivas/ordenes`;
  try {
    for (let i = 0; i < 2; i++) {
      const response = await fetch(`${base}/12/pdf`);
      assert.equal(response.status, 200);
      assert.match(response.headers.get('content-type'), /application\/pdf/);
      assert.match(response.headers.get('content-disposition'), /attachment; filename="?ORDEN-MAS-LAL-123_LALO.pdf"?/);
      assert.equal(response.headers.get('cache-control'), 'no-store');
      assert.equal(Buffer.from(await response.arrayBuffer()).subarray(0, 5).toString(), '%PDF-');
    }
    assert.equal(lecturas, 2);
    const vista = await fetch(`${base}/12/pdf?vista=1`);
    assert.equal(vista.status, 200);
    assert.match(vista.headers.get('content-disposition'), /^inline;/);
    assert.equal(Buffer.from(await vista.arrayBuffer()).subarray(0,5).toString(), '%PDF-');
    const consultada = await fetch(`${base}/12`);
    assert.equal(consultada.status,200);
    assert.equal((await consultada.json()).data.codigo,orden.codigo);
    assert.equal((await fetch(`${base}/404/pdf`)).status, 404);
    assert.equal((await fetch(`${base}/abc/pdf`)).status, 400);
    const sinExtras = await fetch(`${base}/12/pdf?categoria=0&distribucion=0&contrato=0`);
    const sinExtrasTexto = contenido(Buffer.from(await sinExtras.arrayBuffer()));
    assert.ok(sinExtrasTexto.includes('Modelo A')&&!sinExtrasTexto.includes('Colegio A'));
    assert.ok(sinExtrasTexto.includes('ORDEN DE COMPRA'));
  } finally {
    compraMasivaService.obtenerOrden = original; compraMasivaService.confirmar = confirmar;
    server.closeAllConnections(); await new Promise((r) => server.close(r));
  }
});

test('MySQL: descarga orden existente con cantidades y distribuciones reales, sin escrituras', { skip: process.env.TEST_MYSQL !== '1' }, async (t) => {
  const [[{ id }]] = await pool.query('SELECT MAX(id_orden) AS id FROM ordenes_compra');
  if (!id) { t.skip('No hay órdenes guardadas'); return; }
  const [[antes]] = await pool.query('SELECT COUNT(*) AS n FROM ordenes_compra');
  const saved = await compraMasivaService.obtenerOrden(id);
  const encontrada = await compraMasivaService.buscarOrdenes(saved.codigo);
  assert.equal(encontrada.ordenes[0].id_orden,id);
  assert.equal(encontrada.ordenes[0].total,saved.total);
  const proveedor = await compraMasivaService.buscarOrdenes(saved.proveedor);
  assert.ok(proveedor.ordenes.every(o=>o.proveedor.includes(saved.proveedor)));
  assert.deepEqual((await compraMasivaService.buscarOrdenes('NO_EXISTE_%_!_98765')).ordenes,[]);
  assert.deepEqual((await compraMasivaService.buscarOrdenes("' OR 1=1 --")).ordenes,[]);
  await assert.rejects(compraMasivaService.buscarOrdenes('',0), /inválida/);
  assert.equal(saved.id_orden, id);
  assert.equal(saved.total, saved.productos.reduce((s, p) => s + p.cantidad, 0));
  assert.equal(saved.total, saved.distribuciones.reduce((s, p) => s + p.cantidad, 0));
  for (let i = 0; i < 2; i++) {
    const pdf = await generarOrdenCompraPdf(await compraMasivaService.obtenerOrden(id));
    const texto = contenido(pdf);
    assert.ok(!texto.includes('Total del colegio'));
    assert.ok(texto.includes(saved.proveedor));
  }
  const [[despues]] = await pool.query('SELECT COUNT(*) AS n FROM ordenes_compra');
  assert.equal(antes.n, despues.n);
  await assert.rejects(compraMasivaService.obtenerOrden(0), /válido/);
  await assert.rejects(compraMasivaService.obtenerOrden(2147483647), /no encontrada/);
});

test.after(async () => { await pool.end(); });
