# Dashboard: Plan de pagos vs. Recaudo por mes — Design

## Contexto

Nueva vista "Dashboard" en el módulo Negocios/Zoho Payment Tracker: un reporte tabular con una fila por cada inmueble del inventario (~1936), identificado por Etapa/Frente/Torre/Nomenclatura, y con el histórico completo de su plan de pagos (valor esperado por cuota) cruzado contra lo realmente recaudado, organizado por mes calendario.

La lógica de cruce plan-vs-recaudo (conciliación) ya existe y se reutiliza tal cual — no se reinventa: `construirPlan()` + `normalizarPagos()` + `conciliar()` (`zoho-payment-tracker/frontend/src/utils/conciliacion.js`), hoy usada por `ConciliacionSection` en `Negocios.jsx` para un negocio a la vez. Este feature corre la misma lógica para todo el portafolio a la vez, en el backend, y la pivotea por mes.

**Nota de nombres:** ya existe un archivo `frontend/src/pages/Dashboard.jsx`, que es en realidad la vista de "Oportunidades" (nombre heredado de una etapa anterior del proyecto, sin relación con este feature). El nuevo archivo de página para este reporte usará otro nombre (`ReportePlanRecaudo.jsx`) para no chocar; el nombre visible en el menú y la URL sí será "Dashboard", que es lo que pidió el usuario.

## Prerrequisito ya resuelto

El plan de pagos de Zoho (`Opportunity.formaPago` / `propuestaPago`, subforms) no venía en el sync masivo — solo se obtenía uno por uno al abrir Conciliación de un negocio puntual. Se corrió un backfill (`POST /api/opportunities/backfill-subforms`, ya implementado y ejecutado) que trajo el plan de las ~1862 oportunidades que tenían fecha de inicio de plan pero no plan cacheado. Confirmado: **1867/1867** oportunidades con `fechaInicioPlanPagos` ahora tienen su plan en BD.

## Datos de referencia (validados contra la BD real, 2026-07-15)

- Inventario total: ~1936 `InventarioItem`.
- Oportunidades con plan de pagos completo: 1867.
- Rango real de meses en los planes: **2020-05 a 2031-06** (~133 meses), porque hay planes de hasta 57 cuotas y fechas de inicio que van desde 2020 hasta 2026.
- Con ~133 meses × 2 sub-columnas (Esperado/Recaudado) + 4 columnas identificadoras ≈ 270 columnas totales. Confirmado con el usuario: se muestran **todos** los meses, con scroll horizontal (sin selector de rango).

## Alcance de filas y columnas

- Una fila por `InventarioItem` (no por `Negocio` — a diferencia del módulo Negocios, aquí NO se incluyen los negocios huérfanos, porque no tienen Frente/Torre/Nomenclatura que mostrar).
- Columnas identificadoras: Etapa, Frente, Torre (derivadas de `Proyecto_Torre` vía `parseProyectoTorre`/`obtenerEtapaTorre`, igual que en Negocios), y Nomenclatura = `Project_Code` (ej. "Vela Village Torre 1 417" — confirmado con el usuario, no el código numérico).
- Inmuebles sin `Negocio` vinculado, o con `Negocio` pero sin `Opportunity`/plan de pagos, aparecen igual (con todas las columnas de mes en blanco) — cumple "mostrar absolutamente todo el inventario".
- Por cada mes calendario del rango global (2020-05 a 2031-06, o el rango real vigente al momento de calcular): dos columnas, "Esperado" (`cuota.valorPlan`) y "Recaudado" (`cuota.cubierto`), tomadas de las cuotas cuya `fechaEstimada` cae en ese mes. Un inmueble sin cuota en un mes dado muestra celda vacía (no cero) en ambas columnas de ese mes.

## Backend

Nuevo endpoint `GET /api/negocios/dashboard-recaudo?search=&etapa=&frente=&torre=&page=&limit=` (en `zoho-payment-tracker/backend/src/routes/negocios.js`, junto a los demás endpoints de inventario) que:

1. Resuelve la lista de `InventarioItem` en alcance (con los mismos filtros Etapa/Frente/Torre/búsqueda que ya soporta `listarNegociosInventario`, paginada server-side).
2. Para el cálculo de conciliación necesita **todos los inmuebles que cumplan los filtros activos** (no solo la página actual), porque la fila de totales suma todo el conjunto filtrado — no está atada a la paginación, pero sí respeta Etapa/Frente/Torre/búsqueda igual que las filas (ej. con Frente=Kabo activo, los totales suman solo Kabo, no todo el portafolio). Se resuelve así:
   - Se resuelve el `Negocio` vinculado de cada `InventarioItem` que cumple los filtros (reutilizando `resolverNegocioIdDesdeInmueble`) y su `Opportunity` (reutilizando `findOportunidadByReferencia`), para todo ese conjunto filtrado, no solo la página.
   - Se traen en bloque (pocas queries, no N+1): todos los `NegocioMovimiento` de los negocios resueltos, y los campos de plan (`formaPago`/`propuestaPago`/`fechaInicioPlanPagos`) de las oportunidades resueltas.
   - Se corre `construirPlan` + `normalizarPagos` + `conciliar` por cada inmueble con oportunidad, produciendo sus cuotas con `valorPlan`/`cubierto`/`fechaEstimada`. El frontend (`utils/conciliacion.js`, `utils/planDePagos.js`) es ES modules y el backend es CommonJS, así que no se puede `require` directo: se portea el mismo código (mismas funciones, misma lógica, sin cambios de comportamiento) a un archivo nuevo del backend, ej. `zoho-payment-tracker/backend/src/services/conciliacionService.js`.
   - Se agrupan las cuotas de **todos** los inmuebles por mes (`YYYY-MM` de `fechaEstimada`) para la fila de totales.
3. Devuelve: `{ data: FilaDashboard[], pagination, meses: string[] (todos los YYYY-MM del rango global, ordenados), totales: Record<mes, { esperado, recaudado }> }`, donde `FilaDashboard` trae las 4 columnas identificadoras + `porMes: Record<mes, { esperado, recaudado } | null>` solo para los inmuebles de la página actual.

Sin migraciones de schema — todo el cálculo es en memoria a partir de datos ya existentes en `Opportunity`/`NegocioMovimiento`/`InventarioItem`/`Negocio`.

## Frontend

- Nueva página `ReportePlanRecaudo.jsx`, nueva ruta (ej. `/dashboard`), nueva entrada en `NAV_ITEMS` con label "Dashboard".
- Tabla con TanStack Table (mismo patrón que las demás grillas paginadas de la app): columnas fijas (Etapa/Frente/Torre/Nomenclatura) + columnas de mes con scroll horizontal.
- Filtros Etapa/Frente/Torre + búsqueda, reutilizando el mismo patrón de cascada ya construido en `Negocios.jsx`.
- Fila de totales al pie, fija (no paginada), usando el campo `totales` de la respuesta.
- Exportar a Excel (mismo patrón que Negocios — `xlsx`), dado el tamaño del reporte.

## Fuera de alcance

- No hay selector de rango de fechas — se muestran todos los meses existentes (confirmado con el usuario).
- No hay virtualización de filas — paginación server-side clásica (confirmado con el usuario).
- No se agrega caché/materialización en BD del cálculo de conciliación — se computa en cada request. Si en el futuro esto resulta lento en producción, se revisita (fuera de alcance de este spec).
- No se modifica `ConciliacionSection` ni la Conciliación por negocio individual en `Negocios.jsx` — este feature es un reporte agregado nuevo, independiente.
