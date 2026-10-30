import { createHash, randomUUID } from 'node:crypto';
import { pool } from '../config/db.js';
import { contratoService } from './contratoService.js';
import { siguienteCodigoMasivo } from './serieOrdenMasivaService.js';

const fail = (message, status = 400) => Object.assign(new Error(message), { status });
const entero = n => Number.isInteger(n) && n > 0 && n <= 2147483647;
const hash = value => createHash('sha256').update(JSON.stringify(value)).digest('hex');
const patron = value => `%${value.replace(/[=%_]/g, c => `=${c}`)}%`;
function filtro(q, pagina) {
  if (typeof q !== 'string' || q.length > 200 || !Number.isInteger(pagina) || pagina < 1 || pagina > 1000000) throw fail('Búsqueda inválida.');
  return patron(q.trim().toLowerCase());
}
function seleccion(ids, proveedor) {
  if (!entero(proveedor) || !Array.isArray(ids) || !ids.length || ids.length > 500 || ids.some(id => !entero(id)) || new Set(ids).size !== ids.length) throw fail('Selecciona entre 1 y 500 órdenes completas sin repetir, de un mismo proveedor.');
  return [...ids].sort((a,b) => a-b);
}
const contenido = row => typeof row.contenido_json === 'string' ? JSON.parse(row.contenido_json) : row.contenido_json;
function resumen(row) {
  const data = contenido(row);
  return { id_solicitud: row.id_solicitud, id_proveedor: row.id_proveedor ?? data.id_proveedor, codigo: row.codigo, proveedor: data.proveedor, fecha: data.fecha, estado: row.estado, total: data.total, modelos: data.productos.length, cantidad_ordenes: data.ordenes.length,
    colegios: new Set(data.distribuciones.map(d=>d.id_contrato)).size };
}

async function construir(conn, ids, proveedor, bloquear = false, validarProveedor = true) {
  const [ordenes] = await conn.query(`SELECT o.id_orden,o.codigo,o.id_proveedor,o.estado,
    DATE_FORMAT(o.fecha_emision,'%d/%m/%Y') AS fecha,p.razon_social,p.estado AS estado_proveedor
    FROM ordenes_compra o JOIN proveedores p ON p.id_proveedor=o.id_proveedor
    WHERE o.id_orden IN (?) ORDER BY o.id_orden ${bloquear ? 'FOR UPDATE' : ''}`, [ids]);
  if (ordenes.length !== ids.length) throw fail('Una de las órdenes seleccionadas no existe.',404);
  if (ordenes.some(o => o.id_proveedor !== proveedor)) throw fail('No se pueden mezclar proveedores.');
  if (ordenes.some(o => o.estado === 'Cancelada' || (validarProveedor && o.estado_proveedor !== 'Activo'))) throw fail('Hay órdenes canceladas o un proveedor inactivo.',409);
  const [vinculos] = await conn.query('SELECT id_orden FROM solicitud_ordenes WHERE id_orden IN (?)', [ids]);
  if (vinculos.length) throw fail('Una de las órdenes ya fue incluida en una solicitud. Actualiza los pendientes.',409);
  const [lineas] = await conn.query(`SELECT od.id_orden,od.id_orden_detalle,od.cantidad_pedida,
    COALESCE(SUM(d.cantidad_asignada),0) AS asignada
    FROM orden_detalles od LEFT JOIN orden_distribuciones d ON d.id_orden_detalle=od.id_orden_detalle
    WHERE od.id_orden IN (?) GROUP BY od.id_orden,od.id_orden_detalle,od.cantidad_pedida`,[ids]);
  if (new Set(lineas.map(l=>l.id_orden)).size !== ids.length || lineas.some(l=>!entero(l.cantidad_pedida)||l.cantidad_pedida!==Number(l.asignada))) throw fail('Revisa las cantidades y distribuciones de las órdenes seleccionadas.',409);
  const [productos] = await conn.query(`SELECT p.id_producto,p.nombre AS modelo,p.tipo,p.categoria,p.nivel_educativo AS nivel,SUM(od.cantidad_pedida) AS cantidad
    FROM orden_detalles od JOIN productos p ON p.id_producto=od.id_producto WHERE od.id_orden IN (?)
    GROUP BY p.id_producto,p.nombre,p.tipo,p.categoria,p.nivel_educativo ORDER BY p.id_producto`,[ids]);
  const [distribuciones] = await conn.query(`SELECT cr.id_contrato,cr.id_contrato_api,cr.cliente_colegio AS colegio,
    p.id_producto,p.nombre AS modelo,p.tipo,p.categoria,p.nivel_educativo AS nivel,SUM(d.cantidad_asignada) AS cantidad
    FROM orden_distribuciones d JOIN orden_detalles od ON od.id_orden_detalle=d.id_orden_detalle
    JOIN productos p ON p.id_producto=od.id_producto
    JOIN contrato_detalles cd ON cd.id_detalle_contrato=d.id_detalle_contrato
    JOIN contratos_referencia cr ON cr.id_contrato=cd.id_contrato
    WHERE od.id_orden IN (?) GROUP BY cr.id_contrato,cr.id_contrato_api,cr.cliente_colegio,p.id_producto,p.nombre,p.tipo,p.categoria,p.nivel_educativo
    ORDER BY cr.id_contrato,p.id_producto`,[ids]);
  const cantidades = productos.map(p=>({...p,cantidad:Number(p.cantidad)}));
  // Los registros antiguos pueden contener el cliente en cliente_colegio.
  // Verificar por contrato sin reescribir referencias ni documentos históricos.
  const nombres = new Map();
  for (const d of distribuciones) {
    if (nombres.has(d.id_contrato)) continue;
    if (!entero(d.id_contrato_api)) throw fail('No se pudo verificar el colegio de un pedido histórico. Revisa su referencia antes de generar la orden.',409);
    const contrato = await contratoService.obtenerPorId(String(d.id_contrato_api));
    if (typeof contrato.colegio !== 'string' || !contrato.colegio.trim()) throw fail(`El contrato ${d.id_contrato_api} no tiene colegio registrado. No se puede generar la orden.`,409);
    nombres.set(d.id_contrato,contrato.colegio);
  }
  const total = cantidades.reduce((s,p)=>s+p.cantidad,0);
  if (!Number.isSafeInteger(total) || total<=0) throw fail('El total de la solicitud no es válido.');
  return { id_proveedor:proveedor, proveedor:ordenes[0].razon_social,
    ordenes:ordenes.map(o=>({id_orden:o.id_orden,codigo:o.codigo,fecha:o.fecha})),
    productos:cantidades, distribuciones:distribuciones.map(d=>({...d,colegio:nombres.get(d.id_contrato),cantidad:Number(d.cantidad)})), total };
}

export const solicitudCotizacionService = {
  async vistaPendientes({id_orden,id_proveedor}={}) {
    if ((id_orden == null) === (id_proveedor == null) || !entero(id_orden ?? id_proveedor)) throw fail('Pedido o proveedor inválido.');
    const conn=await pool.getConnection();
    try {
      await conn.query('SET TRANSACTION ISOLATION LEVEL REPEATABLE READ');
      await conn.query('START TRANSACTION WITH CONSISTENT SNAPSHOT, READ ONLY');
      const [ordenes]=await conn.query(`SELECT o.id_orden,o.id_proveedor FROM ordenes_compra o
        WHERE ${id_orden != null ? 'o.id_orden' : 'o.id_proveedor'}=? AND o.estado<>'Cancelada'
        AND NOT EXISTS (SELECT 1 FROM solicitud_ordenes s WHERE s.id_orden=o.id_orden) ORDER BY o.id_orden`,[id_orden ?? id_proveedor]);
      if (!ordenes.length) throw fail('No hay pedidos pendientes disponibles para esta consulta.',404);
      const data=await construir(conn,ordenes.map(o=>o.id_orden),ordenes[0].id_proveedor,false,false);
      await conn.commit();
      return data;
    } catch(error){await conn.rollback();throw error;}finally{conn.release();}
  },
  async pendientes(q='',pagina=1) {
    const like=filtro(q,pagina);
    const where=`o.estado<>'Cancelada' AND NOT EXISTS (SELECT 1 FROM solicitud_ordenes s WHERE s.id_orden=o.id_orden)
      AND (CONVERT(o.codigo USING utf8mb4) COLLATE utf8mb4_unicode_ci LIKE ? ESCAPE '='
        OR CONVERT(p.razon_social USING utf8mb4) COLLATE utf8mb4_unicode_ci LIKE ? ESCAPE '=')`;
    const [proveedores]=await pool.query(`SELECT DISTINCT p.id_proveedor,p.razon_social FROM ordenes_compra o
      JOIN proveedores p ON p.id_proveedor=o.id_proveedor WHERE ${where} ORDER BY p.razon_social,p.id_proveedor LIMIT 11 OFFSET ?`,[like,like,(pagina-1)*10]);
    const visibles=proveedores.slice(0,10);
    if (!visibles.length) return {proveedores:[],pagina,hayMas:false};
    const [ordenes]=await pool.query(`SELECT o.id_orden,o.codigo,o.id_proveedor,DATE_FORMAT(o.fecha_emision,'%d/%m/%Y') AS fecha,
      (SELECT COALESCE(SUM(od.cantidad_pedida),0) FROM orden_detalles od WHERE od.id_orden=o.id_orden) AS total
      FROM ordenes_compra o JOIN proveedores p ON p.id_proveedor=o.id_proveedor
      WHERE ${where} AND p.id_proveedor IN (?) ORDER BY o.id_orden`,[like,like,visibles.map(p=>p.id_proveedor)]);
    if(!ordenes.length)return {proveedores:[],pagina,hayMas:proveedores.length>10};
    const [colegios]=await pool.query(`SELECT DISTINCT od.id_orden,cd.id_contrato FROM orden_detalles od
      JOIN orden_distribuciones d ON d.id_orden_detalle=od.id_orden_detalle
      JOIN contrato_detalles cd ON cd.id_detalle_contrato=d.id_detalle_contrato WHERE od.id_orden IN (?)`,[ordenes.map(o=>o.id_orden)]);
    return {proveedores:visibles.map(p=>{
      const pedidos=ordenes.filter(o=>o.id_proveedor===p.id_proveedor).map(o=>({...o,total:Number(o.total),colegios:colegios.filter(c=>c.id_orden===o.id_orden).map(c=>c.id_contrato)}));
      return {...p,ordenes:pedidos,total:pedidos.reduce((s,o)=>s+o.total,0),colegios:new Set(pedidos.flatMap(o=>o.colegios)).size};
    }).filter(p=>p.ordenes.length),pagina,hayMas:proveedores.length>10};
  },
  async revisar(ids,proveedor) {
    ids=seleccion(ids,proveedor);
    const conn=await pool.getConnection();
    try {await conn.query('SET TRANSACTION ISOLATION LEVEL REPEATABLE READ');await conn.query('START TRANSACTION WITH CONSISTENT SNAPSHOT, READ ONLY');
      const data=await construir(conn,ids,proveedor);await conn.commit();return {...data,huella:hash(data)};
    } catch(error){await conn.rollback();throw error;}finally{conn.release();}
  },
  async confirmar({ordenes:entrada,id_proveedor,clave_operacion,huella}={}) {
    const ids=seleccion(entrada,id_proveedor);
    if(typeof clave_operacion!=='string'||!/^[a-f0-9]{8}-(?:[a-f0-9]{4}-){3}[a-f0-9]{12}$/.test(clave_operacion)||typeof huella!=='string'||!/^[a-f0-9]{64}$/.test(huella))throw fail('Prepara la solicitud antes de confirmar.');
    const conn=await pool.getConnection();let locked=false,codigoLocked=false;
    try {
      const [[lock]]=await conn.query("SELECT GET_LOCK(?,15) AS adquirido",[`ishume_solicitud_${clave_operacion}`]);
      if(lock.adquirido!==1)throw fail('La solicitud está procesándose. Reintenta con la misma revisión.',409);locked=true;
      const [[existente]]=await conn.query('SELECT * FROM solicitudes_cotizacion WHERE clave_operacion=?',[clave_operacion]);
      if(existente){const data=contenido(existente);if(existente.huella!==huella||data.id_proveedor!==id_proveedor||JSON.stringify(data.ordenes.map(o=>o.id_orden))!==JSON.stringify(ids))throw fail('Esta operación ya corresponde a otra selección.',409);return {...resumen(existente),repetida:true};}
      const [[codigoLock]]=await conn.query("SELECT GET_LOCK('ishume_codigo_orden_masiva',15) AS adquirido");
      if(codigoLock.adquirido!==1)throw fail('Hay otra orden masiva en proceso. Reintenta con esta revisión.',409);
      codigoLocked=true;
      await conn.beginTransaction();
      const data=await construir(conn,ids,id_proveedor,true);
      if(hash(data)!==huella)throw fail('Las órdenes cambiaron. Revisa la selección nuevamente.',409);
      const [[fecha]]=await conn.query("SELECT DATE_FORMAT(CONVERT_TZ(UTC_TIMESTAMP(),'+00:00','-05:00'),'%d/%m/%Y') AS fecha");
      const codigo=await siguienteCodigoMasivo(conn,id_proveedor,data.proveedor);
      const [insert]=await conn.query(`INSERT INTO solicitudes_cotizacion (codigo,id_proveedor,fecha_emision,clave_operacion,huella,contenido_json)
        VALUES (?,?,DATE(CONVERT_TZ(UTC_TIMESTAMP(),'+00:00','-05:00')),?,?,?)`,[`TMP-${randomUUID().replaceAll('-','').slice(0,24)}`,id_proveedor,clave_operacion,huella,'{}']);
      const documento={...data,codigo,fecha:fecha.fecha,version_documento:4};
      await conn.query('UPDATE solicitudes_cotizacion SET codigo=?,contenido_json=? WHERE id_solicitud=?',[codigo,JSON.stringify(documento),insert.insertId]);
      for(const id of ids)await conn.query('INSERT INTO solicitud_ordenes (id_solicitud,id_orden) VALUES (?,?)',[insert.insertId,id]);
      await conn.commit();
      return {...resumen({id_solicitud:insert.insertId,codigo,estado:'Generada',contenido_json:JSON.stringify(documento)}),repetida:false};
    }catch(error){await conn.rollback();if(error.code==='ER_BAD_FIELD_ERROR'&&/ultimo_orden_masiva|prefijo_orden_masiva/.test(error.message))throw fail('Falta aplicar migrations/004_series_ordenes_masivas.sql en MySQL Workbench.',503);if(error.code==='ER_DUP_ENTRY'&&error.message.includes('uq_proveedor_prefijo_masivo'))throw fail('El prefijo de este proveedor ya pertenece a otro proveedor. Revisa su configuracion.',409);if(error.code==='ER_DUP_ENTRY')throw fail('Una orden ya pertenece a otra solicitud. Actualiza los pendientes.',409);throw error;}
    finally{try{try{if(codigoLocked)await conn.query("SELECT RELEASE_LOCK('ishume_codigo_orden_masiva')");}finally{if(locked)await conn.query('SELECT RELEASE_LOCK(?)',[`ishume_solicitud_${clave_operacion}`]);}}finally{conn.release();}}
  },
  async realizadas(q='',pagina=1) {
    const like=filtro(q,pagina);
    const [rows]=await pool.query(`SELECT s.* FROM solicitudes_cotizacion s JOIN proveedores p ON p.id_proveedor=s.id_proveedor
      WHERE CONVERT(s.codigo USING utf8mb4) COLLATE utf8mb4_unicode_ci LIKE ? ESCAPE '='
      OR CONVERT(p.razon_social USING utf8mb4) COLLATE utf8mb4_unicode_ci LIKE ? ESCAPE '='
      OR CONVERT(JSON_UNQUOTE(JSON_EXTRACT(s.contenido_json,'$.proveedor')) USING utf8mb4) COLLATE utf8mb4_unicode_ci LIKE ? ESCAPE '='
      ORDER BY s.id_solicitud DESC LIMIT 21 OFFSET ?`,[like,like,like,(pagina-1)*20]);
    return {solicitudes:rows.slice(0,20).map(resumen),pagina,hayMas:rows.length>20};
  },
  async obtener(id) {
    if(!entero(id))throw fail('ID de solicitud inválido.');
    const [[row]]=await pool.query('SELECT * FROM solicitudes_cotizacion WHERE id_solicitud=?',[id]);
    if(!row)throw fail('Solicitud no encontrada.',404);
    const data=contenido(row);
    return {...data,id_solicitud:row.id_solicitud,estado:row.estado,modelos:data.productos.length};
  },
};
