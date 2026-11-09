import { pool } from '../config/db.js';

function apiError(message, status) {
  return Object.assign(new Error(message), { status });
}

function traducirDuplicado(error) {
  if (error.code !== 'ER_DUP_ENTRY') throw error;
  throw apiError('Ya existe una categoría con ese nombre.', 409);
}

const columnasCategoria = `c.id_categoria, c.nombre_categoria, c.estado,
  COALESCE(d.total_disenios, 0) AS total_disenios,
  COALESCE(m.total_modelos, 0) AS total_modelos`;

const relacionesConteos = `
  FROM categorias AS c
  LEFT JOIN (
    SELECT id_categoria, COUNT(DISTINCT id_diseno) AS total_disenios
    FROM disenios
    GROUP BY id_categoria
  ) AS d ON d.id_categoria = c.id_categoria
  LEFT JOIN (
    SELECT d.id_categoria, COUNT(DISTINCT m.id_modelo) AS total_modelos
    FROM disenios AS d
    INNER JOIN modelos AS m ON m.id_diseno = d.id_diseno
    GROUP BY d.id_categoria
  ) AS m ON m.id_categoria = c.id_categoria`;

async function buscarPorId(id) {
  const [rows] = await pool.query(
    `SELECT ${columnasCategoria}
     ${relacionesConteos}
     WHERE c.id_categoria = ?`,
    [id],
  );
  if (!rows.length) throw apiError('Categoría no encontrada.', 404);
  return rows[0];
}

export const categoriaService = {
  async obtenerTodas(estado = null) {
    const filtro = estado === null ? '' : 'WHERE c.estado = ?';
    const parametros = estado === null ? [] : [estado];
    const [rows] = await pool.query(
      `SELECT ${columnasCategoria}
       ${relacionesConteos}
       ${filtro}
       ORDER BY c.id_categoria DESC`,
      parametros,
    );
    return rows;
  },

  async obtenerPorId(id) {
    return buscarPorId(id);
  },

  async crear(nombreCategoria) {
    try {
      const [result] = await pool.query(
        `INSERT INTO categorias (nombre_categoria)
         VALUES (?)`,
        [nombreCategoria],
      );
      return { id_categoria: result.insertId, nombre_categoria: nombreCategoria, estado: 1 };
    } catch (error) {
      traducirDuplicado(error);
    }
  },

  async actualizarNombre(id, nombreCategoria) {
    try {
      const [result] = await pool.query(
        `UPDATE categorias
         SET nombre_categoria = ?
         WHERE id_categoria = ?`,
        [nombreCategoria, id],
      );
      if (result.affectedRows === 0) return buscarPorId(id);
      return buscarPorId(id);
    } catch (error) {
      traducirDuplicado(error);
    }
  },

  async cambiarEstado(id, estado) {
    const connection = await pool.getConnection();
    let transaccionIniciada = false;
    try {
      await connection.beginTransaction();
      transaccionIniciada = true;

      const [rows] = await connection.query(
        `SELECT id_categoria, nombre_categoria, estado
         FROM categorias
         WHERE id_categoria = ?
         FOR UPDATE`,
        [id],
      );
      if (!rows.length) throw apiError('Categoría no encontrada.', 404);

      if (estado === 0 && rows[0].estado !== 0) {
        const [diseniosActivos] = await connection.query(
          `SELECT 1
           FROM disenios
           WHERE id_categoria = ? AND estado = 1
           LIMIT 1`,
          [id],
        );
        if (diseniosActivos.length) {
          throw apiError('No se puede desactivar la categoría porque tiene diseños activos asociados.', 409);
        }
      }

      if (rows[0].estado !== estado) {
        await connection.query(
          `UPDATE categorias
           SET estado = ?
           WHERE id_categoria = ?`,
          [estado, id],
        );
      }

      await connection.commit();
      return { ...rows[0], estado };
    } catch (error) {
      if (transaccionIniciada) await connection.rollback();
      throw error;
    } finally {
      connection.release();
    }
  },
};
