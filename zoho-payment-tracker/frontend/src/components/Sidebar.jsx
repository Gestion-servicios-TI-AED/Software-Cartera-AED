import React from 'react';
import { NavLink, useLocation } from 'react-router-dom';
import { Settings, LogOut } from 'lucide-react';
import { NAV_ITEMS } from '../config/navItems';
import { useHiddenNav } from '../utils/navPrefs';
import { logout } from '../utils/api';

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

export default function Sidebar({ onLogout }) {
  const { hidden } = useHiddenNav();
  const items = NAV_ITEMS.filter((item) => !hidden.has(item.key));

  const handleLogout = async () => {
    try {
      await logout();
    } finally {
      onLogout?.();
    }
  };

  return (
    <aside className="w-[60px] bg-white border-r border-aed-border flex flex-col items-center py-4 gap-1.5 flex-shrink-0 h-screen sticky top-0">
      <div className="w-9 h-9 rounded-[10px] bg-gradient-to-br from-brand to-brand-strong flex items-center justify-center text-white font-heading font-bold text-[16px] mb-2 flex-shrink-0">
        A
      </div>

      {items.map((item) => (
        <SidebarItem key={item.key} {...item} />
      ))}

      <div className="w-7 h-px bg-slate-200 my-1" />

      {/* Ajustes */}
      <div className="relative w-full flex justify-center group">
        <NavLink
          to="/ajustes"
          title="Ajustes"
          aria-label="Ajustes"
          className={({ isActive }) =>
            `w-10 h-10 rounded-[10px] flex items-center justify-center transition-colors ${
              isActive
                ? 'bg-slate-100 text-slate-700'
                : 'text-slate-400 hover:bg-slate-100 hover:text-slate-600'
            }`
          }
        >
          <Settings size={18} strokeWidth={1.9} className="transition-transform group-hover:scale-110" />
        </NavLink>
      </div>

      <div className="mt-auto w-8 h-8 rounded-full bg-gradient-to-br from-brand-soft to-emerald-100 flex items-center justify-center text-[13px] font-bold text-brand-strong flex-shrink-0">
        RG
      </div>

      <button
        onClick={handleLogout}
        title="Cerrar sesión"
        aria-label="Cerrar sesión"
        className="w-8 h-8 mt-1 flex items-center justify-center rounded-[10px] text-slate-400 hover:bg-slate-100 hover:text-slate-600 transition-colors flex-shrink-0"
      >
        <LogOut size={16} strokeWidth={1.9} />
      </button>
    </aside>
  );
}
