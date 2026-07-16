const express = require('express');
const axios = require('axios');
const { PrismaClient, Prisma } = require('@prisma/client');
const { syncOpportunitiesFromZoho, ESTADOS_SIEMPRE_INCLUIDOS } = require('../services/zohoSync');
const { getAccessToken } = require('../services/zohoAuth');
const zohoConfig = require('../config/zoho');

const router = express.Router();
const prisma = new PrismaClient();

// GET /api/opportunities — lista paginada con filtros
router.get('/', async (req, res) => {
  try {
    const { stage, search, page = '1', limit = '20' } = req.query;
    const pageNum = Math.max(1, parseInt(page));
    const limitNum = Math.min(100, Math.max(1, parseInt(limit)));
    const skip = (pageNum - 1) * limitNum;

    // Mostrar registros con fecha de Pago Separación, o que estén en uno de
    // los estados de vinculación/fiducia que siempre se muestran sin
    // importar el Pago Separación (mismo criterio que el sync -- ver
    // ESTADOS_SIEMPRE_INCLUIDOS en zohoSync.js).
    const condiciones = [
      {
        OR: [
          { pagoSeparacion: { not: null } },
          { stage: { in: ESTADOS_SIEMPRE_INCLUIDOS } },
        ],
      },
    ];

    if (stage) {
      condiciones.push({ stage });
    }

    if (search) {
      condiciones.push({
        OR: [
          { dealName: { contains: search, mode: 'insensitive' } },
          { referenciaRecaudo: { contains: search, mode: 'insensitive' } },
          { contactName: { contains: search, mode: 'insensitive' } },
        ],
      });
    }

    const where = { AND: condiciones };

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
router.get('/stages', async (req, res) => {
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
router.get('/:id', async (req, res) => {
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
router.get('/:id/subforms', async (req, res) => {
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
// Los subforms (Forma_de_Pago / Propuesta_de_Pago) no vienen en el sync
// masivo de Zoho (la API de Deals en bloque no los devuelve, pese a pedirlos
// en el `fields` — solo se obtienen pidiendo el deal individual, como ya hace
// GET /:id/subforms). Este backfill recorre las oportunidades que tienen
// fecha de inicio de plan de pagos pero ningún subform cacheado aún, y los
// trae uno por uno desde Zoho (mismo fetch + limpieza que /:id/subforms).

let subformsBackfillRunning = false;
let subformsBackfillResult = null;

const SKIP_SUBFORM_KEYS = ['$in_merge', '$field_states', '$layout_id', '$permissions', 'Parent_Id', 'Created_Time', 'Modified_Time'];
function limpiarFilasSubform(arr) {
  return (arr || []).map((row) =>
    Object.fromEntries(Object.entries(row).filter(([k, v]) => !SKIP_SUBFORM_KEYS.includes(k) && v != null && v !== ''))
  );
}

async function runSubformsBackfill() {
  if (subformsBackfillRunning) return;
  subformsBackfillRunning = true;
  subformsBackfillResult = null;
  const startedAt = Date.now();
  let procesadas = 0;
  let actualizadas = 0;
  let errores = 0;

  // Progreso + tiempo restante estimado, a partir del promedio real de
  // ms/oportunidad hasta ahora (no un estimado fijo) -- se recalcula en
  // cada oportunidad procesada, así que se ajusta solo si Zoho responde
  // más lento o más rápido de lo esperado.
  function reportarProgreso(total) {
    const elapsedMs = Date.now() - startedAt;
    const porcentaje = total > 0 ? Math.round((procesadas / total) * 100) : 100;
    const promedioMsPorItem = procesadas > 0 ? elapsedMs / procesadas : null;
    const restantes = total - procesadas;
    const segundosRestantesEstimados = promedioMsPorItem != null
      ? Math.round((promedioMsPorItem * restantes) / 1000)
      : null;
    subformsBackfillResult = {
      running: true,
      total,
      procesadas,
      porcentaje,
      actualizadas,
      errores,
      segundosTranscurridos: Math.round(elapsedMs / 1000),
      segundosRestantesEstimados,
    };
  }

  try {
    const pendientes = await prisma.opportunity.findMany({
      where: {
        fechaInicioPlanPagos: { not: null },
        formaPago: { equals: Prisma.JsonNull },
        propuestaPago: { equals: Prisma.JsonNull },
      },
      select: { id: true, zohoId: true },
    });

    reportarProgreso(pendientes.length);

    for (const opp of pendientes) {
      try {
        const token = await getAccessToken();
        const response = await axios.get(
          `${zohoConfig.apiBase}/Deals/${opp.zohoId}`,
          {
            headers: { Authorization: `Zoho-oauthtoken ${token}` },
            params: { fields: 'Forma_de_Pago,Propuesta_de_Pago' },
          }
        );
        const deal = response.data?.data?.[0] || {};
        const formaPago = limpiarFilasSubform(deal.Forma_de_Pago);
        const propuestaPago = limpiarFilasSubform(deal.Propuesta_de_Pago);

        await prisma.opportunity.update({
          where: { id: opp.id },
          data: {
            formaPago: formaPago.length ? formaPago : null,
            propuestaPago: propuestaPago.length ? propuestaPago : null,
          },
        });
        actualizadas++;
      } catch (err) {
        errores++;
        console.error(`[subformsBackfill] Error en ${opp.zohoId}:`, err.message);
      }

      procesadas++;
      reportarProgreso(pendientes.length);
      if (procesadas % 50 === 0 || procesadas === pendientes.length) {
        console.log(`[subformsBackfill] Progreso: ${procesadas}/${pendientes.length} (${actualizadas} ok, ${errores} errores)`);
      }
    }

    const elapsed = ((Date.now() - startedAt) / 1000).toFixed(1);
    subformsBackfillResult = { ok: true, total: pendientes.length, actualizadas, errores, elapsed: `${elapsed}s` };
    console.log(`[subformsBackfill] Listo: ${actualizadas}/${pendientes.length} en ${elapsed}s (${errores} errores)`);
  } catch (err) {
    subformsBackfillResult = { ok: false, error: err.message };
    console.error('[subformsBackfill] Error fatal:', err.message);
  } finally {
    subformsBackfillRunning = false;
  }
}

// POST /api/opportunities/backfill-subforms — trae Forma de Pago / Propuesta
// de Pago de Zoho para toda oportunidad con fecha de inicio de plan pero sin
// subform cacheado. Corre en background; consultar progreso con el status.
router.post('/backfill-subforms', (req, res) => {
  if (subformsBackfillRunning) {
    return res.json({ message: 'Backfill de planes de pago ya en ejecución', running: true });
  }
  res.json({ message: 'Backfill de planes de pago iniciado en segundo plano', running: true });
  runSubformsBackfill();
});

// GET /api/opportunities/backfill-subforms/status
router.get('/backfill-subforms/status', (req, res) => {
  res.json({
    running: subformsBackfillRunning,
    result: subformsBackfillResult,
  });
});

// POST /api/sync — disparar sincronización manual
router.post('/sync', async (req, res) => {
  // Responder inmediatamente y sincronizar en background
  const force = req.query.full === 'true';
  res.json({ message: 'Sincronización iniciada' });
  syncOpportunitiesFromZoho(force).catch((err) =>
    console.error('[sync] Error en sync manual:', err.message)
  );
});

// GET /api/sync/status — último estado de sincronización
router.get('/sync/status', async (req, res) => {
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
