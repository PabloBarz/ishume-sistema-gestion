import { authCookieOptions } from '../config/authConfig.js';

const invalidBody = (res) => res.status(400).json({ error: 'Datos de inicio de sesión no válidos.' });

export function createAuthController(serviceOrProvider, fixedConfig) {
  const getDependencies = typeof serviceOrProvider === 'function'
    ? serviceOrProvider
    : () => ({ service: serviceOrProvider, config: fixedConfig });
  return {
    login: async (req, res, next) => {
      const dependencies = getDependencies();
      const service = dependencies?.service;
      const config = dependencies?.config;
      if (!service || !config) {
        return res.status(503).json({ error: 'Autenticación no configurada.' });
      }
      const { username, password } = req.body ?? {};
      if (typeof username !== 'string' || !username.trim() || username.trim().length > 60
          || typeof password !== 'string' || !password
          || Buffer.byteLength(password, 'utf8') > 72) {
        return invalidBody(res);
      }

      try {
        const result = await service.login(username.trim(), password);
        res.cookie(config.cookieName, result.token, authCookieOptions(config));
        return res.status(200).json({ user: result.user });
      } catch (error) {
        if (error.status === 401) return res.status(401).json({ error: 'Usuario o contraseña incorrectos.' });
        return next(error);
      }
    },

    me: async (req, res, next) => {
      const dependencies = getDependencies();
      const service = dependencies?.service;
      const config = dependencies?.config;
      if (!service || !config) {
        return res.status(503).json({ error: 'Autenticación no configurada.' });
      }
      try {
        return res.status(200).json(await service.getCurrentUser(req.auth.id_usuario));
      } catch (error) {
        if (error.status === 401) return res.status(401).json({ error: 'Sesión no válida o vencida.' });
        return next(error);
      }
    },

    logout: async (req, res, next) => {
      const dependencies = getDependencies();
      const service = dependencies?.service;
      const config = dependencies?.config;
      if (!service || !config) {
        return res.status(503).json({ error: 'Autenticación no configurada.' });
      }
      try {
        if (req.auth) await service.logout(req.auth);
        res.clearCookie(config.cookieName, authCookieOptions(config, { clear: true }));
        return res.status(200).json({ message: 'Sesión cerrada.' });
      } catch (error) {
        return next(error);
      }
    },
  };
}
