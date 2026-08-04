// zoho-payment-tracker/backend/src/routes/stats.js
const express = require('express');
const { PrismaClient } = require('@prisma/client');
const { obtenerDashboardRecaudo } = require('../services/dashboardRecaudoService');

const router = express.Router();
const prisma = new PrismaClient();

// GET /api/stats/resumen — 5 KPIs principales
router.get('/resumen', async (req, res) => {
  try {
    const now = new Date();
    const year = now.getFullYear();
    const month = now.getMonth(); // 0-indexed
    const mesAnteriorDate = new Date(year, month - 1, 1);
    const mesActualKey = `${year}-${String(month + 1).padStart(2, '0')}`;
    const mesAnteriorKey = `${mesAnteriorDate.getFullYear()}-${String(mesAnteriorDate.getMonth() + 1).padStart(2, '0')}`;

    const [saldoAgg, negociosActivos, separacionesMes, dash] = await Promise.all([
      prisma.negocio.aggregate({ _sum: { saldoActual: true } }),
      prisma.negocio.count({ where: { saldoActual: { gt: 0 } } }),
      prisma.opportunity.count({
        where: {
          pagoSeparacion: {
            gte: new Date(year, month, 1),
            lt: new Date(year, month + 1, 1),
          },
        },
      }),
      // Reusa el mismo cache/cálculo del Dashboard (obtenerDashboardRecaudo) en
      // vez de una consulta SQL propia -- antes esta ruta sumaba TODOS los
      // movimientos crudos (incluyendo "GENERADO POR VENTA UNIDAD", el asiento
      // negativo de venta que no es plata real) sin la conciliación real de
      // cada negocio, así que "Recaudado en el año" mostraba $20.778M mientras
      // el propio gráfico de esta misma pantalla sumaba $47.014M para el mismo
      // año -- 2.3x de diferencia, visible una al lado de la otra. Con una
      // sola fuente de verdad ya no se puede volver a desincronizar.
      obtenerDashboardRecaudo({ page: 1, limit: 1 }),
    ]);

    const recaudoMes = dash.totales[mesActualKey]?.recaudado ?? 0;
    const recaudoMesAnterior = dash.totales[mesAnteriorKey]?.recaudado ?? 0;
    const variacionMes =
      recaudoMesAnterior > 0
        ? Math.round(((recaudoMes - recaudoMesAnterior) / recaudoMesAnterior) * 1000) / 10
        : null;
    const recaudoAnio = dash.meses
      .filter((m) => m.startsWith(String(year)))
      .reduce((s, m) => s + (dash.totales[m]?.recaudado ?? 0), 0);

    res.json({
      saldoCartera: saldoAgg._sum.saldoActual ?? 0,
      negociosActivos,
      recaudoMes,
      recaudoMesAnterior,
      variacionMes,
      recaudoAnio,
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

// GET /api/stats/cartera — negocios agrupados por Estado (embudo del Resumen Gerencial)
router.get('/cartera', async (_req, res) => {
  try {
    const rows = await prisma.$queryRaw`
      SELECT COALESCE(estado, 'Sin estado') AS estado, COUNT(*)::int AS count
      FROM "Negocio"
      GROUP BY estado
      ORDER BY COUNT(*) DESC
    `;
    res.json({ estados: rows.map((r) => ({ estado: r.estado, count: Number(r.count) })) });
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
