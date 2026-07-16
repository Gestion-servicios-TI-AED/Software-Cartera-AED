import { formatCOP } from '../../utils/format';
import { descripcionProyecto } from '../../utils/proyectos';

function shortFideicomiso(raw) {
  if (!raw) return '—';
  return String(raw).replace(/^\d+[\s-]+/, '').replace(/^P\.?A\.?\s*/i, '').trim();
}

// Color del avance según % pagado de la cuota inicial.
function avanceColor(pct) {
  if (pct >= 90) return { bar: 'bg-emerald-500', text: 'text-emerald-600' };
  if (pct >= 60) return { bar: 'bg-brand', text: 'text-brand' };
  if (pct >= 30) return { bar: 'bg-amber-500', text: 'text-amber-600' };
  return { bar: 'bg-red-500', text: 'text-red-600' };
}

// Color de la mora según días sin abonar.
function moraColor(dias) {
  if (dias === null || dias >= 90) return 'text-red-600 bg-red-50';
  if (dias >= 60) return 'text-amber-700 bg-amber-50';
  return 'text-orange-600 bg-orange-50';
}

function BarraAvance({ pct }) {
  const c = avanceColor(pct);
  return (
    <div className="h-1.5 w-full rounded-full bg-slate-100 overflow-hidden">
      <div className={`h-full rounded-full ${c.bar} transition-all`} style={{ width: `${Math.min(100, pct)}%` }} />
    </div>
  );
}

// ── Avance de recaudo por proyecto ──────────────────────────────────────────
export function AvancePorProyecto({ data }) {
  if (!data || data.length === 0) return <p className="text-[16px] text-slate-500">Sin datos</p>;
  return (
    <div className="flex flex-col gap-3">
      {data.map((p) => {
        const c = avanceColor(p.pct);
        return (
          <div key={p.fideicomiso}>
            <div className="flex items-baseline justify-between gap-3 mb-1">
              <span className="text-[14px] text-slate-700 font-medium truncate" title={p.fideicomiso}>
                {(() => {
                  const match = String(p.fideicomiso).match(/^(\d{4,6})/);
                  const desc = match ? descripcionProyecto(match[1]) : null;
                  return desc || shortFideicomiso(p.fideicomiso);
                })()}
                <span className="text-slate-500 font-normal ml-1.5">· {p.count}</span>
              </span>
              <span className={`text-[14px] font-semibold tabular-nums ${c.text}`}>{p.pct}%</span>
            </div>
            <BarraAvance pct={p.pct} />
            <div className="flex items-baseline justify-between mt-1 text-[12px] text-slate-500 tabular-nums">
              <span>Abonado {formatCOP(p.abonado)}</span>
              <span>Por cobrar <b className="text-slate-600 font-semibold">{formatCOP(p.porCobrar)}</b></span>
            </div>
          </div>
        );
      })}
    </div>
  );
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
