import { useState, useRef, useCallback } from 'react';
import { createPortal } from 'react-dom';
import { HelpCircle } from 'lucide-react';

// Ícono de ayuda (?) que muestra una explicación en lenguaje simple al pasar
// el mouse o enfocar con teclado. Pensado para aclarar términos técnicos a
// usuarios no expertos (filtros, estados, columnas, KPIs).
//
// El tooltip va en un portal con posición fija para no recortarse dentro de
// contenedores con overflow (tablas, grids).
export default function HelpTip({
  text,
  size = 12,
  Icon = HelpCircle,
  className = '',
  label,
}) {
  const ref = useRef(null);
  const [pos, setPos] = useState(null);

  const show = useCallback(() => {
    const el = ref.current;
    if (!el) return;
    const r = el.getBoundingClientRect();
    const half = 130; // mitad del ancho máx del tooltip + margen
    const left = Math.min(Math.max(r.left + r.width / 2, half), window.innerWidth - half);
    setPos({ top: r.bottom + 6, left });
  }, []);

  const hide = useCallback(() => setPos(null), []);

  if (!text) return null;

  return (
    <span
      ref={ref}
      className={`inline-flex items-center align-middle text-slate-400 hover:text-brand focus-visible:text-brand cursor-help transition-colors outline-none ${className}`}
      tabIndex={0}
      role="note"
      aria-label={label || text}
      onMouseEnter={show}
      onMouseLeave={hide}
      onFocus={show}
      onBlur={hide}
    >
      <Icon size={size} strokeWidth={2.25} />
      {pos &&
        createPortal(
          <div
            style={{ position: 'fixed', top: pos.top, left: pos.left, transform: 'translateX(-50%)', zIndex: 60 }}
            className="pointer-events-none max-w-[250px] rounded-md bg-ink px-2.5 py-1.5 text-[14px] font-normal normal-case leading-snug text-white shadow-[var(--shadow-overlay)]"
          >
            {text}
          </div>,
          document.body,
        )}
    </span>
  );
}
