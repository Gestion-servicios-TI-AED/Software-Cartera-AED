const express = require('express');
const { requireAuth, createSessionToken, passwordMatches, SESSION_COOKIE, MAX_AGE_MS } = require('../middleware/auth');

const router = express.Router();

// La cookie solo debe marcarse Secure cuando el sitio realmente sirve por
// HTTPS — si no, el navegador la descarta en silencio y el login nunca
// "pega". Se activa a propósito con COOKIE_SECURE=true el día que haya
// dominio + certificado, en vez de asumirlo por NODE_ENV.
const COOKIE_SECURE = process.env.COOKIE_SECURE === 'true';

router.post('/login', (req, res) => {
  const { password } = req.body || {};
  if (!passwordMatches(password)) {
    return res.status(401).json({ error: 'Contraseña incorrecta' });
  }
  res.cookie(SESSION_COOKIE, createSessionToken(), {
    httpOnly: true,
    sameSite: 'lax',
    secure: COOKIE_SECURE,
    maxAge: MAX_AGE_MS,
  });
  res.json({ ok: true });
});

router.post('/logout', (req, res) => {
  res.clearCookie(SESSION_COOKIE);
  res.json({ ok: true });
});

router.get('/check', requireAuth, (req, res) => res.json({ ok: true }));

module.exports = router;
