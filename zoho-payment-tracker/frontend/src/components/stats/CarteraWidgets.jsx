import { formatCOP, formatDate } from '../../utils/format';

function shortFideicomiso(raw) {
  if (!raw) return '—';
  return String(raw).replace(/^\d+[\s-]+/, '').replace(/^P\.?A\.?\s*/i, '').trim();
}

// Color del avance según % pagado de la cuota inicial.
function avanceColor(pct) {
  if (pct >= 90) return { bar: 'bg-emerald-500', text: 'text-emerald-600' };
  if (pct >= 60) return { bar: 'bg-blue-500', text: 'text-blue-600' };
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
  if (!data || data.length === 0) return <p className="text-sm text-slate-400">Sin datos</p>;
  return (
    <div className="flex flex-col gap-3">
      {data.map((p) => {
        const c = avanceColor(p.pct);
        return (
          <div key={p.fideicomiso}>
            <div className="flex items-baseline justify-between gap-3 mb-1">
              <span className="text-[12px] text-slate-700 font-medium truncate" title={p.fideicomiso}>
                {shortFideicomiso(p.fideicomiso)}
                <span className="text-slate-400 font-normal ml-1.5">· {p.count}</span>
              </span>
              <span className={`text-[12px] font-semibold tabular-nums ${c.text}`}>{p.pct}%</span>
            </div>
            <BarraAvance pct={p.pct} />
            <div className="flex items-baseline justify-between mt-1 text-[10px] text-slate-400 tabular-nums">
              <span>Abonado {formatCOP(p.abonado)}</span>
              <span>Por cobrar <b className="text-slate-600 font-semibold">{formatCOP(p.porCobrar)}</b></span>
            </div>
          </div>
        );
      })}
    </div>
  );
}

// ── Morosidad: negocios con saldo por cobrar y sin abono reciente ────────────
export function Morosidad({ negocios, dias, onDiasChange }) {
  const filtrados = (negocios || [])
    .filter((n) => n.porCobrar > 0 && (n.diasSinAbonar === null || n.diasSinAbonar >= dias))
    .sort((a, b) => {
      // Nunca abonó primero, luego por más días, y a igualdad por mayor monto.
      const da = a.diasSinAbonar === null ? Infinity : a.diasSinAbonar;
      const db = b.diasSinAbonar === null ? Infinity : b.diasSinAbonar;
      return db - da || b.porCobrar - a.porCobrar;
    });

  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-center justify-between">
        <span className="text-[11px] text-slate-400">
          {filtrados.length} negocio{filtrados.length !== 1 ? 's' : ''} sin abonar hace +{dias} días
        </span>
        <div className="flex gap-1">
          {[30, 60, 90].map((d) => (
            <button
              key={d}
              onClick={() => onDiasChange(d)}
              className={`text-[11px] font-medium px-2 py-0.5 rounded-md border transition-colors ${
                dias === d
                  ? 'bg-slate-800 border-slate-800 text-white'
                  : 'bg-white border-aed-border text-slate-500 hover:bg-aed-base'
              }`}
            >
              {d}d
            </button>
          ))}
        </div>
      </div>

      {filtrados.length === 0 ? (
        <p className="text-sm text-slate-400">Sin morosos en este rango 🎉</p>
      ) : (
        <div className="max-h-[340px] overflow-y-auto -mx-1 px-1">
          <table className="w-full text-xs">
            <thead className="sticky top-0 bg-white">
              <tr className="text-slate-400 border-b border-slate-100">
                <th className="text-left py-1.5 font-medium">Comprador</th>
                <th className="text-left py-1.5 font-medium">Último abono</th>
                <th className="text-right py-1.5 font-medium">Días</th>
                <th className="text-right py-1.5 font-medium">Por cobrar</th>
              </tr>
            </thead>
            <tbody>
              {filtrados.map((n) => (
                <tr key={n.referencia} className="border-b border-slate-50 hover:bg-slate-50">
                  <td className="py-1.5 max-w-[180px]">
                    <p className="text-slate-700 truncate" title={n.nombre}>{n.nombre}</p>
                    <p className="text-[10px] text-slate-400 truncate">
                      {shortFideicomiso(n.fideicomiso)}{n.nomenclatura ? ` · ${n.nomenclatura}` : ''}
                    </p>
                  </td>
                  <td className="py-1.5 text-slate-500 whitespace-nowrap">
                    {n.ultimoAbono ? formatDate(n.ultimoAbono) : <span className="text-red-400 italic">Nunca</span>}
                  </td>
                  <td className="py-1.5 text-right">
                    <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded-full ${moraColor(n.diasSinAbonar)}`}>
                      {n.diasSinAbonar === null ? '—' : n.diasSinAbonar}
                    </span>
                  </td>
                  <td className="py-1.5 text-right font-semibold text-slate-800 tabular-nums whitespace-nowrap">
                    {formatCOP(n.porCobrar)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
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
  if (!data || data.length === 0) return <p className="text-sm text-slate-400">Sin datos</p>;
  const ordenado = [...data].sort((a, b) => rankEstado(a.estado) - rankEstado(b.estado) || b.count - a.count);
  const max = Math.max(...ordenado.map((e) => e.count), 1);
  return (
    <div className="flex flex-col gap-2">
      {ordenado.map((e) => {
        const libre = (e.estado || '').toLowerCase().includes('libre');
        return (
          <div key={e.estado} className="flex items-center gap-3">
            <span className="text-[11px] text-slate-500 w-32 flex-shrink-0 truncate" title={e.estado}>{e.estado}</span>
            <div className="flex-1 h-5 rounded bg-slate-100 overflow-hidden">
              <div
                className={`h-full rounded ${libre ? 'bg-slate-300' : 'bg-blue-500'} transition-all`}
                style={{ width: `${(e.count / max) * 100}%` }}
              />
            </div>
            <span className="text-[12px] font-semibold text-slate-700 tabular-nums w-8 text-right flex-shrink-0">{e.count}</span>
          </div>
        );
      })}
    </div>
  );
}
