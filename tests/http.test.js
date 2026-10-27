import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { once } from 'node:events';
import { http } from '../public/js/utils.js';

test('HTTP compartido: timeout antes de cabeceras y al leer el cuerpo; permite reintentar', async () => {
  const server = createServer((req,res) => {
    if(req.url==='/lento')return;
    if(req.url==='/cuerpo'){res.writeHead(200,{'Content-Type':'application/json'});res.flushHeaders();return;}
    if(req.url==='/error'){res.writeHead(404,{'Content-Type':'application/json'});res.end('{"message":"Contrato no encontrado"}');return;}
    res.setHeader('Content-Type','application/json');res.end('{"success":true}');
  });
  server.listen(0,'127.0.0.1'); await once(server,'listening');
  const base=`http://127.0.0.1:${server.address().port}`;
  try {
    for(const path of ['/lento','/cuerpo'])await assert.rejects(http(base+path,'GET',null,{timeoutMs:100}),e=>e.name==='TimeoutError');
    await assert.rejects(http(base+'/error'),e=>e.status===404&&e.message==='Contrato no encontrado');
    assert.deepEqual(await http(base+'/ok'),{success:true});
  }finally{server.closeAllConnections();await new Promise(r=>server.close(r));}
});
