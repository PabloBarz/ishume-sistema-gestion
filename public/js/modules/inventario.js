import { formatCurrencyPEN, formatNumber } from '../utils.js';
import { inventoryAppState } from '../inventarioAppState.js';

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

function makeCell(value, secondary = '') {
  const cell = document.createElement('td');
  if (secondary) {
    const primary = document.createElement('span');
    primary.className = 'cell-primary';
    primary.textContent = String(value ?? '—');
    const detail = document.createElement('span');
    detail.className = 'cell-secondary';
    detail.textContent = secondary;
    cell.append(primary, detail);
  } else {
    cell.textContent = String(value ?? '—');
  }
  return cell;
}

function makeStatusCell(value) {
  const cell = document.createElement('td');
  const badge = document.createElement('span');
  const active = Number(value) === 1;
  badge.className = `badge ${active ? 'badge-success' : 'badge-danger'}`;
  badge.textContent = active ? 'Activo' : 'Inactivo';
  cell.append(badge);
  return cell;
}

function makeTable(catalog, rows) {
  const columns = {
    productos: ['SKU', 'Modelo', 'Categoría', 'Diseño', 'Nivel educativo', 'Precio', 'Stock', 'Estado', 'Acciones'],
    categorias: ['ID', 'Categoría', 'Estado', 'Acciones'],
    disenios: ['ID', 'Diseño', 'Categoría', 'Estado', 'Acciones'],
    modelos: ['ID', 'Modelo', 'Nivel educativo', 'Diseño', 'Categoría', 'Estado', 'Acciones'],
  }[catalog];

  const wrapper = document.createElement('div');
  wrapper.className = 'table-scroll';
  const table = document.createElement('table');
  table.className = 'table-custom inventory-table';
  const head = document.createElement('thead');
  const headerRow = document.createElement('tr');
  columns.forEach((label) => {
    const header = document.createElement('th');
    header.scope = 'col';
    header.textContent = label;
    headerRow.append(header);
  });
  head.append(headerRow);
  const body = document.createElement('tbody');

  rows.forEach((record) => {
    const row = document.createElement('tr');
    if (catalog === 'productos') {
      row.append(
        makeCell(record.sku),
        makeCell(record.nombre_modelo, `Modelo #${record.id_modelo ?? '—'}`),
        makeCell(record.nombre_categoria, `Categoría #${record.id_categoria ?? '—'}`),
        makeCell(record.nombre_diseno, `Diseño #${record.id_diseno ?? '—'}`),
        makeCell(record.nivel_educativo),
        makeCell(formatCurrencyPEN(record.precio)),
        makeCell(formatNumber(record.stock_actual)),
        makeStatusCell(record.estado),
        makeCell('—'),
      );
    } else if (catalog === 'categorias') {
      row.append(makeCell(record.id_categoria), makeCell(record.nombre_categoria), makeStatusCell(record.estado), makeCell('—'));
    } else if (catalog === 'disenios') {
      row.append(
        makeCell(record.id_diseno), makeCell(record.nombre_diseno),
        makeCell(record.nombre_categoria, `Categoría #${record.id_categoria ?? '—'}`),
        makeStatusCell(record.estado), makeCell('—'),
      );
    } else {
      row.append(
        makeCell(record.id_modelo), makeCell(record.nombre_modelo), makeCell(record.nivel_educativo),
        makeCell(record.nombre_diseno, `Diseño #${record.id_diseno ?? '—'}`),
        makeCell(record.nombre_categoria, `Categoría #${record.id_categoria ?? '—'}`),
        makeStatusCell(record.estado), makeCell('—'),
      );
    }
    body.append(row);
  });

  table.append(head, body);
  wrapper.append(table);
  return wrapper;
}

function renderStats(root) {
  const productState = inventoryAppState.getStatus('productos');
  const categoryState = inventoryAppState.getStatus('categorias');
  const products = root.querySelector('[data-stat="products"]');
  const units = root.querySelector('[data-stat="units"]');
  const categories = root.querySelector('[data-stat="categories"]');

  products.textContent = productState.loaded ? formatNumber(productState.data.length) : productState.error ? '—' : 'Cargando…';
  categories.textContent = categoryState.loaded ? formatNumber(categoryState.data.length) : categoryState.error ? '—' : 'Cargando…';
  if (productState.loaded) {
    const total = productState.data.reduce((sum, product) => {
      const quantity = Number(product.stock_actual);
      return Number.isFinite(quantity) ? sum + quantity : sum;
    }, 0);
    units.textContent = formatNumber(total);
  } else {
    units.textContent = productState.error ? '—' : 'Cargando…';
  }
}

function renderCatalog(root, catalog) {
  if (!root.isConnected) return;
  const panel = root.querySelector('#inventory-panel');
  const status = inventoryAppState.getStatus(catalog);
  panel.setAttribute('aria-labelledby', `tab-${catalog}`);
  root.querySelector('#inventory-caption').textContent = catalogCaptions[catalog];
  panel.replaceChildren();

  if (status.loading || (!status.loaded && !status.error)) {
    const loading = document.createElement('div');
    loading.className = 'empty-state';
    loading.setAttribute('role', 'status');
    loading.textContent = `Cargando ${catalogLabels[catalog].toLocaleLowerCase('es-PE')}…`;
    panel.append(loading);
    return;
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
    error.append(message, retry);
    panel.append(error);
    return;
  }

  if (!status.data.length) {
    const empty = document.createElement('div');
    empty.className = 'empty-state';
    empty.setAttribute('role', 'status');
    empty.textContent = `No hay ${catalogLabels[catalog].toLocaleLowerCase('es-PE')} registrados.`;
    panel.append(empty);
    return;
  }

  panel.append(makeTable(catalog, status.data));
}

function selectCatalog(root, catalog) {
  activeCatalog = catalog;
  root.querySelectorAll('.inventory-tab').forEach((tab) => {
    const selected = tab.dataset.catalog === catalog;
    tab.classList.toggle('active', selected);
    tab.setAttribute('aria-selected', String(selected));
    tab.tabIndex = selected ? 0 : -1;
  });
  renderCatalog(root, catalog);
}

export async function init() {
  const root = document.querySelector('.inventory-page');
  if (!root) return;

  root.querySelector('.inventory-tablist').addEventListener('click', (event) => {
    const tab = event.target.closest('.inventory-tab');
    if (tab) selectCatalog(root, tab.dataset.catalog);
  });
  root.querySelector('.inventory-tablist').addEventListener('keydown', (event) => {
    if (!['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(event.key)) return;
    const tabs = [...root.querySelectorAll('.inventory-tab')];
    const currentIndex = tabs.findIndex((tab) => tab.dataset.catalog === activeCatalog);
    const nextIndex = event.key === 'Home' ? 0
      : event.key === 'End' ? tabs.length - 1
        : (currentIndex + (event.key === 'ArrowRight' ? 1 : tabs.length - 1)) % tabs.length;
    event.preventDefault();
    selectCatalog(root, tabs[nextIndex].dataset.catalog);
    tabs[nextIndex].focus();
  });

  root.querySelector('#inventory-panel').addEventListener('click', async (event) => {
    const retry = event.target.closest('[data-retry-catalog]');
    if (!retry) return;
    const catalog = retry.dataset.retryCatalog;
    inventoryAppState.invalidate(catalog);
    retry.disabled = true;
    await loadCatalog(catalog, root);
  });

  function loadCatalog(catalog, currentRoot) {
    return inventoryAppState.getCatalog(catalog)
      .then(() => {
        renderStats(currentRoot);
        renderCatalog(currentRoot, activeCatalog);
      })
      .catch(() => {
        renderStats(currentRoot);
        renderCatalog(currentRoot, activeCatalog);
      });
  }

  selectCatalog(root, activeCatalog);
  const catalogs = Object.keys(catalogLabels);
  await Promise.all(catalogs.map((catalog) => loadCatalog(catalog, root)));
}
