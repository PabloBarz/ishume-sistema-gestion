import { http } from '../utils.js';

const endpoints = {
  categorias: '/api/categorias',
  disenios: '/api/disenios',
  modelos: '/api/modelos',
  productos: '/api/inventario-productos',
};

// Caché compartida de catálogos; permanece independiente de la caché HTML del router.
export function createCatalogosState(request = http) {
  const catalogs = Object.fromEntries(Object.keys(endpoints).map((name) => [name, {
    data: null,
    loaded: false,
    promise: null,
    error: null,
    version: 0,
  }]));

  function get(name, { reload = false } = {}) {
    const entry = catalogs[name];
    if (!entry) return Promise.reject(new Error(`Catálogo desconocido: ${name}`));
    if (reload) invalidate(name);
    if (entry.promise) return entry.promise;
    if (entry.loaded) return Promise.resolve(entry.data);

    const version = entry.version;
    const outcome = request(endpoints[name]).then(
      (response) => ({ response }),
      (error) => ({ error }),
    );
    const promise = outcome.then((result) => {
      // Invalidar durante una petición impide que su respuesta antigua llegue al consumidor.
      if (entry.version !== version) return get(name);
      if (result.error) {
        entry.error = result.error;
        throw result.error;
      }

      const { response } = result;
      if (!response?.success || !Array.isArray(response.data)) {
        const error = new Error('El servidor devolvió una respuesta inválida para el catálogo.');
        entry.error = error;
        throw error;
      }

      entry.data = response.data;
      entry.loaded = true;
      entry.error = null;
      return entry.data;
    }).finally(() => {
      if (entry.promise === promise) entry.promise = null;
    });

    entry.promise = promise;
    return promise;
  }

  function invalidate(name) {
    const names = name ? [name] : Object.keys(endpoints);
    for (const catalogName of names) {
      const entry = catalogs[catalogName];
      if (!entry) throw new Error(`Catálogo desconocido: ${catalogName}`);
      entry.version += 1;
      entry.data = null;
      entry.loaded = false;
      entry.error = null;
      entry.promise = null;
    }
  }

  function getStatus(name) {
    const entry = catalogs[name];
    if (!entry) throw new Error(`Catálogo desconocido: ${name}`);
    return { data: entry.data, loaded: entry.loaded, loading: Boolean(entry.promise), error: entry.error };
  }

  return { get, reload: (name) => get(name, { reload: true }), invalidate, getStatus };
}
