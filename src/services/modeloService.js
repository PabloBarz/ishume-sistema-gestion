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
      throw apiError('El modelo entra en conflicto con una restricción única.', 409);
    }
    throw error;
  } finally {
    connection.release();
  }
}

async function buscarPorId(id, connection = pool, bloquear = false) {
  const [rows] = await connection.query(
    `SELECT id_modelo, id_diseno, nombre_modelo, nivel_educativo, estado
     FROM modelos
     WHERE id_modelo = ?${bloquear ? ' FOR UPDATE' : ''}`,
    [id],
  );
  if (!rows.length) throw apiError('Modelo no encontrado.', 404);
  return rows[0];
}

async function bloquearDiseno(connection, idDiseno, validarActivo = true) {
  const [referencias] = await connection.query(
    `SELECT id_categoria
     FROM disenios
     WHERE id_diseno = ?`,
    [idDiseno],
  );
  if (!referencias.length) throw apiError('El diseño seleccionado no existe.', 404);

  const [categorias] = await connection.query(
    `SELECT id_categoria, estado
     FROM categorias
     WHERE id_categoria = ?
     FOR UPDATE`,
    [referencias[0].id_categoria],
  );
  if (!categorias.length) throw apiError('La categoría del diseño no existe.', 404);

  const [disenios] = await connection.query(
    `SELECT id_diseno, id_categoria, estado
     FROM disenios
     WHERE id_diseno = ?
     FOR UPDATE`,
    [idDiseno],
  );
  if (!disenios.length) throw apiError('El diseño seleccionado no existe.', 404);
  if (disenios[0].id_categoria !== categorias[0].id_categoria) {
    throw apiError('La categoría del diseño cambió durante la operación. Intenta nuevamente.', 409);
  }
  if (validarActivo && categorias[0].estado !== 1) {
    throw apiError('No se puede asignar el modelo porque la categoría del diseño está inactiva.', 409);
  }
  if (validarActivo && disenios[0].estado !== 1) {
    throw apiError('No se puede asignar el modelo a un diseño inactivo.', 409);
  }

  return { categoria: categorias[0], disenio: disenios[0] };
}

export const modeloService = {
  async obtenerTodos(estado = null) {
    const filtro = estado === null ? '' : 'WHERE estado = ?';
    const parametros = estado === null ? [] : [estado];
    const [rows] = await pool.query(
      `SELECT id_modelo, id_diseno, nombre_modelo, nivel_educativo, estado
       FROM modelos
       ${filtro}
       ORDER BY id_modelo DESC`,
      parametros,
    );
    return rows;
  },

  async obtenerPorId(id) {
    return buscarPorId(id);
  },

  async crear({ idDiseno, nombre, nivelEducativo }) {
    return enTransaccion(async (connection) => {
      await bloquearDiseno(connection, idDiseno);
      const [result] = await connection.query(
        `INSERT INTO modelos (id_diseno, nombre_modelo, nivel_educativo)
         VALUES (?, ?, ?)`,
        [idDiseno, nombre, nivelEducativo],
      );
      return {
        id_modelo: result.insertId,
        id_diseno: idDiseno,
        nombre_modelo: nombre,
        nivel_educativo: nivelEducativo,
        estado: 1,
      };
    });
  },

  async actualizar(id, { idDiseno, nombre, nivelEducativo }) {
    return enTransaccion(async (connection) => {
      await buscarPorId(id, connection);
      await bloquearDiseno(connection, idDiseno);
      const [result] = await connection.query(
        `UPDATE modelos
         SET id_diseno = ?, nombre_modelo = ?, nivel_educativo = ?
         WHERE id_modelo = ?`,
        [idDiseno, nombre, nivelEducativo, id],
      );
      if (result.affectedRows === 0) await buscarPorId(id, connection);
      return buscarPorId(id, connection);
    });
  },

  async cambiarEstado(id, estado) {
    return enTransaccion(async (connection) => {
      const modeloActual = await buscarPorId(id, connection);
      const { categoria, disenio } = await bloquearDiseno(connection, modeloActual.id_diseno, false);
      const modelo = await buscarPorId(id, connection, true);
      if (modelo.id_diseno !== modeloActual.id_diseno) {
        throw apiError('El diseño del modelo cambió durante la operación. Intenta nuevamente.', 409);
      }

      if (estado === 1 && (disenio.estado !== 1 || categoria.estado !== 1)) {
        throw apiError('No se puede activar el modelo porque su diseño o categoría está inactivo.', 409);
      }

      if (estado === 0 && modelo.estado !== 0) {
        const [productosActivos] = await connection.query(
          `SELECT 1
           FROM inventario_productos
           WHERE id_modelo = ? AND estado = 1
           LIMIT 1`,
          [id],
        );
        if (productosActivos.length) {
          throw apiError('No se puede desactivar el modelo porque tiene productos activos asociados.', 409);
        }
      }

      if (modelo.estado !== estado) {
        await connection.query(
          `UPDATE modelos
           SET estado = ?
           WHERE id_modelo = ?`,
          [estado, id],
        );
      }
      return { ...modelo, estado };
    });
  },
};
