import {test} from 'node:test';
import assert from 'node:assert/strict';
import {contratoService} from '../src/services/contratoService.js';
test('catalogo escolar: tres estados, IDs independientes, sin depender de productos',async()=>{
 const original=global.fetch,url=process.env.CONTRATOS_API_URL,llamadas=[];
 process.env.CONTRATOS_API_URL='http://contratos.test/contrato.php';
 global.fetch=async u=>{const estado=u.searchParams.get('estado_trabajo');llamadas.push(estado);return {ok:true,status:200,json:async()=>[
 {id_contrato:estado==='entregado'?3:1,colegio:'San Jose',promocion:'Promoci\u00f3n',estado_trabajo:estado},
 {id_contrato:2,colegio:'San Jose',promocion:'Promocion',estado_trabajo:estado},
 {id_contrato:99,colegio:'No escolar',promocion:'Boda'}]};};
 try{const r=await contratoService.listarEscolares();assert.equal(r.length,3);assert.deepEqual(new Set(llamadas),new Set(['pendiente','en_proceso','entregado']));assert.ok(r.some(c=>c.id_contrato===3));
 global.fetch=async()=>({ok:true,json:async()=>({error:'fallo'})});await assert.rejects(contratoService.listarEscolares(),e=>e.status===502);
 }finally{global.fetch=original;if(url===undefined)delete process.env.CONTRATOS_API_URL;else process.env.CONTRATOS_API_URL=url;}
});
