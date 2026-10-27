function apiError(message, status) {
  return Object.assign(new Error(message), { status });
}

function disponibilidad(productos) {
  const ids = new Set();
  const validos = Array.isArray(productos) && productos.length > 0 && productos.every(p => {
    if (!p || !Number.isInteger(p.id_modelo) || p.id_modelo < 1 || p.id_modelo > 2147483647 || ids.has(p.id_modelo) ||
        typeof p.modelo !== 'string' || !p.modelo.trim() || !Number.isInteger(p.cantidad) || p.cantidad < 1 || p.cantidad > 2147483647) return false;
    ids.add(p.id_modelo);return true;
  });
  return { modelos_disponibles: validos, aviso_modelos: validos ? ''
    : Array.isArray(productos) && productos.length === 0 ? 'Sin modelos disponibles' : 'Modelos incompletos o cantidades inválidas' };
}

async function consultarApi(params) {
    let url;
    try {
      url = new URL(process.env.CONTRATOS_API_URL);
      if (!['http:', 'https:'].includes(url.protocol)) throw new Error();
    } catch {
      throw apiError('Configura CONTRATOS_API_URL con la dirección de la API de contratos.', 503);
    }
    url.searchParams.delete('id');
    url.searchParams.delete('estado_trabajo');
    url.searchParams.delete('listado');
    Object.entries(params).forEach(([key,value]) => url.searchParams.set(key,value));

    let response;
    let data;
    try {
      response = await fetch(url, { signal: AbortSignal.timeout(10000), headers: { Accept: 'application/json' } });
      if (response.status === 404) {
        let detail;
        try { detail = await response.json(); } catch { /* Apache puede devolver HTML. */ }
        if (detail?.error === 'Contrato no encontrado') {
          throw apiError('Contrato no encontrado.', 404);
        }
        throw apiError('No se encontró el endpoint PHP. Revisa la dirección CONTRATOS_API_URL en .env.', 502);
      }
      if (!response.ok) throw apiError('El sistema de contratos no pudo completar la consulta.', 502);
      data = await response.json();
    } catch (error) {
      if (error.status) throw error;
      if (error.name === 'TimeoutError') throw apiError('El sistema de contratos tardó demasiado en responder. Intenta nuevamente.', 504);
      throw apiError('No se pudo obtener una respuesta válida del sistema de contratos.', 502);
    }

    return data;
}

export const contratoService = {
  async listarEscolaresEnProceso() {
    const data = await consultarApi({ listado: 'escolares_en_proceso' });
    if (!Array.isArray(data)) throw apiError('El sistema de contratos devolvió un listado inválido.', 502);
    const ids = new Set();
    return data.filter(c => {
      const servicio = typeof c?.promocion === 'string'
        ? c.promocion.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().trim() : '';
      if (!c || !Number.isSafeInteger(c.id_contrato) || c.id_contrato <= 0 ||
          typeof c.colegio !== 'string' || !c.colegio.trim() || c.estado_trabajo !== 'en_proceso' ||
          (servicio && servicio !== 'promocion') || ids.has(c.id_contrato)) return false;
      ids.add(c.id_contrato);
      return true;
    }).map(c => ({ id_contrato: c.id_contrato, colegio: c.colegio,
      cliente: typeof c.cliente === 'string' ? c.cliente : '',
      fecha_entrega: typeof c.fecha_entrega === 'string' ? c.fecha_entrega : null,
      ...disponibilidad(c.productos) }));
  },
  async obtenerPorId(id) {
    const data = await consultarApi({ id });

    if (!data || String(data.id_contrato) !== String(Number(id)) ||
        typeof data.cliente !== 'string' ||
        !(data.fecha_entrega === null || typeof data.fecha_entrega === 'string') ||
        !Array.isArray(data.productos) || data.productos.some((producto) =>
          !producto || typeof producto.modelo !== 'string' ||
          !Number.isSafeInteger(producto.cantidad) || producto.cantidad < 0)) {
      throw apiError('El sistema de contratos devolvió datos incompletos o inválidos.', 502);
    }

    return { ...data, ...disponibilidad(data.productos) };
  },
};
