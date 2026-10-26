import { createCatalogosState } from './state/catalogosState.js';

// Estado compartido por los módulos; cada dominio se incorpora de forma independiente.
export const appState = {
  catalogos: createCatalogosState(),
};
