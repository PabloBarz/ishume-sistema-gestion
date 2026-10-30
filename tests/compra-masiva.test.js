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

test('códigos por proveedor: independientes, concurrentes, reintentables y sin escrituras reales', async () => {
  const originales = { conexion: pool.getConnection, contrato: contratoService.obtenerPorId, proveedores: proveedorService.listarActivos };
  const catalogo = [{id_proveedor:42,razon_social:'LALO'},{id_proveedor:73,razon_social:'Joselito'},{id_proveedor:84,razon_social:'LíderBook'}];
  let registros = [
    {id_orden:101,id_proveedor:42,codigo:'OC-LAL-0008'},
    {id_orden:102,id_proveedor:73,codigo:'OC-JOS-0007'},
    {id_orden:103,id_proveedor:84,codigo:'OC-LIB-0006'},
    {id_orden:104,id_proveedor:73,codigo:'OC-MAS-999999'},
  ];
  const historicos=structuredClone(registros);
  let siguienteId=9000, cola=Promise.resolve(), fallar=false;
  proveedorService.listarActivos=async()=>catalogo;
  contratoService.obtenerPorId=async id=>({id_contrato:Number(id),colegio:'Colegio de prueba',cliente:'Cliente',fecha_entrega:null,
    productos:[{id_modelo:100,modelo:'Modelo',categoria:'Cuadro',cantidad:1}]});
  // Simula transacciones y el bloqueo compartido de MySQL, incluso entre conexiones.
  pool.getConnection=async()=>{
    let liberar, transaccion=null, bloqueado=false;
    const filas=()=>transaccion??registros;
    return {
      async query(sql,args=[]) {
        if(sql.includes("GET_LOCK('ishume_compra_masiva'")) {
          const anterior=cola;cola=new Promise(r=>{liberar=r;});await anterior;bloqueado=true;
          return [[{adquirido:1}]];
        }
        if(sql.includes('RELEASE_LOCK')){bloqueado=false;liberar();return [[{}]];}
        if(sql.includes('WHERE observaciones = ?')) return [filas().filter(o=>o.observaciones===args[0])];
        if(sql.includes('AS modelos')) return [filas().filter(o=>args[0].includes(o.id_orden)).map(o=>({...o,proveedor:catalogo.find(p=>p.id_proveedor===o.id_proveedor).razon_social,total:1,modelos:1}))];
        if(sql.includes('FOR UPDATE')) {assert.ok(bloqueado&&transaccion);return [catalogo.filter(p=>args[0].includes(p.id_proveedor))];}
        if(sql.includes('SUBSTRING_INDEX')) {
          assert.ok(bloqueado&&transaccion,'El máximo se lee dentro de la transacción y el bloqueo');
          assert.match(sql,/id_proveedor=\?/);assert.match(sql,/NOT LIKE 'OC-MAS-%'/);
          return [[{numero:Math.max(0,...filas().filter(o=>o.id_proveedor===args[0]&&/^OC-[A-Z0-9]+-[0-9]+$/.test(o.codigo)&&!o.codigo.startsWith('OC-MAS-')).map(o=>Number(o.codigo.split('-').at(-1))))}]];
        }
        if(sql.startsWith('SELECT id_orden FROM ordenes_compra WHERE codigo=')) return [filas().filter(o=>o.codigo===args[0])];
        if(sql.startsWith('INSERT INTO ordenes_compra')) {
          assert.ok(!filas().some(o=>o.codigo===args[0]),'Código único');
          const id_orden=++siguienteId;transaccion.push({id_orden,codigo:args[0],id_proveedor:args[1],observaciones:args[2],estado:'Borrador'});
          return [{insertId:id_orden}];
        }
        if(sql.startsWith('SELECT id_contrato FROM'))return [[{id_contrato:1}]];
        if(sql.startsWith('SELECT id_producto FROM'))return [[{id_producto:1}]];
        if(sql.startsWith('SELECT id_detalle_contrato FROM'))return [[{id_detalle_contrato:1}]];
        if(sql.startsWith('INSERT INTO orden_distribuciones')&&fallar){fallar=false;throw Error('Fallo simulado antes del commit');}
        if(sql.startsWith('INSERT INTO'))return [{insertId:1}];
        throw Error('Consulta no prevista: '+sql);
      },
      async beginTransaction(){transaccion=structuredClone(registros);},
      async commit(){registros=transaccion;transaccion=null;},
      async rollback(){transaccion=null;},
      release(){assert.equal(bloqueado,false,'Siempre libera el bloqueo');},
    };
  };
  const revisar=id=>compraMasivaService.revisar([{id_contrato:8,productos:[{id_modelo:100,cantidad:1,id_proveedor:id}]}]);
  const guardar=async id=>compraMasivaService.confirmar((await revisar(id)).token);
  try {
    assert.equal((await guardar(73)).ordenes[0].codigo,'OC-JOS-0008');
    for(const numero of ['0009','0010','0011']) assert.equal((await guardar(42)).ordenes[0].codigo,'OC-LAL-'+numero);
    assert.equal((await guardar(73)).ordenes[0].codigo,'OC-JOS-0009');
    assert.equal((await guardar(84)).ordenes[0].codigo,'OC-LIB-0007');
    const a=await revisar(73),b=await revisar(73);
    const simultaneas=await Promise.all([compraMasivaService.confirmar(a.token),compraMasivaService.confirmar(b.token)]);
    assert.deepEqual(simultaneas.map(r=>r.ordenes[0].codigo).sort(),['OC-JOS-0010','OC-JOS-0011']);
    const revision=await revisar(42),antes=registros.length;
    const doble=await Promise.all([compraMasivaService.confirmar(revision.token),compraMasivaService.confirmar(revision.token)]);
    assert.equal(registros.length,antes+1);assert.deepEqual(doble[0].ordenes,doble[1].ordenes);assert.equal(doble[1].repetida,true);
    const fallida=await revisar(84),previos=structuredClone(registros);fallar=true;
    await assert.rejects(compraMasivaService.confirmar(fallida.token),/Fallo simulado/);
    assert.deepEqual(registros,previos,'Rollback sin pedidos parciales');
    assert.equal((await compraMasivaService.confirmar(fallida.token)).ordenes[0].codigo,'OC-LIB-0008','Reintento tras fallo no consume correlativo visible');
    assert.deepEqual(registros.slice(0,historicos.length),historicos,'No renumera registros previos ni OC-MAS');
    assert.equal(new Set(registros.map(o=>o.codigo)).size,registros.length);
  } finally {
    pool.getConnection=originales.conexion;contratoService.obtenerPorId=originales.contrato;proveedorService.listarActivos=originales.proveedores;
  }
});

test.after(async () => { await pool.end(); });
