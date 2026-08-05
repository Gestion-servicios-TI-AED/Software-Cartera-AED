import { Target, Landmark, Banknote, Briefcase, BarChart3, Building2, LineChart, ShieldAlert } from 'lucide-react';

// Ítems del menú lateral, separados por proyecto. El Sidebar filtra ambas
// listas por los permisos del usuario logueado (ver utils/usuarioActual.js)
// y las agrupa visualmente por proyecto -- ya no hay un selector manual de
// "proyecto activo": lo que se ve depende exclusivamente de qué módulos
// tenga permitidos esa persona (ver Ajustes → Usuarios y permisos).
// `key` es el identificador que también usa el backend para el enforcement
// por módulo (ver backend/src/config/modulos.js -- debe mantenerse igual).
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
//   Movimientos   → Banknote (movimientos bancarios/de dinero, más financiero que unas flechas genéricas)
//   Dashboard     → LineChart (la página es literalmente Plan vs. Recaudo en el tiempo)
//   Cartera       → ShieldAlert (cartera en gestión/mora -- "atención, vigilar", sin ser un ícono de error crudo)
export const NAV_ITEMS_BAIA_KRISTAL = [
  { key: 'negocios',      to: '/',                    Icon: Briefcase,      label: 'Negocios',      color: BRAND_ACCENT, exact: true },
  { key: 'oportunidades', to: '/oportunidades',       Icon: Target,         label: 'Oportunidades', color: BRAND_ACCENT, exact: true },
  { key: 'inventario',    to: '/inventario',          Icon: Building2,      label: 'Inmuebles',     color: BRAND_ACCENT, exact: true },
  { key: 'encargos',      to: '/fiducia',             Icon: Landmark,       label: 'Encargos',      color: BRAND_ACCENT },
  { key: 'movimientos',   to: '/fiducia/movimientos', Icon: Banknote,       label: 'Movimientos',   color: BRAND_ACCENT },
  { key: 'resumen',       to: '/resumen',             Icon: BarChart3,      label: 'Resumen',       color: BRAND_ACCENT, exact: true },
  { key: 'dashboard',     to: '/dashboard',           Icon: LineChart,      label: 'Dashboard',     color: BRAND_ACCENT, exact: true },
  { key: 'cartera-mora',  to: '/cartera-mora',        Icon: ShieldAlert,    label: 'Cartera',       color: BRAND_ACCENT, exact: true },
];

// Alegra -- tendrá los mismos módulos que Baía Kristal (mismo menú, mismos
// íconos/labels), pero todavía no hay modelo de datos ni parser de Excel
// propio: cada ítem apunta por ahora a una subruta de la misma página
// placeholder (`/alegra/*` en App.jsx), lista para reemplazarse una por una
// sin tener que tocar este menú otra vez cuando se construya cada módulo.
export const NAV_ITEMS_ALEGRA = [
  { key: 'alegra-negocios',      to: '/alegra',                    Icon: Briefcase,   label: 'Negocios',      color: BRAND_ACCENT, exact: true },
  { key: 'alegra-oportunidades', to: '/alegra/oportunidades',       Icon: Target,      label: 'Oportunidades', color: BRAND_ACCENT, exact: true },
  { key: 'alegra-inventario',    to: '/alegra/inventario',          Icon: Building2,   label: 'Inmuebles',     color: BRAND_ACCENT, exact: true },
  { key: 'alegra-encargos',      to: '/alegra/fiducia',             Icon: Landmark,    label: 'Encargos',      color: BRAND_ACCENT },
  { key: 'alegra-movimientos',   to: '/alegra/fiducia/movimientos', Icon: Banknote,    label: 'Movimientos',   color: BRAND_ACCENT },
  { key: 'alegra-resumen',       to: '/alegra/resumen',             Icon: BarChart3,   label: 'Resumen',       color: BRAND_ACCENT, exact: true },
  { key: 'alegra-dashboard',     to: '/alegra/dashboard',           Icon: LineChart,   label: 'Dashboard',     color: BRAND_ACCENT, exact: true },
  { key: 'alegra-cartera-mora',  to: '/alegra/cartera-mora',        Icon: ShieldAlert, label: 'Cartera',       color: BRAND_ACCENT, exact: true },
];

// Lista combinada -- la usa el formulario de usuarios en Ajustes para listar
// los checkboxes de módulos de ambos proyectos en un solo lugar.
export const NAV_ITEMS = [...NAV_ITEMS_BAIA_KRISTAL, ...NAV_ITEMS_ALEGRA];

// Claves de Alegra -- las usa App.jsx para la ruta comodín `/alegra/*`
// (todos sus ítems today apuntan al mismo placeholder, así que basta con
// tener acceso a CUALQUIERA de ellas para entrar).
export const MODULOS_ALEGRA = NAV_ITEMS_ALEGRA.map((item) => item.key);
