# Fecha estimada y Conciliación en el módulo de Negocios

## Contexto

En el detalle de un negocio (`Negocios.jsx` → `NegocioDetalle`), el acordeón "Forma y propuesta de pago" muestra los subforms de la oportunidad Zoho vinculada (unión `Negocio.referencia` ↔ `Opportunity.referenciaRecaudo`, resuelta por `findOportunidadByReferencia()` en `backend/src/routes/negocios.js`). Hoy esas tablas no muestran fechas, y no existe ninguna vista que cruce el plan de pagos contra los pagos reales del negocio.

En el módulo de Oportunidades ya existe la columna calculada "Fecha estimada" (base `fechaInicioPlanPagos` + N meses según número de cuota, formateo en UTC — ver commit `0e60038`), implementada como función local `addDates()` en `OpportunityDetail.jsx`.

Hallazgos de datos que condicionan el diseño (verificados contra la BD real):

- "Propuesta de pago" viene vacía en la práctica (0 oportunidades con `propuestaPago` en BD). El plan real de cuotas vive en **"Forma de pago"**: filas `{ Cuota: "Separación" | "1".."N" | "Saldo Contraentrega", Valor: "$ X" }`.
- Los subforms NO están masivamente en BD (solo 1 oportunidad los tiene): se cargan bajo demanda vía `GET /api/opportunities/:id/subforms` (fallback a Zoho + persistencia al primer fetch). La conciliación debe usar ese mismo mecanismo.
- Movimientos por negocio: máximo observado 144. El endpoint `GET /api/negocios/:referencia/movimientos` (tope `limit=200`) alcanza en una llamada; el frontend hace loop de páginas defensivo si `total > 200`.
- Los movimientos tienen `datos.Valor` (string numérico), `datos.Estado` ("APLICADO", "PENDIENTE", …) y `fechaContable` (columna DateTime del modelo, además de `datos['Fecha Contable']` como serial de Excel).

## Objetivo

Dos entregas en el mismo módulo, la segunda apoyada en la primera:

1. **Columna "Fecha estimada"** en las tablas del acordeón "Forma y propuesta de pago" del detalle de negocio (ambas tablas: Forma de pago y Propuesta de pago), igual a la de Oportunidades.
2. **Nueva sección "Conciliación"**: cruza el plan de pagos (Forma de pago) contra los pagos reales (movimientos APLICADOS) con lógica de cascada acumulada, mostrando el estado de cada cuota y los atrasos.

## Parte 1 — Fecha estimada en Negocios

### Backend (`backend/src/routes/negocios.js`)

- Agregar `fechaInicioPlanPagos: true` al `select` de `findOportunidadByReferencia()` para que el campo viaje en `GET /api/negocios/:referencia` dentro de `oportunidad`.

### Util compartido (`frontend/src/utils/planDePagos.js` — nuevo)

- Extraer la lógica de `addDates()` de `OpportunityDetail.jsx` a una función exportada:
  ```js
  addFechaEstimada(rows, fechaBase) → rows enriquecidas con 'Fecha estimada'
  ```
  Comportamiento idéntico al actual (incluido el fix UTC): si `fechaBase` es null o no hay filas, devuelve las filas tal cual; detecta la columna de cuota buscando un valor que contenga "separaci"; "Separación" = fecha base, cuota N = base + N meses (aritmética y formato en UTC, `es-CO`, `dd/mm/aaaa`).
- `OpportunityDetail.jsx` pasa a importar esta función (se elimina la copia local). Sin cambio de comportamiento visible.

### Frontend (`frontend/src/pages/Negocios.jsx`)

- `PlanDePagosZoho` aplica `addFechaEstimada(forma, oportunidad.fechaInicioPlanPagos)` y `addFechaEstimada(propuesta, oportunidad.fechaInicioPlanPagos)` antes de pasar las filas a `PlanSubTable`.
- Bajo cada tabla que efectivamente muestre la columna, el mismo aviso de Oportunidades: "\* Fechas estimadas con periodicidad mensual desde la fecha de separación. No representan fechas contractuales."
- Si la estructura de una tabla no calza con el patrón (sin fila "separaci…"), la función devuelve las filas sin columna extra y no se muestra el aviso — degradación silenciosa, sin errores.

## Parte 2 — Sección "Conciliación"

### Ubicación y condiciones

- Nuevo acordeón "Conciliación" en `NegocioDetalle`, entre "Historial de movimientos" y "Forma y propuesta de pago". Cerrado por defecto (`defaultOpen={false}`), ícono `Scale` (lucide), acento distinto a los existentes.
- Estados vacíos (mensaje explicativo, sin cálculo):
  - Sin `negocio.oportunidad` → "Sin oportunidad de Zoho vinculada a esta referencia."
  - Con oportunidad pero sin plan (Forma de pago vacía y Propuesta vacía) → "La oportunidad vinculada no tiene plan de pagos registrado."

### Datos de entrada

- **Plan**: filas de Forma de pago (vía `getSubforms(oportunidad.id)`, mismo mecanismo lazy que `PlanDePagosZoho`); si Forma de pago está vacía y Propuesta de pago no, se usa Propuesta como plan. Se excluyen las filas cuyo monto es 0 en todas las columnas monetarias (mismo criterio de `PlanSubTable`). Cada fila del plan aporta: etiqueta de cuota, valor (parseado con el `parseAmt` existente) y Fecha estimada (Parte 1; puede ser null si no hay `fechaInicioPlanPagos`).
- **Pagos**: todos los movimientos del negocio (`getNegocioMovimientos` con `limit=200` + loop de páginas si `total > 200`), filtrados a `datos.Estado === 'APLICADO'` (comparación case-insensitive por robustez), con `Valor` parseado numérico > 0, ordenados por `fechaContable` ascendente (nulls al final).

### Lógica de cascada acumulada (`frontend/src/utils/conciliacion.js` — nuevo)

Función pura, testeable mentalmente y aislada de React:

```js
conciliar(planRows, pagos) → {
  cuotas: [{ etiqueta, fechaEstimada, valorPlan, cubierto, estado, fechaCubierta }],
  resumen: { totalPlan, totalPagado, porcentaje, cuotasPagadas, cuotasEnMora, montoEnMora, saldoAFavor }
}
```

- Se suma el total pagado como bolsa acumulada y se recorre el plan en el orden de sus filas (Separación → cuota 1 → … → Saldo Contraentrega), asignando de la bolsa a cada cuota hasta cubrir su valor.
- Estado por cuota:
  - **Pagada**: `cubierto >= valorPlan`.
  - **Parcial**: `0 < cubierto < valorPlan`.
  - **Pendiente**: `cubierto === 0`.
  - **Atrasada** (modificador sobre Parcial/Pendiente): fecha estimada existe, ya venció (comparación de fechas en UTC contra hoy) y la cuota no está Pagada.
- `fechaCubierta`: fecha contable del pago que completó la cuota (el pago en cuya acumulación el total cubierto alcanzó `valorPlan`); null si no está pagada.
- `saldoAFavor`: excedente de la bolsa tras cubrir todo el plan (cliente pagó de más); 0 si no aplica.
- Si no hay `fechaInicioPlanPagos`, no hay fechas estimadas → no existe el concepto "Atrasada" (solo Pagada/Parcial/Pendiente) y la columna de fecha muestra "—".

### UI de la sección

- **Resumen** (4 indicadores en grid, estilo de tarjetas del módulo): Total plan · Total pagado (con % de avance) · Cuotas pagadas (n/total) · En mora (n cuotas · $monto, en rojo; "—" si no hay atrasos o no hay fechas).
- **Tabla**: Cuota | Fecha estimada | Valor plan | Cubierto | Estado. Badge de estado con colores consistentes con el módulo: Pagada = emerald, Parcial = amber, Pendiente = slate, Atrasada = red (el badge muestra "Atrasada" y el detalle "venció dd/mm/aaaa").
- **Saldo a favor**: si `saldoAFavor > 0`, línea destacada bajo la tabla: "Saldo a favor: $X".
- Nota al pie: "\* Conciliación estimada según fechas calculadas y pagos APLICADOS. No representa un estado de cuenta oficial."
- Loading spinner mientras cargan subforms/movimientos (mismo patrón visual del módulo).

## Fuera de alcance

- Ningún cambio de schema ni migraciones (la conciliación es cálculo en frontend).
- No se modifica el endpoint de movimientos ni su tope de 200.
- No se toca `pagoSeparacion` en ninguna parte.
- No se concilia contra "Propuesta de pago" cuando Forma de pago existe (Propuesta solo actúa como plan de respaldo si Forma está vacía).
- Sin exportación (Excel/PDF) de la conciliación en esta entrega.

## Testing (manual — el repo no tiene suite de tests)

- Negocio con oportunidad vinculada, plan y pagos reales: verificar cascada (cuotas iniciales Pagadas, una Parcial en el frente de avance, resto Pendientes/Atrasadas según fechas), suma de indicadores coherente con "Total abonado" del header.
- Negocio sin oportunidad vinculada → mensaje de vacío correcto.
- Negocio con oportunidad sin `fechaInicioPlanPagos` → conciliación sin fechas ni atrasos, sin errores.
- Oportunidades: verificar que la columna "Fecha estimada" sigue funcionando igual tras extraer el util compartido.
- Negocios: columna de fecha visible en Forma de pago (y en Propuesta si trae datos con patrón de cuotas).
