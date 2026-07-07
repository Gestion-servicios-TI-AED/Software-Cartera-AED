# Fecha estimada y Conciliación en Negocios — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Show the "Fecha estimada" column in the payment-plan tables of the Negocios detail view, and add a new "Conciliación" section that crosses the Zoho payment plan against the negocio's real applied payments using cumulative-waterfall logic.

**Architecture:** Extract the existing date-estimation logic from `OpportunityDetail.jsx` into a shared util (`planDePagos.js`); expose `fechaInicioPlanPagos` through the negocios API; add a pure reconciliation util (`conciliacion.js`) and a new accordion component in `Negocios.jsx` that fetches subforms + all movements, runs the waterfall, and renders summary cards + a per-cuota status table.

**Tech Stack:** React (Vite) frontend, Node/Express/Prisma backend, Zoho subform data (`formaPago`/`propuestaPago` JSON), fiducia movements (`NegocioMovimiento`).

**Spec:** `docs/superpowers/specs/2026-07-07-conciliacion-negocios-design.md`

## Global Constraints

- No test suite exists in this repo — each task verifies via `npm run build` (frontend), `node -e` scripts (pure utils / backend load checks), and curl against the dev server. Do not add a test framework.
- `pagoSeparacion` must NOT change anywhere (backend or frontend).
- No Prisma schema changes, no migrations, no changes to the movimientos endpoint or its `limit=200` cap.
- Payment filter for conciliación: only movements with `datos.Estado` equal to `APLICADO` (trim + case-insensitive equality) and parsed `Valor > 0`.
- Plan source for conciliación: `formaPago`; if empty, fall back to `propuestaPago`.
- Date math/formatting always in UTC (`timeZone: 'UTC'`, `setUTCMonth`) — `fechaInicioPlanPagos` is a date-only field at UTC midnight; local-time math shifts it a day back in Bogotá (see commit `0e60038`).
- New util files use explicit `.js` extensions in their relative imports so they are loadable both by Vite and by plain `node` for verification.
- All user-facing copy in Spanish, matching the strings given verbatim in each task.

---

### Task 1: Shared util `planDePagos.js` + rewire `OpportunityDetail.jsx`

**Files:**
- Create: `zoho-payment-tracker/frontend/src/utils/planDePagos.js`
- Modify: `zoho-payment-tracker/frontend/src/pages/OpportunityDetail.jsx:115-150` (remove local `addDates`), `:194` (call site), `:1-6` (imports)

**Interfaces:**
- Produces (consumed by Tasks 3, 4, 5):
  - `detectarCuotaKey(rows) → string|null` — key of the column whose values identify the cuota (some row's value contains "separaci").
  - `fechaEstimadaCuota(fechaBase, cuotaVal) → Date|null` — "Separación" → base date; numeric N → base + N months (UTC); otherwise null.
  - `formatFechaUTC(fecha: Date) → string` — `dd/mm/aaaa` in `es-CO`, UTC.
  - `addFechaEstimada(rows, fechaBase) → rows` — rows enriched with a leading `'Fecha estimada'` display column; returns rows unchanged when `fechaBase` is falsy, rows empty, or no cuota column detected.

- [ ] **Step 1: Create the util**

`zoho-payment-tracker/frontend/src/utils/planDePagos.js`:

```js
// Cálculo de "Fecha estimada" para los subforms de plan de pagos de Zoho.
// fechaInicioPlanPagos es un campo de solo-fecha (medianoche UTC): toda la
// aritmética y el formateo se hacen en UTC para que la fecha mostrada no se
// corra un día en husos detrás de UTC (ej. Bogotá).

// Detecta la columna cuyo valor identifica la cuota: aquella donde alguna
// fila contiene "separaci" (p.ej. "Separación").
export function detectarCuotaKey(rows) {
  if (!rows?.length) return null;
  return (
    Object.keys(rows[0] || {}).find((k) =>
      rows.some((r) => String(r[k] || '').toLowerCase().includes('separaci'))
    ) || null
  );
}

// Fecha estimada de una cuota: "Separación" → fecha base; "N" → base + N meses.
export function fechaEstimadaCuota(fechaBase, cuotaVal) {
  if (!fechaBase) return null;
  const base = new Date(fechaBase);
  const val = String(cuotaVal || '').trim();
  if (val.toLowerCase().includes('separaci')) return base;
  const n = parseInt(val, 10);
  if (!isNaN(n) && n > 0) {
    const d = new Date(base);
    d.setUTCMonth(d.getUTCMonth() + n);
    return d;
  }
  return null;
}

export function formatFechaUTC(fecha) {
  return fecha.toLocaleDateString('es-CO', { day: '2-digit', month: '2-digit', year: 'numeric', timeZone: 'UTC' });
}

// Enriquece las filas con una columna "Fecha estimada" al inicio.
export function addFechaEstimada(rows, fechaBase) {
  if (!fechaBase || !rows?.length) return rows;
  const cuotaKey = detectarCuotaKey(rows);
  if (!cuotaKey) return rows;
  return rows.map((row) => {
    const fecha = fechaEstimadaCuota(fechaBase, row[cuotaKey]);
    if (!fecha) return row;
    return { 'Fecha estimada': formatFechaUTC(fecha), ...row };
  });
}
```

- [ ] **Step 2: Verify util behavior with node**

Run from `zoho-payment-tracker/frontend`:

```bash
node -e "
import('./src/utils/planDePagos.js').then(({ addFechaEstimada }) => {
  const rows = [
    { Cuota: 'Separación', Valor: '$ 5.000.000' },
    { Cuota: '1', Valor: '$ 10.481.052' },
    { Cuota: '2', Valor: '$ 10.481.052' },
    { Cuota: 'Saldo Contraentrega', Valor: '$ 720.884.500' },
  ];
  const out = addFechaEstimada(rows, '2023-04-25T00:00:00.000Z');
  out.forEach((r) => console.log(r['Fecha estimada'] ?? '(sin fecha)', '|', r.Cuota));
  console.log('sin base:', addFechaEstimada(rows, null) === rows ? 'passthrough OK' : 'FAIL');
});"
```

Expected output (dates must be day 25 — not 24 — regardless of local timezone):

```
25/04/2023 | Separación
25/05/2023 | 1
25/06/2023 | 2
(sin fecha) | Saldo Contraentrega
sin base: passthrough OK
```

- [ ] **Step 3: Rewire `OpportunityDetail.jsx`**

Add the import (top of file, alongside the other `../utils/` imports):

```jsx
import { addFechaEstimada } from '../utils/planDePagos';
```

Delete the whole local `addDates` function (lines 120-150, the block starting with the comment `// Enriquece las filas de Forma de Pago…` and ending with the closing `}` of `addDates`).

Change the call site:

```jsx
<SubformTable rows={addDates(subforms.formaPago)} />
```

to:

```jsx
<SubformTable rows={addFechaEstimada(subforms.formaPago, fechaInicioPlanPagos)} />
```

No other changes — the disclaimer condition (`{fechaInicioPlanPagos && subforms.formaPago?.length > 0 && (…)}`) stays as is.

- [ ] **Step 4: Verify the frontend compiles**

Run from `zoho-payment-tracker/frontend`:

```bash
npm run build
```

Expected: Vite build completes with `✓ built in …` and no errors.

- [ ] **Step 5: Commit**

```bash
git add zoho-payment-tracker/frontend/src/utils/planDePagos.js zoho-payment-tracker/frontend/src/pages/OpportunityDetail.jsx
git commit -m "Extract Fecha estimada logic into shared planDePagos util"
```

---

### Task 2: Backend — expose `fechaInicioPlanPagos` in the negocio's linked oportunidad

**Files:**
- Modify: `zoho-payment-tracker/backend/src/routes/negocios.js:596-610` (`findOportunidadByReferencia`)

**Interfaces:**
- Produces (consumed by Tasks 3, 5): `GET /api/negocios/:referencia` → `oportunidad.fechaInicioPlanPagos` (ISO string or null).

- [ ] **Step 1: Add the field to the select**

In `zoho-payment-tracker/backend/src/routes/negocios.js`, find:

```js
  const select = {
    id: true, dealName: true, stage: true, referenciaRecaudo: true,
    pagoSeparacion: true, camposFinancieros: true, lastSyncedAt: true,
  };
```

Replace with:

```js
  const select = {
    id: true, dealName: true, stage: true, referenciaRecaudo: true,
    pagoSeparacion: true, fechaInicioPlanPagos: true, camposFinancieros: true, lastSyncedAt: true,
  };
```

- [ ] **Step 2: Verify the file loads**

Run from `zoho-payment-tracker/backend`:

```bash
node -e "require('./src/routes/negocios.js'); console.log('loaded ok');"
```

Expected: `loaded ok`.

- [ ] **Step 3: Commit**

```bash
git add zoho-payment-tracker/backend/src/routes/negocios.js
git commit -m "Expose fechaInicioPlanPagos in the negocio's linked oportunidad"
```

---

### Task 3: "Fecha estimada" column in the Negocios plan tables

**Files:**
- Modify: `zoho-payment-tracker/frontend/src/pages/Negocios.jsx:422-474` (`PlanDePagosZoho`) and its imports

**Interfaces:**
- Consumes: `addFechaEstimada(rows, fechaBase)` from Task 1; `oportunidad.fechaInicioPlanPagos` from Task 2 (already present on the `negocio.oportunidad` object passed as prop).

- [ ] **Step 1: Import the util**

In `zoho-payment-tracker/frontend/src/pages/Negocios.jsx`, add alongside the other `../utils/` imports:

```jsx
import { addFechaEstimada } from '../utils/planDePagos';
```

- [ ] **Step 2: Apply the column and disclaimers in `PlanDePagosZoho`**

Replace the block after the loading check — currently:

```jsx
  const forma = subforms?.formaPago || [];
  const propuesta = subforms?.propuestaPago || [];

  if (forma.length === 0 && propuesta.length === 0) {
    return <p className="px-4 py-4 text-[14px] text-slate-500 italic">Sin forma ni propuesta de pago registradas</p>;
  }

  return (
    <div className="flex flex-col gap-4 p-4">
      {forma.length > 0 && (
        <div>
          <p className="section-label mb-2">Forma de pago</p>
          <div className="rounded-lg border border-aed-border overflow-hidden">
            <PlanSubTable rows={forma} />
          </div>
        </div>
      )}
      {propuesta.length > 0 && (
        <div>
          <p className="section-label mb-2">Propuesta de pago</p>
          <div className="rounded-lg border border-aed-border overflow-hidden">
            <PlanSubTable rows={propuesta} />
          </div>
        </div>
      )}
    </div>
  );
```

with:

```jsx
  const forma = addFechaEstimada(subforms?.formaPago || [], oportunidad.fechaInicioPlanPagos);
  const propuesta = addFechaEstimada(subforms?.propuestaPago || [], oportunidad.fechaInicioPlanPagos);
  const tieneFechas = (rows) => rows.some((r) => 'Fecha estimada' in r);

  if (forma.length === 0 && propuesta.length === 0) {
    return <p className="px-4 py-4 text-[14px] text-slate-500 italic">Sin forma ni propuesta de pago registradas</p>;
  }

  const aviso = (
    <p className="text-[12px] text-slate-500 italic mt-2 px-1">
      * Fechas estimadas con periodicidad mensual desde la fecha de separación. No representan fechas contractuales.
    </p>
  );

  return (
    <div className="flex flex-col gap-4 p-4">
      {forma.length > 0 && (
        <div>
          <p className="section-label mb-2">Forma de pago</p>
          <div className="rounded-lg border border-aed-border overflow-hidden">
            <PlanSubTable rows={forma} />
          </div>
          {tieneFechas(forma) && aviso}
        </div>
      )}
      {propuesta.length > 0 && (
        <div>
          <p className="section-label mb-2">Propuesta de pago</p>
          <div className="rounded-lg border border-aed-border overflow-hidden">
            <PlanSubTable rows={propuesta} />
          </div>
          {tieneFechas(propuesta) && aviso}
        </div>
      )}
    </div>
  );
```

Note: `PlanSubTable` needs no changes — it renders whatever keys the rows carry, and the `'Fecha estimada'` values (strings like `25/04/2023`) are correctly ignored by its money-detection (`parseAmt` returns NaN for date-shaped strings).

- [ ] **Step 3: Verify the frontend compiles**

Run from `zoho-payment-tracker/frontend`:

```bash
npm run build
```

Expected: `✓ built in …`, no errors.

- [ ] **Step 4: Commit**

```bash
git add zoho-payment-tracker/frontend/src/pages/Negocios.jsx
git commit -m "Show Fecha estimada column in Negocios payment plan tables"
```

---

### Task 4: Reconciliation util `conciliacion.js`

**Files:**
- Create: `zoho-payment-tracker/frontend/src/utils/conciliacion.js`

**Interfaces:**
- Consumes: `detectarCuotaKey`, `fechaEstimadaCuota` from `./planDePagos.js` (Task 1).
- Produces (consumed by Task 5):
  - `parseMonto(v) → number|NaN` — parses monetary strings (`"$ 5.000.000"` → 5000000); NaN for dates/empties.
  - `construirPlan(rows, fechaBase) → [{ etiqueta, valorPlan, fechaEstimada }]` — plan cuotas from subform rows; excludes rows without a positive amount; `fechaEstimada` is `Date|null`.
  - `normalizarPagos(movimientos) → [{ fecha: Date|null, valor: number }]` — APLICADO-only, positive amounts, sorted by date asc (nulls last).
  - `conciliar(cuotasPlan, pagos) → { cuotas, resumen }` where `cuotas[i] = { etiqueta, valorPlan, fechaEstimada, cubierto, estado: 'pagada'|'parcial'|'pendiente', atrasada: boolean, fechaCubierta: Date|null }` and `resumen = { totalPlan, totalPagado, porcentaje, cuotasPagadas, totalCuotas, cuotasEnMora, montoEnMora, saldoAFavor }`.

- [ ] **Step 1: Create the util**

`zoho-payment-tracker/frontend/src/utils/conciliacion.js`:

```js
// Conciliación de cartera: cruza el plan de pagos de Zoho (Forma de pago)
// contra los pagos reales del negocio (movimientos APLICADOS) con lógica de
// cascada acumulada: los pagos, en orden cronológico, van cubriendo las
// cuotas en el orden del plan.
import { detectarCuotaKey, fechaEstimadaCuota } from './planDePagos.js';

// Parsea un valor monetario a número. NaN para vacíos y fechas dd/mm/aaaa.
export function parseMonto(v) {
  if (v == null || v === '') return NaN;
  if (typeof v === 'number') return v;
  const s = String(v).trim();
  if (/^\d{1,2}[\/\-]\d{1,2}[\/\-]\d{2,4}$/.test(s)) return NaN; // es una fecha
  return parseFloat(s.replace(/[^0-9-]/g, ''));
}

const SKIP_KEYS = ['id', 'Created_Time', 'Modified_Time', '$line_tax', '$permissions', 'Owner'];

// Construye las cuotas del plan desde las filas del subform. Se excluyen las
// filas sin monto positivo (mismo espíritu que el filtrado de PlanSubTable).
export function construirPlan(rows, fechaBase) {
  if (!rows?.length) return [];
  const keys = [...new Set(rows.flatMap(Object.keys))].filter((k) => !SKIP_KEYS.includes(k));
  const cuotaKey = detectarCuotaKey(rows);
  // Columnas monetarias: alguna fila con valor >= 1000 (en COP todo monto real supera eso).
  const moneyKeys = keys.filter(
    (k) => k !== cuotaKey && rows.some((r) => { const n = parseMonto(r[k]); return !isNaN(n) && n >= 1000; })
  );
  const plan = [];
  rows.forEach((row, i) => {
    let valorPlan = NaN;
    for (const k of moneyKeys) {
      const n = parseMonto(row[k]);
      if (!isNaN(n) && n !== 0) { valorPlan = n; break; }
    }
    if (isNaN(valorPlan) || valorPlan <= 0) return; // fila sin monto → no es cuota
    const etiqueta = cuotaKey ? String(row[cuotaKey] ?? `Fila ${i + 1}`) : `Fila ${i + 1}`;
    plan.push({
      etiqueta,
      valorPlan,
      fechaEstimada: cuotaKey ? fechaEstimadaCuota(fechaBase, row[cuotaKey]) : null,
    });
  });
  return plan;
}

// Pagos reales: solo APLICADOS con valor positivo, ordenados por fecha
// contable ascendente (sin fecha al final — igual cuentan en la bolsa).
export function normalizarPagos(movimientos) {
  return (movimientos || [])
    .filter((m) => String(m.datos?.Estado || '').trim().toUpperCase() === 'APLICADO')
    .map((m) => ({ fecha: m.fechaContable ? new Date(m.fechaContable) : null, valor: parseMonto(m.datos?.Valor) }))
    .filter((p) => !isNaN(p.valor) && p.valor > 0)
    .sort((a, b) => {
      if (!a.fecha && !b.fecha) return 0;
      if (!a.fecha) return 1;
      if (!b.fecha) return -1;
      return a.fecha - b.fecha;
    });
}

// Cascada acumulada. Una cuota no pagada cuya fecha estimada ya venció queda
// marcada "atrasada". fechaCubierta = fecha del pago cuyo acumulado alcanzó
// el requerido acumulado del plan hasta esa cuota.
export function conciliar(cuotasPlan, pagos) {
  const totalPagado = pagos.reduce((s, p) => s + p.valor, 0);
  let acumuladoPago = 0;
  const prefijos = pagos.map((p) => ({ fecha: p.fecha, acumulado: (acumuladoPago += p.valor) }));

  const hoy = new Date();
  let disponible = totalPagado;
  let requerido = 0;

  const cuotas = cuotasPlan.map((c) => {
    const cubierto = Math.max(0, Math.min(c.valorPlan, disponible));
    disponible -= cubierto;
    requerido += c.valorPlan;
    const estado = cubierto >= c.valorPlan ? 'pagada' : cubierto > 0 ? 'parcial' : 'pendiente';
    let fechaCubierta = null;
    if (estado === 'pagada') {
      const p = prefijos.find((x) => x.acumulado >= requerido);
      fechaCubierta = p ? p.fecha : null;
    }
    const atrasada = estado !== 'pagada' && c.fechaEstimada != null && c.fechaEstimada < hoy;
    return { ...c, cubierto, estado, atrasada, fechaCubierta };
  });

  const totalPlan = cuotas.reduce((s, c) => s + c.valorPlan, 0);
  const enMora = cuotas.filter((c) => c.atrasada);
  const resumen = {
    totalPlan,
    totalPagado,
    porcentaje: totalPlan > 0 ? Math.round((totalPagado / totalPlan) * 100) : 0,
    cuotasPagadas: cuotas.filter((c) => c.estado === 'pagada').length,
    totalCuotas: cuotas.length,
    cuotasEnMora: enMora.length,
    montoEnMora: enMora.reduce((s, c) => s + (c.valorPlan - c.cubierto), 0),
    saldoAFavor: Math.max(0, totalPagado - totalPlan),
  };
  return { cuotas, resumen };
}
```

- [ ] **Step 2: Verify the waterfall with node (known inputs → known outputs)**

Run from `zoho-payment-tracker/frontend`:

```bash
node -e "
import('./src/utils/conciliacion.js').then(({ construirPlan, normalizarPagos, conciliar }) => {
  const rows = [
    { Cuota: 'Separación', Valor: '$ 5.000.000' },
    { Cuota: '1', Valor: '$ 10.000.000' },
    { Cuota: '2', Valor: '$ 10.000.000' },
    { Cuota: '3', Valor: '$ 0' },
  ];
  // Base hace ~3 años → cuotas 1 y 2 ya vencieron
  const plan = construirPlan(rows, '2023-04-25T00:00:00.000Z');
  const movs = [
    { fechaContable: '2023-04-20T00:00:00.000Z', datos: { Estado: 'APLICADO', Valor: '5000000' } },
    { fechaContable: '2023-06-01T00:00:00.000Z', datos: { Estado: 'APLICADO', Valor: '11000000' } },
    { fechaContable: '2023-07-01T00:00:00.000Z', datos: { Estado: 'PENDIENTE', Valor: '99000000' } },
  ];
  const { cuotas, resumen } = conciliar(plan, normalizarPagos(movs));
  cuotas.forEach((c) => console.log(c.etiqueta, c.estado, c.atrasada ? 'ATRASADA' : '', 'cubierto:', c.cubierto));
  console.log(resumen);
});"
```

Expected:

- `Separación pagada  cubierto: 5000000`
- `1 pagada  cubierto: 10000000`
- `2 parcial ATRASADA cubierto: 1000000`
- Row `Cuota 3` absent (amount 0 → excluded from plan).
- `resumen`: `totalPlan: 25000000`, `totalPagado: 16000000` (the PENDIENTE 99M excluded), `porcentaje: 64`, `cuotasPagadas: 2`, `totalCuotas: 3`, `cuotasEnMora: 1`, `montoEnMora: 9000000`, `saldoAFavor: 0`.

- [ ] **Step 3: Commit**

```bash
git add zoho-payment-tracker/frontend/src/utils/conciliacion.js
git commit -m "Add conciliacion util: waterfall matching of plan vs applied payments"
```

---

### Task 5: "Conciliación" section in the negocio detail

**Files:**
- Modify: `zoho-payment-tracker/frontend/src/pages/Negocios.jsx` — imports, new `ConciliacionSection` component (insert right after `PlanDePagosZoho`), and one new accordion inside `NegocioDetalle`.

**Interfaces:**
- Consumes: `construirPlan`, `normalizarPagos`, `conciliar` from Task 4; `formatFechaUTC` from Task 1; `getSubforms(id)` and `getNegocioMovimientos(referencia, { page, limit })` from `../utils/api` (already imported in this file); `negocio.oportunidad.fechaInicioPlanPagos` from Task 2; the existing local `formatCOP` helper and `Accordion` component.

- [ ] **Step 1: Add imports**

In `zoho-payment-tracker/frontend/src/pages/Negocios.jsx`:

- Add `Scale` to the existing `lucide-react` import list.
- Add below the other util imports:

```jsx
import { formatFechaUTC } from '../utils/planDePagos';
import { construirPlan, normalizarPagos, conciliar } from '../utils/conciliacion';
```

(The `addFechaEstimada` import from Task 3 stays; combine into one line for planDePagos: `import { addFechaEstimada, formatFechaUTC } from '../utils/planDePagos';`)

- [ ] **Step 2: Add the `ConciliacionSection` component**

Insert immediately after the `PlanDePagosZoho` function:

```jsx
// ── Conciliación: plan de pagos (Zoho) vs pagos reales (fiducia) ────────────

function badgeConciliacion(c) {
  if (c.atrasada) return { txt: 'Atrasada', cls: 'text-red-700 bg-red-50' };
  if (c.estado === 'pagada') return { txt: 'Pagada', cls: 'text-emerald-700 bg-emerald-50' };
  if (c.estado === 'parcial') return { txt: 'Parcial', cls: 'text-amber-700 bg-amber-50' };
  return { txt: 'Pendiente', cls: 'text-slate-600 bg-slate-100' };
}

// Etiquetas numéricas del subform ("1", "2"…) se muestran como "Cuota N".
function labelCuota(etiqueta) {
  return /^\d+$/.test(etiqueta) ? `Cuota ${etiqueta}` : etiqueta;
}

function ConciliacionSection({ negocio }) {
  const oportunidad = negocio.oportunidad;
  const [datos, setDatos] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    if (!oportunidad) { setLoading(false); return; }
    let alive = true;
    (async () => {
      try {
        const subs = await getSubforms(oportunidad.id);
        // Todos los movimientos del negocio (loop defensivo si total > 200)
        const movs = [];
        let page = 1, totalPages = 1;
        do {
          const res = await getNegocioMovimientos(negocio.referencia, { page, limit: 200 });
          movs.push(...(res.data || []));
          totalPages = res.pagination?.totalPages ?? 1;
          page += 1;
        } while (page <= totalPages);
        if (alive) setDatos({ subforms: subs || { formaPago: [], propuestaPago: [] }, movimientos: movs });
      } catch (err) {
        if (alive) setError(err.message);
      } finally {
        if (alive) setLoading(false);
      }
    })();
    return () => { alive = false; };
  }, [oportunidad?.id, negocio.referencia]);

  if (!oportunidad) {
    return <p className="px-4 py-4 text-[14px] text-slate-500 italic">Sin oportunidad de Zoho vinculada a esta referencia.</p>;
  }
  if (loading) {
    return (
      <p className="flex items-center gap-2 px-4 py-4 text-[14px] text-slate-500">
        <svg className="w-4 h-4 animate-spin text-brand" fill="none" viewBox="0 0 24 24">
          <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
          <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
        </svg>
        Cargando conciliación…
      </p>
    );
  }
  if (error) {
    return <p className="px-4 py-4 text-[14px] text-red-500">Error cargando la conciliación: {error}</p>;
  }

  const planRows = datos.subforms.formaPago?.length ? datos.subforms.formaPago : (datos.subforms.propuestaPago || []);
  const cuotasPlan = construirPlan(planRows, oportunidad.fechaInicioPlanPagos);
  if (cuotasPlan.length === 0) {
    return <p className="px-4 py-4 text-[14px] text-slate-500 italic">La oportunidad vinculada no tiene plan de pagos registrado.</p>;
  }

  const { cuotas, resumen } = conciliar(cuotasPlan, normalizarPagos(datos.movimientos));

  return (
    <div className="flex flex-col gap-4 p-4">
      {/* Resumen */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <div className="rounded-lg border border-aed-border bg-white p-3">
          <p className="section-label mb-1">Total plan</p>
          <p className="text-[15px] font-bold text-slate-800 tabular-nums">{formatCOP(resumen.totalPlan)}</p>
        </div>
        <div className="rounded-lg border border-aed-border bg-white p-3">
          <p className="section-label mb-1">Total pagado</p>
          <p className="text-[15px] font-bold text-emerald-600 tabular-nums">
            {formatCOP(resumen.totalPagado) ?? '$ 0'}
            <span className="ml-1 text-[12px] font-semibold text-slate-500">({resumen.porcentaje}%)</span>
          </p>
        </div>
        <div className="rounded-lg border border-aed-border bg-white p-3">
          <p className="section-label mb-1">Cuotas pagadas</p>
          <p className="text-[15px] font-bold text-slate-800 tabular-nums">{resumen.cuotasPagadas}/{resumen.totalCuotas}</p>
        </div>
        <div className="rounded-lg border border-aed-border bg-white p-3">
          <p className="section-label mb-1">En mora</p>
          {resumen.cuotasEnMora > 0 ? (
            <p className="text-[15px] font-bold text-red-600 tabular-nums">
              {resumen.cuotasEnMora} {resumen.cuotasEnMora === 1 ? 'cuota' : 'cuotas'}
              <span className="block text-[12px] font-semibold">{formatCOP(resumen.montoEnMora)}</span>
            </p>
          ) : (
            <p className="text-[15px] font-bold text-slate-400">—</p>
          )}
        </div>
      </div>

      {/* Tabla de cuotas */}
      <div className="rounded-lg border border-aed-border overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-[14px]">
            <thead>
              <tr className="bg-aed-base border-b border-aed-border">
                <th className="section-label px-3 py-2 text-left whitespace-nowrap">Cuota</th>
                <th className="section-label px-3 py-2 text-left whitespace-nowrap">Fecha estimada</th>
                <th className="section-label px-3 py-2 text-right whitespace-nowrap">Valor plan</th>
                <th className="section-label px-3 py-2 text-right whitespace-nowrap">Cubierto</th>
                <th className="section-label px-3 py-2 text-right whitespace-nowrap">Estado</th>
              </tr>
            </thead>
            <tbody>
              {cuotas.map((c, i) => {
                const badge = badgeConciliacion(c);
                return (
                  <tr key={i} className="border-b border-aed-border last:border-0 hover:bg-brand-tint">
                    <td className="px-3 py-2 text-slate-700 whitespace-nowrap">{labelCuota(c.etiqueta)}</td>
                    <td className="px-3 py-2 text-slate-500 whitespace-nowrap">
                      {c.fechaEstimada ? formatFechaUTC(c.fechaEstimada) : '—'}
                    </td>
                    <td className="px-3 py-2 text-right text-slate-700 whitespace-nowrap tabular-nums">{formatCOP(c.valorPlan)}</td>
                    <td className="px-3 py-2 text-right whitespace-nowrap tabular-nums">
                      {c.cubierto > 0 ? (
                        <span className={c.estado === 'pagada' ? 'text-emerald-600' : 'text-amber-600'}>{formatCOP(c.cubierto)}</span>
                      ) : (
                        <span className="text-slate-300">—</span>
                      )}
                    </td>
                    <td className="px-3 py-2 text-right whitespace-nowrap">
                      <span className={`text-[12px] font-bold px-2 py-0.5 rounded-full ${badge.cls}`}>{badge.txt}</span>
                      {c.atrasada && c.fechaEstimada && (
                        <span className="block text-[11px] text-red-500 mt-0.5">venció {formatFechaUTC(c.fechaEstimada)}</span>
                      )}
                      {c.estado === 'pagada' && c.fechaCubierta && (
                        <span className="block text-[11px] text-slate-400 mt-0.5">pagada el {formatFechaUTC(c.fechaCubierta)}</span>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      {resumen.saldoAFavor > 0 && (
        <p className="text-[13px] font-semibold text-emerald-700 px-1">
          Saldo a favor: {formatCOP(resumen.saldoAFavor)}
        </p>
      )}

      <p className="text-[12px] text-slate-500 italic px-1">
        * Conciliación estimada según fechas calculadas y pagos APLICADOS. No representa un estado de cuenta oficial.
      </p>
    </div>
  );
}
```

- [ ] **Step 3: Insert the accordion in `NegocioDetalle`**

Between accordion 4 (Historial de movimientos) and accordion 5 (Forma y propuesta de pago), insert:

```jsx
      {/* 5. Conciliación plan vs pagos reales */}
      <Accordion icon={Scale} title="Conciliación" accent="#0891b2" defaultOpen={false}>
        <ConciliacionSection key={referencia} negocio={negocio} />
      </Accordion>
```

(And renumber the following comment to `{/* 6. Forma y propuesta de pago … */}` for consistency.)

- [ ] **Step 4: Verify the frontend compiles**

Run from `zoho-payment-tracker/frontend`:

```bash
npm run build
```

Expected: `✓ built in …`, no errors.

- [ ] **Step 5: Commit**

```bash
git add zoho-payment-tracker/frontend/src/pages/Negocios.jsx
git commit -m "Add Conciliacion section to negocio detail: plan vs applied payments"
```

---

### Task 6: End-to-end verification with real data

**Files:** none (operational verification)

**Interfaces:**
- Consumes: everything from Tasks 1-5, the running dev backend, and the real DB.

- [ ] **Step 1: Find a good test negocio**

Start the backend (`npm run dev` in `zoho-payment-tracker/backend`, background). Then run from `zoho-payment-tracker/backend`:

```bash
node -e "
const { PrismaClient } = require('@prisma/client');
const p = new PrismaClient();
(async () => {
  const negocios = await p.negocio.findMany({ select: { referencia: true, id: true }, take: 2000 });
  for (const n of negocios) {
    const opp = await p.opportunity.findFirst({
      where: { referenciaRecaudo: { contains: n.referencia } },
      select: { id: true, dealName: true, fechaInicioPlanPagos: true },
    });
    if (!opp || !opp.fechaInicioPlanPagos) continue;
    const movs = await p.negocioMovimiento.count({ where: { referencia: n.referencia } });
    if (movs > 0) { console.log({ referencia: n.referencia, deal: opp.dealName, oppId: opp.id, movs }); break; }
  }
  await p.\$disconnect();
})();"
```

Expected: one line with a `referencia`, deal name, opportunity id and a positive movement count. Use that referencia below.

- [ ] **Step 2: Cross-check the numbers by API**

With `<REF>` from Step 1:

```bash
curl -s "http://localhost:3001/api/negocios/<REF>" | node -e "let d='';process.stdin.on('data',c=>d+=c);process.stdin.on('end',()=>{const o=JSON.parse(d);console.log({saldoActual:o.saldoActual, fechaInicio:o.oportunidad?.fechaInicioPlanPagos});})"
curl -s "http://localhost:3001/api/negocios/<REF>/movimientos?limit=200" | node -e "let d='';process.stdin.on('data',c=>d+=c);process.stdin.on('end',()=>{const r=JSON.parse(d);const ap=r.data.filter(m=>String(m.datos?.Estado||'').trim().toUpperCase()==='APLICADO');console.log({total:r.pagination.total, aplicados:ap.length, sumaAplicados:ap.reduce((s,m)=>s+parseFloat(String(m.datos?.Valor||'').replace(/[^0-9.-]/g,''))||0,0)});})"
```

Expected: `fechaInicio` non-null; `sumaAplicados` should be in the same ballpark as the negocio's `saldoActual` ("Total abonado") — they use the same APLICADO criterion, so a large mismatch means a bug worth investigating before proceeding.

- [ ] **Step 3: Verify in the app (or by logic reproduction if no browser is available)**

Start the frontend (`npm run dev` in `zoho-payment-tracker/frontend`), open the Negocios module, select the negocio from Step 1 and check:

- "Forma y propuesta de pago" shows the "Fecha estimada" column + disclaimer.
- "Conciliación" shows the 4 summary cards, a status table where early cuotas are Pagada, the payment frontier is Parcial, later ones Pendiente/Atrasada per their dates, and `Total pagado` equals the `sumaAplicados` from Step 2.
- A negocio WITHOUT a linked opportunity shows the empty message in Conciliación.

If no browser automation is available in the environment, replicate the exact component logic in a node script against the two API responses from Step 2 (plan via `GET /api/opportunities/<oppId>/subforms`, payments via the movimientos endpoint) and print the resulting `cuotas`/`resumen`, verifying the same three points; then note in the report that pixel-level rendering needs a human check.

- [ ] **Step 4: Stop the dev servers**

Stop backend/frontend processes started for this verification (kill by port 3001/5173 PIDs). No commit — this task changes no files.
