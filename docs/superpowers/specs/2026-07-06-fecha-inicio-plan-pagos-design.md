# Fecha estimada de cuotas basada en Fecha Inicio Plan de Pagos

## Contexto

En el detalle de oportunidad (`OpportunityDetail.jsx`), la tabla "Forma de Pago" muestra una columna calculada "Fecha estimada" para cada cuota. Hoy esa fecha se calcula tomando `pagoSeparacion` (campo `Pago_Separacion` de Zoho, ya sincronizado) como fecha base y sumando N meses según el número de cuota (fila "Separación" = mes 0, cuota 1 = mes 1, etc.).

Existe en Zoho un campo `Fecha_Inicio_Plan_de_Pagos` ("Fecha Inicio Plan de Pagos") que **hoy no se sincroniza**: está registrado en `ZohoFieldMetadata` (que guarda metadatos de *todos* los campos de Zoho para construir reglas de extracción) pero nunca se incluye en el fetch de deals ni se persiste en `Opportunity`.

## Objetivo

Cambiar la fecha base del cálculo de "Fecha estimada" de `pagoSeparacion` a `Fecha_Inicio_Plan_de_Pagos`. Este nuevo campo pasa a representar la fecha de separación para efectos de este cálculo. `pagoSeparacion` no se toca en ningún otro lugar del sistema (dashboard, filtros, stats, informes) — solo deja de usarse como base de este cálculo específico.

## Alcance

### 1. Sync de Zoho (`backend/src/services/zohoSync.js`)

- Agregar `'Fecha_Inicio_Plan_de_Pagos'` a `baseFields` en `buildFieldsList()`, junto a los demás campos fijos (`Deal_Name`, `Stage`, etc.).
- En `mapDeal()`, mapear el valor crudo a un nuevo campo:
  ```js
  fechaInicioPlanPagos: deal.Fecha_Inicio_Plan_de_Pagos
    ? new Date(deal.Fecha_Inicio_Plan_de_Pagos)
    : null,
  ```
- No cambia la lógica de filtrado de deals (se sigue filtrando por `Pago_Separacion` presente, como hoy) ni ningún otro campo derivado.

### 2. Esquema de base de datos (`backend/prisma/schema.prisma`)

- Nueva columna en `Opportunity`:
  ```prisma
  fechaInicioPlanPagos DateTime?
  ```
- Migración vía `npm run db:migrate` + `npm run db:generate`.

### 3. Frontend (`frontend/src/pages/OpportunityDetail.jsx`)

- `SubformsAccordion` recibe `fechaInicioPlanPagos` (en vez de `pagoSeparacion`) como prop base para el cálculo.
- `addDates(rows)` usa `fechaInicioPlanPagos` como fecha base para sumar meses según el número de cuota. Misma lógica de detección de fila ("Separación" = mes 0, cuota N = mes N).
- Si `fechaInicioPlanPagos` es `null`/`undefined` para una oportunidad, no se muestra la columna "Fecha estimada" (mismo comportamiento que hoy tiene con `pagoSeparacion` ausente).
- El texto de aviso bajo la tabla ("* Fechas estimadas con periodicidad mensual desde la fecha de separación...") se mantiene conceptualmente igual — sigue siendo correcto porque `Fecha_Inicio_Plan_de_Pagos` representa la fecha de separación para este cálculo.
- El componente `<SubformsAccordion opportunityId={id} pagoSeparacion={opportunity.pagoSeparacion} />` cambia su prop a `fechaInicioPlanPagos={opportunity.fechaInicioPlanPagos}`.

### 4. Backfill de datos existentes

- El sync incremental usa `If-Modified-Since` contra el último `SyncLog` exitoso, por lo que oportunidades ya sincronizadas y sin cambios recientes en Zoho no traerán `Fecha_Inicio_Plan_de_Pagos` automáticamente.
- `syncOpportunitiesFromZoho()` hoy no acepta parámetros y siempre calcula `modifiedSince` desde el último `SyncLog` exitoso — no existe manera de forzar un full sync.
- Se agrega un parámetro opcional `force` (`syncOpportunitiesFromZoho(force = false)`): si es `true`, se omite el cálculo de `modifiedSince` (queda `null`), forzando un full sync. El endpoint `POST /api/sync` (en `opportunities.js` e `index.js`) pasa `req.query.full === 'true'` como ese parámetro.
- Después de desplegar el cambio, se dispara manualmente `POST /api/sync?full=true` una vez para poblar `fechaInicioPlanPagos` en todas las oportunidades existentes.

## Fuera de alcance

- No se modifica `pagoSeparacion` en ningún otro módulo (dashboard de oportunidades, filtros, `stats.js`, `PaymentPlanTable.jsx`, informes).
- No se agrega el campo `Fecha_de_Inicio_Plan_de_Pagos_Promesa` (el campo similar pero distinto que apareció en la búsqueda inicial) — no es parte de este trabajo.
- No se modifica la tabla "Propuesta de Pago" (no tiene columna de fecha estimada hoy y no se le agrega).

## Testing

- Verificar manualmente en un deal de prueba en Zoho con `Fecha_Inicio_Plan_de_Pagos` poblado que, tras un sync, la oportunidad correspondiente muestre "Fecha estimada" correcta en la tabla "Forma de Pago" del frontend.
- Verificar que una oportunidad sin `Fecha_Inicio_Plan_de_Pagos` no muestre la columna "Fecha estimada" (sin errores).
- Confirmar que el dashboard, filtros y stats que usan `pagoSeparacion` siguen funcionando sin cambios.
