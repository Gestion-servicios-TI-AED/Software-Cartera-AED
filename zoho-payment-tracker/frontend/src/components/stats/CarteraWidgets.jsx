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
