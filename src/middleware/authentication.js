export function createAuthenticationMiddleware(authService, config) {
  return async function authenticateRequest(req, res, next) {
    const token = req.cookies?.[config.cookieName];
    if (!token) return res.status(401).json({ error: 'Autenticación requerida.' });
    try {
      req.auth = await authService.authenticate(token);
      return next();
    } catch (error) {
      if (error.status === 401) {
        return res.status(401).json({ error: 'Sesión no válida o vencida.' });
      }
      return next(error);
    }
  };
}

export function createOptionalAuthenticationMiddleware(authService, config) {
  return async function optionallyAuthenticateRequest(req, res, next) {
    const token = req.cookies?.[config.cookieName];
    if (!token) return next();
    try {
      req.auth = await authService.authenticate(token);
      return next();
    } catch (error) {
      if (error.status === 401) return next();
      return next(error);
    }
  };
}

export function createPermissionMiddleware(authService) {
  return function requirePermission(permissionCode) {
    if (typeof permissionCode !== 'string' || !/^[a-z0-9_]+\.[a-z0-9_]+$/.test(permissionCode)) {
      throw new TypeError('Permission code must use module.action format.');
    }
    return async function authorizeRequest(req, res, next) {
      if (!req.auth?.id_usuario) {
        return res.status(401).json({ error: 'Autenticación requerida.' });
      }
      try {
        if (!await authService.hasPermission(req.auth.id_usuario, permissionCode)) {
          return res.status(403).json({ error: 'No tienes permiso para realizar esta operación.' });
        }
        return next();
      } catch (error) {
        return next(error);
      }
    };
  };
}

export function csrfProtection(req, res, next) {
  if (['GET', 'HEAD', 'OPTIONS'].includes(req.method)) return next();

  if (req.get('Sec-Fetch-Site')?.toLowerCase() === 'cross-site') {
    return res.status(403).json({ error: 'Origen no autorizado.' });
  }

  const origin = req.get('Origin');
  const referer = req.get('Referer');
  const source = origin || referer;
  if (source) {
    try {
      const sourceUrl = new URL(source);
      if (!['http:', 'https:'].includes(sourceUrl.protocol)
          || sourceUrl.host.toLowerCase() !== String(req.get('host') || '').toLowerCase()) {
        return res.status(403).json({ error: 'Origen no autorizado.' });
      }
    } catch {
      return res.status(403).json({ error: 'Origen no autorizado.' });
    }
  }
  return next();
}
