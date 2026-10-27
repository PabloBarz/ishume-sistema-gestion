import {test} from 'node:test';
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {once} from 'node:events';
import express from 'express';
import {pool} from '../src/config/db.js';
import {solicitudCotizacionService as service} from '../src/services/solicitudCotizacionService.js';
import router from '../src/routes/compraMasivaRouter.js';
import {contratoService} from '../src/services/contratoService.js';

test('rechaza selecciones vacías, repetidas o inválidas antes de escribir',async()=>{
  for(const ids of [[],[1,1],[0],['1']])await assert.rejects(service.revisar(ids,1));
  await assert.rejects(service.confirmar({ordenes:[1],id_proveedor:1}));
});

test('MySQL: consolidación, selección parcial, PDF, historial y restricciones sin datos permanentes',{skip:process.env.TEST_MYSQL!=='1'},async()=>{
  const getConnection=pool.getConnection.bind(pool);
  const query=pool.query.bind(pool);
  const conn=await getConnection();
  const obtenerContrato=contratoService.obtenerPorId;
  const nombres=new Map();
  contratoService.obtenerPorId=async id=>({id_contrato:Number(id),colegio:nombres.get(Number(id)),cliente:'Responsable diferente'});
  const [[before]]=await conn.query('SELECT COUNT(*) n FROM solicitudes_cotizacion');
  const [[ordersBefore]]=await conn.query('SELECT COUNT(*) n FROM ordenes_compra');
  const [[suppliersBefore]]=await conn.query('SELECT COUNT(*) n FROM proveedores');
  await conn.beginTransaction();
  let savepoint=0;
  let forceFailure=false;
  // Todas las escrituras, incluidas las del servicio, permanecen dentro de esta transacción.
  // Los commits internos no se persisten y los errores revierten solo su llamada.
  pool.getConnection=async()=>{
    const name=`prueba_${++savepoint}`;await conn.query(`SAVEPOINT ${name}`);
    return {query:async(sql,args)=>{
      if(sql.startsWith('SET TRANSACTION')||sql.startsWith('START TRANSACTION'))return [[],[]];
      if(forceFailure&&sql.startsWith('INSERT INTO solicitud_ordenes'))throw new Error('Fallo de vínculo simulado');
      return conn.query(sql,args);
    },beginTransaction:async()=>{},commit:async()=>{},rollback:()=>conn.query(`ROLLBACK TO SAVEPOINT ${name}`),release:()=>{}};
  };
  pool.query=(...args)=>conn.query(...args);
  let server;
  try{
    const [proveedores]=await conn.query("SELECT id_proveedor,razon_social FROM proveedores WHERE estado='Activo' ORDER BY id_proveedor");
    assert.ok(proveedores.length>=2,'Se requieren dos proveedores activos para la prueba');
    const marca=randomUUID().slice(0,8);
    const [fixtureProveedor]=await conn.query('INSERT INTO proveedores (razon_social) VALUES (?)',[`Proveedor LíderBook prueba ${marca}`]);
    const elegido={id_proveedor:fixtureProveedor.insertId,razon_social:`Proveedor LíderBook prueba ${marca}`};
    const proveedor=elegido.id_proveedor,otro=proveedores[0].id_proveedor;
    const [p]=await conn.query('INSERT INTO productos (nombre,categoria,tipo,nivel_educativo) VALUES (?,?,?,?)',[`Modelo prueba ${marca}`,'Cuadro','Reflex','Inicial']);
    const apiBase=1000000000+Math.floor(Math.random()*100000000);
    nombres.set(apiBase,`Colegio A ${marca}`);nombres.set(apiBase+1,`Colegio B ${marca}`);
    const [c1]=await conn.query("INSERT INTO contratos_referencia (origen,id_contrato_api,cliente_colegio) VALUES ('API',?,?)",[apiBase,'Cliente antiguo A']);
    const [c2]=await conn.query("INSERT INTO contratos_referencia (origen,id_contrato_api,cliente_colegio) VALUES ('API',?,?)",[apiBase+1,'Cliente antiguo B']);
    const [d1]=await conn.query('INSERT INTO contrato_detalles (id_contrato,id_producto,cantidad_requerida) VALUES (?,?,?)',[c1.insertId,p.insertId,10]);
    const [d2]=await conn.query('INSERT INTO contrato_detalles (id_contrato,id_producto,cantidad_requerida) VALUES (?,?,?)',[c2.insertId,p.insertId,20]);
    async function orden(suf,prov,cantidad,detalle){
      const [o]=await conn.query("INSERT INTO ordenes_compra (codigo,id_proveedor,fecha_emision) VALUES (?,?,CURRENT_DATE)",[`TEST-${marca}-${suf}`,prov]);
      const [l]=await conn.query('INSERT INTO orden_detalles (id_orden,id_producto,cantidad_pedida) VALUES (?,?,?)',[o.insertId,p.insertId,cantidad]);
      await conn.query('INSERT INTO orden_distribuciones (id_orden_detalle,id_detalle_contrato,cantidad_asignada) VALUES (?,?,?)',[l.insertId,detalle,cantidad]);
      return o.insertId;
    }
    const a=await orden('A',proveedor,10,d1.insertId);
    const b=await orden('B',proveedor,20,d2.insertId);
    const c=await orden('C',proveedor,4,d1.insertId);
    const otroId=await orden('D',otro,3,d1.insertId);
    const pendientes=await service.pendientes(marca);
    const grupo=pendientes.proveedores.find(v=>v.id_proveedor===proveedor);
    assert.equal(grupo.ordenes.length,3);assert.equal(grupo.colegios,2);assert.equal(grupo.total,34);
    const individual=await service.vistaPendientes({id_orden:a});
    assert.equal(individual.total,10);assert.equal(individual.ordenes.length,1);
    assert.equal(individual.distribuciones[0].colegio,`Colegio A ${marca}`);
    const general=await service.vistaPendientes({id_proveedor:proveedor});
    assert.equal(general.ordenes.length,3);assert.equal(general.total,34);
    assert.equal(general.productos[0].cantidad,34);assert.equal(general.distribuciones.length,2);
    assert.equal(general.distribuciones.find(d=>d.id_contrato===c1.insertId).cantidad,14);
    const sinTildes=elegido.razon_social.normalize('NFD').replace(/[\u0300-\u036f]/g,'').toUpperCase();
    assert.ok((await service.pendientes(sinTildes)).proveedores.some(p=>p.id_proveedor===proveedor));
    await assert.rejects(service.revisar([a,otroId],proveedor),/mezclar/);
    nombres.delete(apiBase);
    await assert.rejects(service.revisar([b,a],proveedor),/colegio registrado/);
    nombres.set(apiBase,`Colegio A ${marca}`);
    const plan=await service.revisar([b,a],proveedor);
    assert.equal(plan.distribuciones[0].colegio,`Colegio A ${marca}`);
    const [buscadas]=[await service.pendientes(marca.toUpperCase())];
    assert.equal(buscadas.proveedores.find(v=>v.id_proveedor===proveedor).ordenes.length,3);
    assert.equal(plan.total,30);assert.equal(plan.productos.length,1);assert.equal(plan.productos[0].cantidad,30);
    assert.equal(plan.distribuciones.length,2);
    assert.equal(plan.productos[0].tipo,'Reflex');assert.equal(plan.productos[0].nivel,'Inicial');
    assert.equal(plan.distribuciones[0].tipo,'Reflex');assert.equal(plan.distribuciones[0].nivel,'Inicial');
    const payload={ordenes:[b,a],id_proveedor:proveedor,huella:plan.huella,clave_operacion:randomUUID()};
    forceFailure=true;await assert.rejects(service.confirmar(payload),/simulado/);forceFailure=false;
    assert.equal((await conn.query('SELECT COUNT(*) n FROM solicitudes_cotizacion'))[0][0].n,before.n);
    const creada=await service.confirmar(payload);
    assert.match(creada.codigo,/^OC-MAS-[0-9]{6,}$/);
    assert.equal((await conn.query('SELECT COUNT(*) n FROM ordenes_compra WHERE codigo=?',[creada.codigo]))[0][0].n,0);
    assert.equal(creada.estado,'Generada');assert.equal(creada.total,30);assert.equal(creada.cantidad_ordenes,2);
    const repetida=await service.confirmar(payload);
    assert.equal(repetida.id_solicitud,creada.id_solicitud);assert.equal(repetida.repetida,true);
    await assert.rejects(service.confirmar({...payload,ordenes:[c]}),/otra selección/);
    await assert.rejects(service.confirmar({...payload,clave_operacion:randomUUID()}),/ya fue incluida/);
    await assert.rejects(conn.query('INSERT INTO solicitud_ordenes (id_solicitud,id_orden) VALUES (?,?)',[creada.id_solicitud,a]),e=>e.code==='ER_DUP_ENTRY');
    const restantes=await service.pendientes(marca);
    assert.deepEqual(restantes.proveedores.find(v=>v.id_proveedor===proveedor).ordenes.map(o=>o.id_orden),[c]);
    const historial=await service.realizadas(creada.codigo);
    assert.equal(historial.solicitudes.length,1);assert.equal(historial.solicitudes[0].total,30);
    assert.equal(historial.solicitudes[0].id_proveedor,proveedor,'Identificador del proveedor para agrupar visualmente');
    const guardada=await service.obtener(creada.id_solicitud);
    assert.equal(guardada.version_documento,4);
    await assert.rejects(service.vistaPendientes({id_orden:a}),e=>e.status===404);
    assert.equal((await service.vistaPendientes({id_proveedor:proveedor})).total,4,'La vista general incluye solamente pendientes');
    await conn.query('UPDATE productos SET nombre=? WHERE id_producto=?',[`Nombre posterior ${marca}`,p.insertId]);
    assert.equal((await service.obtener(creada.id_solicitud)).productos[0].modelo,guardada.productos[0].modelo,'Instantánea documental estable');
    const [[original]]=await conn.query('SELECT COUNT(*) n FROM ordenes_compra WHERE id_orden IN (?) AND estado=\'Borrador\'',[[a,b,c,otroId]]);
    assert.equal(original.n,4,'No cambia estados ni elimina órdenes originales');
    const app=express();app.use(express.json());app.use('/api/compras-masivas',router);
    server=app.listen(0,'127.0.0.1');await once(server,'listening');
    const base=`http://127.0.0.1:${server.address().port}/api/compras-masivas`;
    const detalle=await fetch(`${base}/pendientes/${c}/detalle`);
    assert.equal(detalle.status,200);assert.equal((await detalle.json()).data.total,4);
    const totalProveedor=await fetch(`${base}/pendientes/proveedor/${proveedor}/detalle?q=ignorado`);
    assert.equal((await totalProveedor.json()).data.total,4);
    assert.equal((await fetch(`${base}/pendientes/0/detalle`)).status,400);
    for(const vista of ['', '?vista=1']){
      const pdf=await fetch(`${base}/solicitudes/${creada.id_solicitud}/pdf${vista}`);
      assert.equal(pdf.status,200);assert.match(pdf.headers.get('content-disposition'),vista?/^inline/:/^attachment/);
      assert.ok(pdf.headers.get('content-disposition').includes(`${creada.codigo}_`));
      assert.ok(pdf.headers.get('content-disposition').includes(`${creada.codigo}_${elegido.razon_social.normalize('NFD').replace(/[\u0300-\u036f]/g,'').replace(/[^a-zA-Z0-9_-]+/g,'_')}.pdf`));
      assert.equal(Buffer.from(await pdf.arrayBuffer()).subarray(0,5).toString(),'%PDF-');
    }
    assert.equal((await service.obtener(creada.id_solicitud)).estado,'Generada','PDF no marca enviada');
    const [[fk]]=await conn.query("SELECT COUNT(*) n FROM information_schema.KEY_COLUMN_USAGE WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME IN ('solicitudes_cotizacion','solicitud_ordenes') AND REFERENCED_TABLE_NAME IS NOT NULL");
    assert.equal(fk.n,3);
    // Paginación real por proveedor sin traer todos los pendientes al navegador.
    for(let i=0;i<9;i++){
      const [prov]=await conn.query('INSERT INTO proveedores (razon_social) VALUES (?)',[`Proveedor paginado ${marca} ${i}`]);
      await orden(`P${i}`,prov.insertId,1,d1.insertId);
    }
    const pagina1=await service.pendientes(marca,1),pagina2=await service.pendientes(marca,2);
    assert.equal(pagina1.proveedores.length,10);assert.equal(pagina1.hayMas,true);
    assert.equal(pagina2.proveedores.length,1);assert.equal(pagina2.hayMas,false);
    assert.equal(new Set([...pagina1.proveedores,...pagina2.proveedores].map(p=>p.id_proveedor)).size,11);
    // Historial paginado: documentos históricos y nuevos conservan identidad y totales.
    for(let i=0;i<21;i++){
      const codigo=`SC-HIS-${marca}-${i}`;
      const documento={...guardada,codigo,version_documento:undefined};
      await conn.query(`INSERT INTO solicitudes_cotizacion (codigo,id_proveedor,fecha_emision,clave_operacion,huella,contenido_json)
        VALUES (?,?,CURRENT_DATE,?,?,?)`,[codigo,proveedor,randomUUID(),'0'.repeat(64),JSON.stringify(documento)]);
    }
    const historial1=await service.realizadas(marca,1),historial2=await service.realizadas(marca,2);
    assert.equal(historial1.solicitudes.length,20);assert.equal(historial1.hayMas,true);
    assert.equal(historial2.solicitudes.length,2);assert.equal(historial2.hayMas,false);
    const documentos=[...historial1.solicitudes,...historial2.solicitudes];
    assert.equal(new Set(documentos.map(d=>d.id_solicitud)).size,22);
    assert.ok(documentos.every(d=>d.id_proveedor===proveedor&&d.total===30&&d.estado==='Generada'));
    assert.equal((await service.realizadas(`SC-HIS-${marca}-20`)).solicitudes.length,1);
  }finally{
    server?.closeAllConnections();if(server)await new Promise(r=>server.close(r));
    await conn.rollback();pool.getConnection=getConnection;pool.query=query;contratoService.obtenerPorId=obtenerContrato;
    assert.equal((await conn.query('SELECT COUNT(*) n FROM solicitudes_cotizacion'))[0][0].n,before.n);
    assert.equal((await conn.query('SELECT COUNT(*) n FROM ordenes_compra'))[0][0].n,ordersBefore.n);
    assert.equal((await conn.query('SELECT COUNT(*) n FROM proveedores'))[0][0].n,suppliersBefore.n);
    conn.release();
  }
});

test.after(async()=>{await pool.end();});
