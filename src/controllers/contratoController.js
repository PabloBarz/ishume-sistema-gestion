import { contratoService } from '../services/contratoService.js';
import { contratoPedidoService } from '../services/contratoPedidoService.js';

export const contratoController = {
  async listarColegios(req, res) {
    res.set('Cache-Control', 'no-store');
    try {
      const colegios=await contratoService.listarEscolaresEnProceso();
      const registrados=await contratoPedidoService.registrados(colegios.map(c=>c.id_contrato));
      return res.json({ success: true, data: colegios.map(c=>({...c,pedido_registrado:registrados.has(c.id_contrato)})) });
    } catch (error) {
      return res.status(error.status || 500).json({ success: false,
        message: error.status ? error.message : 'No se pudo cargar el listado de colegios.' });
    }
  },
  async consultar(req, res) {
    const { id } = req.query;
    if (typeof id !== 'string' || !/^\d+$/.test(id) ||
        !Number.isSafeInteger(Number(id)) || Number(id) <= 0) {
      return res.status(400).json({ success: false, message: 'Ingresa un ID de contrato entero mayor que cero.' });
    }

    res.set('Cache-Control', 'no-store');
    try {
      const contrato = await contratoService.obtenerPorId(id);
      const registrados=await contratoPedidoService.registrados([Number(id)]);
      return res.json({ success: true, data: {...contrato,pedido_registrado:registrados.has(Number(id))} });
    } catch (error) {
      return res.status(error.status || 500).json({
        success: false,
        message: error.status ? error.message : 'Error al consultar el contrato.',
      });
    }
  },
};
