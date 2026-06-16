import ConceptoHint from './ConceptoHint';
import { separarFinanciero } from '../utils/ordenColumnas';

// Una fila de texto plano: etiqueta a la izquierda, valor a la derecha. Fondo blanco.
function Fila({ etiqueta, valor, hoja = 'resumen' }) {
  return (
    <div className="flex items-baseline justify-between gap-6 px-4 py-2 bg-white border-b border-aed-border/60 break-inside-avoid">
      <span className="section-label inline-flex items-center gap-1 shrink-0">
        {etiqueta}
        <ConceptoHint columna={etiqueta} hoja={hoja} />
      </span>
      <span className="text-[12px] font-medium text-slate-800 text-right break-words">
        {valor != null && valor !== '' ? valor : <span className="text-slate-300 italic">—</span>}
      </span>
    </div>
  );
}

// Lista simple de pares etiqueta/valor en texto plano (Info del apartamento).
export function ListaInfo({ entries, hoja = 'resumen', format }) {
  if (!entries || entries.length === 0) {
    return <p className="px-4 py-4 text-[12px] text-slate-400 italic bg-white">Sin datos</p>;
  }
  return (
    <div className="bg-white columns-1 lg:columns-2 lg:gap-8 lg:[column-rule:1px_solid_#e9edf2]">
      {entries.map(([k, v]) => (
        <Fila key={k} etiqueta={k} valor={format(k, v)} hoja={hoja} />
      ))}
    </div>
  );
}

// Lista financiera: campos fijos como filas y cada mes consolidado en una sola línea.
export function ListaFinanciera({ entries, format }) {
  if (!entries || entries.length === 0) {
    return <p className="px-4 py-4 text-[12px] text-slate-400 italic bg-white">Sin datos financieros</p>;
  }
  const { antes, meses, despues, otras } = separarFinanciero(entries);
  const dinero = (v) => (v != null && v !== '' ? format('saldo', v) ?? String(v) : '—');

  return (
    <div className="bg-white columns-1 lg:columns-2 lg:gap-8 lg:[column-rule:1px_solid_#e9edf2]">
      {antes.map(([k, v]) => (
        <Fila key={k} etiqueta={k} valor={format(k, v)} hoja="resumen" />
      ))}

      {meses.map((m) => (
        <div
          key={m.etiqueta}
          className="flex items-baseline justify-between gap-6 px-4 py-2 bg-white border-b border-aed-border/60 break-inside-avoid"
        >
          <span className="section-label shrink-0">{m.etiqueta}</span>
          <span className="text-[12px] text-slate-700 text-right tabular-nums">
            <span className="text-slate-400">Ingreso</span> <b className="font-semibold text-slate-800">{dinero(m.ingreso)}</b>
            <span className="mx-1.5 text-slate-300">·</span>
            <span className="text-slate-400">Salida</span> <b className="font-semibold text-slate-800">{dinero(m.salida)}</b>
            <span className="mx-1.5 text-slate-300">·</span>
            <span className="text-slate-400">Saldo</span> <b className="font-semibold text-slate-800">{dinero(m.saldo)}</b>
          </span>
        </div>
      ))}

      {despues.map(([k, v]) => (
        <Fila key={k} etiqueta={k} valor={format(k, v)} hoja="resumen" />
      ))}

      {otras.map(([k, v]) => (
        <Fila key={k} etiqueta={k} valor={format(k, v)} hoja="resumen" />
      ))}
    </div>
  );
}
