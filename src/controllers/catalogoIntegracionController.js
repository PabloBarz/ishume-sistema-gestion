import { modeloService } from '../services/modeloService.js';

export function createCatalogIntegrationController(service = modeloService) {
  return {
    async listar(_req, res) {
      try {
        const data = await service.obtenerCatalogoIntegracion();
        return res.status(200).json({ success: true, data });
      } catch {
        return res.status(500).json({ success: false, message: 'Error interno al consultar el catálogo.' });
      }
    },
  };
}

export const catalogoIntegracionController = createCatalogIntegrationController();
