import assert from 'node:assert/strict';
import { test } from 'node:test';
import { createIntegrationCors } from '../src/routes/catalogoIntegracionRouter.js';
import { buildIntegrationCatalogQuery, modeloService, projectIntegrationCatalogModel } from '../src/services/modeloService.js';
import { pool } from '../src/config/db.js';
import { createCatalogIntegrationController } from '../src/controllers/catalogoIntegracionController.js';
import { getModelImageUrl } from '../src/services/modelImageService.js';

function responseStub() {
  return { statusCode: 200, body: null, status(code) { this.statusCode = code; return this; }, json(body) { this.body = body; return this; } };
}

test('integration endpoint query returns every active model with related records and no filters or pagination', () => {
  const result = buildIntegrationCatalogQuery();
  assert.match(result.sql, /INNER JOIN disenios/i);
  assert.match(result.sql, /INNER JOIN categorias/i);
  assert.match(result.sql, /INNER JOIN proveedores/i);
  assert.match(result.sql, /m\.estado\s*=\s*1/i);
  assert.match(result.sql, /d\.estado\s*=\s*1/i);
  assert.match(result.sql, /c\.estado\s*=\s*1/i);
  assert.match(result.sql, /p\.estado\s*=\s*'Activo'/i);
  assert.doesNotMatch(result.sql, /LIMIT|OFFSET|LIKE|\?\s*(?:AND|$)/i);
  assert.deepEqual(result.params, []);
});

test('integration projection provides related IDs and names and an absolute image URL or null', () => {
  const model = projectIntegrationCatalogModel({
    id_modelo: 167, nombre_modelo: 'MARAVILLAS', descripcion: null, precio: '67.00', nivel_educativo: 'SUPERIOR',
    estado: 1, imagen_path: '/uploads/modelos/123e4567-e89b-42d3-a456-426614174000.png', id_diseno: 5, nombre_diseno: 'DISEÑO', id_categoria: 1,
    nombre_categoria: 'CUADROS', id_proveedor: 2, nombre_proveedor: 'JOSELITO',
  });
  assert.equal(model.id_modelo, 167);
  assert.equal(model.imagen_url, getModelImageUrl('/uploads/modelos/123e4567-e89b-42d3-a456-426614174000.png'));
  assert.equal(model.id_categoria, 1);
  assert.equal(model.nombre_proveedor, 'JOSELITO');
  assert.equal(Object.hasOwn(projectIntegrationCatalogModel({ ...model, imagen_path: null }), 'imagen_path'), false);
});

test('integration service performs one joined query and returns the full catalog', async () => {
  const originalQuery = pool.query;
  const calls = [];
  pool.query = async (sql, params) => {
    calls.push({ sql, params });
    return [[{ id_modelo: 167, nombre_modelo: 'MARAVILLAS', precio: '67.00', estado: 1, id_diseno: 5,
      id_categoria: 1, nombre_categoria: 'CUADROS', id_proveedor: 2, nombre_proveedor: 'JOSELITO' }]];
  };
  try {
    const result = await modeloService.obtenerCatalogoIntegracion();
    assert.equal(calls.length, 1);
    assert.deepEqual(calls[0].params, []);
    assert.equal(result.length, 1);
    assert.equal(result[0].id_proveedor, 2);
  } finally { pool.query = originalQuery; }
});

test('integration controller always returns the entire catalog and ignores query filters', async () => {
  let calls = 0;
  const controller = createCatalogIntegrationController({ async obtenerCatalogoIntegracion() { calls += 1; return [{ id_modelo: 167 }]; } });
  const res = responseStub();
  await controller.listar({ query: { buscar: 'x', id_categoria: '4', pagina: '999' } }, res);
  assert.equal(calls, 1);
  assert.equal(res.statusCode, 200);
  assert.deepEqual(res.body, { success: true, data: [{ id_modelo: 167 }] });
});

test('integration controller hides internal errors', async () => {
  const controller = createCatalogIntegrationController({ async obtenerCatalogoIntegracion() { throw new Error('database secret'); } });
  const res = responseStub();
  await controller.listar({}, res);
  assert.equal(res.statusCode, 500);
  assert.doesNotMatch(JSON.stringify(res.body), /database secret/);
});

test('integration CORS allows only the configured PHP origin and never wildcard', async (t) => {
  const invoke = (origin) => new Promise((resolve) => {
    const headers = {};
    const req = { method: 'GET', headers: { origin } };
    const res = {
      getHeader(name) { return headers[name]; },
      setHeader(name, value) { headers[name] = value; },
    };
    createIntegrationCors('http://localhost:8000')(req, res, () => resolve(headers));
  });
  const allowed = await invoke('http://localhost:8000');
  const denied = await invoke('http://localhost:8001');
  assert.equal(allowed['Access-Control-Allow-Origin'], 'http://localhost:8000');
  assert.equal(denied['Access-Control-Allow-Origin'], undefined);
  assert.notEqual(allowed['Access-Control-Allow-Origin'], '*');
});
