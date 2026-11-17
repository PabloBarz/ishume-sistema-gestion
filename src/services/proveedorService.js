import { pool } from '../config/db.js';

export const proveedorService = {
  async listarActivos(idCategoria = null) {
    const consulta = idCategoria === null
      ? "SELECT id_proveedor, razon_social FROM proveedores WHERE estado = 'Activo' ORDER BY razon_social"
      : `SELECT DISTINCT p.id_proveedor, p.razon_social
         FROM proveedores AS p
         INNER JOIN disenios AS d ON d.id_proveedor = p.id_proveedor
         WHERE p.estado = 'Activo' AND d.id_categoria = ?
         ORDER BY p.razon_social`;
    const [rows] = idCategoria === null
      ? await pool.query(consulta)
      : await pool.query(consulta, [idCategoria]);
    return rows;
  },
};
