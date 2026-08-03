import { Target, Landmark, ArrowLeftRight, Briefcase, BarChart3, Building2, LineChart, AlertTriangle } from 'lucide-react';

// Ítems del menú lateral. Fuente única para Sidebar y Ajustes.
// `key` es el identificador estable usado para guardar la preferencia de visibilidad.
//
// Un solo acento (Harbor Teal, el color real de marca) para todo el menú --
// antes cada módulo tenía su propio color "arcoíris" (rosa, violeta, ámbar…)
// que no salía de la paleta documentada y se sentía poco sobrio en un
// sidebar ancho con etiquetas de texto visibles. La etiqueta ya distingue
// cuál módulo es cuál; el color solo comunica "activo", no identidad.
const BRAND_ACCENT = '#0e7581';

// Elección de íconos -- cada uno representa literalmente el contenido del
// módulo, no una metáfora genérica de dashboard:
//   Oportunidades → Target (pipeline de ventas de Zoho, no un dashboard cualquiera)
//   Inmuebles     → Building2 (son inmuebles/apartamentos, no cajas de bodega)
//   Encargos      → Landmark (encargos FIDUCIARIOS -- institución financiera/trust)
//   Dashboard     → LineChart (la página es literalmente Plan vs. Recaudo en el tiempo)
export const NAV_ITEMS = [
  { key: 'negocios',      to: '/',                    Icon: Briefcase,      label: 'Negocios',      color: BRAND_ACCENT, exact: true },
  { key: 'oportunidades', to: '/oportunidades',       Icon: Target,         label: 'Oportunidades', color: BRAND_ACCENT, exact: true },
  { key: 'inventario',    to: '/inventario',          Icon: Building2,      label: 'Inmuebles',     color: BRAND_ACCENT, exact: true },
  { key: 'encargos',      to: '/fiducia',             Icon: Landmark,       label: 'Encargos',      color: BRAND_ACCENT },
  { key: 'movimientos',   to: '/fiducia/movimientos', Icon: ArrowLeftRight, label: 'Movimientos',   color: BRAND_ACCENT },
  { key: 'resumen',       to: '/resumen',             Icon: BarChart3,      label: 'Resumen',       color: BRAND_ACCENT, exact: true },
  { key: 'dashboard',     to: '/dashboard',           Icon: LineChart,      label: 'Dashboard',     color: BRAND_ACCENT, exact: true },
  { key: 'cartera-mora',  to: '/cartera-mora',        Icon: AlertTriangle,  label: 'Cartera',       color: BRAND_ACCENT, exact: true },
];
