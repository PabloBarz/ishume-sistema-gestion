import { categoriaService } from '../services/categoriaService.js';
//Datos de ejemplo para sintaxis
export const categoriaController = {
  async listar(req, res) {
    try {
      const categorias = await categoriaService.obtenerTodas();
      return res.status(200).json({ success: true, data: categorias });
    } catch {
      return res.status(500).json({
        success: false,
        message: 'Error al obtener categorías.',
      });
    }
  },

  async registrar(req, res) {
    const { nombre, descripcion } = req.body ?? {};

    if (typeof nombre !== 'string' || nombre.trim().length === 0) {
      return res.status(400).json({
        success: false,
        message: 'El nombre es obligatorio.',
      });
    }

    if (descripcion != null && typeof descripcion !== 'string') {
      return res.status(400).json({
        success: false,
        message: 'La descripción debe ser texto.',
      });
    }

    try {
      const categoria = await categoriaService.crear({
        nombre: nombre.trim(),
        descripcion: descripcion?.trim() || null,
      });
      return res.status(201).json({
        success: true,
        message: 'Categoría creada correctamente.',
        data: categoria,
      });
    } catch (error) {
      if (error.code === 'CATEGORIA_DUPLICADA') {
        return res.status(409).json({
          success: false,
          message: 'La categoría ya existe.',
        });
      }

      return res.status(500).json({
        success: false,
        message: 'Error al crear categoría.',
      });
    }
  },
};
