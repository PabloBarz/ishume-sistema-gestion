import { appState } from './appState.js';

const authPath = '/api/auth';

function setContext(context) {
  appState.auth.user = context.user;
  appState.auth.permissions = new Set(context.permissions || []);
  appState.auth.status = 'authenticated';
  appState.auth.initialized = true;
}

export function clearAuthContext() {
  appState.auth.user = null;
  appState.auth.permissions = new Set();
  appState.auth.status = 'unauthenticated';
  appState.auth.initialized = true;
}

async function readJson(response) {
  let payload = {};
  try {
    payload = await response.json();
  } catch {
    // A non-JSON gateway error is handled with the same safe message below.
  }
  return payload;
}

async function loadMe() {
  const response = await fetch(`${authPath}/me`, { credentials: 'include' });
  const payload = await readJson(response);
  if (!response.ok) {
    const error = new Error(payload.error || 'No se pudo validar la sesión.');
    error.status = response.status;
    throw error;
  }
  if (!payload.user || !Array.isArray(payload.permissions)) {
    throw new Error('El servidor devolvió un contexto de sesión no válido.');
  }
  setContext(payload);
  return payload;
}

export async function initializeSession() {
  appState.auth.status = 'checking';
  try {
    await loadMe();
    return { authenticated: true };
  } catch (error) {
    if (error.status === 401) {
      clearAuthContext();
      return { authenticated: false };
    }
    appState.auth.user = null;
    appState.auth.permissions = new Set();
    appState.auth.status = 'unavailable';
    appState.auth.initialized = true;
    throw error;
  }
}

export async function signIn(username, password) {
  let response;
  try {
    response = await fetch(`${authPath}/login`, {
      method: 'POST',
      credentials: 'include',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username, password }),
    });
  } catch (cause) {
    throw new Error('No se pudo conectar con el servidor. Comprueba que ISHUME esté disponible e inténtalo nuevamente.', { cause });
  }

  const payload = await readJson(response);
  if (!response.ok) {
    const message = response.status === 401
      ? 'Usuario o contraseña incorrectos.'
      : response.status >= 500
        ? 'El servicio de autenticación no está disponible. Inténtalo nuevamente.'
        : payload.error || 'No se pudo iniciar sesión.';
    const error = new Error(message);
    error.status = response.status;
    throw error;
  }

  try {
    return await loadMe();
  } catch (cause) {
    appState.auth.user = null;
    appState.auth.permissions = new Set();
    appState.auth.status = 'unavailable';
    appState.auth.initialized = true;
    throw new Error('Se inició sesión, pero no se pudo cargar el perfil. Intenta nuevamente.', { cause });
  }
}

export async function signOut() {
  const response = await fetch(`${authPath}/logout`, {
    method: 'POST',
    credentials: 'include',
  });
  const payload = await readJson(response);
  if (!response.ok) {
    const error = new Error(payload.error || 'No se pudo cerrar la sesión.');
    error.status = response.status;
    throw error;
  }
  clearAuthContext();
}

export function hasPermission(code) {
  return appState.auth.permissions.has(code);
}
