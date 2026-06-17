import { useState, useEffect, useCallback } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { getNomenclaturas, getEncargo } from '../utils/api';

function useDebounce(value, delay = 300) {
  const [debounced, setDebounced] = useState(value);
  useEffect(() => {
    const t = setTimeout(() => setDebounced(value), delay);
    return () => clearTimeout(t);
  }, [value, delay]);
  return debounced;
}

function estadoColor(estado) {
  if (!estado) return 'bg-slate-100 text-slate-500';
  const e = estado.toLowerCase();
  if (e.includes('escriturado') || e.includes('activo') || e.includes('vigente') || e.includes('prometido'))
    return 'bg-emerald-50 text-emerald-700 border border-emerald-200';
  if (e.includes('cancel') || e.includes('rescili') || e.includes('anulado'))
    return 'bg-red-50 text-red-700 border border-red-200';
  if (e.includes('mora') || e.includes('vencido') || e.includes('pendiente'))
    return 'bg-amber-50 text-amber-700 border border-amber-200';
  if (e.includes('promesa') || e.includes('proceso') || e.includes('tramite') || e.includes('libre'))
    return 'bg-blue-50 text-blue-700 border border-blue-200';
  return 'bg-slate-100 text-slate-500';
}

function formatSaldoCompact(val) {
  if (val == null) return null;
  const n = parseFloat(val);
  if (isNaN(n) || n === 0) return null;
  if (Math.abs(n) >= 1_000_000) return `$${(n / 1_000_000).toFixed(1)}M`;
  if (Math.abs(n) >= 1_000)     return `$${Math.round(n / 1_000)}K`;
  return `$${Math.round(n)}`;
}

export default function EncargoNomenclaturas() {
  const { id } = useParams();
  const navigate = useNavigate();

  const [encargo, setEncargo] = useState(null);
  const [result, setResult]   = useState(null);
  const [search, setSearch]   = useState('');
  const [page, setPage]       = useState(1);
  const [loading, setLoading] = useState(true);

  const debouncedSearch = useDebounce(search);

  const load = useCallback(async (s, p) => {
    setLoading(true);
    try {
      const res = await getNomenclaturas(id, { search: s || undefined, page: p, limit: 50 });
      setResult(res);
    } finally {
      setLoading(false);
    }
  }, [id]);

  useEffect(() => { getEncargo(id).then(setEncargo).catch(() => {}); }, [id]);

  useEffect(() => { setPage(1); load(debouncedSearch, 1); }, [debouncedSearch, load]);

  const pagination = result?.pagination;
  const items      = result?.data || [];

  return (
    <div className="flex flex-col min-h-screen bg-aed-base">
      <header className="h-[52px] bg-white border-b border-aed-border flex items-center px-5 gap-3 flex-shrink-0 sticky top-0 z-10">
        <button
          onClick={() => navigate('/fiducia')}
          className="w-8 h-8 flex items-center justify-center rounded-lg border border-aed-border hover:bg-aed-base transition-colors"
        >
          <svg className="w-4 h-4 text-slate-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
          </svg>
        </button>
        <div className="flex-1 min-w-0 flex items-center gap-2">
          <h1 className="text-[15px] font-bold text-slate-800 truncate">
            {encargo?.nombre || 'Cargando...'}
          </h1>
          {encargo?.codigo && (
            <span className="text-[10px] font-mono bg-blue-50 text-blue-500 border border-blue-100 px-1.5 py-0.5 rounded">
              {encargo.codigo}
            </span>
          )}
        </div>
        <span className="text-[11px] text-slate-400">{pagination?.total ?? 0} unidades</span>
      </header>

      <div className="flex-1 p-5 flex flex-col gap-4">
        <div className="flex items-center gap-3">
          <div className="relative flex-1 max-w-sm">
            <svg className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
            </svg>
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Buscar por nomenclatura, inventario o comprador…"
              className="input w-full pl-9 pr-4 py-2 text-[13px]"
            />
          </div>
        </div>

        {loading && !result ? (
          <div className="flex items-center justify-center py-20 text-slate-400 text-[13px] gap-2">
            <svg className="w-5 h-5 animate-spin text-blue-400" fill="none" viewBox="0 0 24 24">
              <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
              <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
            </svg>
            Cargando unidades…
          </div>
        ) : items.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-20 text-slate-400">
            <svg className="w-14 h-14 mb-3 text-slate-200" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1} d="M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-4h1m-1 4h1m-5 10v-5a1 1 0 011-1h2a1 1 0 011 1v5m-4 0h4" />
            </svg>
            <p className="text-[13px] font-medium">Sin unidades encontradas</p>
            <p className="text-[12px] mt-1">
              {search ? 'Ajusta los filtros.' : 'Ejecuta el backfill en el módulo Negocios para cargar los datos.'}
            </p>
          </div>
        ) : (
          <>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
              {items.map((item) => {
                const saldo = formatSaldoCompact(item.saldoActual);
                const saldoNum = item.saldoActual ? parseFloat(item.saldoActual) : 0;
                return (
                  <button
                    key={item.nomenclatura}
                    onClick={() => navigate(`/fiducia/${id}/apartamento/${encodeURIComponent(item.nomenclatura)}`)}
                    className="group card p-4 text-left hover:border-blue-200 hover:shadow-md hover:-translate-y-0.5 transition-all duration-150 cursor-pointer"
                  >
                    <div className="flex items-start justify-between mb-2.5">
                      <div className="flex items-center gap-2.5">
                        <div className="w-8 h-8 rounded-lg bg-blue-50 border border-blue-100 flex items-center justify-center flex-shrink-0">
                          <svg className="w-4 h-4 text-blue-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                            <path strokeLinecap="round" strokeLinejoin="round" d="M2.25 21h19.5m-18-18v18m10.5-18v18m6-13.5V21M6.75 6.75h.75m-.75 3h.75m-.75 3h.75m3-6h.75m-.75 3h.75m-.75 3h.75M6.75 21v-3.375c0-.621.504-1.125 1.125-1.125h2.25c.621 0 1.125.504 1.125 1.125V21M3 3h12m-.75 4.5H21m-3.75 3H21m-3.75 3H21" />
                          </svg>
                        </div>
                        <div>
                          <h3 className="font-bold text-slate-800 text-[13px] group-hover:text-blue-600 transition-colors">
                            {item.nomenclatura}
                          </h3>
                          {(item.tipo || item.inventario) && (
                            <p className="text-[11px] text-slate-400 mt-0.5 truncate max-w-[160px]">
                              {item.tipo || item.inventario}
                            </p>
                          )}
                        </div>
                      </div>
                      <svg className="w-4 h-4 text-slate-200 group-hover:text-blue-400 transition-colors flex-shrink-0 mt-0.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                      </svg>
                    </div>

                    {/* Comprador */}
                    {item.compradorPrincipal && (
                      <div className="flex items-center gap-1.5 mb-2">
                        <svg className="w-3 h-3 text-slate-400 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
                        </svg>
                        <span className="text-[12px] text-slate-600 truncate">{item.compradorPrincipal}</span>
                        {item.nroId && (
                          <span className="text-[10px] text-slate-400 font-mono ml-1 flex-shrink-0">{item.nroId}</span>
                        )}
                      </div>
                    )}

                    {/* Footer: estado + saldo + movimientos */}
                    <div className="flex items-center justify-between gap-2">
                      <div className="flex items-center gap-1.5 min-w-0">
                        {item.estado && (
                          <span className={`text-[9px] font-bold px-1.5 py-0.5 rounded-full flex-shrink-0 ${estadoColor(item.estado)}`}>
                            {item.estado}
                          </span>
                        )}
                        {saldo && (
                          <span className={`text-[10px] font-semibold tabular-nums flex-shrink-0 ${saldoNum > 0 ? 'text-emerald-600' : 'text-slate-400'}`}>
                            {saldo}
                          </span>
                        )}
                      </div>
                      <span className="text-[11px] text-slate-400 flex-shrink-0">
                        {item.totalMovimientos} mov.
                      </span>
                    </div>
                  </button>
                );
              })}
            </div>

            {pagination && pagination.totalPages > 1 && (
              <div className="flex items-center justify-between">
                <span className="text-[12px] text-slate-400">
                  Página {pagination.page} de {pagination.totalPages}
                </span>
                <div className="flex gap-2">
                  <button
                    disabled={pagination.page === 1}
                    onClick={() => { const p = page - 1; setPage(p); load(debouncedSearch, p); }}
                    className="btn-secondary text-[12px] py-1.5 px-3 disabled:opacity-40"
                  >Anterior</button>
                  <button
                    disabled={pagination.page === pagination.totalPages}
                    onClick={() => { const p = page + 1; setPage(p); load(debouncedSearch, p); }}
                    className="btn-secondary text-[12px] py-1.5 px-3 disabled:opacity-40"
                  >Siguiente</button>
                </div>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}
