import { kardexService } from '../services/kardexService.js';

const DEFAULT_LIMIT = 20;
const MAX_LIMIT = 100;

function enteroPositivo(value) {
  return typeof value === 'string' && /^\d+$/.test(value) &&
    Number.isSafeInteger(Number(value)) && Number(value) > 0;
}

function fechaValida(value) {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const parsed = new Date(`${value}T00:00:00.000Z`);
  return !Number.isNaN(parsed.valueOf()) && parsed.toISOString().slice(0, 10) === value;
}

function textoOpcionalValido(value) {
  return value === undefined || (typeof value === 'string' && value.trim().length > 0);
}

function validarConsulta(query) {
  const { nombre_modelo: nombreModelo, id_modelo: idModelo, tipo, fecha_desde: fechaDesde,
    fecha_hasta: fechaHasta, referencia, pagina = '1', limite = String(DEFAULT_LIMIT) } = query;

  if (nombreModelo !== undefined && !textoOpcionalValido(nombreModelo)) {
    return 'El nombre del modelo debe ser un texto no vacío.';
  }
  if (idModelo !== undefined && !enteroPositivo(idModelo)) {
    return 'El identificador del modelo debe ser un entero mayor que cero.';
  }
  if (tipo !== undefined && !['Entrada', 'Salida'].includes(tipo)) {
    return 'El tipo debe ser Entrada o Salida.';
  }
  if (fechaDesde !== undefined && !fechaValida(fechaDesde)) {
    return 'La fecha inicial debe tener formato YYYY-MM-DD y ser válida.';
  }
  if (fechaHasta !== undefined && !fechaValida(fechaHasta)) {
    return 'La fecha final debe tener formato YYYY-MM-DD y ser válida.';
  }
  if (fechaDesde !== undefined && fechaHasta !== undefined && fechaDesde > fechaHasta) {
    return 'La fecha inicial no puede ser posterior a la fecha final.';
  }
  if (!textoOpcionalValido(referencia)) {
    return 'La referencia debe ser un texto no vacío.';
  }
  if (!enteroPositivo(pagina)) {
    return 'La página debe ser un entero mayor que cero.';
  }
  if (!enteroPositivo(limite) || Number(limite) > MAX_LIMIT) {
    return `El límite debe ser un entero entre 1 y ${MAX_LIMIT}.`;
  }
  if (!Number.isSafeInteger((Number(pagina) - 1) * Number(limite))) {
    return 'La combinación de página y límite excede el rango permitido.';
  }
  return null;
}

export const kardexController = {
  async listarModelos(req, res) {
    res.set('Cache-Control', 'no-store');
    try {
      const modelos = await kardexService.listarModelos();
      return res.json({ success: true, data: modelos });
    } catch (error) {
      console.error('Consulta de modelos del Kardex:', error);
      return res.status(500).json({ success: false, message: 'No se pudieron consultar los modelos del Kardex.' });
    }
  },

  async listar(req, res) {
    const validationError = validarConsulta(req.query);
    if (validationError) {
      return res.status(400).json({ success: false, message: validationError });
    }

    const { nombre_modelo: nombreModelo, id_modelo: idModelo, tipo, fecha_desde: fechaDesde,
      fecha_hasta: fechaHasta, referencia, pagina = '1', limite = String(DEFAULT_LIMIT) } = req.query;

    res.set('Cache-Control', 'no-store');
    try {
      const result = await kardexService.listar({
        nombreModelo: nombreModelo?.trim(),
        idModelo: idModelo === undefined ? null : Number(idModelo),
        tipo: tipo ?? null,
        fechaDesde: fechaDesde ?? null,
        fechaHasta: fechaHasta ?? null,
        referencia: referencia?.trim(),
        pagina: Number(pagina),
        limite: Number(limite),
      });
      return res.json({ success: true, ...result });
    } catch (error) {
      console.error('Consulta del Kardex:', error);
      return res.status(500).json({ success: false, message: 'No se pudo consultar el Kardex.' });
    }
  },
};
