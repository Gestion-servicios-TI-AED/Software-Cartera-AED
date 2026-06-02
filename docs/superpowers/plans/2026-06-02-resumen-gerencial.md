# Resumen Gerencial Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Agregar un módulo "Resumen Gerencial" en `/resumen` con 5 KPIs, tendencia de recaudo 12 meses, distribución por estado, pipeline de Zoho, top deudores, recaudo por fideicomiso y salud del último sync.

**Architecture:** Backend nuevo router `stats.js` montado en `/api/stats` con 5 endpoints agregados (SQL raw + Prisma). Frontend página `Resumen.jsx` con Recharts para gráficos, reutiliza `KpiCard` existente, consume los 5 endpoints de forma independiente (fetch-per-section, cada error es local).

**Tech Stack:** Node.js + Express + Prisma (backend), React 18 + Tailwind + Recharts + lucide-react (frontend)

---

## File Map

| Acción | Archivo |
|---|---|
| **Crear** | `zoho-payment-tracker/backend/src/routes/stats.js` |
| **Modificar** | `zoho-payment-tracker/backend/src/index.js` |
| **Modificar** | `zoho-payment-tracker/frontend/src/utils/api.js` |
| **Crear** | `zoho-payment-tracker/frontend/src/components/stats/RecaudoChart.jsx` |
| **Crear** | `zoho-payment-tracker/frontend/src/components/stats/EstadoDonut.jsx` |
| **Crear** | `zoho-payment-tracker/frontend/src/components/stats/PipelineBars.jsx` |
| **Crear** | `zoho-payment-tracker/frontend/src/pages/Resumen.jsx` |
| **Modificar** | `zoho-payment-tracker/frontend/src/App.jsx` |
| **Modificar** | `zoho-payment-tracker/frontend/src/components/Sidebar.jsx` |

---

## Task 1: Backend — `stats.js` router

**Files:**
- Create: `zoho-payment-tracker/backend/src/routes/stats.js`

- [ ] **Step 1: Crear el archivo `stats.js`** con los 5 endpoints

```javascript
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
```

- [ ] **Step 2: Verificar que el archivo fue creado**

```bash
ls zoho-payment-tracker/backend/src/routes/stats.js
```
Expected: el archivo existe sin errores.

---

## Task 2: Backend — Registrar router en `index.js`

**Files:**
- Modify: `zoho-payment-tracker/backend/src/index.js`

- [ ] **Step 1: Agregar `require` y `app.use` en `index.js`**

Agregar después de la línea `const negociosRouter = require('./routes/negocios');`:
```javascript
const statsRouter = require('./routes/stats');
```

Agregar después de la línea `app.use('/api/negocios', negociosRouter);`:
```javascript
app.use('/api/stats', statsRouter);
```

- [ ] **Step 2: Iniciar backend y probar los endpoints**

```bash
cd zoho-payment-tracker/backend && npm run dev
```

En otra terminal, verificar:
```bash
curl http://localhost:3001/api/stats/resumen
# Esperado: JSON con saldoCartera, negociosActivos, recaudoMes, variacionMes, recaudoAnio, separacionesMes

curl http://localhost:3001/api/stats/recaudo-mensual
# Esperado: array de { mes, total } con hasta 12 elementos

curl http://localhost:3001/api/stats/pipeline
# Esperado: array de { stage, count }

curl "http://localhost:3001/api/stats/top-deudores?limit=5"
# Esperado: array de 5 negocios con saldo > 0

curl http://localhost:3001/api/stats/sync
# Esperado: array de hasta 5 SyncLog
```

- [ ] **Step 3: Commit backend**

```bash
git add zoho-payment-tracker/backend/src/routes/stats.js zoho-payment-tracker/backend/src/index.js
git commit -m "feat: add /api/stats router with 5 aggregation endpoints"
```

---

## Task 3: Frontend — Instalar Recharts

**Files:**
- Modify: `zoho-payment-tracker/frontend/package.json` (vía npm)

- [ ] **Step 1: Instalar Recharts**

```bash
cd zoho-payment-tracker/frontend && npm install recharts
```
Expected: `recharts` aparece en `dependencies` de `package.json`, sin errores.

- [ ] **Step 2: Verificar importación básica**

```bash
node -e "require('./node_modules/recharts/dist/cjs/index.js'); console.log('ok')"
```
Expected: imprime `ok`.

---

## Task 4: Frontend — Funciones API en `api.js`

**Files:**
- Modify: `zoho-payment-tracker/frontend/src/utils/api.js`

- [ ] **Step 1: Agregar al final de `api.js`** las 5 nuevas funciones

```javascript
// ── Stats ──────────────────────────────────────────────────
export async function getStatsResumen() {
  const { data } = await api.get('/stats/resumen');
  return data;
}

export async function getStatsRecaudoMensual() {
  const { data } = await api.get('/stats/recaudo-mensual');
  return data;
}

export async function getStatsPipeline() {
  const { data } = await api.get('/stats/pipeline');
  return data;
}

export async function getStatsTopDeudores(limit = 10) {
  const { data } = await api.get('/stats/top-deudores', { params: { limit } });
  return data;
}

export async function getStatsSync(limit = 5) {
  const { data } = await api.get('/stats/sync', { params: { limit } });
  return data;
}
```

---

## Task 5: Frontend — `RecaudoChart.jsx`

**Files:**
- Create: `zoho-payment-tracker/frontend/src/components/stats/RecaudoChart.jsx`

- [ ] **Step 1: Crear el componente**

```jsx
// zoho-payment-tracker/frontend/src/components/stats/RecaudoChart.jsx
import React from 'react';
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
} from 'recharts';

const MESES = ['Ene','Feb','Mar','Abr','May','Jun','Jul','Ago','Sep','Oct','Nov','Dic'];

function formatMesLabel(mesStr) {
  // "2026-01" → "Ene 26"
  const [year, mon] = mesStr.split('-');
  return `${MESES[parseInt(mon, 10) - 1]} ${year.slice(2)}`;
}

function formatYAxis(value) {
  if (value >= 1_000_000) return `$${(value / 1_000_000).toFixed(1)}M`;
  if (value >= 1_000) return `$${(value / 1_000).toFixed(0)}K`;
  return `$${value}`;
}

function CustomTooltip({ active, payload, label }) {
  if (!active || !payload?.length) return null;
  const val = payload[0].value;
  const formatted = new Intl.NumberFormat('es-CO', {
    style: 'currency', currency: 'COP', minimumFractionDigits: 0, maximumFractionDigits: 0,
  }).format(val);
  return (
    <div className="bg-white border border-aed-border rounded-lg px-3 py-2 shadow-sm text-xs">
      <p className="font-medium text-slate-700">{label}</p>
      <p className="text-blue-600 font-bold">{formatted}</p>
    </div>
  );
}

export default function RecaudoChart({ data = [] }) {
  const chartData = data.map((d) => ({ ...d, mesLabel: formatMesLabel(d.mes) }));

  if (!chartData.length) {
    return (
      <div className="h-48 flex items-center justify-center text-sm text-slate-400">
        Sin datos de recaudo
      </div>
    );
  }

  return (
    <ResponsiveContainer width="100%" height={200}>
      <BarChart data={chartData} margin={{ top: 4, right: 8, left: 8, bottom: 4 }}>
        <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" vertical={false} />
        <XAxis
          dataKey="mesLabel"
          tick={{ fontSize: 11, fill: '#94a3b8' }}
          axisLine={false}
          tickLine={false}
        />
        <YAxis
          tickFormatter={formatYAxis}
          tick={{ fontSize: 11, fill: '#94a3b8' }}
          axisLine={false}
          tickLine={false}
          width={52}
        />
        <Tooltip content={<CustomTooltip />} cursor={{ fill: '#f1f5f9' }} />
        <Bar dataKey="total" fill="#3b82f6" radius={[4, 4, 0, 0]} maxBarSize={40} />
      </BarChart>
    </ResponsiveContainer>
  );
}
```

---

## Task 6: Frontend — `EstadoDonut.jsx`

**Files:**
- Create: `zoho-payment-tracker/frontend/src/components/stats/EstadoDonut.jsx`

- [ ] **Step 1: Crear el componente**

```jsx
// zoho-payment-tracker/frontend/src/components/stats/EstadoDonut.jsx
import React from 'react';
import { PieChart, Pie, Cell, Tooltip, Legend, ResponsiveContainer } from 'recharts';

const COLORS = ['#3b82f6','#10b981','#f59e0b','#ef4444','#8b5cf6','#06b6d4','#f97316','#6366f1'];

function CustomTooltip({ active, payload }) {
  if (!active || !payload?.length) return null;
  const { name, value } = payload[0];
  return (
    <div className="bg-white border border-aed-border rounded-lg px-3 py-2 shadow-sm text-xs">
      <p className="font-medium text-slate-700">{name}</p>
      <p className="text-slate-600">{value} negocios</p>
    </div>
  );
}

export default function EstadoDonut({ data = [] }) {
  if (!data.length) {
    return (
      <div className="h-48 flex items-center justify-center text-sm text-slate-400">
        Sin datos
      </div>
    );
  }

  // Agrupar estados con < 2% como "Otros"
  const total = data.reduce((s, d) => s + d.count, 0);
  const threshold = total * 0.02;
  const main = data.filter((d) => d.count >= threshold);
  const others = data.filter((d) => d.count < threshold);
  const chartData = others.length
    ? [...main, { estado: 'Otros', count: others.reduce((s, d) => s + d.count, 0) }]
    : main;

  return (
    <ResponsiveContainer width="100%" height={200}>
      <PieChart>
        <Pie
          data={chartData}
          dataKey="count"
          nameKey="estado"
          cx="50%"
          cy="50%"
          innerRadius={55}
          outerRadius={80}
          paddingAngle={2}
        >
          {chartData.map((_, i) => (
            <Cell key={i} fill={COLORS[i % COLORS.length]} />
          ))}
        </Pie>
        <Tooltip content={<CustomTooltip />} />
        <Legend
          formatter={(value) => <span className="text-[11px] text-slate-600">{value}</span>}
          iconSize={10}
          iconType="circle"
        />
      </PieChart>
    </ResponsiveContainer>
  );
}
```

---

## Task 7: Frontend — `PipelineBars.jsx`

**Files:**
- Create: `zoho-payment-tracker/frontend/src/components/stats/PipelineBars.jsx`

- [ ] **Step 1: Crear el componente**

```jsx
// zoho-payment-tracker/frontend/src/components/stats/PipelineBars.jsx
import React from 'react';
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Cell,
} from 'recharts';

const STAGE_COLORS = {
  'Closed Won': '#10b981',
  'Closed Lost': '#ef4444',
  'Proposal/Price Quote': '#3b82f6',
  'Negotiation/Review': '#f59e0b',
};
const DEFAULT_COLOR = '#8b5cf6';

function truncate(str, max = 20) {
  return str.length > max ? str.slice(0, max) + '…' : str;
}

function CustomTooltip({ active, payload, label }) {
  if (!active || !payload?.length) return null;
  return (
    <div className="bg-white border border-aed-border rounded-lg px-3 py-2 shadow-sm text-xs">
      <p className="font-medium text-slate-700">{label}</p>
      <p className="text-slate-600">{payload[0].value} oportunidades</p>
    </div>
  );
}

export default function PipelineBars({ data = [] }) {
  if (!data.length) {
    return (
      <div className="h-48 flex items-center justify-center text-sm text-slate-400">
        Sin datos de pipeline
      </div>
    );
  }

  const chartData = data.map((d) => ({ ...d, stageLabel: truncate(d.stage) }));

  return (
    <ResponsiveContainer width="100%" height={200}>
      <BarChart
        data={chartData}
        layout="vertical"
        margin={{ top: 4, right: 16, left: 4, bottom: 4 }}
      >
        <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" horizontal={false} />
        <XAxis
          type="number"
          tick={{ fontSize: 11, fill: '#94a3b8' }}
          axisLine={false}
          tickLine={false}
        />
        <YAxis
          type="category"
          dataKey="stageLabel"
          tick={{ fontSize: 11, fill: '#64748b' }}
          axisLine={false}
          tickLine={false}
          width={130}
        />
        <Tooltip content={<CustomTooltip />} cursor={{ fill: '#f1f5f9' }} />
        <Bar dataKey="count" radius={[0, 4, 4, 0]} maxBarSize={24}>
          {chartData.map((entry, i) => (
            <Cell key={i} fill={STAGE_COLORS[entry.stage] ?? DEFAULT_COLOR} />
          ))}
        </Bar>
      </BarChart>
    </ResponsiveContainer>
  );
}
```

---

## Task 8: Frontend — `Resumen.jsx` (página principal)

**Files:**
- Create: `zoho-payment-tracker/frontend/src/pages/Resumen.jsx`

- [ ] **Step 1: Crear la página**

```jsx
// zoho-payment-tracker/frontend/src/pages/Resumen.jsx
import React, { useEffect, useState } from 'react';
import {
  TrendingUp, Wallet, BarChart3, CalendarCheck, Briefcase, CheckCircle, XCircle, Clock,
} from 'lucide-react';
import KpiCard from '../components/KpiCard';
import RecaudoChart from '../components/stats/RecaudoChart';
import EstadoDonut from '../components/stats/EstadoDonut';
import PipelineBars from '../components/stats/PipelineBars';
import {
  getStatsResumen,
  getStatsRecaudoMensual,
  getStatsPipeline,
  getStatsTopDeudores,
  getStatsSync,
  getNegociosStats,
} from '../utils/api';
import { formatCOP, formatDateTime } from '../utils/format';

const PERIODOS = [
  { key: 'mes', label: 'Este mes' },
  { key: 'trimestre', label: 'Trimestre' },
  { key: 'anio', label: 'Este año' },
  { key: 'todo', label: 'Todo' },
];

function variacionText(val) {
  if (val === null || val === undefined) return null;
  const sign = val >= 0 ? '▲' : '▼';
  return `${sign} ${Math.abs(val)}% vs mes anterior`;
}

export default function Resumen() {
  const [resumen, setResumen] = useState(null);
  const [recaudoMensual, setRecaudoMensual] = useState([]);
  const [pipeline, setPipeline] = useState([]);
  const [deudores, setDeudores] = useState([]);
  const [syncLogs, setSyncLogs] = useState([]);
  const [negStats, setNegStats] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    setLoading(true);
    Promise.allSettled([
      getStatsResumen().then(setResumen),
      getStatsRecaudoMensual().then(setRecaudoMensual),
      getStatsPipeline().then(setPipeline),
      getStatsTopDeudores(10).then(setDeudores),
      getStatsSync(5).then(setSyncLogs),
      getNegociosStats().then(setNegStats),
    ]).finally(() => setLoading(false));
  }, []);

  const lastSync = syncLogs[0];
  const syncOk = syncLogs.filter((s) => s.status === 'success').length;
  const syncErr = syncLogs.filter((s) => s.status === 'error').length;

  return (
    <div className="flex flex-col min-h-screen bg-aed-base">
      {/* Topbar */}
      <header className="h-[52px] bg-white border-b border-aed-border flex items-center px-5 gap-3 flex-shrink-0 sticky top-0 z-10">
        <h1 className="text-[15px] font-bold text-slate-800">Resumen Gerencial</h1>
        <span className="text-xs text-slate-400">Vista ejecutiva</span>
      </header>

      <div className="flex-1 p-5 flex flex-col gap-4">
        {/* KPIs */}
        <div className="grid grid-cols-5 gap-3">
          <KpiCard
            icon={Wallet}
            iconBg="#eff6ff"
            iconColor="#3b82f6"
            label="Saldo total cartera"
            value={resumen ? formatCOP(resumen.saldoCartera) : '—'}
            sub={resumen ? `${resumen.negociosActivos} negocios activos` : undefined}
          />
          <KpiCard
            icon={TrendingUp}
            iconBg="#f0fdf4"
            iconColor="#16a34a"
            label="Recaudo del mes"
            value={resumen ? formatCOP(resumen.recaudoMes) : '—'}
            sub={variacionText(resumen?.variacionMes) ?? undefined}
          />
          <KpiCard
            icon={BarChart3}
            iconBg="#faf5ff"
            iconColor="#7c3aed"
            label="Recaudo año (YTD)"
            value={resumen ? formatCOP(resumen.recaudoAnio) : '—'}
          />
          <KpiCard
            icon={CalendarCheck}
            iconBg="#fffbeb"
            iconColor="#d97706"
            label="Separaciones del mes"
            value={resumen !== null ? resumen.separacionesMes : '—'}
          />
          <KpiCard
            icon={Briefcase}
            iconBg="#fef2f2"
            iconColor="#dc2626"
            label="Negocios activos"
            value={resumen !== null ? resumen.negociosActivos : '—'}
          />
        </div>

        {/* Tendencia recaudo */}
        <div className="card p-4">
          <h2 className="text-[13px] font-semibold text-slate-700 mb-3">
            Recaudo mensual — últimos 12 meses
          </h2>
          <RecaudoChart data={recaudoMensual} />
        </div>

        {/* Distribución */}
        <div className="grid grid-cols-2 gap-4">
          <div className="card p-4">
            <h2 className="text-[13px] font-semibold text-slate-700 mb-3">
              Negocios por estado
            </h2>
            <EstadoDonut data={negStats?.porEstado ?? []} />
          </div>
          <div className="card p-4">
            <h2 className="text-[13px] font-semibold text-slate-700 mb-3">
              Pipeline por etapa (Zoho)
            </h2>
            <PipelineBars data={pipeline} />
          </div>
        </div>

        {/* Rankings */}
        <div className="grid grid-cols-2 gap-4">
          {/* Top deudores */}
          <div className="card p-4">
            <h2 className="text-[13px] font-semibold text-slate-700 mb-3">
              Top 10 deudores (saldo pendiente)
            </h2>
            {deudores.length === 0 ? (
              <p className="text-sm text-slate-400">Sin datos</p>
            ) : (
              <table className="w-full text-xs">
                <thead>
                  <tr className="text-slate-400 border-b border-slate-100">
                    <th className="text-left py-1 font-medium">#</th>
                    <th className="text-left py-1 font-medium">Comprador</th>
                    <th className="text-right py-1 font-medium">Saldo</th>
                  </tr>
                </thead>
                <tbody>
                  {deudores.map((d, i) => (
                    <tr key={d.referencia} className="border-b border-slate-50 hover:bg-slate-50">
                      <td className="py-1.5 text-slate-400">{i + 1}</td>
                      <td className="py-1.5 text-slate-700 max-w-[160px] truncate" title={d.nombre}>
                        {d.nombre}
                      </td>
                      <td className="py-1.5 text-right font-medium text-slate-800">
                        {formatCOP(d.saldoActual)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>

          {/* Recaudo por fideicomiso */}
          <div className="card p-4">
            <h2 className="text-[13px] font-semibold text-slate-700 mb-3">
              Cartera por proyecto (fideicomiso)
            </h2>
            {!negStats?.porFideicomiso?.length ? (
              <p className="text-sm text-slate-400">Sin datos</p>
            ) : (
              <table className="w-full text-xs">
                <thead>
                  <tr className="text-slate-400 border-b border-slate-100">
                    <th className="text-left py-1 font-medium">Proyecto</th>
                    <th className="text-right py-1 font-medium">Negocios</th>
                    <th className="text-right py-1 font-medium">Saldo</th>
                  </tr>
                </thead>
                <tbody>
                  {negStats.porFideicomiso.map((f) => (
                    <tr key={f.fideicomiso} className="border-b border-slate-50 hover:bg-slate-50">
                      <td
                        className="py-1.5 text-slate-700 max-w-[160px] truncate"
                        title={f.fideicomiso}
                      >
                        {f.fideicomiso}
                      </td>
                      <td className="py-1.5 text-right text-slate-500">{f.count}</td>
                      <td className="py-1.5 text-right font-medium text-slate-800">
                        {formatCOP(f.saldo)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        </div>

        {/* Footer sync */}
        <div className="card p-4 flex items-center gap-4 text-xs text-slate-500">
          {lastSync ? (
            <>
              {lastSync.status === 'success' ? (
                <CheckCircle size={14} className="text-green-500 flex-shrink-0" />
              ) : lastSync.status === 'error' ? (
                <XCircle size={14} className="text-red-500 flex-shrink-0" />
              ) : (
                <Clock size={14} className="text-yellow-500 flex-shrink-0" />
              )}
              <span>
                Última sync Zoho: <strong>{formatDateTime(lastSync.startedAt)}</strong>
                {' · '}{lastSync.recordsSync} registros
              </span>
              <span className="ml-auto">
                Últimas 5: {syncOk} OK · {syncErr} errores
              </span>
            </>
          ) : (
            <span>Sin historial de sincronización</span>
          )}
        </div>
      </div>
    </div>
  );
}
```

---

## Task 9: Frontend — Ruta y Sidebar

**Files:**
- Modify: `zoho-payment-tracker/frontend/src/App.jsx`
- Modify: `zoho-payment-tracker/frontend/src/components/Sidebar.jsx`

- [ ] **Step 1: Agregar ruta en `App.jsx`**

Agregar el import de la página (después de la línea `import ApartamentoDetalle from './pages/ApartamentoDetalle';`):
```javascript
import Resumen from './pages/Resumen';
```

Agregar la ruta dentro del bloque `<Routes>` (antes de `<Route path="*" ...>`):
```jsx
<Route path="/resumen" element={<Resumen />} />
```

- [ ] **Step 2: Agregar item en `Sidebar.jsx`**

Agregar el import de ícono (en la línea que ya importa de lucide-react, agregar `BarChart3`):
```javascript
import { LayoutDashboard, FolderOpen, ArrowLeftRight, Briefcase, BarChart3, Settings } from 'lucide-react';
```

Agregar al array `NAV_ITEMS` el nuevo item al final (antes del cierre `]`):
```javascript
{ to: '/resumen', Icon: BarChart3, label: 'Resumen', exact: true },
```

- [ ] **Step 3: Iniciar frontend y verificar en navegador**

```bash
cd zoho-payment-tracker/frontend && npm run dev
```

Abrir `http://localhost:5173` y verificar:
1. El ícono de gráfica aparece en el Sidebar.
2. Clic en él navega a `/resumen`.
3. Los 5 KPIs cargan (o muestran `—` si no hay datos).
4. El gráfico de tendencia renderiza sin errores de consola.
5. Las tablas de deudores y fideicomiso muestran datos.
6. El footer de sync muestra el último log.

- [ ] **Step 4: Commit final**

```bash
git add \
  zoho-payment-tracker/frontend/src/pages/Resumen.jsx \
  zoho-payment-tracker/frontend/src/components/stats/RecaudoChart.jsx \
  zoho-payment-tracker/frontend/src/components/stats/EstadoDonut.jsx \
  zoho-payment-tracker/frontend/src/components/stats/PipelineBars.jsx \
  zoho-payment-tracker/frontend/src/App.jsx \
  zoho-payment-tracker/frontend/src/components/Sidebar.jsx \
  zoho-payment-tracker/frontend/src/utils/api.js \
  zoho-payment-tracker/frontend/package.json \
  zoho-payment-tracker/frontend/package-lock.json
git commit -m "feat: add Resumen Gerencial module with KPIs, charts and sync status"
```

---

## Verificación final

Comparar con el spec `docs/superpowers/specs/2026-06-02-resumen-gerencial-design.md`:

| Requisito del spec | Tarea |
|---|---|
| Saldo cartera KPI | Task 1 (`/resumen`), Task 8 (KpiCard) |
| Recaudo mes + % vs anterior | Task 1 (`/resumen`), Task 8 (KpiCard con `sub`) |
| Recaudo YTD | Task 1 (`/resumen`), Task 8 (KpiCard) |
| Separaciones del mes | Task 1 (`/resumen`), Task 8 (KpiCard) |
| Negocios activos | Task 1 (`/resumen`), Task 8 (KpiCard) |
| Recaudo mensual 12 meses | Task 1 (`recaudo-mensual`), Task 5 (`RecaudoChart`) |
| Negocios por estado (dona) | Usa `getNegociosStats()` existente, Task 6 (`EstadoDonut`) |
| Pipeline por etapa | Task 1 (`pipeline`), Task 7 (`PipelineBars`) |
| Top 10 deudores | Task 1 (`top-deudores`), Task 8 (tabla) |
| Cartera por fideicomiso | Usa `getNegociosStats()` existente, Task 8 (tabla) |
| Salud de sync | Task 1 (`sync`), Task 8 (footer) |
| Ruta `/resumen` + Sidebar | Task 9 |
| Recharts | Task 3 |
| No toca ruta raíz `/` | Task 9 (solo agrega nueva ruta) |
