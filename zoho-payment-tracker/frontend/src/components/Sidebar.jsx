import React from 'react';
import { NavLink, useLocation } from 'react-router-dom';
import { LayoutDashboard, FolderOpen, ArrowLeftRight, Briefcase, BarChart3, Settings } from 'lucide-react';

const NAV_ITEMS = [
  { to: '/', Icon: Briefcase, label: 'Negocios', exact: true },
  { to: '/oportunidades', Icon: LayoutDashboard, label: 'Oportunidades', exact: true },
  { to: '/fiducia', Icon: FolderOpen, label: 'Encargos' },
  { to: '/fiducia/movimientos', Icon: ArrowLeftRight, label: 'Movimientos' },
  { to: '/resumen', Icon: BarChart3, label: 'Resumen', exact: true },
];

function SidebarItem({ to, Icon, label, exact }) {
  const location = useLocation();
  const isActive = exact
    ? location.pathname === to
    : location.pathname.startsWith(to) &&
      !(to === '/fiducia' && location.pathname === '/fiducia/movimientos');

  return (
    <div className="relative w-full flex justify-center">
      {isActive && (
        <span className="absolute left-0 top-[6px] bottom-[6px] w-[3px] bg-blue-500 rounded-r" />
      )}
      <NavLink
        to={to}
        title={label}
        className={`w-10 h-10 rounded-[10px] flex items-center justify-center transition-colors ${
          isActive
            ? 'bg-blue-50 text-blue-500'
            : 'text-slate-400 hover:bg-slate-50 hover:text-slate-600'
        }`}
      >
        <Icon size={18} strokeWidth={1.75} />
      </NavLink>
    </div>
  );
}

export default function Sidebar() {
  return (
    <aside className="w-[60px] bg-white border-r border-aed-border flex flex-col items-center py-4 gap-1.5 flex-shrink-0 h-screen sticky top-0">
      <div className="w-9 h-9 rounded-[10px] bg-gradient-to-br from-blue-500 to-indigo-600 flex items-center justify-center text-white font-bold text-sm mb-2 flex-shrink-0">
        A
      </div>

      {NAV_ITEMS.map((item) => (
        <SidebarItem key={item.to} {...item} />
      ))}

      <div className="w-7 h-px bg-slate-100 my-1" />

      <div className="w-10 h-10 rounded-[10px] flex items-center justify-center text-slate-400 hover:bg-slate-50 hover:text-slate-600 cursor-pointer transition-colors">
        <Settings size={18} strokeWidth={1.75} />
      </div>

      <div className="mt-auto w-8 h-8 rounded-full bg-gradient-to-br from-blue-100 to-purple-100 flex items-center justify-center text-[11px] font-bold text-indigo-700 flex-shrink-0">
        RG
      </div>
    </aside>
  );
}
