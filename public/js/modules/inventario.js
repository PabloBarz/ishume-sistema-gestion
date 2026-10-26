import { formatNumber } from '../utils.js';
import { appState } from '../appState.js';
import { createCategoriesModule } from './inventario/categorias.js';
import { renderReadonlyCatalog } from './inventario/catalogos.js';

const catalogLabels = {
  productos: 'Productos',
  categorias: 'Categorías',
  disenios: 'Diseños',
  modelos: 'Modelos',
};

const catalogCaptions = {
  productos: 'Productos, precios, existencias y datos de su modelo',
  categorias: 'Categorías activas e inactivas registradas',
  disenios: 'Diseños y sus categorías relacionadas',
  modelos: 'Modelos y sus diseños y categorías relacionadas',
};

let activeCatalog = 'productos';

function renderStats(root) {
  const productState = appState.catalogos.getStatus('productos');
  const categoryState = appState.catalogos.getStatus('categorias');
  root.querySelector('[data-stat="products"]').textContent = productState.loaded ? formatNumber(productState.data.length) : productState.error ? '—' : 'Cargando…';
  root.querySelector('[data-stat="categories"]').textContent = categoryState.loaded ? formatNumber(categoryState.data.length) : categoryState.error ? '—' : 'Cargando…';
  const units = root.querySelector('[data-stat="units"]');
  if (!productState.loaded) {
    units.textContent = productState.error ? '—' : 'Cargando…';
    return;
  }
  const total = productState.data.reduce((sum, product) => {
    const quantity = Number(product.stock_actual);
    return Number.isFinite(quantity) ? sum + quantity : sum;
  }, 0);
  units.textContent = formatNumber(total);
}

function renderCatalogState(panel, catalog, status, onRetry) {
  if (status.loading || (!status.loaded && !status.error)) {
    const loading = document.createElement('div');
    loading.className = 'empty-state';
    loading.setAttribute('role', 'status');
    loading.textContent = `Cargando ${catalogLabels[catalog].toLocaleLowerCase('es-PE')}…`;
    panel.append(loading);
    return true;
  }
  if (status.error) {
    const error = document.createElement('div');
    error.className = 'empty-state inventory-error';
    error.setAttribute('role', 'alert');
    const message = document.createElement('p');
    message.textContent = `No se pudieron cargar ${catalogLabels[catalog].toLocaleLowerCase('es-PE')}. ${status.error.message || 'Verifica la conexión e intenta nuevamente.'}`;
    const retry = document.createElement('button');
    retry.className = 'btn-cancel';
    retry.type = 'button';
    retry.dataset.retryCatalog = catalog;
    retry.textContent = 'Reintentar';
    retry.addEventListener('click', onRetry);
    error.append(message, retry);
    panel.append(error);
    return true;
  }
  if (!status.data.length) {
    const empty = document.createElement('div');
    empty.className = 'empty-state';
    empty.setAttribute('role', 'status');
    empty.textContent = `No hay ${catalogLabels[catalog].toLocaleLowerCase('es-PE')} registrados.`;
    panel.append(empty);
    return true;
  }
  return false;
}

function selectCatalog(root, catalog, categoriesModule) {
  activeCatalog = catalog;
  root.querySelectorAll('.inventory-tab').forEach((tab) => {
    const selected = tab.dataset.catalog === catalog;
    tab.classList.toggle('active', selected);
    tab.setAttribute('aria-selected', String(selected));
    tab.tabIndex = selected ? 0 : -1;
  });
  categoriesModule.setVisible(catalog === 'categorias');
  renderCatalog(root, catalog, categoriesModule);
}

function renderCatalog(root, catalog, categoriesModule) {
  if (!root.isConnected) return;
  const panel = root.querySelector('#inventory-panel');
  const status = appState.catalogos.getStatus(catalog);
  panel.setAttribute('aria-labelledby', `tab-${catalog}`);
  root.querySelector('#inventory-caption').textContent = catalogCaptions[catalog];
  panel.replaceChildren();
  if (renderCatalogState(panel, catalog, status, () => loadCatalog(catalog, root, categoriesModule))) return;

  if (catalog === 'categorias') {
    const filtered = categoriesModule.render();
    if (!filtered.querySelector('tbody tr')) {
      const empty = document.createElement('div');
      empty.className = 'empty-state';
      empty.setAttribute('role', 'status');
      empty.textContent = status.data.length
        ? 'No hay categorías que coincidan con la búsqueda y el estado seleccionados.'
        : 'No hay categorías registradas.';
      panel.append(empty);
      return;
    }
    panel.append(filtered);
    return;
  }
  panel.append(renderReadonlyCatalog(catalog, status.data));
}

function loadCatalog(catalog, root, categoriesModule) {
  return appState.catalogos.get(catalog)
    .then(() => {
      if (!root.isConnected) return;
      renderStats(root);
      renderCatalog(root, activeCatalog, categoriesModule);
    })
    .catch(() => {
      if (!root.isConnected) return;
      renderStats(root);
      renderCatalog(root, activeCatalog, categoriesModule);
    });
}

export async function init() {
  const root = document.querySelector('.inventory-page');
  if (!root) return;

  function updateActiveCatalog({ renderOnly = false, nameChanged = false } = {}) {
    if (!root.isConnected) return;
    if (renderOnly) {
      renderCatalog(root, activeCatalog, categoriesModule);
      return;
    }
    renderStats(root);
    if (activeCatalog === 'categorias') renderCatalog(root, activeCatalog, categoriesModule);
    else void loadCatalog(activeCatalog, root, categoriesModule);
  }

  const categoriesModule = createCategoriesModule(root, {
    isActive: () => activeCatalog === 'categorias',
    onChanged: updateActiveCatalog,
  });

  const tablist = root.querySelector('.inventory-tablist');
  tablist.addEventListener('click', (event) => {
    const tab = event.target.closest('.inventory-tab');
    if (!tab) return;
    selectCatalog(root, tab.dataset.catalog, categoriesModule);
    void loadCatalog(tab.dataset.catalog, root, categoriesModule);
  });
  tablist.addEventListener('keydown', (event) => {
    if (!['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(event.key)) return;
    const tabs = [...root.querySelectorAll('.inventory-tab')];
    const currentIndex = tabs.findIndex((tab) => tab.dataset.catalog === activeCatalog);
    const nextIndex = event.key === 'Home' ? 0
      : event.key === 'End' ? tabs.length - 1
        : (currentIndex + (event.key === 'ArrowRight' ? 1 : tabs.length - 1)) % tabs.length;
    event.preventDefault();
    selectCatalog(root, tabs[nextIndex].dataset.catalog, categoriesModule);
    tabs[nextIndex].focus();
    void loadCatalog(tabs[nextIndex].dataset.catalog, root, categoriesModule);
  });

  selectCatalog(root, activeCatalog, categoriesModule);
  // Productos es la pestaña inicial; categorías se cargan para su indicador. El resto es lazy.
  await Promise.all([loadCatalog(activeCatalog, root, categoriesModule), loadCatalog('categorias', root, categoriesModule)]);
}
