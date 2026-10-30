import { pool } from '../config/db.js';
import {createHash} from 'node:crypto';
import {fallo,esOrdenMasiva,importeCentimos,decimal,fechaValida,validarAbono,claveValida} from './pagoValidaciones.js';
import {validarContenidoArchivo,almacenarArchivo,borrarArchivo,comprobarArchivo} from './archivoPagoService.js';

const hash=p=>createHash('sha256').update(JSON.stringify(p)).digest('hex');
const idValido=id=>{if(!Number.isInteger(id)||id<1||id>2147483647)throw fallo('Orden inválida.');};
async function capacidad(conn=pool) {
  const [[r]]=await conn.query("SELECT COUNT(*) AS n FROM information_schema.COLUMNS WHERE TABLE_SCHEMA=DATABASE() AND ((TABLE_NAME='solicitudes_cotizacion' AND COLUMN_NAME IN ('archivo_clave','documento_revision','documento_operacion','documento_huella','importe_acordado','fecha_documento','archivo_nombre','archivo_mime')) OR (TABLE_NAME='pagos_proveedor' AND COLUMN_NAME IN ('id_solicitud','clave_operacion','huella')))");
  return Number(r?.n)===11;
}
async function exigirEsquema(){if(!await capacidad())throw fallo('Falta aplicar el esquema de Pagos en MySQL Workbench. No se guardó ningún dato.',503);}
async function cabecera(conn,id,bloquear=false) {
  idValido(id);
  const [[o]]=await conn.query("SELECT s.id_solicitud,s.id_proveedor,s.codigo,s.estado,p.razon_social AS proveedor,DATE_FORMAT(s.fecha_emision,'%d/%m/%Y') AS fecha,JSON_UNQUOTE(JSON_EXTRACT(s.contenido_json,'$.total')) AS unidades FROM solicitudes_cotizacion s JOIN proveedores p ON p.id_proveedor=s.id_proveedor WHERE s.id_solicitud=?"+(bloquear?' FOR UPDATE':''),[id]);
  if(!o||!esOrdenMasiva(o.codigo))throw fallo('Orden masiva no encontrada.',404);
  return {...o,unidades:Number(o.unidades)};
}
async function economia(conn,o) {
  const [[v]]=await conn.query("SELECT s.*,s.documento_revision AS version,DATE_FORMAT(s.fecha_documento,'%Y-%m-%d') AS fecha_documento FROM solicitudes_cotizacion s WHERE id_solicitud=? AND archivo_clave IS NOT NULL",[o.id_solicitud]);
  const [pagos]=await conn.query("SELECT a.id_pago AS id_abono,a.monto,DATE_FORMAT(a.fecha_pago,'%Y-%m-%d') AS fecha_pago,a.metodo_pago,a.numero_operacion FROM pagos_proveedor a WHERE a.id_solicitud=? ORDER BY a.fecha_pago,a.id_pago",[o.id_solicitud]);
  const total=v?importeCentimos(String(v.importe_acordado)):null;
  const pagado=pagos.reduce((s,a)=>s+importeCentimos(String(a.monto)),0);
  if(total!==null&&pagado>total)throw fallo('El historial tiene pagos superiores al importe. Requiere revisión.',409);
  return {...o,habilitado:true,documento:v?{version:v.version,fecha:v.fecha_documento,nombre:v.archivo_nombre,mime:v.archivo_mime,url:'/api/pagos/ordenes/'+o.id_solicitud+'/archivo?version='+v.version}:null,
    importe:total===null?null:decimal(total),abonado:total===null?null:decimal(pagado),saldo:total===null?null:decimal(total-pagado),
    estado_economico:total===null?'Sin documento':pagado===0?'Pendiente':pagado===total?'Pagado':'Parcial',
    porcentaje:total===null?null:Math.round(pagado*10000/total)/100,historial:pagos};
}
function mismoRegistro(r,id,huella){if(r.id_solicitud!==id||r.huella!==huella)throw fallo('La clave de operación corresponde a otros datos.',409);}
async function insertarAbono(conn,id,a,clave,huella) {
  await conn.query('INSERT INTO pagos_proveedor (id_solicitud,monto,fecha_pago,metodo_pago,numero_operacion,clave_operacion,huella) VALUES (?,?,?,?,?,?,?)',[id,decimal(a.monto),a.fecha,a.metodo,a.operacion,clave,huella]);
}
export const pagosService = {
  async listar({q='',pagina=1,estado='todos'}={}) {
    if(typeof q!=='string'||q.length>200||!Number.isInteger(pagina)||pagina<1||pagina>1000000)throw fallo('Búsqueda de pagos inválida.');
    if(estado!=='todos')throw fallo('Filtro no disponible.');
    const patron='%'+q.trim().normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase().replace(/[=%_]/g,c=>'='+c)+'%';
    const habilitado=await capacidad();
    const columnas=habilitado?',s.importe_acordado AS importe,COALESCE(a.pagado,0) AS abonado':'';
    const joins=habilitado?' LEFT JOIN (SELECT id_solicitud,SUM(monto) AS pagado FROM pagos_proveedor GROUP BY id_solicitud) a ON a.id_solicitud=s.id_solicitud ':'';
    const [rows]=await pool.query("SELECT s.id_solicitud,s.id_proveedor,s.codigo,p.razon_social AS proveedor,DATE_FORMAT(s.fecha_emision,'%d/%m/%Y') AS fecha,JSON_UNQUOTE(JSON_EXTRACT(s.contenido_json,'$.total')) AS unidades"+columnas+" FROM solicitudes_cotizacion s JOIN proveedores p ON p.id_proveedor=s.id_proveedor "+joins+" WHERE s.codigo REGEXP '^(OC-MAS-[0-9]+|ORDEN-MAS-[A-Z0-9]+-[0-9]+)$' AND (CONVERT(p.razon_social USING utf8mb4) COLLATE utf8mb4_unicode_ci LIKE ? ESCAPE '=' OR CONVERT(s.codigo USING utf8mb4) COLLATE utf8mb4_unicode_ci LIKE ? ESCAPE '=') ORDER BY s.id_solicitud DESC LIMIT 21 OFFSET ?",[patron,patron,(pagina-1)*20]);
    return {pagina,hayMas:rows.length>20,economia_disponible:habilitado,ordenes:rows.slice(0,20).map(o=>{
      const importe=o.importe==null?null:importeCentimos(String(o.importe));
      const abonado=importe===null?null:importeCentimos(String(o.abonado),true);
      return {...o,unidades:Number(o.unidades),importe:importe===null?null:decimal(importe),abonado:abonado===null?null:decimal(abonado),saldo:importe===null?null:decimal(importe-abonado),estado_economico:importe===null?(habilitado?'Sin documento':null):abonado===0?'Pendiente':abonado===importe?'Pagado':'Parcial'};
    })};
  },
  async obtener(id) {
    const o=await cabecera(pool,id);
    if(!await capacidad())return {...o,habilitado:false,documento:null,importe:null,abonado:null,saldo:null,historial:null,porcentaje:null};
    const conn=await pool.getConnection();
    try{await conn.query('START TRANSACTION WITH CONSISTENT SNAPSHOT, READ ONLY');const data=await economia(conn,await cabecera(conn,id));await conn.commit();return data;}catch(e){await conn.rollback();throw e;}finally{conn.release();}
  },
  async guardarDocumento(id,p,buffer,mime,nombre) {
    idValido(id);await exigirEsquema();
    const clave=claveValida(p.clave_operacion),importe=importeCentimos(p.importe),adelanto=importeCentimos(p.adelanto??'0',true),fecha=fechaValida(p.fecha_documento,true);
    if(adelanto>importe)throw fallo('El adelanto no puede superar el importe total.');
    const version=Number(p.version_esperada??0);
    if(!Number.isInteger(version)||version<0)throw fallo('Versión de documento inválida.');
    const motivo=typeof p.motivo==='string'?p.motivo.trim():'';
    if(motivo.length>500)throw fallo('El motivo admite hasta 500 caracteres.');
    if(version>0&&(!motivo||motivo.length>500))throw fallo('Indica el motivo de la corrección.');
    if(version>0&&adelanto!==0)throw fallo('Una corrección no registra otro adelanto. Utiliza Registrar abono.');
    const inicial=adelanto>0?validarAbono({monto:decimal(adelanto),fecha_pago:p.fecha_pago,metodo_pago:p.metodo_pago,numero_operacion:p.numero_operacion},importe):null;
    const meta=validarContenidoArchivo(buffer,nombre,mime);
    const huella=hash({id,importe,adelanto,fecha,version,motivo,inicial,sha:meta.sha,nombre:meta.nombre});
    const conn=await pool.getConnection();let archivo=null,conservar=false,commitIniciado=false;
    try{
      await conn.beginTransaction();const o=await cabecera(conn,id,true);
      if(o.estado==='Cancelada')throw fallo('No se puede registrar un documento en una orden cancelada.',409);
      const [[previo]]=await conn.query('SELECT id_solicitud,documento_huella AS huella FROM solicitudes_cotizacion WHERE documento_operacion=?',[clave]);
      if(previo){mismoRegistro(previo,id,huella);const data=await economia(conn,o);await conn.commit();return {...data,repetida:true};}
      const actual=await economia(conn,o);
      if((actual.documento?.version??0)!==version)throw fallo('El documento cambió. Recarga la orden antes de guardar.',409);
      if(actual.abonado!==null&&importe<importeCentimos(actual.abonado,true))throw fallo('El importe no puede ser inferior a lo ya abonado.',409);
      archivo=await almacenarArchivo(buffer,meta);
      await conn.query('UPDATE solicitudes_cotizacion SET documento_revision=?,importe_acordado=?,fecha_documento=?,archivo_clave=?,archivo_nombre=?,archivo_mime=?,documento_operacion=?,documento_huella=? WHERE id_solicitud=?',[version+1,decimal(importe),fecha,archivo,meta.nombre,meta.tipo,clave,huella,id]);
      if(inicial)await insertarAbono(conn,id,inicial,clave,huella);
      const data=await economia(conn,o);commitIniciado=true;await conn.commit();conservar=true;return data;
    }catch(e){
      await conn.rollback().catch(()=>{});
      if(commitIniciado&&archivo){try{const [[r]]=await pool.query('SELECT archivo_clave FROM solicitudes_cotizacion WHERE archivo_clave=?',[archivo]);conservar=!!r;}catch{conservar=true;}}
      throw e;
    }finally{conn.release();if(archivo&&!conservar)await borrarArchivo(archivo);}
  },
  async abonar(id,p) {
    if(!p||typeof p!=='object'||Array.isArray(p))throw fallo('Datos del abono inválidos.');
    idValido(id);await exigirEsquema();const clave=claveValida(p.clave_operacion);
    const a=validarAbono(p,999999999999),huella=hash({id,...a});
    const conn=await pool.getConnection();
    try{
      await conn.beginTransaction();const o=await cabecera(conn,id,true);
      if(o.estado==='Cancelada')throw fallo('La orden está cancelada.',409);
      const [[previo]]=await conn.query('SELECT id_solicitud,huella FROM pagos_proveedor WHERE clave_operacion=?',[clave]);
      if(previo){mismoRegistro(previo,id,huella);const data=await economia(conn,o);await conn.commit();return {...data,repetida:true};}
      const actual=await economia(conn,o);
      if(!actual.documento)throw fallo('Primero registra el documento y el importe acordado.',409);
      if(a.monto>importeCentimos(actual.saldo,true))throw fallo('El abono no puede superar el saldo pendiente.',409);
      await insertarAbono(conn,id,a,clave,huella);
      const data=await economia(conn,o);await conn.commit();return data;
    }catch(e){await conn.rollback();throw e;}finally{conn.release();}
  },
  async archivo(id,version) {
    idValido(id);if(!Number.isInteger(version)||version<1)throw fallo('Versión inválida.');
    await exigirEsquema();
    const [[r]]=await pool.query('SELECT archivo_clave,archivo_nombre,archivo_mime FROM solicitudes_cotizacion WHERE id_solicitud=? AND documento_revision=?',[id,version]);
    if(!r)throw fallo('Documento no encontrado.',404);
    return {...r,ruta:await comprobarArchivo(r.archivo_clave)};
  },
};

