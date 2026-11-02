// Una llamada representa un solo pedido/orden y proveedor. Nunca modifica el origen.
export function consolidarOrden(orden) {
  const fallo = mensaje => { throw Object.assign(new Error(mensaje), {status:409}); };
  const identidad = p => {
    const id = p.id_producto ?? p.id_modelo ?? p.id_modelo_api;
    if (!Number.isSafeInteger(Number(id)) || Number(id)<=0) fallo('Falta el identificador real de un producto. No se puede consolidar por nombre.');
    return `${p.id_producto != null ? 'producto' : 'modelo'}:${Number(id)}`;
  };
  function agrupar(lineas) {
    const mapa=new Map();
    for (const p of lineas) {
      if(p.id_proveedor!=null&&orden.id_proveedor!=null&&Number(p.id_proveedor)!==Number(orden.id_proveedor))fallo('Hay productos de diferentes proveedores.');
      const clave=identidad(p),cantidad=Number(p.cantidad);
      if(!Number.isSafeInteger(cantidad)||cantidad<=0||typeof p.modelo!=='string'||!p.modelo.trim())fallo('El detalle de productos contiene cantidades o modelos inválidos.');
      const previo=mapa.get(clave);
      if(previo)for(const campo of ['modelo','tipo','categoria','nivel']) {
        if(previo[campo]!=null&&p[campo]!=null&&previo[campo]!==p[campo])fallo('Un producto tiene características inconsistentes. Revisa su identidad.');
      }
      const suma=(previo?.cantidad??0)+cantidad;
      if(!Number.isSafeInteger(suma))fallo('El total de productos excede el rango válido.');
      mapa.set(clave,{...p,cantidad:suma});
    }
    return mapa;
  }
  const distribuciones=Array.isArray(orden.distribuciones)?orden.distribuciones:[];
  const productos=Array.isArray(orden.productos)&&orden.productos.length?orden.productos:distribuciones;
  if(!productos.length)fallo('La orden no tiene productos disponibles.');
  const consolidados=agrupar(productos);
  const total=[...consolidados.values()].reduce((s,p)=>s+p.cantidad,0);
  if(!Number.isSafeInteger(total)||total!==Number(orden.total))fallo('Los productos no coinciden con el total de la orden.');
  if(distribuciones.length&&productos!==distribuciones) {
    const reparto=agrupar(distribuciones);
    if(reparto.size!==consolidados.size||[...consolidados].some(([id,p])=>reparto.get(id)?.cantidad!==p.cantidad))fallo('La distribución no coincide con los productos de la orden.');
  }
  return {productos:[...consolidados.values()].map(p=>{
    const {id_contrato,id_contrato_api,colegio,...producto}=p;
    return producto;
  }),total};
}
