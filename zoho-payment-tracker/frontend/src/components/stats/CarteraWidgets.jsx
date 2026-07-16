import { formatCOP } from '../../utils/format';

function shortFideicomiso(raw) {
  if (!raw) return '—';
  return String(raw).replace(/^\d+[\s-]+/, '').replace(/^P\.?A\.?\s*/i, '').trim();
}

// Color de la mora según días sin abonar.
function moraColor(dias) {
  if (dias === null || dias >= 90) return 'text-red-600 bg-red-50';
  if (dias >= 60) return 'text-amber-700 bg-amber-50';
  return 'text-orange-600 bg-orange-50';
}

// Color de fondo/texto del chip de ranking según posición.
function rankColor(i) {
  if (i === 0) return 'bg-red-600 text-white';
  if (i === 1) return 'bg-red-500 text-white';
  if (i === 2) return 'bg-amber-500 text-white';
  return 'bg-slate-100 text-slate-600';
}

// ── Top 10 morosos: los negocios más urgentes a gestionar, ordenados por
// más días sin abonar (nunca-abonó primero) y, en empate, por mayor monto
// pendiente. Vista fija de 10 -- no es una lista filtrable, es el ranking
// ejecutivo de a quién llamar primero.
export function TopMorosos({ negocios }) {
  const top = (negocios || [])
    .filter((n) => n.porCobrar > 0)
    .sort((a, b) => {
      const da = a.diasSinAbonar === null ? Infinity : a.diasSinAbonar;
      const db = b.diasSinAbonar === null ? Infinity : b.diasSinAbonar;
      return db - da || b.porCobrar - a.porCobrar;
    })
    .slice(0, 10);

  if (top.length === 0) {
    return <p className="text-[16px] text-slate-500">Sin morosos 🎉</p>;
  }

  return (
    <div className="flex flex-col gap-1">
      {top.map((n, i) => (
        <div key={n.referencia} className="flex items-center gap-3 py-1.5 border-b border-slate-50 last:border-0">
          <span className={`w-6 h-6 rounded-full flex items-center justify-center text-[12px] font-bold flex-shrink-0 ${rankColor(i)}`}>
            {i + 1}
          </span>
          <div className="flex-1 min-w-0">
            <p className="text-[14px] text-slate-700 truncate" title={n.nombre}>{n.nombre}</p>
            <p className="text-[12px] text-slate-500 truncate">
              {shortFideicomiso(n.fideicomiso)}{n.nomenclatura ? ` · ${n.nomenclatura}` : ''}
            </p>
          </div>
          <span className={`text-[12px] font-bold px-1.5 py-0.5 rounded-full flex-shrink-0 whitespace-nowrap ${moraColor(n.diasSinAbonar)}`}>
            {n.diasSinAbonar === null ? 'Nunca abonó' : `${n.diasSinAbonar}d`}
          </span>
          <span className="text-[14px] font-semibold text-slate-800 tabular-nums whitespace-nowrap flex-shrink-0 w-28 text-right">
            {formatCOP(n.porCobrar)}
          </span>
        </div>
      ))}
    </div>
  );
}

// ── Embudo de estados ───────────────────────────────────────────────────────
const ORDEN_ESTADO = ['opcionado', 'prometido', 'para firma de escritura', 'autorizado', 'vendido', 'escriturado', 'libre'];

function rankEstado(estado) {
  const e = (estado || '').toLowerCase();
  const i = ORDEN_ESTADO.findIndex((o) => e.includes(o));
  return i === -1 ? 99 : i;
}

export function EmbudoEstados({ data }) {
  if (!data || data.length === 0) return <p className="text-[16px] text-slate-500">Sin datos</p>;
  const ordenado = [...data].sort((a, b) => rankEstado(a.estado) - rankEstado(b.estado) || b.count - a.count);
  const max = Math.max(...ordenado.map((e) => e.count), 1);
  return (
    <div className="flex flex-col gap-2">
      {ordenado.map((e) => {
        const libre = (e.estado || '').toLowerCase().includes('libre');
        return (
          <div key={e.estado} className="flex items-center gap-3">
            <span className="text-[13px] text-slate-500 w-32 flex-shrink-0 truncate" title={e.estado}>{e.estado}</span>
            <div className="flex-1 h-5 rounded bg-slate-100 overflow-hidden">
              <div
                className={`h-full rounded ${libre ? 'bg-slate-300' : 'bg-brand'} transition-all`}
                style={{ width: `${(e.count / max) * 100}%` }}
              />
            </div>
            <span className="text-[14px] font-semibold text-slate-700 tabular-nums w-8 text-right flex-shrink-0">{e.count}</span>
          </div>
        );
      })}
    </div>
  );
}
