import React from 'react';
import { NavLink, useLocation } from 'react-router-dom';
import { Settings, LogOut } from 'lucide-react';
import { NAV_ITEMS } from '../config/navItems';
import { useHiddenNav } from '../utils/navPrefs';
import { logout } from '../utils/api';
import logoBaiaKristal from '../assets/baia-kristal-logo.png';

// Fila de navegación icono + etiqueta -- el sidebar dejó de ser icon-only
// para que cada módulo se reconozca de un vistazo, sin depender de memorizar
// qué ícono es cuál. Misma barra de acento de 3px + fondo tenue (10%) que
// antes, ahora ocupando todo el ancho de la fila en vez de solo rodear el
// ícono centrado.
function SidebarItem({ to, Icon, label, color, exact }) {
  const location = useLocation();
  const isActive = exact
    ? location.pathname === to
    : location.pathname.startsWith(to) &&
      !(to === '/fiducia' && location.pathname === '/fiducia/movimientos');

  return (
    <div className="relative w-full group">
      {isActive && (
        <span
          className="absolute left-0 top-1 bottom-1 w-[3px] rounded-r"
          style={{ backgroundColor: color }}
        />
      )}
      <NavLink
        to={to}
        className="flex items-center gap-3 h-11 px-3.5 rounded-[10px] transition-colors"
        style={
          isActive
            ? { backgroundColor: `${color}1a`, color }
            : { color: `${color}99` }
        }
      >
        <Icon
          size={19}
          strokeWidth={1.9}
          className="flex-shrink-0 transition-transform group-hover:scale-110"
        />
        <span className="text-[14px] font-medium leading-none whitespace-nowrap overflow-hidden text-ellipsis">
          {label}
        </span>
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
    <aside className="w-[212px] bg-white border-r border-aed-border flex flex-col py-4 px-2.5 gap-1 flex-shrink-0 h-screen sticky top-0">
      <div className="flex items-center gap-2.5 px-1.5 mb-3 flex-shrink-0">
        <div className="w-8 h-8 rounded-[10px] flex items-center justify-center flex-shrink-0" title="Baía Kristal">
          <img src={logoBaiaKristal} alt="Baía Kristal" className="w-full h-full object-contain" />
        </div>
        <span className="font-heading text-[14px] font-bold text-ink leading-tight">
          Baía Kristal
        </span>
      </div>

      {items.map((item) => (
        <SidebarItem key={item.key} {...item} />
      ))}

      <div className="h-px bg-slate-200 my-1.5 mx-1.5" />

      {/* Ajustes */}
      <div className="relative w-full group">
        <NavLink
          to="/ajustes"
          className={({ isActive }) =>
            `flex items-center gap-3 h-11 px-3.5 rounded-[10px] transition-colors ${
              isActive
                ? 'bg-slate-100 text-slate-700'
                : 'text-slate-400 hover:bg-slate-100 hover:text-slate-600'
            }`
          }
        >
          <Settings size={19} strokeWidth={1.9} className="flex-shrink-0 transition-transform group-hover:scale-110" />
          <span className="text-[14px] font-medium leading-none">Ajustes</span>
        </NavLink>
      </div>

      <div className="mt-auto flex items-center gap-2.5 px-1.5 pt-2">
        <div className="w-8 h-8 rounded-full bg-gradient-to-br from-brand-soft to-emerald-100 flex items-center justify-center text-[13px] font-bold text-brand-strong flex-shrink-0">
          RG
        </div>
        <button
          onClick={handleLogout}
          title="Cerrar sesión"
          aria-label="Cerrar sesión"
          className="flex items-center gap-1.5 flex-1 min-w-0 text-slate-400 hover:text-slate-600 transition-colors"
        >
          <LogOut size={15} strokeWidth={1.9} className="flex-shrink-0" />
          <span className="text-[13px] font-medium truncate">Cerrar sesión</span>
        </button>
      </div>
    </aside>
  );
}
