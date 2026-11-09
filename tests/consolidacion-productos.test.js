import {test} from 'node:test';
import assert from 'node:assert/strict';
import {consolidarOrden} from '../public/js/shared/consolidacionProductos.js';
import {simularEntrega} from '../public/js/module_compras/seguimientoEntregaDemo.js';

test('consolidacion compartida: varios colegios y pedidos, identidad real y trazabilidad intacta',()=>{
  const distribuciones=[5,11,3].map((cantidad,i)=>({id_producto:7,id_contrato:i+1,modelo:'Modelo igual',cantidad}));
  distribuciones.push({id_producto:8,id_contrato:1,modelo:'Modelo igual',cantidad:4});
  const orden={id_proveedor:1,total:23,productos:[{id_producto:7,modelo:'Modelo igual',cantidad:19},{id_producto:8,modelo:'Modelo igual',cantidad:4}],distribuciones};
  const antes=JSON.stringify(orden),r=consolidarOrden(orden);
  assert.deepEqual(r.productos.map(p=>[p.id_producto,p.cantidad]),[[7,19],[8,4]]);
  assert.equal(JSON.stringify(orden),antes);
  const entrega=simularEntrega(orden,[10,1]);assert.equal(entrega.recibido,11);assert.equal(entrega.pendiente,12);
  assert.throws(()=>consolidarOrden({...orden,total:22}),/total/);
  assert.throws(()=>consolidarOrden({...orden,distribuciones:[{...distribuciones[0],cantidad:24}]}),/distribuci/);
  assert.throws(()=>consolidarOrden({total:1,productos:[{modelo:'Sin ID',cantidad:1}]}),/identificador/);
  assert.throws(()=>consolidarOrden({id_proveedor:1,total:1,productos:[{id_producto:1,id_proveedor:2,modelo:'Otro proveedor',cantidad:1}]}),/proveedores/);
  assert.equal(consolidarOrden({total:2,productos:[{id_producto:7,modelo:'Otro pedido',cantidad:2}]}).productos[0].cantidad,2,'No mezcla llamadas de ordenes diferentes');
});
