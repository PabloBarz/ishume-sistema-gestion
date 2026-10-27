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

const orden = { id_orden: 12, codigo: 'OC-PDF-12', fecha: '22/10/2026', estado: 'Borrador', proveedor: 'LíderBook',
  productos: [{ modelo: 'Álbum escolar', categoria: 'Anuario', cantidad: 35 }],
  distribuciones: [{ id_contrato: 4, id_contrato_api: 8, colegio: 'Colegio San Martín', modelo: 'Álbum escolar', categoria: 'Anuario', cantidad: 35 }], total: 35 };

test('PDF: orden masiva con código OC, conservando el formato de documentos históricos', () => {
  const antes=JSON.stringify(orden);
  const nueva={...orden,version_documento:2,codigo:'OC-MAS-000123'};
  const texto=contenido(generarOrdenCompraPdf(nueva));
  assert.ok(texto.includes('ORDEN DE COMPRA'));
  assert.ok(texto.includes(nueva.codigo));
  assert.ok(!texto.includes('SOLICITUD DE COTIZACIÓN'));
  for(const valor of ['Colegio San Martín','Álbum escolar','35','TOTAL GENERAL'])assert.ok(texto.includes(valor));
  const historico=contenido(generarOrdenCompraPdf(orden));
  assert.ok(historico.includes('SOLICITUD DE COTIZACIÓN'));
  assert.ok(!historico.includes(orden.codigo));
  assert.equal(JSON.stringify(orden),antes);
});

test('PDF formal: ISHUME naranja, código único, nota y paginación sin cambiar datos', () => {
  const nueva={...orden,version_documento:3,codigo:'OC-MAS-000016'};
  const antes=JSON.stringify(nueva);
  const texto=contenido(generarOrdenCompraPdf(nueva));
  assert.match(texto,/1\. 0\.478 0\. rg[\s\S]*?\(ISHUME\)/,'Texto naranja #FF7A00');
  assert.equal([...texto.matchAll(/OC-MAS-000016/g)].length,1);
  assert.ok(texto.includes('TOTAL GENERAL:')&&texto.includes('35 UNIDADES'));
  for(const valor of ['ORDEN DE COMPRA','Gestión de compras','Precios y condiciones pendientes de cotización por el proveedor','Colegio San Martín','Álbum escolar','35']) assert.ok(texto.includes(valor),valor);
  for(const valor of ['Firma','Sello','Precio unitario','Descuento','Saldo','Contrato ID'])assert.ok(!texto.includes(valor),valor);
  assert.equal(JSON.stringify(nueva),antes);
  const productos=Array.from({length:80},(_,i)=>({modelo:`Producto formal ${i}`,cantidad:1}));
  const largo={...nueva,productos,total:80,distribuciones:productos.map(p=>({...p,id_contrato:4,colegio:'Colegio con muchos productos'}))};
  const paginado=contenido(generarOrdenCompraPdf(largo));
  assert.ok(paginado.includes('Producto formal 79'));
  assert.equal([...paginado.matchAll(/ORDEN DE COMPRA/g)].length,1);
  assert.equal([...paginado.matchAll(/Producto formal 79/g)].length,1);
  assert.ok(paginado.includes('Precios y condiciones pendientes'));
  assert.throws(()=>generarOrdenCompraPdf({...nueva,distribuciones:[{...nueva.distribuciones[0],colegio:null}]}),/nombre del colegio/);
});

test('PDF versión 4: encabezado corporativo y solo Modelo/Cantidad sin modificar datos', () => {
  const producto={...orden.productos[0],tipo:'Bio Gloss',categoria:'Cuadros',nivel:'Inicial'};
  const nueva={...orden,version_documento:4,codigo:'OC-MAS-000074',productos:[producto],distribuciones:[{...orden.distribuciones[0],...producto}]};
  const antes=JSON.stringify(nueva);
  const texto=contenido(generarOrdenCompraPdf(nueva));
  for(const valor of ['10727174040','compras@ishume.pe','+51 956 123 456','ORDEN DE COMPRA','OC-MAS-000074','Modelo','Cantidad','Total del colegio: 35 unidades','TOTAL GENERAL:','35 UNIDADES'])assert.ok(texto.includes(valor),valor);
  assert.match(texto,/0\.357 0\.247 0\.976 rg[\s\S]*?\(ISHUME\)/,'ISHUME en #5B3FF9');
  for(const valor of ['Gestión de compras','(Tipo)','(Categoría)','(Nivel)','Bio Gloss','Cuadros','Inicial'])assert.ok(!texto.includes(valor),'No muestra '+valor);
  for(const valor of ['Precios y condiciones pendientes','Por cotizar','Forma de pago','Lugar de entrega','Firma','Sello','Precio unitario','Descuento','Saldo','undefined','null'])assert.ok(!texto.includes(valor),valor);
  assert.equal(JSON.stringify(nueva),antes);
  const sinCaracteristicas={...nueva,productos:[{modelo:'Modelo sin atributos',cantidad:35}],distribuciones:[{id_contrato:4,colegio:'Colegio real',modelo:'Modelo sin atributos',cantidad:35}]};
  const simple=contenido(generarOrdenCompraPdf(sinCaracteristicas));
  for(const valor of ['(Tipo)','(Categoría)','(Nivel)'])assert.ok(!simple.includes(valor),'No inventa columnas '+valor);
  assert.ok(simple.includes('Modelo sin atributos'));
  const productos=Array.from({length:90},(_,i)=>({...producto,modelo:`Modelo de características ${i}`,cantidad:1}));
  const largo=contenido(generarOrdenCompraPdf({...nueva,productos,total:90,distribuciones:productos.map(p=>({...p,id_contrato:4,colegio:'Colegio con muchos modelos'}))}));
  assert.ok(largo.includes('Modelo de características 89'));
  assert.equal([...largo.matchAll(/ORDEN DE COMPRA/g)].length,1);
  assert.ok(largo.includes('90 UNIDADES'));
});

test('PDF: contenido, acentos y paginación con todos los modelos y colegios', async () => {
  const pdf = await generarOrdenCompraPdf(orden);
  assert.equal(pdf.subarray(0, 5).toString(), '%PDF-');
  const texto = contenido(pdf);
  assert.equal([...texto.matchAll(/SOLICITUD DE COTIZACIÓN/g)].length, 1, 'Una sola cabecera principal');
  assert.equal([...pdf.toString('latin1').matchAll(/\/Type \/Page\b/g)].length, 1, 'Orden pequeña en una página');
  for (const palabra of ['ISHUME', '22/10/2026', 'LíderBook', 'escolar', 'Martín', '35']) assert.ok(texto.includes(palabra), palabra);
  assert.ok(!texto.includes(orden.codigo), 'El código interno no se imprime en el PDF');
  for (const frase of ['Cantidad de colegios incluidos: 1','DETALLE DE PRODUCTOS SOLICITADOS','Solicitamos cotización de los siguientes modelos y cantidades','Descripción del modelo','Cantidad','Total de unidades del colegio','TOTAL GENERAL DE UNIDADES','Sistema de gestión de compras']) assert.ok(texto.includes(frase),frase);
  for (const frase of ['Estado:','Borrador','Contrato ID','Categoría','Anuario','Modelos solicitados','Observaciones','Precio','Descuento']) assert.ok(!texto.includes(frase),frase);
  assert.equal([...texto.matchAll(/Álbum escolar/g)].length,1,'Producto en una sola tabla');
  const largo = structuredClone(orden);
  largo.productos = Array.from({ length: 90 }, (_, i) => ({ modelo: `Modelo ${i} ` + 'con descripción extensa '.repeat(5), categoria: 'Cuadro', cantidad: 1 }));
  largo.distribuciones = largo.productos.map((p, i) => ({ ...p, id_contrato: i + 1, id_contrato_api: i + 101, colegio: `Colegio de prueba ${i}` }));
  largo.total = 90;
  const multipagina = await generarOrdenCompraPdf(largo);
  const paginas = [...multipagina.toString('latin1').matchAll(/\/Type \/Page\b/g)].length;
  assert.ok(paginas > 3);
  assert.ok(paginas < 90, 'Sin páginas vacías por pie de página');
  const textoLargo = contenido(multipagina);
  assert.ok(textoLargo.includes('Colegio de prueba 89'));
  assert.ok(textoLargo.includes('Modelo 89'));
  assert.equal([...textoLargo.matchAll(/SOLICITUD DE COTIZACIÓN/g)].length, 1, 'No repite cabecera en páginas siguientes');
  assert.equal([...textoLargo.matchAll(/Sistema de gestión de compras/g)].length, paginas, 'Pie en todas las páginas');
  assert.equal([...textoLargo.matchAll(/Modelo 89 /g)].length, 1, 'No duplica el modelo en una tabla general');
  const compacto = structuredClone(orden);
  compacto.productos = Array.from({length:4},(_,i)=>({modelo:`Modelo escolar ${i}`,categoria:'Cuadro',cantidad:5}));
  compacto.distribuciones = compacto.productos.map(p=>({...p,id_contrato:4,id_contrato_api:8,colegio:'Colegio San Martín'}));
  compacto.total=20;
  const documento = await generarOrdenCompraPdf(compacto);
  assert.equal([...documento.toString('latin1').matchAll(/\/Type \/Page\b/g)].length, 1, 'Cuatro modelos y un colegio sin saltos innecesarios');
});

test('PDF: conserva colegios y productos con enlaces antiguos, sin datos opcionales innecesarios', async () => {
  const original = structuredClone(orden);
  for (const opciones of [{categoria:false}, {contrato:false}, {distribucion:false}, {categoria:false,contrato:false,distribucion:false}]) {
    const texto = contenido(await generarOrdenCompraPdf(orden, opciones));
    for (const palabra of ['ISHUME', orden.proveedor, 'escolar', '35', 'TOTAL GENERAL']) assert.ok(texto.includes(palabra));
    assert.ok(!texto.includes(orden.codigo));
    if(opciones.categoria===false)assert.ok(!texto.includes('Anuario')&&!texto.includes('Categoría'));
    if(opciones.contrato===false||opciones.distribucion===false)assert.ok(!texto.includes('Contrato ID:'));
    assert.ok(texto.includes('Martín'),'No oculta el colegio aunque el enlace antiguo lo solicitara');
  }
  assert.deepEqual(orden,original);
});

test('PDF: colegio de muchas filas conserva todos sus modelos una sola vez y no modifica datos', async () => {
  const extensa = structuredClone(orden);
  extensa.productos = Array.from({length:110},(_,i)=>({modelo:`MODELO-UNICO-${String(i).padStart(3,'0')}`,categoria:'Anuario',cantidad:i+1}));
  extensa.distribuciones=extensa.productos.map(p=>({...p,id_contrato:4,id_contrato_api:8,colegio:'Nombre completo del cliente - Colegio San Martín de Porres'}));
  extensa.total=extensa.productos.reduce((s,p)=>s+p.cantidad,0);
  const original=structuredClone(extensa);
  const pdf=await generarOrdenCompraPdf(extensa);
  const texto=contenido(pdf);
  assert.ok([...pdf.toString('latin1').matchAll(/\/Type \/Page\b/g)].length>1);
  for(const p of extensa.productos)assert.equal(texto.split(p.modelo).length-1,1,p.modelo);
  assert.equal(texto.split('Total de unidades del colegio').length-1,1,'Subtotal solo al final del colegio');
  assert.equal(texto.split('TOTAL GENERAL DE UNIDADES').length-1,1);
  assert.deepEqual(extensa,original);
});

test('PDF: no pierde productos de órdenes antiguas sin distribución registrada',async()=>{
  const antigua={...orden,distribuciones:[]};
  const texto=contenido(await generarOrdenCompraPdf(antigua));
  assert.ok(texto.includes('Cantidad de colegios incluidos: 0'));
  assert.ok(texto.includes('Álbum escolar')&&texto.includes('sin distribución por colegio registrada'));
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
      assert.match(response.headers.get('content-disposition'), /attachment; filename="?Solicitud-cotizacion-OC-PDF-12.pdf"?/);
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
    assert.ok(sinExtrasTexto.includes('Martín')&&!sinExtrasTexto.includes('Anuario'));
    assert.ok(sinExtrasTexto.includes('SOLICITUD DE COTIZACIÓN'));
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
    assert.ok(!texto.includes(saved.codigo));
    assert.ok(texto.includes(saved.proveedor));
  }
  const [[despues]] = await pool.query('SELECT COUNT(*) AS n FROM ordenes_compra');
  assert.equal(antes.n, despues.n);
  await assert.rejects(compraMasivaService.obtenerOrden(0), /válido/);
  await assert.rejects(compraMasivaService.obtenerOrden(2147483647), /no encontrada/);
});

test.after(async () => { await pool.end(); });
