# UI/UX Redesign — Cartera AED

## Context

**Usuarios:** Equipo comercial (oportunidades Zoho) y equipo de cartera (movimientos y fiducia).  
**Dispositivo:** Escritorio exclusivamente.  
**Stack:** React 18 + Vite + Tailwind CSS 3. Sin cambio de tecnología.  
**Alcance:** Rediseño significativo — nueva jerarquía de información, nuevo layout, mejor navegación. Sin nuevas funcionalidades de backend.

---

## Decisiones de diseño

### Layout global — Sidebar persistente

Reemplazar el `NavBar` horizontal actual por un sidebar vertical de **60px de ancho** con:
- Logo/inicial de la app arriba (`A` con gradiente azul-índigo)
- Íconos de navegación con indicador activo (borde izquierdo azul + fondo `#eff6ff`)
- Avatar del usuario abajo
- Divider visual entre nav items y settings

El sidebar ocupa una columna fija; el contenido principal ocupa el resto del viewport.

### Paleta de colores (modo claro)

| Token | Valor | Uso |
|---|---|---|
| `bg-base` | `#f8faff` | Fondo de contenido principal |
| `bg-card` | `#ffffff` | Tarjetas, panels, sidebar |
| `border-subtle` | `#e8f0fe` | Bordes de cards y separadores |
| `border-light` | `#f1f5f9` | Separadores internos de tablas |
| `text-primary` | `#1e293b` | Títulos y valores importantes |
| `text-secondary` | `#64748b` | Labels y metadatos |
| `text-muted` | `#94a3b8` | Timestamps, etiquetas pequeñas |
| `blue-primary` | `#3b82f6` | Botones primarios, links, activos |
| `blue-light` | `#eff6ff` | Fondos de elementos activos/hover |
| `blue-border` | `#bfdbfe` | Bordes de elementos azules |
| `green-light` | `#f0fdf4` | Badge "Ganado" / "Vigente" |
| `amber-light` | `#fffbeb` | Badge "Negociación" / "Parcial" |
| `red-light` | `#fff1f2` | Badge "Perdido" / "Vencido" |
| `purple-light` | `#faf5ff` | Badge "Análisis" / origen Zoho |

Sin colores oscuros en texto sobre fondo blanco excepto `#1e293b` para valores prominentes.

### Tipografía y espaciado

- **Fuente:** `'Segoe UI', system-ui, -apple-system, sans-serif` (ya disponible, sin carga externa)
- **Escala de texto:** `text-xs` (10px) para labels uppercase · `text-sm` (12px) para cuerpo · `text-base` (14–15px) para títulos de página
- **Labels de sección:** 9–10px, `font-weight: 700`, `text-transform: uppercase`, `letter-spacing: 0.7px`, color `#94a3b8`
- **Valores financieros:** `font-weight: 700`, `letter-spacing: -0.5px`
- **Códigos de referencia:** `font-family: monospace`, sobre fondo `#eff6ff`, color `#3b82f6`

---

## Vista 1 — Dashboard de Oportunidades

### Topbar
- Altura 52px, fondo blanco, borde inferior `#e8f0fe`
- Izquierda: título del módulo (`Oportunidades`) + subtítulo gris (`CRM Zoho`)
- Centro: badge verde de sync con dot animado, timestamp y conteo de registros
- Derecha: buscador global con ícono, fondo `#f8faff`

### KPI Cards (fila de 4)
Grid de 4 columnas, cards blancas con borde `#e8f0fe` y `box-shadow` sutil.  
Cada card tiene: ícono en cuadrado redondeado de color pastel, label gris, valor grande (`font-size: 22px, font-weight: 700`). Sin indicadores de tendencia (el backend no tiene datos históricos).

| Card | Valor de API | Ícono bg |
|---|---|---|
| Total oportunidades | `GET /api/opportunities?page=1&pageSize=1` → campo `total` | `#eff6ff` |
| En negociación | `GET /api/opportunities/stages` → suma de etapas intermedias | `#fffbeb` |
| Total recaudado | `GET /api/opportunities` → suma client-side de `valorTotal` | `#f0fdf4` |
| Encargos activos | `GET /api/fiducia` → campo `total` | `#faf5ff` |

### Tabla de oportunidades
Card blanca con header que incluye título, badge de conteo azul, selector de etapa y botón "↻ Sincronizar".

**Columnas:** Negocio / Proyecto · Contacto · Etapa · Pago Separación · Ref. Recaudo · Valor Total  
(Se elimina la columna "Última Sync" — se mueve al topbar global)

- Headers: 9px uppercase, color `#94a3b8`, fondo `#f8faff`
- Filas: hover con fondo `#f0f6ff` completo
- Badge de etapa: pill suave con borde, cada etapa mapea a un par de colores pastel
- Ref. recaudo: monospace sobre `#eff6ff`
- Valor: `font-weight: 600`, alineado a la derecha

---

## Vista 2 — Detalle de Oportunidad

### Topbar
- Botón `←` redondeado para volver al dashboard
- Nombre del deal + badge de etapa
- Timestamp de última sync a la derecha (gris claro)

### Layout 3 columnas

**Columna izquierda (210px) — Información:** Fondo blanco, borde derecho.  
Tres grupos con `section-title` (9px uppercase gris): Contacto · Negocio · Inmueble.  
Cada campo: label en 9px gris claro + valor en 12px `#1e293b`. Ref. recaudo en monospace azul.

**Columna central (flex 1) — Financiero:** Fondo `#f8faff`. Tres cards apiladas:

1. **Plan de pagos** — tabla de 2 columnas (label | valor) con colores semánticos: verde para pagado, azul para pendiente cuota inicial, rojo para saldo
2. **Avance de recaudo** — barra de progreso con gradiente azul-índigo, porcentaje a la derecha, subtexto `$Xm pagados / $Ym restantes`
3. **Forma de pago** — barras horizontales proporcionales por concepto (cuotas, cesantías, crédito, prima), datos del subform `Forma_de_Pago`. Cada barra: label izquierda, barra proporcional al total, valor derecha.
4. **Propuesta de pago** — tabla compacta de 2 columnas (Concepto | Valor) con filas del subform `Propuesta_de_Pago`. Si no hay datos, muestra estado vacío "Sin propuesta registrada".

**Columna derecha (230px) — Movimientos:** Fondo blanco, borde izquierdo.  
Timeline vertical: cada movimiento tiene dot de color por origen (verde fiducia, azul claro cuotas, morado Zoho), nombre, fecha, badge de origen (`Fiducia` / `Zoho CRM`), monto alineado a la derecha.  
Connector line entre dots para efecto de timeline.  
Total acumulado en box de fondo `#f8faff` al final de la columna.

### Principio de eliminación
Las **7 secciones colapsables** actuales (`CollapsibleSection`) se eliminan completamente. La información se redistribuye en el layout de 3 columnas sin necesidad de carga diferida visible. Los subforms (Forma de Pago, Propuesta de Pago) se consolidan en la columna central como visualizaciones.

---

## Vista 3 — Módulo Fiducia

### Layout master-detail

**Panel izquierdo (280px) — Lista de encargos:** Fondo blanco, borde derecho.  
Cada item: nombre del encargo (`font-weight: 600`), código en monospace azul, cantidad de hojas + apartamentos en gris, fecha de importación a la derecha.  
Item activo: borde izquierdo `#3b82f6` de 3px, fondo `#eff6ff`.  
Al hacer clic en un encargo se carga el detalle en el panel derecho sin navegación de página.

**Panel derecho — Detalle del encargo:**
- Header: nombre, metadata (código, fecha, cantidad de aptos), botones Editar y Eliminar
- **Tabs:** en lugar de hojas de Excel crudas, las tabs son: Resumen · Movimientos · Propietarios · [nombre de hoja de corte con conteo]
- Cada tab muestra su conteo en un badge `#f1f5f9`

**Toolbar de tabla:** buscador (nomenclatura/propietario) + selector de estado (Todos / Vigente / Parcial / Vencido) + conteo de registros a la derecha.

**Tabla:**
- Primera columna `Nomenclatura` sticky (no desaparece en scroll horizontal)
- Headers 9px uppercase
- Hover de fila completo `#f0f6ff`
- Badge de estado pastel por cada fila
- Paginación abajo: info de registros a la izquierda, botones Anterior / Siguiente a la derecha

### Botón de importación
El botón "↑ Importar Excel" va en el topbar del módulo (azul primario, prominente). Reemplaza la zona de drag-and-drop que interrumpía el layout del listado. El upload abre un **modal** centrado con zona de drag-and-drop y botón de selección de archivo. El modal muestra el progreso de procesamiento y cierra automáticamente al terminar con éxito.

---

## Componentes nuevos / modificados

| Componente | Acción | Descripción |
|---|---|---|
| `Sidebar.jsx` | Crear | Navegación lateral persistente, reemplaza `NavBar.jsx` |
| `KpiCard.jsx` | Crear | Card de métrica con ícono, valor, tendencia |
| `StageBadge.jsx` | Modificar | Actualizar colores a paleta pastel |
| `Dashboard.jsx` | Modificar | Agregar KpiCard row, refactorizar tabla |
| `OpportunityDetail.jsx` | Modificar | Reemplazar CollapsibleSections por layout 3 cols |
| `ProgressBar.jsx` | Crear | Barra de progreso reutilizable |
| `HorizontalBarChart.jsx` | Crear | Barras proporcionales para forma de pago |
| `MovimientoTimeline.jsx` | Crear | Timeline de movimientos con dots y conectores |
| `FiduciaModule.jsx` | Modificar | Rediseño completo con master-detail |
| `FiduciaDetalle.jsx` | Modificar | Mover a panel derecho del master-detail |
| `index.css` | Modificar | Actualizar variables CSS y utilidades base |
| `tailwind.config.js` | Modificar | Extender tema con tokens de color del diseño |

### Componentes a eliminar
- `NavBar.jsx` — reemplazado por `Sidebar.jsx`
- `CollapsibleSection.jsx` — eliminado, no aplica al nuevo layout

---

## Qué NO cambia

- Rutas de React Router (URLs iguales)
- Llamadas a la API (ningún cambio de backend)
- Lógica de sync, paginación, filtros (solo se retoca la UI que los envuelve)
- Módulo `ApartamentoDetalle.jsx` y `EncargoNomenclaturas.jsx` — se actualizan solo a la nueva paleta de colores, no hay rediseño estructural
