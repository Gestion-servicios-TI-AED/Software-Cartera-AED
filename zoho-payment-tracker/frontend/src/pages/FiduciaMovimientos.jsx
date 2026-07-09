import { useState, useEffect, useCallback, useRef } from 'react';
import { Search, X, ChevronRight } from 'lucide-react';
import { getAllNegocioMovimientos } from '../utils/api';
import { formatExcelDate } from '../utils/format';
import { filtrarKeysMovimiento } from '../utils/columnasExcluidas';
import ConceptoHint from '../components/ConceptoHint';
import { estadoBadgeClass } from '../utils/estados';

function useDebounce(value, delay = 350) {
  const [debounced, setDebounced] = useState(value);
  useEffect(() => {
    const t = setTimeout(() => setDebounced(value), delay);
    return () => clearTimeout(t);
  }, [value, delay]);
  return debounced;
}

function formatCOP(val) {
  if (val == null || val === '') return null;
  const n = parseFloat(String(val).replace(/[^0-9.-]/g, ''));
  if (isNaN(n)) return null;
  return new Intl.NumberFormat('es-CO', { style: 'currency', currency: 'COP', minimumFractionDigits: 0 }).format(n);
}

function formatCell(key, value) {
  if (value == null || value === '') return null;
  const k = (key || '').toLowerCase();
  if (k.includes('fecha')) {
    const f = formatExcelDate(value);
    return f !== '—' ? f : String(value);
  }
  if (
    k.includes('valor') || k.includes('monto') || k.includes('saldo') ||
    k.includes('cuota') || k.includes('capital') || k.includes('abono') ||
    k.includes('descuento') || k.includes('credito') || k.includes('crédito') ||
    k.includes('aporte') || k.includes('importe') || k.includes('acreditacion') ||
    k.includes('acreditación') || k.includes('anticipo') || k.includes('canje')
  ) {
    const cop = formatCOP(value);
    return cop !== null ? cop : String(value);
  }
  return String(value);
}

// Color del estado del negocio — centralizado en utils/estados.js
const estadoNegocioColor = estadoBadgeClass;

function estadoMovColor(estado) {
  if (!estado) return 'text-slate-600 bg-slate-100';
  const e = estado.toLowerCase();
  if (e.includes('aplicado')) return 'text-emerald-700 bg-emerald-50';
  if (e.includes('pendiente') || e.includes('reversado')) return 'text-amber-700 bg-amber-50';
  return 'text-slate-600 bg-slate-100';
}

function cleanNombre(nombre) {
  if (!nombre) return null;
  return nombre.replace(/^\d+\s+/, '').replace(/\s*\(\d+\.?\d*%\)\s*$/, '');
}

function shortFideicomiso(raw) {
  if (!raw) return null;
  return String(raw).replace(/^\d+[\s-]+/, '').replace(/^P\.?A\.?\s*/i, '').trim();
}

function MovimientoRow({ mov }) {
  const [expanded, setExpanded] = useState(false);
  const datos = mov.datos || {};
  const neg = mov.negocio;

  const fecha    = datos['Fecha Contable'] ? formatExcelDate(datos['Fecha Contable']) : null;
  const tipo     = datos['Tipo Movimiento'] || datos['Concepto'] || null;
  const valor    = datos['Valor'] ? formatCOP(datos['Valor']) : null;
  const estadoMov = datos['Estado'];

  const compradorPrincipal = cleanNombre(neg?.compradores?.[0]?.nombre);
  const extraCompradores   = (neg?.compradores?.length ?? 0) - 1;
  const allFields          = filtrarKeysMovimiento(Object.keys(datos));

  return (
    <>
      <tr
        onClick={() => setExpanded((e) => !e)}
        className="border-b border-aed-border hover:bg-brand-tint cursor-pointer transition-colors"
      >
        <td className="pl-4 pr-2 py-2.5 w-6">
          <ChevronRight
            size={12}
            strokeWidth={2.5}
            className={`text-slate-500 transition-transform ${expanded ? 'rotate-90 text-brand' : ''}`}
          />
        </td>
        <td className="px-3 py-2.5 whitespace-nowrap">
          <span className="font-mono text-[14px] font-semibold text-slate-700">{mov.referencia}</span>
        </td>
        <td className="px-3 py-2.5 text-[13px] text-slate-500 max-w-[160px]">
          {neg?.fideicomiso
            ? <span className="line-clamp-1">{shortFideicomiso(neg.fideicomiso)}</span>
            : <span className="text-slate-300">—</span>}
        </td>
        <td className="px-3 py-2.5 whitespace-nowrap text-[13px] text-slate-500">
          {neg?.nomenclatura ?? <span className="text-slate-300">—</span>}
        </td>
        <td className="px-3 py-2.5 text-[13px] text-slate-500 max-w-[180px]">
          {compradorPrincipal
            ? (
              <span className="line-clamp-1">
                {compradorPrincipal}
                {extraCompradores > 0 && <span className="ml-1 text-slate-300">+{extraCompradores}</span>}
              </span>
            )
            : <span className="text-slate-300">—</span>}
        </td>
        <td className="px-3 py-2.5 whitespace-nowrap">
          {neg?.estado
            ? <span className={`text-[12px] font-bold px-2 py-0.5 rounded-full ${estadoNegocioColor(neg.estado)}`}>{neg.estado}</span>
            : <span className="text-slate-300 text-[13px]">—</span>}
        </td>
        <td className="px-3 py-2.5 whitespace-nowrap text-[13px] text-slate-500">
          {fecha ?? <span className="text-slate-300">—</span>}
        </td>
        <td className="px-3 py-2.5 text-[14px] text-slate-700 max-w-[200px]">
          <span className="line-clamp-1">{tipo ?? <span className="text-slate-300">—</span>}</span>
        </td>
        <td className="px-3 py-2.5 whitespace-nowrap text-[14px] text-right font-medium text-slate-700">
          {valor ?? <span className="text-slate-300">—</span>}
        </td>
        <td className="px-3 py-2.5 whitespace-nowrap text-right">
          {estadoMov && (
            <span className={`text-[12px] font-bold px-2 py-0.5 rounded-full ${estadoMovColor(estadoMov)}`}>
              {estadoMov}
            </span>
          )}
        </td>
      </tr>
      {expanded && (
        <tr className="bg-brand-tint border-b border-aed-border">
          <td colSpan={10} className="px-5 py-3">
            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-x-6 gap-y-2.5">
              {allFields.map((col) => {
                const v = datos[col];
                const display = v != null && v !== '' ? (formatCell(col, v) ?? String(v)) : null;
                return (
                  <div key={col}>
                    <p className="section-label mb-0.5 inline-flex items-center gap-1">{col}<ConceptoHint columna={col} hoja="movimiento" /></p>
                    <p className="text-[13px] text-slate-700 break-words">
                      {display ?? <span className="text-slate-300 italic">—</span>}
                    </p>
                  </div>
                );
              })}
            </div>
          </td>
        </tr>
      )}
    </>
  );
}

export default function FiduciaMovimientos() {
  const [result, setResult]   = useState(null);
  const [loading, setLoading] = useState(true);
  const [page, setPage]       = useState(1);

  const [search,           setSearch]           = useState('');
  const [fideicomisoFilter, setFideicomisoFilter] = useState('');
  const [estadoFilter,     setEstadoFilter]     = useState('');
  const [tipoMovFilter,    setTipoMovFilter]    = useState('');
  const [estadoMovFilter,  setEstadoMovFilter]  = useState('');
  const [fechaDesde,       setFechaDesde]       = useState('');
  const [fechaHasta,       setFechaHasta]       = useState('');
  const [datePreset,       setDatePreset]       = useState('');

  const debouncedSearch = useDebounce(search);

  const filtersRef = useRef({});
  filtersRef.current = { debouncedSearch, fideicomisoFilter, estadoFilter, tipoMovFilter, estadoMovFilter, fechaDesde, fechaHasta };

  const fetchData = useCallback((p = 1) => {
    const { debouncedSearch: s, fideicomisoFilter: f, estadoFilter: e, tipoMovFilter: tm, estadoMovFilter: em, fechaDesde: fd, fechaHasta: fh } = filtersRef.current;
    setLoading(true);
    getAllNegocioMovimientos({
      search:          s  || undefined,
      fideicomiso:     f  || undefined,
      estado:          e  || undefined,
      tipoMovimiento:  tm || undefined,
      estadoMovimiento: em || undefined,
      fechaDesde:      fd || undefined,
      fechaHasta:      fh || undefined,
      page:            p,
      limit:           50,
    })
      .then((res) => { setResult(res); setPage(p); })
      .catch(console.error)
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => { fetchData(1); }, [debouncedSearch, fideicomisoFilter, estadoFilter, tipoMovFilter, estadoMovFilter, fechaDesde, fechaHasta, fetchData]);

  const clearAll  = () => { setSearch(''); setFideicomisoFilter(''); setEstadoFilter(''); setTipoMovFilter(''); setEstadoMovFilter(''); setFechaDesde(''); setFechaHasta(''); setDatePreset(''); };
  const hasFilters = search || fideicomisoFilter || estadoFilter || tipoMovFilter || estadoMovFilter || fechaDesde || fechaHasta;

  const pagination   = result?.pagination;
  const movimientos  = result?.data        || [];
  const fideicomisos = result?.fideicomisos || [];
  const estados      = result?.estados      || [];
  const tiposMov     = result?.tiposMovimiento || [];
  const estadosMov   = result?.estadosMovimiento || [];

  return (
    <div className="flex flex-col min-h-screen bg-aed-base">
      <header className="h-[52px] bg-white border-b border-aed-border flex items-center px-5 gap-3 flex-shrink-0 sticky top-0 z-10">
        <h1 className="text-[18px] font-bold text-slate-800">Movimientos Fiduciarios</h1>
        {pagination && (
          <span className="text-[14px] text-slate-500">
            {pagination.total.toLocaleString('es-CO')} movimientos
          </span>
        )}
        {loading && result && (
          <svg className="w-4 h-4 animate-spin text-brand ml-1" fill="none" viewBox="0 0 24 24">
            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
          </svg>
        )}
      </header>

      <div className="flex-1 p-5 flex flex-col gap-4">
        {/* ── Filtros ── */}
        <div className="card p-4 flex flex-col gap-3">
          {/* Fila 1: Búsqueda + Proyecto + Estado */}
          <div className="flex flex-wrap gap-3 items-end">
            {/* Búsqueda */}
            <div className="flex-1 min-w-52">
              <label className="section-label block mb-1">Buscar</label>
              <div className="relative">
                <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-500" />
                <input
                  type="text"
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  placeholder="Referencia, comprador, cédula, ID movimiento o nomenclatura…"
                  className="input w-full pl-9 pr-8 py-2 text-[15px]"
                />
                {search && (
                  <button onClick={() => setSearch('')} className="absolute right-2 top-1/2 -translate-y-1/2 text-slate-500 hover:text-slate-600">
                    <X size={12} />
                  </button>
                )}
              </div>
            </div>

            {/* Proyecto / Fideicomiso */}
            {fideicomisos.length > 0 && (
              <div className="min-w-52">
                <label className="section-label block mb-1">Proyecto / Fideicomiso</label>
                <select
                  value={fideicomisoFilter}
                  onChange={(e) => setFideicomisoFilter(e.target.value)}
                  className="input w-full py-2 px-3 text-[15px]"
                >
                  <option value="">Todos los proyectos</option>
                  {fideicomisos.map((f) => (
                    <option key={f} value={f}>{shortFideicomiso(f)}</option>
                  ))}
                </select>
              </div>
            )}

            {/* Estado negocio */}
            {estados.length > 0 && (
              <div className="min-w-44">
                <label className="section-label block mb-1">Estado negocio</label>
                <select
                  value={estadoFilter}
                  onChange={(e) => setEstadoFilter(e.target.value)}
                  className="input w-full py-2 px-3 text-[15px]"
                >
                  <option value="">Todos los estados</option>
                  {estados.map((e) => <option key={e} value={e}>{e}</option>)}
                </select>
              </div>
            )}
          </div>

          {/* Fila 2: Tipo movimiento + Estado movimiento */}
          <div className="flex flex-wrap gap-3 items-end">
            {tiposMov.length > 0 && (
              <div className="min-w-52">
                <label className="section-label block mb-1">Tipo movimiento</label>
                <select
                  value={tipoMovFilter}
                  onChange={(e) => setTipoMovFilter(e.target.value)}
                  className="input w-full py-2 px-3 text-[15px]"
                >
                  <option value="">Todos los tipos</option>
                  {tiposMov.map((t) => <option key={t} value={t}>{t}</option>)}
                </select>
              </div>
            )}

            {estadosMov.length > 0 && (
              <div className="min-w-44">
                <label className="section-label block mb-1">Estado movimiento</label>
                <select
                  value={estadoMovFilter}
                  onChange={(e) => setEstadoMovFilter(e.target.value)}
                  className="input w-full py-2 px-3 text-[15px]"
                >
                  <option value="">Todos los estados</option>
                  {estadosMov.map((e) => <option key={e} value={e}>{e}</option>)}
                </select>
              </div>
            )}
          </div>

          {/* Fila 3: Rango de fechas + preset */}
          <div className="flex flex-wrap gap-3 items-end">
            <div>
              <label className="section-label block mb-1">Fecha contable desde</label>
              <input
                type="date"
                value={fechaDesde}
                onChange={(e) => { setFechaDesde(e.target.value); setDatePreset(''); }}
                className="input py-2 px-3 text-[15px]"
              />
            </div>
            <div>
              <label className="section-label block mb-1">Fecha contable hasta</label>
              <input
                type="date"
                value={fechaHasta}
                onChange={(e) => { setFechaHasta(e.target.value); setDatePreset(''); }}
                className="input py-2 px-3 text-[15px]"
              />
            </div>
            <div className="flex gap-1">
              {[
                { label: 'Último mes', months: 1 },
                { label: 'Últimos 3 meses', months: 3 },
                { label: 'Últimos 6 meses', months: 6 },
                { label: 'Último año', months: 12 },
              ].map(({ label, months }) => (
                <button
                  key={months}
                  onClick={() => {
                    const now = new Date();
                    const hasta = now.toISOString().slice(0, 10);
                    const desde = new Date(now.getFullYear(), now.getMonth() - months, now.getDate()).toISOString().slice(0, 10);
                    setFechaDesde(desde);
                    setFechaHasta(hasta);
                    setDatePreset(String(months));
                  }}
                  className={`px-2.5 py-1.5 rounded-md border text-[13px] font-medium transition-colors ${
                    datePreset === String(months)
                      ? 'bg-brand-soft border-brand text-brand-strong'
                      : 'bg-white border-aed-border text-slate-600 hover:bg-aed-base'
                  }`}
                >
                  {label}
                </button>
              ))}
            </div>
            {hasFilters && (
              <button
                onClick={clearAll}
                className="btn-secondary text-[14px] py-2 px-3 flex items-center gap-1 ml-auto self-end"
              >
                <X size={13} /> Limpiar filtros
              </button>
            )}
          </div>
        </div>

        {/* ── Tabla ── */}
        {loading && !result ? (
          <div className="flex items-center justify-center py-16 text-slate-500 text-[15px] gap-2">
            <svg className="w-5 h-5 animate-spin text-brand" fill="none" viewBox="0 0 24 24">
              <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
              <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
            </svg>
            Cargando…
          </div>
        ) : movimientos.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-16 text-slate-500">
            <p className="text-[15px] font-medium">Sin movimientos</p>
            <p className="text-[14px] mt-1">
              {hasFilters ? 'Ajusta los filtros para ver resultados.' : 'Sincroniza los datos desde el módulo Negocios.'}
            </p>
          </div>
        ) : (
          <div className="card overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-[14px]">
                <thead>
                  <tr className="border-b border-aed-border bg-aed-base">
                    <th className="w-6" />
                    <th className="section-label px-3 py-2.5 text-left whitespace-nowrap"><span className="inline-flex items-center gap-1">Referencia<ConceptoHint columna="Referencia" hoja="movimiento" /></span></th>
                    <th className="section-label px-3 py-2.5 text-left whitespace-nowrap"><span className="inline-flex items-center gap-1">Proyecto<ConceptoHint columna="Fideicomiso" hoja="movimiento" /></span></th>
                    <th className="section-label px-3 py-2.5 text-left whitespace-nowrap"><span className="inline-flex items-center gap-1">Nomenclatura<ConceptoHint columna="Nomenclatura" hoja="movimiento" /></span></th>
                    <th className="section-label px-3 py-2.5 text-left whitespace-nowrap"><span className="inline-flex items-center gap-1">Comprador<ConceptoHint columna="Propietario" hoja="movimiento" /></span></th>
                    <th className="section-label px-3 py-2.5 text-left whitespace-nowrap"><span className="inline-flex items-center gap-1">Estado negocio<ConceptoHint columna="Estado" hoja="resumen" /></span></th>
                    <th className="section-label px-3 py-2.5 text-left whitespace-nowrap"><span className="inline-flex items-center gap-1">Fecha contable<ConceptoHint columna="Fecha Contable" hoja="movimiento" /></span></th>
                    <th className="section-label px-3 py-2.5 text-left whitespace-nowrap"><span className="inline-flex items-center gap-1">Tipo movimiento<ConceptoHint columna="Tipo Movimiento" hoja="movimiento" /></span></th>
                    <th className="section-label px-3 py-2.5 text-right whitespace-nowrap"><span className="inline-flex items-center gap-1">Valor<ConceptoHint columna="Valor" hoja="movimiento" /></span></th>
                    <th className="section-label px-3 py-2.5 text-right whitespace-nowrap">Estado mov.</th>
                  </tr>
                </thead>
                <tbody>
                  {movimientos.map((mov) => (
                    <MovimientoRow key={mov.id} mov={mov} />
                  ))}
                </tbody>
              </table>
            </div>

            {/* Paginación */}
            {pagination && pagination.totalPages > 1 && (
              <div className="px-4 py-3 border-t border-aed-border flex items-center justify-between">
                <span className="text-[13px] text-slate-500">
                  {pagination.total.toLocaleString('es-CO')} movimientos · Pág. {pagination.page} de {pagination.totalPages}
                </span>
                <div className="flex gap-2">
                  <button
                    disabled={pagination.page === 1 || loading}
                    onClick={() => fetchData(page - 1)}
                    className="btn-secondary text-[13px] py-1 px-3 disabled:opacity-40"
                  >
                    Anterior
                  </button>
                  <button
                    disabled={pagination.page === pagination.totalPages || loading}
                    onClick={() => fetchData(page + 1)}
                    className="btn-secondary text-[13px] py-1 px-3 disabled:opacity-40"
                  >
                    Siguiente
                  </button>
                </div>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
