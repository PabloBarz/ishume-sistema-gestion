import { modeloService } from '../services/modeloService.js';

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

function nivelValido(value) {
  return value == null || (typeof value === 'string' && Array.from(value).length <= 30);
}

function datosModeloValidos(body) {
  return body && typeof body === 'object' && !Array.isArray(body);
}

function responderError(res, error, operacion) {
  if (error.status) {
    return res.status(error.status).json({ success: false, message: error.message });
  }

  console.error(error);
  return res.status(500).json({
    success: false,
    message: `Error al ${operacion} el modelo.`,
  });
}

export const modeloController = {
  async listar(req, res) {
    const { estado, id_categoria: idCategoria, id_diseno: idDiseno } = req.query;
    if (estado !== undefined && estado !== '0' && estado !== '1') {
      return res.status(400).json({ success: false, message: 'El estado debe ser 0 o 1.' });
    }
    if (idCategoria !== undefined && !enteroPositivo(idCategoria)) {
      return res.status(400).json({ success: false, message: 'El identificador de categoría debe ser un entero mayor que cero.' });
    }
    if (idDiseno !== undefined && !enteroPositivo(idDiseno)) {
      return res.status(400).json({ success: false, message: 'El identificador de diseño debe ser un entero mayor que cero.' });
    }

    try {
      const modelos = await modeloService.obtenerTodos({
        estado: estado === undefined ? null : Number(estado),
        idCategoria: idCategoria === undefined ? null : Number(idCategoria),
        idDiseno: idDiseno === undefined ? null : Number(idDiseno),
      });
      return res.status(200).json({ success: true, data: modelos });
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
      const modelo = await modeloService.obtenerPorId(Number(id));
      return res.status(200).json({ success: true, data: modelo });
    } catch (error) {
      return responderError(res, error, 'obtener');
    }
  },

  async crear(req, res) {
    if (!datosModeloValidos(req.body)) {
      return res.status(400).json({ success: false, message: 'El cuerpo de la solicitud debe ser un objeto JSON.' });
    }
    const { id_diseno: idDiseno, nombre_modelo: nombre, nivel_educativo: nivelEducativo } = req.body;
    if (!enteroPositivo(idDiseno)) {
      return res.status(400).json({ success: false, message: 'El identificador de diseño debe ser un entero mayor que cero.' });
    }
    if (typeof nombre !== 'string' || nombre.trim().length === 0) {
      return res.status(400).json({ success: false, message: 'El nombre del modelo es obligatorio.' });
    }
    if (!nombreValido(nombre)) {
      return res.status(400).json({ success: false, message: 'El nombre del modelo no debe superar los 30 caracteres.' });
    }
    if (!nivelValido(nivelEducativo)) {
      return res.status(400).json({ success: false, message: 'El nivel educativo debe ser texto de hasta 30 caracteres.' });
    }

    try {
      const modelo = await modeloService.crear({
        idDiseno: Number(idDiseno),
        nombre: nombre.trim(),
        nivelEducativo: nivelEducativo?.trim() || null,
      });
      return res.status(201).json({ success: true, message: 'Modelo creado correctamente.', data: modelo });
    } catch (error) {
      return responderError(res, error, 'crear');
    }
  },

  async actualizar(req, res) {
    const { id } = req.params;
    if (!idValido(id)) {
      return res.status(400).json({ success: false, message: 'El identificador debe ser un entero mayor que cero.' });
    }
    if (!datosModeloValidos(req.body)) {
      return res.status(400).json({ success: false, message: 'El cuerpo de la solicitud debe ser un objeto JSON.' });
    }
    const { id_diseno: idDiseno, nombre_modelo: nombre, nivel_educativo: nivelEducativo } = req.body;
    if (!enteroPositivo(idDiseno)) {
      return res.status(400).json({ success: false, message: 'El identificador de diseño debe ser un entero mayor que cero.' });
    }
    if (typeof nombre !== 'string' || nombre.trim().length === 0) {
      return res.status(400).json({ success: false, message: 'El nombre del modelo es obligatorio.' });
    }
    if (!nombreValido(nombre)) {
      return res.status(400).json({ success: false, message: 'El nombre del modelo no debe superar los 30 caracteres.' });
    }
    if (!nivelValido(nivelEducativo)) {
      return res.status(400).json({ success: false, message: 'El nivel educativo debe ser texto de hasta 30 caracteres.' });
    }

    try {
      const modelo = await modeloService.actualizar(Number(id), {
        idDiseno: Number(idDiseno),
        nombre: nombre.trim(),
        nivelEducativo: nivelEducativo?.trim() || null,
      });
      return res.status(200).json({ success: true, message: 'Modelo actualizado correctamente.', data: modelo });
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
      const modelo = await modeloService.cambiarEstado(Number(id), estado);
      return res.status(200).json({
        success: true,
        message: estado === 1 ? 'Modelo activado correctamente.' : 'Modelo desactivado correctamente.',
        data: modelo,
      });
    } catch (error) {
      return responderError(res, error, estado === 1 ? 'activar' : 'desactivar');
    }
  },
};
