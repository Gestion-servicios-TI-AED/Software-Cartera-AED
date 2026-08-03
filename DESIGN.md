---
name: Cartera AED
description: Panel interno de cartera, cobranza y fideicomisos para Baía Kristal
colors:
  harbor-teal: "#0e7581"
  harbor-teal-strong: "#0a4f57"
  harbor-teal-soft: "#d6f2f5"
  harbor-teal-tint: "#f4fafb"
  logo-navy: "#001c5c"
  ink: "#1c2e30"
  surface: "#ffffff"
  surface-base: "#fafcfc"
  border: "#e2e8e8"
  border-soft: "#eef2f2"
  success-text: "#047857"
  success-bg: "#ecfdf5"
  success-border: "#a7f3d0"
  danger-text: "#b91c1c"
  danger-bg: "#fef2f2"
  danger-border: "#fecaca"
  warning-text: "#b45309"
  warning-bg: "#fffbeb"
  warning-border: "#fde68a"
  info-text: "#1d4ed8"
  info-bg: "#eff6ff"
  info-border: "#bfdbfe"
typography:
  heading:
    fontFamily: "Lexend, system-ui, sans-serif"
    fontWeight: 700
    lineHeight: 1.2
    letterSpacing: "normal"
  body:
    fontFamily: "\"Source Sans 3\", system-ui, sans-serif"
    fontSize: "14px"
    fontWeight: 400
    lineHeight: 1.5
  label:
    fontFamily: "\"Source Sans 3\", system-ui, sans-serif"
    fontSize: "13px"
    fontWeight: 600
    letterSpacing: "0.4px"
rounded:
  sm: "8px"
  md: "10px"
  lg: "12px"
  full: "9999px"
spacing:
  xs: "4px"
  sm: "8px"
  md: "16px"
  lg: "20px"
components:
  button-primary:
    backgroundColor: "{colors.harbor-teal}"
    textColor: "#ffffff"
    rounded: "{rounded.sm}"
    padding: "8px 16px"
  button-primary-hover:
    backgroundColor: "{colors.harbor-teal-strong}"
  button-secondary:
    backgroundColor: "{colors.surface}"
    textColor: "#334155"
    rounded: "{rounded.sm}"
    padding: "8px 16px"
  card:
    backgroundColor: "{colors.surface}"
    rounded: "{rounded.lg}"
  badge:
    rounded: "{rounded.full}"
    padding: "2px 10px"
---

# Design System: Cartera AED

## 1. Overview

**Creative North Star: "The Clear Harbor"**

Baía Kristal — bahía de cristal — es la metáfora fundacional: un puerto financiero, no una app de consumo. La transparencia (cristal) sobre los números reales de recaudo y cartera es el trabajo del sistema; la calma de un puerto (bahía) es su temperamento. Nada aquí compite por atención — el dato es el protagonista, la interfaz es el marco que lo sostiene sin decorarlo.

El sistema rechaza explícitamente lo lúdico: sin ilustraciones, sin mascotas, sin gradientes decorativos, sin gamificación. Es la herramienta que usa Cartera y Gerencia varias horas al día para conciliar plan de pagos contra recaudo real y fideicomisos — cualquier elemento que no sirva a esa lectura es ruido.

**Key Characteristics:**
- Neutros teñidos de teal (195°) en vez de grises planos — cohesión de marca sin ser "colorido"
- Un color = un significado: los 5 tokens de estado (success/danger/warning/info/neutral) nunca se reasignan a otro propósito
- Elevación discreta pero real — teñida del matiz de marca, no negro plano — nunca skeuomórfica
- Tipografía de dos voces: Lexend (encabezados, con carácter) + Source Sans 3 (datos, neutral y legible)

## 2. Colors

La paleta es **restrained**: el teal de marca aparece con moderación (acentos, estados activos, botones primarios), nunca como fondo de superficies grandes — el navy del logo queda reservado para acentos puntuales, no para reemplazar la tinta principal.

### Primary
- **Harbor Teal** (#0e7581): extraído del cyan-teal del logo real de Baía Kristal. Botones primarios, estados de navegación activos, focus rings, enlaces de acción.
- **Harbor Teal Strong** (#0a4f57): hover/active de todo lo anterior.
- **Harbor Teal Soft** (#d6f2f5) / **Harbor Teal Tint** (#f4fafb): fondos tenues para resaltar sin gritar (fila seleccionada, chip de filtro activo, tarjeta de "periodo" en Resumen Gerencial).

### Secondary
- **Logo Navy** (#001c5c): el navy dominante del logo, reservado como acento puntual (nunca como fondo de superficie grande — competiría con el resto de la paleta neutra).

### Neutral
- **Ink** (oklch(0.208 0.016 195), ≈ #1c2e30): títulos y valores prominentes (KPIs). Teñido de teal, no negro puro.
- **Surface** (#ffffff): tarjetas, paneles, sidebar.
- **Surface Base** (oklch(0.984 0.006 195), ≈ #fafcfc): fondo de contenido principal — "bruma teal", no blanco plano.
- **Border** (oklch(0.929 0.012 195)) / **Border Soft** (oklch(0.960 0.009 195)): bordes de tarjetas y separadores internos de tabla, respectivamente.
- La rampa `slate-50…950` completa de Tailwind está re-teñida al mismo matiz 195° — cualquier `text-slate-*`/`border-slate-*`/`bg-slate-*` de la app hereda esta cohesión automáticamente.

### Estados del dominio (semántico, no decorativo)
- **Success** (texto #047857 / fondo #ecfdf5 / borde #a7f3d0): al día, escriturado, vigente.
- **Danger** (texto #b91c1c / fondo #fef2f2 / borde #fecaca): mora, vencido, cancelado.
- **Warning** (texto #b45309 / fondo #fffbeb / borde #fde68a): pendiente, por revisar.
- **Info** (texto #1d4ed8 / fondo #eff6ff / borde #bfdbfe): en proceso, trámite, gestión.
- **Neutral** (texto slate-600 / fondo slate-100): inactivo o sin estado.

### Named Rules
**The One Meaning Rule.** Un color = un significado, siempre. `danger` es SIEMPRE mora/cancelado, nunca "botón destructivo genérico"; `success` es SIEMPRE al día, nunca "acción completada" sin relación al dominio. Los 5 tokens de estado no se piden prestados para otro uso.

**The No Big Teal Rule.** El Harbor Teal no cubre superficies grandes (fondos de página, tarjetas completas). Aparece en botones, acentos, bordes activos y tintes sutiles — nunca como bloque de color dominante.

## 3. Typography

**Heading Font:** Lexend (con system-ui, sans-serif de respaldo)
**Body Font:** Source Sans 3 (con system-ui, sans-serif de respaldo)
**Mono Font:** ui-monospace, SFMono-Regular, Menlo (referencias, IDs de movimiento)

**Character:** Dos voces deliberadamente distintas — Lexend tiene más carácter geométrico para títulos y KPIs (algo de peso, sin ser display llamativo), Source Sans 3 es neutral y altamente legible para las tablas de datos que dominan casi toda la app.

### Hierarchy
- **Heading** (Lexend, bold/700, 15–25px según contexto): títulos de sección, valores de KPI. El tamaño de KPI (25px) es el techo — no hay nada más grande en el sistema; no hay "hero numbers" gigantes.
- **Body** (Source Sans 3, regular, 14–16px): texto de tablas, formularios, contenido general.
- **Label** (Source Sans 3, semibold/600, 13px, tracking 0.4px, mayúsculas): encabezados de sección discretos (`.section-label`), etiquetas de filtro. Uppercase pero sutil — nunca la eyebrow decorativa de marketing.

### Named Rules
**The No Hero Numbers Rule.** El tamaño de fuente más grande de todo el sistema es 25px (valor de KpiCard). Este no es un dashboard de marketing con métricas gigantes — es una herramienta de trabajo donde la densidad de información importa más que el impacto visual de un solo número.

## 4. Elevation

El sistema es **casi plano por defecto, con una capa de profundidad real pero discreta** — no hay sombras dramáticas ni capas skeuomórficas, pero tampoco es plano-sin-matices: la escala de 3 niveles se tiñe del matiz de marca (195°, teal) en vez de negro puro, para que la sombra se sienta parte de la paleta y no "pegada encima" con un plugin genérico.

### Shadow Vocabulary
- **Card** (`box-shadow: 0 1px 3px 0 rgb(14 117 129 / 0.08), 0 1px 2px -1px rgb(14 117 129 / 0.06)`): estado de reposo de toda tarjeta (`.card`). Apenas perceptible — separa la tarjeta del fondo sin llamar la atención.
- **Raised** (`box-shadow: 0 4px 12px -2px rgb(14 117 129 / 0.14), 0 2px 4px -2px rgb(14 117 129 / 0.08)`): hover de tarjetas interactivas (`.card-interactive`) — KPIs clicables, ítems de lista navegables.
- **Overlay** (`box-shadow: 0 16px 32px -8px rgb(10 79 87 / 0.22), 0 4px 8px -4px rgb(10 79 87 / 0.10)`): menús desplegables, popovers, cualquier elemento flotante sobre el contenido.

### Named Rules
**The Tinted Shadow Rule.** Ninguna sombra usa negro puro (`rgba(0,0,0,...)`). Todas se tiñen con el matiz de marca (195°, usando el hex de Harbor Teal/Harbor Teal Strong como base del rgb) — la profundidad visual queda integrada a la paleta, no es un añadido genérico de librería.

## 5. Components

### Buttons
- **Shape:** esquinas de 8px (`rounded-lg` de Tailwind).
- **Primary** (`.btn-primary`): fondo Harbor Teal, texto blanco, padding 8px×16px.
- **Hover:** fondo Harbor Teal Strong — transición de color simple, sin movimiento.
- **Secondary** (`.btn-secondary`): fondo blanco, texto slate-700, borde `--border`; hover a Surface Base.
- **Focus:** ring de 2px en Harbor Teal, con offset — visible pero no invasivo.

### Badges
- **Style:** píldora completa (`rounded-full`), fondo tenue del token de estado + texto del mismo token + borde a juego. Nunca color sólido saturado de fondo — siempre la versión "bg" tenue de los 5 tokens semánticos.
- **State:** un badge por estado del dominio, nunca decorativo puro.

### Cards / Containers
- **Corner Style:** 12px (`rounded-xl`).
- **Background:** blanco puro (Surface).
- **Shadow Strategy:** ver sección Elevation — `.card` en reposo, `.card-interactive` con lift al hover para las que son clicables.
- **Border:** 1px, color `--border`.
- **Internal Padding:** 16px (KpiCard) a 20px (secciones de página), según densidad de contenido.

### Inputs / Fields
- **Style:** borde `--border`, fondo Surface, esquinas 8px.
- **Focus:** ring de 2px Harbor Teal + borde transparente (el ring reemplaza visualmente al borde en foco).

### Navigation (Sidebar)
- **Style:** ancho de 212px, cada ítem es una fila ícono + etiqueta de texto (no icon-only) — la etiqueta identifica el módulo, así que un solo acento (Harbor Teal) basta para todos; no hace falta un color distinto por módulo para reconocerlos.
- **Active state:** barra de 3px de Harbor Teal a la izquierda + fondo tenue (`{color}1a`, 10% de opacidad) + ícono y texto en Harbor Teal sólido.
- **Default state:** ícono y texto al 60% de opacidad de Harbor Teal (`{color}99`) — visible pero claramente secundario frente al activo.
- **Hover:** micro-escala del ícono (110%), sin cambio de color — el color solo comunica "activo", no "hover".

### Named Rules
**The Single Accent Nav Rule.** El sidebar usa un solo color (Harbor Teal) para todos los estados activos, nunca un color distinto por módulo. La etiqueta de texto es la que distingue módulos, no el color.

## 6. Do's and Don'ts

### Do:
- **Do** teñir cualquier neutro nuevo (gris, sombra, overlay) hacia el matiz 195° de la marca — nunca gris/negro plano sin tinte.
- **Do** usar los 5 tokens de estado (success/danger/warning/info/neutral) para CUALQUIER indicador de estado del dominio, sin inventar variantes nuevas.
- **Do** mantener Lexend exclusivo a encabezados/KPIs y Source Sans 3 para todo el resto — no mezclar para "variar".
- **Do** usar la escala de sombra teñida (Card/Raised/Overlay) para cualquier elevación nueva.

### Don't:
- **Don't** usar ilustraciones decorativas, mascotas o iconografía juguetona — anti-referencia explícita del producto (PRODUCT.md: "nada lúdico, colorido o gamificado al estilo de apps de consumo").
- **Don't** usar Harbor Teal como fondo de una superficie grande (página completa, tarjeta entera) — solo acentos, botones y tintes sutiles.
- **Don't** introducir un número "hero" de gran tamaño (>25px) en ningún KPI o valor destacado — esto no es un dashboard de marketing.
- **Don't** usar sombras con negro puro (`rgba(0,0,0,...)`) — rompe la cohesión de la paleta teñida.
- **Don't** usar `border-left`/`border-right` de más de 1px como acento de color en tarjetas o alertas (excepción deliberada y ya establecida: la barra activa de 3px del Sidebar, que es un patrón de navegación, no una tarjeta de contenido).
