import { useState, useEffect, useCallback, useRef } from 'react';
import { Search, X, Warehouse, RefreshCw, Building2 } from 'lucide-react';
import { getInventario, getInventarioItem, triggerInventarioSync, getInventarioSyncStatus } from '../utils/api';

function useDebounce(value, delay = 350) {
  const [debounced, setDebounced] = useState(value);
  useEffect(() => {
    const t = setTimeout(() => setDebounced(value), delay);
    return () => clearTimeout(t);
  }, [value, delay]);
  return debounced;
}

// Colores de estado propios de Inventario (vocabulario de venta: Disponible,
// Reservado, Separado, Vendido, VIP…) — distinto del vocabulario de Negocios.
function estadoInventarioClass(estado) {
  const e = (estado || '').toLowerCase();
  if (e.includes('dispon')) return 'text-emerald-700 bg-emerald-50';
  if (e.includes('vendid')) return 'text-sky-700 bg-sky-50';
  if (e.includes('vip')) return 'text-violet-700 bg-violet-50';
  if (e.includes('reserv') || e.includes('separad') || e.includes('pend') || e.includes('stand')) return 'text-amber-700 bg-amber-50';
  return 'text-slate-600 bg-slate-100';
}

// Convierte un valor crudo de Zoho a texto mostrable, sin reformatear lo que
// ya viene limpio. Objetos lookup (Owner, Proyecto…) muestran su nombre;
// arreglos se listan separados por coma; booleanos como Sí/No.
function formatValor(v) {
  if (v == null || v === '') return null;
  if (typeof v === 'boolean') return v ? 'Sí' : 'No';
  if (Array.isArray(v)) return v.length ? v.map((x) => (typeof x === 'object' ? x.name || JSON.stringify(x) : String(x))).join(', ') : null;
  if (typeof v === 'object') return v.name || v.display_label || JSON.stringify(v);
  return String(v);
}

function toLabel(key) {
  return key.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());
}

// ── Panel de detalle ─────────────────────────────────────────────────────

function InventarioDetalle({ id }) {
  const [item, setItem] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    setLoading(true);
    setError(null);
    getInventarioItem(id)
      .then(setItem)
      .catch((err) => setError(err.response?.data?.error || err.message))
      .finally(() => setLoading(false));
  }, [id]);

  if (loading) {
    return (
      <div className="flex items-center justify-center h-full min-h-[200px]">
        <div className="flex items-center gap-2 text-slate-500 text-[15px]">
          <svg className="w-5 h-5 animate-spin text-brand" fill="none" viewBox="0 0 24 24">
            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
          </svg>
          Cargando...
        </div>
      </div>
    );
  }

  if (error || !item) {
    return (
      <div className="flex items-center justify-center h-full min-h-[200px]">
        <p className="text-red-500 text-[15px]">{error || 'No encontrado'}</p>
      </div>
    );
  }

  const entries = Object.entries(item.datos || {}).filter(([, v]) => formatValor(v) !== null);

  return (
    <div className="flex flex-col gap-3 p-5">
      {/* Header */}
      <div className="card px-4 py-3">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <p className="text-[12px] text-slate-500 mb-0.5 uppercase tracking-wide">Referencia</p>
            <h2 className="font-heading text-[19px] font-bold text-ink font-mono">{item.nombre || '—'}</h2>
            <p className="text-[14px] text-slate-500 mt-0.5">
              {[item.proyecto, item.torre, item.piso].filter(Boolean).join(' · ')}
            </p>
          </div>
          <div className="flex flex-col items-end gap-1.5 flex-shrink-0">
            {item.estado && (
              <span className={`text-[12px] font-bold px-2.5 py-1 rounded-full ${estadoInventarioClass(item.estado)}`}>
                {item.estado}
              </span>
            )}
            {item.categoria && (
              <span className="text-[13px] text-slate-500 bg-aed-base border border-aed-border px-2 py-0.5 rounded-full">
                {item.categoria}
              </span>
            )}
          </div>
        </div>
        {item.referenciaRecaudo && (
          <p className="text-[13px] text-slate-500 mt-2 font-mono">Ref. recaudo: {item.referenciaRecaudo}</p>
        )}
      </div>

      {/* Todas las variables */}
      <div className="card overflow-hidden">
        <div className="px-4 py-3 border-b border-aed-border flex items-center justify-between">
          <span className="text-[14px] font-semibold text-slate-700">Todas las variables</span>
          <span className="text-[12px] text-slate-500 bg-aed-base border border-aed-border px-2 py-0.5 rounded-full">
            {entries.length}
          </span>
        </div>
        <div className="bg-white columns-1 lg:columns-2 lg:gap-8 lg:[column-rule:1px_solid_#e9edf2]">
          {entries.map(([k, v]) => (
            <div key={k} className="flex items-baseline justify-between gap-6 px-4 py-2 bg-white border-b border-aed-border/60 break-inside-avoid">
              <span className="section-label shrink-0">{toLabel(k)}</span>
              <span className="text-[14px] font-medium text-slate-800 text-right break-words">{formatValor(v)}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

// ── Lista ────────────────────────────────────────────────────────────────

function InventarioItemRow({ item, selected, onClick }) {
  const isSelected = selected === item.id;
  return (
    <button
      onClick={() => onClick(item.id)}
      className={`w-full text-left px-3 py-2.5 border-b border-aed-border transition-colors relative ${
        isSelected ? 'bg-brand-soft' : 'hover:bg-brand-tint'
      }`}
    >
      {isSelected && <span className="absolute left-0 top-2 bottom-2 w-0.5 bg-brand rounded-r" />}
      <div className="flex items-start justify-between gap-2">
        <div className="flex-1 min-w-0">
          <p className={`text-[14px] font-semibold truncate ${isSelected ? 'text-brand-strong' : 'text-slate-700'}`}>
            {item.nombre || '(sin nombre)'}
          </p>
          <p className="text-[13px] text-slate-500 truncate mt-0.5">
            {[item.proyecto, item.torre].filter(Boolean).join(' · ')}
          </p>
        </div>
        {item.estado && (
          <span className={`text-[12px] font-bold px-1.5 py-0.5 rounded-full flex-shrink-0 ${estadoInventarioClass(item.estado)}`}>
            {item.estado}
          </span>
        )}
      </div>
    </button>
  );
}

function useSync(onSuccess) {
  const [syncing, setSyncing] = useState(false);
  const pollRef = useRef(null);

  const trigger = useCallback(async () => {
    setSyncing(true);
    try {
      await triggerInventarioSync();
    } catch {
      // el backfill puede seguir corriendo igual
    }
    let attempts = 0;
    pollRef.current = setInterval(async () => {
      attempts++;
      try {
        const res = await getInventarioSyncStatus();
        if (!res.running) {
          clearInterval(pollRef.current);
          setSyncing(false);
          if (res.result?.ok) onSuccess();
        }
      } catch {
        /* seguir intentando */
      }
      if (attempts > 120) {
        clearInterval(pollRef.current);
        setSyncing(false);
      }
    }, 2000);
  }, [onSuccess]);

  useEffect(() => () => clearInterval(pollRef.current), []);
  return { syncing, trigger };
}

export default function Inventario() {
  const [items, setItems] = useState([]);
  const [pagination, setPagination] = useState(null);
  const [proyectos, setProyectos] = useState([]);
  const [categorias, setCategorias] = useState([]);
  const [estados, setEstados] = useState([]);
  const [loading, setLoading] = useState(true);
  const [page, setPage] = useState(1);

  const [search, setSearch] = useState('');
  const [proyectoFilter, setProyectoFilter] = useState('');
  const [categoriaFilter, setCategoriaFilter] = useState('');
  const [estadoFilter, setEstadoFilter] = useState('');
  const [selected, setSelected] = useState(null);

  const debouncedSearch = useDebounce(search);
  const filtersRef = useRef({});
  filtersRef.current = { debouncedSearch, proyectoFilter, categoriaFilter, estadoFilter };

  const fetchList = useCallback((p = 1) => {
    const { debouncedSearch: s, proyectoFilter: proy, categoriaFilter: cat, estadoFilter: est } = filtersRef.current;
    setLoading(true);
    getInventario({ search: s || undefined, proyecto: proy || undefined, categoria: cat || undefined, estado: est || undefined, page: p, limit: 50 })
      .then((res) => {
        setItems(res.data);
        setPagination(res.pagination);
        if (res.proyectos) setProyectos(res.proyectos);
        if (res.categorias) setCategorias(res.categorias);
        if (res.estados) setEstados(res.estados);
        setPage(p);
      })
      .catch(console.error)
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => { fetchList(1); }, [debouncedSearch, proyectoFilter, categoriaFilter, estadoFilter, fetchList]);

  const { syncing, trigger: triggerSync } = useSync(() => fetchList(1));

  const clearFilters = () => { setSearch(''); setProyectoFilter(''); setCategoriaFilter(''); setEstadoFilter(''); };
  const hasFilters = search || proyectoFilter || categoriaFilter || estadoFilter;
  const isEmpty = !loading && pagination?.total === 0 && !hasFilters;

  return (
    <div className="flex h-screen overflow-hidden">
      {/* Panel izquierdo */}
      <div className="w-[320px] flex-shrink-0 bg-white border-r border-aed-border flex flex-col min-w-0">
        <div className="px-3 py-3 border-b border-aed-border">
          <div className="flex items-center gap-2 mb-2">
            <h1 className="text-[15px] font-bold text-slate-800 flex-1">Inventario</h1>
            {pagination && !isEmpty && (
              <span className="text-[12px] text-slate-500 bg-aed-base border border-aed-border px-2 py-0.5 rounded-full">
                {pagination.total}
              </span>
            )}
            <button
              onClick={triggerSync}
              disabled={syncing}
              title="Sincronizar inventario desde Zoho"
              className="w-7 h-7 flex items-center justify-center rounded-md border border-aed-border bg-white hover:bg-aed-base disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
            >
              <RefreshCw size={12} className={`text-slate-500 ${syncing ? 'animate-spin' : ''}`} />
            </button>
          </div>

          <div className="flex flex-col gap-2.5">
            <div className="field">
              <label className="field-label">
                <Search size={13} className="text-brand" />
                Buscar
              </label>
              <div className="relative">
                <Search size={13} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-500" />
                <input
                  type="text"
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  placeholder="Nombre, torre o referencia…"
                  className="input pl-7 text-[14px] h-8 py-0"
                />
                {search && (
                  <button onClick={() => setSearch('')} className="absolute right-2 top-1/2 -translate-y-1/2 text-slate-500 hover:text-slate-600">
                    <X size={12} />
                  </button>
                )}
              </div>
            </div>

            {proyectos.length > 0 && (
              <div className="field">
                <label className="field-label">
                  <Building2 size={13} className="text-[#7c3aed]" />
                  Proyecto
                </label>
                <select value={proyectoFilter} onChange={(e) => setProyectoFilter(e.target.value)} className="input text-[14px] h-8 py-0 pr-2 leading-none">
                  <option value="">Todos los proyectos</option>
                  {proyectos.map((p) => <option key={p} value={p}>{p}</option>)}
                </select>
              </div>
            )}

            {categorias.length > 0 && (
              <div className="field">
                <label className="field-label">Categoría</label>
                <select value={categoriaFilter} onChange={(e) => setCategoriaFilter(e.target.value)} className="input text-[14px] h-8 py-0 pr-2 leading-none">
                  <option value="">Todas las categorías</option>
                  {categorias.map((c) => <option key={c} value={c}>{c}</option>)}
                </select>
              </div>
            )}

            {estados.length > 0 && (
              <div className="field">
                <label className="field-label">Estado</label>
                <select value={estadoFilter} onChange={(e) => setEstadoFilter(e.target.value)} className="input text-[14px] h-8 py-0 pr-2 leading-none">
                  <option value="">Todos los estados</option>
                  {estados.map((e) => <option key={e} value={e}>{e}</option>)}
                </select>
              </div>
            )}

            {hasFilters && (
              <button onClick={clearFilters} className="text-[13px] text-brand hover:text-brand-strong font-medium flex items-center gap-1 py-0.5">
                <X size={11} /> Limpiar filtros
              </button>
            )}
          </div>
        </div>

        <div className="flex-1 overflow-y-auto">
          {loading && (
            <div className="flex items-center justify-center py-10">
              <svg className="w-5 h-5 animate-spin text-brand" fill="none" viewBox="0 0 24 24">
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
              </svg>
            </div>
          )}

          {!loading && items.length === 0 && !isEmpty && (
            <div className="px-4 py-8 text-center">
              <p className="text-[14px] text-slate-500">Sin resultados para los filtros aplicados.</p>
            </div>
          )}

          {!loading && items.map((item) => (
            <InventarioItemRow key={item.id} item={item} selected={selected} onClick={setSelected} />
          ))}
        </div>

        {pagination && pagination.totalPages > 1 && (
          <div className="flex items-center justify-between px-3 py-2 border-t border-aed-border bg-aed-base">
            <button disabled={page <= 1} onClick={() => fetchList(page - 1)}
              className="text-[13px] text-slate-500 hover:text-slate-700 disabled:opacity-40 disabled:cursor-not-allowed">← Ant.</button>
            <span className="text-[12px] text-slate-500">{page}/{pagination.totalPages}</span>
            <button disabled={page >= pagination.totalPages} onClick={() => fetchList(page + 1)}
              className="text-[13px] text-slate-500 hover:text-slate-700 disabled:opacity-40 disabled:cursor-not-allowed">Sig. →</button>
          </div>
        )}
      </div>

      {/* Panel derecho */}
      <div className="flex-1 min-w-0 overflow-y-auto bg-aed-base">
        {selected ? (
          <InventarioDetalle key={selected} id={selected} />
        ) : isEmpty ? (
          <div className="flex flex-col items-center justify-center h-full text-center px-8">
            <div className="w-14 h-14 rounded-2xl bg-white border border-aed-border flex items-center justify-center mb-4">
              <Warehouse size={24} className="text-slate-300" />
            </div>
            <p className="text-[16px] font-medium text-slate-600 mb-1">Sin inventario cargado</p>
            <p className="text-[14px] text-slate-500 mb-5 max-w-xs">
              Haz clic en Sincronizar para traer todo el inventario desde el módulo Products de Zoho.
            </p>
            <button onClick={triggerSync} disabled={syncing} className="btn-primary text-[14px] px-5 py-2 gap-2 disabled:opacity-60">
              <RefreshCw size={13} className={syncing ? 'animate-spin' : ''} />
              {syncing ? 'Sincronizando…' : 'Sincronizar inventario'}
            </button>
          </div>
        ) : (
          <div className="flex flex-col items-center justify-center h-full text-center px-8">
            <p className="text-[14px] text-slate-500">Selecciona un ítem de la lista para ver todas sus variables.</p>
          </div>
        )}
      </div>
    </div>
  );
}
