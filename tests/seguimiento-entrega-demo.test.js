import {test} from 'node:test';
import assert from 'node:assert/strict';
import {simularEntrega,renderSeguimientoDemo} from '../public/js/modules/seguimientoEntregaDemo.js';
test('recibidos manuales por linea sin modificar datos reales',()=>{
  const data={codigo:'ORDEN-MAS-LAL-123',proveedor:'Proveedor real',total:11,distribuciones:[
    {id_producto:1,id_contrato:7,colegio:'Colegio uno',modelo:'Modelo igual',cantidad:3},
    {id_producto:2,id_contrato:8,colegio:'Colegio dos',modelo:'Modelo igual',cantidad:8}]};
  const antes=JSON.stringify(data);
  for(const [valores,estado] of [[[0,0],'Pendiente'],[[2,4],'Parcial'],[[3,8],'Recibido']]){
    const r=simularEntrega(data,valores);assert.equal(r.total,11);assert.equal(r.recibido+r.pendiente,11);assert.equal(r.estado,estado);
    assert.equal(r.lineas.reduce((n,d)=>n+d.recibido,0),r.recibido);assert.deepEqual(r.lineas.map(d=>d.linea),[0,1]);assert.deepEqual(r.lineas.map(d=>d.recibido),valores);
    for(const d of r.lineas)assert.equal(d.recibido+d.pendiente,d.cantidad);
  }
  for(const invalidos of [[-1,0],[4,0],[0,9],[1.5,0],['2',0],[0],[]])assert.throws(()=>simularEntrega(data,invalidos));
  assert.equal(JSON.stringify(data),antes);
  const html=renderSeguimientoDemo(data);assert.doesNotMatch(html,/seguimientoDemoEscenario|seguimiento-demo-inspeccion|seguimientoDemoReiniciar|Vista demostrativa|simulaci/);
  assert.ok(!html.includes('<th scope="col">Colegio</th>'));
  assert.match(html,/data-linea-recibida="0"/);assert.match(html,/data-linea-recibida="1"/);assert.equal((html.match(/<dt>/g)||[]).length,4);
  assert.throws(()=>simularEntrega({...data,total:12}));assert.throws(()=>simularEntrega({...data,distribuciones:[]}));
});
