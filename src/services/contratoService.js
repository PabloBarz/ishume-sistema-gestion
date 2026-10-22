function apiError(message, status) {
  return Object.assign(new Error(message), { status });
}

export const contratoService = {
  async obtenerPorId(id) {
    let url;
    try {
      url = new URL(process.env.CONTRATOS_API_URL);
      if (!['http:', 'https:'].includes(url.protocol)) throw new Error();
    } catch {
      throw apiError('Configura CONTRATOS_API_URL con la dirección de la API de contratos.', 503);
    }
    url.searchParams.set('id', id);

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

    if (!data || String(data.id_contrato) !== String(Number(id)) ||
        typeof data.cliente !== 'string' ||
        !(data.fecha_entrega === null || typeof data.fecha_entrega === 'string') ||
        !Array.isArray(data.productos) || data.productos.some((producto) =>
          !producto || typeof producto.modelo !== 'string' ||
          !Number.isSafeInteger(producto.cantidad) || producto.cantidad < 0)) {
      throw apiError('El sistema de contratos devolvió datos incompletos o inválidos.', 502);
    }

    return data;
  },
};
