# Diseño — Módulo "Resumen Gerencial"

**Fecha:** 2026-06-02
**Autor:** Gabriel Elías Valdelamar Caldera (con Claude Code)
**Estado:** Propuesta — pendiente de revisión

## Objetivo

Crear un módulo de estadísticas con enfoque de **resumen gerencial**: una sola
pantalla de alto nivel que reúne los KPIs clave de todas las áreas del sistema
(cartera, comercial, fiducia y salud operativa) para apoyar la toma de decisiones
rápida.

No es un explorador analítico con cruces arbitrarios; es un *dashboard ejecutivo*
de lectura, con un filtro de periodo global.

## Fuentes de datos (existentes)

| Fuente | Modelo Prisma | Campos usados |
|---|---|---|
| Cartera | `Negocio` | `estado`, `saldoActual`, `datos->>'Fideicomiso'` |
| Recaudo | `NegocioMovimiento` | `fechaContable`, `datos->>'Valor'` |
| Comercial | `Opportunity` | `stage`, `pagoSeparacion`, `camposFinancieros` |
| Operativo | `SyncLog` | `startedAt`, `status`, `recordsSync` |

Reutilizamos el endpoint existente `GET /api/negocios/stats`
([negocios.js:540](../../../zoho-payment-tracker/backend/src/routes/negocios.js))
que ya entrega `saldoTotal`, `porEstado` y `porFideicomiso`.

## Layout

```
┌──────────────────────────────────────────────────────────────┐
│  Resumen Gerencial          [Mes ▾] [Trimestre] [Año] [Todo]  │  filtro periodo
├──────────────────────────────────────────────────────────────┤
│ [Saldo cartera] [Recaudo mes ▲%] [Recaudo año] [Separac. mes] │  KPIs
│ [Negocios activos]                                             │
├──────────────────────────────────────────────────────────────┤
│  Recaudo mensual (últimos 12 meses)         — barras          │  tendencia
├───────────────────────────────┬──────────────────────────────┤
│  Negocios por estado — dona    │  Pipeline por etapa — barras │  distribución
├───────────────────────────────┼──────────────────────────────┤
│  Top 10 deudores               │  Recaudo por proyecto        │  rankings
├──────────────────────────────────────────────────────────────┤
│  Salud de sincronización: último sync ✓ · N OK / M errores    │  footer
└──────────────────────────────────────────────────────────────┘
```

## KPIs principales

1. **Saldo total de cartera** — `SUM(Negocio.saldoActual)` + nº negocios con saldo > 0.
2. **Recaudo del mes** — `SUM(Valor)` de movimientos con `fechaContable` en el mes
   actual, con variación % vs. mes anterior.
3. **Recaudo del año (YTD)** — `SUM(Valor)` de movimientos del año en curso.
4. **Separaciones del mes** — `COUNT(Opportunity)` con `pagoSeparacion` en el mes.
5. **Negocios activos** — nº de negocios con `saldoActual > 0`.

## Backend

Nuevo archivo `src/routes/stats.js`, montado en `/api/stats` en el server principal.

| Endpoint | Devuelve |
|---|---|
| `GET /api/stats/resumen?periodo=` | Los 5 KPIs (con comparativo mes anterior) |
| `GET /api/stats/recaudo-mensual` | Serie `[{ mes, total }]` últimos 12 meses |
| `GET /api/stats/pipeline` | `[{ stage, count, valor }]` de Opportunity |
| `GET /api/stats/top-deudores?limit=10` | `[{ referencia, nombre, saldoActual }]` |
| `GET /api/stats/sync?limit=5` | Últimos registros de `SyncLog` |

`porEstado` y `porFideicomiso` se obtienen del endpoint existente
`GET /api/negocios/stats` (no se duplican).

### Consideraciones de datos

- **`Valor` es JSON string**: el monto vive en `NegocioMovimiento.datos->>'Valor'`
  y puede venir con formato (separadores de miles, signo). Se parsea a `float`
  con un helper antes de sumar; valores no numéricos se ignoran.
- **Agrupación mensual**: vía SQL `date_trunc('month', "fechaContable")` filtrando
  `fechaContable IS NOT NULL`.
- **Periodo**: el parámetro `periodo` (`mes` | `trimestre` | `anio` | `todo`)
  afecta KPIs temporales y la tendencia. Default `mes`.

## Frontend

- **Página** `src/pages/Resumen.jsx`.
- **Ruta** `/resumen` en [App.jsx](../../../zoho-payment-tracker/frontend/src/App.jsx).
  No cambia la ruta raíz actual (`/` → Negocios); se accede desde el Sidebar.
- **Sidebar**: nuevo item "Resumen" con ícono (`BarChart3` / `LayoutDashboard` de lucide).
- **Componentes**: reutilizar `KpiCard`; nuevos componentes de gráfico envolviendo
  **Recharts** (`RecaudoChart`, `EstadoDonut`, `PipelineBars`).
- **API**: funciones en `src/utils/api.js` para cada endpoint nuevo.
- **Formato**: montos con `formatCOP` existente.

### Dependencia nueva

- `recharts` (~50KB) en `frontend/package.json`. Gráficos: barras (recaudo,
  pipeline), dona (estado), con tooltips y ejes.

## Manejo de errores

- Cada endpoint envuelve en `try/catch` devolviendo `500 { error }` (patrón actual).
- El frontend muestra estado de carga y un placeholder ("—" / "Sin datos") por
  tarjeta/gráfico si su fetch falla, sin tumbar toda la página (fetches independientes).

## Pruebas

No hay suite configurada en el repo. Validación manual:
- Comparar `saldoTotal` y `porEstado` contra el módulo Negocios existente.
- Verificar que `recaudo-mensual` cuadre con la suma de movimientos de un mes conocido.
- Probar cada `periodo` del filtro.

## Fuera de alcance (YAGNI)

- Exportación a PDF/Excel del dashboard (ya existen utilidades jsPDF/xlsx si luego se requiere).
- Filtros por proyecto/comprador dentro del resumen (es vista ejecutiva, no explorador).
- Métricas predictivas / proyecciones.
