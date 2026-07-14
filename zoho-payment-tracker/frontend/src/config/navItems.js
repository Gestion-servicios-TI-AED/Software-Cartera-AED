import { LayoutDashboard, FolderOpen, ArrowLeftRight, Briefcase, BarChart3, Warehouse } from 'lucide-react';

// Ítems del menú lateral. Fuente única para Sidebar y Ajustes.
// `key` es el identificador estable usado para guardar la preferencia de visibilidad.
// Cada sección tiene su propio color para diferenciarse de un vistazo.
export const NAV_ITEMS = [
  { key: 'negocios',      to: '/',                    Icon: Briefcase,       label: 'Negocios',      color: '#0f766e', exact: true },
  { key: 'oportunidades', to: '/oportunidades',       Icon: LayoutDashboard, label: 'Oportunidades', color: '#0284c7', exact: true },
  { key: 'inventario',    to: '/inventario',          Icon: Warehouse,       label: 'Inventario',    color: '#be123c', exact: true },
  { key: 'encargos',      to: '/fiducia',             Icon: FolderOpen,      label: 'Encargos',      color: '#7c3aed' },
  { key: 'movimientos',   to: '/fiducia/movimientos', Icon: ArrowLeftRight,  label: 'Movimientos',   color: '#d97706' },
  { key: 'resumen',       to: '/resumen',             Icon: BarChart3,       label: 'Resumen',       color: '#059669', exact: true },
];
