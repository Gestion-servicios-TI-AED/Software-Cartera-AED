---
name: Cartera AED
description: Sistema interno de seguimiento de planes de pago, recaudos y encargos fiduciarios para AED.
colors:
  azul-aed: "#3b82f6"
  azul-aed-profundo: "#2563eb"
  azul-aed-suave: "#eff6ff"
  indigo-aed: "#4f46e5"
  papel-helado: "#f8faff"
  linea-regla: "#e8f0fe"
  tinta: "#0f172a"
  carbon: "#1e293b"
  pizarra: "#334155"
  pizarra-apagada: "#94a3b8"
  superficie: "#ffffff"
  alerta-ambar: "#d97706"
  ambar-suave: "#fffbeb"
  ambar-borde: "#fde68a"
  verde-recaudo: "#16a34a"
  verde-suave: "#f0fdf4"
  verde-borde: "#bbf7d0"
  rojo-cierre: "#e11d48"
  rojo-suave: "#fff1f2"
  rojo-borde: "#fecdd3"
  violeta-fiducia: "#7c3aed"
  violeta-suave: "#faf5ff"
  violeta-borde: "#ddd6fe"
typography:
  title:
    fontFamily: "Inter, system-ui, sans-serif"
    fontSize: "15px"
    fontWeight: 700
    lineHeight: 1.3
    letterSpacing: "normal"
  body:
    fontFamily: "Inter, system-ui, sans-serif"
    fontSize: "13px"
    fontWeight: 400
    lineHeight: 1.5
    letterSpacing: "normal"
  body-medium:
    fontFamily: "Inter, system-ui, sans-serif"
    fontSize: "13px"
    fontWeight: 500
    lineHeight: 1.5
    letterSpacing: "normal"
  label:
    fontFamily: "Inter, system-ui, sans-serif"
    fontSize: "11px"
    fontWeight: 500
    lineHeight: 1.4
    letterSpacing: "normal"
  section-label:
    fontFamily: "Inter, system-ui, sans-serif"
    fontSize: "9px"
    fontWeight: 700
    lineHeight: 1.4
    letterSpacing: "0.07em"
  kpi-value:
    fontFamily: "Inter, system-ui, sans-serif"
    fontSize: "22px"
    fontWeight: 700
    lineHeight: 1.1
    letterSpacing: "-0.02em"
rounded:
  indicator: "4px"
  sm: "8px"
  md: "10px"
  lg: "12px"
  full: "9999px"
spacing:
  xs: "4px"
  sm: "8px"
  md: "12px"
  lg: "16px"
  xl: "20px"
components:
  button-primary:
    backgroundColor: "{colors.azul-aed}"
    textColor: "{colors.superficie}"
    rounded: "{rounded.sm}"
    padding: "8px 16px"
  button-primary-hover:
    backgroundColor: "{colors.azul-aed-profundo}"
    textColor: "{colors.superficie}"
    rounded: "{rounded.sm}"
    padding: "8px 16px"
  button-secondary:
    backgroundColor: "{colors.superficie}"
    textColor: "{colors.pizarra}"
    rounded: "{rounded.sm}"
    padding: "8px 16px"
  button-secondary-hover:
    backgroundColor: "{colors.papel-helado}"
    textColor: "{colors.pizarra}"
    rounded: "{rounded.sm}"
    padding: "8px 16px"
  card:
    backgroundColor: "{colors.superficie}"
    rounded: "{rounded.lg}"
    padding: "16px"
  input:
    backgroundColor: "{colors.papel-helado}"
    textColor: "{colors.tinta}"
    rounded: "{rounded.sm}"
    padding: "8px 12px"
  badge:
    rounded: "{rounded.full}"
    padding: "2px 10px"
---

# Design System: Cartera AED

## 1. Overview

**Creative North Star: "El Libro Mayor"**

El Libro Mayor es una herramienta que no se contempla: se usa. El sistema visual traduce ese principio a cada decisión: fondo de papel casi blanco con un matiz azul apenas perceptible, bordes de regla suave, superficies blancas que respiran, y un único acento —Azul AED— reservado para lo que el usuario debe tocar o reconocer. No existe decoración sin función.

La paleta de estado (ámbar, verde, rojo, violeta) no es ornamental. Cada color nombra una condición financiera específica: en qué etapa está el negocio, si el recaudo avanza, si el cierre es positivo o negativo. La jerarquía tipográfica es densa pero legible: Inter en cuatro pesos, escala fija de 9 a 22 px, sin familias display que compitan con los datos.

El sistema rechaza explícitamente: dashboards con degradados agresivos o métricas gigantes que decoran en lugar de informar, navegación con menús anidados, efectos de cristal (glassmorphism), motion sin propósito de estado, y cualquier estética que haga al usuario notar la interfaz antes de notar el dato.

**Key Characteristics:**
- Paleta contenida: un acento funcional, neutros calibrados, vocabulario semántico de cuatro estados
- Single-family typography: Inter en 400/500/600/700, escala fija para densidad cómoda
- Elevación mínima: plano por defecto; shadow-sm es el techo
- El color comunica estado, no personalidad
- La herramienta se retira: el sistema desaparece; los datos quedan

## 2. Colors: La Paleta del Libro Mayor

Un fondo de papel con tinte azul mínimo, un solo acento funcional, y un vocabulario semántico completo para los estados del pipeline financiero.

### Primary
- **Azul AED** (#3b82f6): El único acento funcional del sistema. Aparece en botones primarios, el indicador activo del sidebar, los anillos de foco de inputs, y menciones de énfasis puntual. Su presencia limitada es lo que le da autoridad.
- **Azul AED Profundo** (#2563eb): Estado hover de Azul AED en acciones interactivas. Nunca aparece en reposo.
- **Azul AED Suave** (#eff6ff): Fondo del estado activo en el sidebar y fondos de iconos de categoría azul en KPI cards. Siempre acompañado de Azul AED como color de texto o icono.

### Secondary
- **Índigo AED** (#4f46e5): Reservado para el degradado del logotipo y el avatar de usuario. No se usa como color de acción, acento decorativo ni color de estado.

### Tertiary — Vocabulario Semántico de Pipeline
Cuatro colores de estado. Cada uno existe en versión sólida, fondo suave, y borde tintado. Nunca se usan fuera de contexto semántico.

- **Alerta Ámbar** (#d97706) / Fondo `#fffbeb` / Borde `#fde68a`: Etapas iniciales y medias de negociación, KPI de negocios en proceso.
- **Verde Recaudo** (#16a34a) / Fondo `#f0fdf4` / Borde `#bbf7d0`: Cierre ganado, recaudos positivos, métricas de éxito financiero.
- **Rojo Cierre** (#e11d48) / Fondo `#fff1f2` / Borde `#fecdd3`: Etapas de negociación final o cierre perdido con indicación de riesgo.
- **Violeta Fiducia** (#7c3aed) / Fondo `#faf5ff` / Borde `#ddd6fe`: Encargos fiduciarios y su categoría de KPI.

### Neutral
- **Papel Helado** (#f8faff): Fondo del cuerpo de la aplicación. Near-white con matiz azul de chroma mínima. Nunca warm-tinted.
- **Línea de Regla** (#e8f0fe): Color de todos los bordes estructurales: cards, inputs, sidebar, divisores horizontales.
- **Tinta** (#0f172a): Texto principal en tabla, valores de campos, body copy. Contraste mínimo 4.5:1 requerido sobre cualquier fondo.
- **Carbón** (#1e293b): Títulos de página en topbar, valores de KPI grandes, encabezados de sección.
- **Pizarra** (#334155): Texto de botones secundarios, etiquetas de columna en tablas, texto descriptivo de segundo nivel.
- **Pizarra Apagada** (#94a3b8): Etiquetas de métricas bajo valores KPI, section labels, placeholders de input. Verificar contraste ≥4.5:1 antes de usar sobre fondos que no sean Superficie o Papel Helado.
- **Superficie** (#ffffff): Fondo de todas las cards, inputs en estado editable, sidebar, topbar.

**The One Accent Rule.** Azul AED aparece en botones primarios, el indicador del sidebar activo, y anillos de foco. En ningún otro contexto como decoración. Su escasez es su autoridad.

**The Semantic State Rule.** Los cuatro colores de estado (ámbar, verde, rojo, violeta) existen para nombrar condiciones del pipeline financiero. Si un elemento no comunica un estado de negocio o categoría financiera, no usa un color de estado.

## 3. Typography

**Body / UI Font:** Inter (Google Fonts, weights 400, 500, 600, 700)

**Character:** Una sola familia en cuatro pesos. El contraste de jerarquía proviene del peso y el tamaño, no de la familia tipográfica. Inter es suficientemente neutro para desaparecer en tablas de datos densos y suficientemente calibrado para mantener legibilidad en 9 px.

### Hierarchy
- **KPI Value** (700, 22px, line-height 1.1, letter-spacing -0.02em): Valores de métricas principales. El número más prominente de cada tarjeta de dashboard.
- **Title** (700, 15px, line-height 1.3): Título de página en el topbar. Uno por vista.
- **Body Medium** (500, 13px, line-height 1.5): Etiquetas de columna en tabla, texto de controles, texto de acciones.
- **Body** (400, 13px, line-height 1.5): Contenido de tablas, valores de campos, texto descriptivo.
- **Label** (500, 11px, line-height 1.4): Etiquetas de KPI bajo los valores grandes, notas secundarias bajo acciones.
- **Section Label** (700, 9px, line-height 1.4, letter-spacing 0.07em, UPPERCASE): Separadores de grupo en paneles de detalle. Máximo 4 palabras. Exclusivo para paneles de detalle; prohibido como kicker sobre headings de página.

**The Fixed Scale Rule.** No usar clamp() en tipografía de producto. La escala es fija: 9 / 11 / 13 / 15 / 22 px. Los usuarios trabajan a DPI consistente; la escala fluida en un sidebar produce resultados impredecibles.

**The Data Priority Rule.** Cuando texto compite con un número en la misma tarjeta o fila, el número gana en peso y tamaño. Las etiquetas acompañan, no compiten.

## 4. Elevation

Plano por defecto. Los bordes (Línea de Regla, #e8f0fe) manejan la separación estructural entre regiones. Las cards usan `shadow-sm` como señal ambiental suave de superficie elevada, no como afirmación de profundidad. No existe nivel de sombra más pronunciado en el sistema.

### Shadow Vocabulary
- **Surface Ambient** (`box-shadow: 0 1px 2px 0 rgba(0, 0, 0, 0.05)`): El único nivel de sombra del sistema. Exclusivo para cards y paneles de contenido en reposo.

**The Flat-By-Default Rule.** Las superficies son planas en reposo. Surface Ambient es el techo de elevación. Sin sombra hover sobre cards, sin sombra dramática sobre modales, sin drop-shadow sobre iconos o badges.

## 5. Components

### Buttons
Predecibles y consistentes en todo el sistema. Forma idéntica en todos los tipos: 8px radius.

- **Shape:** Levemente curvo (8px), uniforme en todos los tipos de botón.
- **Primary:** Azul AED (#3b82f6) de fondo, Superficie (#fff) de texto, padding 8px 16px, Inter 500 13px. Hover: Azul AED Profundo (#2563eb). Focus: anillo azul 2px, offset 2px.
- **Secondary:** Superficie (#fff) de fondo, Pizarra (#334155) de texto, borde Línea de Regla (#e8f0fe). Hover: Papel Helado (#f8faff) de fondo.
- **Disabled:** 50% opacity, cursor not-allowed. Sin cambios de forma.
- **Transitions:** 150ms ease en background-color y color.

### Cards / Containers
- **Corner Style:** Generosamente curvo (12px, `rounded-xl`)
- **Background:** Superficie (#ffffff)
- **Shadow Strategy:** Surface Ambient exclusivamente. Ver Sección 4.
- **Border:** Línea de Regla (#e8f0fe), 1px solid
- **Internal Padding:** 16px uniforme. Las KPI cards usan flex-column con gap 4px para la secuencia icono → etiqueta → valor.

### Inputs / Fields
- **Style:** Fondo Papel Helado (#f8faff), borde Línea de Regla (#e8f0fe), radio 8px. El fondo de input coincide con el fondo del body para integración natural.
- **Focus:** Borde cambia a Azul AED (#3b82f6) + ring suave `0 0 0 2px rgba(59,130,246,0.2)`.
- **Placeholder:** Pizarra Apagada (#94a3b8). Verificar contraste ≥4.5:1 sobre Papel Helado.
- **Padding con ícono:** pl-9 (36px) cuando hay un ícono de búsqueda a la izquierda.

### Navigation — Sidebar
- **Style:** 60px de ancho fijo, icon-only, fondo Superficie (#ffffff), borde derecho Línea de Regla.
- **Logo:** 36×36px, `border-radius: 10px`, degradado de Azul AED (#3b82f6) a Índigo AED (#4f46e5).
- **Item default:** Hit area 40×40px, `border-radius: 10px`, icono 18px Pizarra Apagada (#94a3b8), stroke-width 1.75.
- **Item hover:** Fondo Papel Helado (#f8faff), icono Pizarra (#475569).
- **Item active:** Fondo Azul AED Suave (#eff6ff), icono Azul AED (#3b82f6) + indicador vertical 3px Azul AED en borde izquierdo con `border-radius: 0 4px 4px 0`.
- **Transitions:** 150ms ease en background-color y color.

### Stage Badge (Signature Component)
El componente semántico central. Cada badge comunica la etapa de pipeline de un negocio con color, borde y punto indicador.

- **Shape:** Pill completo (`border-radius: 9999px`), padding 2px 8px, texto 10px/600.
- **Leading indicator:** Círculo sólido 5px, mismo color que el texto del badge.
- **Palette:** Los cuatro colores semánticos + Closed Lost (neutral slate). Los pares de fondo y borde siempre aparecen juntos.
- **Interacción:** Ninguna. Puramente informativo.

### Section Label
- **Style:** 9px/700, UPPERCASE, letter-spacing 0.07em, Pizarra Apagada (#94a3b8).
- **Uso permitido:** Separadores de grupo dentro de paneles de detalle (OpportunityDetail, ApartamentoDetalle).
- **Uso prohibido:** Headers de página, kickers sobre headings, body copy.

## 6. Do's and Don'ts

### Do:
- **Do** reservar Azul AED (#3b82f6) para botones primarios, indicador activo del sidebar, y anillo de foco. Nada más.
- **Do** usar los cuatro colores semánticos (ámbar, verde, rojo, violeta) únicamente cuando nombran un estado de pipeline o categoría financiera. Siempre en trio: color sólido, fondo suave, borde tintado.
- **Do** verificar contraste ≥4.5:1 antes de usar Pizarra Apagada (#94a3b8) sobre cualquier fondo distinto de Superficie (#fff) o Papel Helado (#f8faff).
- **Do** mantener Shadow-sm como techo de elevación. Usar bordes Línea de Regla para separación estructural.
- **Do** etiquetar todos los botones con verbo + objeto: "Sincronizar datos", "Cargar Excel", "Ver movimientos".
- **Do** mantener `border-radius: 8px` uniforme en todos los controles interactivos (botones, inputs, selects).
- **Do** usar Inter únicamente. La jerarquía sale del peso y el tamaño, no de la familia.

### Don't:
- **Don't** usar degradados como fondos de card, sección o métrica. El degradado Azul AED → Índigo AED existe únicamente para el logotipo y el avatar.
- **Don't** crear menús anidados ni profundidad de navegación mayor a dos niveles. El sidebar es icon-only por principio.
- **Don't** usar los colores de estado semántico (ámbar, verde, rojo, violeta) como acentos decorativos, fondos de región, o separadores visuales.
- **Don't** usar `border-left` mayor a 1px como acento de color en cards o list items. Reescribir con fondo tintado o sin decoración.
- **Don't** usar glassmorphism (backdrop-filter + fondo translúcido) en ningún componente.
- **Don't** agregar motion sin propósito de estado. Sin page-load sequences, sin stagger decorativo, sin entrance animations en secciones de datos. Las transiciones son de estado: hover, focus, loading.
- **Don't** superar Shadow-sm. Sin sombra de hover que amplifique cards, sin sombra dramática sobre modales.
- **Don't** anidar cards. Una card dentro de otra siempre es un error de estructura.
- **Don't** usar Section Label como kicker sobre headings de página ni en body copy.
- **Don't** usar display fonts, scripts, o tipografía decorativa en ningún contexto del sistema. Inter es la única familia.
