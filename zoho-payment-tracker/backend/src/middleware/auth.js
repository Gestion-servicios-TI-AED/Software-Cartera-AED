// Candado simple de acceso a la app: una sola clave compartida (sin
// usuarios/registro) protegida con sesión firmada en cookie httpOnly.
const crypto = require('crypto');

const SESSION_COOKIE = 'session';
const MAX_AGE_MS = 30 * 24 * 60 * 60 * 1000; // 30 días

function sign(value) {
  return crypto.createHmac('sha256', process.env.SESSION_SECRET).update(value).digest('hex');
}

function createSessionToken() {
  const exp = Date.now() + MAX_AGE_MS;
  return `${exp}.${sign(String(exp))}`;
}

function verifySessionToken(token) {
  if (!token) return false;
  const [exp, sig] = token.split('.');
  if (!exp || !sig) return false;
  if (Date.now() > Number(exp)) return false;

  const expected = Buffer.from(sign(exp));
  const actual = Buffer.from(sig);
  return expected.length === actual.length && crypto.timingSafeEqual(expected, actual);
}

function parseCookies(header = '') {
  const out = {};
  header.split(';').forEach((pair) => {
    const idx = pair.indexOf('=');
    if (idx === -1) return;
    const key = pair.slice(0, idx).trim();
    if (key) out[key] = decodeURIComponent(pair.slice(idx + 1).trim());
  });
  return out;
}

function requireAuth(req, res, next) {
  const cookies = parseCookies(req.headers.cookie);
  if (verifySessionToken(cookies[SESSION_COOKIE])) return next();
  res.status(401).json({ error: 'No autorizado' });
}

// Comparación en tiempo constante para evitar filtrar la clave por timing.
function passwordMatches(candidate) {
  const expected = process.env.APP_PASSWORD || '';
  if (!expected) return false;
  const a = crypto.createHash('sha256').update(String(candidate ?? '')).digest();
  const b = crypto.createHash('sha256').update(expected).digest();
  return crypto.timingSafeEqual(a, b);
}

module.exports = { requireAuth, createSessionToken, passwordMatches, SESSION_COOKIE, MAX_AGE_MS };
