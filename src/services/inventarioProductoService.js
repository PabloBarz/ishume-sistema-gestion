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
      throw apiError('Ya existe un producto con ese SKU.', 409);
    }
    throw error;
  } finally {
    connection.release();
  }
}

async function buscarPorId(id, connection = pool) {
  const [rows] = await connection.query(
    `SELECT p.id_producto, p.sku, p.precio, p.stock_actual, p.estado,
            p.id_modelo, m.nombre_modelo, m.nivel_educativo,
            m.id_diseno, d.nombre_diseno, d.id_categoria, c.nombre_categoria
     FROM inventario_productos AS p
     INNER JOIN modelos AS m ON m.id_modelo = p.id_modelo
     INNER JOIN disenios AS d ON d.id_diseno = m.id_diseno
     INNER JOIN categorias AS c ON c.id_categoria = d.id_categoria
     WHERE p.id_producto = ?`,
    [id],
  );
  if (!rows.length) throw apiError('Producto no encontrado.', 404);
  return rows[0];
}

async function validarModeloActivo(connection, idModelo) {
  const [modelos] = await connection.query(
    `SELECT id_diseno
     FROM modelos
     WHERE id_modelo = ?`,
    [idModelo],
  );
  if (!modelos.length) throw apiError('El modelo seleccionado no existe.', 404);

  const [diseniosRelacionados] = await connection.query(
    `SELECT id_categoria
     FROM disenios
     WHERE id_diseno = ?`,
    [modelos[0].id_diseno],
  );
  if (!diseniosRelacionados.length) throw apiError('El diseño del modelo seleccionado no existe.', 404);
  const idCategoria = diseniosRelacionados[0].id_categoria;

  const [categorias] = await connection.query(
    `SELECT id_categoria, estado
     FROM categorias
     WHERE id_categoria = ?
     FOR UPDATE`,
    [idCategoria],
  );
  if (!categorias.length) throw apiError('La categoría del modelo seleccionado no existe.', 404);

  const [disenios] = await connection.query(
    `SELECT id_categoria, estado
     FROM disenios
     WHERE id_diseno = ?
     FOR UPDATE`,
    [modelos[0].id_diseno],
  );
  if (!disenios.length) throw apiError('El diseño del modelo seleccionado no existe.', 404);
  if (disenios[0].id_categoria !== categorias[0].id_categoria) {
    throw apiError('La categoría del modelo cambió durante la operación. Intenta nuevamente.', 409);
  }

  const [modelo] = await connection.query(
    `SELECT id_diseno, estado
     FROM modelos
     WHERE id_modelo = ?
     FOR UPDATE`,
    [idModelo],
  );
  if (!modelo.length) throw apiError('El modelo seleccionado no existe.', 404);
  if (modelo[0].id_diseno !== modelos[0].id_diseno) {
    throw apiError('El diseño del modelo cambió durante la operación. Intenta nuevamente.', 409);
  }

  if (categorias[0].estado !== 1) {
    throw apiError('No se puede asignar el producto porque la categoría está inactiva.', 409);
  }
  if (disenios[0].estado !== 1) {
    throw apiError('No se puede asignar el producto porque el diseño está inactivo.', 409);
  }
  if (modelo[0].estado !== 1) {
    throw apiError('No se puede asignar el producto a un modelo inactivo.', 409);
  }
}

export const inventarioProductoService = {
  async obtenerTodos({ idCategoria = null, idDiseno = null, idModelo = null, estado = null } = {}) {
    const filtros = [];
    const parametros = [];
    if (idCategoria !== null) {
      filtros.push('d.id_categoria = ?');
      parametros.push(idCategoria);
    }
    if (idDiseno !== null) {
      filtros.push('d.id_diseno = ?');
      parametros.push(idDiseno);
    }
    if (idModelo !== null) {
      filtros.push('m.id_modelo = ?');
      parametros.push(idModelo);
    }
    if (estado !== null) {
      filtros.push('p.estado = ?');
      parametros.push(estado);
    }
    const where = filtros.length ? `WHERE ${filtros.join(' AND ')}` : '';
    const [rows] = await pool.query(
      `SELECT p.id_producto, p.sku, p.precio, p.stock_actual, p.estado,
              p.id_modelo, m.nombre_modelo, m.nivel_educativo,
              m.id_diseno, d.nombre_diseno, d.id_categoria, c.nombre_categoria
       FROM inventario_productos AS p
       INNER JOIN modelos AS m ON m.id_modelo = p.id_modelo
       INNER JOIN disenios AS d ON d.id_diseno = m.id_diseno
       INNER JOIN categorias AS c ON c.id_categoria = d.id_categoria
       ${where}
       ORDER BY p.id_producto DESC`,
      parametros,
    );
    return rows;
  },

  async obtenerPorId(id) {
    return buscarPorId(id);
  },

  async crear({ idModelo, sku, precio }) {
    return enTransaccion(async (connection) => {
      await validarModeloActivo(connection, idModelo);
      const [result] = await connection.query(
        `INSERT INTO inventario_productos (id_modelo, sku, precio)
         VALUES (?, ?, ?)`,
        [idModelo, sku, precio],
      );
      return buscarPorId(result.insertId, connection);
    });
  },

  async actualizar(id, { idModelo, sku, precio }) {
    return enTransaccion(async (connection) => {
      const [productos] = await connection.query(
        `SELECT id_producto
         FROM inventario_productos
         WHERE id_producto = ?`,
        [id],
      );
      if (!productos.length) throw apiError('Producto no encontrado.', 404);

      await validarModeloActivo(connection, idModelo);
      await connection.query(
        `UPDATE inventario_productos
         SET id_modelo = ?, sku = ?, precio = ?
         WHERE id_producto = ?`,
        [idModelo, sku, precio, id],
      );
      return buscarPorId(id, connection);
    });
  },

  async cambiarEstado(id, estado) {
    return enTransaccion(async (connection) => {
      const [productos] = await connection.query(
        `SELECT id_producto, id_modelo, stock_actual, estado
         FROM inventario_productos
         WHERE id_producto = ?
         FOR UPDATE`,
        [id],
      );
      if (!productos.length) throw apiError('Producto no encontrado.', 404);

      if (estado === 0 && productos[0].stock_actual > 0) {
        throw apiError('No se puede desactivar el producto porque tiene stock disponible.', 409);
      }
      if (estado === 1) {
        await validarModeloActivo(connection, productos[0].id_modelo);
      }

      if (productos[0].estado !== estado) {
        await connection.query(
          `UPDATE inventario_productos
           SET estado = ?
           WHERE id_producto = ?`,
          [estado, id],
        );
      }
      return buscarPorId(id, connection);
    });
  },
};
