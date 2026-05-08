import React from 'react';
import { NavLink, useLocation } from 'react-router-dom';

const NAV_ITEMS = [
  { to: '/', icon: '📊', label: 'Oportunidades', exact: true },
  { to: '/fiducia', icon: '📁', label: 'Encargos' },
  { to: '/fiducia/movimientos', icon: '💳', label: 'Movimientos' },
];

function SidebarItem({ to, icon, label, exact }) {
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
        className={`w-10 h-10 rounded-[10px] flex items-center justify-center text-lg transition-colors ${
          isActive
            ? 'bg-blue-50 text-blue-500'
            : 'text-slate-400 hover:bg-slate-50 hover:text-slate-600'
        }`}
      >
        {icon}
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

      <div className="w-10 h-10 rounded-[10px] flex items-center justify-center text-lg text-slate-400 hover:bg-slate-50 cursor-pointer">
        ⚙️
      </div>

      <div className="mt-auto w-8 h-8 rounded-full bg-gradient-to-br from-blue-100 to-purple-100 flex items-center justify-center text-[11px] font-bold text-indigo-700 flex-shrink-0">
        RG
      </div>
    </aside>
  );
}
