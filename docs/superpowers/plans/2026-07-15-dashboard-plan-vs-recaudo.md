# Dashboard: Plan de pagos vs. Recaudo por mes — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Nueva vista "Dashboard" con una fila por cada uno de los ~1936 inmuebles del inventario (Etapa/Frente/Torre/Nomenclatura), cruzando su plan de pagos de Zoho contra lo recaudado, organizado por mes calendario (todos los meses existentes, con scroll horizontal), con totales de todo el portafolio filtrado al pie.

**Architecture:** La lógica de conciliación (plan vs. pagos reales) ya existe en el frontend (`utils/conciliacion.js` + `utils/planDePagos.js`) y se portea tal cual a un servicio nuevo del backend (`conciliacionService.js`, CommonJS) — el backend corre esa misma lógica para todo el inventario filtrado de una vez (no negocio por negocio), resolviendo Negocio/Opportunity/Movimientos en bloque (no N+1) para que sea viable sobre todo el portafolio. Un nuevo servicio `dashboardRecaudoService.js` arma la matriz inmueble×mes y expone un endpoint `GET /api/negocios/dashboard-recaudo`. El frontend agrega una página nueva con TanStack Table (mismo patrón ya usado en `PaymentPlanTable.jsx`), columnas de mes generadas dinámicamente, paginación server-side, filtros Etapa/Frente/Torre/búsqueda (mismo patrón de cascada de `Negocios.jsx`), fila de totales y exportación a Excel.

**Tech Stack:** Node.js + Express + Prisma 5 (PostgreSQL) en el backend; React + Vite + `@tanstack/react-table` en el frontend. Sin suite de tests configurada — cada tarea se verifica con un script Node ad-hoc contra la BD real y/o `curl` contra el servidor de desarrollo.

## Global Constraints

- Sin migraciones de schema — todo el cálculo es en memoria a partir de datos ya existentes (`Opportunity.formaPago`/`propuestaPago`/`fechaInicioPlanPagos`, `NegocioMovimiento`, `InventarioItem`, `Negocio`).
- El prerrequisito de datos (backfill de subforms) ya se ejecutó: 1867/1867 oportunidades con `fechaInicioPlanPagos` tienen su plan cacheado en BD.
- Filas = `InventarioItem` únicamente (no se incluyen los negocios huérfanos — no tienen Frente/Torre/Nomenclatura).
- Nomenclatura = `InventarioItem.datos.Project_Code` (ej. "Vela Village Torre 1 417"), NO el código numérico.
- Se muestran **todos** los meses existentes en los datos (sin selector de rango), con scroll horizontal — confirmado con el usuario.
- Paginación de filas server-side clásica (sin virtualización) — confirmado con el usuario.
- La fila de totales suma **todo el conjunto que cumple los filtros activos** (Etapa/Frente/Torre/búsqueda), no solo la página visible, y no solo cuando no hay filtros — se recalcula según el filtro activo.
- No modificar `ConciliacionSection` ni la Conciliación por negocio individual en `Negocios.jsx` — este es un reporte agregado nuevo e independiente.
- Ya existe un archivo `frontend/src/pages/Dashboard.jsx` (es en realidad la vista de "Oportunidades", nombre heredado, sin relación con este feature) — el nuevo archivo de página se llama `ReportePlanRecaudo.jsx` para no chocar. El nombre visible en el menú y la URL sí es "Dashboard".
- Spec de referencia: `docs/superpowers/specs/2026-07-15-dashboard-plan-vs-recaudo-design.md`.

---

## Task 1: Backend — Portear la lógica de conciliación a `conciliacionService.js`

**Files:**
- Create: `zoho-payment-tracker/backend/src/services/conciliacionService.js`

**Interfaces:**
- Produces (exportado, usado por Task 3):
  - `construirPlan(rows: object[], fechaBase: Date|string|null): { etiqueta: string, valorPlan: number, fechaEstimada: Date|null }[]`
  - `normalizarPagos(movimientos: { idMovimiento: string|null, fechaContable: Date|null, datos: object }[]): { id: string|null, fecha: Date|null, valor: number }[]`
  - `conciliar(cuotasPlan, pagos): { cuotas: (cuotaPlan & { cubierto: number, estado: string, atrasada: boolean, diasAtraso: number|null, fechaCubierta: Date|null, pagosAplicados: object[] })[], resumen: object }`
  - `parseMonto`, `detectarCuotaKey`, `fechaEstimadaCuota` (también exportados, para uso directo si hace falta).

- [ ] **Step 1: Crear el servicio, puerto exacto de `conciliacion.js` + `planDePagos.js` del frontend**

Crea `zoho-payment-tracker/backend/src/services/conciliacionService.js`:

```js
// Puerto exacto (CommonJS) de zoho-payment-tracker/frontend/src/utils/
// conciliacion.js + planDePagos.js (ES modules) — sin cambios de
// comportamiento. El backend necesita esta misma lógica para el reporte
// Dashboard, que la corre para todo el inventario a la vez en vez de un
// negocio a la vez (que es como la usa ConciliacionSection en Negocios.jsx).

// ── Puerto de planDePagos.js ────────────────────────────────────────────────

// Detecta la columna cuyo valor identifica la cuota: aquella donde alguna
// fila contiene "separaci" (p.ej. "Separación").
function detectarCuotaKey(rows) {
  if (!rows?.length) return null;
  return (
    Object.keys(rows[0] || {}).find((k) =>
      rows.some((r) => String(r[k] || '').toLowerCase().includes('separaci'))
    ) || null
  );
}

// Fecha estimada de una cuota: "Separación" → fecha base; "N" → base + N meses.
function fechaEstimadaCuota(fechaBase, cuotaVal) {
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

// ── Puerto de conciliacion.js ────────────────────────────────────────────────

// Parsea un valor monetario a número. NaN para vacíos y fechas dd/mm/aaaa.
function parseMonto(v) {
  if (v == null || v === '') return NaN;
  if (typeof v === 'number') return v;
  const s = String(v).trim();
  if (/^\d{1,2}[\/\-]\d{1,2}[\/\-]\d{2,4}$/.test(s)) return NaN; // es una fecha
  const plano = Number(s);
  if (!isNaN(plano)) return plano;
  return parseFloat(s.replace(/[^0-9-]/g, ''));
}

const SKIP_KEYS = ['id', 'Created_Time', 'Modified_Time', '$line_tax', '$permissions', 'Owner'];

// Construye las cuotas del plan desde las filas del subform.
function construirPlan(rows, fechaBase) {
  if (!rows?.length) return [];
  const keys = [...new Set(rows.flatMap(Object.keys))].filter((k) => !SKIP_KEYS.includes(k));
  const cuotaKey = detectarCuotaKey(rows);
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
    if (isNaN(valorPlan) || valorPlan <= 0) return;
    const etiqueta = cuotaKey ? String(row[cuotaKey] ?? `Fila ${i + 1}`) : `Fila ${i + 1}`;
    plan.push({
      etiqueta,
      valorPlan,
      fechaEstimada: cuotaKey ? fechaEstimadaCuota(fechaBase, row[cuotaKey]) : null,
    });
  });

  if (plan.length >= 2) {
    const last = plan[plan.length - 1];
    const prev = plan[plan.length - 2];
    if (!last.fechaEstimada && prev.fechaEstimada) {
      const d = new Date(prev.fechaEstimada);
      d.setUTCMonth(d.getUTCMonth() + 1);
      last.fechaEstimada = d;
    }
  }

  return plan;
}

const TIPOS_REVERSA_SIEMPRE = ['DESISTIMIENTOS', 'DEVOLUCION MAYOR VALOR PAGADO'];

// Pagos reales: movimientos APLICADO (cualquier signo) más las reversas
// reconocidas de arriba, sin importar su Estado. Ordenados por fecha
// contable ascendente (sin fecha al final).
function normalizarPagos(movimientos) {
  return (movimientos || [])
    .filter((m) => {
      const estado = String(m.datos?.Estado || '').trim().toUpperCase();
      if (estado === 'APLICADO') return true;
      const tipo = String(m.datos?.['Tipo Movimiento'] || '').trim().toUpperCase();
      return TIPOS_REVERSA_SIEMPRE.includes(tipo);
    })
    .map((m) => ({ id: m.idMovimiento ?? null, fecha: m.fechaContable ? new Date(m.fechaContable) : null, valor: parseMonto(m.datos?.Valor) }))
    .filter((p) => !isNaN(p.valor) && p.valor !== 0)
    .sort((a, b) => {
      if (!a.fecha && !b.fecha) return 0;
      if (!a.fecha) return 1;
      if (!b.fecha) return -1;
      return a.fecha - b.fecha;
    });
}

// Pagos (con su fecha y valor completos) cuyo propio tramo en el acumulado
// se cruza con [desde, hasta).
function pagosEnTramo(prefijos, desde, hasta) {
  let antes = 0;
  const resultado = [];
  for (const p of prefijos) {
    const lo = Math.min(antes, p.acumulado);
    const hi = Math.max(antes, p.acumulado);
    if (hi > desde && lo < hasta) {
      const solape = Math.min(hi, hasta) - Math.max(lo, desde);
      const destinado = p.valor >= 0 ? solape : -solape;
      resultado.push({ id: p.id, fecha: p.fecha, valor: p.valor, destinado });
    }
    antes = p.acumulado;
  }
  return resultado;
}

// Cascada acumulada. Una cuota no pagada cuya fecha estimada ya venció queda
// marcada "atrasada".
function conciliar(cuotasPlan, pagos) {
  const totalPagado = pagos.reduce((s, p) => s + p.valor, 0);
  let acumuladoPago = 0;
  const prefijos = pagos.map((p) => ({ id: p.id, fecha: p.fecha, valor: p.valor, acumulado: (acumuladoPago += p.valor) }));

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
    const diasAtraso = atrasada ? Math.floor((hoy.getTime() - c.fechaEstimada.getTime()) / 86400000) : null;
    const pagosAplicados = pagosEnTramo(prefijos, requeridoAntes, requerido);
    return { ...c, cubierto, estado, atrasada, diasAtraso, fechaCubierta, pagosAplicados };
  });

  const totalPlan = cuotas.reduce((s, c) => s + c.valorPlan, 0);
  const enMora = cuotas.filter((c) => c.atrasada);
  const maxDiasAtraso = enMora.length > 0 ? Math.max(...enMora.map((c) => c.diasAtraso ?? 0)) : 0;
  const saldoContraentrega = cuotas.length > 0 ? cuotas[cuotas.length - 1] : null;
  const resumen = {
    totalPlan,
    totalPagado,
    porcentaje: totalPlan > 0 ? Math.round((totalPagado / totalPlan) * 100) : 0,
    cuotasPagadas: cuotas.filter((c) => c.estado === 'pagada').length,
    totalCuotas: cuotas.length,
    cuotasEnMora: enMora.length,
    montoEnMora: enMora.reduce((s, c) => s + (c.valorPlan - c.cubierto), 0),
    maxDiasAtraso,
    saldoAFavor: Math.max(0, totalPagado - totalPlan),
    saldoContraentrega,
  };
  return { cuotas, resumen };
}

module.exports = {
  detectarCuotaKey,
  fechaEstimadaCuota,
  parseMonto,
  construirPlan,
  normalizarPagos,
  conciliar,
};
```

- [ ] **Step 2: Verificar que el puerto es idéntico al original, contra datos reales**

Este script importa DIRECTAMENTE los archivos ES module del frontend (Node soporta ESM nativo vía `import()`) y compara su salida con la del puerto del backend, para el mismo negocio real — no es una verificación aproximada, es una comparación exacta entre las dos implementaciones:

```bash
cd zoho-payment-tracker/backend && node -e "
const { PrismaClient } = require('@prisma/client');
const backend = require('./src/services/conciliacionService');
const prisma = new PrismaClient();

(async () => {
  const path = require('path');
  const frontendConciliacion = await import('file://' + path.resolve('../frontend/src/utils/conciliacion.js'));
  const frontendPlan = await import('file://' + path.resolve('../frontend/src/utils/planDePagos.js'));

  // Tomar un negocio real con oportunidad, plan y movimientos.
  const negocio = await prisma.negocio.findFirst({
    where: { datos: { path: ['Nomenclatura'], not: null } },
  });
  const oportunidad = await prisma.opportunity.findFirst({
    where: { referenciaRecaudo: negocio.referencia, fechaInicioPlanPagos: { not: null }, formaPago: { not: { equals: null } } },
  });
  if (!oportunidad) { console.log('No se encontró una oportunidad con plan para este negocio de prueba; el script elige otro'); process.exit(1); }
  const movimientos = await prisma.negocioMovimiento.findMany({ where: { negocioId: negocio.id } });

  const planRows = oportunidad.formaPago?.length ? oportunidad.formaPago : (oportunidad.propuestaPago || []);

  const cuotasPlanBack = backend.construirPlan(planRows, oportunidad.fechaInicioPlanPagos);
  const cuotasPlanFront = frontendConciliacion.construirPlan(planRows, oportunidad.fechaInicioPlanPagos);
  const pagosBack = backend.normalizarPagos(movimientos);
  const pagosFront = frontendConciliacion.normalizarPagos(movimientos);
  const { cuotas: cuotasBack, resumen: resumenBack } = backend.conciliar(cuotasPlanBack, pagosBack);
  const { cuotas: cuotasFront, resumen: resumenFront } = frontendConciliacion.conciliar(cuotasPlanFront, pagosFront);

  console.log('negocio:', negocio.referencia, '- cuotas:', cuotasBack.length);
  console.log('resumen backend :', JSON.stringify(resumenBack));
  console.log('resumen frontend:', JSON.stringify(resumenFront));
  console.log('idénticos:', JSON.stringify(resumenBack) === JSON.stringify(resumenFront));
  console.log('cuotas idénticas:', JSON.stringify(cuotasBack) === JSON.stringify(cuotasFront));
  process.exit(0);
})();
"
```

Expected: `idénticos: true` y `cuotas idénticas: true` (comparación byte a byte de la salida de ambas implementaciones sobre el mismo negocio real). Si el primer negocio elegido no tiene oportunidad con plan, ajusta el `where` para encontrar uno que sí tenga (hay 1867 disponibles) — no hace falta un negocio específico, cualquiera con datos reales sirve para la comparación.

- [ ] **Step 3: Commit**

```bash
git add zoho-payment-tracker/backend/src/services/conciliacionService.js
git commit -m "feat: portar logica de conciliacion al backend (conciliacionService)"
```

---

## Task 2: Backend — Resolver Negocio/Opportunity en bloque para el Dashboard

**Files:**
- Create: `zoho-payment-tracker/backend/src/services/dashboardRecaudoService.js`
- Modify: `zoho-payment-tracker/backend/src/services/inventarioNegocioService.js` (exportar `valoresProyectoTorre`)

**Interfaces:**
- Consumes: `prisma`, `parseProyectoTorre`, `valoresProyectoTorre` (de `inventarioNegocioService.js`).
- Produces:
  - `construirFiltroInventario({ search, etapa, frente, torre, valores }): Prisma.Sql` — WHERE sobre `InventarioItem` (alias `inv`), sin huérfanos, sin Estado/Solo con abonos.
  - `resolverNegociosYOportunidades(inmuebles: { id, datos, referenciaRecaudo }[]): Promise<{ negocioPorInmuebleId: Map<string, {id, referencia, datos}>, oportunidadPorReferencia: Map<string, Opportunity> }>`

- [ ] **Step 1: Exportar `valoresProyectoTorre` desde `inventarioNegocioService.js`**

En `zoho-payment-tracker/backend/src/services/inventarioNegocioService.js`, el `module.exports` actual:

```js
module.exports = {
  prisma,
  ETAPA_POR_TORRE,
  parseProyectoTorre,
  formatearProyectoTorre,
  obtenerEtapaTorre,
  listarNegociosInventario,
  findOportunidadByReferencia,
  resolverNegocioIdDesdeInmueble,
  obtenerNegocioPorId,
  obtenerMovimientosPorId,
};
```

Cámbialo por (agrega `valoresProyectoTorre`):

```js
module.exports = {
  prisma,
  ETAPA_POR_TORRE,
  parseProyectoTorre,
  formatearProyectoTorre,
  obtenerEtapaTorre,
  valoresProyectoTorre,
  listarNegociosInventario,
  findOportunidadByReferencia,
  resolverNegocioIdDesdeInmueble,
  obtenerNegocioPorId,
  obtenerMovimientosPorId,
};
```

- [ ] **Step 2: Crear `dashboardRecaudoService.js` con el filtro y el resolver en bloque**

Crea `zoho-payment-tracker/backend/src/services/dashboardRecaudoService.js`:

```js
const { Prisma } = require('@prisma/client');
const { prisma, parseProyectoTorre, obtenerEtapaTorre, valoresProyectoTorre } = require('./inventarioNegocioService');

// Arma el WHERE (solo sobre InventarioItem, sin huérfanos) para el reporte
// Dashboard: mismos filtros Etapa/Frente/Torre/búsqueda que el módulo de
// Negocios, sin Estado/Solo con abonos (ese reporte no tiene esos campos —
// no hay Negocio.estado/saldoActual cuando el inmueble no tiene negocio).
function construirFiltroInventario({ search, etapa, frente, torre, valores }) {
  const condiciones = [];
  if (search) {
    const like = `%${search}%`;
    condiciones.push(Prisma.sql`(inv.datos->>'Project_Code' ILIKE ${like} OR inv.datos->>'Proyecto_Torre' ILIKE ${like})`);
  }
  if (etapa) {
    const lista = valores.porEtapa.get(etapa) || [];
    condiciones.push(Prisma.sql`inv.datos->>'Proyecto_Torre' = ANY(${lista}::text[])`);
  }
  if (frente && torre) {
    const lista = valores.porFrenteTorre.get(`${frente}||${torre}`) || [];
    condiciones.push(Prisma.sql`inv.datos->>'Proyecto_Torre' = ANY(${lista}::text[])`);
  } else if (frente) {
    const lista = valores.porFrente.get(frente) || [];
    condiciones.push(Prisma.sql`inv.datos->>'Proyecto_Torre' = ANY(${lista}::text[])`);
  }
  return condiciones.length ? Prisma.sql`WHERE ${Prisma.join(condiciones, ' AND ')}` : Prisma.empty;
}

// Resuelve, para un conjunto de InventarioItem ya filtrado, su Negocio y
// Opportunity vinculados -- en bloque (pocas queries, no una por inmueble),
// para que sea viable sobre todo el portafolio filtrado a la vez. Mismo
// criterio de match que resolverNegocioIdDesdeInmueble/
// findOportunidadByReferencia (inventarioNegocioService.js), resuelto con
// mapas en JS en vez de una consulta SQL por inmueble.
async function resolverNegociosYOportunidades(inmuebles) {
  const negocios = await prisma.negocio.findMany({
    select: { id: true, referencia: true, datos: true },
  });
  const negocioPorReferencia = new Map(negocios.map((n) => [n.referencia, n]));
  const negocioPorNomenclatura = new Map(
    negocios
      .filter((n) => n.datos?.Nomenclatura != null)
      .map((n) => [String(n.datos.Nomenclatura), n])
  );

  const negocioPorInmuebleId = new Map();
  for (const inv of inmuebles) {
    let negocio = inv.referenciaRecaudo ? negocioPorReferencia.get(inv.referenciaRecaudo) : null;
    if (!negocio && inv.datos?.C_digo_inmueble != null) {
      negocio = negocioPorNomenclatura.get(String(inv.datos.C_digo_inmueble)) ?? null;
    }
    if (negocio) negocioPorInmuebleId.set(inv.id, negocio);
  }

  const referenciasNegocio = [...new Set([...negocioPorInmuebleId.values()].map((n) => n.referencia).filter(Boolean))];
  const oportunidadesExactas = referenciasNegocio.length
    ? await prisma.opportunity.findMany({
        where: { referenciaRecaudo: { in: referenciasNegocio } },
        select: { id: true, referenciaRecaudo: true, fechaInicioPlanPagos: true, formaPago: true, propuestaPago: true },
      })
    : [];
  const oportunidadPorReferencia = new Map(oportunidadesExactas.map((o) => [o.referenciaRecaudo, o]));

  // Respaldo tolerante a formato (igual que findOportunidadByReferencia), solo
  // para las referencias que no calzaron exacto -- típicamente pocas.
  const sinMatch = referenciasNegocio.filter((r) => !oportunidadPorReferencia.has(r) && r.length >= 6);
  for (const referencia of sinMatch) {
    const opp = await prisma.opportunity.findFirst({
      where: { referenciaRecaudo: { contains: referencia, mode: 'insensitive' } },
      select: { id: true, referenciaRecaudo: true, fechaInicioPlanPagos: true, formaPago: true, propuestaPago: true },
    });
    if (opp) oportunidadPorReferencia.set(referencia, opp);
  }

  return { negocioPorInmuebleId, oportunidadPorReferencia };
}

module.exports = { construirFiltroInventario, resolverNegociosYOportunidades };
```

- [ ] **Step 3: Verificar contra la BD real, cruzando con los resolvers existentes**

```bash
cd zoho-payment-tracker/backend && node -e "
const { prisma, resolverNegocioIdDesdeInmueble, findOportunidadByReferencia, valoresProyectoTorre } = require('./src/services/inventarioNegocioService');
const { construirFiltroInventario, resolverNegociosYOportunidades } = require('./src/services/dashboardRecaudoService');

(async () => {
  const inmuebles = await prisma.\$queryRaw\`SELECT id, datos, \"referenciaRecaudo\" FROM \"InventarioItem\" inv LIMIT 30\`;
  const { negocioPorInmuebleId, oportunidadPorReferencia } = await resolverNegociosYOportunidades(inmuebles);

  let coinciden = 0, total = 0;
  for (const inv of inmuebles) {
    total++;
    const negocioIdBulk = negocioPorInmuebleId.get(inv.id)?.id ?? null;
    const negocioIdUnoAUno = await resolverNegocioIdDesdeInmueble(inv);
    if (negocioIdBulk === negocioIdUnoAUno) coinciden++;
    else console.log('DIFERENCIA en inmueble', inv.id, ':', negocioIdBulk, 'vs', negocioIdUnoAUno);
  }
  console.log('negocios coinciden:', coinciden, '/', total);

  // Filtro: probar con un frente conocido
  const valores = await valoresProyectoTorre();
  const filtro = construirFiltroInventario({ frente: 'Kabo', valores });
  const filtrados = await prisma.\$queryRaw\`SELECT id, datos FROM \"InventarioItem\" inv \${filtro}\`;
  console.log('Kabo ->', filtrados.length, 'inmuebles, todos Proyecto_Torre empieza con Kabo:', filtrados.every(f => f.datos.Proyecto_Torre.startsWith('Kabo')));
  process.exit(0);
})();
"
```

Expected: `negocios coinciden: 30 / 30` (el resolver en bloque debe coincidir siempre con el resolver uno-a-uno existente); el filtro por Frente=Kabo trae solo inmuebles de Kabo.

- [ ] **Step 4: Commit**

```bash
git add zoho-payment-tracker/backend/src/services/inventarioNegocioService.js zoho-payment-tracker/backend/src/services/dashboardRecaudoService.js
git commit -m "feat: resolver Negocio/Opportunity en bloque para el reporte Dashboard"
```

---

## Task 3: Backend — Agregación por mes y endpoint `GET /api/negocios/dashboard-recaudo`

**Files:**
- Modify: `zoho-payment-tracker/backend/src/services/dashboardRecaudoService.js`
- Modify: `zoho-payment-tracker/backend/src/routes/negocios.js`

**Interfaces:**
- Consumes: `construirPlan`, `normalizarPagos`, `conciliar` (Task 1); `construirFiltroInventario`, `resolverNegociosYOportunidades` (Task 2).
- Produces:
  - `obtenerDashboardRecaudo({ search, etapa, frente, torre, page, limit }): Promise<{ data: FilaDashboard[], meses: string[], totales: Record<string, {esperado:number, recaudado:number}>, pagination: object, etapasDisponibles, frentesDisponibles, frentesPorEtapa, torresPorFrente, torresPorEtapaFrente }>`
  - `FilaDashboard = { id: string, etapa: string|null, frente: string|null, torre: string|null, nomenclatura: string|null, porMes: Record<string, {esperado:number, recaudado:number}> }`

- [ ] **Step 1: Agregar la agregación al servicio**

En `zoho-payment-tracker/backend/src/services/dashboardRecaudoService.js`, agrega al inicio del archivo (después del `require` existente):

```js
const { construirPlan, normalizarPagos, conciliar } = require('./conciliacionService');
```

Y agrega al final del archivo, antes de `module.exports`:

```js

function mesKey(fecha) {
  return `${fecha.getUTCFullYear()}-${String(fecha.getUTCMonth() + 1).padStart(2, '0')}`;
}

// Reporte Dashboard: plan de pagos vs. recaudado, por mes, para todo el
// inventario que cumple los filtros (no solo la página actual -- los
// totales necesitan el conjunto filtrado completo, sin importar la
// paginación). Corre construirPlan+normalizarPagos+conciliar por cada
// inmueble con oportunidad vinculada.
async function obtenerDashboardRecaudo({ search, etapa, frente, torre, page, limit }) {
  const valores = await valoresProyectoTorre();
  const filtro = construirFiltroInventario({ search, etapa, frente, torre, valores });

  const inmuebles = await prisma.$queryRaw`
    SELECT id, datos, "referenciaRecaudo"
    FROM "InventarioItem" inv
    ${filtro}
    ORDER BY datos->>'Proyecto_Torre' ASC NULLS LAST, datos->>'Project_Code' ASC NULLS LAST
  `;

  const { negocioPorInmuebleId, oportunidadPorReferencia } = await resolverNegociosYOportunidades(inmuebles);

  const negocioIds = [...new Set([...negocioPorInmuebleId.values()].map((n) => n.id))];
  const movimientos = negocioIds.length
    ? await prisma.negocioMovimiento.findMany({ where: { negocioId: { in: negocioIds } } })
    : [];
  const movimientosPorNegocioId = new Map();
  for (const m of movimientos) {
    if (!movimientosPorNegocioId.has(m.negocioId)) movimientosPorNegocioId.set(m.negocioId, []);
    movimientosPorNegocioId.get(m.negocioId).push(m);
  }

  const mesesSet = new Set();
  const totalesPorMes = new Map();
  const filasCompletas = inmuebles.map((inv) => {
    const info = parseProyectoTorre(inv.datos?.Proyecto_Torre);
    const negocio = negocioPorInmuebleId.get(inv.id) ?? null;
    const oportunidad = negocio ? oportunidadPorReferencia.get(negocio.referencia) ?? null : null;

    const porMes = {};
    if (oportunidad) {
      const planRows = oportunidad.formaPago?.length ? oportunidad.formaPago : (oportunidad.propuestaPago || []);
      const cuotasPlan = construirPlan(planRows, oportunidad.fechaInicioPlanPagos);
      const pagos = normalizarPagos(movimientosPorNegocioId.get(negocio.id) || []);
      const { cuotas } = conciliar(cuotasPlan, pagos);
      for (const c of cuotas) {
        if (!c.fechaEstimada) continue;
        const mes = mesKey(c.fechaEstimada);
        mesesSet.add(mes);
        if (!porMes[mes]) porMes[mes] = { esperado: 0, recaudado: 0 };
        porMes[mes].esperado += c.valorPlan;
        porMes[mes].recaudado += c.cubierto;

        if (!totalesPorMes.has(mes)) totalesPorMes.set(mes, { esperado: 0, recaudado: 0 });
        const t = totalesPorMes.get(mes);
        t.esperado += c.valorPlan;
        t.recaudado += c.cubierto;
      }
    }

    return {
      id: inv.id,
      etapa: info ? obtenerEtapaTorre(inv.datos.Proyecto_Torre) : null,
      frente: info ? info.proyecto : null,
      torre: info ? info.torre : null,
      nomenclatura: inv.datos?.Project_Code ?? null,
      porMes,
    };
  });

  const meses = [...mesesSet].sort();
  const totales = Object.fromEntries(meses.map((m) => [m, totalesPorMes.get(m)]));

  const total = filasCompletas.length;
  const pageNum = Math.max(1, page);
  const limitNum = Math.max(1, limit);
  const data = filasCompletas.slice((pageNum - 1) * limitNum, pageNum * limitNum);

  return {
    data,
    meses,
    totales,
    pagination: { total, page: pageNum, limit: limitNum, totalPages: Math.ceil(total / limitNum) },
    etapasDisponibles: [...valores.porEtapa.keys()].sort((a, b) => Number(a) - Number(b)),
    frentesDisponibles: [...valores.porFrente.keys()].sort(),
    frentesPorEtapa: valores.frentesPorEtapa,
    torresPorFrente: valores.torresPorFrente,
    torresPorEtapaFrente: valores.torresPorEtapaFrente,
  };
}
```

(La línea `require('./inventarioNegocioService')` del inicio del archivo ya incluye `obtenerEtapaTorre` desde la Tarea 2 — Step 2 — así que `obtenerEtapaTorre(...)` en el `return` de arriba resuelve directo, sin ningún `require` inline.)

Actualiza el `module.exports` al final del archivo:

```js
module.exports = { construirFiltroInventario, resolverNegociosYOportunidades };
```

por:

```js
module.exports = { construirFiltroInventario, resolverNegociosYOportunidades, obtenerDashboardRecaudo };
```

- [ ] **Step 2: Verificar con un script contra la BD real**

```bash
cd zoho-payment-tracker/backend && node -e "
const { obtenerDashboardRecaudo } = require('./src/services/dashboardRecaudoService');
(async () => {
  const r = await obtenerDashboardRecaudo({ page: 1, limit: 5 });
  console.log('total inmuebles:', r.pagination.total, '(esperado ~1936)');
  console.log('meses:', r.meses.length, 'primero:', r.meses[0], 'ultimo:', r.meses[r.meses.length - 1]);
  console.log('primera fila:', JSON.stringify(r.data[0], null, 2).slice(0, 500));
  console.log('etapasDisponibles:', r.etapasDisponibles);

  // Los totales de un mes deben ser la suma de porMes de TODAS las filas con ese mes (no solo la pagina)
  const todas = await obtenerDashboardRecaudo({ page: 1, limit: 9999 });
  const mesPrueba = todas.meses.find((m) => todas.data.some((f) => f.porMes[m]));
  const sumaManual = todas.data.reduce((s, f) => s + (f.porMes[mesPrueba]?.esperado ?? 0), 0);
  console.log('mes de prueba:', mesPrueba, '- total reportado:', todas.totales[mesPrueba].esperado, '- suma manual:', sumaManual, '- coinciden:', Math.abs(todas.totales[mesPrueba].esperado - sumaManual) < 0.01);

  process.exit(0);
})();
"
```

Expected: `total inmuebles` ronda 1936; `meses` es un arreglo largo (decenas, dado el rango 2020-2031 estimado); los totales del mes de prueba coinciden con la suma manual sobre el conjunto completo (no solo la página).

- [ ] **Step 3: Agregar el endpoint en `negocios.js`**

Agrega el `require` al inicio del archivo. Cambia:

```js
const {
  listarNegociosInventario,
  obtenerNegocioPorId,
  obtenerMovimientosPorId,
} = require('../services/inventarioNegocioService');
```

por (agrega la línea del nuevo require justo debajo):

```js
const {
  listarNegociosInventario,
  obtenerNegocioPorId,
  obtenerMovimientosPorId,
} = require('../services/inventarioNegocioService');
const { obtenerDashboardRecaudo } = require('../services/dashboardRecaudoService');
```

Luego, ubica el comentario `// GET /api/negocios/:id  (id = "inv-<InventarioItem.id>" o "neg-<Negocio.id>")` y agrega el nuevo endpoint **justo antes** (debe ir antes de `/:id` porque si no, Express lo interpretaría como `id="dashboard-recaudo"`):

```js
// GET /api/negocios/dashboard-recaudo?search=&etapa=&frente=&torre=&page=&limit=
router.get('/dashboard-recaudo', async (req, res) => {
  try {
    const { search, etapa, frente, torre, page = '1', limit = '50' } = req.query;
    const pageNum = Math.max(1, parseInt(page));
    const limitNum = Math.min(200, Math.max(1, parseInt(limit)));
    const resultado = await obtenerDashboardRecaudo({ search, etapa, frente, torre, page: pageNum, limit: limitNum });
    res.json(resultado);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/negocios/:id  (id = "inv-<InventarioItem.id>" o "neg-<Negocio.id>")
```

- [ ] **Step 4: Verificar con el servidor corriendo**

```bash
cd zoho-payment-tracker/backend && npm run dev
```

En otra terminal:

```bash
COOKIE_JAR=$(mktemp)
PASS=$(node -e "require('dotenv').config({path:'zoho-payment-tracker/backend/.env'});process.stdout.write(process.env.APP_PASSWORD||'')")
curl -s -c "$COOKIE_JAR" -X POST http://localhost:3001/api/auth/login -H 'Content-Type: application/json' -d "{\"password\":\"$PASS\"}" > /dev/null

curl -s -m 30 -b "$COOKIE_JAR" "http://localhost:3001/api/negocios/dashboard-recaudo?limit=3" | node -e "const d=JSON.parse(require('fs').readFileSync(0));console.log(d.pagination, 'meses:', d.meses.length, 'data[0]:', d.data[0])"
curl -s -m 30 -b "$COOKIE_JAR" "http://localhost:3001/api/negocios/dashboard-recaudo?frente=Kabo&limit=3" | node -e "const d=JSON.parse(require('fs').readFileSync(0));console.log(d.pagination.total, d.data.every(x=>x.frente==='Kabo'))"
```

Expected: primer request trae `pagination.total` ≈ 1936 y decenas de meses; segundo request (filtrado por Frente=Kabo) trae solo filas con `frente: "Kabo"`.

- [ ] **Step 5: Commit**

```bash
git add zoho-payment-tracker/backend/src/services/dashboardRecaudoService.js zoho-payment-tracker/backend/src/routes/negocios.js
git commit -m "feat: GET /api/negocios/dashboard-recaudo -- plan vs recaudo por mes, todo el inventario"
```

---

## Task 4: Frontend — Página `ReportePlanRecaudo.jsx` con tabla y paginación

**Files:**
- Modify: `zoho-payment-tracker/frontend/src/utils/api.js`
- Create: `zoho-payment-tracker/frontend/src/pages/ReportePlanRecaudo.jsx`

**Interfaces:**
- Consumes: `GET /api/negocios/dashboard-recaudo` (Task 3).
- Produces: `getDashboardRecaudo(params): Promise<{data, meses, totales, pagination, etapasDisponibles, frentesDisponibles, frentesPorEtapa, torresPorFrente, torresPorEtapaFrente}>`.

- [ ] **Step 1: Agregar `getDashboardRecaudo` a `utils/api.js`**

Junto a `getNegocios` (`export async function getNegocios(params = {}) { const { data } = await api.get('/negocios', { params }); return data; }`), agrega:

```js
export async function getDashboardRecaudo(params = {}) {
  const { data } = await api.get('/negocios/dashboard-recaudo', { params });
  return data;
}
```

- [ ] **Step 2: Crear la página con tabla, columnas de mes dinámicas y paginación**

Crea `zoho-payment-tracker/frontend/src/pages/ReportePlanRecaudo.jsx`:

```jsx
import { useState, useEffect, useCallback, useMemo } from 'react';
import { useReactTable, getCoreRowModel, flexRender, createColumnHelper } from '@tanstack/react-table';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import { getDashboardRecaudo } from '../utils/api';
import { formatCOP } from '../utils/format';

const columnHelper = createColumnHelper();

function formatMesLabel(mes) {
  const [anio, mesNum] = mes.split('-');
  const fecha = new Date(Date.UTC(Number(anio), Number(mesNum) - 1, 1));
  const etiqueta = fecha.toLocaleDateString('es-CO', { month: 'short', year: 'numeric', timeZone: 'UTC' });
  return etiqueta.charAt(0).toUpperCase() + etiqueta.slice(1);
}

const COLUMNAS_FIJAS = [
  columnHelper.accessor('etapa', {
    header: 'Etapa',
    cell: (info) => info.getValue() ?? <span className="text-slate-300">—</span>,
  }),
  columnHelper.accessor('frente', {
    header: 'Frente',
    cell: (info) => info.getValue() ?? <span className="text-slate-300">—</span>,
  }),
  columnHelper.accessor('torre', {
    header: 'Torre',
    cell: (info) => info.getValue() ?? <span className="text-slate-300">—</span>,
  }),
  columnHelper.accessor('nomenclatura', {
    header: 'Nomenclatura',
    cell: (info) => <span className="font-mono text-[13px]">{info.getValue() ?? '—'}</span>,
  }),
];

function construirColumnasMeses(meses) {
  return meses.map((mes) =>
    columnHelper.group({
      id: `mes-${mes}`,
      header: formatMesLabel(mes),
      columns: [
        columnHelper.accessor((row) => row.porMes[mes]?.esperado, {
          id: `${mes}-esperado`,
          header: 'Esperado',
          cell: (info) => {
            const v = info.getValue();
            return v == null ? <span className="text-slate-200">—</span> : <span className="font-mono text-[13px]">{formatCOP(v)}</span>;
          },
        }),
        columnHelper.accessor((row) => row.porMes[mes]?.recaudado, {
          id: `${mes}-recaudado`,
          header: 'Recaudado',
          cell: (info) => {
            const v = info.getValue();
            return v == null ? <span className="text-slate-200">—</span> : <span className="font-mono text-[13px] text-emerald-700">{formatCOP(v)}</span>;
          },
        }),
      ],
    })
  );
}

export default function ReportePlanRecaudo() {
  const [filas, setFilas] = useState([]);
  const [meses, setMeses] = useState([]);
  const [pagination, setPagination] = useState({ total: 0, page: 1, totalPages: 1 });
  const [loading, setLoading] = useState(true);
  const [page, setPage] = useState(1);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await getDashboardRecaudo({ page, limit: 50 });
      setFilas(res.data);
      setMeses(res.meses);
      setPagination(res.pagination);
    } catch (err) {
      console.error('Error cargando dashboard:', err);
    } finally {
      setLoading(false);
    }
  }, [page]);

  useEffect(() => { load(); }, [load]);

  const columns = useMemo(() => [...COLUMNAS_FIJAS, ...construirColumnasMeses(meses)], [meses]);

  const table = useReactTable({
    data: filas,
    columns,
    getCoreRowModel: getCoreRowModel(),
    manualPagination: true,
    pageCount: pagination.totalPages,
  });

  return (
    <div className="p-5 flex flex-col gap-3">
      <h1 className="text-[19px] font-bold text-slate-800">Dashboard: Plan de pagos vs. Recaudo</h1>

      <div className="card overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-[14px]">
            <thead>
              {table.getHeaderGroups().map((headerGroup) => (
                <tr key={headerGroup.id} className="border-b border-aed-border bg-aed-base">
                  {headerGroup.headers.map((header) => (
                    <th key={header.id} colSpan={header.colSpan} className="section-label px-3 py-2 text-left whitespace-nowrap">
                      {header.isPlaceholder ? null : flexRender(header.column.columnDef.header, header.getContext())}
                    </th>
                  ))}
                </tr>
              ))}
            </thead>
            <tbody>
              {loading ? (
                <tr>
                  <td colSpan={columns.length} className="px-4 py-12 text-center text-slate-400">Cargando…</td>
                </tr>
              ) : filas.length === 0 ? (
                <tr>
                  <td colSpan={columns.length} className="px-4 py-12 text-center text-slate-400">Sin resultados.</td>
                </tr>
              ) : (
                table.getRowModel().rows.map((row) => (
                  <tr key={row.id} className="border-b border-aed-border">
                    {row.getVisibleCells().map((cell) => (
                      <td key={cell.id} className="px-3 py-2 whitespace-nowrap">
                        {flexRender(cell.column.columnDef.cell, cell.getContext())}
                      </td>
                    ))}
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>

        {pagination.totalPages > 1 && (
          <div className="px-4 py-3 border-t border-aed-border flex items-center justify-between">
            <p className="text-[14px] text-slate-400">
              {pagination.total} inmuebles · Página {pagination.page} de {pagination.totalPages}
            </p>
            <div className="flex gap-2">
              <button onClick={() => setPage((p) => Math.max(1, p - 1))} disabled={page === 1} className="btn-secondary px-3 py-1.5 text-[14px] flex items-center gap-1">
                <ChevronLeft size={13} /> Anterior
              </button>
              <button onClick={() => setPage((p) => Math.min(pagination.totalPages, p + 1))} disabled={page === pagination.totalPages} className="btn-secondary px-3 py-1.5 text-[14px] flex items-center gap-1">
                Siguiente <ChevronRight size={13} />
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
```

- [ ] **Step 3: Verificar que compila**

```bash
cd zoho-payment-tracker/frontend && npm run build
```

Expected: build exitoso, sin errores de sintaxis. Borra `dist/` después (no es parte del entregable).

- [ ] **Step 4: Commit**

```bash
git add zoho-payment-tracker/frontend/src/utils/api.js zoho-payment-tracker/frontend/src/pages/ReportePlanRecaudo.jsx
git commit -m "feat: pagina ReportePlanRecaudo con tabla y paginacion (sin filtros aun)"
```

---

## Task 5: Frontend — Filtros Etapa/Frente/Torre/búsqueda + fila de totales

**Files:**
- Modify: `zoho-payment-tracker/frontend/src/pages/ReportePlanRecaudo.jsx`

**Interfaces:**
- Consumes: `frentesPorEtapa`, `torresPorFrente`, `torresPorEtapaFrente`, `etapasDisponibles`, `frentesDisponibles`, `totales` (ya vienen en la respuesta del endpoint desde Task 3).

- [ ] **Step 1: Agregar imports de íconos y estado de filtros**

Cambia el import de React (agrega `Fragment`, necesario para la fila de totales del Step 3):

```jsx
import { useState, useEffect, useCallback, useMemo } from 'react';
```

por:

```jsx
import { useState, useEffect, useCallback, useMemo, Fragment } from 'react';
import { Search, Layers, MapPin, Building, X } from 'lucide-react';
```

(el import de `useReactTable`/etc. y `ChevronLeft`/`ChevronRight` de `lucide-react` quedan igual, esto se agrega en una línea nueva)

Dentro de `ReportePlanRecaudo()`, después de `const [page, setPage] = useState(1);`, agrega:

```js
  const [search, setSearch] = useState('');
  const [etapaFilter, setEtapaFilter] = useState('');
  const [frenteFilter, setFrenteFilter] = useState('');
  const [torreFilter, setTorreFilter] = useState('');
  const [etapas, setEtapas] = useState([]);
  const [frentes, setFrentes] = useState([]);
  const [frentesPorEtapa, setFrentesPorEtapa] = useState({});
  const [torresPorFrente, setTorresPorFrente] = useState({});
  const [torresPorEtapaFrente, setTorresPorEtapaFrente] = useState({});
  const [totales, setTotales] = useState({});
```

- [ ] **Step 2: Wirear los filtros en `load()`, agregar cascada y reset de página**

Cambia `load`:

```js
  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await getDashboardRecaudo({ page, limit: 50 });
      setFilas(res.data);
      setMeses(res.meses);
      setPagination(res.pagination);
    } catch (err) {
      console.error('Error cargando dashboard:', err);
    } finally {
      setLoading(false);
    }
  }, [page]);

  useEffect(() => { load(); }, [load]);
```

por:

```js
  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await getDashboardRecaudo({
        search: search || undefined,
        etapa: etapaFilter || undefined,
        frente: frenteFilter || undefined,
        torre: torreFilter || undefined,
        page,
        limit: 50,
      });
      setFilas(res.data);
      setMeses(res.meses);
      setPagination(res.pagination);
      setEtapas(res.etapasDisponibles);
      setFrentes(res.frentesDisponibles);
      setFrentesPorEtapa(res.frentesPorEtapa);
      setTorresPorFrente(res.torresPorFrente);
      setTorresPorEtapaFrente(res.torresPorEtapaFrente);
      setTotales(res.totales);
    } catch (err) {
      console.error('Error cargando dashboard:', err);
    } finally {
      setLoading(false);
    }
  }, [search, etapaFilter, frenteFilter, torreFilter, page]);

  useEffect(() => { load(); }, [load]);

  // Volver a página 1 cuando cambian los filtros
  useEffect(() => { setPage(1); }, [search, etapaFilter, frenteFilter, torreFilter]);

  // Cambiar Etapa limpia el Frente elegido solo si ya no pertenece a la
  // nueva etapa (y Torre se limpia con él); cambiar Frente siempre limpia
  // Torre -- mismo criterio de cascada ya usado en Negocios.jsx.
  const handleEtapaChange = (value) => {
    setEtapaFilter(value);
    if (value && frenteFilter && !(frentesPorEtapa[value] || []).includes(frenteFilter)) {
      setFrenteFilter('');
      setTorreFilter('');
    } else if (value && frenteFilter && torreFilter && !(torresPorEtapaFrente[`${value}||${frenteFilter}`] || []).includes(torreFilter)) {
      setTorreFilter('');
    }
  };

  const handleFrenteChange = (value) => {
    setFrenteFilter(value);
    setTorreFilter('');
  };

  const frenteOptions = etapaFilter ? (frentesPorEtapa[etapaFilter] || []) : frentes;
  const torreOptions = frenteFilter
    ? (etapaFilter ? (torresPorEtapaFrente[`${etapaFilter}||${frenteFilter}`] || []) : (torresPorFrente[frenteFilter] || []))
    : [];
  const hasFilters = search || etapaFilter || frenteFilter || torreFilter;
  const clearFilters = () => { setSearch(''); setEtapaFilter(''); setFrenteFilter(''); setTorreFilter(''); };
```

- [ ] **Step 3: Agregar la barra de filtros y la fila de totales al JSX**

Cambia:

```jsx
      <h1 className="text-[19px] font-bold text-slate-800">Dashboard: Plan de pagos vs. Recaudo</h1>

      <div className="card overflow-hidden">
```

por:

```jsx
      <h1 className="text-[19px] font-bold text-slate-800">Dashboard: Plan de pagos vs. Recaudo</h1>

      <div className="flex flex-wrap items-end gap-2.5">
        <div className="field">
          <label className="field-label"><Search size={13} className="text-brand" />Buscar</label>
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Nomenclatura o Proyecto/Torre…"
            className="input text-[14px] h-8 py-0 w-56"
          />
        </div>
        {etapas.length > 0 && (
          <div className="field">
            <label className="field-label"><Layers size={13} className="text-[#7c3aed]" />Etapa</label>
            <select value={etapaFilter} onChange={(e) => handleEtapaChange(e.target.value)} className="input text-[14px] h-8 py-0 pr-2 leading-none">
              <option value="">Todas las etapas</option>
              {etapas.map((et) => <option key={et} value={et}>Etapa {et}</option>)}
            </select>
          </div>
        )}
        {frentes.length > 0 && (
          <div className="field">
            <label className="field-label"><MapPin size={13} className="text-[#7c3aed]" />Frente</label>
            <select value={frenteFilter} onChange={(e) => handleFrenteChange(e.target.value)} className="input text-[14px] h-8 py-0 pr-2 leading-none">
              <option value="">Todos los frentes</option>
              {frenteOptions.map((fr) => <option key={fr} value={fr}>{fr}</option>)}
            </select>
          </div>
        )}
        {frenteFilter && torreOptions.length > 0 && (
          <div className="field">
            <label className="field-label"><Building size={13} className="text-[#7c3aed]" />Torre</label>
            <select value={torreFilter} onChange={(e) => setTorreFilter(e.target.value)} className="input text-[14px] h-8 py-0 pr-2 leading-none">
              <option value="">Todas las torres</option>
              {torreOptions.map((tr) => <option key={tr} value={tr}>Torre {tr}</option>)}
            </select>
          </div>
        )}
        {hasFilters && (
          <button onClick={clearFilters} className="text-[13px] text-brand hover:text-brand-strong font-medium flex items-center gap-1 h-8">
            <X size={11} /> Limpiar filtros
          </button>
        )}
      </div>

      <div className="card overflow-hidden">
```

Y agrega la fila de totales, justo después del cierre de `</tbody>` (antes de `</table>`):

```jsx
            </tbody>
            {meses.length > 0 && (
              <tfoot>
                <tr className="border-t-2 border-aed-border bg-aed-base font-semibold">
                  <td colSpan={COLUMNAS_FIJAS.length} className="px-3 py-2 text-[13px] text-slate-600">Total del portafolio filtrado</td>
                  {meses.map((mes) => (
                    <Fragment key={mes}>
                      <td className="px-3 py-2 whitespace-nowrap font-mono text-[13px]">
                        {formatCOP(totales[mes]?.esperado ?? 0)}
                      </td>
                      <td className="px-3 py-2 whitespace-nowrap font-mono text-[13px] text-emerald-700">
                        {formatCOP(totales[mes]?.recaudado ?? 0)}
                      </td>
                    </Fragment>
                  ))}
                </tr>
              </tfoot>
            )}
          </table>
```

`Fragment` se usa porque `.map()` devuelve dos `<td>` por mes sin un elemento envolvente propio del DOM — `Fragment` con su `key={mes}` cumple el requisito de React de una key por ítem de `.map()` sin agregar un nodo extra a la fila.

- [ ] **Step 4: Verificar que compila**

```bash
cd zoho-payment-tracker/frontend && npm run build
```

Expected: build exitoso. Borra `dist/` después.

- [ ] **Step 5: Commit**

```bash
git add zoho-payment-tracker/frontend/src/pages/ReportePlanRecaudo.jsx
git commit -m "feat: filtros Etapa/Frente/Torre/busqueda y fila de totales en ReportePlanRecaudo"
```

---

## Task 6: Frontend — Exportar a Excel, registrar ruta y menú

**Files:**
- Modify: `zoho-payment-tracker/frontend/src/pages/ReportePlanRecaudo.jsx`
- Modify: `zoho-payment-tracker/frontend/src/App.jsx`
- Modify: `zoho-payment-tracker/frontend/src/config/navItems.js`

**Interfaces:**
- Consumes: `getDashboardRecaudo` (Task 4), mismo patrón de exportación a Excel que `Negocios.jsx` (`import * as XLSX from 'xlsx'`).

- [ ] **Step 1: Agregar exportación a Excel en `ReportePlanRecaudo.jsx`**

Agrega el import de `xlsx` al inicio del archivo (junto a los demás imports):

```jsx
import * as XLSX from 'xlsx';
```

Y agrega `Download` al import de `lucide-react` ya existente (agregado en la Tarea 5):

```jsx
import { Search, Layers, MapPin, Building, X } from 'lucide-react';
```

por:

```jsx
import { Search, Layers, MapPin, Building, X, Download } from 'lucide-react';
```

Agrega, antes del `return` de `ReportePlanRecaudo()`:

```js
  const [exporting, setExporting] = useState(false);
  const handleExport = useCallback(async () => {
    setExporting(true);
    try {
      const res = await getDashboardRecaudo({
        search: search || undefined,
        etapa: etapaFilter || undefined,
        frente: frenteFilter || undefined,
        torre: torreFilter || undefined,
        page: 1,
        limit: 9999,
      });
      const filas = res.data.map((n) => {
        const row = { Etapa: n.etapa ?? '', Frente: n.frente ?? '', Torre: n.torre ?? '', Nomenclatura: n.nomenclatura ?? '' };
        for (const mes of res.meses) {
          row[`${mes} Esperado`] = n.porMes[mes]?.esperado ?? '';
          row[`${mes} Recaudado`] = n.porMes[mes]?.recaudado ?? '';
        }
        return row;
      });
      const ws = XLSX.utils.json_to_sheet(filas);
      const wb = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(wb, ws, 'Dashboard');
      XLSX.writeFile(wb, `dashboard-plan-vs-recaudo-${new Date().toISOString().slice(0, 10)}.xlsx`);
    } catch (err) {
      console.error('Export error:', err);
    } finally {
      setExporting(false);
    }
  }, [search, etapaFilter, frenteFilter, torreFilter]);
```

Y agrega el botón junto al título:

```jsx
      <h1 className="text-[19px] font-bold text-slate-800">Dashboard: Plan de pagos vs. Recaudo</h1>
```

por:

```jsx
      <div className="flex items-center gap-2">
        <h1 className="text-[19px] font-bold text-slate-800 flex-1">Dashboard: Plan de pagos vs. Recaudo</h1>
        <button
          onClick={handleExport}
          disabled={exporting}
          className="btn-secondary px-3 py-1.5 text-[14px] flex items-center gap-1.5 disabled:opacity-50"
        >
          <Download size={13} /> Exportar a Excel
        </button>
      </div>
```

- [ ] **Step 2: Registrar la ruta en `App.jsx`**

Cambia el import:

```jsx
import Dashboard from './pages/Dashboard';
```

(este import queda igual — es la vista de Oportunidades, no se toca). Agrega un import nuevo justo debajo:

```jsx
import ReportePlanRecaudo from './pages/ReportePlanRecaudo';
```

Y agrega la ruta, junto a las demás dentro de `<Routes>`:

```jsx
            <Route path="/oportunidades" element={<Dashboard />} />
```

por:

```jsx
            <Route path="/oportunidades" element={<Dashboard />} />
            <Route path="/dashboard" element={<ReportePlanRecaudo />} />
```

- [ ] **Step 3: Registrar el ítem de menú en `navItems.js`**

Cambia el import de íconos:

```js
import { LayoutDashboard, FolderOpen, ArrowLeftRight, Briefcase, BarChart3, Warehouse } from 'lucide-react';
```

por:

```js
import { LayoutDashboard, FolderOpen, ArrowLeftRight, Briefcase, BarChart3, Warehouse, CalendarRange } from 'lucide-react';
```

Y agrega la entrada al arreglo `NAV_ITEMS` (después de `resumen`):

```js
  { key: 'resumen',       to: '/resumen',             Icon: BarChart3,       label: 'Resumen',       color: '#059669', exact: true },
];
```

por:

```js
  { key: 'resumen',       to: '/resumen',             Icon: BarChart3,       label: 'Resumen',       color: '#059669', exact: true },
  { key: 'dashboard',     to: '/dashboard',           Icon: CalendarRange,   label: 'Dashboard',     color: '#0369a1', exact: true },
];
```

- [ ] **Step 4: Verificar en el navegador**

```bash
cd zoho-payment-tracker/backend && npm run dev
```
(en otra terminal)
```bash
cd zoho-payment-tracker/frontend && npm run dev
```

Abrir `http://localhost:5173` → nuevo ítem "Dashboard" en el menú lateral. Verificar:
- La tabla carga con Etapa/Frente/Torre/Nomenclatura + columnas de mes (Esperado/Recaudado), con scroll horizontal.
- Filtrar por Etapa/Frente/Torre funciona igual que en Negocios (cascada, limpieza al cambiar).
- La fila de totales al pie no cambia entre páginas si no cambian los filtros, y sí cambia al aplicar un filtro (ej. Frente=Kabo).
- "Exportar a Excel" descarga un archivo con todas las filas del filtro activo (no solo la página).

- [ ] **Step 5: Commit**

```bash
git add zoho-payment-tracker/frontend/src/pages/ReportePlanRecaudo.jsx zoho-payment-tracker/frontend/src/App.jsx zoho-payment-tracker/frontend/src/config/navItems.js
git commit -m "feat: exportar a Excel, registrar ruta y menu del Dashboard"
```
