import { modeloService } from '../services/modeloService.js';

const EDUCATION_LEVELS = new Set(['INICIAL', 'SUPERIOR']);
const DEFAULT_PAGE = 1;
const DEFAULT_LIMIT = 50;
const MAX_LIMIT = 100;

function parsePositiveInteger(value) {
  if (typeof value !== 'string' || !/^\d+$/.test(value)) return null;
  const number = Number(value);
  return Number.isSafeInteger(number) && number > 0 ? number : null;
}

function parsePagination(value, fallback, max = Number.MAX_SAFE_INTEGER) {
  if (value === undefined) return fallback;
  const parsed = parsePositiveInteger(value);
  return parsed !== null && parsed <= max ? parsed : null;
}

function invalid(res, message) {
  return res.status(400).json({ success: false, message });
}

export function createCatalogIntegrationController(service = modeloService) {
  return {
    async listar(req, res) {
      const query = req.query ?? {};
      if (query.buscar !== undefined && (typeof query.buscar !== 'string' || query.buscar.length > 100)) {
        return invalid(res, 'El parámetro buscar debe ser texto de hasta 100 caracteres.');
      }
      const buscar = query.buscar === undefined ? null : query.buscar.trim();
      for (const [key, value] of [['id_categoria', query.id_categoria], ['id_proveedor', query.id_proveedor]]) {
        if (value !== undefined && parsePositiveInteger(value) === null) {
          return invalid(res, `El parámetro ${key} debe ser un entero positivo.`);
        }
      }
      let nivelEducativo = null;
      if (query.nivel_educativo !== undefined) {
        if (typeof query.nivel_educativo !== 'string') {
          return invalid(res, 'El nivel educativo no es válido.');
        }
        nivelEducativo = query.nivel_educativo.trim().toUpperCase();
        if (!EDUCATION_LEVELS.has(nivelEducativo)) return invalid(res, 'El nivel educativo no es válido.');
      }

      const pagina = parsePagination(query.pagina, DEFAULT_PAGE);
      const limite = parsePagination(query.limite, DEFAULT_LIMIT, MAX_LIMIT);
      if (pagina === null) return invalid(res, 'El parámetro pagina debe ser un entero positivo válido.');
      if (limite === null) return invalid(res, `El parámetro limite debe ser un entero entre 1 y ${MAX_LIMIT}.`);
      if (!Number.isSafeInteger((pagina - 1) * limite)) {
        return invalid(res, 'La combinación de pagina y limite es demasiado grande.');
      }

      try {
        const result = await service.obtenerCatalogoIntegracion({
          buscar: buscar || null,
          idCategoria: query.id_categoria === undefined ? null : Number(query.id_categoria),
          idProveedor: query.id_proveedor === undefined ? null : Number(query.id_proveedor),
          nivelEducativo,
          pagina,
          limite,
        });
        return res.status(200).json({ success: true, data: result.data, pagination: result.pagination });
      } catch {
        return res.status(500).json({ success: false, message: 'Error interno al consultar el catálogo.' });
      }
    },

    async obtener(req, res) {
      const id = parsePositiveInteger(req.params?.id);
      if (id === null) return invalid(res, 'El identificador debe ser un entero positivo.');

      try {
        const model = await service.obtenerCatalogoIntegracionPorId(id);
        if (!model) return res.status(404).json({ success: false, message: 'Modelo no encontrado.' });
        return res.status(200).json({ success: true, data: model });
      } catch {
        return res.status(500).json({ success: false, message: 'Error interno al consultar el modelo.' });
      }
    },
  };
}

export const catalogoIntegracionController = createCatalogIntegrationController();
