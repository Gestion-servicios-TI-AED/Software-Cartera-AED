const express = require('express');
const bcrypt = require('bcryptjs');
const { PrismaClient } = require('@prisma/client');
const { requireAdmin } = require('../middleware/auth');
const { MODULOS_VALIDOS } = require('../config/modulos');
const { registrarAuditoria, obtenerAuditoria } = require('../services/auditoriaService');

const router = express.Router();
const prisma = new PrismaClient();

router.use(requireAdmin);

function validarModulos(modulos) {
  return Array.isArray(modulos) && modulos.every((m) => MODULOS_VALIDOS.includes(m));
}

const SELECT_PUBLICO = {
  id: true, email: true, nombre: true, esAdmin: true, activo: true,
  modulosPermitidos: true, createdAt: true, updatedAt: true,
};

router.get('/', async (req, res) => {
  const usuarios = await prisma.usuario.findMany({
    select: SELECT_PUBLICO,
    orderBy: { nombre: 'asc' },
  });
  res.json(usuarios);
});

router.get('/auditoria', async (req, res) => {
  const registros = await obtenerAuditoria(100);
  res.json(registros);
});

router.post('/', async (req, res) => {
  const { email, nombre, password, esAdmin, modulosPermitidos } = req.body || {};

  if (!email || !nombre || !password) {
    return res.status(400).json({ error: 'Correo, nombre y contraseña son obligatorios' });
  }
  const modulos = esAdmin ? [] : (modulosPermitidos || []);
  if (!validarModulos(modulos)) {
    return res.status(400).json({ error: 'Módulo inválido en modulosPermitidos' });
  }

  const passwordHash = await bcrypt.hash(password, 10);

  let usuario;
  try {
    usuario = await prisma.usuario.create({
      data: {
        email: String(email).toLowerCase().trim(),
        nombre,
        passwordHash,
        esAdmin: !!esAdmin,
        modulosPermitidos: modulos,
      },
      select: SELECT_PUBLICO,
    });
  } catch (err) {
    if (err.code === 'P2002') {
      return res.status(409).json({ error: 'Ya existe un usuario con ese correo' });
    }
    throw err;
  }

  await registrarAuditoria({ actorId: req.usuario.id, usuarioId: usuario.id, accion: 'crear' });
  res.status(201).json(usuario);
});

router.patch('/:id', async (req, res) => {
  const id = Number(req.params.id);
  const actual = await prisma.usuario.findUnique({ where: { id } });
  if (!actual) return res.status(404).json({ error: 'Usuario no encontrado' });

  const { modulosPermitidos, esAdmin, activo, password } = req.body || {};
  const data = {};
  const eventos = [];

  if (modulosPermitidos !== undefined) {
    if (!validarModulos(modulosPermitidos)) {
      return res.status(400).json({ error: 'Módulo inválido en modulosPermitidos' });
    }
    data.modulosPermitidos = modulosPermitidos;
    eventos.push({ accion: 'modulos', detalle: { antes: actual.modulosPermitidos, despues: modulosPermitidos } });
  }

  if (esAdmin !== undefined && esAdmin !== actual.esAdmin) {
    data.esAdmin = !!esAdmin;
    eventos.push({ accion: esAdmin ? 'admin-on' : 'admin-off', detalle: null });
  }

  if (activo !== undefined && activo !== actual.activo) {
    data.activo = !!activo;
    eventos.push({ accion: activo ? 'activar' : 'desactivar', detalle: null });
  }

  if (password) {
    data.passwordHash = await bcrypt.hash(password, 10);
    eventos.push({ accion: 'reset-password', detalle: null });
  }

  if (Object.keys(data).length === 0) {
    return res.status(400).json({ error: 'Nada para actualizar' });
  }

  const usuario = await prisma.usuario.update({ where: { id }, data, select: SELECT_PUBLICO });

  for (const evento of eventos) {
    await registrarAuditoria({ actorId: req.usuario.id, usuarioId: id, ...evento });
  }

  res.json(usuario);
});

module.exports = router;
