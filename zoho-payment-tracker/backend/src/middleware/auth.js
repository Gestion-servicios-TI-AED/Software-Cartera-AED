// Candado de acceso: cuentas individuales (correo + contraseña) con sesión
// firmada en cookie httpOnly. El token codifica el id del usuario -- cada
// request re-consulta la base de datos (no solo verifica la firma) para que
// un cambio de permisos o una desactivación apliquen de inmediato, sin
// esperar a que expire la sesión.
const crypto = require('crypto');
const { PrismaClient } = require('@prisma/client');

const prisma = new PrismaClient();

const SESSION_COOKIE = 'session';
const MAX_AGE_MS = 30 * 24 * 60 * 60 * 1000; // 30 días

function sign(value) {
  return crypto.createHmac('sha256', process.env.SESSION_SECRET).update(value).digest('hex');
}

function createSessionToken(userId) {
  const exp = Date.now() + MAX_AGE_MS;
  const payload = `${userId}.${exp}`;
  return `${payload}.${sign(payload)}`;
}

// Devuelve el userId (number) si el token es válido, o null si no.
function verifySessionToken(token) {
  if (!token) return null;
  const [userId, exp, sig] = token.split('.');
  if (!userId || !exp || !sig) return null;
  if (Date.now() > Number(exp)) return null;

  const payload = `${userId}.${exp}`;
  const expected = Buffer.from(sign(payload));
  const actual = Buffer.from(sig);
  if (expected.length !== actual.length || !crypto.timingSafeEqual(expected, actual)) return null;

  return Number(userId);
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

async function requireAuth(req, res, next) {
  const cookies = parseCookies(req.headers.cookie);
  const userId = verifySessionToken(cookies[SESSION_COOKIE]);
  if (userId == null) return res.status(401).json({ error: 'No autorizado' });

  try {
    const usuario = await prisma.usuario.findUnique({ where: { id: userId } });
    if (!usuario || !usuario.activo) return res.status(401).json({ error: 'No autorizado' });

    req.usuario = {
      id: usuario.id,
      email: usuario.email,
      nombre: usuario.nombre,
      esAdmin: usuario.esAdmin,
      modulosPermitidos: usuario.modulosPermitidos,
    };
    next();
  } catch (err) {
    res.status(500).json({ error: 'Error verificando sesión' });
  }
}

// Acepta una clave sola o un array -- basta con tener acceso a UNA de las
// claves dadas (usado en endpoints que alimentan más de un módulo del
// frontend, ej. /negocios/dashboard-recaudo lo consumen tanto Dashboard como
// Resumen). Los admins pasan siempre.
function requireModulo(claveOClaves) {
  const claves = Array.isArray(claveOClaves) ? claveOClaves : [claveOClaves];
  return (req, res, next) => {
    if (req.usuario.esAdmin || claves.some((c) => req.usuario.modulosPermitidos.includes(c))) {
      return next();
    }
    res.status(403).json({ error: 'No tienes permiso para este módulo' });
  };
}

function requireAdmin(req, res, next) {
  if (req.usuario.esAdmin) return next();
  res.status(403).json({ error: 'Requiere permisos de administrador' });
}

module.exports = {
  requireAuth, requireModulo, requireAdmin,
  createSessionToken, SESSION_COOKIE, MAX_AGE_MS,
};
