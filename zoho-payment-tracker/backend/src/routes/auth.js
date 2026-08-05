const express = require('express');
const bcrypt = require('bcryptjs');
const { PrismaClient } = require('@prisma/client');
const { requireAuth, createSessionToken, SESSION_COOKIE, MAX_AGE_MS } = require('../middleware/auth');

const router = express.Router();
const prisma = new PrismaClient();

// La cookie solo debe marcarse Secure cuando el sitio realmente sirve por
// HTTPS — si no, el navegador la descarta en silencio y el login nunca
// "pega". Se activa a propósito con COOKIE_SECURE=true el día que haya
// dominio + certificado, en vez de asumirlo por NODE_ENV.
const COOKIE_SECURE = process.env.COOKIE_SECURE === 'true';

router.post('/login', async (req, res) => {
  const { email, password } = req.body || {};
  if (!email || !password) {
    return res.status(401).json({ error: 'Correo o contraseña incorrectos' });
  }

  const usuario = await prisma.usuario.findUnique({
    where: { email: String(email).toLowerCase().trim() },
  });
  if (!usuario || !usuario.activo) {
    return res.status(401).json({ error: 'Correo o contraseña incorrectos' });
  }

  const coincide = await bcrypt.compare(password, usuario.passwordHash);
  if (!coincide) {
    return res.status(401).json({ error: 'Correo o contraseña incorrectos' });
  }

  res.cookie(SESSION_COOKIE, createSessionToken(usuario.id), {
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

router.get('/check', requireAuth, (req, res) => res.json(req.usuario));

module.exports = router;
