const express = require('express');
const axios = require('axios');
const { PrismaClient } = require('@prisma/client');
const { syncOpportunitiesFromZoho } = require('../services/zohoSync');
const { getAccessToken } = require('../services/zohoAuth');
const zohoConfig = require('../config/zoho');
const {
  runSubformsBackfill,
  isSubformsBackfillRunning,
  getSubformsBackfillResult,
} = require('../services/subformsBackfillService');
const { requireModulo, requireAdmin } = require('../../middleware/auth');

const router = express.Router();
const prisma = new PrismaClient();

// GET /api/opportunities — lista paginada con filtros
router.get('/', requireModulo('oportunidades'), async (req, res) => {
  try {
    const { stage, search, page = '1', limit = '20' } = req.query;
    const pageNum = Math.max(1, parseInt(page));
    const limitNum = Math.min(100, Math.max(1, parseInt(limit)));
    const skip = (pageNum - 1) * limitNum;

    // Mostrar solo registros con fecha de Pago Separación
    const where = {
      pagoSeparacion: { not: null },
    };

    if (stage) {
      where.stage = stage;
    }

    if (search) {
      where.OR = [
        { dealName: { contains: search, mode: 'insensitive' } },
        { referenciaRecaudo: { contains: search, mode: 'insensitive' } },
        { contactName: { contains: search, mode: 'insensitive' } },
      ];
    }

    const [total, records] = await Promise.all([
      prisma.opportunity.count({ where }),
      prisma.opportunity.findMany({
        where,
        skip,
        take: limitNum,
        orderBy: { pagoSeparacion: 'desc' },
        select: {
          id: true,
          zohoId: true,
          dealName: true,
          stage: true,
          contactName: true,
          contactEmail: true,
          contactPhone: true,
          accountName: true,
          referenciaRecaudo: true,
          pagoSeparacion: true,
          camposFinancieros: true,
          lastSyncedAt: true,
        },
      }),
    ]);

    res.json({
      data: records,
      pagination: {
        total,
        page: pageNum,
        limit: limitNum,
        totalPages: Math.ceil(total / limitNum),
      },
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/opportunities/stages — lista de etapas únicas
router.get('/stages', requireModulo('oportunidades'), async (req, res) => {
  try {
    const stages = await prisma.opportunity.findMany({
      select: { stage: true },
      distinct: ['stage'],
      where: { stage: { not: null } },
      orderBy: { stage: 'asc' },
    });
    res.json(stages.map((s) => s.stage));
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/opportunities/:id — detalle completo
router.get('/:id', requireModulo('oportunidades'), async (req, res) => {
  try {
    const opportunity = await prisma.opportunity.findUnique({
      where: { id: req.params.id },
    });

    if (!opportunity) {
      return res.status(404).json({ error: 'Oportunidad no encontrada' });
    }

    res.json(opportunity);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/opportunities/:id/subforms — devuelve Forma de Pago y Propuesta de Pago
// Primero intenta desde la BD; si no hay, hace fallback a Zoho
router.get('/:id/subforms', requireModulo(['oportunidades', 'negocios']), async (req, res) => {
  try {
    const opportunity = await prisma.opportunity.findUnique({
      where: { id: req.params.id },
      select: { zohoId: true, formaPago: true, propuestaPago: true },
    });

    if (!opportunity) {
      return res.status(404).json({ error: 'Oportunidad no encontrada' });
    }

    // Si ya están en BD, devolverlos directamente
    if (opportunity.formaPago || opportunity.propuestaPago) {
      return res.json({
        formaPago: opportunity.formaPago || [],
        propuestaPago: opportunity.propuestaPago || [],
      });
    }

    // Fallback: fetch desde Zoho incluyendo subforms en el deal
    const token = await getAccessToken();
    const response = await axios.get(
      `${zohoConfig.apiBase}/Deals/${opportunity.zohoId}`,
      {
        headers: { Authorization: `Zoho-oauthtoken ${token}` },
        params: { fields: 'Forma_de_Pago,Propuesta_de_Pago' },
      }
    );

    const deal = response.data?.data?.[0] || {};
    const SKIP = ['$in_merge', '$field_states', '$layout_id', '$permissions', 'Parent_Id', 'Created_Time', 'Modified_Time'];
    const clean = (arr) =>
      (arr || []).map((row) =>
        Object.fromEntries(Object.entries(row).filter(([k, v]) => !SKIP.includes(k) && v != null && v !== ''))
      );

    const formaPago = clean(deal.Forma_de_Pago);
    const propuestaPago = clean(deal.Propuesta_de_Pago);

    // Guardar en BD para la próxima vez
    await prisma.opportunity.update({
      where: { id: req.params.id },
      data: {
        formaPago: formaPago.length ? formaPago : null,
        propuestaPago: propuestaPago.length ? propuestaPago : null,
      },
    });

    res.json({ formaPago, propuestaPago });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ── Backfill de subforms (plan de pagos) ────────────────────────────────────
// La lógica vive en services/subformsBackfillService.js -- se reutiliza tanto
// aquí (trigger manual) como en zohoSync.js (trigger automático post-sync).

// POST /api/opportunities/backfill-subforms — trae Forma de Pago / Propuesta
// de Pago de Zoho para toda oportunidad con fecha de inicio de plan pero sin
// subform cacheado. Corre en background; consultar progreso con el status.
router.post('/backfill-subforms', requireAdmin, (req, res) => {
  if (isSubformsBackfillRunning()) {
    return res.json({ message: 'Backfill de planes de pago ya en ejecución', running: true });
  }
  res.json({ message: 'Backfill de planes de pago iniciado en segundo plano', running: true });
  runSubformsBackfill();
});

// GET /api/opportunities/backfill-subforms/status
router.get('/backfill-subforms/status', requireAdmin, (req, res) => {
  res.json({
    running: isSubformsBackfillRunning(),
    result: getSubformsBackfillResult(),
  });
});

// POST /api/sync — disparar sincronización manual
router.post('/sync', requireModulo('oportunidades'), async (req, res) => {
  // Responder inmediatamente y sincronizar en background
  const force = req.query.full === 'true';
  res.json({ message: 'Sincronización iniciada' });
  syncOpportunitiesFromZoho(force).catch((err) =>
    console.error('[sync] Error en sync manual:', err.message)
  );
});

// GET /api/sync/status — último estado de sincronización
router.get('/sync/status', requireModulo('oportunidades'), async (req, res) => {
  try {
    const last = await prisma.syncLog.findFirst({
      orderBy: { startedAt: 'desc' },
    });
    res.json(last || { status: 'never' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
