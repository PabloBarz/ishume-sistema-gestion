const durationPattern = /^(\d+)(s|m|h|d)$/i;
const sameSiteValues = new Set(['lax', 'strict', 'none']);

export function parseTokenLifetime(value = '15m') {
  const match = durationPattern.exec(String(value).trim());
  if (!match) throw new Error('JWT_EXPIRES_IN debe tener formato como 15m, 1h o 1d.');
  const amount = Number(match[1]);
  const secondsPerUnit = { s: 1, m: 60, h: 3600, d: 86400 }[match[2].toLowerCase()];
  const seconds = amount * secondsPerUnit;
  if (!Number.isSafeInteger(seconds) || seconds < 1) {
    throw new Error('JWT_EXPIRES_IN debe representar un tiempo positivo válido.');
  }
  return seconds;
}

export function getAuthConfig(env = process.env) {
  const secret = env.JWT_SECRET?.trim();
  if (!secret || Buffer.byteLength(secret, 'utf8') < 32) {
    throw new Error('JWT_SECRET es obligatorio y debe tener al menos 32 bytes.');
  }

  const expiresIn = env.JWT_EXPIRES_IN || '15m';
  const expiresInSeconds = parseTokenLifetime(expiresIn);
  const sameSite = String(env.AUTH_COOKIE_SAME_SITE || 'lax').toLowerCase();
  if (!sameSiteValues.has(sameSite)) {
    throw new Error('AUTH_COOKIE_SAME_SITE debe ser lax, strict o none.');
  }

  const configuredSecure = env.AUTH_COOKIE_SECURE;
  if (configuredSecure !== undefined && !['true', 'false'].includes(configuredSecure.toLowerCase())) {
    throw new Error('AUTH_COOKIE_SECURE debe ser true o false.');
  }
  let secure = configuredSecure === undefined
    ? env.NODE_ENV === 'production'
    : configuredSecure.toLowerCase() === 'true';
  if (sameSite === 'none') secure = true;

  return Object.freeze({
    secret,
    expiresIn,
    expiresInSeconds,
    cookieName: env.AUTH_COOKIE_NAME || 'ishume_session',
    sameSite,
    secure,
    issuer: 'ishume',
    audience: 'ishume-app',
  });
}

export function authCookieOptions(config, { clear = false } = {}) {
  const options = {
    httpOnly: true,
    secure: config.secure,
    sameSite: config.sameSite,
    path: '/api',
  };
  if (!clear) options.maxAge = config.expiresInSeconds * 1000;
  return options;
}
