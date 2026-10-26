import { pool } from '../config/db.js';

function apiError(message, status) {
  return Object.assign(new Error(message), { status });
}

async function enTransaccion(callback) {
  const connection = await pool.getConnection();
  let iniciada = false;
  try {
    await connection.beginTransaction();
    iniciada = true;
    const result = await callback(connection);
    await connection.commit();
    return result;
  } catch (error) {
    if (iniciada) await connection.rollback();
    if (error.code === 'ER_DUP_ENTRY') {
      throw apiError('El diseño entra en conflicto con una restricción única.', 409);
    }
    throw error;
  } finally {
    connection.release();
  }
}

async function buscarPorId(id, connection = pool, bloquear = false) {
  const [rows] = await connection.query(
    `SELECT id_diseno, id_categoria, nombre_diseno, descripcion, estado
     FROM disenios
     WHERE id_diseno = ?${bloquear ? ' FOR UPDATE' : ''}`,
    [id],
  );
  if (!rows.length) throw apiError('Diseño no encontrado.', 404);
  return rows[0];
}

async function buscarCategoriaActiva(connection, idCategoria) {
  const categoria = await buscarCategoria(connection, idCategoria);
  if (categoria.estado !== 1) {
    throw apiError('No se puede asignar el diseño a una categoría inactiva.', 409);
  }
}

async function buscarCategoria(connection, idCategoria) {
  const [rows] = await connection.query(
    `SELECT id_categoria, estado
     FROM categorias
     WHERE id_categoria = ?
     FOR UPDATE`,
    [idCategoria],
  );
  if (!rows.length) throw apiError('La categoría seleccionada no existe.', 404);
  return rows[0];
}

export const disenioService = {
  async obtenerTodos({ estado = null, idCategoria = null } = {}) {
    const filtros = [];
    const parametros = [];
    if (estado !== null) {
      filtros.push('estado = ?');
      parametros.push(estado);
    }
    if (idCategoria !== null) {
      filtros.push('id_categoria = ?');
      parametros.push(idCategoria);
    }
    const where = filtros.length ? `WHERE ${filtros.join(' AND ')}` : '';
    const [rows] = await pool.query(
      `SELECT id_diseno, id_categoria, nombre_diseno, descripcion, estado
       FROM disenios
       ${where}
       ORDER BY id_diseno DESC`,
      parametros,
    );
    return rows;
  },

  async obtenerPorId(id) {
    return buscarPorId(id);
  },

  async crear({ idCategoria, nombre, descripcion }) {
    return enTransaccion(async (connection) => {
      await buscarCategoriaActiva(connection, idCategoria);
      const [result] = await connection.query(
        `INSERT INTO disenios (id_categoria, nombre_diseno, descripcion)
         VALUES (?, ?, ?)`,
        [idCategoria, nombre, descripcion],
      );
      return {
        id_diseno: result.insertId,
        id_categoria: idCategoria,
        nombre_diseno: nombre,
        descripcion,
        estado: 1,
      };
    });
  },

  async actualizar(id, { idCategoria, nombre, descripcion }) {
    return enTransaccion(async (connection) => {
      await buscarCategoriaActiva(connection, idCategoria);
      const [result] = await connection.query(
        `UPDATE disenios
         SET id_categoria = ?, nombre_diseno = ?, descripcion = ?
         WHERE id_diseno = ?`,
        [idCategoria, nombre, descripcion, id],
      );
      if (result.affectedRows === 0) await buscarPorId(id, connection);
      return buscarPorId(id, connection);
    });
  },

  async cambiarEstado(id, estado) {
    return enTransaccion(async (connection) => {
      const [referencias] = await connection.query(
        `SELECT id_categoria
         FROM disenios
         WHERE id_diseno = ?`,
        [id],
      );
      if (!referencias.length) throw apiError('Diseño no encontrado.', 404);

      const categoria = await buscarCategoria(connection, referencias[0].id_categoria);
      const disenio = await buscarPorId(id, connection, true);
      if (disenio.id_categoria !== categoria.id_categoria) {
        throw apiError('La categoría del diseño cambió durante la operación. Intenta nuevamente.', 409);
      }
      if (estado === 1 && categoria.estado !== 1) {
        throw apiError('No se puede activar el diseño porque su categoría está inactiva.', 409);
      }

      if (estado === 0 && disenio.estado !== 0) {
        const [modelosActivos] = await connection.query(
          `SELECT 1
           FROM modelos
           WHERE id_diseno = ? AND estado = 1
           LIMIT 1`,
          [id],
        );
        if (modelosActivos.length) {
          throw apiError('No se puede desactivar el diseño porque tiene modelos activos asociados.', 409);
        }
      }

      if (disenio.estado !== estado) {
        await connection.query(
          `UPDATE disenios
           SET estado = ?
           WHERE id_diseno = ?`,
          [estado, id],
        );
      }
      return { ...disenio, estado };
    });
  },
};
