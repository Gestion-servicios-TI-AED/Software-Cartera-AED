# Reversas de pago y desglose por cuota — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make Conciliación net out real payment reversals (desistimientos, devoluciones, and the currently-mis-filtered negative-APLICADO movements) instead of ignoring them, and let each cuota row expand to show exactly which real payments landed in its slice of the cascade.

**Architecture:** Widen `normalizarPagos()`'s inclusion rule (data layer) and add a `pagosAplicados` field per cuota inside `conciliar()`, computed via an interval-overlap test against the same cumulative prefix-sum array already used for `fechaCubierta`. The UI (`Negocios.jsx`) turns each cuota's table row into its own small stateful component (mirroring the existing `MovimientoRow` expand/collapse pattern) that renders `pagosAplicados` when expanded.

**Tech Stack:** React (Vite) frontend. No backend or schema changes.

**Spec:** `docs/superpowers/specs/2026-07-07-conciliacion-reversas-y-detalle-cuota-design.md`

## Global Constraints

- No test suite exists in this repo — verification uses `node -e` scripts with known inputs/outputs (pure functions) plus `npm run build`, and a final real-data check against the two negocios that motivated this work (`1370121410800`, `9928935431404`).
- Payment inclusion: `Estado === 'APLICADO'` (any sign) OR `Tipo Movimiento` is exactly `DESISTIMIENTOS` or `DEVOLUCION MAYOR VALOR PAGADO` (case-insensitive, trimmed) — regardless of that movement's own `Estado`. No other `Tipo Movimiento` is included, even if negative (`GENERADO POR VENTA UNIDAD`, `RECLASIFICACION MOVIMIENTO EN CUENTAS`, `AJUSTE MANUAL + y -`, `APROVECHAMIENTO_NEGATIVO` stay excluded — explicit decision, not a gap).
- A single real payment that spans the boundary between two cuotas is shown in FULL in both cuotas — no proration.
- Known, accepted limitation (do not try to fix in this plan): when a reversal makes the cumulative running total dip and a later payment re-crosses that same numeric range, the overlap test can attribute that later payment to an earlier cuota too. This is inherent to the "compare numeric ranges in the cumulative total" approach and was accepted as out of scope during design — Task 1's own verification script demonstrates and documents this exact behavior so it isn't mistaken for a bug later.
- `pagoSeparacion` and everything outside `frontend/src/utils/conciliacion.js` / `frontend/src/pages/Negocios.jsx` stays untouched.

---

### Task 1: Widen `normalizarPagos()` and add `pagosAplicados` to `conciliar()`

**Files:**
- Modify: `zoho-payment-tracker/frontend/src/utils/conciliacion.js` (whole file currently 111 lines — see below for exact before/after)

**Interfaces:**
- Produces (consumed by Task 2): each cuota object returned by `conciliar()` gains `pagosAplicados: [{ fecha: Date|null, valor: number }]` (payments, full value, no proration, ordered chronologically) alongside the existing `etiqueta, valorPlan, fechaEstimada, cubierto, estado, atrasada, fechaCubierta` fields. `resumen`'s fields and computation are unchanged (they already derive correctly from the wider `pagos`/`totalPagado`).

- [ ] **Step 1: Widen the payment filter in `normalizarPagos()`**

Find (lines 56-69):

```js
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
```

Replace with:

```js
// Tipos de movimiento que representan una reversa real de pago (desistimiento,
// devolución) y por eso se incluyen sin importar su Estado: muchos de estos
// quedaron con un Estado irrecuperable tras el bug de la columna duplicada
// (ver fiduciaService.js), pero su Tipo Movimiento sí es confiable.
const TIPOS_REVERSA_SIEMPRE = ['DESISTIMIENTOS', 'DEVOLUCION MAYOR VALOR PAGADO'];

// Pagos reales: movimientos APLICADO (cualquier signo — antes se descartaban
// los negativos por error) más las reversas reconocidas de arriba, sin
// importar su Estado. Ordenados por fecha contable ascendente (sin fecha al
// final — igual cuentan en la bolsa).
export function normalizarPagos(movimientos) {
  return (movimientos || [])
    .filter((m) => {
      const estado = String(m.datos?.Estado || '').trim().toUpperCase();
      if (estado === 'APLICADO') return true;
      const tipo = String(m.datos?.['Tipo Movimiento'] || '').trim().toUpperCase();
      return TIPOS_REVERSA_SIEMPRE.includes(tipo);
    })
    .map((m) => ({ fecha: m.fechaContable ? new Date(m.fechaContable) : null, valor: parseMonto(m.datos?.Valor) }))
    .filter((p) => !isNaN(p.valor) && p.valor !== 0)
    .sort((a, b) => {
      if (!a.fecha && !b.fecha) return 0;
      if (!a.fecha) return 1;
      if (!b.fecha) return -1;
      return a.fecha - b.fecha;
    });
}
```

- [ ] **Step 2: Add `pagosAplicados` to `conciliar()`**

Find (lines 71-110, the whole `conciliar` function):

```js
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

Replace with:

```js
// Pagos (con su fecha y valor completos, sin prorratear) cuyo propio tramo en
// el acumulado se cruza con [desde, hasta). Un pago que cubre el final de una
// cuota y el inicio de la siguiente aparece completo en ambas — decisión
// explícita de diseño, no un bug.
//
// Limitación conocida y aceptada: si una reversa hace bajar el acumulado y un
// pago posterior vuelve a cruzar ese mismo rango numérico, ese pago posterior
// puede aparecer también en una cuota anterior a la que en verdad pertenece
// cronológicamente. Resolverlo requeriría un modelo de "dueño" por rango en
// vez de superposición numérica, fuera de alcance por ahora (ver verificación
// de este archivo, que reproduce y documenta el caso).
function pagosEnTramo(prefijos, desde, hasta) {
  let antes = 0;
  const resultado = [];
  for (const p of prefijos) {
    const lo = Math.min(antes, p.acumulado);
    const hi = Math.max(antes, p.acumulado);
    if (hi > desde && lo < hasta) resultado.push({ fecha: p.fecha, valor: p.valor });
    antes = p.acumulado;
  }
  return resultado;
}

// Cascada acumulada. Una cuota no pagada cuya fecha estimada ya venció queda
// marcada "atrasada". fechaCubierta = fecha del pago cuyo acumulado alcanzó
// el requerido acumulado del plan hasta esa cuota.
export function conciliar(cuotasPlan, pagos) {
  const totalPagado = pagos.reduce((s, p) => s + p.valor, 0);
  let acumuladoPago = 0;
  const prefijos = pagos.map((p) => ({ fecha: p.fecha, valor: p.valor, acumulado: (acumuladoPago += p.valor) }));

  const hoy = new Date();
  let disponible = totalPagado;
  let requerido = 0;

  const cuotas = cuotasPlan.map((c) => {
    const requeridoAntes = requerido;
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
    const pagosAplicados = pagosEnTramo(prefijos, requeridoAntes, requerido);
    return { ...c, cubierto, estado, atrasada, fechaCubierta, pagosAplicados };
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

- [ ] **Step 3: Verify `normalizarPagos()`'s widened filter**

Run from `zoho-payment-tracker/frontend`:

```bash
node -e "
import('./src/utils/conciliacion.js').then(({ normalizarPagos }) => {
  const movimientos = [
    { fechaContable: '2023-01-01T00:00:00.000Z', datos: { Estado: 'APLICADO', Valor: '5000000', 'Tipo Movimiento': 'APLICACIÓN APORTES CUENTAS BANCARIAS' } },
    { fechaContable: '2023-01-02T00:00:00.000Z', datos: { Estado: 'APLICADO', Valor: '-1000000', 'Tipo Movimiento': 'RECLASIFICACION MOVIMIENTO EN CUENTAS' } },
    { fechaContable: '2023-01-03T00:00:00.000Z', datos: { Estado: 'PROMETIDO', Valor: '-2000000', 'Tipo Movimiento': 'DESISTIMIENTOS' } },
    { fechaContable: '2023-01-04T00:00:00.000Z', datos: { Estado: 'VENDIDO', Valor: '-300000', 'Tipo Movimiento': 'DEVOLUCION MAYOR VALOR PAGADO' } },
    { fechaContable: '2023-01-05T00:00:00.000Z', datos: { Estado: 'VENDIDO', Valor: '-451153030', 'Tipo Movimiento': 'GENERADO POR VENTA UNIDAD' } },
    { fechaContable: '2023-01-06T00:00:00.000Z', datos: { Estado: 'PENDIENTE', Valor: '9999999', 'Tipo Movimiento': 'APLICACIÓN APORTES CUENTAS BANCARIAS' } },
  ];
  const pagos = normalizarPagos(movimientos);
  console.log('cantidad:', pagos.length);
  pagos.forEach((p) => console.log(p.valor));
});"
```

Expected output (4 entries — APLICADO-negative now included, both reversa types included, `GENERADO POR VENTA UNIDAD` and the non-APLICADO/non-reversa entry excluded):

```
cantidad: 4
5000000
-1000000
-2000000
-300000
```

- [ ] **Step 4: Verify `conciliar()`'s `pagosAplicados`, including the documented boundary-revisit case**

Run from `zoho-payment-tracker/frontend`:

```bash
node -e "
import('./src/utils/conciliacion.js').then(({ conciliar }) => {
  const lejos = new Date('2099-01-01'); // fecha futura: evita que 'atrasada' dependa de cuándo se corre este script
  const cuotasPlan = [
    { etiqueta: 'Separación', valorPlan: 5000000, fechaEstimada: lejos },
    { etiqueta: '1', valorPlan: 5000000, fechaEstimada: lejos },
    { etiqueta: '2', valorPlan: 5000000, fechaEstimada: lejos },
  ];
  const pagos = [
    { fecha: new Date('2023-01-01'), valor: 5000000 },
    { fecha: new Date('2023-01-15'), valor: -1000000 },
    { fecha: new Date('2023-02-01'), valor: 8000000 },
  ];
  const { cuotas, resumen } = conciliar(cuotasPlan, pagos);
  cuotas.forEach((c) => console.log(c.etiqueta, '|', c.estado, '| cubierto:', c.cubierto, '| pagosAplicados:', JSON.stringify(c.pagosAplicados.map((p) => p.valor))));
  console.log('resumen:', JSON.stringify(resumen));
});"
```

Expected output:

```
Separación | pagada | cubierto: 5000000 | pagosAplicados: [5000000,-1000000,8000000]
1 | pagada | cubierto: 5000000 | pagosAplicados: [8000000]
2 | parcial | cubierto: 2000000 | pagosAplicados: [8000000]
resumen: {"totalPlan":15000000,"totalPagado":12000000,"porcentaje":80,"cuotasPagadas":2,"totalCuotas":3,"cuotasEnMora":0,"montoEnMora":0,"saldoAFavor":0}
```

Note: `Separación` legitimately shows all three payments, including the later $8,000,000 one — this is the documented boundary-revisit limitation from the Global Constraints section, not a bug. `1` and `2` both show the same $8,000,000 payment because it spans their shared boundary (full amount in both, no proration — matches the design decision).

- [ ] **Step 5: Commit**

```bash
git add zoho-payment-tracker/frontend/src/utils/conciliacion.js
git commit -m "Include payment reversals and per-cuota payment breakdown in conciliacion"
```

---

### Task 2: Expandable cuota rows showing `pagosAplicados` in the UI

**Files:**
- Modify: `zoho-payment-tracker/frontend/src/pages/Negocios.jsx` (add a `CuotaRow` component; change the cuotas `<table>` inside `ConciliacionSection`)

**Interfaces:**
- Consumes: `cuota.pagosAplicados: [{ fecha: Date|null, valor: number }]` from Task 1.
- Consumes existing helpers already in this file: `badgeConciliacion(c)`, `labelCuota(etiqueta)`, `formatCOP`, `formatFechaUTC` (imported from `../utils/planDePagos`), `ChevronRight` (already imported from `lucide-react`), `useState` (already imported from `react`).

- [ ] **Step 1: Add the `CuotaRow` component**

In `zoho-payment-tracker/frontend/src/pages/Negocios.jsx`, find the `labelCuota` function (used by `ConciliacionSection`):

```jsx
function labelCuota(etiqueta) {
  return /^\d+$/.test(etiqueta) ? `Cuota ${etiqueta}` : etiqueta;
}
```

Immediately after it, add:

```jsx
// Fila de cuota expandible: al hacer clic (si tiene pagos) despliega los
// pagos reales que cayeron en su tramo de la cascada — mismo patrón visual
// que MovimientoRow (flecha a la izquierda, colapsa/expande).
function CuotaRow({ c }) {
  const [expanded, setExpanded] = useState(false);
  const badge = badgeConciliacion(c);
  const tienePagos = c.pagosAplicados && c.pagosAplicados.length > 0;

  return (
    <>
      <tr
        onClick={() => tienePagos && setExpanded((e) => !e)}
        className={`border-b border-aed-border last:border-0 hover:bg-brand-tint ${tienePagos ? 'cursor-pointer' : ''}`}
      >
        <td className="pl-3 pr-1 py-2 w-6">
          {tienePagos && (
            <ChevronRight
              size={12}
              strokeWidth={2.5}
              className={`text-slate-500 transition-transform ${expanded ? 'rotate-90 text-brand' : ''}`}
            />
          )}
        </td>
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
      {expanded && tienePagos && (
        <tr className="bg-brand-tint border-b border-aed-border">
          <td colSpan={6} className="px-5 py-3">
            <div className="flex flex-col gap-1.5">
              {c.pagosAplicados.map((p, i) => (
                <div key={i} className="flex items-center justify-between gap-4 text-[13px]">
                  <span className="text-slate-500">{p.fecha ? formatFechaUTC(p.fecha) : 'Sin fecha'}</span>
                  <span className={`font-medium tabular-nums ${p.valor < 0 ? 'text-red-600' : 'text-slate-700'}`}>
                    {p.valor < 0 ? '-' : ''}{formatCOP(Math.abs(p.valor))}
                  </span>
                </div>
              ))}
            </div>
          </td>
        </tr>
      )}
    </>
  );
}
```

- [ ] **Step 2: Add the chevron column to the table header and replace the row rendering**

Find the cuotas table's header row:

```jsx
              <tr className="bg-aed-base border-b border-aed-border">
                <th className="section-label px-3 py-2 text-left whitespace-nowrap">Cuota</th>
                <th className="section-label px-3 py-2 text-left whitespace-nowrap">Fecha estimada</th>
                <th className="section-label px-3 py-2 text-right whitespace-nowrap">Valor plan</th>
                <th className="section-label px-3 py-2 text-right whitespace-nowrap">Cubierto</th>
                <th className="section-label px-3 py-2 text-right whitespace-nowrap">Estado</th>
              </tr>
```

Replace with:

```jsx
              <tr className="bg-aed-base border-b border-aed-border">
                <th className="w-6" />
                <th className="section-label px-3 py-2 text-left whitespace-nowrap">Cuota</th>
                <th className="section-label px-3 py-2 text-left whitespace-nowrap">Fecha estimada</th>
                <th className="section-label px-3 py-2 text-right whitespace-nowrap">Valor plan</th>
                <th className="section-label px-3 py-2 text-right whitespace-nowrap">Cubierto</th>
                <th className="section-label px-3 py-2 text-right whitespace-nowrap">Estado</th>
              </tr>
```

Then find the row-rendering block:

```jsx
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
```

Replace with:

```jsx
            <tbody>
              {cuotas.map((c, i) => <CuotaRow key={i} c={c} />)}
            </tbody>
```

- [ ] **Step 3: Verify the frontend builds**

Run from `zoho-payment-tracker/frontend`:

```bash
npm run build
```

Expected: `✓ built in …`, no errors.

- [ ] **Step 4: Commit**

```bash
git add zoho-payment-tracker/frontend/src/pages/Negocios.jsx
git commit -m "Show expandable per-cuota payment breakdown in Conciliacion"
```

---

### Task 3: End-to-end verification with the two real negocios that motivated this work

**Files:** none (operational verification)

**Interfaces:**
- Consumes: `construirPlan`, `normalizarPagos`, `conciliar` from Task 1 (real, shipped file, not reimplemented); `GET /api/negocios/:referencia`, `GET /api/opportunities/:id/subforms`, `GET /api/negocios/:referencia/movimientos` (existing, unchanged endpoints).

- [ ] **Step 1: Start the backend if not already running**

```bash
curl -s http://localhost:3001/api/health
```

If this fails, start it: `cd zoho-payment-tracker/backend && npm run dev` (background), then re-check health.

- [ ] **Step 2: Re-check `1370121410800` — should be unaffected (no reversals in its data)**

Run from `zoho-payment-tracker/frontend`:

```bash
node -e "
import('./src/utils/conciliacion.js').then(async (conc) => {
  const detalle = await (await fetch('http://localhost:3001/api/negocios/1370121410800')).json();
  const subs = await (await fetch('http://localhost:3001/api/opportunities/' + detalle.oportunidad.id + '/subforms')).json();
  const movsRes = await (await fetch('http://localhost:3001/api/negocios/1370121410800/movimientos?limit=200')).json();
  const planRows = subs.formaPago?.length ? subs.formaPago : (subs.propuestaPago || []);
  const plan = conc.construirPlan(planRows, detalle.oportunidad.fechaInicioPlanPagos);
  const pagos = conc.normalizarPagos(movsRes.data);
  const { resumen } = conc.conciliar(plan, pagos);
  console.log(JSON.stringify(resumen));
});"
```

Expected: `totalPagado` still ~626147529.5 and `porcentaje` still ~100 (matches the state after the earlier `parseMonto` fix, commit `ae65219`) — this negocio has no `DESISTIMIENTOS`/`DEVOLUCION MAYOR VALOR PAGADO`/negative-APLICADO movements, so today's change should not move its numbers.

- [ ] **Step 3: Re-check `9928935431404` — the reversal should now be subtracted**

```bash
node -e "
import('./src/utils/conciliacion.js').then(async (conc) => {
  const detalle = await (await fetch('http://localhost:3001/api/negocios/9928935431404')).json();
  const subs = await (await fetch('http://localhost:3001/api/opportunities/' + detalle.oportunidad.id + '/subforms')).json();
  const movsRes = await (await fetch('http://localhost:3001/api/negocios/9928935431404/movimientos?limit=200')).json();
  const planRows = subs.formaPago?.length ? subs.formaPago : (subs.propuestaPago || []);
  const plan = conc.construirPlan(planRows, detalle.oportunidad.fechaInicioPlanPagos);
  const pagos = conc.normalizarPagos(movsRes.data);
  const { resumen } = conc.conciliar(plan, pagos);
  console.log('saldoActual:', detalle.saldoActual, '| resumen:', JSON.stringify(resumen));
});"
```

Expected: `totalPagado` drops by roughly $92,671,291 versus the pre-Task-1 value (~104,239,338 → ~11,568,047), landing close to `saldoActual` (11,568,065) — the ~$18 difference is an unrelated small `AJUSTE MANUAL` entry seen earlier during investigation and is not in scope for this plan.

- [ ] **Step 4: Confirm the 22 APLICADO-negative movements found earlier are now included**

```bash
cd zoho-payment-tracker/backend
node -e "
const { PrismaClient } = require('@prisma/client');
const p = new PrismaClient();
(async () => {
  const movs = await p.negocioMovimiento.findMany({ where: { datos: { path: ['Estado'], equals: 'APLICADO' } }, select: { negocioId: true, datos: true } });
  const parseAmt = (v) => { const s = String(v||'').trim(); const n = Number(s); return isNaN(n) ? parseFloat(s.replace(/[^0-9.-]/g,'')) : n; };
  const negativos = movs.filter((m) => parseAmt(m.datos?.Valor) < 0);
  console.log('movimientos APLICADO negativos en BD:', negativos.length);
  await p.\$disconnect();
})();"
```

Expected: `22` (same count found during design investigation — confirms these are real, current data; Task 1's `normalizarPagos` change now includes them via the widened `p.valor !== 0` filter).

- [ ] **Step 5: Manual UI check (or note the limitation if no browser is available)**

Start the frontend (`npm run dev` in `zoho-payment-tracker/frontend`), open a negocio with a non-empty `pagosAplicados` (e.g. `1370121410800`), expand a cuota row, and confirm: the chevron rotates, the payment list appears indented below with fecha + valor, negative values are shown in red with a leading `-`. If no browser automation is available in this environment, state that explicitly and rely on Task 1's node-script verification (already exact-value-checked) plus a code read-through of `CuotaRow` as the substitute evidence, per this repo's established practice in prior verification tasks.

- [ ] **Step 6: Stop any dev servers started for this verification**

If you started the backend/frontend in Step 1/5, stop them (find the PID listening on 3001/5173 and kill it). No commit — this task changes no files.
