import { pool } from '../config/db.js';

export const catalogoModelosSql = `(SELECT m.id_modelo, m.nombre_modelo AS nombre,
  d.nombre_diseno AS tipo, c.nombre_categoria AS categoria, m.nivel_educativo
  FROM modelos m JOIN disenios d ON d.id_diseno=m.id_diseno
  JOIN categorias c ON c.id_categoria=d.id_categoria)`;

// La API externa solo aporta el ID local y la cantidad; el catalogo es la fuente de nombres y proveedores.
export async function completarModelos(lineas, connection = pool) {
  if (!Array.isArray(lineas) || !lineas.length) return [];
  const ids = lineas.map(p => p?.id_modelo);
  if (ids.some(id => !Number.isSafeInteger(id) || id < 1) || new Set(ids).size !== ids.length) {
    throw Object.assign(new Error('El contrato contiene IDs de modelo invalidos o repetidos.'), { status: 502 });
  }
  const [modelos] = await connection.query(`SELECT m.id_modelo, m.id_diseno, m.nombre_modelo AS modelo,
    m.descripcion, m.precio, m.estado, d.nombre_diseno AS tipo, d.estado AS estado_diseno,
    c.nombre_categoria AS categoria, c.estado AS estado_categoria, m.nivel_educativo AS nivel
    FROM modelos m JOIN disenios d ON d.id_diseno=m.id_diseno
    JOIN categorias c ON c.id_categoria=d.id_categoria WHERE m.id_modelo IN (?)`, [ids]);
  if (modelos.length !== ids.length) throw Object.assign(new Error('El contrato referencia un modelo que no existe en nuestro catalogo.'), { status: 409 });
  const [proveedores] = await connection.query(`SELECT dp.id_diseno, p.id_proveedor, p.razon_social
    FROM disenio_proveedores dp JOIN proveedores p ON p.id_proveedor=dp.id_proveedor
    WHERE dp.id_diseno IN (?) AND p.estado='Activo' ORDER BY p.razon_social`, [modelos.map(m => m.id_diseno)]);
  return lineas.map(linea => {
    const modelo = modelos.find(m => m.id_modelo === linea.id_modelo);
    return { ...linea, ...modelo, proveedores: proveedores.filter(p => p.id_diseno === modelo.id_diseno) };
  });
}

export async function validarAbastecimiento(connection, idModelo, idProveedor) {
  const [rows] = await connection.query(`SELECT m.id_modelo FROM modelos m
    JOIN disenios d ON d.id_diseno=m.id_diseno JOIN categorias c ON c.id_categoria=d.id_categoria
    JOIN disenio_proveedores dp ON dp.id_diseno=d.id_diseno
    JOIN proveedores pr ON pr.id_proveedor=dp.id_proveedor
    WHERE m.id_modelo=? AND dp.id_proveedor=? AND m.estado=1 AND d.estado=1 AND c.estado=1
      AND pr.estado='Activo' FOR UPDATE`, [idModelo, idProveedor]);
  if (!rows.length) throw Object.assign(new Error('El modelo no esta activo o el proveedor no abastece su diseno.'), { status: 409 });
}
