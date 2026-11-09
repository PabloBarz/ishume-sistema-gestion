import { pool } from '../config/db.js';

export const proveedorService = {
  async listarActivos() {
    const [rows] = await pool.query("SELECT id_proveedor, razon_social FROM proveedores WHERE estado = 'Activo' ORDER BY razon_social");
    return rows;
  },
};
