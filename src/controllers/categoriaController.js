import { categoriaService } from '../services/categoriaService.js';

const MAX_NOMBRE_LENGTH = 30;

function idValido(value) {
  return typeof value === 'string' && /^\d+$/.test(value) &&
    Number.isSafeInteger(Number(value)) && Number(value) > 0;
}

function nombreValido(value) {
  return typeof value === 'string' && value.trim().length > 0 &&
    Array.from(value.trim()).length <= MAX_NOMBRE_LENGTH;
}

function responderError(res, error, operacion) {
  if (error.status) {
    return res.status(error.status).json({ success: false, message: error.message });
  }

  console.error(error);
  return res.status(500).json({
    success: false,
    message: `Error al ${operacion} la categoría.`,
  });
}

export const categoriaController = {
  async listar(req, res) {
    const { estado } = req.query;
    if (estado !== undefined && estado !== '0' && estado !== '1') {
      return res.status(400).json({ success: false, message: 'El estado debe ser 0 o 1.' });
    }

    try {
      const categorias = await categoriaService.obtenerTodas(estado === undefined ? null : Number(estado));
      return res.status(200).json({ success: true, data: categorias });
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
      const categoria = await categoriaService.obtenerPorId(Number(id));
      return res.status(200).json({ success: true, data: categoria });
    } catch (error) {
      return responderError(res, error, 'obtener');
    }
  },

  async crear(req, res) {
    const { nombre_categoria: nombre } = req.body ?? {};
    if (typeof nombre !== 'string' || nombre.trim().length === 0) {
      return res.status(400).json({ success: false, message: 'El nombre de la categoría es obligatorio.' });
    }
    if (!nombreValido(nombre)) {
      return res.status(400).json({ success: false, message: 'El nombre no debe superar los 30 caracteres.' });
    }

    try {
      const categoria = await categoriaService.crear(nombre.trim());
      return res.status(201).json({ success: true, message: 'Categoría creada correctamente.', data: categoria });
    } catch (error) {
      return responderError(res, error, 'crear');
    }
  },

  async actualizar(req, res) {
    const { id } = req.params;
    const { nombre_categoria: nombre } = req.body ?? {};
    if (!idValido(id)) {
      return res.status(400).json({ success: false, message: 'El identificador debe ser un entero mayor que cero.' });
    }
    if (typeof nombre !== 'string' || nombre.trim().length === 0) {
      return res.status(400).json({ success: false, message: 'El nombre de la categoría es obligatorio.' });
    }
    if (!nombreValido(nombre)) {
      return res.status(400).json({ success: false, message: 'El nombre no debe superar los 30 caracteres.' });
    }

    try {
      const categoria = await categoriaService.actualizarNombre(Number(id), nombre.trim());
      return res.status(200).json({ success: true, message: 'Categoría actualizada correctamente.', data: categoria });
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
      const categoria = await categoriaService.cambiarEstado(Number(id), estado);
      return res.status(200).json({
        success: true,
        message: estado === 1 ? 'Categoría activada correctamente.' : 'Categoría desactivada correctamente.',
        data: categoria,
      });
    } catch (error) {
      return responderError(res, error, estado === 1 ? 'activar' : 'desactivar');
    }
  },
};
