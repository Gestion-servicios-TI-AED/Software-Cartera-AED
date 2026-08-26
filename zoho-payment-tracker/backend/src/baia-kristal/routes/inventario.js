const express = require('express');
const { PrismaClient } = require('@prisma/client');
const { syncInventario, getSyncStatus } = require('../services/inventarioSync');
const {
  detectarProjectCodeInconsistentes,
  valoresProyectoTorre,
  compararEtapas,
  esFrenteSeleccionable,
} = require('../services/inventarioNegocioService');
const { requireModulo, requireAdmin } = require('../../middleware/auth');
const { PROYECTO_TORRE_EXCLUIDOS } = require('../config/inventarioExcluido');

const router = express.Router();
const prisma = new PrismaClient();

// POST /api/inventario/sync — dispara sincronización manual completa
router.post('/sync', requireModulo('inventario'), (req, res) => {
  res.json({ message: 'Sincronización iniciada' });
  syncInventario();
});

// GET /api/inventario/sync/status
router.get('/sync/status', requireModulo('inventario'), (req, res) => {
  res.json(getSyncStatus());
});

// GET /api/inventario/verificar-project-code — detecta inmuebles con
// Project_Code copiado por error de otro inmueble del mismo frente
// (problema de datos en Zoho, no del sync).
router.get('/verificar-project-code', requireAdmin, async (req, res) => {
  try {
    const reporte = await detectarProjectCodeInconsistentes();
    res.json(reporte);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/inventario?search=&proyecto=&categoria=&estado=&etapa=&frente=&torre=&page=&limit=
router.get('/', requireModulo('inventario'), async (req, res) => {
  try {
    const { search, proyecto, categoria, estado, etapa, frente, torre, page = '1', limit = '50' } = req.query;
    const pageNum = Math.max(1, parseInt(page));
    const limitNum = Math.min(200, Math.max(1, parseInt(limit)));

    // Mismo cascade Etapa → Frente → Torre que Negocios/Cartera en
    // Gestión/Resumen -- se deriva de InventarioItem.datos.Proyecto_Torre
    // directamente, sin pasar por Negocio (un inmueble tiene Etapa/Frente/
    // Torre aunque no tenga negocio vinculado).
    const valores = await valoresProyectoTorre();

    // Unidades excluidas del portafolio (ver inventarioExcluido.js): torres
    // completas a pedido explícito del usuario, y registros marcados con "*"
    // al inicio del nombre (retirados/duplicados en Zoho, confirmado contra
    // el reporte oficial de inventario) -- mismo criterio que ya aplican
    // Dashboard, Cartera en Gestión, Resumen Gerencial y Negocios, para que
    // la lista de Inmuebles no muestre más unidades que las demás vistas.
    const and = [
      {
        NOT: {
          OR: [
            ...[...PROYECTO_TORRE_EXCLUIDOS].map((v) => ({ datos: { path: ['Proyecto_Torre'], equals: v } })),
            { nombre: { startsWith: '*' } },
          ],
        },
      },
    ];
    if (proyecto) and.push({ proyecto });
    if (categoria) and.push({ categoria });
    if (estado) and.push({ estado });
    if (etapa) {
      const lista = valores.porEtapa.get(etapa) || [];
      and.push(lista.length > 0
        ? { OR: lista.map((v) => ({ datos: { path: ['Proyecto_Torre'], equals: v } })) }
        : { id: '' });
    }
    if (frente && torre) {
      const lista = valores.porFrenteTorre.get(`${frente}||${torre}`) || [];
      and.push(lista.length > 0
        ? { OR: lista.map((v) => ({ datos: { path: ['Proyecto_Torre'], equals: v } })) }
        : { id: '' });
    } else if (frente) {
      const lista = valores.porFrente.get(frente) || [];
      and.push(lista.length > 0
        ? { OR: lista.map((v) => ({ datos: { path: ['Proyecto_Torre'], equals: v } })) }
        : { id: '' });
    }
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
    const noFilters = !search && !proyecto && !categoria && !estado && !etapa && !frente && !torre;

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
      etapasDisponibles: [...valores.porEtapa.keys()].sort(compararEtapas),
      frentesDisponibles: [...valores.porFrente.keys()].filter(esFrenteSeleccionable).sort(),
      frentesPorEtapa: valores.frentesPorEtapa,
      torresPorFrente: valores.torresPorFrente,
      torresPorEtapaFrente: valores.torresPorEtapaFrente,
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/inventario/:id — detalle completo (incluye todas las variables en `datos`)
router.get('/:id', requireModulo('inventario'), async (req, res) => {
  try {
    const item = await prisma.inventarioItem.findUnique({ where: { id: req.params.id } });
    if (!item) return res.status(404).json({ error: 'Ítem de inventario no encontrado' });
    res.json(item);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
