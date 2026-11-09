import {test} from 'node:test';
import assert from 'node:assert/strict';
import {siguienteCodigoMasivo} from '../src/services/serieOrdenMasivaService.js';

test('series masivas: por ID, bloqueo, más de 999 y conservación tras eliminar una orden',async()=>{
  const series=new Map([[42,{prefijo:'JOS',numero:'3'}],[73,{prefijo:'LAL',numero:'1'}],[84,{prefijo:'LIB',numero:'999'}]]);
  let cola=Promise.resolve();
  async function generar(id,nombre){let liberar;
    const conn={async query(sql,args){
      if(sql.startsWith('INSERT IGNORE'))return [{}];
      if(sql.startsWith('SELECT')){assert.match(sql,/FOR UPDATE/);const anterior=cola;cola=new Promise(r=>{liberar=r;});await anterior;return [[{...series.get(args[0])}]];}
      if(sql.startsWith('UPDATE')){series.get(args[2]).numero=args[0];return [{}];}
      throw Error(sql);
    }};
    try{return await siguienteCodigoMasivo(conn,id,nombre);}finally{liberar?.();}
  }
  assert.equal(await generar(42,'Joselito'),'ORDEN-MAS-JOS-004');
  assert.equal(await generar(73,'LALO'),'ORDEN-MAS-LAL-002');
  assert.equal(await generar(42,'Cambio de nombre'),'ORDEN-MAS-JOS-005','El ID conserva su prefijo');
  assert.equal(await generar(84,'LíderBook'),'ORDEN-MAS-LIB-1000');
  const ordenes=await Promise.all([generar(42,'Joselito'),generar(42,'Joselito')]);
  assert.deepEqual(ordenes,['ORDEN-MAS-JOS-006','ORDEN-MAS-JOS-007']);
  ordenes.pop(); // Eliminar/cancelar una orden no modifica la fila de secuencia persistente.
  assert.equal(await generar(42,'Joselito'),'ORDEN-MAS-JOS-008');
});

test('primera orden: prefijo por proveedor y contador revertible en la transaccion',async()=>{
  const proveedores=new Map([[1,{prefijo:null,numero:'0'}],[2,{prefijo:null,numero:'0'}],[3,{prefijo:null,numero:'0'}]]);
  const generar=async(id,nombre,confirmar=true)=>{
    const copia=structuredClone(proveedores);
    const conn={async query(sql,args){
      if(sql.startsWith('SELECT')){assert.match(sql,/FROM proveedores.*FOR UPDATE/);return [[copia.get(args[0])]];}
      if(sql.startsWith('UPDATE')){assert.match(sql,/UPDATE proveedores/);copia.set(args[2],{numero:args[0],prefijo:args[1]});return [{affectedRows:1}];}
      throw Error(sql);
    }};
    const codigo=await siguienteCodigoMasivo(conn,id,nombre);
    if(confirmar)for(const [clave,valor] of copia)proveedores.set(clave,valor);
    return codigo;
  };
  assert.equal(await generar(1,'Joselito',false),'ORDEN-MAS-JOS-001');
  assert.equal(proveedores.get(1).numero,'0','Rollback no consume correlativo');
  assert.equal(await generar(1,'Joselito'),'ORDEN-MAS-JOS-001');
  assert.equal(await generar(2,'LALO'),'ORDEN-MAS-LAL-001');
  assert.equal(await generar(3,'L\u00edderBook'),'ORDEN-MAS-LIB-001');
  assert.equal(await generar(1,'Joselito'),'ORDEN-MAS-JOS-002');
});
