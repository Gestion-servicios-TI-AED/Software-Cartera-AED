import { useState, useEffect, useCallback } from 'react';
import { Search, Layers, MapPin, Building, X, ChevronLeft, ChevronRight, AlertTriangle, Briefcase, ExternalLink, Warehouse } from 'lucide-react';
import { getCarteraMora } from '../utils/api';
import { formatCOP } from '../utils/format';
import { estadoBadgeClass } from '../utils/estados';

function useDebounce(value, delay = 350) {
  const [debounced, setDebounced] = useState(value);
  useEffect(() => {
    const t = setTimeout(() => setDebounced(value), delay);
    return () => clearTimeout(t);
  }, [value, delay]);
  return debounced;
}

export default function CarteraMora() {
  const [filas, setFilas] = useState([]);
  const [resumen, setResumen] = useState(null);
  const [pagination, setPagination] = useState({ total: 0, page: 1, totalPages: 1 });
  const [loading, setLoading] = useState(true);
  const [page, setPage] = useState(1);

  const [search, setSearch] = useState('');
  const [etapaFilter, setEtapaFilter] = useState('');
  const [frenteFilter, setFrenteFilter] = useState('');
  const [torreFilter, setTorreFilter] = useState('');
  const [rangoFilter, setRangoFilter] = useState('');
  const [etapas, setEtapas] = useState([]);
  const [frentes, setFrentes] = useState([]);
  const [frentesPorEtapa, setFrentesPorEtapa] = useState({});
  const [torresPorFrente, setTorresPorFrente] = useState({});
  const [torresPorEtapaFrente, setTorresPorEtapaFrente] = useState({});
  const [porRangoMora, setPorRangoMora] = useState([]);
  const [menuContextual, setMenuContextual] = useState(null); // { x, y, fila } | null

  const debouncedSearch = useDebounce(search);

  const load = useCallback(async (p) => {
    setLoading(true);
    try {
      const res = await getCarteraMora({
        search: debouncedSearch || undefined,
        etapa: etapaFilter || undefined,
        frente: frenteFilter || undefined,
        torre: torreFilter || undefined,
        rango: rangoFilter || undefined,
        page: p,
        limit: 50,
      });
      setFilas(res.data);
      setResumen(res.resumen);
      setPagination(res.pagination);
      setEtapas(res.etapasDisponibles);
      setFrentes(res.frentesDisponibles);
      setFrentesPorEtapa(res.frentesPorEtapa);
      setTorresPorFrente(res.torresPorFrente);
      setTorresPorEtapaFrente(res.torresPorEtapaFrente);
      setPorRangoMora(res.porRangoMora);
      setPage(p);
    } catch (err) {
      console.error('Error cargando cartera en gestión:', err);
    } finally {
      setLoading(false);
    }
  }, [debouncedSearch, etapaFilter, frenteFilter, torreFilter, rangoFilter]);

  useEffect(() => { load(1); }, [load]);

  useEffect(() => {
    if (!menuContextual) return;
    const cerrar = () => setMenuContextual(null);
    const cerrarConEscape = (e) => { if (e.key === 'Escape') cerrar(); };
    document.addEventListener('click', cerrar);
    document.addEventListener('scroll', cerrar, true);
    document.addEventListener('keydown', cerrarConEscape);
    return () => {
      document.removeEventListener('click', cerrar);
      document.removeEventListener('scroll', cerrar, true);
      document.removeEventListener('keydown', cerrarConEscape);
    };
  }, [menuContextual]);

  const abrirMenuContextual = (e, fila) => {
    e.preventDefault();
    setMenuContextual({ x: e.clientX, y: e.clientY, fila });
  };

  // Mismo criterio de cascada Etapa → Frente → Torre que ReportePlanRecaudo.
  const handleEtapaChange = (value) => {
    setEtapaFilter(value);
    if (value && frenteFilter && !(frentesPorEtapa[value] || []).includes(frenteFilter)) {
      setFrenteFilter('');
      setTorreFilter('');
    } else if (value && frenteFilter && torreFilter && !(torresPorEtapaFrente[`${value}||${frenteFilter}`] || []).includes(torreFilter)) {
      setTorreFilter('');
    }
  };

  const handleFrenteChange = (value) => {
    setFrenteFilter(value);
    setTorreFilter('');
  };

  const frenteOptions = etapaFilter ? (frentesPorEtapa[etapaFilter] || []) : frentes;
  const torreOptions = frenteFilter
    ? (etapaFilter ? (torresPorEtapaFrente[`${etapaFilter}||${frenteFilter}`] || []) : (torresPorFrente[frenteFilter] || []))
    : [];
  const hasFilters = search || etapaFilter || frenteFilter || torreFilter || rangoFilter;
  const clearFilters = () => { setSearch(''); setEtapaFilter(''); setFrenteFilter(''); setTorreFilter(''); setRangoFilter(''); };

  return (
    <div className="h-full flex flex-col gap-3 p-5 overflow-hidden">
      <div className="flex items-center gap-2 flex-shrink-0">
        <h1 className="text-[19px] font-bold text-slate-800 flex items-center gap-2">
          <AlertTriangle size={18} className="text-red-500" />
          Cartera en Gestión
        </h1>
        <span className="text-[13px] text-slate-500">
          Negocios con cuotas atrasadas del plan de pagos — calculado en vivo contra los movimientos reales.
        </span>
      </div>

      {resumen && (
        <div className="grid grid-cols-3 gap-3 flex-shrink-0">
          <div className="card p-4">
            <p className="section-label mb-1">Negocios en mora</p>
            <p className="text-[28px] font-bold text-slate-800 tabular-nums">{resumen.negociosEnMora}</p>
          </div>
          <div className="card p-4">
            <p className="section-label mb-1">Cuotas en mora</p>
            <p className="text-[28px] font-bold text-amber-600 tabular-nums">{resumen.totalCuotasEnMora}</p>
          </div>
          <div className="card p-4">
            <p className="section-label mb-1">Valor vencido</p>
            <p className="text-[20px] font-bold text-red-600 tabular-nums leading-tight mt-1">{formatCOP(resumen.totalMontoEnMora)}</p>
          </div>
        </div>
      )}

      {porRangoMora.length > 0 && (
        <div className="card p-3 flex-shrink-0">
          <p className="section-label mb-2 px-1">Antigüedad de la mora — mismo criterio que las hojas de la fiduciaria</p>
          <div className="grid grid-cols-5 gap-2">
            {porRangoMora.map((r) => (
              <button
                key={r.rango}
                onClick={() => setRangoFilter((prev) => (prev === r.rango ? '' : r.rango))}
                className={`text-left px-3 py-2 rounded-md border transition-colors ${
                  rangoFilter === r.rango
                    ? 'bg-red-50 border-red-300'
                    : 'bg-white border-aed-border hover:bg-aed-base'
                }`}
              >
                <p className="text-[12px] text-slate-500">{r.label}</p>
                <p className="text-[16px] font-bold text-slate-800 tabular-nums">{r.count}</p>
                <p className="text-[12px] font-medium text-red-600 tabular-nums">{formatCOP(r.monto)}</p>
              </button>
            ))}
          </div>
        </div>
      )}

      <div className="flex flex-wrap items-end gap-2.5 flex-shrink-0">
        <div className="field">
          <label className="field-label"><Search size={13} className="text-brand" />Buscar</label>
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Torre, comprador o referencia…"
            className="input text-[14px] h-8 py-0 w-56"
          />
        </div>
        {etapas.length > 0 && (
          <div className="field">
            <label className="field-label"><Layers size={13} className="text-[#7c3aed]" />Etapa</label>
            <select value={etapaFilter} onChange={(e) => handleEtapaChange(e.target.value)} className="input text-[14px] h-8 py-0 pr-2 leading-none">
              <option value="">Todas las etapas</option>
              {etapas.map((et) => <option key={et} value={et}>Etapa {et}</option>)}
            </select>
          </div>
        )}
        {frentes.length > 0 && (
          <div className="field">
            <label className="field-label"><MapPin size={13} className="text-[#7c3aed]" />Frente</label>
            <select value={frenteFilter} onChange={(e) => handleFrenteChange(e.target.value)} className="input text-[14px] h-8 py-0 pr-2 leading-none">
              <option value="">Todos los frentes</option>
              {frenteOptions.map((fr) => <option key={fr} value={fr}>{fr}</option>)}
            </select>
          </div>
        )}
        {frenteFilter && torreOptions.length > 0 && (
          <div className="field">
            <label className="field-label"><Building size={13} className="text-[#7c3aed]" />Torre</label>
            <select value={torreFilter} onChange={(e) => setTorreFilter(e.target.value)} className="input text-[14px] h-8 py-0 pr-2 leading-none">
              <option value="">Todas las torres</option>
              {torreOptions.map((tr) => <option key={tr} value={tr}>Torre {tr}</option>)}
            </select>
          </div>
        )}
        {hasFilters && (
          <button onClick={clearFilters} className="text-[13px] text-brand hover:text-brand-strong font-medium flex items-center gap-1 h-8">
            <X size={11} /> Limpiar filtros
          </button>
        )}
      </div>

      <p className="text-[12px] text-slate-500 flex-shrink-0 italic">
        Días de atraso muy altos (años) suelen ser el Saldo Contra Entrega — la última cuota del plan, pendiente hasta la escrituración — no necesariamente mora activa de cobranza.
      </p>

      <div className="card overflow-hidden flex flex-col flex-1 min-h-0">
        <div className="overflow-auto flex-1 min-h-0">
          <table className="text-[14px] w-full">
            <thead>
              <tr className="border-b border-aed-border bg-aed-base sticky top-0">
                <th className="section-label px-3 py-2 text-left whitespace-nowrap">Etapa</th>
                <th className="section-label px-3 py-2 text-left whitespace-nowrap">Frente</th>
                <th className="section-label px-3 py-2 text-left whitespace-nowrap">Torre</th>
                <th className="section-label px-3 py-2 text-left whitespace-nowrap">Nomenclatura</th>
                <th className="section-label px-3 py-2 text-left whitespace-nowrap">Referencia</th>
                <th className="section-label px-3 py-2 text-left whitespace-nowrap">Comprador</th>
                <th className="section-label px-3 py-2 text-left whitespace-nowrap">Estado</th>
                <th className="section-label px-3 py-2 text-right whitespace-nowrap">Cuotas mora</th>
                <th className="section-label px-3 py-2 text-right whitespace-nowrap">Días atraso</th>
                <th className="section-label px-3 py-2 text-right whitespace-nowrap">Valor vencido</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr><td colSpan={10} className="px-4 py-12 text-center text-slate-400">Cargando…</td></tr>
              ) : filas.length === 0 ? (
                <tr><td colSpan={10} className="px-4 py-12 text-center text-slate-400">Sin resultados.</td></tr>
              ) : (
                filas.map((f) => (
                  <tr
                    key={f.id}
                    onContextMenu={(e) => abrirMenuContextual(e, f)}
                    className="border-b border-aed-border hover:bg-slate-50 cursor-context-menu"
                  >
                    <td className="px-3 py-2 whitespace-nowrap">{f.etapa ?? <span className="text-slate-300">—</span>}</td>
                    <td className="px-3 py-2 whitespace-nowrap">{f.frente ?? <span className="text-slate-300">—</span>}</td>
                    <td className="px-3 py-2 whitespace-nowrap">{f.torre ?? <span className="text-slate-300">—</span>}</td>
                    <td className="px-3 py-2 whitespace-nowrap font-mono text-[13px]">{f.nomenclatura ?? '—'}</td>
                    <td className="px-3 py-2 whitespace-nowrap font-mono text-[13px] text-slate-500">{f.referencia ?? <span className="text-slate-300">—</span>}</td>
                    <td className="px-3 py-2 whitespace-nowrap max-w-[220px] truncate" title={f.comprador ?? ''}>{f.comprador ?? <span className="text-slate-300">—</span>}</td>
                    <td className="px-3 py-2 whitespace-nowrap">
                      {f.estado ? (
                        <span className={`text-[12px] font-bold px-2 py-0.5 rounded-full ${estadoBadgeClass(f.estado)}`}>{f.estado}</span>
                      ) : <span className="text-slate-300">—</span>}
                    </td>
                    <td className="px-3 py-2 whitespace-nowrap text-right font-mono text-[13px]">{f.cuotasEnMora}</td>
                    <td className="px-3 py-2 whitespace-nowrap text-right font-mono text-[13px] text-amber-600">{f.maxDiasAtraso}</td>
                    <td className="px-3 py-2 whitespace-nowrap text-right font-mono text-[13px] text-red-600">{formatCOP(f.montoEnMora)}</td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>

        {pagination.totalPages > 1 && (
          <div className="px-4 py-3 border-t border-aed-border flex items-center justify-between flex-shrink-0">
            <p className="text-[14px] text-slate-400">
              {pagination.total} negocios · Página {pagination.page} de {pagination.totalPages}
            </p>
            <div className="flex gap-2">
              <button onClick={() => load(Math.max(1, page - 1))} disabled={page === 1} className="btn-secondary px-3 py-1.5 text-[14px] flex items-center gap-1">
                <ChevronLeft size={13} /> Anterior
              </button>
              <button onClick={() => load(Math.min(pagination.totalPages, page + 1))} disabled={page === pagination.totalPages} className="btn-secondary px-3 py-1.5 text-[14px] flex items-center gap-1">
                Siguiente <ChevronRight size={13} />
              </button>
            </div>
          </div>
        )}
      </div>

      {menuContextual && (
        <div
          className="fixed z-50 bg-white border border-aed-border rounded-md shadow-lg py-1 min-w-[200px]"
          style={{ top: menuContextual.y, left: menuContextual.x }}
          onClick={(e) => e.stopPropagation()}
        >
          <button
            onClick={() => {
              window.open(`/?negocio=inv-${menuContextual.fila.id}`, '_blank');
              setMenuContextual(null);
            }}
            className="w-full text-left px-3 py-1.5 text-[14px] text-slate-700 hover:bg-aed-base flex items-center gap-2"
          >
            <Briefcase size={13} className="text-brand" /> Ver negocio
          </button>
          <button
            onClick={() => {
              window.open(`/inventario?item=${menuContextual.fila.id}`, '_blank');
              setMenuContextual(null);
            }}
            className="w-full text-left px-3 py-1.5 text-[14px] text-slate-700 hover:bg-aed-base flex items-center gap-2"
          >
            <Warehouse size={13} className="text-brand" /> Ver inmueble
          </button>
          <button
            onClick={() => {
              if (!menuContextual.fila.opportunityId) return;
              window.open(`/opportunity/${menuContextual.fila.opportunityId}`, '_blank');
              setMenuContextual(null);
            }}
            disabled={!menuContextual.fila.opportunityId}
            title={menuContextual.fila.opportunityId ? undefined : 'No hay oportunidad vinculada a este inmueble'}
            className="w-full text-left px-3 py-1.5 text-[14px] text-slate-700 hover:bg-aed-base flex items-center gap-2 disabled:opacity-40 disabled:cursor-not-allowed disabled:hover:bg-transparent"
          >
            <ExternalLink size={13} className="text-brand" /> Ver oportunidad
          </button>
        </div>
      )}
    </div>
  );
}
