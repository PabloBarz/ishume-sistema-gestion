import {test} from 'node:test';
import assert from 'node:assert/strict';
import {pool} from '../src/config/db.js';
import {contratoService} from '../src/services/contratoService.js';
import {colegioComprasService} from '../src/services/colegioComprasService.js';

test('listado completo: filtros combinados, contratos distintos, modelos válidos y paginación real',async()=>{
  const original=pool.query,listar=contratoService.listarEscolares;
  const contratos=Array.from({length:45},(_,i)=>({id_contrato:i+1,colegio:'Parácas '+String(i+1).padStart(2,'0'),modelos:2,
    productos:[{id_modelo:1,cantidad:10},{id_modelo:2,cantidad:5}]}));
  contratos.push({...contratos[0],id_contrato:46},{id_contrato:47,colegio:'Vacío',modelos:0});
  contratoService.listarEscolares=async()=>contratos;
  let sqlUsado='';
  pool.query=async sql=>{
    sqlUsado=sql;
    return [[
      {id_contrato:101,id_contrato_api:1,id_modelo_api:1,cantidad:10,pendiente:1,generada:0},
      {id_contrato:102,id_contrato_api:2,id_modelo_api:1,cantidad:10,pendiente:0,generada:1},
      {id_contrato:102,id_contrato_api:2,id_modelo_api:2,cantidad:5,pendiente:0,generada:1},
      {id_contrato:103,id_contrato_api:3,id_modelo_api:1,cantidad:8,pendiente:1,generada:1},
    ]];
  };
  try{
    const todos=await colegioComprasService.listar();
    assert.equal(todos.total,46);assert.equal(todos.colegios.length,20);assert.equal(todos.paginas,3);
    assert.equal(todos.colegios.filter(c=>c.colegio==='Parácas 01').length,2,'No fusiona nombres iguales');
    assert.equal((await colegioComprasService.listar({pagina:'3'})).colegios.length,6);
    assert.equal((await colegioComprasService.listar({filtro:'sin_pedido'})).total,43);
    const pendientes=await colegioComprasService.listar({filtro:'pendiente',q:'PARACAS'});
    assert.deepEqual(pendientes.colegios.map(c=>c.id_contrato_api),[1,3]);
    const generadas=await colegioComprasService.listar({filtro:'generada'});
    assert.deepEqual(generadas.colegios.map(c=>c.id_contrato_api),[2,3]);
    assert.deepEqual(generadas.colegios[0].situaciones,['Orden generada'],'Consolidado no sigue pendiente');
    assert.deepEqual(generadas.colegios[1].situaciones,['Pedido pendiente','Orden generada','Por solicitar']);
    assert.equal((await colegioComprasService.listar({q:'inexistente'})).total,0);
    assert.match(sqlUsado,/LEFT JOIN solicitud_ordenes/);assert.doesNotMatch(sqlUsado,/UNION|INSERT|UPDATE|DELETE/);
    for(const args of [{pagina:'0'},{pagina:'1.5'},{filtro:'recibido'},{q:[]}])await assert.rejects(colegioComprasService.listar(args),e=>e.status===400);
    contratoService.listarEscolares=async()=>{throw Object.assign(Error('API no disponible'),{status:502});};
    await assert.rejects(colegioComprasService.listar(),/API no disponible/);
  }finally{pool.query=original;contratoService.listarEscolares=listar;}
});
test.after(async()=>pool.end());
