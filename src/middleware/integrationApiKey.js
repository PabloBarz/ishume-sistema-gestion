import { createHash, timingSafeEqual } from 'node:crypto';

function digest(value) {
  return createHash('sha256').update(value, 'utf8').digest();
}

export function requireIntegrationApiKey(req, res, next) {
  const expected = process.env.INTEGRATION_API_KEY;
  const authorization = typeof req.get === 'function'
    ? req.get('authorization')
    : req.headers?.authorization;
  const match = typeof authorization === 'string' ? authorization.match(/^Bearer\s+([^\s]+)$/i) : null;

  if (!expected || expected === 'replace-with-a-long-random-secret' || !match) {
    return res.status(401).json({ success: false, message: 'No autorizado.' });
  }

  const valid = timingSafeEqual(digest(match[1]), digest(expected));
  if (!valid) return res.status(401).json({ success: false, message: 'No autorizado.' });
  return next();
}
