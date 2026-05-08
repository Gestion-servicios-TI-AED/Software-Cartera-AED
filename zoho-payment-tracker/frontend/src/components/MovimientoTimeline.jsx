import React from 'react';
import { formatCOP, formatDate } from '../utils/format';

const SOURCE_STYLES = {
  fiducia: { dot: '#bbf7d0', badge: 'bg-blue-50 text-blue-500' },
  zoho: { dot: '#ddd6fe', badge: 'bg-purple-50 text-purple-600' },
};

function getStyle(source = '') {
  return source.toLowerCase().includes('zoho') ? SOURCE_STYLES.zoho : SOURCE_STYLES.fiducia;
}

export default function MovimientoTimeline({ movimientos }) {
  if (!movimientos || movimientos.length === 0) {
    return <p className="text-[11px] text-slate-400 italic">Sin movimientos registrados</p>;
  }

  const total = movimientos.reduce((s, m) => s + (Number(m.valor || m.monto) || 0), 0);

  return (
    <div className="flex flex-col h-full">
      <div className="flex-1 overflow-y-auto">
        {movimientos.map((m, i) => {
          const style = getStyle(m.fuente || m.source || '');
          const isLast = i === movimientos.length - 1;
          return (
            <div key={m.id || i} className="flex gap-2.5">
              <div className="flex flex-col items-center shrink-0 pt-0.5">
                <div className="w-2 h-2 rounded-full shrink-0" style={{ background: style.dot }} />
                {!isLast && <div className="w-px flex-1 bg-aed-border min-h-[16px]" />}
              </div>
              <div className={`flex-1 flex items-start justify-between gap-1 ${isLast ? 'pb-0' : 'pb-2.5'}`}>
                <div className="flex flex-col gap-0.5">
                  <span className="text-[11px] font-medium text-slate-800">
                    {m.concepto || m.descripcion || 'Movimiento'}
                  </span>
                  <span className="text-[10px] text-slate-400">
                    {m.fecha ? formatDate(m.fecha) : '—'}
                  </span>
                  {(m.fuente || m.source) && (
                    <span className={`text-[9px] px-1.5 py-0.5 rounded w-fit mt-0.5 ${style.badge}`}>
                      {m.fuente || m.source}
                    </span>
                  )}
                </div>
                <span className="text-[12px] font-bold text-slate-800 shrink-0">
                  {formatCOP(m.valor || m.monto || 0)}
                </span>
              </div>
            </div>
          );
        })}
      </div>

      <div className="mt-auto pt-3 border-t border-slate-100 shrink-0">
        <div className="text-[10px] text-slate-400 uppercase tracking-wide">Total registrado</div>
        <div className="text-[20px] font-extrabold text-slate-800 tracking-tight leading-tight">
          {formatCOP(total)}
        </div>
        <div className="text-[10px] text-slate-400 mt-0.5">{movimientos.length} movimientos</div>
      </div>
    </div>
  );
}
