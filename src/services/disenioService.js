import { pool } from '../config/db.js';

function apiError(message, status) {
  return Object.assign(new Error(message), { status });
}

const columnasDisenio = `d.id_diseno, d.id_categoria, c.nombre_categoria,
  c.estado AS estado_categoria, d.id_proveedor,
  p.razon_social AS nombre_proveedor, p.estado AS estado_proveedor,
  d.nombre_diseno, d.estado,
  COALESCE(mc.total_modelos, 0) AS total_modelos`;

const joinConteoModelos = `
  INNER JOIN categorias AS c ON c.id_categoria = d.id_categoria
  INNER JOIN proveedores AS p ON p.id_proveedor = d.id_proveedor
  LEFT JOIN (
    SELECT id_diseno, COUNT(DISTINCT id_modelo) AS total_modelos
    FROM modelos
    GROUP BY id_diseno
  ) AS mc ON mc.id_diseno = d.id_diseno`;

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
  let referenciaBloqueada = null;
  if (bloquear) {
    const [lockedRows] = await connection.query(
      `SELECT id_categoria, id_proveedor, estado
       FROM disenios
       WHERE id_diseno = ?
       FOR UPDATE`,
      [id],
    );
    if (!lockedRows.length) throw apiError('Diseño no encontrado.', 404);
    referenciaBloqueada = lockedRows[0];
  }
  const [rows] = await connection.query(
    `SELECT ${columnasDisenio}
     FROM disenios AS d
     ${joinConteoModelos}
     WHERE d.id_diseno = ?`,
    [id],
  );
  if (!rows.length) throw apiError('Diseño no encontrado.', 404);
  const disenio = rows[0];
  return referenciaBloqueada ? { ...disenio, ...referenciaBloqueada } : disenio;
}

async function validarProveedor(connection, idProveedor, idProveedorActual = null) {
  const [rows] = await connection.query(
    `SELECT id_proveedor, estado FROM proveedores WHERE id_proveedor = ? FOR UPDATE`,
    [idProveedor],
  );
  if (!rows.length) throw apiError('El proveedor seleccionado no existe.', 404);
  if (rows[0].estado !== 'Activo' && Number(idProveedor) !== Number(idProveedorActual)) {
    throw apiError('No se puede asignar un proveedor inactivo.', 409);
  }
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
  async obtenerTodos({ estado = null, idCategoria = null, idProveedor = null } = {}) {
    const filtros = [];
    const parametros = [];
    if (estado !== null) {
      filtros.push('d.estado = ?');
      parametros.push(estado);
    }
    if (idCategoria !== null) {
      filtros.push('d.id_categoria = ?');
      parametros.push(idCategoria);
    }
    if (idProveedor !== null) {
      filtros.push('d.id_proveedor = ?');
      parametros.push(idProveedor);
    }
    const where = filtros.length ? `WHERE ${filtros.join(' AND ')}` : '';
    const [rows] = await pool.query(
      `SELECT ${columnasDisenio}
       FROM disenios AS d
       ${joinConteoModelos}
       ${where}
       ORDER BY d.id_diseno DESC`,
      parametros,
    );
    return rows;
  },

  async obtenerPorId(id) {
    return buscarPorId(id);
  },

  async crear({ idCategoria, idProveedor, nombre }) {
    return enTransaccion(async (connection) => {
      await buscarCategoriaActiva(connection, idCategoria);
      await validarProveedor(connection, idProveedor);
      const [result] = await connection.query(
        `INSERT INTO disenios (id_categoria, id_proveedor, nombre_diseno)
          VALUES (?, ?, ?)`,
        [idCategoria, idProveedor, nombre],
      );
      return buscarPorId(result.insertId, connection);
    });
  },

  async actualizar(id, { idCategoria, idProveedor, nombre }) {
    return enTransaccion(async (connection) => {
      const categoriaAnterior = await buscarPorId(id, connection);
      const categoriaDestino = await buscarCategoria(connection, idCategoria);
      const disenioBloqueado = await buscarPorId(id, connection, true);
      if (Number(categoriaAnterior.id_categoria) !== Number(disenioBloqueado.id_categoria)) {
        throw apiError('La categoría del diseño cambió durante la operación. Intenta nuevamente.', 409);
      }
      if (Number(categoriaAnterior.id_proveedor) !== Number(disenioBloqueado.id_proveedor)) {
        throw apiError('El proveedor del diseño cambió durante la operación. Intenta nuevamente.', 409);
      }
      if (Number(categoriaDestino.estado) !== 1 && Number(categoriaDestino.id_categoria) !== Number(disenioBloqueado.id_categoria)) {
        throw apiError('No se puede asignar el diseño a una categoría inactiva.', 409);
      }
      await validarProveedor(connection, idProveedor, disenioBloqueado.id_proveedor);
      const [result] = await connection.query(
        `UPDATE disenios
         SET id_categoria = ?, id_proveedor = ?, nombre_diseno = ?
         WHERE id_diseno = ?`,
        [idCategoria, idProveedor, nombre, id],
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
