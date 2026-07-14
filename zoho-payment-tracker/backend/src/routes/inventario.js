const express = require('express');
const { PrismaClient } = require('@prisma/client');
const { syncInventario, getSyncStatus } = require('../services/inventarioSync');

const router = express.Router();
const prisma = new PrismaClient();

// POST /api/inventario/sync — dispara sincronización manual completa
router.post('/sync', (req, res) => {
  res.json({ message: 'Sincronización iniciada' });
  syncInventario();
});

// GET /api/inventario/sync/status
router.get('/sync/status', (req, res) => {
  res.json(getSyncStatus());
});

// GET /api/inventario?search=&proyecto=&categoria=&estado=&page=&limit=
router.get('/', async (req, res) => {
  try {
    const { search, proyecto, categoria, estado, page = '1', limit = '50' } = req.query;
    const pageNum = Math.max(1, parseInt(page));
    const limitNum = Math.min(200, Math.max(1, parseInt(limit)));

    const and = [];
    if (proyecto) and.push({ proyecto });
    if (categoria) and.push({ categoria });
    if (estado) and.push({ estado });
    if (search) {
      and.push({
        OR: [
          { nombre: { contains: search, mode: 'insensitive' } },
          { torre: { contains: search, mode: 'insensitive' } },
          { referenciaRecaudo: { contains: search, mode: 'insensitive' } },
        ],
      });
    }
    const where = and.length > 0 ? { AND: and } : {};
    const noFilters = !search && !proyecto && !categoria && !estado;

    const [total, items, proyectos, categorias, estados] = await Promise.all([
      prisma.inventarioItem.count({ where }),
      prisma.inventarioItem.findMany({
        where,
        skip: (pageNum - 1) * limitNum,
        take: limitNum,
        orderBy: [{ proyecto: 'asc' }, { nombre: 'asc' }],
      }),
      noFilters
        ? prisma.inventarioItem.findMany({
            select: { proyecto: true },
            distinct: ['proyecto'],
            where: { proyecto: { not: null } },
            orderBy: { proyecto: 'asc' },
          })
        : Promise.resolve(null),
      noFilters
        ? prisma.inventarioItem.findMany({
            select: { categoria: true },
            distinct: ['categoria'],
            where: { categoria: { not: null } },
            orderBy: { categoria: 'asc' },
          })
        : Promise.resolve(null),
      noFilters
        ? prisma.inventarioItem.findMany({
            select: { estado: true },
            distinct: ['estado'],
            where: { estado: { not: null } },
            orderBy: { estado: 'asc' },
          })
        : Promise.resolve(null),
    ]);

    res.json({
      data: items,
      pagination: { total, page: pageNum, limit: limitNum, totalPages: Math.ceil(total / limitNum) },
      proyectos: proyectos ? proyectos.map((p) => p.proyecto) : undefined,
      categorias: categorias ? categorias.map((c) => c.categoria) : undefined,
      estados: estados ? estados.map((e) => e.estado) : undefined,
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/inventario/:id — detalle completo (incluye todas las variables en `datos`)
router.get('/:id', async (req, res) => {
  try {
    const item = await prisma.inventarioItem.findUnique({ where: { id: req.params.id } });
    if (!item) return res.status(404).json({ error: 'Ítem de inventario no encontrado' });
    res.json(item);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
