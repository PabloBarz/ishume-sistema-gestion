import { disenioService } from '../services/disenioService.js';

function idValido(value) {
  return typeof value === 'string' && /^\d+$/.test(value) &&
    Number.isSafeInteger(Number(value)) && Number(value) > 0;
}

function enteroPositivo(value) {
  if (typeof value === 'string') {
    return /^\d+$/.test(value) && Number.isSafeInteger(Number(value)) && Number(value) > 0;
  }
  return Number.isSafeInteger(value) && value > 0;
}

function nombreValido(value) {
  return typeof value === 'string' && value.trim().length > 0 &&
    Array.from(value.trim()).length <= 30;
}

function descripcionValida(value) {
  return value == null || (typeof value === 'string' && Array.from(value).length <= 255);
}

function responderError(res, error, operacion) {
  if (error.status) {
    return res.status(error.status).json({ success: false, message: error.message });
  }

  console.error(error);
  return res.status(500).json({
    success: false,
    message: `Error al ${operacion} el diseño.`,
  });
}

export const disenioController = {
  async listar(req, res) {
    const { estado, id_categoria: idCategoria } = req.query;
    if (estado !== undefined && estado !== '0' && estado !== '1') {
      return res.status(400).json({ success: false, message: 'El estado debe ser 0 o 1.' });
    }
    if (idCategoria !== undefined && !enteroPositivo(idCategoria)) {
      return res.status(400).json({ success: false, message: 'El identificador de categoría debe ser un entero mayor que cero.' });
    }

    try {
      const disenios = await disenioService.obtenerTodos({
        estado: estado === undefined ? null : Number(estado),
        idCategoria: idCategoria === undefined ? null : Number(idCategoria),
      });
      return res.status(200).json({ success: true, data: disenios });
    } catch (error) {
      return responderError(res, error, 'listar');
    }
  },

  async obtener(req, res) {
    const { id } = req.params;
    if (!idValido(id)) {
      return res.status(400).json({ success: false, message: 'El identificador debe ser un entero mayor que cero.' });
    }

    try {
      const disenio = await disenioService.obtenerPorId(Number(id));
      return res.status(200).json({ success: true, data: disenio });
    } catch (error) {
      return responderError(res, error, 'obtener');
    }
  },

  async crear(req, res) {
    const { id_categoria: idCategoria, nombre_diseno: nombre, descripcion } = req.body ?? {};
    if (!enteroPositivo(idCategoria)) {
      return res.status(400).json({ success: false, message: 'El identificador de categoría debe ser un entero mayor que cero.' });
    }
    if (typeof nombre !== 'string' || nombre.trim().length === 0) {
      return res.status(400).json({ success: false, message: 'El nombre del diseño es obligatorio.' });
    }
    if (!nombreValido(nombre)) {
      return res.status(400).json({ success: false, message: 'El nombre del diseño no debe superar los 30 caracteres.' });
    }
    if (!descripcionValida(descripcion)) {
      return res.status(400).json({ success: false, message: 'La descripción debe ser texto de hasta 255 caracteres.' });
    }

    try {
      const disenio = await disenioService.crear({
        idCategoria: Number(idCategoria),
        nombre: nombre.trim(),
        descripcion: descripcion?.trim() || null,
      });
      return res.status(201).json({ success: true, message: 'Diseño creado correctamente.', data: disenio });
    } catch (error) {
      return responderError(res, error, 'crear');
    }
  },

  async actualizar(req, res) {
    const { id } = req.params;
    const { id_categoria: idCategoria, nombre_diseno: nombre, descripcion } = req.body ?? {};
    if (!idValido(id)) {
      return res.status(400).json({ success: false, message: 'El identificador debe ser un entero mayor que cero.' });
    }
    if (!enteroPositivo(idCategoria)) {
      return res.status(400).json({ success: false, message: 'El identificador de categoría debe ser un entero mayor que cero.' });
    }
    if (typeof nombre !== 'string' || nombre.trim().length === 0) {
      return res.status(400).json({ success: false, message: 'El nombre del diseño es obligatorio.' });
    }
    if (!nombreValido(nombre)) {
      return res.status(400).json({ success: false, message: 'El nombre del diseño no debe superar los 30 caracteres.' });
    }
    if (!descripcionValida(descripcion)) {
      return res.status(400).json({ success: false, message: 'La descripción debe ser texto de hasta 255 caracteres.' });
    }

    try {
      const disenio = await disenioService.actualizar(Number(id), {
        idCategoria: Number(idCategoria),
        nombre: nombre.trim(),
        descripcion: descripcion?.trim() || null,
      });
      return res.status(200).json({ success: true, message: 'Diseño actualizado correctamente.', data: disenio });
    } catch (error) {
      return responderError(res, error, 'actualizar');
    }
  },

  async cambiarEstado(req, res) {
    const { id } = req.params;
    const { estado } = req.body ?? {};
    if (!idValido(id)) {
      return res.status(400).json({ success: false, message: 'El identificador debe ser un entero mayor que cero.' });
    }
    if (estado !== 0 && estado !== 1) {
      return res.status(400).json({ success: false, message: 'El estado debe ser 0 o 1.' });
    }

    try {
      const disenio = await disenioService.cambiarEstado(Number(id), estado);
      return res.status(200).json({
        success: true,
        message: estado === 1 ? 'Diseño activado correctamente.' : 'Diseño desactivado correctamente.',
        data: disenio,
      });
    } catch (error) {
      return responderError(res, error, estado === 1 ? 'activar' : 'desactivar');
    }
  },
};
