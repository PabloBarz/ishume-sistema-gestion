import { contratoService } from '../services/contratoService.js';

export const contratoController = {
  async consultar(req, res) {
    const { id } = req.query;
    if (typeof id !== 'string' || !/^\d+$/.test(id) ||
        !Number.isSafeInteger(Number(id)) || Number(id) <= 0) {
      return res.status(400).json({ success: false, message: 'Ingresa un ID de contrato entero mayor que cero.' });
    }

    res.set('Cache-Control', 'no-store');
    try {
      const contrato = await contratoService.obtenerPorId(id);
      return res.json({ success: true, data: contrato });
    } catch (error) {
      return res.status(error.status || 500).json({
        success: false,
        message: error.status ? error.message : 'Error al consultar el contrato.',
      });
    }
  },
};
