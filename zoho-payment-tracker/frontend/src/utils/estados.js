// Mapeo central de estados del dominio → token semántico de color.
// Principio: "un color = un significado". Ver spec
// docs/superpowers/specs/2026-06-18-color-clarity-refresh-design.md
//
// Reemplaza la función `estadoColor` que estaba duplicada en las vistas.
// Los iconos se exportan como referencias (sin renderizar) para que los
// componentes los rendericen; este archivo permanece libre de JSX.

import { CheckCircle2, AlertOctagon, Clock, RefreshCw, MinusCircle } from 'lucide-react';

// Metadata por token: clases Tailwind (resueltas vía CSS vars en tailwind.config)
// + ícono representativo + glosa en lenguaje simple para tooltips/leyendas.
export const ESTADO_TOKENS = {
  success: {
    badge: 'bg-success-bg text-success border border-success-border',
    dot: 'bg-success',
    text: 'text-success',
    Icon: CheckCircle2,
    glosa: 'Al día: el negocio está vigente, escriturado o con abonos al corriente.',
  },
  danger: {
    badge: 'bg-danger-bg text-danger border border-danger-border',
    dot: 'bg-danger',
    text: 'text-danger',
    Icon: AlertOctagon,
    glosa: 'Crítico: en mora, vencido, cancelado o rescindido.',
  },
  warning: {
    badge: 'bg-warning-bg text-warning border border-warning-border',
    dot: 'bg-warning',
    text: 'text-warning',
    Icon: Clock,
    glosa: 'Requiere atención: pendiente o por revisar.',
  },
  info: {
    badge: 'bg-info-bg text-info border border-info-border',
    dot: 'bg-info',
    text: 'text-info',
    Icon: RefreshCw,
    glosa: 'En proceso: promesa, trámite o gestión en curso.',
  },
  neutral: {
    badge: 'bg-slate-100 text-slate-600 border border-slate-200',
    dot: 'bg-slate-400',
    text: 'text-slate-600',
    Icon: MinusCircle,
    glosa: 'Inactivo o sin información de estado.',
  },
};

// Clasifica un string de estado del dominio en un token.
export function estadoToken(estado) {
  if (!estado) return 'neutral';
  const e = String(estado).toLowerCase();
  if (/(mora|vencid|cancel|rescili|rescind|anulad)/.test(e)) return 'danger';
  if (/(escritur|activo|vigente|prometid|al d[ií]a|aplicad)/.test(e)) return 'success';
  if (/(pendiente|revers|por revisar)/.test(e)) return 'warning';
  if (/(promes|proceso|tr[aá]mite|libre|gesti[oó]n)/.test(e)) return 'info';
  return 'neutral';
}

// Clases del badge listas para usar (drop-in para la antigua `estadoColor`).
export function estadoBadgeClass(estado) {
  return ESTADO_TOKENS[estadoToken(estado)].badge;
}

// Metadata completa del estado (ícono, glosa, clases).
export function estadoMeta(estado) {
  return ESTADO_TOKENS[estadoToken(estado)];
}

// ── Paleta categórica (gráficas y diferenciación no semántica) ──────────────
// 8 hues accesibles que no chocan entre sí. Consumir en orden.
export const CATEGORICAL = [
  '#0e7581', // teal (marca)
  '#0284c7', // sky
  '#7c3aed', // violet
  '#d97706', // amber
  '#059669', // emerald
  '#e11d48', // rose
  '#4f46e5', // indigo
  '#c026d3', // fuchsia
];

export function categoricalColor(i) {
  return CATEGORICAL[i % CATEGORICAL.length];
}
