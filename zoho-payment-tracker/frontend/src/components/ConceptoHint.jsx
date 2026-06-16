import { useState, useRef, useCallback } from 'react';
import { createPortal } from 'react-dom';
import { Info } from 'lucide-react';
import { getConcepto } from '../utils/conceptosColumnas';

// Ícono (i) que muestra el concepto de una columna al pasar el mouse o enfocar.
// No renderiza nada si la columna no tiene concepto definido por Cartera.
// El tooltip va en un portal con posición fija para no recortarse dentro de
// contenedores con overflow (tablas, grids).
export default function ConceptoHint({ columna, hoja = 'movimiento' }) {
  const concepto = getConcepto(columna, hoja);
  const ref = useRef(null);
  const [pos, setPos] = useState(null);

  const show = useCallback(() => {
    const el = ref.current;
    if (!el) return;
    const r = el.getBoundingClientRect();
    const half = 124; // mitad del ancho máx del tooltip + margen
    const left = Math.min(Math.max(r.left + r.width / 2, half), window.innerWidth - half);
    setPos({ top: r.bottom + 6, left });
  }, []);

  const hide = useCallback(() => setPos(null), []);

  if (!concepto) return null;

  return (
    <span
      ref={ref}
      className="inline-flex items-center align-middle text-slate-300 hover:text-blue-500 focus-visible:text-blue-500 cursor-help transition-colors outline-none"
      tabIndex={0}
      role="note"
      aria-label={concepto}
      onMouseEnter={show}
      onMouseLeave={hide}
      onFocus={show}
      onBlur={hide}
    >
      <Info size={11} strokeWidth={2.25} />
      {pos &&
        createPortal(
          <div
            style={{ position: 'fixed', top: pos.top, left: pos.left, transform: 'translateX(-50%)', zIndex: 60 }}
            className="pointer-events-none max-w-[240px] rounded-md bg-slate-800 px-2.5 py-1.5 text-[11px] font-normal normal-case leading-snug text-white shadow-lg"
          >
            {concepto}
          </div>,
          document.body,
        )}
    </span>
  );
}
