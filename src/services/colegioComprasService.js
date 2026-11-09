import {pool} from '../config/db.js';
import {contratoService} from './contratoService.js';

const fallo=(mensaje,status=400)=>Object.assign(new Error(mensaje),{status});
async function complementar(colegio,compras){
  const contrato=await contratoService.obtenerPorId(colegio.id_contrato_api);
  const modelos=new Map();
  for(const p of contrato.productos){
    if(!Number.isSafeInteger(p.id_modelo)||p.id_modelo<1||modelos.has(p.id_modelo)||!Number.isSafeInteger(p.cantidad)||p.cantidad<0)
      throw fallo('La API devolvió modelos o cantidades inválidos para este contrato.',502);
    modelos.set(p.id_modelo,{id_modelo:p.id_modelo,modelo:p.modelo,categoria:p.categoria,cantidad_contratada:p.cantidad,cantidad:0,proveedores:[],referencias:[],pedidos:[],distribuciones:[]});
  }
  for(const p of compras){
    // La relación es por ID de modelo de origen, nunca por nombre.
    if(!Number.isSafeInteger(p.id_modelo)||p.id_modelo<1)throw fallo('Un producto comprado no conserva su ID de modelo de origen.',409);
    if(!modelos.has(p.id_modelo))modelos.set(p.id_modelo,{id_modelo:p.id_modelo,modelo:p.modelo,categoria:p.categoria,cantidad_contratada:null,cantidad:0,proveedores:[],referencias:[],pedidos:[],distribuciones:[]});
    const m=modelos.get(p.id_modelo);m.cantidad+=p.cantidad;
    if(!Number.isSafeInteger(m.cantidad))throw fallo('Cantidad solicitada fuera de rango.',409);
    if(!m.proveedores.some(pr=>pr.id_proveedor===p.id_proveedor))m.proveedores.push({id_proveedor:p.id_proveedor,nombre:p.proveedor});
    if(!m.referencias.some(r=>r.codigo===p.codigo))m.referencias.push({codigo:p.codigo,id_solicitud:p.id_solicitud,id_orden:p.pedidos[0].id_orden,situacion:p.situacion});
    m.pedidos.push(...p.pedidos);m.distribuciones.push(...p.distribuciones);
  }
  const productos=[...modelos.values()].map(m=>({...m,cantidad_por_solicitar:m.cantidad_contratada==null?null:Math.max(0,m.cantidad_contratada-m.cantidad),
    proveedor:m.proveedores.map(p=>p.nombre).join(' / ')||'Sin asignar',situacion:m.cantidad===0?'Por solicitar':m.cantidad_contratada!=null&&m.cantidad<m.cantidad_contratada?'Parcial':m.referencias.every(r=>r.situacion==='Generada')?'Generada':m.referencias.every(r=>r.situacion==='Pendiente')?'Pedido pendiente':'Pedido pendiente / Generada'}));
  return {...colegio,colegio:contrato.colegio||colegio.colegio,modelos:contrato.productos.length,proveedores:new Set(compras.map(p=>p.id_proveedor)).size,total:compras.reduce((s,p)=>s+p.cantidad,0),productos};
}
export const colegioComprasService={
  async listar({q='',filtro='todos',pagina='1'}={}){
    if(typeof q!=='string'||q.length>200||!['todos','sin_pedido','pendiente','generada'].includes(filtro)||
      !/^[1-9]\d*$/.test(String(pagina))||!Number.isSafeInteger(Number(pagina)))throw fallo('Filtros de consulta no válidos.');
    const contratos=await contratoService.listarEscolares();
    // Solo existencia de distribuciones: no sumar de nuevo los pedidos consolidados.
    const [rows]=await pool.query(`SELECT cr.id_contrato,cr.id_contrato_api,p.id_modelo_api,
      SUM(d.cantidad_asignada) AS cantidad,
      MAX(s.id_solicitud IS NULL) AS pendiente,MAX(s.id_solicitud IS NOT NULL) AS generada
      FROM contratos_referencia cr
      JOIN contrato_detalles cd ON cd.id_contrato=cr.id_contrato
      JOIN orden_distribuciones d ON d.id_detalle_contrato=cd.id_detalle_contrato
      JOIN orden_detalles od ON od.id_orden_detalle=d.id_orden_detalle AND od.id_producto=cd.id_producto
      JOIN productos p ON p.id_producto=od.id_producto
      JOIN ordenes_compra o ON o.id_orden=od.id_orden
      LEFT JOIN solicitud_ordenes so ON so.id_orden=o.id_orden
      LEFT JOIN solicitudes_cotizacion s ON s.id_solicitud=so.id_solicitud
      WHERE d.cantidad_asignada>0 AND o.estado<>'Cancelada'
        AND (s.id_solicitud IS NULL OR s.estado<>'Cancelada')
      GROUP BY cr.id_contrato,cr.id_contrato_api,p.id_modelo_api`);
    const compras=new Map();
    for(const r of rows){
      const id=Number(r.id_contrato_api);
      if(!compras.has(id))compras.set(id,[]);
      compras.get(id).push(r);
    }
    const normalizar=s=>s.normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase();
    const texto=normalizar(q.trim());
    const lista=[...new Map(contratos.map(c=>[c.id_contrato,c])).values()]
      .filter(c=>c.modelos>0&&normalizar(c.colegio).includes(texto)).map(c=>{
        const lineas=compras.get(c.id_contrato)||[],pendiente=lineas.some(r=>Number(r.pendiente)),generada=lineas.some(r=>Number(r.generada));
        const porSolicitar=(c.productos||[]).some(p=>Number(lineas.find(r=>Number(r.id_modelo_api)===p.id_modelo)?.cantidad||0)<p.cantidad);
        return {id_contrato:lineas[0]?.id_contrato??'api-'+c.id_contrato,id_contrato_api:c.id_contrato,colegio:c.colegio,modelos:c.modelos,
          pendiente,generada,sin_pedido:!pendiente&&!generada,
          situaciones:[...(pendiente?['Pedido pendiente']:[]),...(generada?['Orden generada']:[]),...(!pendiente&&!generada?['Sin pedido']:porSolicitar?['Por solicitar']:[])]};
      }).filter(c=>filtro==='todos'||c[filtro]).sort((a,b)=>a.colegio.localeCompare(b.colegio,'es')||a.id_contrato_api-b.id_contrato_api);
    const porPagina=20,paginas=Math.max(1,Math.ceil(lista.length/porPagina)),actual=Math.min(Number(pagina),paginas);
    return {colegios:lista.slice((actual-1)*porPagina,actual*porPagina),total:lista.length,pagina:actual,paginas,porPagina,hayMas:actual<paginas,aviso:''};
  },
  async buscar(q=''){
    if(typeof q!=='string'||q.length>200)throw fallo('La búsqueda del colegio no es válida.');
    const texto=q.trim().normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase();
    const patron='%'+texto.replace(/[=%_]/g,c=>'='+c)+'%';
    const [rows]=await pool.query(`SELECT id_contrato,id_contrato_api,cliente_colegio AS colegio
      FROM contratos_referencia
      WHERE CONVERT(cliente_colegio USING utf8mb4) COLLATE utf8mb4_unicode_ci LIKE ? ESCAPE '='
      ORDER BY cliente_colegio,id_contrato`,[patron]);
    const normalizar=s=>String(s).normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase();
    const colegios=new Map(rows.map(c=>[Number(c.id_contrato_api),c]));
    let aviso='';
    try{
      for(const c of await contratoService.listarEscolares()){
        if(normalizar(c.colegio).includes(texto)&&!colegios.has(c.id_contrato))
          colegios.set(c.id_contrato,{id_contrato:'api-'+c.id_contrato,id_contrato_api:c.id_contrato,colegio:c.colegio});
      }
    }catch(e){aviso='No se pudo consultar la API de contratos. Se muestran los registros disponibles en ISHUME.';}
    const lista=[...colegios.values()].sort((a,b)=>a.colegio.localeCompare(b.colegio,'es')||a.id_contrato_api-b.id_contrato_api);
    return {colegios:lista.slice(0,20),hayMas:lista.length>20,total:lista.length,aviso};
  },
  async obtener(id){
    if(typeof id==='string'&&/^api-[1-9]\d*$/.test(id)){
      const apiId=Number(id.slice(4));
      if(!Number.isSafeInteger(apiId)||apiId>2147483647)throw fallo('Contrato no válido.');
      const [[local]]=await pool.query('SELECT id_contrato FROM contratos_referencia WHERE id_contrato_api=?',[apiId]);
      if(local)return this.obtener(Number(local.id_contrato));
      return complementar({id_contrato:id,id_contrato_api:apiId},[]);
    }
    id=Number(id);
    if(!Number.isSafeInteger(id)||id<1||id>2147483647)throw fallo('Colegio no válido.');
    const conn=await pool.getConnection();
    try{
      await conn.query('START TRANSACTION WITH CONSISTENT SNAPSHOT, READ ONLY');
      const [[colegio]]=await conn.query(`SELECT id_contrato,id_contrato_api,cliente_colegio AS colegio
        FROM contratos_referencia WHERE id_contrato=?`,[id]);
      if(!colegio)throw fallo('Colegio no encontrado en los registros de ISHUME.',404);
      // Una fila por distribucion: nunca UNION con la instantanea de la orden masiva.
      // uq_so_orden garantiza que este LEFT JOIN no multiplique pedidos.
      const [rows]=await conn.query(`SELECT d.id_distribucion,d.cantidad_asignada AS cantidad,
        cd.id_detalle_contrato,cd.id_contrato,cd.id_producto AS producto_contrato,
        p.id_producto,p.id_modelo_api,p.nombre AS modelo,p.tipo,p.categoria,p.nivel_educativo AS nivel,
        o.id_orden,o.codigo AS codigo_pedido,o.id_proveedor,pr.razon_social AS proveedor,
        s.id_solicitud,s.codigo AS codigo_masiva,s.id_proveedor AS proveedor_masiva
        FROM orden_distribuciones d
        JOIN contrato_detalles cd ON cd.id_detalle_contrato=d.id_detalle_contrato
        JOIN orden_detalles od ON od.id_orden_detalle=d.id_orden_detalle
        JOIN productos p ON p.id_producto=od.id_producto
        JOIN ordenes_compra o ON o.id_orden=od.id_orden
        JOIN proveedores pr ON pr.id_proveedor=o.id_proveedor
        LEFT JOIN solicitud_ordenes so ON so.id_orden=o.id_orden
        LEFT JOIN solicitudes_cotizacion s ON s.id_solicitud=so.id_solicitud
        WHERE cd.id_contrato=? AND o.estado<>'Cancelada'
          AND (s.id_solicitud IS NULL OR s.estado<>'Cancelada')
        ORDER BY o.id_orden DESC,p.id_producto,d.id_distribucion`,[id]);
      const vistos=new Set(),grupos=new Map(),modelos=new Set(),proveedores=new Set();
      let total=0;
      for(const r of rows){
        const cantidad=Number(r.cantidad);
        if(vistos.has(r.id_distribucion)||r.producto_contrato!==r.id_producto||
          (r.id_solicitud!=null&&r.proveedor_masiva!==r.id_proveedor)||
          !Number.isSafeInteger(cantidad)||cantidad<=0)throw fallo('Hay una inconsistencia en la distribución del colegio. Revisa los pedidos originales.',409);
        vistos.add(r.id_distribucion);modelos.add(r.id_producto);proveedores.add(r.id_proveedor);total+=cantidad;
        if(!Number.isSafeInteger(total))throw fallo('El total de unidades excede el rango válido.',409);
        const clave=JSON.stringify([id,r.id_producto,r.id_proveedor,r.id_solicitud!=null?'masiva':'pedido',r.id_solicitud??r.id_orden]);
        if(!grupos.has(clave))grupos.set(clave,{id_contrato:id,id_producto:r.id_producto,id_modelo:r.id_modelo_api,modelo:r.modelo,tipo:r.tipo,categoria:r.categoria,nivel:r.nivel,
          id_proveedor:r.id_proveedor,proveedor:r.proveedor,id_solicitud:r.id_solicitud,
          codigo:r.codigo_masiva??r.codigo_pedido,situacion:r.id_solicitud!=null?'Generada':'Pendiente',cantidad:0,
          pedidos:[],distribuciones:[]});
        const linea=grupos.get(clave);linea.cantidad+=cantidad;
        if(!linea.pedidos.some(p=>p.id_orden===r.id_orden))linea.pedidos.push({id_orden:r.id_orden,codigo:r.codigo_pedido});
        linea.distribuciones.push({id_distribucion:r.id_distribucion,id_detalle_contrato:r.id_detalle_contrato,cantidad});
      }
      await conn.commit();
      return await complementar(colegio,[...grupos.values()]);
    }catch(e){await conn.rollback();throw e;}finally{conn.release();}
  },
};
