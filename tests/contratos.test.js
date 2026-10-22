import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { once } from 'node:events';
import express from 'express';
import contratoRouter from '../src/routes/contratoRouter.js';

test('consulta contratos mediante la API externa sin persistencia', async () => {
  const originalUrl = process.env.CONTRATOS_API_URL;
  const external = createServer((req, res) => {
    const id = new URL(req.url, 'http://localhost').searchParams.get('id');
    res.setHeader('Content-Type', 'application/json');
    if (id === '404') { res.writeHead(404); res.end('{"error":"Contrato no encontrado"}'); return; }
    if (id === '500') { res.writeHead(500); res.end('{}'); return; }
    if (id === '502') { res.end('<html>Error PHP</html>'); return; }
    if (id === '503') { res.end('{}'); return; }
    res.end(JSON.stringify({
      id_contrato: Number(id), cliente: 'Ana Pérez - Colegio San José, Lima',
      fecha_entrega: null, productos: id === '2' ? [] : [
        { id_modelo: 7, modelo: 'Modelo A', cantidad: 23 },
        { id_modelo: 8, modelo: 'Modelo B', cantidad: 4 },
      ],
    }));
  });
  const app = express();
  app.use('/api/contratos', contratoRouter);
  const local = createServer(app);
  try {
    external.listen(0, '127.0.0.1');
    await once(external, 'listening');
    local.listen(0, '127.0.0.1');
    await once(local, 'listening');
    process.env.CONTRATOS_API_URL = `http://127.0.0.1:${external.address().port}/api/contratos.php`;
    const base = `http://127.0.0.1:${local.address().port}/api/contratos`;
    for (const query of ['', '?id=0', '?id=-1', '?id=abc', '?id=1.5', '?id=1&id=2']) {
      assert.equal((await fetch(base + query)).status, 400, query);
    }
    for (const id of ['1', '27', '00027']) {
      const response = await fetch(`${base}?id=${id}`);
      assert.equal(response.status, 200);
      assert.equal(response.headers.get('cache-control'), 'no-store');
      const { data } = await response.json();
      assert.equal(data.id_contrato, Number(id));
      assert.equal(data.cliente, 'Ana Pérez - Colegio San José, Lima');
      assert.deepEqual(data.productos.map(({ cantidad }) => cantidad), [23, 4]);
    }
    const empty = await (await fetch(`${base}?id=2`)).json();
    assert.deepEqual(empty.data.productos, []);
    assert.equal(empty.data.fecha_entrega, null);
    for (const [id, expected] of [[404, 404], [500, 502], [502, 502], [503, 502]]) {
      assert.equal((await fetch(`${base}?id=${id}`)).status, expected);
    }
    delete process.env.CONTRATOS_API_URL;
    assert.equal((await fetch(`${base}?id=1`)).status, 503);
  } finally {
    if (originalUrl === undefined) delete process.env.CONTRATOS_API_URL;
    else process.env.CONTRATOS_API_URL = originalUrl;
    await Promise.all([external, local].map((server) => new Promise((resolve) => {
      server.close(resolve);
      server.closeAllConnections();
    })));
  }
});
