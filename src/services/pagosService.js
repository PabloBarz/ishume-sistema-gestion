import {permisosPagos} from '../config/pagosConfig.js';
﻿import { pool } from '../config/db.js';
import {createHash} from 'node:crypto';
import {fallo,esOrdenMasiva,importeCentimos,decimal,validarAbono,claveValida,validarCorreccionAbono} from './pagoValidaciones.js';
import {validarContenidoArchivo,almacenarArchivo,borrarArchivo,comprobarArchivo} from './archivoPagoService.js';

const hash=p=>createHash('sha256').update(JSON.stringify(p)).digest('hex');
const idValido=id=>{if(!Number.isInteger(id)||id<1||id>2147483647)throw fallo('Orden inválida.');};
async function capacidad(conn=pool,registro=false) {
  const [[r]]=await conn.query("SELECT COUNT(*) AS n, EXISTS (SELECT 1 FROM information_schema.KEY_COLUMN_USAGE WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='pagos_proveedor' AND COLUMN_NAME='id_solicitud' AND REFERENCED_TABLE_SCHEMA=DATABASE() AND REFERENCED_TABLE_NAME='solicitudes_cotizacion' AND REFERENCED_COLUMN_NAME='id_solicitud') AS relacion, EXISTS (SELECT 1 FROM information_schema.COLUMNS WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='pagos_proveedor' AND COLUMN_NAME='fecha_registro') AS registro FROM information_schema.COLUMNS WHERE TABLE_SCHEMA=DATABASE() AND ((TABLE_NAME='solicitudes_cotizacion' AND COLUMN_NAME IN ('archivo_clave','documento_revision','documento_operacion','documento_huella','importe_acordado','fecha_registro_documento','archivo_nombre','archivo_mime')) OR (TABLE_NAME='pagos_proveedor' AND COLUMN_NAME IN ('id_solicitud','clave_operacion','huella')))");
  return Number(r?.n)===11&&Number(r?.relacion)===1&&(!registro||Number(r?.registro)===1);
}
async function exigirEsquema(registro=false){if(!await capacidad(pool,registro))throw fallo(registro?'Falta aplicar migrations/006_fecha_registro_pagos.sql para registrar fecha y hora de los abonos. No se guardo ningun pago.':'Falta aplicar el esquema de Pagos en MySQL Workbench. No se guardo ningun dato.',503);}
async function capacidadCorrecciones(conn=pool){
  const [[r]]=await conn.query(`SELECT COUNT(*) AS columnas,
    EXISTS(SELECT 1 FROM information_schema.KEY_COLUMN_USAGE WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='correcciones_pago_proveedor' AND COLUMN_NAME='id_pago' AND REFERENCED_TABLE_NAME='pagos_proveedor' AND REFERENCED_COLUMN_NAME='id_pago') AS relacion,
    EXISTS(SELECT 1 FROM information_schema.STATISTICS WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='correcciones_pago_proveedor' AND COLUMN_NAME='clave_operacion' AND NON_UNIQUE=0) AS unica,
    EXISTS(SELECT 1 FROM information_schema.TABLE_CONSTRAINTS WHERE CONSTRAINT_SCHEMA=DATABASE() AND TABLE_NAME='correcciones_pago_proveedor' AND CONSTRAINT_NAME='ck_correccion_cambio_completo' AND CONSTRAINT_TYPE='CHECK') AS cambio
    FROM information_schema.COLUMNS WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='correcciones_pago_proveedor'
    AND COLUMN_NAME IN ('id_correccion','id_pago','monto_anterior','monto_nuevo','metodo_anterior','metodo_nuevo','motivo','fecha_correccion','responsable_identificador','clave_operacion','huella','fecha_pago_anterior','fecha_pago_nueva')`);
  return Number(r?.columnas)===13&&Number(r?.relacion)===1&&Number(r?.unica)===1&&Number(r?.cambio)===1;
}
async function cabecera(conn,id,bloquear=false) {
  idValido(id);
  const [[o]]=await conn.query("SELECT s.id_solicitud,s.id_proveedor,s.codigo,s.estado,p.razon_social AS proveedor,DATE_FORMAT(s.fecha_emision,'%d/%m/%Y') AS fecha,JSON_UNQUOTE(JSON_EXTRACT(s.contenido_json,'$.total')) AS unidades FROM solicitudes_cotizacion s JOIN proveedores p ON p.id_proveedor=s.id_proveedor WHERE s.id_solicitud=?"+(bloquear?' FOR UPDATE':''),[id]);
  if(!o||!esOrdenMasiva(o.codigo))throw fallo('Orden masiva no encontrada.',404);
  return {...o,unidades:Number(o.unidades)};
}
async function economia(conn,o) {
  const [[v]]=await conn.query("SELECT s.*,s.documento_revision AS version,DATE_FORMAT(s.fecha_registro_documento,'%Y-%m-%d %H:%i:%s') AS fecha_registro_documento FROM solicitudes_cotizacion s WHERE id_solicitud=? AND archivo_clave IS NOT NULL",[o.id_solicitud]);
  const fechaRegistro=await capacidad(conn,true)?"DATE_FORMAT(a.fecha_registro,'%Y-%m-%d %H:%i:%s')":'NULL';
  const [pagos]=await conn.query("SELECT a.id_pago AS id_abono,a.monto,DATE_FORMAT(a.fecha_pago,'%Y-%m-%d') AS fecha_pago,a.metodo_pago,a.numero_operacion,"+fechaRegistro+" AS fecha_registro FROM pagos_proveedor a WHERE a.id_solicitud=? ORDER BY a.fecha_pago,a.id_pago",[o.id_solicitud]);
  const correccionesDisponibles=await capacidadCorrecciones(conn);
  const [correcciones]=correccionesDisponibles?await conn.query(`SELECT c.id_correccion,c.id_pago,c.monto_anterior,c.monto_nuevo,c.metodo_anterior,c.metodo_nuevo,
    DATE_FORMAT(c.fecha_pago_anterior,'%Y-%m-%d') AS fecha_pago_anterior,DATE_FORMAT(c.fecha_pago_nueva,'%Y-%m-%d') AS fecha_pago_nueva,
    c.motivo,DATE_FORMAT(c.fecha_correccion,'%Y-%m-%d %H:%i:%s') AS fecha_correccion,c.responsable_identificador
    FROM correcciones_pago_proveedor c JOIN pagos_proveedor p ON p.id_pago=c.id_pago WHERE p.id_solicitud=? ORDER BY c.fecha_correccion,c.id_correccion`,[o.id_solicitud]):[[]];
  const total=v?importeCentimos(String(v.importe_acordado)):null;
  const pagado=pagos.reduce((s,a)=>s+importeCentimos(String(a.monto)),0);
  if(total!==null&&pagado>total)throw fallo('El historial tiene pagos superiores al importe. Requiere revisión.',409);
  return {...o,habilitado:true,documento:v?{version:v.version,fecha_registro:v.fecha_registro_documento,nombre:v.archivo_nombre,mime:v.archivo_mime,url:'/api/pagos/ordenes/'+o.id_solicitud+'/archivo?version='+v.version}:null,
    importe:total===null?null:decimal(total),abonado:total===null?null:decimal(pagado),saldo:total===null?null:decimal(total-pagado),
    estado_economico:total===null?'Sin documento':pagado===0?'Pendiente':pagado===total?'Pagado':'Parcial',
    porcentaje:total===null?null:Math.round(pagado*10000/total)/100,
    correcciones_disponibles:correccionesDisponibles,corregir_abonos:permisosPagos().corregir_abonos&&correccionesDisponibles,correcciones,
    historial:pagos.map(a=>({...a,version_correccion:Math.max(0,...correcciones.filter(c=>c.id_pago===a.id_abono).map(c=>c.id_correccion))}))};
}
function mismoRegistro(r,id,huella){if(r.id_solicitud!==id||r.huella!==huella)throw fallo('La clave de operación corresponde a otros datos.',409);}
async function insertarAbono(conn,id,a,clave,huella) {
  const registro=await capacidad(conn,true);
  const instante="CONVERT_TZ(UTC_TIMESTAMP(),'+00:00','-05:00')";
  await conn.query('INSERT INTO pagos_proveedor (id_solicitud,monto,fecha_pago,'+(registro?'fecha_registro,':'')+'metodo_pago,numero_operacion,clave_operacion,huella) VALUES (?,?,DATE('+instante+'),'+(registro?instante+',':'')+'?,?,?,?)',[id,decimal(a.monto),a.metodo,a.operacion,clave,huella]);
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
    const ids=[...new Set(rows.slice(0,20).map(o=>o.id_proveedor))];
    let proveedores=[];
    if(ids.length){
      const importes=habilitado?",COUNT(s.importe_acordado) AS cotizadas,SUM(s.importe_acordado) AS total,SUM(CASE WHEN s.importe_acordado IS NOT NULL THEN COALESCE(a.pagado,0) END) AS abonado,SUM(CASE WHEN s.importe_acordado IS NOT NULL THEN s.importe_acordado-COALESCE(a.pagado,0) END) AS saldo":",0 AS cotizadas,NULL AS total,NULL AS abonado,NULL AS saldo";
      const [resumenes]=await pool.query("SELECT s.id_proveedor,COUNT(*) AS cantidad"+importes+" FROM solicitudes_cotizacion s "+joins+" WHERE s.codigo REGEXP '^(OC-MAS-[0-9]+|ORDEN-MAS-[A-Z0-9]+-[0-9]+)$' AND s.id_proveedor IN ("+ids.map(()=>'?').join(',')+") GROUP BY s.id_proveedor",ids);
      proveedores=resumenes.map(r=>({...r,cantidad:Number(r.cantidad),cotizadas:Number(r.cotizadas)}));
    }
    return {pagina,hayMas:rows.length>20,economia_disponible:habilitado,permisos:permisosPagos(),proveedores,ordenes:rows.slice(0,20).map(o=>{
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
    const clave=claveValida(p.clave_operacion),importe=importeCentimos(p.importe),adelanto=importeCentimos(p.adelanto??'0',true);
    if(adelanto>importe)throw fallo('El adelanto no puede superar el importe total.');
    const version=Number(p.version_esperada??0);
    if(!Number.isInteger(version)||version<0)throw fallo('Versión de documento inválida.');
    if(version>0&&!permisosPagos().editar_cotizacion)throw fallo('La edición de cotizaciones no está permitida.',403);
    const motivo=typeof p.motivo==='string'?p.motivo.trim():'';
    if(motivo.length>500)throw fallo('El motivo admite hasta 500 caracteres.');
    if(version>0&&(!motivo||motivo.length>500))throw fallo('Indica el motivo de la corrección.');
    if(version>0&&adelanto!==0)throw fallo('Una corrección no registra otro adelanto. Utiliza Registrar abono.');
    const inicial=adelanto>0?validarAbono({monto:decimal(adelanto),metodo_pago:p.metodo_pago,numero_operacion:p.numero_operacion},importe):null;
    const tieneArchivo=Buffer.isBuffer(buffer)&&buffer.length>0;
    if(!tieneArchivo&&version===0)throw fallo('Selecciona un documento del proveedor.');
    const meta=tieneArchivo?validarContenidoArchivo(buffer,nombre,mime):null;
    const huella=hash({id,importe,adelanto,version,motivo,inicial,sha:meta?.sha??null,nombre:meta?.nombre??null});
    const conn=await pool.getConnection();let archivo=null,conservar=false,commitIniciado=false;
    try{
      await conn.beginTransaction();const o=await cabecera(conn,id,true);
      if(o.estado==='Cancelada')throw fallo('No se puede registrar un documento en una orden cancelada.',409);
      const [[previo]]=await conn.query('SELECT id_solicitud,documento_huella AS huella FROM solicitudes_cotizacion WHERE documento_operacion=?',[clave]);
      if(previo){mismoRegistro(previo,id,huella);const data=await economia(conn,o);await conn.commit();return {...data,repetida:true};}
      const actual=await economia(conn,o);
      if(actual.documento&&!permisosPagos().editar_cotizacion)throw fallo('La edición de cotizaciones no está permitida.',403);
      if(!meta&&!actual.documento)throw fallo('No existe un documento que conservar.',409);
      if((actual.documento?.version??0)!==version)throw fallo('El documento cambió. Recarga la orden antes de guardar.',409);
      if(actual.abonado!==null&&importe<importeCentimos(actual.abonado,true))throw fallo('El importe no puede ser inferior a lo ya abonado.',409);
      if(meta)archivo=await almacenarArchivo(buffer,meta);
      await conn.query("UPDATE solicitudes_cotizacion SET documento_revision=?,importe_acordado=?,fecha_registro_documento=CONVERT_TZ(UTC_TIMESTAMP(),'+00:00','-05:00'),archivo_clave=COALESCE(?,archivo_clave),archivo_nombre=COALESCE(?,archivo_nombre),archivo_mime=COALESCE(?,archivo_mime),documento_operacion=?,documento_huella=? WHERE id_solicitud=?",[version+1,decimal(importe),archivo,meta?.nombre??null,meta?.tipo??null,clave,huella,id]);
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
  async corregirAbono(id,idPago,p){
    if(!permisosPagos().corregir_abonos)throw fallo('La corrección de abonos no está permitida.',403);
    idValido(id);idValido(idPago);const a=validarCorreccionAbono(p),clave=claveValida(p.clave_operacion);
    await exigirEsquema();
    if(!await capacidadCorrecciones())throw fallo('Falta preparar correcciones de abonos: aplica 007 y 008 en MySQL Workbench. No se modificó ningún pago.',503);
    const huella=hash({id,idPago,...a}),conn=await pool.getConnection();
    try{
      await conn.beginTransaction();const o=await cabecera(conn,id,true);
      if(o.estado==='Cancelada')throw fallo('La orden está cancelada.',409);
      const [[pago]]=await conn.query("SELECT id_pago,id_solicitud,monto,DATE_FORMAT(fecha_pago,'%Y-%m-%d') AS fecha_pago,metodo_pago FROM pagos_proveedor WHERE id_pago=? AND id_solicitud=? FOR UPDATE",[idPago,id]);
      if(!pago)throw fallo('El abono no existe o no pertenece a esta orden.',404);
      const [[previo]]=await conn.query('SELECT id_pago,huella FROM correcciones_pago_proveedor WHERE clave_operacion=?',[clave]);
      if(previo){if(previo.id_pago!==idPago||previo.huella!==huella)throw fallo('La clave de operación corresponde a otra corrección.',409);const data=await economia(conn,o);await conn.commit();return {...data,repetida:true};}
      const actual=await economia(conn,o),vigente=actual.historial.find(v=>v.id_abono===idPago);
      if(vigente.version_correccion!==a.version)throw fallo('El abono cambió. Cierra y vuelve a abrir el historial antes de corregirlo.',409);
      if(!actual.documento||actual.importe===null)throw fallo('La orden no tiene un importe acordado.',409);
      const abonado=importeCentimos(actual.abonado,true)-importeCentimos(String(pago.monto))+a.monto;
      if(abonado>importeCentimos(actual.importe))throw fallo('La corrección supera el importe acordado de la orden.',409);
      if(a.monto===importeCentimos(String(pago.monto))&&a.fecha===pago.fecha_pago&&a.metodo===pago.metodo_pago)throw fallo('No hay cambios para guardar.');
      await conn.query('UPDATE pagos_proveedor SET monto=?,fecha_pago=?,metodo_pago=? WHERE id_pago=? AND id_solicitud=?',[decimal(a.monto),a.fecha,a.metodo,idPago,id]);
      await conn.query(`INSERT INTO correcciones_pago_proveedor
        (id_pago,monto_anterior,monto_nuevo,metodo_anterior,metodo_nuevo,fecha_pago_anterior,fecha_pago_nueva,motivo,fecha_correccion,responsable_identificador,clave_operacion,huella)
        VALUES (?,?,?,?,?,?,?,?,CONVERT_TZ(UTC_TIMESTAMP(),'+00:00','-05:00'),NULL,?,?)`,
        [idPago,pago.monto,decimal(a.monto),pago.metodo_pago,a.metodo,pago.fecha_pago,a.fecha,a.motivo,clave,huella]);
      const data=await economia(conn,o);await conn.commit();return data;
    }catch(e){await conn.rollback();if(e.code==='ER_DUP_ENTRY')throw fallo('La corrección ya fue procesada o su clave pertenece a otra operación. Consulta el historial.',409);throw e;}finally{conn.release();}
  },
  async archivo(id,version) {
    idValido(id);if(!Number.isInteger(version)||version<1)throw fallo('Versión inválida.');
    await exigirEsquema();
    const [[r]]=await pool.query('SELECT archivo_clave,archivo_nombre,archivo_mime FROM solicitudes_cotizacion WHERE id_solicitud=? AND documento_revision=?',[id,version]);
    if(!r)throw fallo('Documento no encontrado.',404);
    return {...r,ruta:await comprobarArchivo(r.archivo_clave)};
  },
};

