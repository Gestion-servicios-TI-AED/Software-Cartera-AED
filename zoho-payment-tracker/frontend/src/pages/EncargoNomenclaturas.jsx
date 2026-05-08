import React, { useState, useEffect, useCallback } from 'react';
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

function StatusBadge({ estado }) {
  if (!estado) return <span className="text-gray-400 text-xs">—</span>;
  const s = estado.toLowerCase();
  let colors = 'bg-gray-100 text-gray-600';
  if (s.includes('vigente') || s.includes('activ') || s.includes('aprobad')) colors = 'bg-emerald-50 text-emerald-700 border-emerald-200';
  else if (s.includes('vencid') || s.includes('mora') || s.includes('cancel')) colors = 'bg-red-50 text-red-700 border-red-200';
  else if (s.includes('pendi') || s.includes('proces')) colors = 'bg-amber-50 text-amber-700 border-amber-200';
  else if (s.includes('pag') || s.includes('recaud')) colors = 'bg-blue-50 text-blue-700 border-blue-200';

  return (
    <span className={`text-xs font-medium px-2.5 py-1 rounded-full border ${colors}`}>
      {estado}
    </span>
  );
}

export default function EncargoNomenclaturas() {
  const { id } = useParams();
  const navigate = useNavigate();

  const [encargo, setEncargo] = useState(null);
  const [result, setResult] = useState(null);
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(1);
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

  useEffect(() => {
    getEncargo(id).then(setEncargo).catch(() => {});
  }, [id]);

  useEffect(() => {
    setPage(1);
    load(debouncedSearch, 1);
  }, [debouncedSearch, load]);

  const pagination = result?.pagination;
  const items = result?.data || [];

  return (
    <div className="flex flex-col min-h-screen bg-aed-base">
      <header className="h-[52px] bg-white border-b border-aed-border flex items-center px-5 gap-3 flex-shrink-0 sticky top-0 z-10">
        <button
          onClick={() => navigate('/fiducia')}
          className="w-8 h-8 flex items-center justify-center rounded-lg border border-aed-border hover:bg-aed-base transition-colors"
          title="Volver"
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
        <span className="text-[11px] text-slate-400">{pagination?.total || 0} unidades</span>
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
              placeholder="Buscar por nomenclatura..."
              className="input w-full pl-9 pr-4 py-2 text-[13px]"
            />
          </div>
          {pagination && (
            <span className="text-[12px] text-slate-400">
              {pagination.total} apartamento{pagination.total !== 1 ? 's' : ''}
            </span>
          )}
        </div>

        {loading && !result ? (
          <div className="flex items-center justify-center py-20 text-slate-400 text-[13px] gap-2">
            <svg className="w-5 h-5 animate-spin text-blue-400" fill="none" viewBox="0 0 24 24">
              <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
              <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
            </svg>
            Cargando nomenclaturas...
          </div>
        ) : items.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-20 text-slate-400">
            <svg className="w-14 h-14 mb-3 text-slate-200" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1} d="M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-4h1m-1 4h1m-5 10v-5a1 1 0 011-1h2a1 1 0 011 1v5m-4 0h4" />
            </svg>
            <p className="text-[13px] font-medium">Sin nomenclaturas encontradas</p>
            <p className="text-[12px] mt-1">Sube un archivo Excel con datos de apartamentos</p>
          </div>
        ) : (
          <>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
              {items.map((item) => (
                <button
                  key={item.nomenclatura}
                  onClick={() => navigate(`/fiducia/${id}/apartamento/${encodeURIComponent(item.nomenclatura)}`)}
                  className="group card p-4 text-left hover:border-blue-200 hover:shadow-md hover:-translate-y-0.5 transition-all duration-150 cursor-pointer"
                >
                  <div className="flex items-start justify-between mb-3">
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
                        {item.tipo && <p className="text-[11px] text-slate-400 mt-0.5">{item.tipo}</p>}
                      </div>
                    </div>
                    <svg className="w-4 h-4 text-slate-200 group-hover:text-blue-400 transition-colors flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                    </svg>
                  </div>

                  <div className="flex flex-col gap-1.5">
                    {item.propietario && (
                      <div className="flex items-center gap-1.5 text-[12px]">
                        <svg className="w-3 h-3 text-slate-400 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
                        </svg>
                        <span className="text-slate-500 truncate">{item.propietario}</span>
                      </div>
                    )}
                    <div className="flex items-center justify-between">
                      <StatusBadge estado={item.estado} />
                      <span className="text-[11px] text-slate-400">
                        {item.totalMovimientos} mov.
                      </span>
                    </div>
                  </div>
                </button>
              ))}
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
