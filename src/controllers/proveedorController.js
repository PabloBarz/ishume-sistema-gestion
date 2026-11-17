import { proveedorService } from '../services/proveedorService.js';

function enteroPositivo(value) {
  return typeof value === 'string' && /^\d+$/.test(value) && Number.isSafeInteger(Number(value)) && Number(value) > 0;
}

export const proveedorController = {
  async listar(req, res) {
    const { id_categoria: idCategoria } = req.query;
    if (idCategoria !== undefined && !enteroPositivo(idCategoria)) {
      return res.status(400).json({ success: false, message: 'El identificador de categoría debe ser un entero mayor que cero.' });
    }
    try {
      res.set('Cache-Control', 'no-store').json({
        success: true,
        data: await proveedorService.listarActivos(idCategoria === undefined ? null : Number(idCategoria)),
      });
    } catch (error) {
      console.error('Consulta de proveedores:', error);
      res.status(500).json({ success: false, message: 'No se pudieron consultar los proveedores de MySQL.' });
    }
  },
};
