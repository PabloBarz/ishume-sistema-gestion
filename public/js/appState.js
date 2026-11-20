import { createCatalogosState } from './state/catalogosState.js';

// Estado compartido por los módulos; cada dominio se incorpora de forma independiente.
export const appState = {
  auth: {
    user: null,
    permissions: new Set(),
    status: 'checking',
    initialized: false,
  },
  catalogos: createCatalogosState(),
};
