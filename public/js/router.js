// Relaciona rutas hash con sus vistas HTML y módulos JavaScript.
import { closeOverlay } from './utils.js';

const routes = {
  contratos: {
    title: 'Consulta de contratos',
    view: '/views/contratos.html',
    loadModule: () => import('./modules/contratos.js'),
  },
  dashboard: {
    title: 'Dashboard',
    view: '/views/dashboard.html',
    loadModule: () => import('./modules/dashboard.js'),
  },
  ejemplo: {
    title: 'Vista de ejemplo',
    view: '/views/example.html',
    loadModule: () => import('./modules/example.js'),
  },
  compras: {
    title: 'Compras',
    view: '/views/compras.html',
    loadModule: () => import('./modules/compras.js')
  }
};

const viewCache = new Map();
let started = false;
let loadSequence = 0;

function getRouteName() {
  return window.location.hash.slice(1).replace(/^\/+/, '') || 'dashboard';
}

function updateShell(routeName, title) {
  document.querySelectorAll('.nav-item[data-page]').forEach((link) => {
    const isActive = link.dataset.page === routeName;
    link.classList.toggle('active', isActive);
    if (isActive) link.setAttribute('aria-current', 'page');
    else link.removeAttribute('aria-current');
  });

  document.getElementById('topbarTitle').textContent = title;
}

function showError(message) {
  const container = document.getElementById('pageContainer');
  container.innerHTML = `
    <div class="empty-state" role="alert">
      <i class="bi bi-exclamation-triangle" aria-hidden="true"></i>
      <p class="router-error-message"></p>
    </div>`;
  container.querySelector('.router-error-message').textContent = message;
}

// Carga la vista activa e inicializa su módulo después de insertar el HTML.
async function loadCurrentRoute() {
  const sequence = ++loadSequence;
  const routeName = getRouteName();
  const route = routes[routeName];
  const container = document.getElementById('pageContainer');

  updateShell(routeName, route?.title ?? 'Página no encontrada');

  if (!route) {
    container.setAttribute('aria-busy', 'false');
    showError('La vista solicitada no existe.');
    return;
  }

  container.setAttribute('aria-busy', 'true');
  container.innerHTML = '<div class="empty-state" role="status"><span class="spinner-custom spinner-sm" aria-hidden="true"></span> Cargando vista…</div>';

  try {
    let view = viewCache.get(routeName);
    if (!view) {
      const response = await fetch(route.view);
      if (!response.ok) throw new Error(`No se pudo cargar ${route.view} (${response.status}).`);
      view = await response.text();
      viewCache.set(routeName, view);
    }

    if (sequence !== loadSequence) return;
    container.innerHTML = view;

    const viewModule = await route.loadModule();
    if (sequence !== loadSequence) return;
    await viewModule.init();
  } catch (error) {
    if (sequence !== loadSequence) return;
    console.error('Error al cargar la vista:', error);
    showError('No se pudo cargar la vista. Intenta actualizar la página.');
  } finally {
    if (sequence === loadSequence) container.setAttribute('aria-busy', 'false');
  }
}

// Se registra una sola vez; hashchange también cubre Atrás, Adelante y refresco.
export function startRouter() {
  if (started) return;
  started = true;
  window.addEventListener('hashchange', loadCurrentRoute);
  document.addEventListener('keydown', (event) => {
    if (event.key === 'Escape') {
      document.querySelectorAll('.modal-overlay.open').forEach((modal) => closeOverlay(modal.id));
    }
  });

  if (!window.location.hash) window.history.replaceState(null, '', '#/dashboard');
  void loadCurrentRoute();
}
