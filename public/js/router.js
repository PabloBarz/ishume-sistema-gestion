// Relaciona rutas hash con sus vistas y módulos, preservando el router existente.
import { appState } from './appState.js';
import { hasPermission, initializeSession, signOut } from './auth.js';
import { closeOverlay, showToast } from './utils.js';

const routes = {
  'compras/colegios': {
    title: 'Consultar colegios', permission: 'colegios.consultar',
    view: '/views/consultar_colegios.html',
    loadModule: () => import('./module_compras/consultarColegios.js'),
  },
  'inventario/demo-seguimiento': {
    title: 'Seguimiento de entrega', permissions: ['seguimiento_entrega.consultar', 'compras.consultar'],
    view: '/views/seguimiento_entrega_demo.html',
    loadModule: () => import('./module_compras/seguimientoEntregaDemo.js'),
  },
  pagos: {
    title: 'Pagos', permissions: ['pagos.consultar', 'compras.consultar', 'proveedores.consultar'], view: '/views/pagos.html',
    loadModule: () => import('./module_compras/pagos.js'),
  },
  'ordenes/nueva': {
    title: 'Órdenes de compra', permissions: ['colegios.consultar', 'contratos.consultar', 'proveedores.consultar'],
    view: '/views/contratos.html',
    loadModule: () => import('./module_compras/contratos.js'),
  },
  'ordenes/guardadas': {
    title: 'Órdenes guardadas', permission: 'compras.consultar',
    view: '/views/ordenes_guardadas.html',
    loadModule: () => import('./module_compras/ordenes_guardadas.js'),
  },
  dashboard: {
    title: 'Dashboard', permission: 'dashboard.consultar',
    view: '/views/dashboard.html',
    loadModule: () => import('./module_compras/dashboard.js'),
  },
  ejemplo: {
    title: 'Vista de ejemplo', view: '/views/example.html',
    loadModule: () => import('./module_compras/example.js'),
  },
  inventario: {
    title: 'Catálogo', permission: 'inventario.consultar',
    view: '/views/inventario.html',
    loadModule: () => import('./modules/inventario.js'),
  },
  kardex: {
    title: 'Kardex', permission: 'kardex.consultar',
    view: '/views/kardex.html',
    loadModule: () => import('./modules/kardex.js'),
  },
  usuarios: {
    title: 'Administración de usuarios', permission: 'usuarios.consultar', adminOnly: true,
    view: '/views/usuarios.html',
    loadModule: () => import('./module_usuarios/usuarios.js'),
  },
};

const viewCache = new Map();
let started = false;
let loadSequence = 0;
let loginViewCache;
let permissionObserver;

function getRouteName() {
  const name = window.location.hash.slice(1).split('?')[0].replace(/^\/+/, '') || 'dashboard';
  if (name === 'contratos' || name === 'compras') {
    window.history.replaceState(null, '', '#/ordenes/nueva');
    return 'ordenes/nueva';
  }
  return name;
}

function renderMessage(container, title, message, { retry = false } = {}) {
  container.replaceChildren();
  const section = document.createElement('section');
  section.className = 'auth-state-message';
  section.setAttribute('role', retry ? 'alert' : 'status');
  const heading = document.createElement('h1');
  heading.textContent = title;
  const detail = document.createElement('p');
  detail.textContent = message;
  section.append(heading, detail);
  if (retry) {
    const button = document.createElement('button');
    button.className = 'login-submit auth-retry-button';
    button.type = 'button';
    button.textContent = 'Reintentar';
    button.addEventListener('click', async () => {
      button.disabled = true;
      button.textContent = 'Conectando…';
      appState.auth.initialized = false;
      try {
        await initializeSession();
        await loadCurrentRoute();
      } catch {
        renderMessage(container, 'No se pudo conectar', 'Verifica tu conexión con el servidor e inténtalo otra vez.', { retry: true });
      }
    });
    section.append(button);
  }
  container.append(section);
}

function applyPermissionVisibility(root = document) {
  root.querySelectorAll('[data-requires-permission]').forEach((element) => {
    const required = element.dataset.requiresPermission.split(/\s+/).filter(Boolean);
    const allowed = required.every(hasPermission);
    if (!allowed) {
      if (!element.dataset.authVisibilityManaged) {
        element.dataset.authOriginallyHidden = String(element.hidden);
        element.dataset.authVisibilityManaged = 'true';
      }
      // Este observador también vigila `hidden`. Reasignar `true` cuando el atributo
      // ya está presente genera otro registro de mutación en Chromium y puede
      // provocar un ciclo que sature la SPA para roles sin permisos de escritura.
      if (!element.hidden) element.hidden = true;
    } else if (element.dataset.authVisibilityManaged) {
      const originallyHidden = element.dataset.authOriginallyHidden === 'true';
      if (element.hidden !== originallyHidden) element.hidden = originallyHidden;
      delete element.dataset.authVisibilityManaged;
      delete element.dataset.authOriginallyHidden;
    }
  });
}

function applyNavigationPermissions() {
  document.querySelectorAll('.sidebar-nav [data-permission]').forEach((link) => {
    const permissionAllowed = link.dataset.permission.split(/\s+/).filter(Boolean).every(hasPermission);
    const roleAllowed = !link.dataset.role || link.dataset.role === appState.auth.user?.rol;
    link.hidden = !permissionAllowed || !roleAllowed;
  });
  document.querySelectorAll('.sidebar-nav .nav-group').forEach((group) => {
    const links = [...group.querySelectorAll('.nav-submenu [data-permission]')];
    group.hidden = links.length > 0 && links.every((link) => link.hidden);
  });
  document.querySelectorAll('.sidebar-nav .nav-section-label').forEach((label) => {
    let sibling = label.nextElementSibling;
    let hasVisibleItem = false;
    while (sibling && !sibling.classList.contains('nav-section-label')) {
      if ((sibling.matches('.nav-item') || sibling.matches('.nav-group')) && !sibling.hidden) hasVisibleItem = true;
      sibling = sibling.nextElementSibling;
    }
    label.hidden = !hasVisibleItem;
  });
}

function updateShell(routeName, title) {
  document.body.classList.toggle('seguimiento-entrega-activo', routeName === 'inventario/demo-seguimiento');
  applyNavigationPermissions();
  document.querySelectorAll('.nav-item[data-page]').forEach((link) => {
    const isActive = link.dataset.page === routeName;
    link.classList.toggle('active', isActive);
    if (isActive) link.setAttribute('aria-current', 'page');
    else link.removeAttribute('aria-current');
  });
  document.getElementById('topbarTitle').textContent = title;
  const fullName = [appState.auth.user?.nombres, appState.auth.user?.apellidos].filter(Boolean).join(' ')
    || appState.auth.user?.username || '';
  document.getElementById('topbarUserName').textContent = fullName;
  document.getElementById('sidebarUserName').textContent = fullName;
  document.getElementById('sidebarUserRole').textContent = appState.auth.user?.rol || 'Sesión activa';

  const orders = document.getElementById('ordenesMenu');
  const ordersActive = routeName.startsWith('ordenes/') || routeName === 'pagos' || routeName === 'compras/colegios';
  orders.querySelector('summary').classList.toggle('active', ordersActive);
  if (ordersActive) orders.open = true;
}

function showPageError(message, status = 'alert') {
  const container = document.getElementById('pageContainer');
  container.innerHTML = `<div class="empty-state" role="${status}"><i class="bi bi-exclamation-triangle" aria-hidden="true"></i><p class="router-error-message"></p></div>`;
  container.querySelector('.router-error-message').textContent = message;
}

function showDenied() {
  const container = document.getElementById('pageContainer');
  container.innerHTML = '<section class="auth-state-message" role="alert"><h1>Acceso denegado</h1><p>No tienes permisos para consultar este módulo.</p></section>';
}

function showAppShell() {
  document.getElementById('authRouteView').hidden = true;
  document.getElementById('appShell').hidden = false;
}

function showAuthView() {
  document.getElementById('appShell').hidden = true;
  document.getElementById('authRouteView').hidden = false;
}

async function loadLoginView() {
  showAuthView();
  const container = document.getElementById('authRouteView');
  container.setAttribute('aria-busy', 'true');
  try {
    if (!loginViewCache) {
      const response = await fetch('/views/login.html');
      if (!response.ok) throw new Error('No se pudo cargar el inicio de sesión.');
      loginViewCache = await response.text();
    }
    container.innerHTML = loginViewCache;
    const loginModule = await import('./module_auth/login.js');
    loginModule.initLoginView({ onSuccess: () => { window.location.hash = '#/dashboard'; } });
  } catch (error) {
    console.error('No se pudo cargar la vista de inicio de sesión:', error);
    renderMessage(container, 'No se pudo cargar el acceso', 'Actualiza la página para volver a intentarlo.', { retry: true });
  } finally {
    container.setAttribute('aria-busy', 'false');
  }
}

async function loadCurrentRoute() {
  const sequence = ++loadSequence;
  const routeName = getRouteName();
  const authView = document.getElementById('authRouteView');

  if (!appState.auth.initialized) {
    showAuthView();
    renderMessage(authView, 'Verificando sesión', 'Un momento, estamos validando tu acceso.');
    try {
      await initializeSession();
    } catch {
      if (sequence === loadSequence) {
        renderMessage(authView, 'No se pudo conectar', 'Verifica que ISHUME esté en ejecución e inténtalo nuevamente.', { retry: true });
      }
      return;
    }
  }
  if (sequence !== loadSequence) return;

  if (appState.auth.status === 'unavailable') {
    showAuthView();
    renderMessage(authView, 'No se pudo conectar', 'Verifica que ISHUME esté en ejecución e inténtalo nuevamente.', { retry: true });
    return;
  }

  if (routeName === 'login') {
    if (appState.auth.user) {
      window.location.hash = '#/dashboard';
      return;
    }
    await loadLoginView();
    return;
  }

  if (!appState.auth.user) {
    window.location.hash = '#/login';
    return;
  }

  const route = routes[routeName];
  showAppShell();
  if (route?.adminOnly && appState.auth.user?.rol !== 'administrador') {
    updateShell(routeName, 'Acceso denegado');
    showDenied();
    return;
  }
  const requiredPermissions = route?.permissions || (route?.permission ? [route.permission] : []);
  if (requiredPermissions.some((permission) => !hasPermission(permission))) {
    updateShell(routeName, 'Acceso denegado');
    showDenied();
    return;
  }
  updateShell(routeName, route?.title ?? 'Página no encontrada');
  const container = document.getElementById('pageContainer');
  if (!route) {
    container.setAttribute('aria-busy', 'false');
    showPageError('La vista solicitada no existe.');
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
    applyPermissionVisibility(container);
    const viewModule = await route.loadModule();
    if (sequence !== loadSequence) return;
    await viewModule.init();
    applyPermissionVisibility(container);
  } catch (error) {
    if (sequence !== loadSequence) return;
    console.error('Error al cargar la vista:', error);
    showPageError('No se pudo cargar la vista. Intenta actualizar la página.');
  } finally {
    if (sequence === loadSequence) container.setAttribute('aria-busy', 'false');
  }
}

async function handleLogout() {
  const button = document.getElementById('logoutButton');
  button.disabled = true;
  try {
    await signOut();
    window.location.hash = '#/login';
  } catch (error) {
    showToast(error.message || 'No se pudo cerrar la sesión. Inténtalo nuevamente.', 'error');
  } finally {
    button.disabled = false;
  }
}

export function startRouter() {
  if (started) return;
  started = true;
  window.addEventListener('hashchange', () => {
    void loadCurrentRoute();
    document.getElementById('sidebar')?.classList.remove('open');
  });
  document.addEventListener('keydown', (event) => {
    if (event.key === 'Escape') {
      document.querySelectorAll('.modal-overlay.open').forEach((modal) => closeOverlay(modal.id));
    }
  });
  document.getElementById('logoutButton').addEventListener('click', handleLogout);
  permissionObserver = new MutationObserver(() => applyPermissionVisibility(document.getElementById('pageContainer')));
  permissionObserver.observe(document.getElementById('pageContainer'), {
    childList: true, subtree: true, attributes: true, attributeFilter: ['hidden'],
  });

  if (!window.location.hash) window.history.replaceState(null, '', '#/dashboard');
  void loadCurrentRoute();
}
