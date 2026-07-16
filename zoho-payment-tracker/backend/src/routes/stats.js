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

// GET /api/stats/cartera — métricas accionables de cobranza (avance contra Cuota Inicial)
router.get('/cartera', async (_req, res) => {
  try {
    const [negocios, lastMovs] = await Promise.all([
      prisma.negocio.findMany({
        select: {
          id: true, referencia: true, estado: true, saldoActual: true, datos: true,
          compradores: { take: 1, orderBy: { orden: 'asc' }, select: { nombre: true } },
        },
      }),
      prisma.negocioMovimiento.groupBy({ by: ['negocioId'], _max: { fechaContable: true } }),
    ]);

    const lastMap = new Map(lastMovs.map((m) => [m.negocioId, m._max.fechaContable]));
    const hoy = Date.now();
    const DIA = 86400000;

    const parseMoney = (v) => {
      if (v == null) return 0;
      const n = parseFloat(String(v).replace(/[^0-9.-]/g, ''));
      return isNaN(n) ? 0 : n;
    };

    const enCobro = [];
    const proyectoMap = new Map();
    const estadoMap = new Map();
    let cuotaTotal = 0;
    let abonadoTotal = 0; // capado a la cuota (recaudado de cartera)

    for (const n of negocios) {
      estadoMap.set(n.estado || 'Sin estado', (estadoMap.get(n.estado || 'Sin estado') || 0) + 1);

      const cuota = parseMoney(n.datos?.['Cuota Inicial']);
      if (cuota <= 0) continue; // sin cuota inicial → todavía no es cartera en cobro

      const abonadoReal = n.saldoActual ?? 0;
      const abonado = Math.min(abonadoReal, cuota); // capado para % coherente
      const porCobrar = Math.max(0, cuota - abonadoReal);
      const pct = Math.min(100, Math.round((abonado / cuota) * 1000) / 10);

      const ultimo = lastMap.get(n.id) || null;
      const dias = ultimo ? Math.floor((hoy - new Date(ultimo).getTime()) / DIA) : null;

      cuotaTotal += cuota;
      abonadoTotal += abonado;

      const fid = n.datos?.Fideicomiso || 'Sin proyecto';
      if (!proyectoMap.has(fid)) proyectoMap.set(fid, { fideicomiso: fid, cuota: 0, abonado: 0, porCobrar: 0, count: 0 });
      const p = proyectoMap.get(fid);
      p.cuota += cuota; p.abonado += abonado; p.porCobrar += porCobrar; p.count += 1;

      enCobro.push({
        referencia: n.referencia,
        nombre: n.compradores[0]?.nombre || n.referencia,
        fideicomiso: fid,
        nomenclatura: n.datos?.Nomenclatura ?? null,
        cuota, abonado: abonadoReal, porCobrar, pct,
        diasSinAbonar: dias,        // null = nunca ha abonado
        ultimoAbono: ultimo,
      });
    }

    const porProyecto = [...proyectoMap.values()]
      .map((p) => ({ ...p, pct: p.cuota > 0 ? Math.round((p.abonado / p.cuota) * 1000) / 10 : 0 }))
      .sort((a, b) => b.porCobrar - a.porCobrar);

    const morosos = (dias) =>
      enCobro.filter((e) => e.porCobrar > 0 && (e.diasSinAbonar === null || e.diasSinAbonar >= dias)).length;

    const porCobrarTotal = Math.max(0, cuotaTotal - abonadoTotal);

    res.json({
      resumen: {
        cuotaInicialTotal: cuotaTotal,
        abonadoTotal,
        porCobrarTotal,
        pctGlobal: cuotaTotal > 0 ? Math.round((abonadoTotal / cuotaTotal) * 1000) / 10 : 0,
        negociosEnCobro: enCobro.length,
        morosos30: morosos(30),
        morosos60: morosos(60),
        morosos90: morosos(90),
      },
      porProyecto,
      enCobro,
      estados: [...estadoMap.entries()].map(([estado, count]) => ({ estado, count })),
    });
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
