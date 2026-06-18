# Refresh de Color y Claridad — Cartera AED

## Contexto

**Problema reportado por el usuario:** la app abusa del gris y del azul único — "varias cosas tienen el mismo color", cuesta diferenciar, y los usuarios veteranos/no expertos del entorno corporativo interno no siempre entienden qué es cada cosa (filtros, estados, columnas).

**Objetivo:** un sistema de diseño con **color con significado** (un color = un concepto), neutros legibles (no grises desvaídos), tipografía pensada para legibilidad, y ayudas explícitas (filtros con identidad, tooltips). Sensación: aplicación web corporativa, seria y confiable.

**Stack:** React 18 + Vite + Tailwind CSS 3. Sin cambios de backend ni de rutas.

**Relación con specs previos:** Este documento **supersede las secciones de Paleta de colores y Tipografía** de `2026-05-08-ui-ux-redesign-design.md`. Conserva intacta la **arquitectura de layout** ya implementada (sidebar de 60px, master-detail de Negocios/Fiducia, layout de detalle). No es un rediseño estructural: es un refresh transversal de color, tipografía y claridad.

**Decisiones aprobadas por el usuario:**
- Color de marca: **Teal AED** (no seguir con azul como marca).
- Tipografía: **Lexend (títulos/etiquetas) + Source Sans 3 (cuerpo)**.
- Marca anclada en la identidad AED (constructora eco-sostenible; web blanca + navy + agua/naturaleza).

---

## 1. Principio rector — "un color, un significado"

El color de marca (teal) se reserva para **navegación activa, acciones primarias y foco**. Cada **estado/concepto del dominio** tiene un tono fijo e invariable, de modo que el usuario aprende el código de color. Nunca se usa el color como único indicador: siempre acompaña ícono y/o texto (accesibilidad).

---

## 2. Tokens de color

Se definen como variables CSS en `index.css` y se exponen en `tailwind.config.js` bajo nombres semánticos. **Prohibido** hex crudo en componentes; usar siempre el token.

### Marca y neutros

| Token | Hex | Uso |
|---|---|---|
| `brand` | `#0F766E` | Teal AED — nav activo, botones primarios, foco/ring, acentos de marca |
| `brand-strong` | `#115E59` | Hover de acciones primarias |
| `brand-soft` | `#CCFBF1` | Fondo de elementos activos/hover de marca |
| `brand-tint` | `#F0FDFA` | Fondo muy sutil de zonas de marca |
| `ink` | `#0F172A` | Títulos y valores prominentes (navy) |
| `text` | `#334155` | Texto de cuerpo / datos (slate-700) |
| `text-muted` | `#64748B` | Texto secundario / metadatos (slate-500) — **mínimo permitido para texto** |
| `surface` | `#FFFFFF` | Tarjetas, paneles, sidebar |
| `surface-base` | `#F6F8FB` | Fondo de contenido principal (navy-tinted, no gris plano) |
| `border` | `#E2E8F0` | Bordes de cards y separadores |
| `border-soft` | `#EEF2F7` | Separadores internos de tablas |

> Nota de neutros: la rampa `slate` se conserva (tiene tinte navy, es corporativa) pero **se usa con contraste real**. Queda **prohibido** usar `slate-300`/`slate-400` para texto legible; esos tonos solo para íconos decorativos, placeholders y estados deshabilitados.

### Estados del dominio (semánticos)

Cada concepto un hue distinto. Cada estado define trío `{bg, text, border}` para badges y un `dot`/icono.

| Concepto | Token | Text | Bg | Border | Aplica a |
|---|---|---|---|---|---|
| Positivo / al día / escriturado / vigente | `success` | `#047857` | `#ECFDF5` | `#A7F3D0` | estados "escriturado", "activo", "vigente", "prometido"; "Con abonos"; saldos positivos |
| Crítico / en mora / vencido / cancelado | `danger` | `#B91C1C` | `#FEF2F2` | `#FECACA` | "mora", "vencido", "cancelado", "rescindido", "anulado" |
| Atención / pendiente / por revisar | `warning` | `#B45309` | `#FFFBEB` | `#FDE68A` | "pendiente", "reversado", saldos por cobrar |
| Informativo / en proceso / trámite / promesa | `info` | `#1D4ED8` | `#EFF6FF` | `#BFDBFE` | "promesa", "proceso", "trámite", "libre", "aplicado en revisión" |
| Inactivo / cerrado / sin dato | `neutral` | `#475569` | `#F1F5F9` | `#E2E8F0` | "Closed Lost", desconocido, vacío |

> El azul (`info`) ya **no** comparte rol con la marca; queda libre para significar "en proceso/informativo".

### Etapas Zoho (`StageBadge`) — sin repetir hues

Hoy varias etapas comparten azul. Se reasignan a hues distintos del set extendido (todos con trío bg/text/border de baja saturación, estilo pill):

| Etapa Zoho | Hue |
|---|---|
| `Qualification` | amber |
| `Value Proposition` | sky |
| `Id. Decision Makers` | violet |
| `Perception Analysis` | indigo |
| `Proposal/Price Quote` | teal |
| `Negotiation/Review` | rose |
| `Closed Won` | emerald (success) |
| `Closed Lost` | neutral (slate) |

Fallback (etapa desconocida): `neutral`.

### Acentos de categoría (gráficas y diferenciación)

Para charts (`RecaudoChart`, `EstadoDonut`, `PipelineBars`, `CarteraWidgets`) y para diferenciar categorías no semánticas (p. ej. proyectos/fideicomisos), se define una **paleta categórica ordenada y accesible** de 8 hues que no chocan entre sí: `teal, sky, violet, amber, emerald, rose, indigo, fuchsia`. Las gráficas la consumen en orden. Nunca depender solo del color: donut/barras llevan etiqueta directa o leyenda visible.

---

## 3. Tipografía

- **Fuentes (Google Fonts, `display=swap`):** Lexend (títulos, etiquetas de sección, KPIs) + Source Sans 3 (cuerpo, datos, tablas). Monoespaciada del sistema solo para referencias/códigos.
  - Tailwind: `fontFamily: { heading: ['Lexend', ...], sans: ['Source Sans 3', ...], mono: [...] }`.
- **Escala subida (legibilidad):**

| Rol | Antes | Ahora |
|---|---|---|
| Etiqueta de sección (uppercase) | 9px `slate-400` | **11px** `text-muted`, `tracking` reducido, peso 600 |
| Texto/datos en tablas y listas | 11px | **12.5–13px** |
| Cuerpo general | 12px | **14px** |
| Título de página / KPIs | 13–22px | título 15px; KPI 22–26px (sin cambio mayor) |

- **Contraste:** todo texto cumple ≥ 4.5:1. Las etiquetas que antes eran `slate-400` suben a `text-muted` (`#64748B`) como piso.
- **Cifras:** `tabular-nums` en columnas numéricas y montos (ya se usa en partes; extender).

---

## 4. Convenciones de componentes

### 4.1 Filtros con identidad (`FilterBar` y filtros inline de `Negocios`, `FiduciaModule`, etc.)
Cada filtro deja de ser un `<select>` plano idéntico y pasa a tener:
- **Ícono** representativo a la izquierda (lucide), con color propio del filtro.
- **Etiqueta clara** encima o como placeholder descriptivo: "Estado del negocio", "Proyecto", "Buscar (ref., comprador, cédula)".
- **Tinte propio** sutil en el borde/ícono para diferenciar visualmente cada control.
- El toggle "Con abonos" usa `success` cuando está activo (ya lo hace; se estandariza al token).
- Clase utilitaria reutilizable `.field` (label + control) y `.field-icon`.

### 4.2 Badges de estado
- Pastilla con `{bg,text,border}` del token + **ícono** (dot o glyph lucide) + texto. Helper único `estadoToken(estado)` centraliza el mapeo de strings del dominio → token (reemplaza la función `estadoColor` duplicada en `Negocios.jsx` y lógicas equivalentes). Vive en `utils/estados.js`.

### 4.3 Tooltips de ayuda `(?)`
- Existe `ConceptoHint` (tooltip por columna). Se **generaliza** a un componente `HelpTip` reutilizable (ícono `?` o `info`, contenido en lenguaje simple, accesible por teclado y `aria`).
- Se añaden `HelpTip` junto a: etiquetas de filtros, encabezados de estado, KPIs, y términos técnicos de columnas. Los textos viven en `utils/etiquetas.js` / glosario.

### 4.4 Navegación e íconos
- Los íconos del `Sidebar` dejan de ser todos del mismo gris: el ítem activo usa `brand`; en hover, color propio tenue. Logo "A" pasa de gradiente azul-índigo a gradiente de marca (teal → teal-strong).
- Set de íconos único (lucide), stroke consistente (1.75), tamaños tokenizados.

### 4.5 Cards, foco y estados
- `card`: `surface` + `border` + sombra sutil consistente.
- Foco visible (`ring` = `brand`) en todos los interactivos (hoy `focus:ring-blue-500` → token).
- Hover de fila de tabla: `brand-tint` (en vez de azul) para coherencia de marca.
- Spinners y barras de progreso usan `brand`.

---

## 5. Superficies a actualizar (aplicación del sistema)

Foundation primero, luego aplicar por vista:

**Foundation**
- `tailwind.config.js` — tokens de color semánticos + `fontFamily`.
- `index.css` — variables CSS, `@import` de fuentes, clases `.btn-*`, `.card`, `.badge`, `.input`, `.field`, `.section-label` (subir tamaño), foco.
- `utils/estados.js` (nuevo) — `estadoToken()` y mapeo de dominio.
- `components/HelpTip.jsx` (nuevo o refactor de `ConceptoHint`).

**Vistas y componentes (aplicar tokens + claridad)**
- `components/Sidebar.jsx` — íconos con color, logo teal, activo = brand.
- `components/StageBadge.jsx` — hues no repetidos.
- `components/KpiCard.jsx` — label legible, ícono con color de categoría.
- `components/FilterBar.jsx` — ícono + etiqueta + tinte.
- `components/SyncStatus.jsx`, `components/PaymentPlanTable.jsx`, `components/DatosFinancieros.jsx`, `components/ConceptoHint.jsx`.
- `components/stats/*` (`RecaudoChart`, `EstadoDonut`, `PipelineBars`, `CarteraWidgets`) — paleta categórica + leyendas/etiquetas.
- `pages/Negocios.jsx` — filtros con identidad, `estadoToken`, neutros legibles, hover teal.
- `pages/Dashboard.jsx`, `pages/OpportunityDetail.jsx`, `pages/Resumen.jsx`.
- `pages/FiduciaModule.jsx`, `pages/FiduciaDetalle.jsx`, `pages/FiduciaMovimientos.jsx`, `pages/FiduciaPropietario.jsx`, `pages/EncargoNomenclaturas.jsx`, `pages/ApartamentoDetalle.jsx`.
- Exports PDF (`exportPDF` en `Negocios.jsx`): `headStyles.fillColor` y alternancia a tonos de marca.

---

## 6. Qué NO cambia

- Arquitectura de layout (sidebar 60px, master-detail, layout de detalle) — se conserva.
- Rutas de React Router y llamadas a la API.
- Lógica de sync, paginación, filtros (solo se reviste la UI).
- Estructura de datos / categorización de campos.

---

## 7. Criterios de aceptación

1. Ningún texto legible usa `slate-300/400`; etiquetas de sección a 11px mínimo.
2. El teal es el único color de "marca/acción"; el azul solo significa "en proceso/informativo".
3. Cada estado del dominio y cada etapa Zoho tiene un hue distinto (sin repetición) con ícono+texto, no color solo.
4. Cada filtro tiene ícono, etiqueta clara y tinte propio.
5. Términos técnicos clave tienen `HelpTip` con explicación en lenguaje simple.
6. Lexend + Source Sans cargadas y aplicadas; contraste ≥ 4.5:1 en todo el texto.
7. Foco visible (ring teal) en todos los interactivos.
8. Consistencia: mismas clases/tokens en todas las vistas (un solo `estadoToken`, una sola paleta categórica).
