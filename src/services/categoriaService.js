import { pool } from '../config/db.js';
//Datos de ejemplo para sintaxis
export const categoriaService = {
  async obtenerTodas() {
    const [rows] = await pool.query(
      `SELECT id_categoria, nombre, descripcion
       FROM categorias
       ORDER BY id_categoria DESC`,
    );
    return rows;
  },

  async crear({ nombre, descripcion }) {
    try {
      const [result] = await pool.query(
        `INSERT INTO categorias (nombre, descripcion)
         VALUES (?, ?)`,
        [nombre, descripcion],
      );

      return { id_categoria: result.insertId, nombre, descripcion };
    } catch (error) {
      if (error.code === 'ER_DUP_ENTRY') {
        const duplicateError = new Error('La categoría ya existe.');
        duplicateError.code = 'CATEGORIA_DUPLICADA';
        throw duplicateError;
      }

      throw error;
    }
  },
};
