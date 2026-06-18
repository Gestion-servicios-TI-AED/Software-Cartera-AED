import React from 'react';
import { NavLink, useLocation } from 'react-router-dom';
import { LayoutDashboard, FolderOpen, ArrowLeftRight, Briefcase, BarChart3, Settings } from 'lucide-react';

// Cada sección tiene su propio color para diferenciarse de un vistazo.
// El ítem activo se rellena con su color; inactivo lo muestra atenuado.
const NAV_ITEMS = [
  { to: '/', Icon: Briefcase, label: 'Negocios', color: '#0f766e', exact: true },
  { to: '/oportunidades', Icon: LayoutDashboard, label: 'Oportunidades', color: '#0284c7', exact: true },
  { to: '/fiducia', Icon: FolderOpen, label: 'Encargos', color: '#7c3aed' },
  { to: '/fiducia/movimientos', Icon: ArrowLeftRight, label: 'Movimientos', color: '#d97706' },
  { to: '/resumen', Icon: BarChart3, label: 'Resumen', color: '#059669', exact: true },
];

function SidebarItem({ to, Icon, label, color, exact }) {
  const location = useLocation();
  const isActive = exact
    ? location.pathname === to
    : location.pathname.startsWith(to) &&
      !(to === '/fiducia' && location.pathname === '/fiducia/movimientos');

  return (
    <div className="relative w-full flex justify-center group">
      {isActive && (
        <span
          className="absolute left-0 top-[6px] bottom-[6px] w-[3px] rounded-r"
          style={{ backgroundColor: color }}
        />
      )}
      <NavLink
        to={to}
        title={label}
        aria-label={label}
        className="w-10 h-10 rounded-[10px] flex items-center justify-center transition-colors"
        style={
          isActive
            ? { backgroundColor: `${color}1a`, color }
            : { color: `${color}99` }
        }
      >
        <Icon
          size={18}
          strokeWidth={1.9}
          className="transition-transform group-hover:scale-110"
        />
      </NavLink>
    </div>
  );
}

export default function Sidebar() {
  return (
    <aside className="w-[60px] bg-white border-r border-aed-border flex flex-col items-center py-4 gap-1.5 flex-shrink-0 h-screen sticky top-0">
      <div className="w-9 h-9 rounded-[10px] bg-gradient-to-br from-brand to-brand-strong flex items-center justify-center text-white font-heading font-bold text-[16px] mb-2 flex-shrink-0">
        A
      </div>

      {NAV_ITEMS.map((item) => (
        <SidebarItem key={item.to} {...item} />
      ))}

      <div className="w-7 h-px bg-slate-200 my-1" />

      <div className="w-10 h-10 rounded-[10px] flex items-center justify-center text-slate-400 hover:bg-slate-100 hover:text-slate-600 cursor-pointer transition-colors">
        <Settings size={18} strokeWidth={1.9} />
      </div>

      <div className="mt-auto w-8 h-8 rounded-full bg-gradient-to-br from-brand-soft to-emerald-100 flex items-center justify-center text-[13px] font-bold text-brand-strong flex-shrink-0">
        RG
      </div>
    </aside>
  );
}
