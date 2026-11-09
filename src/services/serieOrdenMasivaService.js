// Invocado dentro de la transaccion que guarda la orden masiva.
export async function siguienteCodigoMasivo(conn,idProveedor,nombre) {
  const [[serie]]=await conn.query('SELECT prefijo_orden_masiva AS prefijo,CAST(ultimo_orden_masiva AS CHAR) AS numero FROM proveedores WHERE id_proveedor=? FOR UPDATE',[idProveedor]);
  if(!serie)throw Object.assign(new Error('Proveedor no encontrado.'),{status:409});
  const limpio=nombre.normalize('NFD').replace(/[\u0300-\u036f]/g,'').toUpperCase().replace(/[^A-Z0-9]/g,'');
  const prefijo=serie.prefijo||(limpio.startsWith('LIDERBOOK')?'LIB':limpio.slice(0,3)||'PRV');
  const numero=BigInt(serie.numero)+1n;
  const codigo=`ORDEN-MAS-${prefijo}-${numero.toString().padStart(3,'0')}`;
  if(codigo.length>30)throw Object.assign(new Error('Limite de numeracion alcanzado.'),{status:409});
  await conn.query('UPDATE proveedores SET ultimo_orden_masiva=?,prefijo_orden_masiva=? WHERE id_proveedor=?',[numero.toString(),prefijo,idProveedor]);
  return codigo;
}
