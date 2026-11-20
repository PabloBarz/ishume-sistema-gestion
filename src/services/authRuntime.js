import { pool } from '../config/db.js';
import { getAuthConfig } from '../config/authConfig.js';
import { createAuthService } from './authService.js';
import {
  createAuthenticationMiddleware,
  createOptionalAuthenticationMiddleware,
  createPermissionMiddleware,
} from '../middleware/authentication.js';

let runtime;
let lastConfigurationError;

export function getAuthRuntime() {
  if (runtime) return runtime;
  try {
    const config = getAuthConfig();
    runtime = { config, service: createAuthService({ pool, config }) };
    lastConfigurationError = undefined;
    return runtime;
  } catch (error) {
    if (!['JWT_SECRET', 'JWT_EXPIRES_IN', 'AUTH_COOKIE_SAME_SITE', 'AUTH_COOKIE_SECURE']
      .some((name) => error.message.includes(name))) throw error;
    if (lastConfigurationError !== error.message) {
      console.error(`Authentication is unavailable: ${error.message}`);
      lastConfigurationError = error.message;
    }
    return null;
  }
}

export function requireAuthentication(req, res, next) {
  const current = getAuthRuntime();
  if (!current) return res.status(503).json({ error: 'Autenticación no configurada.' });
  return createAuthenticationMiddleware(current.service, current.config)(req, res, next);
}

export function optionalAuthentication(req, res, next) {
  const current = getAuthRuntime();
  if (!current) return next();
  return createOptionalAuthenticationMiddleware(current.service, current.config)(req, res, next);
}

export function requirePermission(permissionCode) {
  const checkPermission = createPermissionMiddleware({
    async hasPermission(idUsuario, code) {
      const current = getAuthRuntime();
      if (!current) throw Object.assign(new Error('Autenticación no configurada.'), { status: 503 });
      return current.service.hasPermission(idUsuario, code);
    },
  })(permissionCode);
  return (req, res, next) => {
    if (!getAuthRuntime()) return res.status(503).json({ error: 'Autenticación no configurada.' });
    return checkPermission(req, res, next);
  };
}
