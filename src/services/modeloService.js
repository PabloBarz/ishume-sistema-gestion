import { pool } from '../config/db.js';
import { modelImageStorage, withModelImageUrl } from './modelImageService.js';

function apiError(message, status) {
  return Object.assign(new Error(message), { status });
}

const MODEL_CATALOG_SELECT = `SELECT m.id_modelo, m.nombre_modelo, m.descripcion, m.nivel_educativo, m.precio, m.estado, m.imagen_path,
            m.id_diseno, d.nombre_diseno, d.estado AS estado_diseno,
            d.id_proveedor, p.razon_social AS nombre_proveedor, p.estado AS estado_proveedor,
            d.id_categoria, c.nombre_categoria, c.estado AS estado_categoria`;
const MODEL_CATALOG_JOINS = `
     FROM modelos AS m
     INNER JOIN disenios AS d ON d.id_diseno = m.id_diseno
     INNER JOIN categorias AS c ON c.id_categoria = d.id_categoria
     INNER JOIN proveedores AS p ON p.id_proveedor = d.id_proveedor`;

export function buildIntegrationCatalogQuery() {
  const clauses = ['m.estado = 1', 'd.estado = 1', 'c.estado = 1', "p.estado = 'Activo'"];
  const fromWhere = `${MODEL_CATALOG_JOINS}\n     WHERE ${clauses.join(' AND ')}`;
  return {
    sql: `${MODEL_CATALOG_SELECT}${fromWhere}\n     ORDER BY m.id_modelo DESC`,
    params: [],
  };
}

export function projectIntegrationCatalogModel(model) {
  const { imagen_url: imagenUrl } = withModelImageUrl(model);
  return {
    id_modelo: Number(model.id_modelo),
    nombre_modelo: model.nombre_modelo,
    descripcion: model.descripcion,
    precio: model.precio == null ? null : Number(model.precio),
    nivel_educativo: model.nivel_educativo,
    estado: Number(model.estado) === 1 ? 'Activo' : 'Inactivo',
    imagen_url: imagenUrl,
    id_diseno: Number(model.id_diseno),
    nombre_diseno: model.nombre_diseno,
    id_categoria: Number(model.id_categoria),
    nombre_categoria: model.nombre_categoria,
    id_proveedor: Number(model.id_proveedor),
    nombre_proveedor: model.nombre_proveedor,
  };
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
    `${MODEL_CATALOG_SELECT}${MODEL_CATALOG_JOINS}\n     WHERE m.id_modelo = ?${bloquear ? ' FOR UPDATE' : ''}`,
    [id],
  );
  if (!rows.length) throw apiError('Modelo no encontrado.', 404);
  return withModelImageUrl(rows[0]);
}

async function bloquearDiseno(connection, idDiseno, validarActivo = true, seleccion = {}) {
  const [referencias] = await connection.query(
    `SELECT id_categoria, id_proveedor
     FROM disenios
     WHERE id_diseno = ?`,
    [idDiseno],
  );
  if (!referencias.length) throw apiError('El diseño seleccionado no existe.', 404);
  if (seleccion.idCategoria != null && Number(referencias[0].id_categoria) !== Number(seleccion.idCategoria)) {
    throw apiError('El diseño no pertenece a la categoría seleccionada.', 409);
  }
  if (seleccion.idProveedor != null && Number(referencias[0].id_proveedor) !== Number(seleccion.idProveedor)) {
    throw apiError('El diseño no pertenece al proveedor seleccionado.', 409);
  }

  const [categorias] = await connection.query(
    `SELECT id_categoria, estado
     FROM categorias
     WHERE id_categoria = ?
     FOR UPDATE`,
    [referencias[0].id_categoria],
  );
  if (!categorias.length) throw apiError('La categoría del diseño no existe.', 404);

  const [disenios] = await connection.query(
    `SELECT id_diseno, id_categoria, id_proveedor, estado
     FROM disenios
     WHERE id_diseno = ?
     FOR UPDATE`,
    [idDiseno],
  );
  if (!disenios.length) throw apiError('El diseño seleccionado no existe.', 404);
  if (Number(disenios[0].id_categoria) !== Number(categorias[0].id_categoria) ||
      Number(disenios[0].id_proveedor) !== Number(referencias[0].id_proveedor)) {
    throw apiError('Las relaciones del diseño cambiaron durante la operación. Intenta nuevamente.', 409);
  }
  if (validarActivo && categorias[0].estado !== 1) {
    throw apiError('No se puede asignar el modelo porque la categoría del diseño está inactiva.', 409);
  }
  if (validarActivo && disenios[0].estado !== 1) {
    throw apiError('No se puede asignar el modelo a un diseño inactivo.', 409);
  }

  const [proveedores] = await connection.query(
    `SELECT id_proveedor, estado
     FROM proveedores
     WHERE id_proveedor = ?
     FOR UPDATE`,
    [disenios[0].id_proveedor],
  );
  if (!proveedores.length) throw apiError('El proveedor del diseño no existe.', 404);
  if (validarActivo && proveedores[0].estado !== 'Activo') {
    throw apiError('No se puede asignar el modelo a un diseño cuyo proveedor está inactivo.', 409);
  }

  return { categoria: categorias[0], disenio: disenios[0], proveedor: proveedores[0] };
}

export const modeloService = {
  async obtenerTodos({ estado = null, idCategoria = null, idDiseno = null } = {}) {
    const filtros = [];
    const parametros = [];
    if (idCategoria !== null) {
      filtros.push('d.id_categoria = ?');
      parametros.push(idCategoria);
    }
    if (idDiseno !== null) {
      filtros.push('m.id_diseno = ?');
      parametros.push(idDiseno);
    }
    if (estado !== null) {
      filtros.push('m.estado = ?');
      parametros.push(estado);
    }
    const where = filtros.length ? `WHERE ${filtros.join(' AND ')}` : '';
    const [rows] = await pool.query(
      `${MODEL_CATALOG_SELECT}${MODEL_CATALOG_JOINS}
       ${where}
       ORDER BY m.id_modelo DESC`,
      parametros,
    );
    return rows.map(withModelImageUrl);
  },

  async obtenerCatalogoIntegracion() {
    const { sql, params } = buildIntegrationCatalogQuery();
    const [rows] = await pool.query(sql, params);
    return rows.map(projectIntegrationCatalogModel);
  },

  async obtenerPorId(id) {
    return buscarPorId(id);
  },

  async crear({ idDiseno, idCategoria = null, idProveedor = null, nombre, nivelEducativo, precio, descripcion = null, imagenPath = null }) {
    return enTransaccion(async (connection) => {
      await bloquearDiseno(connection, idDiseno, true, { idCategoria, idProveedor });
      const [result] = await connection.query(
        `INSERT INTO modelos (id_diseno, nombre_modelo, nivel_educativo, precio, descripcion, imagen_path)
         VALUES (?, ?, ?, ?, ?, ?)`,
        [idDiseno, nombre, nivelEducativo, precio, descripcion, imagenPath],
      );
      return withModelImageUrl({
        id_modelo: result.insertId,
        id_diseno: idDiseno,
        nombre_modelo: nombre,
        nivel_educativo: nivelEducativo,
        precio,
        descripcion,
        estado: 1,
        imagen_path: imagenPath,
      });
    });
  },

  async actualizar(id, { idDiseno, idCategoria = null, idProveedor = null, nombre, nivelEducativo, precio, descripcion = null, imagenPath = undefined }) {
    return enTransaccion(async (connection) => {
      const modeloActual = await buscarPorId(id, connection);
      // Preserve an existing inactive relation when editing unrelated model fields;
      // assigning a different design still requires an active design and category.
      const conservaRelacionHistorica = String(modeloActual.id_diseno) === String(idDiseno);
      await bloquearDiseno(connection, idDiseno, !conservaRelacionHistorica, { idCategoria, idProveedor });
      const [result] = imagenPath === undefined
        ? await connection.query(
          `UPDATE modelos
           SET id_diseno = ?, nombre_modelo = ?, nivel_educativo = ?, precio = ?, descripcion = ?
           WHERE id_modelo = ?`,
          [idDiseno, nombre, nivelEducativo, precio, descripcion, id],
        )
        : await connection.query(
          `UPDATE modelos
           SET id_diseno = ?, nombre_modelo = ?, nivel_educativo = ?, precio = ?, descripcion = ?, imagen_path = ?
           WHERE id_modelo = ?`,
          [idDiseno, nombre, nivelEducativo, precio, descripcion, imagenPath, id],
        );
      if (result.affectedRows === 0) await buscarPorId(id, connection);
      const modelo = await buscarPorId(id, connection);
      return { modelo, previousImagePath: imagenPath === undefined ? null : modeloActual.imagen_path };
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

  async eliminarImagenSiNoReferenciada(imagenPath) {
    if (typeof imagenPath !== 'string' || !imagenPath) return false;
    const [referencias] = await pool.query(
      'SELECT id_modelo FROM modelos WHERE imagen_path = ? LIMIT 1',
      [imagenPath],
    );
    if (referencias.length) return false;
    return modelImageStorage.remove(imagenPath);
  },
};
