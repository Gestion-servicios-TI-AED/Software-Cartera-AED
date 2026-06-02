// zoho-payment-tracker/backend/src/routes/stats.js
const express = require('express');
const { PrismaClient } = require('@prisma/client');

const router = express.Router();
const prisma = new PrismaClient();

// GET /api/stats/resumen — 5 KPIs principales
router.get('/resumen', async (req, res) => {
  try {
    const now = new Date();
    const year = now.getFullYear();
    const month = now.getMonth(); // 0-indexed

    const [saldoAgg, negociosActivos, recaudoMesRows, recaudoMesAnteriorRows, recaudoAnioRows, separacionesMes] =
      await Promise.all([
        prisma.negocio.aggregate({ _sum: { saldoActual: true } }),
        prisma.negocio.count({ where: { saldoActual: { gt: 0 } } }),
        prisma.$queryRaw`
          SELECT COALESCE(SUM(NULLIF(datos->>'Valor', '')::numeric), 0)::float AS total
          FROM "NegocioMovimiento"
          WHERE "fechaContable" >= ${new Date(year, month, 1)}
            AND "fechaContable" < ${new Date(year, month + 1, 1)}
        `,
        prisma.$queryRaw`
          SELECT COALESCE(SUM(NULLIF(datos->>'Valor', '')::numeric), 0)::float AS total
          FROM "NegocioMovimiento"
          WHERE "fechaContable" >= ${new Date(year, month - 1, 1)}
            AND "fechaContable" < ${new Date(year, month, 1)}
        `,
        prisma.$queryRaw`
          SELECT COALESCE(SUM(NULLIF(datos->>'Valor', '')::numeric), 0)::float AS total
          FROM "NegocioMovimiento"
          WHERE "fechaContable" >= ${new Date(year, 0, 1)}
            AND "fechaContable" < ${new Date(year + 1, 0, 1)}
        `,
        prisma.opportunity.count({
          where: {
            pagoSeparacion: {
              gte: new Date(year, month, 1),
              lt: new Date(year, month + 1, 1),
            },
          },
        }),
      ]);

    const recaudoMes = Number(recaudoMesRows[0]?.total ?? 0);
    const recaudoMesAnterior = Number(recaudoMesAnteriorRows[0]?.total ?? 0);
    const variacionMes =
      recaudoMesAnterior > 0
        ? Math.round(((recaudoMes - recaudoMesAnterior) / recaudoMesAnterior) * 1000) / 10
        : null;

    res.json({
      saldoCartera: saldoAgg._sum.saldoActual ?? 0,
      negociosActivos,
      recaudoMes,
      recaudoMesAnterior,
      variacionMes,
      recaudoAnio: Number(recaudoAnioRows[0]?.total ?? 0),
      separacionesMes,
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/stats/recaudo-mensual — últimos 12 meses
router.get('/recaudo-mensual', async (_req, res) => {
  try {
    const rows = await prisma.$queryRaw`
      SELECT to_char(date_trunc('month', "fechaContable"), 'YYYY-MM') AS mes,
             COALESCE(SUM(NULLIF(datos->>'Valor', '')::numeric), 0)::float AS total
      FROM "NegocioMovimiento"
      WHERE "fechaContable" >= date_trunc('month', NOW()) - INTERVAL '11 months'
        AND "fechaContable" IS NOT NULL
      GROUP BY 1
      ORDER BY 1
    `;
    res.json(rows.map((r) => ({ mes: r.mes, total: Number(r.total) })));
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/stats/pipeline — oportunidades por stage
router.get('/pipeline', async (_req, res) => {
  try {
    const rows = await prisma.$queryRaw`
      SELECT COALESCE(stage, 'Sin etapa') AS stage,
             COUNT(*)::int AS count
      FROM "Opportunity"
      GROUP BY stage
      ORDER BY count DESC
    `;
    res.json(rows.map((r) => ({ stage: r.stage, count: Number(r.count) })));
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/stats/top-deudores?limit=10
router.get('/top-deudores', async (req, res) => {
  try {
    const limit = Math.min(50, Math.max(1, parseInt(req.query.limit ?? '10')));
    const rows = await prisma.negocio.findMany({
      where: { saldoActual: { gt: 0 } },
      orderBy: { saldoActual: 'desc' },
      take: limit,
      select: {
        referencia: true,
        saldoActual: true,
        datos: true,
        compradores: {
          take: 1,
          orderBy: { orden: 'asc' },
          select: { nombre: true },
        },
      },
    });
    res.json(
      rows.map((n) => ({
        referencia: n.referencia,
        saldoActual: n.saldoActual ?? 0,
        nombre: n.compradores[0]?.nombre ?? n.referencia,
        fideicomiso: n.datos?.Fideicomiso ?? null,
      }))
    );
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/stats/sync?limit=5
router.get('/sync', async (req, res) => {
  try {
    const limit = Math.min(20, Math.max(1, parseInt(req.query.limit ?? '5')));
    const logs = await prisma.syncLog.findMany({
      orderBy: { startedAt: 'desc' },
      take: limit,
    });
    res.json(logs);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
