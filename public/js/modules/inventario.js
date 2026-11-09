import { formatNumber } from '../utils.js';
import { appState } from '../appState.js';
import { createInventoryModal } from '../components/inventoryModal.js';
import { createCategoriesModule } from './inventario/categorias.js';
import { createDesignsModule } from './inventario/disenios.js';
import { createModelsModule } from './inventario/modelos.js';
import { createProductsModule } from './inventario/productos.js';

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
  productos: 'Productos, precios referenciales y stock actual',
};

let activeCatalog = 'productos';

function renderStats(root) {
  const productState = appState.catalogos.getStatus('productos');
  const categoryState = appState.catalogos.getStatus('categorias');
  root.querySelector('[data-stat="products"]').textContent = productState.loaded ? formatNumber(productState.data.length) : productState.loading ? 'Cargando…' : '—';
  root.querySelector('[data-stat="categories"]').textContent = categoryState.loaded ? formatNumber(categoryState.data.length) : categoryState.loading ? 'Cargando…' : '—';
  const units = root.querySelector('[data-stat="units"]');
  if (!productState.loaded) {
    units.textContent = productState.loading ? 'Cargando…' : '—';
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

function selectCatalog(root, catalog, categoriesModule, designsModule, modelsModule, productsModule) {
  activeCatalog = catalog;
  root.querySelectorAll('.inventory-tab').forEach((tab) => {
    const selected = tab.dataset.catalog === catalog;
    tab.classList.toggle('active', selected);
    tab.setAttribute('aria-selected', String(selected));
    tab.tabIndex = selected ? 0 : -1;
  });
  categoriesModule.setVisible(catalog === 'categorias');
  designsModule.setVisible(catalog === 'disenios');
  modelsModule.setVisible(catalog === 'modelos');
  productsModule.setVisible(catalog === 'productos');
  const search = root.querySelector('#inventory-search');
  const searchable = catalog === 'productos' || catalog === 'categorias' || catalog === 'disenios' || catalog === 'modelos';
  search.disabled = !searchable;
  search.placeholder = catalog === 'productos' ? 'Buscar por modelo o SKU…'
    : catalog === 'categorias' ? 'Buscar por nombre de categoría…'
      : catalog === 'disenios' ? 'Buscar por nombre de diseño…'
        : catalog === 'modelos' ? 'Buscar por nombre de modelo…'
      : 'Búsqueda disponible en una próxima fase';
  search.value = catalog === 'productos' ? productsModule.getSearch()
    : catalog === 'categorias' ? categoriesModule.getSearch()
    : catalog === 'disenios' ? designsModule.getSearch()
      : catalog === 'modelos' ? modelsModule.getSearch() : '';
  root.querySelector('#inventory-filter-placeholder').hidden = searchable;
  renderCatalog(root, catalog, categoriesModule, designsModule, modelsModule, productsModule);
}

function renderCatalog(root, catalog, categoriesModule, designsModule, modelsModule, productsModule) {
  if (!root.isConnected) return;
  const panel = root.querySelector('#inventory-panel');
  const status = appState.catalogos.getStatus(catalog);
  panel.setAttribute('aria-labelledby', `tab-${catalog}`);
  root.querySelector('#inventory-caption').textContent = catalogCaptions[catalog];
  panel.replaceChildren();
  if (renderCatalogState(panel, catalog, status, () => loadCatalog(catalog, root, categoriesModule, designsModule, modelsModule, productsModule))) return;

  if (catalog === 'productos') {
    const filtered = productsModule.render();
    if (!filtered.querySelector('tbody tr')) {
      const empty = document.createElement('div');
      empty.className = 'empty-state';
      empty.setAttribute('role', 'status');
      empty.textContent = status.data.length
        ? 'No hay productos que coincidan con la búsqueda y los filtros seleccionados.'
        : 'No hay productos registrados.';
      panel.append(empty);
      return;
    }
    panel.append(filtered);
    return;
  }

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
  if (catalog === 'disenios') {
    const filtered = designsModule.render();
    if (!filtered.querySelector('tbody tr')) {
      const empty = document.createElement('div');
      empty.className = 'empty-state';
      empty.setAttribute('role', 'status');
      empty.textContent = status.data.length
        ? 'No hay diseños que coincidan con la búsqueda y los filtros seleccionados.'
        : 'No hay diseños registrados.';
      panel.append(empty);
      return;
    }
    panel.append(filtered);
    return;
  }
  if (catalog === 'modelos') {
    const filtered = modelsModule.render();
    if (!filtered.querySelector('tbody tr')) {
      const empty = document.createElement('div');
      empty.className = 'empty-state';
      empty.setAttribute('role', 'status');
      empty.textContent = status.data.length
        ? 'No hay modelos que coincidan con la búsqueda y los filtros seleccionados.'
        : 'No hay modelos registrados.';
      panel.append(empty);
      return;
    }
    panel.append(filtered);
    return;
  }
}

function loadCatalog(catalog, root, categoriesModule, designsModule, modelsModule, productsModule) {
  return appState.catalogos.get(catalog)
    .then(() => {
      if (!root.isConnected) return;
      renderStats(root);
      renderCatalog(root, activeCatalog, categoriesModule, designsModule, modelsModule, productsModule);
    })
    .catch(() => {
      if (!root.isConnected) return;
      renderStats(root);
      renderCatalog(root, activeCatalog, categoriesModule, designsModule, modelsModule, productsModule);
    });
}

export async function init() {
  const root = document.querySelector('.inventory-page');
  if (!root) return;

  let modelsModule;
  let productsModule;
  function updateActiveCatalog({ renderOnly = false, refreshStats = false } = {}) {
    if (!root.isConnected) return;
    if (renderOnly) {
      if (refreshStats) renderStats(root);
      renderCatalog(root, activeCatalog, categoriesModule, designsModule, modelsModule, productsModule);
      return;
    }
    renderStats(root);
    if (activeCatalog === 'categorias') renderCatalog(root, activeCatalog, categoriesModule, designsModule, modelsModule, productsModule);
    else void loadCatalog(activeCatalog, root, categoriesModule, designsModule, modelsModule, productsModule);
  }

  const modal = createInventoryModal(root);
  const categoriesModule = createCategoriesModule(root, {
    isActive: () => activeCatalog === 'categorias',
    onChanged: updateActiveCatalog,
    modal,
  });
  const designsModule = createDesignsModule(root, {
    isActive: () => activeCatalog === 'disenios',
    onChanged: updateActiveCatalog,
    modal,
  });
  modelsModule = createModelsModule(root, {
    isActive: () => activeCatalog === 'modelos',
    onChanged: updateActiveCatalog,
    modal,
  });
  productsModule = createProductsModule(root, {
    isActive: () => activeCatalog === 'productos',
    onChanged: updateActiveCatalog,
    modal,
  });

  root.querySelector('#inventory-search').addEventListener('input', (event) => {
    if (activeCatalog === 'productos') productsModule.setSearch(event.target.value);
    else if (activeCatalog === 'categorias') categoriesModule.setSearch(event.target.value);
    else if (activeCatalog === 'disenios') designsModule.setSearch(event.target.value);
    else if (activeCatalog === 'modelos') modelsModule.setSearch(event.target.value);
    else return;
    updateActiveCatalog({ renderOnly: true });
  });

  root.querySelector('#inventory-panel').addEventListener('click', (event) => {
    const categoryButton = event.target.closest('[data-category-action]');
    if (categoryButton) {
      categoriesModule.handleAction(categoryButton.dataset.categoryAction, categoryButton.dataset.categoryId, categoryButton);
      return;
    }
    const designButton = event.target.closest('[data-design-action]');
    if (designButton) designsModule.handleAction(designButton.dataset.designAction, designButton.dataset.designId, designButton);
    const modelButton = event.target.closest('[data-model-action]');
    if (modelButton) modelsModule.handleAction(modelButton.dataset.modelAction, modelButton.dataset.modelId, modelButton);
    const productButton = event.target.closest('[data-product-action]');
    if (productButton) productsModule.handleAction(productButton.dataset.productAction, productButton.dataset.productId, productButton);
  });

  const tablist = root.querySelector('.inventory-tablist');
  tablist.addEventListener('click', (event) => {
    const tab = event.target.closest('.inventory-tab');
    if (!tab) return;
    selectCatalog(root, tab.dataset.catalog, categoriesModule, designsModule, modelsModule, productsModule);
    void loadCatalog(tab.dataset.catalog, root, categoriesModule, designsModule, modelsModule, productsModule);
  });
  tablist.addEventListener('keydown', (event) => {
    if (!['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(event.key)) return;
    const tabs = [...root.querySelectorAll('.inventory-tab')];
    const currentIndex = tabs.findIndex((tab) => tab.dataset.catalog === activeCatalog);
    const nextIndex = event.key === 'Home' ? 0
      : event.key === 'End' ? tabs.length - 1
        : (currentIndex + (event.key === 'ArrowRight' ? 1 : tabs.length - 1)) % tabs.length;
    event.preventDefault();
    selectCatalog(root, tabs[nextIndex].dataset.catalog, categoriesModule, designsModule, modelsModule, productsModule);
    tabs[nextIndex].focus();
    void loadCatalog(tabs[nextIndex].dataset.catalog, root, categoriesModule, designsModule, modelsModule, productsModule);
  });

  selectCatalog(root, activeCatalog, categoriesModule, designsModule, modelsModule, productsModule);
  // Productos es la pestaña inicial; categorías se cargan para su indicador. El resto es lazy.
  await Promise.all([
    loadCatalog(activeCatalog, root, categoriesModule, designsModule, modelsModule, productsModule),
    loadCatalog('categorias', root, categoriesModule, designsModule, modelsModule, productsModule),
  ]);
}
