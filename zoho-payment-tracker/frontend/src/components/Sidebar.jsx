import React, { useState, useRef } from 'react';
import { createPortal } from 'react-dom';
import { NavLink, useLocation } from 'react-router-dom';
import { Settings, LogOut, ChevronLeft, ChevronRight, Layers } from 'lucide-react';
import { NAV_ITEMS_BAIA_KRISTAL, NAV_ITEMS_ALEGRA } from '../config/navItems';
import { useUsuarioActual } from '../utils/usuarioActual';
import { logout } from '../utils/api';
import logoBaiaKristal from '../assets/baia-kristal-logo.png';
import logoAlegra from '../assets/alegra-logo.svg';

const COLAPSADO_KEY = 'aed.sidebarColapsado';

// Colapsado por defecto (icon-only, w-[60px]) -- el usuario lo expande a
// demanda con el botón de arriba; la preferencia queda en localStorage para
// no tener que re-expandirlo cada vez que recarga.
function leerColapsado() {
  try {
    const v = localStorage.getItem(COLAPSADO_KEY);
    return v === null ? true : v === 'true';
  } catch {
    return true;
  }
}

function iniciales(nombre) {
  if (!nombre) return '';
  return nombre.trim().split(/\s+/).slice(0, 2).map((p) => p[0].toUpperCase()).join('');
}

// Envuelve cualquier ítem del sidebar con un tooltip propio (mismo estilo que
// HelpTip: fondo `ink`, texto blanco, sombra elevada) que aparece a la derecha
// del ícono cuando el sidebar está colapsado -- reemplaza el `title` nativo
// del navegador, que se ve plano y con retraso/estilo inconsistente entre
// sistemas operativos. Va en un portal a `document.body` con posición fija
// para no recortarse contra el `overflow-hidden` del layout general (App.jsx).
function ConTooltip({ label, activo, className = '', children }) {
  const ref = useRef(null);
  const [pos, setPos] = useState(null);

  if (!activo) return <div className={className}>{children}</div>;

  const show = () => {
    const el = ref.current;
    if (!el) return;
    const r = el.getBoundingClientRect();
    setPos({ top: r.top + r.height / 2, left: r.right + 10 });
  };
  const hide = () => setPos(null);

  return (
    <div ref={ref} className={className} onMouseEnter={show} onMouseLeave={hide}>
      {children}
      {pos &&
        createPortal(
          <div
            style={{ position: 'fixed', top: pos.top, left: pos.left, transform: 'translateY(-50%)', zIndex: 60 }}
            className="pointer-events-none whitespace-nowrap rounded-md bg-ink px-2.5 py-1.5 text-[13px] font-medium text-white shadow-[var(--shadow-overlay)]"
          >
            {label}
          </div>,
          document.body,
        )}
    </div>
  );
}

// Fila de navegación icono (+ etiqueta si el sidebar está expandido). Inactivo
// usa slate-600/900 (con buen contraste) -- activo usa el color de acento de
// marca vía estilo inline (fondo tenue 10% + texto en el color completo).
function SidebarItem({ to, Icon, label, color, exact, colapsado }) {
  const location = useLocation();
  const isActive = exact
    ? location.pathname === to
    : location.pathname.startsWith(to) &&
      !(to === '/fiducia' && location.pathname === '/fiducia/movimientos');

  return (
    <ConTooltip label={label} activo={colapsado} className="relative w-full group">
      {isActive && (
        <span
          className="absolute left-0 top-1 bottom-1 w-[3px] rounded-r"
          style={{ backgroundColor: color }}
        />
      )}
      <NavLink
        to={to}
        className={`flex items-center h-11 rounded-[10px] transition-colors ${
          colapsado ? 'justify-center px-0' : 'gap-3 px-3.5'
        } ${isActive ? '' : 'text-slate-600 hover:text-slate-900 hover:bg-slate-50'}`}
        style={isActive ? { backgroundColor: `${color}1a`, color } : undefined}
      >
        <Icon
          size={19}
          strokeWidth={1.9}
          className="flex-shrink-0 transition-transform group-hover:scale-110"
        />
        {!colapsado && (
          <span className="text-[14px] font-medium leading-none whitespace-nowrap overflow-hidden text-ellipsis">
            {label}
          </span>
        )}
      </NavLink>
    </ConTooltip>
  );
}

// Rótulo pequeño arriba de cada grupo de módulos (uno por proyecto) cuando el
// sidebar está expandido -- el logo de Alegra es un SVG ancho (ícono +
// wordmark); se recorta a un cuadrado mostrando solo el ícono, igual que en
// la cabecera colapsada que tenía antes el selector de proyecto, para que
// ambos rótulos se vean del mismo tamaño sin importar la composición
// original de cada logo.
function EtiquetaProyecto({ proyecto }) {
  const alegra = proyecto === 'alegra';
  return (
    <div className="flex items-center gap-1.5 px-3.5 pt-2.5 pb-1">
      <div className="w-3.5 h-3.5 rounded-sm overflow-hidden flex items-center flex-shrink-0">
        <img
          src={alegra ? logoAlegra : logoBaiaKristal}
          alt=""
          className={alegra ? 'h-3.5 w-auto max-w-none object-contain' : 'w-full h-full object-contain'}
        />
      </div>
      <span className="text-[10.5px] font-semibold text-slate-400 uppercase tracking-wide">
        {alegra ? 'Alegra' : 'Baía Kristal'}
      </span>
    </div>
  );
}

export default function Sidebar({ onLogout }) {
  const { usuario } = useUsuarioActual();
  const [colapsado, setColapsado] = useState(leerColapsado);

  const puedeVer = (item) => !!usuario && (usuario.esAdmin || usuario.modulosPermitidos.includes(item.key));
  const itemsBaiaKristal = NAV_ITEMS_BAIA_KRISTAL.filter(puedeVer);
  const itemsAlegra = NAV_ITEMS_ALEGRA.filter(puedeVer);

  const toggleColapsado = () => {
    setColapsado((prev) => {
      const next = !prev;
      try { localStorage.setItem(COLAPSADO_KEY, String(next)); } catch { /* noop */ }
      return next;
    });
  };

  const handleLogout = async () => {
    try {
      await logout();
    } finally {
      onLogout?.();
    }
  };

  return (
    <aside
      className={`${colapsado ? 'w-[60px]' : 'w-[212px]'} bg-white border-r border-aed-border flex flex-col py-4 px-2.5 gap-1 flex-shrink-0 h-screen sticky top-0 transition-[width] duration-200`}
    >
      <div className={`flex items-center mb-1 flex-shrink-0 ${colapsado ? 'justify-center' : 'justify-between px-1.5'}`}>
        <div className="flex items-center gap-2.5 min-w-0">
          <div
            className="w-8 h-8 rounded-[10px] flex items-center justify-center flex-shrink-0"
            style={{ backgroundColor: 'var(--brand-tint)', color: 'var(--brand-strong)' }}
            title="Cartera AED"
          >
            <Layers size={18} strokeWidth={2} />
          </div>
          {!colapsado && (
            <span className="font-heading text-[14px] font-bold text-ink leading-tight whitespace-nowrap">
              Cartera AED
            </span>
          )}
        </div>
        {!colapsado && (
          <button
            onClick={toggleColapsado}
            title="Colapsar menú"
            aria-label="Colapsar menú"
            className="w-6 h-6 flex items-center justify-center rounded-md text-slate-500 hover:bg-slate-100 hover:text-slate-900 transition-colors flex-shrink-0"
          >
            <ChevronLeft size={15} />
          </button>
        )}
      </div>

      {colapsado && (
        <button
          onClick={toggleColapsado}
          title="Expandir menú"
          aria-label="Expandir menú"
          className="w-full h-7 mb-2 flex items-center justify-center rounded-md text-slate-500 hover:bg-slate-100 hover:text-slate-900 transition-colors flex-shrink-0"
        >
          <ChevronRight size={15} />
        </button>
      )}

      {itemsBaiaKristal.length > 0 && (
        <div className="flex flex-col gap-1">
          {!colapsado && <EtiquetaProyecto proyecto="baia-kristal" />}
          {itemsBaiaKristal.map((item) => (
            <SidebarItem key={item.key} {...item} colapsado={colapsado} />
          ))}
        </div>
      )}

      {itemsAlegra.length > 0 && (
        <div className="flex flex-col gap-1">
          {itemsBaiaKristal.length > 0 && <div className="h-px bg-slate-200 my-1 mx-1.5" />}
          {!colapsado && <EtiquetaProyecto proyecto="alegra" />}
          {itemsAlegra.map((item) => (
            <SidebarItem key={item.key} {...item} colapsado={colapsado} />
          ))}
        </div>
      )}

      <div className="h-px bg-slate-200 my-1.5 mx-1.5" />

      {usuario?.esAdmin && (
        <ConTooltip label="Ajustes" activo={colapsado} className="relative w-full group">
          <NavLink
            to="/ajustes"
            className={({ isActive }) =>
              `flex items-center h-11 rounded-[10px] transition-colors ${colapsado ? 'justify-center px-0' : 'gap-3 px-3.5'} ${
                isActive
                  ? 'bg-slate-100 text-slate-900'
                  : 'text-slate-600 hover:bg-slate-100 hover:text-slate-900'
              }`
            }
          >
            <Settings size={19} strokeWidth={1.9} className="flex-shrink-0 transition-transform group-hover:scale-110" />
            {!colapsado && <span className="text-[14px] font-medium leading-none">Ajustes</span>}
          </NavLink>
        </ConTooltip>
      )}

      <div className={`mt-auto flex items-center pt-2 ${colapsado ? 'flex-col gap-2' : 'gap-2.5 px-1.5'}`}>
        <div
          className="w-8 h-8 rounded-full bg-gradient-to-br from-brand-soft to-emerald-100 flex items-center justify-center text-[13px] font-bold text-brand-strong flex-shrink-0"
          title={colapsado ? usuario?.nombre : undefined}
        >
          {iniciales(usuario?.nombre)}
        </div>
        <ConTooltip label="Cerrar sesión" activo={colapsado} className={colapsado ? '' : 'flex-1 min-w-0'}>
          <button
            onClick={handleLogout}
            aria-label="Cerrar sesión"
            className="flex items-center gap-1.5 text-slate-500 hover:text-slate-900 transition-colors w-full"
          >
            <LogOut size={15} strokeWidth={1.9} className="flex-shrink-0" />
            {!colapsado && <span className="text-[13px] font-medium truncate">Cerrar sesión</span>}
          </button>
        </ConTooltip>
      </div>
    </aside>
  );
}
