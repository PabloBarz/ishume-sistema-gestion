import { proveedorService } from '../services/proveedorService.js';

export const proveedorController = {
  async listar(req, res) {
    try {
      res.set('Cache-Control', 'no-store').json({ success: true, data: await proveedorService.listarActivos() });
    } catch (error) {
      console.error('Consulta de proveedores:', error);
      res.status(500).json({ success: false, message: 'No se pudieron consultar los proveedores de MySQL.' });
    }
  },
};
