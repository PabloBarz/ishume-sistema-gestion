import { modeloService } from '../services/modeloService.js';
import { persistModelImageChange } from '../services/modelImageService.js';

const EDUCATION_LEVELS = ['PRONOEI - Inicial', 'Primaria - Superior'];

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
    Array.from(value.trim()).length <= 60;
}

function nivelValido(value) {
  return typeof value === 'string' && EDUCATION_LEVELS.includes(value);
}

function precioValido(value, { permitirAusente = false } = {}) {
  if (value === undefined) return permitirAusente;
  if (value === null || (typeof value === 'string' && value.trim() === '')) return true;
  return (typeof value === 'string' || typeof value === 'number') &&
    /^\d{1,8}(\.\d{1,2})?$/.test(String(value)) && Number.isFinite(Number(value));
}

function normalizarPrecio(value) {
  return value === undefined || value === null || (typeof value === 'string' && value.trim() === '')
    ? null
    : Number(value).toFixed(2);
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
    const { id_diseno: idDiseno, nombre_modelo: nombre, nivel_educativo: nivelEducativo, precio } = req.body;
    const presentacion = req.body.presentacion ?? req.body.descripcion;
    const { id_categoria: idCategoria, id_proveedor: idProveedor } = req.body;
    if ((idCategoria === undefined) !== (idProveedor === undefined)) {
      return res.status(400).json({ success: false, message: 'La categoría y el proveedor deben enviarse juntos.' });
    }
    if (idCategoria !== undefined && !enteroPositivo(idCategoria)) {
      return res.status(400).json({ success: false, message: 'El identificador de categoría debe ser un entero mayor que cero.' });
    }
    if (idProveedor !== undefined && !enteroPositivo(idProveedor)) {
      return res.status(400).json({ success: false, message: 'El identificador de proveedor debe ser un entero mayor que cero.' });
    }
    if (!enteroPositivo(idDiseno)) {
      return res.status(400).json({ success: false, message: 'El identificador de diseño debe ser un entero mayor que cero.' });
    }
    if (typeof nombre !== 'string' || nombre.trim().length === 0) {
      return res.status(400).json({ success: false, message: 'El nombre del modelo es obligatorio.' });
    }
    if (!nombreValido(nombre)) {
      return res.status(400).json({ success: false, message: 'El nombre del modelo no debe superar los 60 caracteres.' });
    }
    if (presentacion != null && (typeof presentacion !== 'string' || Array.from(presentacion).length > 255)) {
      return res.status(400).json({ success: false, message: 'La presentación debe ser texto de hasta 255 caracteres.' });
    }
    if (!precioValido(precio, { permitirAusente: true })) {
      return res.status(400).json({ success: false, message: 'El precio debe estar vacío o ser un valor entre 0 y 99999999.99 con hasta dos decimales.' });
    }
    if (!nivelValido(nivelEducativo)) {
      return res.status(400).json({ success: false, message: 'Selecciona un nivel educativo válido.' });
    }

    try {
      const modelo = await persistModelImageChange({
        file: req.file,
        missingImagePath: null,
        persist: (imagenPath) => modeloService.crear({
          idDiseno: Number(idDiseno),
          idCategoria: idCategoria === undefined ? null : Number(idCategoria),
          idProveedor: idProveedor === undefined ? null : Number(idProveedor),
          nombre: nombre.trim(),
          nivelEducativo,
          precio: normalizarPrecio(precio),
          presentacion: presentacion?.trim() || null,
          imagenPath,
        }),
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
    const { id_diseno: idDiseno, nombre_modelo: nombre, nivel_educativo: nivelEducativo, precio } = req.body;
    const presentacion = req.body.presentacion ?? req.body.descripcion;
    const { id_categoria: idCategoria, id_proveedor: idProveedor } = req.body;
    if ((idCategoria === undefined) !== (idProveedor === undefined)) {
      return res.status(400).json({ success: false, message: 'La categoría y el proveedor deben enviarse juntos.' });
    }
    if (idCategoria !== undefined && !enteroPositivo(idCategoria)) {
      return res.status(400).json({ success: false, message: 'El identificador de categoría debe ser un entero mayor que cero.' });
    }
    if (idProveedor !== undefined && !enteroPositivo(idProveedor)) {
      return res.status(400).json({ success: false, message: 'El identificador de proveedor debe ser un entero mayor que cero.' });
    }
    if (!enteroPositivo(idDiseno)) {
      return res.status(400).json({ success: false, message: 'El identificador de diseño debe ser un entero mayor que cero.' });
    }
    if (typeof nombre !== 'string' || nombre.trim().length === 0) {
      return res.status(400).json({ success: false, message: 'El nombre del modelo es obligatorio.' });
    }
    if (!nombreValido(nombre)) {
      return res.status(400).json({ success: false, message: 'El nombre del modelo no debe superar los 60 caracteres.' });
    }
    if (presentacion != null && (typeof presentacion !== 'string' || Array.from(presentacion).length > 255)) {
      return res.status(400).json({ success: false, message: 'La presentación debe ser texto de hasta 255 caracteres.' });
    }
    if (!precioValido(precio)) {
      return res.status(400).json({ success: false, message: 'El precio debe estar vacío o ser un valor entre 0 y 99999999.99 con hasta dos decimales.' });
    }
    if (!nivelValido(nivelEducativo)) {
      return res.status(400).json({ success: false, message: 'Selecciona un nivel educativo válido.' });
    }

    try {
      const resultado = await persistModelImageChange({
        file: req.file,
        persist: (imagenPath) => modeloService.actualizar(Number(id), {
          idDiseno: Number(idDiseno),
          idCategoria: idCategoria === undefined ? null : Number(idCategoria),
          idProveedor: idProveedor === undefined ? null : Number(idProveedor),
          nombre: nombre.trim(),
          nivelEducativo,
          precio: normalizarPrecio(precio),
          presentacion: presentacion?.trim() || null,
          imagenPath,
        }),
        removePrevious: (imagenPath) => modeloService.eliminarImagenSiNoReferenciada(imagenPath),
      });
      const modelo = resultado.modelo;
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
