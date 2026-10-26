import { http } from './utils.js';

const endpoints = {
  categorias: '/api/categorias',
  disenios: '/api/disenios',
  modelos: '/api/modelos',
  productos: '/api/inventario-productos',
};

// Cache in-memory separada de viewCache, con deduplicación y recarga por catálogo.
export function createInventoryAppState(request = http) {
  const catalogs = Object.fromEntries(Object.keys(endpoints).map((name) => [name, {
    data: null,
    loaded: false,
    promise: null,
    error: null,
    version: 0,
  }]));

  function getCatalog(name, { reload = false } = {}) {
    const entry = catalogs[name];
    if (!entry) return Promise.reject(new Error(`Catálogo desconocido: ${name}`));
    if (reload) invalidate(name);
    if (entry.promise) return entry.promise;
    if (entry.loaded) return Promise.resolve(entry.data);

    const version = entry.version;
    const promise = request(endpoints[name]).then((response) => {
      if (!response?.success || !Array.isArray(response.data)) {
        throw new Error('El servidor devolvió una respuesta inválida para el catálogo.');
      }
      if (entry.version === version) {
        entry.data = response.data;
        entry.loaded = true;
        entry.error = null;
      }
      return response.data;
    }).catch((error) => {
      if (entry.version === version) entry.error = error;
      throw error;
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

  return { getCatalog, invalidate, getStatus };
}

export const inventoryAppState = createInventoryAppState();
