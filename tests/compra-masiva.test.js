import { test } from 'node:test';
import assert from 'node:assert/strict';
import { compraMasivaService } from '../src/services/compraMasivaService.js';
import { contratoService } from '../src/services/contratoService.js';
import { proveedorService } from '../src/services/proveedorService.js';
import { pool } from '../src/config/db.js';

test('revisión: agrupa por modelo y proveedor, valida cantidades y conserva colegios', async () => {
  const getContrato = contratoService.obtenerPorId;
  const getProveedores = proveedorService.listarActivos;
  contratoService.obtenerPorId = async (id) => ({
    id_contrato: Number(id), colegio: `Colegio ${id}`, cliente: `Responsable ${id}`, fecha_entrega: null,
    productos: [{ id_modelo: 100, modelo: 'Cuadro A', categoria: 'Cuadro', cantidad: 30 }],
  });
  proveedorService.listarActivos = async () => [{ id_proveedor: 1, razon_social: 'Proveedor activo' }];
  const entrada = [8, 25].map((id) => ({ id_contrato: id, productos: [{ id_modelo: 100, cantidad: 35, id_proveedor: 1 }] }));
  try {
    const { ordenes } = await compraMasivaService.revisar(entrada);
    assert.equal(ordenes.length, 1);
    assert.equal(ordenes[0].productos.length, 1);
    assert.equal(ordenes[0].productos[0].cantidad, 70);
    assert.equal(ordenes[0].productos[0].distribuciones[0].colegio,'Colegio 8');
    assert.deepEqual(ordenes[0].productos[0].distribuciones.map((d) => [d.id_contrato, d.original, d.cantidad]), [[8, 30, 35], [25, 30, 35]]);
    for (const cantidad of [0, -1, 29, 30.5, null, 2147483648]) {
      const bad = structuredClone(entrada); bad[0].productos[0].cantidad = cantidad;
      await assert.rejects(compraMasivaService.revisar(bad), /cantidades/);
    }
    const bad = structuredClone(entrada); bad[0].productos[0].id_proveedor = 99;
    await assert.rejects(compraMasivaService.revisar(bad), /proveedores/);
    await assert.rejects(compraMasivaService.revisar([entrada[0], entrada[0]]), /duplicados/);
    await assert.rejects(compraMasivaService.revisar([]), /contratos/);
    const distinto = structuredClone(entrada); distinto[0].productos[0].id_modelo = 101;
    await assert.rejects(compraMasivaService.revisar(distinto), /no coincide/);
    await assert.rejects(compraMasivaService.confirmar('invalid'), /inválida/);
  } finally {
    contratoService.obtenerPorId = getContrato;
    proveedorService.listarActivos = getProveedores;
  }
});

test('MySQL: inserciones, distribuciones, idempotencia y rollback sin compras permanentes', { skip: process.env.TEST_MYSQL !== '1' }, async () => {
  const getContrato = contratoService.obtenerPorId;
  const getConnection = pool.getConnection.bind(pool);
  const conn = await getConnection();
  const tablas = ['contratos_referencia', 'productos', 'contrato_detalles', 'ordenes_compra', 'orden_detalles', 'orden_distribuciones'];
  async function conteos() {
    const resultado = [];
    for (const tabla of tablas) resultado.push((await conn.query('SELECT COUNT(*) AS n FROM ??', [tabla]))[0][0].n);
    return resultado;
  }
  const antes = await conteos();
  let forzarError = false;
  const query = conn.query.bind(conn);
  // Mantiene INSERT/UPDATE y relaciones reales en una transacción que se revierte al terminar.
  pool.getConnection = async () => ({
    query: async (sql, args) => {
      if (forzarError && sql.startsWith('INSERT INTO orden_distribuciones')) throw new Error('Fallo de distribución simulado');
      return query(sql, args);
    },
    beginTransaction: () => conn.beginTransaction(),
    commit: async () => {},
    rollback: () => conn.rollback(),
    release: () => {},
  });
  const proveedores = await proveedorService.listarActivos();
  assert.ok(proveedores.length >= 2, 'Se necesitan dos proveedores activos para esta prueba');
  contratoService.obtenerPorId = async (id) => ({ id_contrato: Number(id), colegio: `Colegio real ${id}`, cliente: `Prueba transaccional ${id}`, fecha_entrega: null,
    productos: [{ id_modelo: 2000000101, modelo: 'Prueba cuadro', categoria: 'Cuadro', cantidad: 30 }, { id_modelo: 2000000102, modelo: 'Prueba anuario', categoria: 'Anuario', cantidad: 2 }] });
  const entrada = [2000000101, 2000000102].map((id) => ({ id_contrato: id, productos: [
    { id_modelo: 2000000101, cantidad: 35, id_proveedor: proveedores[0].id_proveedor },
    { id_modelo: 2000000102, cantidad: 2, id_proveedor: proveedores[1].id_proveedor },
  ] }));
  try {
    const revision = await compraMasivaService.revisar(entrada);
    const result = await compraMasivaService.confirmar(revision.token);
    assert.equal(result.ordenes.length, 2);
    for (const o of result.ordenes) {
      const proveedor = proveedores.find(p=>p.id_proveedor===o.id_proveedor);
      const prefijo = proveedor.razon_social==='Joselito'?'JOS':proveedor.razon_social==='LALO'?'LAL':null;
      if(prefijo)assert.match(o.codigo,new RegExp(`^OC-${prefijo}-\\d{4,}$`));
      assert.equal(o.estado,'Borrador');
      assert.equal(o.modelos,1);
      assert.ok(o.total>0);
    }
    const repetida = await compraMasivaService.confirmar(revision.token);
    assert.equal(repetida.repetida, true);
    assert.deepEqual(repetida.ordenes,result.ordenes,'El reintento mantiene códigos y métricas');
    assert.deepEqual(repetida.ordenes.map((o) => o.id_orden), result.ordenes.map((o) => o.id_orden));
    const [lineas] = await conn.query(`SELECT od.cantidad_pedida, SUM(d.cantidad_asignada) AS asignada
      FROM orden_detalles od JOIN orden_distribuciones d ON d.id_orden_detalle=od.id_orden_detalle
      WHERE od.id_orden IN (?) GROUP BY od.id_orden_detalle`, [result.ordenes.map((o) => o.id_orden)]);
    assert.equal(lineas.length, 2);
    lineas.forEach((l) => assert.equal(Number(l.asignada), l.cantidad_pedida));
    const [originales] = await conn.query(`SELECT cd.cantidad_requerida FROM contrato_detalles cd
      JOIN contratos_referencia cr ON cr.id_contrato=cd.id_contrato WHERE cr.id_contrato_api IN (?)`, [entrada.map((c) => c.id_contrato)]);
    assert.deepEqual(originales.map((r) => r.cantidad_requerida).sort((a, b) => a - b), [2, 2, 30, 30]);
    await conn.rollback();
    assert.deepEqual(await conteos(), antes);
    const lider = proveedores.find(p => p.razon_social.normalize('NFD').replace(/[\u0300-\u036f]/g,'').toUpperCase()==='LIDERBOOK');
    if (lider) {
      const seleccion = structuredClone(entrada);
      seleccion.forEach(c => c.productos.forEach(p => { p.id_proveedor = lider.id_proveedor; }));
      const revisionLider = await compraMasivaService.revisar(seleccion);
      const guardadaLider = await compraMasivaService.confirmar(revisionLider.token);
      assert.equal(guardadaLider.ordenes.length,1);
      assert.match(guardadaLider.ordenes[0].codigo,/^OC-LIB-\d{4,}$/);
      assert.equal(guardadaLider.ordenes[0].total,74);
      assert.equal(guardadaLider.ordenes[0].modelos,2);
      await conn.rollback();
      assert.deepEqual(await conteos(), antes);
    }
    const segunda = await compraMasivaService.revisar(entrada);
    forzarError = true;
    await assert.rejects(compraMasivaService.confirmar(segunda.token), /simulado/);
    assert.deepEqual(await conteos(), antes);
    const tercera = await compraMasivaService.revisar(entrada);
    const originalMock = contratoService.obtenerPorId;
    contratoService.obtenerPorId = async (id) => ({ ...await originalMock(id), cliente: 'Cambió el colegio' });
    await assert.rejects(compraMasivaService.confirmar(tercera.token), /cambiaron/);
  } finally {
    await conn.rollback();
    pool.getConnection = getConnection;
    contratoService.obtenerPorId = getContrato;
    conn.release();
  }
});

test.after(async () => { await pool.end(); });
