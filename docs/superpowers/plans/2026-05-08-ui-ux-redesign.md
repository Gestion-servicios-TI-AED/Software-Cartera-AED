# UI/UX Redesign Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Rediseñar el frontend de Cartera AED con sidebar persistente, paleta azul claro suave, KPIs en dashboard, layout 3 columnas en detalle de oportunidad, y master-detail en el módulo Fiducia.

**Architecture:** Se agrega un sidebar de 60px que reemplaza el NavBar horizontal; App.jsx envuelve todas las rutas en un shell flex que incluye el sidebar. Los 3 módulos (Dashboard, OpportunityDetail, FiduciaModule) se rediseñan de forma independiente sin tocar el backend ni las rutas de React Router.

**Tech Stack:** React 18, Vite, Tailwind CSS 3, React Router 6. Sin nuevas dependencias.

---

## Mapa de archivos

| Archivo | Acción |
|---|---|
| `frontend/tailwind.config.js` | Modificar — agregar tokens de color `aed` |
| `frontend/src/index.css` | Modificar — actualizar base styles |
| `frontend/src/App.jsx` | Modificar — agregar shell con Sidebar |
| `frontend/src/components/Sidebar.jsx` | **Crear** |
| `frontend/src/components/KpiCard.jsx` | **Crear** |
| `frontend/src/components/ProgressBar.jsx` | **Crear** |
| `frontend/src/components/HorizontalBarChart.jsx` | **Crear** |
| `frontend/src/components/MovimientoTimeline.jsx` | **Crear** |
| `frontend/src/components/StageBadge.jsx` | Modificar — paleta pastel |
| `frontend/src/pages/Dashboard.jsx` | Modificar — KPIs + tabla actualizada |
| `frontend/src/pages/OpportunityDetail.jsx` | Modificar — layout 3 columnas |
| `frontend/src/pages/FiduciaModule.jsx` | Modificar — master-detail + modal upload |
| `frontend/src/pages/ApartamentoDetalle.jsx` | Modificar — paleta solamente |
| `frontend/src/pages/EncargoNomenclaturas.jsx` | Modificar — paleta solamente |
| `frontend/src/components/NavBar.jsx` | **Eliminar** |
| `frontend/src/components/CollapsibleSection.jsx` | **Eliminar** |

> No existe suite de tests. Cada tarea incluye un paso de verificación visual con el dev server.

---

## Task 1: Design System — Tailwind + CSS base

**Files:**
- Modify: `zoho-payment-tracker/frontend/tailwind.config.js`
- Modify: `zoho-payment-tracker/frontend/src/index.css`

- [ ] **Step 1: Actualizar tailwind.config.js**

```js
// zoho-payment-tracker/frontend/tailwind.config.js
/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,jsx,ts,tsx}'],
  theme: {
    extend: {
      fontFamily: {
        sans: ['Inter', 'system-ui', 'sans-serif'],
      },
      colors: {
        aed: {
          base: '#f8faff',
          border: '#e8f0fe',
        },
      },
    },
  },
  plugins: [],
};
```

- [ ] **Step 2: Actualizar index.css**

```css
/* zoho-payment-tracker/frontend/src/index.css */
@tailwind base;
@tailwind components;
@tailwind utilities;

@layer base {
  body {
    @apply bg-aed-base text-slate-900 antialiased;
  }
}

@layer components {
  .btn {
    @apply inline-flex items-center gap-2 px-4 py-2 rounded-lg font-medium text-sm transition-colors focus:outline-none focus:ring-2 focus:ring-offset-2 disabled:opacity-50 disabled:cursor-not-allowed;
  }
  .btn-primary {
    @apply btn bg-blue-500 text-white hover:bg-blue-600 focus:ring-blue-500;
  }
  .btn-secondary {
    @apply btn bg-white text-slate-700 border border-aed-border hover:bg-aed-base focus:ring-blue-500;
  }
  .card {
    @apply bg-white rounded-xl border border-aed-border shadow-sm;
  }
  .badge {
    @apply inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium;
  }
  .input {
    @apply block w-full rounded-lg border border-aed-border bg-aed-base px-3 py-2 text-sm placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500;
  }
  .section-label {
    @apply text-[9px] font-bold uppercase tracking-[0.7px] text-slate-400;
  }
}
```

- [ ] **Step 3: Verificar que Vite compila sin errores**

```bash
cd zoho-payment-tracker/frontend
npm run dev
```

Esperado: servidor arranca en `http://localhost:5173` sin errores en consola. El fondo del body cambia de `gray-50` a `#f8faff` (azul levemente tintado).

- [ ] **Step 4: Commit**

```bash
git add zoho-payment-tracker/frontend/tailwind.config.js zoho-payment-tracker/frontend/src/index.css
git commit -m "feat(ui): add aed color tokens and update base styles"
```

---

## Task 2: Sidebar.jsx

**Files:**
- Create: `zoho-payment-tracker/frontend/src/components/Sidebar.jsx`

- [ ] **Step 1: Crear Sidebar.jsx**

```jsx
// zoho-payment-tracker/frontend/src/components/Sidebar.jsx
import React from 'react';
import { NavLink, useLocation } from 'react-router-dom';

const NAV_ITEMS = [
  { to: '/', icon: '📊', label: 'Oportunidades', exact: true },
  { to: '/fiducia', icon: '📁', label: 'Encargos' },
  { to: '/fiducia/movimientos', icon: '💳', label: 'Movimientos' },
];

function SidebarItem({ to, icon, label, exact }) {
  const location = useLocation();
  const isActive = exact
    ? location.pathname === to
    : location.pathname.startsWith(to) && !(to === '/fiducia' && location.pathname === '/fiducia/movimientos');

  return (
    <div className="relative w-full flex justify-center">
      {isActive && (
        <span className="absolute left-0 top-[6px] bottom-[6px] w-[3px] bg-blue-500 rounded-r" />
      )}
      <NavLink
        to={to}
        title={label}
        className={`w-10 h-10 rounded-[10px] flex items-center justify-center text-lg transition-colors ${
          isActive
            ? 'bg-blue-50 text-blue-500'
            : 'text-slate-400 hover:bg-slate-50 hover:text-slate-600'
        }`}
      >
        {icon}
      </NavLink>
    </div>
  );
}

export default function Sidebar() {
  return (
    <aside className="w-[60px] bg-white border-r border-aed-border flex flex-col items-center py-4 gap-1.5 flex-shrink-0 h-screen sticky top-0">
      {/* Logo */}
      <div className="w-9 h-9 rounded-[10px] bg-gradient-to-br from-blue-500 to-indigo-600 flex items-center justify-center text-white font-bold text-sm mb-2 flex-shrink-0">
        A
      </div>

      {/* Nav items */}
      {NAV_ITEMS.map((item) => (
        <SidebarItem key={item.to} {...item} />
      ))}

      {/* Divider */}
      <div className="w-7 h-px bg-slate-100 my-1" />

      {/* Settings placeholder */}
      <div className="w-10 h-10 rounded-[10px] flex items-center justify-center text-lg text-slate-400 hover:bg-slate-50 cursor-pointer">
        ⚙️
      </div>

      {/* Avatar */}
      <div className="mt-auto w-8 h-8 rounded-full bg-gradient-to-br from-blue-100 to-purple-100 flex items-center justify-center text-[11px] font-bold text-indigo-700 flex-shrink-0">
        RG
      </div>
    </aside>
  );
}
```

- [ ] **Step 2: Commit**

```bash
git add zoho-payment-tracker/frontend/src/components/Sidebar.jsx
git commit -m "feat(ui): add Sidebar navigation component"
```

---

## Task 3: App.jsx — Layout shell con Sidebar

**Files:**
- Modify: `zoho-payment-tracker/frontend/src/App.jsx`

- [ ] **Step 1: Reemplazar App.jsx completo**

```jsx
// zoho-payment-tracker/frontend/src/App.jsx
import React from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import Sidebar from './components/Sidebar';
import Dashboard from './pages/Dashboard';
import OpportunityDetail from './pages/OpportunityDetail';
import FiduciaModule from './pages/FiduciaModule';
import FiduciaDetalle from './pages/FiduciaDetalle';
import FiduciaMovimientos from './pages/FiduciaMovimientos';
import FiduciaPropietario from './pages/FiduciaPropietario';
import EncargoNomenclaturas from './pages/EncargoNomenclaturas';
import ApartamentoDetalle from './pages/ApartamentoDetalle';

export default function App() {
  return (
    <BrowserRouter>
      <div className="flex h-screen overflow-hidden">
        <Sidebar />
        <div className="flex-1 overflow-y-auto">
          <Routes>
            <Route path="/" element={<Dashboard />} />
            <Route path="/opportunity/:id" element={<OpportunityDetail />} />
            <Route path="/fiducia" element={<FiduciaModule />} />
            <Route path="/fiducia/movimientos" element={<FiduciaMovimientos />} />
            <Route path="/fiducia/propietario/:nombre" element={<FiduciaPropietario />} />
            <Route path="/fiducia/:id/nomenclaturas" element={<EncargoNomenclaturas />} />
            <Route path="/fiducia/:id/apartamento/:nomenclatura" element={<ApartamentoDetalle />} />
            <Route path="/fiducia/:id" element={<FiduciaDetalle />} />
            <Route path="*" element={<Navigate to="/" replace />} />
          </Routes>
        </div>
      </div>
    </BrowserRouter>
  );
}
```

- [ ] **Step 2: Abrir http://localhost:5173 y verificar**

El sidebar de 60px aparece a la izquierda con los 3 íconos y el logo "A". El contenido ocupa el resto del ancho. Los links de navegación funcionan. El indicador azul (borde izquierdo) aparece en el ítem activo.

- [ ] **Step 3: Commit**

```bash
git add zoho-payment-tracker/frontend/src/App.jsx
git commit -m "feat(ui): wrap routes in sidebar shell layout"
```

---

## Task 4: KpiCard.jsx

**Files:**
- Create: `zoho-payment-tracker/frontend/src/components/KpiCard.jsx`

- [ ] **Step 1: Crear KpiCard.jsx**

```jsx
// zoho-payment-tracker/frontend/src/components/KpiCard.jsx
import React from 'react';

export default function KpiCard({ icon, iconBg, label, value, sub }) {
  return (
    <div className="card p-4 flex flex-col gap-1">
      <div
        className="w-8 h-8 rounded-lg flex items-center justify-center text-base mb-1 flex-shrink-0"
        style={{ background: iconBg }}
      >
        {icon}
      </div>
      <span className="text-[11px] text-slate-400 font-medium">{label}</span>
      <span className="text-[22px] font-bold text-slate-800 leading-tight tracking-tight">
        {value ?? '—'}
      </span>
      {sub && <span className="text-[11px] text-slate-400">{sub}</span>}
    </div>
  );
}
```

- [ ] **Step 2: Commit**

```bash
git add zoho-payment-tracker/frontend/src/components/KpiCard.jsx
git commit -m "feat(ui): add KpiCard component"
```

---

## Task 5: Dashboard.jsx

**Files:**
- Modify: `zoho-payment-tracker/frontend/src/pages/Dashboard.jsx`

- [ ] **Step 1: Reemplazar Dashboard.jsx completo**

```jsx
// zoho-payment-tracker/frontend/src/pages/Dashboard.jsx
import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import axios from 'axios';
import KpiCard from '../components/KpiCard';
import StageBadge from '../components/StageBadge';
import SyncStatus from '../components/SyncStatus';
import EmailSyncStatus from '../components/EmailSyncStatus';
import { formatCOP, formatDate } from '../utils/format';

const API = import.meta.env.VITE_API_URL || 'http://localhost:3001';
const STAGES = [
  'Qualification','Value Proposition','Id. Decision Makers',
  'Perception Analysis','Proposal/Price Quote','Negotiation/Review',
  'Closed Won','Closed Lost',
];

export default function Dashboard() {
  const navigate = useNavigate();
  const [opportunities, setOpportunities] = useState([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [pageSize] = useState(20);
  const [search, setSearch] = useState('');
  const [stage, setStage] = useState('');
  const [loading, setLoading] = useState(true);
  const [encargoCount, setEncargoCount] = useState(null);

  useEffect(() => {
    setLoading(true);
    const params = new URLSearchParams({ page, pageSize });
    if (search) params.set('search', search);
    if (stage) params.set('stage', stage);
    axios.get(`${API}/api/opportunities?${params}`)
      .then(({ data }) => {
        setOpportunities(data.data || []);
        setTotal(data.total || 0);
      })
      .finally(() => setLoading(false));
  }, [page, search, stage]);

  useEffect(() => {
    axios.get(`${API}/api/fiducia?page=1&pageSize=1`)
      .then(({ data }) => setEncargoCount(data.total ?? null))
      .catch(() => {});
  }, []);

  const inNegotiation = opportunities.filter((o) =>
    ['Qualification','Value Proposition','Id. Decision Makers','Perception Analysis','Proposal/Price Quote','Negotiation/Review'].includes(o.stage)
  ).length;

  const totalRecaudado = opportunities.reduce((acc, o) => acc + (Number(o.valorTotal) || 0), 0);

  function handleSearch(e) {
    setSearch(e.target.value);
    setPage(1);
  }

  function handleStage(e) {
    setStage(e.target.value);
    setPage(1);
  }

  const totalPages = Math.ceil(total / pageSize);

  return (
    <div className="flex flex-col h-full min-h-screen bg-aed-base">
      {/* Topbar */}
      <header className="h-[52px] bg-white border-b border-aed-border flex items-center px-5 gap-3 flex-shrink-0 sticky top-0 z-10">
        <h1 className="text-[15px] font-bold text-slate-800">Oportunidades</h1>
        <span className="text-xs text-slate-400">CRM Zoho</span>
        <div className="flex items-center gap-4 ml-2">
          <EmailSyncStatus compact />
          <SyncStatus compact />
        </div>
        <div className="ml-auto flex items-center gap-2 bg-aed-base border border-aed-border rounded-lg px-3 py-1.5">
          <span className="text-slate-400 text-sm">🔍</span>
          <input
            value={search}
            onChange={handleSearch}
            placeholder="Buscar negocio o contacto…"
            className="bg-transparent text-sm outline-none w-48 placeholder-slate-400"
          />
        </div>
      </header>

      <div className="flex-1 p-5 flex flex-col gap-4">
        {/* KPIs */}
        <div className="grid grid-cols-4 gap-3">
          <KpiCard icon="📊" iconBg="#eff6ff" label="Total oportunidades" value={total} />
          <KpiCard icon="⏳" iconBg="#fffbeb" label="En negociación" value={inNegotiation} />
          <KpiCard
            icon="💰"
            iconBg="#f0fdf4"
            label="Total recaudado"
            value={totalRecaudado ? formatCOP(totalRecaudado) : '—'}
          />
          <KpiCard
            icon="🏛️"
            iconBg="#faf5ff"
            label="Encargos activos"
            value={encargoCount ?? '—'}
          />
        </div>

        {/* Table card */}
        <div className="card flex flex-col flex-1 overflow-hidden">
          {/* Table header */}
          <div className="flex items-center gap-3 px-4 py-3 border-b border-slate-50">
            <span className="text-[13px] font-semibold text-slate-800">Todos los negocios</span>
            <span className="bg-blue-50 text-blue-500 text-[11px] font-semibold px-2 py-0.5 rounded-full">
              {total}
            </span>
            <div className="ml-auto flex items-center gap-2">
              <select
                value={stage}
                onChange={handleStage}
                className="bg-aed-base border border-aed-border rounded-lg px-2.5 py-1.5 text-[11px] text-slate-600 outline-none"
              >
                <option value="">Todas las etapas</option>
                {STAGES.map((s) => <option key={s} value={s}>{s}</option>)}
              </select>
              <SyncStatus buttonOnly />
            </div>
          </div>

          {/* Table */}
          <div className="overflow-auto flex-1">
            <table className="w-full border-collapse">
              <thead>
                <tr>
                  {['Negocio / Proyecto','Contacto','Etapa','Pago Separación','Ref. Recaudo','Valor Total'].map((h) => (
                    <th key={h} className="text-left px-4 py-2.5 text-[9px] font-bold uppercase tracking-[0.6px] text-slate-400 bg-aed-base border-b border-slate-50 whitespace-nowrap">
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {loading ? (
                  <tr><td colSpan={6} className="text-center py-10 text-sm text-slate-400">Cargando…</td></tr>
                ) : opportunities.length === 0 ? (
                  <tr><td colSpan={6} className="text-center py-10 text-sm text-slate-400">Sin resultados</td></tr>
                ) : opportunities.map((opp) => (
                  <tr
                    key={opp.id}
                    onClick={() => navigate(`/opportunity/${opp.id}`)}
                    className="border-b border-slate-50 cursor-pointer hover:[&>td]:bg-blue-50/40 transition-colors"
                  >
                    <td className="px-4 py-2.5 text-[12px] font-medium text-slate-800">{opp.dealName || '—'}</td>
                    <td className="px-4 py-2.5 text-[12px] text-slate-500">{opp.contactName || '—'}</td>
                    <td className="px-4 py-2.5"><StageBadge stage={opp.stage} /></td>
                    <td className="px-4 py-2.5 text-[12px] text-slate-500">{opp.pagoSeparacion ? formatDate(opp.pagoSeparacion) : '—'}</td>
                    <td className="px-4 py-2.5">
                      {opp.refRecaudo ? (
                        <span className="font-mono text-[11px] bg-blue-50 text-blue-500 px-1.5 py-0.5 rounded">
                          {opp.refRecaudo}
                        </span>
                      ) : '—'}
                    </td>
                    <td className="px-4 py-2.5 text-[12px] font-semibold text-slate-800 text-right">
                      {opp.valorTotal ? formatCOP(opp.valorTotal) : '—'}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* Pagination */}
          <div className="flex items-center justify-between px-4 py-2.5 border-t border-slate-50">
            <span className="text-[11px] text-slate-400">
              {Math.min((page - 1) * pageSize + 1, total)}–{Math.min(page * pageSize, total)} de {total}
            </span>
            <div className="flex gap-2">
              <button
                onClick={() => setPage((p) => Math.max(1, p - 1))}
                disabled={page === 1}
                className="px-3 py-1 text-[11px] rounded-md bg-aed-base border border-aed-border text-slate-600 disabled:opacity-40"
              >
                ← Anterior
              </button>
              <button
                onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                disabled={page >= totalPages}
                className="px-3 py-1 text-[11px] rounded-md bg-blue-500 text-white disabled:opacity-40"
              >
                Siguiente →
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Verificar en http://localhost:5173**

El dashboard muestra 4 KPI cards, la tabla con los 6 campos correctos, paginación funcional, buscador y selector de etapa. El header tiene SyncStatus y EmailSyncStatus.

> **Nota:** Si `SyncStatus` y `EmailSyncStatus` no aceptan prop `compact` o `buttonOnly`, revisar esos componentes y simplemente colocarlos sin props adicionales — seguirán funcionando.

- [ ] **Step 3: Commit**

```bash
git add zoho-payment-tracker/frontend/src/pages/Dashboard.jsx
git commit -m "feat(ui): redesign Dashboard with KPI cards and updated table"
```

---

## Task 6: ProgressBar.jsx + HorizontalBarChart.jsx

**Files:**
- Create: `zoho-payment-tracker/frontend/src/components/ProgressBar.jsx`
- Create: `zoho-payment-tracker/frontend/src/components/HorizontalBarChart.jsx`

- [ ] **Step 1: Crear ProgressBar.jsx**

```jsx
// zoho-payment-tracker/frontend/src/components/ProgressBar.jsx
import React from 'react';

export default function ProgressBar({ pct, leftLabel, rightLabel }) {
  const clamped = Math.max(0, Math.min(100, pct || 0));
  return (
    <div>
      <div className="flex justify-between items-center mb-1.5">
        <span className="text-[11px] text-slate-500">{leftLabel}</span>
        <span className="text-[12px] font-bold text-blue-500">{clamped}%</span>
      </div>
      <div className="h-2.5 bg-slate-100 rounded-full overflow-hidden">
        <div
          className="h-full rounded-full bg-gradient-to-r from-blue-400 to-indigo-400 transition-all"
          style={{ width: `${clamped}%` }}
        />
      </div>
      {rightLabel && (
        <div className="flex justify-between mt-1">
          <span className="text-[10px] text-slate-400">{leftLabel}</span>
          <span className="text-[10px] text-slate-400">{rightLabel}</span>
        </div>
      )}
    </div>
  );
}
```

- [ ] **Step 2: Crear HorizontalBarChart.jsx**

```jsx
// zoho-payment-tracker/frontend/src/components/HorizontalBarChart.jsx
import React from 'react';

export default function HorizontalBarChart({ rows, total }) {
  const max = total || rows.reduce((s, r) => s + (Number(r.value) || 0), 0) || 1;
  return (
    <div className="flex flex-col gap-2">
      {rows.map(({ label, value, color = '#bfdbfe' }) => {
        const pct = Math.round(((Number(value) || 0) / max) * 100);
        return (
          <div key={label} className="flex items-center gap-2">
            <span className="text-[10px] text-slate-400 w-24 text-right shrink-0">{label}</span>
            <div className="flex-1 h-2 bg-slate-100 rounded-full overflow-hidden">
              <div className="h-full rounded-full" style={{ width: `${pct}%`, background: color }} />
            </div>
            <span className="text-[10px] text-slate-500 w-16 shrink-0">
              {typeof value === 'number' ? value.toLocaleString('es-CO', { style: 'currency', currency: 'COP', maximumFractionDigits: 0 }) : value}
            </span>
          </div>
        );
      })}
    </div>
  );
}
```

- [ ] **Step 3: Commit**

```bash
git add zoho-payment-tracker/frontend/src/components/ProgressBar.jsx zoho-payment-tracker/frontend/src/components/HorizontalBarChart.jsx
git commit -m "feat(ui): add ProgressBar and HorizontalBarChart components"
```

---

## Task 7: MovimientoTimeline.jsx

**Files:**
- Create: `zoho-payment-tracker/frontend/src/components/MovimientoTimeline.jsx`

- [ ] **Step 1: Crear MovimientoTimeline.jsx**

```jsx
// zoho-payment-tracker/frontend/src/components/MovimientoTimeline.jsx
import React from 'react';
import { formatCOP, formatDate } from '../utils/format';

const SOURCE_STYLES = {
  fiducia: { dot: '#bbf7d0', badge: 'bg-blue-50 text-blue-500' },
  zoho:    { dot: '#ddd6fe', badge: 'bg-purple-50 text-purple-600' },
};

function getSourceStyle(source = '') {
  const key = source.toLowerCase().includes('zoho') ? 'zoho' : 'fiducia';
  return SOURCE_STYLES[key];
}

export default function MovimientoTimeline({ movimientos, totalLabel }) {
  if (!movimientos || movimientos.length === 0) {
    return <p className="text-[11px] text-slate-400 italic">Sin movimientos registrados</p>;
  }

  const total = movimientos.reduce((s, m) => s + (Number(m.valor || m.monto) || 0), 0);

  return (
    <div className="flex flex-col h-full">
      <div className="flex-1 overflow-y-auto">
        {movimientos.map((m, i) => {
          const style = getSourceStyle(m.fuente || m.source || '');
          const isLast = i === movimientos.length - 1;
          return (
            <div key={m.id || i} className="flex gap-2.5 pb-0">
              {/* Dot + connector */}
              <div className="flex flex-col items-center shrink-0 pt-0.5">
                <div className="w-2 h-2 rounded-full shrink-0" style={{ background: style.dot }} />
                {!isLast && <div className="w-px flex-1 bg-aed-border min-h-[16px]" />}
              </div>
              {/* Content */}
              <div className={`flex-1 flex items-start justify-between gap-1 ${isLast ? 'pb-0' : 'pb-2.5'}`}>
                <div className="flex flex-col gap-0.5">
                  <span className="text-[11px] font-medium text-slate-800">{m.concepto || m.descripcion || 'Movimiento'}</span>
                  <span className="text-[10px] text-slate-400">
                    {m.fecha ? formatDate(m.fecha) : '—'}
                  </span>
                  {(m.fuente || m.source) && (
                    <span className={`text-[9px] px-1.5 py-0.5 rounded w-fit mt-0.5 ${style.badge}`}>
                      {m.fuente || m.source}
                    </span>
                  )}
                </div>
                <span className="text-[12px] font-bold text-slate-800 shrink-0">
                  {formatCOP(m.valor || m.monto || 0)}
                </span>
              </div>
            </div>
          );
        })}
      </div>

      {/* Total */}
      <div className="mt-auto pt-3 border-t border-slate-100">
        <div className="text-[10px] text-slate-400 uppercase tracking-wide">{totalLabel || 'Total registrado'}</div>
        <div className="text-[20px] font-extrabold text-slate-800 tracking-tight leading-tight">
          {formatCOP(total)}
        </div>
        <div className="text-[10px] text-slate-400 mt-0.5">{movimientos.length} movimientos</div>
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Commit**

```bash
git add zoho-payment-tracker/frontend/src/components/MovimientoTimeline.jsx
git commit -m "feat(ui): add MovimientoTimeline component"
```

---

## Task 8: StageBadge.jsx — paleta pastel

**Files:**
- Modify: `zoho-payment-tracker/frontend/src/components/StageBadge.jsx`

- [ ] **Step 1: Reemplazar StageBadge.jsx**

```jsx
// zoho-payment-tracker/frontend/src/components/StageBadge.jsx
import React from 'react';

const STAGE_MAP = {
  'Qualification':        { bg: '#fffbeb', text: '#d97706', border: '#fde68a' },
  'Value Proposition':    { bg: '#eff6ff', text: '#3b82f6', border: '#bfdbfe' },
  'Id. Decision Makers':  { bg: '#faf5ff', text: '#7c3aed', border: '#ddd6fe' },
  'Perception Analysis':  { bg: '#eff6ff', text: '#6366f1', border: '#c7d2fe' },
  'Proposal/Price Quote': { bg: '#eff6ff', text: '#3b82f6', border: '#bfdbfe' },
  'Negotiation/Review':   { bg: '#fff1f2', text: '#e11d48', border: '#fecdd3' },
  'Closed Won':           { bg: '#f0fdf4', text: '#16a34a', border: '#bbf7d0' },
  'Closed Lost':          { bg: '#f9fafb', text: '#6b7280', border: '#e5e7eb' },
};

export default function StageBadge({ stage }) {
  if (!stage) return <span className="text-slate-300">—</span>;
  const s = STAGE_MAP[stage] || { bg: '#f8faff', text: '#64748b', border: '#e2e8f0' };
  return (
    <span
      className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-semibold border"
      style={{ background: s.bg, color: s.text, borderColor: s.border }}
    >
      ● {stage}
    </span>
  );
}
```

- [ ] **Step 2: Commit**

```bash
git add zoho-payment-tracker/frontend/src/components/StageBadge.jsx
git commit -m "feat(ui): update StageBadge to pastel color palette"
```

---

## Task 9: OpportunityDetail.jsx — layout 3 columnas

**Files:**
- Modify: `zoho-payment-tracker/frontend/src/pages/OpportunityDetail.jsx`

> Este es el cambio más grande. Reemplazar el archivo completo.

- [ ] **Step 1: Reemplazar OpportunityDetail.jsx**

```jsx
// zoho-payment-tracker/frontend/src/pages/OpportunityDetail.jsx
import React, { useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { getOpportunity, getSubforms, getMovimientos } from '../utils/api';
import { formatCOP, formatDate, formatDateTime } from '../utils/format';
import StageBadge from '../components/StageBadge';
import ProgressBar from '../components/ProgressBar';
import HorizontalBarChart from '../components/HorizontalBarChart';
import MovimientoTimeline from '../components/MovimientoTimeline';

function InfoGroup({ title, fields }) {
  return (
    <div className="flex flex-col gap-2">
      <div className="section-label pb-1.5 border-b border-slate-100">{title}</div>
      {fields.map(({ label, value, mono }) => (
        <div key={label} className="flex flex-col gap-0.5">
          <span className="text-[9px] text-slate-300 uppercase tracking-[0.4px]">{label}</span>
          {mono ? (
            <span className="font-mono text-[11px] bg-blue-50 text-blue-500 px-1.5 py-0.5 rounded w-fit">
              {value || '—'}
            </span>
          ) : (
            <span className="text-[12px] font-medium text-slate-800">{value || '—'}</span>
          )}
        </div>
      ))}
    </div>
  );
}

function PlanRow({ label, value, color }) {
  return (
    <div className="flex justify-between items-center py-2 border-b border-slate-50 last:border-0">
      <span className="text-[11px] text-slate-500">{label}</span>
      <span className="text-[12px] font-semibold" style={{ color: color || '#1e293b' }}>{value}</span>
    </div>
  );
}

export default function OpportunityDetail() {
  const { id } = useParams();
  const navigate = useNavigate();
  const [opp, setOpp] = useState(null);
  const [subforms, setSubforms] = useState({});
  const [movimientos, setMovimientos] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    setLoading(true);
    Promise.all([
      getOpportunity(id),
      getSubforms(id).catch(() => ({})),
      getMovimientos(id).catch(() => []),
    ]).then(([oppData, subData, movData]) => {
      setOpp(oppData);
      setSubforms(subData || {});
      setMovimientos(Array.isArray(movData) ? movData : (movData?.data || []));
    }).finally(() => setLoading(false));
  }, [id]);

  if (loading) {
    return (
      <div className="flex items-center justify-center h-full min-h-screen bg-aed-base">
        <span className="text-sm text-slate-400">Cargando…</span>
      </div>
    );
  }

  if (!opp) {
    return (
      <div className="flex items-center justify-center h-full min-h-screen bg-aed-base">
        <span className="text-sm text-slate-400">Oportunidad no encontrada</span>
      </div>
    );
  }

  // Build forma de pago bars from subform
  const formaPagoRows = (subforms.formaPago || []).map((row) => ({
    label: row.Tipo_de_Pago || row.tipo || row.concepto || 'Ítem',
    value: Number(row.Valor || row.valor || row.monto || 0),
  }));

  const valorTotal = Number(opp.valorTotal || 0);
  const separacion = Number(opp.valorSeparacion || 0);
  const cuotaInicial = Number(opp.cuotaInicial || 0);
  const financiado = valorTotal - cuotaInicial;
  const totalMovimientos = movimientos.reduce((s, m) => s + (Number(m.valor || m.monto) || 0), 0);
  const pct = cuotaInicial > 0 ? Math.round((totalMovimientos / cuotaInicial) * 100) : 0;

  return (
    <div className="flex flex-col h-full min-h-screen bg-aed-base">
      {/* Topbar */}
      <header className="h-[52px] bg-white border-b border-aed-border flex items-center px-4 gap-3 flex-shrink-0 sticky top-0 z-10">
        <button
          onClick={() => navigate(-1)}
          className="w-7 h-7 rounded-lg bg-slate-100 flex items-center justify-center text-slate-500 hover:bg-slate-200 transition-colors text-sm"
        >
          ←
        </button>
        <h1 className="text-[15px] font-bold text-slate-800">{opp.dealName || 'Oportunidad'}</h1>
        <StageBadge stage={opp.stage} />
        <span className="ml-auto text-[11px] text-slate-300">
          {opp.lastSync ? `Sync: ${formatDateTime(opp.lastSync)}` : ''}
        </span>
      </header>

      {/* 3-col body */}
      <div className="flex flex-1 overflow-hidden" style={{ minHeight: 'calc(100vh - 52px)' }}>

        {/* Left: Info */}
        <div className="w-[210px] bg-white border-r border-aed-border overflow-y-auto p-4 flex flex-col gap-4 shrink-0">
          <InfoGroup
            title="Contacto"
            fields={[
              { label: 'Nombre', value: opp.contactName },
              { label: 'Email', value: opp.email },
              { label: 'Teléfono', value: opp.phone },
            ]}
          />
          <InfoGroup
            title="Negocio"
            fields={[
              { label: 'Proyecto', value: opp.accountName || opp.proyecto },
              { label: 'Pago separación', value: opp.pagoSeparacion ? formatDate(opp.pagoSeparacion) : null },
              { label: 'Ref. recaudo', value: opp.refRecaudo, mono: true },
            ]}
          />
          {opp.seccionInmueble && Object.keys(opp.seccionInmueble).length > 0 && (
            <InfoGroup
              title="Inmueble"
              fields={Object.entries(opp.seccionInmueble)
                .filter(([, v]) => v !== null && v !== undefined && v !== '')
                .slice(0, 6)
                .map(([k, v]) => ({
                  label: k.replace(/_/g, ' '),
                  value: typeof v === 'object' ? (v?.name || JSON.stringify(v)) : String(v),
                }))}
            />
          )}
        </div>

        {/* Center: Financiero */}
        <div className="flex-1 overflow-y-auto p-4 flex flex-col gap-3">

          {/* Plan de pagos */}
          <div className="card p-4">
            <div className="flex items-center gap-2 mb-3">
              <div className="w-2 h-2 rounded-full bg-blue-500" />
              <span className="section-label">Plan de pagos</span>
            </div>
            {valorTotal > 0 ? (
              <>
                <PlanRow label="Valor total del inmueble" value={formatCOP(valorTotal)} />
                {separacion > 0 && <PlanRow label="Separación pagada" value={formatCOP(separacion)} color="#16a34a" />}
                {cuotaInicial > 0 && <PlanRow label="Cuota inicial" value={formatCOP(cuotaInicial)} color="#3b82f6" />}
                {financiado > 0 && <PlanRow label="Financiado" value={formatCOP(financiado)} />}
                {opp.seccionCotizacion && Object.entries(opp.seccionCotizacion)
                  .filter(([, v]) => v !== null && v !== undefined && v !== '')
                  .slice(0, 4)
                  .map(([k, v]) => (
                    <PlanRow key={k} label={k.replace(/_/g, ' ')} value={typeof v === 'number' ? formatCOP(v) : String(v)} />
                  ))}
              </>
            ) : (
              <p className="text-[11px] text-slate-400 italic">Sin datos de plan de pagos</p>
            )}
          </div>

          {/* Avance de recaudo */}
          {cuotaInicial > 0 && (
            <div className="card p-4">
              <div className="flex items-center gap-2 mb-3">
                <div className="w-2 h-2 rounded-full bg-green-400" />
                <span className="section-label">Avance de recaudo</span>
              </div>
              <ProgressBar
                pct={pct}
                leftLabel="Recaudado sobre cuota inicial"
                rightLabel={`${formatCOP(cuotaInicial - totalMovimientos)} restantes`}
              />
              <div className="flex justify-between mt-2">
                <span className="text-[10px] text-slate-400">{formatCOP(totalMovimientos)} pagados</span>
              </div>
            </div>
          )}

          {/* Forma de pago */}
          {formaPagoRows.length > 0 && (
            <div className="card p-4">
              <div className="flex items-center gap-2 mb-3">
                <div className="w-2 h-2 rounded-full bg-purple-400" />
                <span className="section-label">Forma de pago</span>
              </div>
              <HorizontalBarChart rows={formaPagoRows} total={valorTotal} />
            </div>
          )}

          {/* Propuesta de pago */}
          {(subforms.propuestaPago || []).length > 0 && (
            <div className="card p-4">
              <div className="flex items-center gap-2 mb-3">
                <div className="w-2 h-2 rounded-full bg-indigo-400" />
                <span className="section-label">Propuesta de pago</span>
              </div>
              <table className="w-full">
                <tbody>
                  {subforms.propuestaPago.map((row, i) => (
                    <tr key={i} className="border-b border-slate-50 last:border-0">
                      <td className="py-1.5 text-[11px] text-slate-500">
                        {row.Concepto || row.concepto || row.tipo || `Ítem ${i + 1}`}
                      </td>
                      <td className="py-1.5 text-[12px] font-semibold text-slate-800 text-right">
                        {formatCOP(row.Valor || row.valor || 0)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
          {(subforms.propuestaPago || []).length === 0 && (
            <div className="card p-4">
              <div className="flex items-center gap-2 mb-2">
                <div className="w-2 h-2 rounded-full bg-indigo-400" />
                <span className="section-label">Propuesta de pago</span>
              </div>
              <p className="text-[11px] text-slate-400 italic">Sin propuesta registrada</p>
            </div>
          )}
        </div>

        {/* Right: Movimientos */}
        <div className="w-[230px] bg-white border-l border-aed-border overflow-y-auto p-4 flex flex-col shrink-0">
          <div className="section-label pb-2 border-b border-slate-100 mb-3">Movimientos de pago</div>
          <MovimientoTimeline movimientos={movimientos} />
        </div>
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Verificar en http://localhost:5173/opportunity/[id]**

La vista muestra 3 columnas: izquierda (info de contacto/negocio/inmueble), centro (plan de pagos, barra de avance, forma de pago), derecha (timeline de movimientos). No hay secciones colapsables.

- [ ] **Step 3: Commit**

```bash
git add zoho-payment-tracker/frontend/src/pages/OpportunityDetail.jsx
git commit -m "feat(ui): redesign OpportunityDetail with 3-column layout"
```

---

## Task 10: FiduciaModule.jsx — master-detail + modal upload

**Files:**
- Modify: `zoho-payment-tracker/frontend/src/pages/FiduciaModule.jsx`

- [ ] **Step 1: Reemplazar FiduciaModule.jsx**

```jsx
// zoho-payment-tracker/frontend/src/pages/FiduciaModule.jsx
import React, { useState, useEffect, useRef } from 'react';
import { getEncargos, uploadFiducia, deleteEncargo, updateEncargo, getEncargo } from '../utils/api';
import { formatDateTime } from '../utils/format';

// ── Upload Modal ──────────────────────────────────────────────────────────────
function UploadModal({ onClose, onUploaded }) {
  const inputRef = useRef(null);
  const [dragging, setDragging] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [results, setResults] = useState(null);

  async function handleFiles(files) {
    const xlsx = [...files].filter((f) => /\.xlsx?$/i.test(f.name));
    if (!xlsx.length) return;
    setUploading(true);
    setResults(null);
    const out = [];
    for (const file of xlsx) {
      try {
        const fd = new FormData();
        fd.append('archivo', file);
        const res = await uploadFiducia(fd);
        out.push({ name: file.name, hojas: res.hojas?.length || 0, ok: true });
      } catch (err) {
        out.push({ name: file.name, error: err.response?.data?.error || err.message, ok: false });
      }
    }
    setResults(out);
    setUploading(false);
    onUploaded();
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30">
      <div className="bg-white rounded-2xl shadow-2xl border border-aed-border w-[440px] p-6 flex flex-col gap-4">
        <div className="flex items-center justify-between">
          <h2 className="text-[15px] font-bold text-slate-800">Importar Excel</h2>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-600 text-lg">✕</button>
        </div>

        <div
          onDragOver={(e) => { e.preventDefault(); setDragging(true); }}
          onDragLeave={() => setDragging(false)}
          onDrop={(e) => { e.preventDefault(); setDragging(false); handleFiles(e.dataTransfer.files); }}
          onClick={() => inputRef.current?.click()}
          className={`border-2 border-dashed rounded-xl p-8 text-center cursor-pointer transition-colors ${
            dragging ? 'border-blue-400 bg-blue-50' : 'border-aed-border hover:border-blue-400 hover:bg-aed-base'
          }`}
        >
          <input ref={inputRef} type="file" accept=".xlsx,.xls" multiple className="hidden"
            onChange={(e) => handleFiles(e.target.files)} />
          <div className="text-3xl mb-2">📄</div>
          <p className="text-sm font-medium text-slate-700">Arrastra archivos .xlsx aquí</p>
          <p className="text-xs text-slate-400 mt-1">o haz clic para seleccionar</p>
        </div>

        {uploading && <p className="text-sm text-slate-500 text-center">Procesando…</p>}

        {results && (
          <div className="flex flex-col gap-1.5">
            {results.map((r, i) => (
              <div key={i} className={`text-xs px-3 py-2 rounded-lg ${r.ok ? 'bg-green-50 text-green-700' : 'bg-red-50 text-red-600'}`}>
                {r.ok ? `✓ ${r.name} — ${r.hojas} hojas importadas` : `✗ ${r.name}: ${r.error}`}
              </div>
            ))}
            <button onClick={onClose} className="btn-primary mt-1 justify-center">Cerrar</button>
          </div>
        )}
      </div>
    </div>
  );
}

// ── Encargo Detail Panel ──────────────────────────────────────────────────────
function EncargoDetailPanel({ encargo, onDeleted }) {
  const [editMode, setEditMode] = useState(false);
  const [nombre, setNombre] = useState(encargo.nombre || '');
  const [codigo, setCodigo] = useState(encargo.codigo || '');
  const [saving, setSaving] = useState(false);
  const [activeTab, setActiveTab] = useState(0);

  const hojas = encargo.hojas || [];

  async function handleSave() {
    setSaving(true);
    try {
      await updateEncargo(encargo.id, { nombre, codigo });
      setEditMode(false);
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete() {
    if (!confirm(`¿Eliminar "${encargo.nombre}"?`)) return;
    await deleteEncargo(encargo.id);
    onDeleted();
  }

  const tabs = ['Resumen', ...hojas.map((h) => h.nombreHoja || h.nombre || `Hoja ${h.id}`)];
  const tabCounts = [encargo.totalApartamentos || '—', ...hojas.map((h) => h.totalFilas || h.filas || '—')];

  return (
    <div className="flex flex-col h-full overflow-hidden">
      {/* Header */}
      <div className="px-5 py-3.5 border-b border-aed-border bg-white flex items-center gap-3 shrink-0">
        <div>
          {editMode ? (
            <div className="flex gap-2 items-center">
              <input value={nombre} onChange={(e) => setNombre(e.target.value)}
                className="input text-sm py-1" style={{ width: 180 }} />
              <input value={codigo} onChange={(e) => setCodigo(e.target.value)}
                className="input text-sm py-1 font-mono" style={{ width: 100 }} />
            </div>
          ) : (
            <div className="flex items-center gap-2">
              <h2 className="text-[14px] font-bold text-slate-800">{encargo.nombre}</h2>
              <span className="font-mono text-[10px] bg-blue-50 text-blue-500 px-1.5 py-0.5 rounded">
                {encargo.codigo}
              </span>
            </div>
          )}
          <span className="text-[11px] text-slate-400">
            Importado {encargo.createdAt ? formatDateTime(encargo.createdAt) : '—'}
            {encargo.totalApartamentos ? ` · ${encargo.totalApartamentos} apartamentos` : ''}
          </span>
        </div>
        <div className="ml-auto flex gap-2">
          {editMode ? (
            <>
              <button onClick={handleSave} disabled={saving} className="btn-primary py-1 px-3 text-xs">
                {saving ? '…' : 'Guardar'}
              </button>
              <button onClick={() => setEditMode(false)} className="btn-secondary py-1 px-3 text-xs">
                Cancelar
              </button>
            </>
          ) : (
            <>
              <button onClick={() => setEditMode(true)} className="btn-secondary py-1 px-3 text-xs">✎ Editar</button>
              <button onClick={handleDelete}
                className="py-1 px-3 text-xs rounded-lg border border-red-200 bg-red-50 text-red-500 hover:bg-red-100 transition-colors">
                Eliminar
              </button>
            </>
          )}
        </div>
      </div>

      {/* Tabs */}
      <div className="flex gap-0 px-5 bg-white border-b border-aed-border overflow-x-auto shrink-0">
        {tabs.map((t, i) => (
          <button
            key={i}
            onClick={() => setActiveTab(i)}
            className={`py-2.5 px-3 text-[11px] font-medium whitespace-nowrap border-b-2 transition-colors ${
              activeTab === i
                ? 'text-blue-500 border-blue-500'
                : 'text-slate-400 border-transparent hover:text-slate-600'
            }`}
          >
            {t}
            <span className={`ml-1.5 px-1.5 py-0.5 rounded-full text-[9px] ${
              activeTab === i ? 'bg-blue-50 text-blue-500' : 'bg-slate-100 text-slate-500'
            }`}>
              {tabCounts[i]}
            </span>
          </button>
        ))}
      </div>

      {/* Tab content */}
      <div className="flex-1 overflow-auto">
        {activeTab === 0 ? (
          <div className="p-5">
            <p className="text-[12px] text-slate-500">
              Encargo con {hojas.length} hoja{hojas.length !== 1 ? 's' : ''} importada{hojas.length !== 1 ? 's' : ''}.
            </p>
            <div className="mt-3 flex flex-col gap-2">
              {hojas.map((h) => (
                <div key={h.id} className="flex items-center gap-3 p-3 bg-aed-base rounded-lg border border-aed-border">
                  <span className="text-[12px] font-medium text-slate-700">{h.nombreHoja || h.nombre}</span>
                  <span className="text-[10px] text-slate-400 ml-auto">{h.totalFilas || h.filas || 0} filas</span>
                </div>
              ))}
            </div>
          </div>
        ) : (
          <HojaTable hojaId={hojas[activeTab - 1]?.id} />
        )}
      </div>
    </div>
  );
}

// ── Hoja Table ────────────────────────────────────────────────────────────────
function HojaTable({ hojaId }) {
  const [rows, setRows] = useState([]);
  const [cols, setCols] = useState([]);
  const [page, setPage] = useState(1);
  const [total, setTotal] = useState(0);
  const [search, setSearch] = useState('');
  const [loading, setLoading] = useState(false);
  const PAGE_SIZE = 50;
  const API = import.meta.env.VITE_API_URL || 'http://localhost:3001';

  useEffect(() => {
    if (!hojaId) return;
    setLoading(true);
    const params = new URLSearchParams({ page, pageSize: PAGE_SIZE });
    if (search) params.set('search', search);
    fetch(`${API}/api/fiducia/hoja/${hojaId}/movimientos?${params}`)
      .then((r) => r.json())
      .then((d) => {
        const data = d.data || d.rows || [];
        setRows(data);
        setTotal(d.total || data.length);
        if (data.length > 0) setCols(Object.keys(data[0]));
      })
      .finally(() => setLoading(false));
  }, [hojaId, page, search]);

  if (!hojaId) return <p className="p-5 text-sm text-slate-400">Selecciona una hoja</p>;

  const totalPages = Math.ceil(total / PAGE_SIZE);

  return (
    <div className="flex flex-col h-full">
      <div className="flex items-center gap-3 px-4 py-2.5 border-b border-slate-50 bg-white">
        <input
          value={search} onChange={(e) => { setSearch(e.target.value); setPage(1); }}
          placeholder="🔍 Buscar nomenclatura o propietario…"
          className="input text-[11px] py-1.5 w-56"
        />
        <span className="text-[11px] text-slate-400 ml-auto">{total} registros</span>
      </div>

      <div className="overflow-auto flex-1">
        <table className="w-full border-collapse text-[11px]">
          <thead>
            <tr>
              {cols.map((c, i) => (
                <th
                  key={c}
                  className={`text-left px-3 py-2 text-[9px] font-bold uppercase tracking-[0.5px] text-slate-400 bg-aed-base border-b border-slate-50 whitespace-nowrap ${i === 0 ? 'sticky left-0 z-10 bg-aed-base' : ''}`}
                >
                  {c.replace(/_/g, ' ')}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr><td colSpan={cols.length || 1} className="text-center py-8 text-slate-400">Cargando…</td></tr>
            ) : rows.map((row, i) => (
              <tr key={i} className="border-b border-slate-50 hover:[&>td]:bg-blue-50/40 transition-colors">
                {cols.map((c, ci) => (
                  <td
                    key={c}
                    className={`px-3 py-2 text-slate-600 whitespace-nowrap ${ci === 0 ? 'sticky left-0 bg-white font-medium text-slate-800 z-10' : ''}`}
                  >
                    {row[c] !== null && row[c] !== undefined ? String(row[c]) : '—'}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="flex items-center justify-between px-4 py-2 border-t border-slate-50 bg-white shrink-0">
        <span className="text-[11px] text-slate-400">
          {Math.min((page - 1) * PAGE_SIZE + 1, total)}–{Math.min(page * PAGE_SIZE, total)} de {total}
        </span>
        <div className="flex gap-2">
          <button onClick={() => setPage((p) => Math.max(1, p - 1))} disabled={page === 1}
            className="px-3 py-1 text-[11px] rounded-md bg-aed-base border border-aed-border text-slate-600 disabled:opacity-40">
            ← Anterior
          </button>
          <button onClick={() => setPage((p) => Math.min(totalPages, p + 1))} disabled={page >= totalPages}
            className="px-3 py-1 text-[11px] rounded-md bg-blue-500 text-white disabled:opacity-40">
            Siguiente →
          </button>
        </div>
      </div>
    </div>
  );
}

// ── Main ──────────────────────────────────────────────────────────────────────
export default function FiduciaModule() {
  const [encargos, setEncargos] = useState([]);
  const [total, setTotal] = useState(0);
  const [search, setSearch] = useState('');
  const [selectedId, setSelectedId] = useState(null);
  const [selected, setSelected] = useState(null);
  const [showModal, setShowModal] = useState(false);
  const [loading, setLoading] = useState(true);

  function loadEncargos() {
    setLoading(true);
    getEncargos({ page: 1, pageSize: 50, search })
      .then((d) => { setEncargos(d.data || []); setTotal(d.total || 0); })
      .finally(() => setLoading(false));
  }

  useEffect(() => { loadEncargos(); }, [search]);

  useEffect(() => {
    if (!selectedId) { setSelected(null); return; }
    getEncargo(selectedId).then(setSelected).catch(() => setSelected(null));
  }, [selectedId]);

  return (
    <div className="flex h-full min-h-screen bg-white">
      {/* Left panel */}
      <div className="w-[280px] border-r border-aed-border flex flex-col shrink-0 bg-white">
        {/* Topbar */}
        <div className="h-[52px] border-b border-aed-border flex items-center px-4 gap-3 shrink-0">
          <h1 className="text-[15px] font-bold text-slate-800">Encargos</h1>
          <span className="text-[11px] text-slate-400">{total} activos</span>
          <button onClick={() => setShowModal(true)} className="btn-primary ml-auto py-1.5 px-3 text-xs">
            ↑ Importar
          </button>
        </div>

        {/* Search */}
        <div className="px-3 py-2.5 border-b border-slate-50">
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="🔍 Buscar encargo…"
            className="input text-[11px] py-1.5 w-full"
          />
        </div>

        {/* List */}
        <div className="flex-1 overflow-y-auto">
          {loading ? (
            <p className="text-center py-8 text-sm text-slate-400">Cargando…</p>
          ) : encargos.length === 0 ? (
            <p className="text-center py-8 text-sm text-slate-400">Sin encargos</p>
          ) : encargos.map((enc) => (
            <button
              key={enc.id}
              onClick={() => setSelectedId(enc.id)}
              className={`w-full text-left px-4 py-3 border-b border-slate-50 transition-colors flex flex-col gap-1 relative ${
                selectedId === enc.id ? 'bg-blue-50' : 'hover:bg-aed-base'
              }`}
            >
              {selectedId === enc.id && (
                <span className="absolute left-0 top-[6px] bottom-[6px] w-[3px] bg-blue-500 rounded-r" />
              )}
              <span className="text-[12px] font-semibold text-slate-800">{enc.nombre}</span>
              <span className="font-mono text-[10px] bg-blue-50 text-blue-500 px-1.5 py-0.5 rounded w-fit">
                {enc.codigo || '—'}
              </span>
              <div className="flex items-center gap-2 mt-0.5">
                <span className="text-[10px] text-slate-400">
                  {(enc.hojas || []).length} hoja{(enc.hojas || []).length !== 1 ? 's' : ''}
                </span>
                <span className="text-[10px] text-slate-300 ml-auto">
                  {enc.createdAt ? new Date(enc.createdAt).toLocaleDateString('es-CO') : ''}
                </span>
              </div>
            </button>
          ))}
        </div>
      </div>

      {/* Right panel */}
      <div className="flex-1 flex flex-col overflow-hidden bg-aed-base">
        {selected ? (
          <EncargoDetailPanel
            key={selected.id}
            encargo={selected}
            onDeleted={() => { setSelectedId(null); loadEncargos(); }}
          />
        ) : (
          <div className="flex-1 flex items-center justify-center">
            <div className="text-center">
              <div className="text-4xl mb-3">📁</div>
              <p className="text-sm text-slate-400">Selecciona un encargo para ver su detalle</p>
            </div>
          </div>
        )}
      </div>

      {showModal && (
        <UploadModal
          onClose={() => setShowModal(false)}
          onUploaded={() => { loadEncargos(); }}
        />
      )}
    </div>
  );
}
```

> **Nota:** Este componente llama a `getEncargo(id)` — verifica que esa función exista en `src/utils/api.js`. Si no existe, agrégala:
> ```js
> export const getEncargo = (id) => axios.get(`${API}/api/fiducia/${id}`).then(r => r.data);
> ```

- [ ] **Step 2: Verificar en http://localhost:5173/fiducia**

La vista muestra panel izquierdo con lista de encargos. Al hacer clic en uno aparece el panel derecho con tabs. El botón "↑ Importar" abre el modal. Al cerrar el modal la lista se recarga.

- [ ] **Step 3: Commit**

```bash
git add zoho-payment-tracker/frontend/src/pages/FiduciaModule.jsx
git commit -m "feat(ui): redesign FiduciaModule with master-detail and upload modal"
```

---

## Task 11: Paleta en ApartamentoDetalle.jsx y EncargoNomenclaturas.jsx

**Files:**
- Modify: `zoho-payment-tracker/frontend/src/pages/ApartamentoDetalle.jsx`
- Modify: `zoho-payment-tracker/frontend/src/pages/EncargoNomenclaturas.jsx`

- [ ] **Step 1: En ApartamentoDetalle.jsx — reemplazar clases de color del header**

Buscar y reemplazar estas clases de fondo oscuro/gradient existentes por las nuevas:

| Clase actual | Clase nueva |
|---|---|
| `bg-gradient-to-br from-slate-50 via-white to-blue-50` | `bg-aed-base` |
| `border-gray-200` | `border-aed-border` |
| `bg-gray-50` | `bg-aed-base` |
| `hover:bg-gray-50` | `hover:bg-aed-base` |
| `border-gray-100` | `border-slate-50` |
| `text-gray-500` | `text-slate-400` |
| `text-gray-400` | `text-slate-300` |
| `text-gray-800` o `text-gray-900` | `text-slate-800` |

Hacer el mismo reemplazo en `EncargoNomenclaturas.jsx`.

- [ ] **Step 2: Eliminar el `<NavBar />` de ambos archivos si está importado**

Buscar `import NavBar` y `<NavBar />` en cada archivo y eliminarlo — la navegación ahora es el Sidebar global.

- [ ] **Step 3: Verificar http://localhost:5173/fiducia/[id]/nomenclaturas**

La página muestra las tarjetas de nomenclaturas con la nueva paleta azul claro. No hay navbar horizontal duplicado.

- [ ] **Step 4: Commit**

```bash
git add zoho-payment-tracker/frontend/src/pages/ApartamentoDetalle.jsx zoho-payment-tracker/frontend/src/pages/EncargoNomenclaturas.jsx
git commit -m "feat(ui): update ApartamentoDetalle and EncargoNomenclaturas to aed palette"
```

---

## Task 12: Limpieza — eliminar NavBar.jsx y CollapsibleSection.jsx

**Files:**
- Delete: `zoho-payment-tracker/frontend/src/components/NavBar.jsx`
- Delete: `zoho-payment-tracker/frontend/src/components/CollapsibleSection.jsx`

- [ ] **Step 1: Verificar que ningún archivo importe estos componentes**

```bash
grep -r "NavBar\|CollapsibleSection" zoho-payment-tracker/frontend/src --include="*.jsx" --include="*.js"
```

Esperado: sin resultados. Si aparece algún archivo, eliminá el import y el uso antes de continuar.

- [ ] **Step 2: Eliminar los archivos**

```bash
rm zoho-payment-tracker/frontend/src/components/NavBar.jsx
rm zoho-payment-tracker/frontend/src/components/CollapsibleSection.jsx
```

- [ ] **Step 3: Confirmar que el dev server compila sin errores**

```bash
npm run dev
```

Sin errores en consola ni en el servidor de Vite.

- [ ] **Step 4: Commit final**

```bash
git add -A
git commit -m "chore(ui): remove NavBar and CollapsibleSection — replaced by Sidebar and 3-col layout"
```

---

## Self-Review

**Cobertura del spec:**

| Requisito | Tarea |
|---|---|
| Sidebar 60px con indicador activo | Task 2, 3 |
| Paleta `#f8faff` / `#e8f0fe` en Tailwind | Task 1 |
| 4 KPI cards en dashboard | Task 5 |
| Tabla con 6 cols, hover `#f0f6ff`, badge pastel | Task 5, 8 |
| StageBadge paleta pastel | Task 8 |
| Detalle oportunidad — col izquierda info | Task 9 |
| Plan de pagos + barra de avance + forma de pago | Task 6, 9 |
| Propuesta de pago — tabla compacta o "sin propuesta" | Task 9 |
| Timeline de movimientos con dot + connector | Task 7, 9 |
| Fiducia master-detail | Task 10 |
| Upload modal (no drag-and-drop en página principal) | Task 10 |
| Tabs por contenido (Resumen, hojas) con conteo | Task 10 |
| Primera columna sticky en tablas de hoja | Task 10 |
| Paleta actualizada en ApartamentoDetalle y EncargoNomenclaturas | Task 11 |
| Eliminar NavBar y CollapsibleSection | Task 12 |

Sin gaps detectados. Sin placeholders. Nombres de funciones consistentes entre tareas.
