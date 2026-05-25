import { useState, useEffect, useMemo, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { Search, X, ChevronUp, ChevronDown, ChevronsUpDown } from 'lucide-react';
import { getMovimientosFiducia, getPropietarios, getEncargos } from '../utils/api';

function useDebounce(value, delay = 350) {
  const [debounced, setDebounced] = useState(value);
  useEffect(() => {
    const t = setTimeout(() => setDebounced(value), delay);
    return () => clearTimeout(t);
  }, [value, delay]);
  return debounced;
}

// Parsea números en formato colombiano: "1.234.567,89" → 1234567.89
function parseColombian(str) {
  if (str == null || str === '') return null;
  const s = String(str).trim().replace(/[$\s]/g, '');
  const normalized = s.replace(/\./g, '').replace(',', '.');
  const n = parseFloat(normalized);
  return isNaN(n) ? null : n;
}

function formatCOP(n) {
  if (n == null) return '—';
  return new Intl.NumberFormat('es-CO', { style: 'currency', currency: 'COP', maximumFractionDigits: 0 }).format(n);
}

// Detecta qué columnas de datos son numéricas mirando la primera fila
function detectNumericCols(data, columnas) {
  const numeric = new Set();
  for (const col of columnas) {
    const sample = data.slice(0, 20).map((r) => r.datos?.[col]).filter((v) => v != null && v !== '');
    if (sample.length > 0 && sample.every((v) => parseColombian(v) !== null)) {
      numeric.add(col);
    }
  }
  return numeric;
}

function SortIcon({ col, sortCol, sortDir }) {
  if (sortCol !== col) return <ChevronsUpDown size={12} className="text-slate-300 ml-0.5" />;
  return sortDir === 'asc'
    ? <ChevronUp size={12} className="text-blue-500 ml-0.5" />
    : <ChevronDown size={12} className="text-blue-500 ml-0.5" />;
}

export default function FiduciaMovimientos() {
  const navigate = useNavigate();

  // — Datos —
  const [movimientos, setMovimientos] = useState(null);
  const [propietarios, setPropietarios] = useState([]);
  const [encargos, setEncargos] = useState([]);
  const [loading, setLoading] = useState(true);

  // — Filtros —
  const [search, setSearch] = useState('');
  const [propietario, setPropietario] = useState('');
  const [encargId, setEncargId] = useState('');
  const [codigoInput, setCodigoInput] = useState('');
  const [fechaDesde, setFechaDesde] = useState('');
  const [fechaHasta, setFechaHasta] = useState('');
  const [page, setPage] = useState(1);

  // — Ordenamiento local (columnas datos) —
  const [sortCol, setSortCol] = useState(null);
  const [sortDir, setSortDir] = useState('asc');

  const debouncedSearch = useDebounce(search);

  // Usamos ref para siempre leer los valores actuales sin re-crear la función
  const filtersRef = useRef({});
  filtersRef.current = { debouncedSearch, propietario, encargId, fechaDesde, fechaHasta };

  async function loadMovimientos(overrides = {}) {
    const f = filtersRef.current;
    setLoading(true);
    try {
      const params = {
        search:      (overrides.search      ?? f.debouncedSearch) || undefined,
        propietario: (overrides.propietario ?? f.propietario)     || undefined,
        encargId:    (overrides.encargId    ?? f.encargId)        || undefined,
        fechaDesde:  (overrides.fechaDesde  ?? f.fechaDesde)      || undefined,
        fechaHasta:  (overrides.fechaHasta  ?? f.fechaHasta)      || undefined,
        page:        overrides.page ?? page,
        limit:       50,
      };
      const res = await getMovimientosFiducia(params);
      setMovimientos(res);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    getEncargos({ limit: 200 }).then((r) => setEncargos(r.data || []));
    getPropietarios().then(setPropietarios);
  }, []);

  useEffect(() => {
    setPage(1);
    loadMovimientos({ page: 1 });
  }, [debouncedSearch, propietario, encargId, fechaDesde, fechaHasta]); // eslint-disable-line

  // Cuando cambia el código escrito, busca en la lista local de encargos
  function handleCodigoInput(val) {
    setCodigoInput(val);
    if (!val.trim()) {
      setEncargId('');
      return;
    }
    const match = encargos.find(
      (e) => e.codigo && e.codigo.toLowerCase() === val.trim().toLowerCase()
    );
    if (match) setEncargId(match.id);
    else setEncargId('');
  }

  function clearAll() {
    setSearch('');
    setPropietario('');
    setEncargId('');
    setCodigoInput('');
    setFechaDesde('');
    setFechaHasta('');
    setPage(1);
  }

  const hasFilters = search || propietario || encargId || fechaDesde || fechaHasta;

  // — Columnas dinámicas desde el primer registro —
  // Columnas cuyo nombre empieza con "propietario" van primero
  const columnas = useMemo(() => {
    if (!movimientos?.data?.length) return [];
    const keys = Object.keys(movimientos.data[0].datos || {});
    const isProp = (k) => k.toLowerCase().trimStart().startsWith('propietario');
    return [...keys.filter(isProp), ...keys.filter((k) => !isProp(k))];
  }, [movimientos]);

  // Detectar columnas numéricas para totales
  const numericCols = useMemo(
    () => detectNumericCols(movimientos?.data || [], columnas),
    [movimientos, columnas]
  );

  // — Ordenamiento local sobre la página actual —
  const sortedData = useMemo(() => {
    const rows = movimientos?.data || [];
    if (!sortCol) return rows;
    return [...rows].sort((a, b) => {
      const av = a.datos?.[sortCol] ?? '';
      const bv = b.datos?.[sortCol] ?? '';
      const an = parseColombian(av);
      const bn = parseColombian(bv);
      let cmp;
      if (an !== null && bn !== null) {
        cmp = an - bn;
      } else {
        cmp = String(av).localeCompare(String(bv), 'es-CO');
      }
      return sortDir === 'asc' ? cmp : -cmp;
    });
  }, [movimientos, sortCol, sortDir]);

  // — Totales de la página visible —
  const totales = useMemo(() => {
    const result = {};
    for (const col of numericCols) {
      result[col] = sortedData.reduce((sum, row) => {
        const v = parseColombian(row.datos?.[col]);
        return sum + (v ?? 0);
      }, 0);
    }
    return result;
  }, [sortedData, numericCols]);

  function toggleSort(col) {
    if (sortCol === col) setSortDir((d) => (d === 'asc' ? 'desc' : 'asc'));
    else { setSortCol(col); setSortDir('asc'); }
  }

  const pagination = movimientos?.pagination;

  return (
    <div className="flex flex-col min-h-screen bg-aed-base">
      <header className="h-[52px] bg-white border-b border-aed-border flex items-center px-5 gap-3 flex-shrink-0 sticky top-0 z-10">
        <h1 className="text-[15px] font-bold text-slate-800">Movimientos Fiduciarios</h1>
        {pagination && (
          <span className="text-xs text-slate-400">
            {pagination.total.toLocaleString('es-CO')} registros
          </span>
        )}
      </header>

      <div className="flex-1 p-5 flex flex-col gap-4">

        {/* ── Filtros ── */}
        <div className="card p-4 flex flex-col gap-3">
          <div className="flex flex-wrap gap-3 items-end">

            {/* Búsqueda general */}
            <div className="flex-1 min-w-44">
              <label className="section-label block mb-1">Buscar</label>
              <div className="relative">
                <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                <input
                  type="text"
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  placeholder="Buscar en todos los campos..."
                  className="input w-full pl-9 pr-3 py-2 text-[13px]"
                />
              </div>
            </div>

            {/* Filtro por código de encargo */}
            <div className="min-w-36">
              <label className="section-label block mb-1">Código encargo</label>
              <input
                type="text"
                value={codigoInput}
                onChange={(e) => handleCodigoInput(e.target.value)}
                placeholder="ej. 99289"
                className={`input w-full py-2 px-3 text-[13px] font-mono ${
                  codigoInput && !encargId ? 'border-amber-300 bg-amber-50' : ''
                }`}
              />
              {codigoInput && !encargId && (
                <p className="text-[10px] text-amber-500 mt-0.5">Sin coincidencia</p>
              )}
              {codigoInput && encargId && (
                <p className="text-[10px] text-emerald-600 mt-0.5">
                  ✓ {encargos.find((e) => e.id === encargId)?.nombre}
                </p>
              )}
            </div>

            {/* Dropdown encargo (para buscar por nombre) */}
            <div className="min-w-52">
              <label className="section-label block mb-1">Encargo fiduciario</label>
              <select
                value={encargId}
                onChange={(e) => {
                  setEncargId(e.target.value);
                  const enc = encargos.find((en) => en.id === e.target.value);
                  setCodigoInput(enc?.codigo || '');
                }}
                className="input w-full py-2 px-3 text-[13px]"
              >
                <option value="">Todos los encargos</option>
                {encargos.map((e) => (
                  <option key={e.id} value={e.id}>
                    {e.codigo ? `[${e.codigo}] ` : ''}{e.nombre}
                  </option>
                ))}
              </select>
            </div>

            {/* Propietario */}
            <div className="min-w-48">
              <label className="section-label block mb-1">Propietario</label>
              <select
                value={propietario}
                onChange={(e) => setPropietario(e.target.value)}
                className="input w-full py-2 px-3 text-[13px]"
              >
                <option value="">Todos los propietarios</option>
                {propietarios.map((p) => (
                  <option key={p.propietario} value={p.propietario}>
                    {p.propietario} ({p.total})
                  </option>
                ))}
              </select>
            </div>
          </div>

          {/* Rango de fechas */}
          <div className="flex flex-wrap gap-3 items-end">
            <div>
              <label className="section-label block mb-1">Fecha contable desde</label>
              <input
                type="date"
                value={fechaDesde}
                onChange={(e) => setFechaDesde(e.target.value)}
                className="input py-2 px-3 text-[13px]"
              />
            </div>
            <div>
              <label className="section-label block mb-1">Fecha contable hasta</label>
              <input
                type="date"
                value={fechaHasta}
                onChange={(e) => setFechaHasta(e.target.value)}
                className="input py-2 px-3 text-[13px]"
              />
            </div>
            {(fechaDesde || fechaHasta) && (
              <p className="text-[10px] text-slate-400 self-center">
                Filtra por columna "Fecha Contable" (DD/MM/YYYY) en los reportes
              </p>
            )}
            {hasFilters && (
              <button
                onClick={clearAll}
                className="btn-secondary text-[12px] py-2 px-3 flex items-center gap-1 ml-auto"
              >
                <X size={13} /> Limpiar filtros
              </button>
            )}
          </div>
        </div>

        {/* ── Tabla ── */}
        {loading && !movimientos ? (
          <div className="flex items-center justify-center py-16 text-slate-400 text-[13px] gap-2">
            <svg className="w-5 h-5 animate-spin text-blue-400" fill="none" viewBox="0 0 24 24">
              <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
              <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
            </svg>
            Cargando...
          </div>
        ) : !sortedData.length ? (
          <div className="flex flex-col items-center justify-center py-16 text-slate-400">
            <svg className="w-12 h-12 mb-3 text-slate-200" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
            </svg>
            <p className="text-[13px] font-medium">Sin movimientos</p>
            <p className="text-[12px] mt-1">Ajusta los filtros o importa un Excel desde Encargos</p>
          </div>
        ) : (
          <div className="card overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-[12px]">
                <thead>
                  <tr className="border-b border-aed-border bg-aed-base">
                    <th className="section-label px-3 py-2.5 text-left whitespace-nowrap">Propietario</th>
                    <th className="section-label px-3 py-2.5 text-left whitespace-nowrap">Encargo</th>
                    <th className="section-label px-3 py-2.5 text-left whitespace-nowrap">Hoja</th>
                    {columnas.map((col) => (
                      <th
                        key={col}
                        onClick={() => toggleSort(col)}
                        className="section-label px-3 py-2.5 text-left whitespace-nowrap cursor-pointer hover:text-slate-700 select-none"
                      >
                        <span className="inline-flex items-center gap-0.5">
                          {col}
                          <SortIcon col={col} sortCol={sortCol} sortDir={sortDir} />
                        </span>
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {sortedData.map((mov) => (
                    <tr
                      key={mov.id}
                      className="border-b border-aed-border hover:bg-blue-50/60 cursor-pointer transition-colors"
                      onClick={() => navigate(`/fiducia/propietario/${encodeURIComponent(mov.propietario || '')}`)}
                    >
                      <td className="px-3 py-2.5">
                        {mov.propietario
                          ? <span className="font-medium text-blue-500">{mov.propietario}</span>
                          : <span className="text-slate-300 italic">—</span>}
                      </td>
                      <td className="px-3 py-2.5 text-slate-500 whitespace-nowrap">
                        {mov.encargo?.nombre || '—'}
                        {mov.encargo?.codigo && (
                          <span className="ml-1 text-[10px] font-mono text-blue-400">({mov.encargo.codigo})</span>
                        )}
                      </td>
                      <td className="px-3 py-2.5 text-slate-400 whitespace-nowrap">{mov.nombreHoja}</td>
                      {columnas.map((col) => {
                        const val = mov.datos?.[col];
                        const isNum = numericCols.has(col);
                        const n = isNum ? parseColombian(val) : null;
                        return (
                          <td
                            key={col}
                            className={`px-3 py-2.5 whitespace-nowrap ${isNum ? 'text-right font-mono text-slate-700' : 'text-slate-600'}`}
                          >
                            {isNum && n !== null ? formatCOP(n) : (val ?? '—')}
                          </td>
                        );
                      })}
                    </tr>
                  ))}
                </tbody>

                {/* Fila de totales (sólo columnas numéricas) */}
                {Object.keys(totales).length > 0 && (
                  <tfoot>
                    <tr className="border-t-2 border-aed-border bg-blue-50/60">
                      <td className="px-3 py-2.5 font-semibold text-slate-600 text-[11px] whitespace-nowrap">
                        Totales {pagination && `(pág. ${pagination.page}/${pagination.totalPages})`}
                      </td>
                      <td className="px-3 py-2.5" />
                      <td className="px-3 py-2.5" />
                      {columnas.map((col) => (
                        <td
                          key={col}
                          className={`px-3 py-2.5 whitespace-nowrap ${
                            numericCols.has(col)
                              ? 'text-right font-mono font-semibold text-slate-800 text-[12px]'
                              : ''
                          }`}
                        >
                          {numericCols.has(col) ? formatCOP(totales[col]) : ''}
                        </td>
                      ))}
                    </tr>
                  </tfoot>
                )}
              </table>
            </div>

            {/* Paginación */}
            {pagination && pagination.totalPages > 1 && (
              <div className="px-4 py-3 border-t border-aed-border flex items-center justify-between">
                <span className="text-[11px] text-slate-400">
                  {pagination.total.toLocaleString('es-CO')} registros · Pág. {pagination.page} de {pagination.totalPages}
                </span>
                <div className="flex gap-2">
                  <button
                    disabled={pagination.page === 1 || loading}
                    onClick={() => { const p = page - 1; setPage(p); loadMovimientos({ page: p }); }}
                    className="btn-secondary text-[11px] py-1 px-3 disabled:opacity-40"
                  >Anterior</button>
                  <button
                    disabled={pagination.page === pagination.totalPages || loading}
                    onClick={() => { const p = page + 1; setPage(p); loadMovimientos({ page: p }); }}
                    className="btn-secondary text-[11px] py-1 px-3 disabled:opacity-40"
                  >Siguiente</button>
                </div>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
