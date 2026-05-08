import React, { useState, useEffect, useCallback } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { getNomenclaturas, getEncargo } from '../utils/api';
import NavBar from '../components/NavBar';

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
    <div className="min-h-screen bg-gradient-to-br from-slate-50 via-white to-blue-50">
      {/* Header */}
      <header className="bg-white/80 backdrop-blur-md border-b border-gray-200/60 sticky top-0 z-20">
        <div className="max-w-screen-xl mx-auto px-6 py-4 flex items-center gap-4">
          <button
            onClick={() => navigate('/fiducia')}
            className="flex items-center justify-center w-9 h-9 rounded-lg border border-gray-200 bg-white hover:bg-gray-50 text-gray-500 hover:text-gray-700 transition-all shadow-sm"
            title="Volver a encargos"
          >
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
            </svg>
          </button>
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-3">
              <h1 className="text-lg font-bold text-gray-900 truncate">
                {encargo?.nombre || 'Cargando...'}
              </h1>
              {encargo?.codigo && (
                <span className="text-xs font-mono bg-gradient-to-r from-blue-50 to-indigo-50 text-blue-700 px-2.5 py-1 rounded-md border border-blue-200 shadow-sm">
                  {encargo.codigo}
                </span>
              )}
            </div>
            <p className="text-xs text-gray-500 mt-0.5">
              Nomenclaturas de apartamentos · {pagination?.total || 0} unidades
            </p>
          </div>
          <NavBar />
        </div>
      </header>

      <main className="max-w-screen-xl mx-auto px-6 py-6">
        {/* Search bar */}
        <div className="flex items-center gap-4 mb-6">
          <div className="relative flex-1 max-w-md">
            <svg className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
            </svg>
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Buscar por nomenclatura..."
              className="w-full pl-10 pr-4 py-2.5 text-sm border border-gray-200 rounded-xl bg-white focus:outline-none focus:ring-2 focus:ring-blue-500/30 focus:border-blue-400 shadow-sm transition-all"
            />
          </div>
          {pagination && (
            <span className="text-sm text-gray-500 font-medium">
              {pagination.total} apartamento{pagination.total !== 1 ? 's' : ''}
            </span>
          )}
        </div>

        {/* Grid de nomenclaturas */}
        {loading && !result ? (
          <div className="flex items-center justify-center py-20 text-gray-400">
            <svg className="w-6 h-6 animate-spin mr-3 text-blue-500" fill="none" viewBox="0 0 24 24">
              <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
              <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
            </svg>
            <span className="text-sm font-medium">Cargando nomenclaturas...</span>
          </div>
        ) : items.length === 0 ? (
          <div className="text-center py-20 text-gray-400">
            <svg className="w-16 h-16 mx-auto mb-4 text-gray-300" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1} d="M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-4h1m-1 4h1m-5 10v-5a1 1 0 011-1h2a1 1 0 011 1v5m-4 0h4" />
            </svg>
            <p className="font-semibold text-gray-500">Sin nomenclaturas encontradas</p>
            <p className="text-sm mt-1">Sube un archivo Excel con datos de apartamentos</p>
          </div>
        ) : (
          <>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
              {items.map((item) => (
                <button
                  key={item.nomenclatura}
                  onClick={() => navigate(`/fiducia/${id}/apartamento/${encodeURIComponent(item.nomenclatura)}`)}
                  className="group bg-white rounded-xl border border-gray-200/80 p-5 text-left hover:shadow-lg hover:border-blue-300/60 hover:-translate-y-0.5 transition-all duration-200 cursor-pointer"
                >
                  {/* Header */}
                  <div className="flex items-start justify-between mb-3">
                    <div className="flex items-center gap-2.5">
                      <div className="flex items-center justify-center w-9 h-9 rounded-lg bg-gradient-to-br from-blue-500 to-indigo-600 text-white shadow-md shadow-blue-500/20">
                        <svg className="w-4.5 h-4.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                          <path strokeLinecap="round" strokeLinejoin="round" d="M2.25 21h19.5m-18-18v18m10.5-18v18m6-13.5V21M6.75 6.75h.75m-.75 3h.75m-.75 3h.75m3-6h.75m-.75 3h.75m-.75 3h.75M6.75 21v-3.375c0-.621.504-1.125 1.125-1.125h2.25c.621 0 1.125.504 1.125 1.125V21M3 3h12m-.75 4.5H21m-3.75 3H21m-3.75 3H21" />
                        </svg>
                      </div>
                      <div>
                        <h3 className="font-bold text-gray-900 text-sm group-hover:text-blue-700 transition-colors">
                          {item.nomenclatura}
                        </h3>
                        {item.tipo && (
                          <p className="text-xs text-gray-400 mt-0.5">{item.tipo}</p>
                        )}
                      </div>
                    </div>
                    <svg className="w-4 h-4 text-gray-300 group-hover:text-blue-500 transition-colors flex-shrink-0 mt-1" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                    </svg>
                  </div>

                  {/* Info */}
                  <div className="space-y-2">
                    {item.propietario && (
                      <div className="flex items-center gap-2 text-xs">
                        <svg className="w-3.5 h-3.5 text-gray-400 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
                        </svg>
                        <span className="text-gray-600 truncate">{item.propietario}</span>
                      </div>
                    )}
                    <div className="flex items-center justify-between">
                      <StatusBadge estado={item.estado} />
                      <span className="text-xs text-gray-400 font-medium">
                        {item.totalMovimientos} movimiento{item.totalMovimientos !== 1 ? 's' : ''}
                      </span>
                    </div>
                  </div>
                </button>
              ))}
            </div>

            {/* Paginación */}
            {pagination && pagination.totalPages > 1 && (
              <div className="mt-6 flex items-center justify-between">
                <span className="text-sm text-gray-500">
                  Página {pagination.page} de {pagination.totalPages}
                </span>
                <div className="flex gap-2">
                  <button
                    disabled={pagination.page === 1}
                    onClick={() => { const p = page - 1; setPage(p); load(debouncedSearch, p); }}
                    className="px-4 py-2 text-sm font-medium rounded-lg border border-gray-200 bg-white text-gray-700 hover:bg-gray-50 disabled:opacity-40 disabled:cursor-not-allowed transition-all shadow-sm"
                  >
                    Anterior
                  </button>
                  <button
                    disabled={pagination.page === pagination.totalPages}
                    onClick={() => { const p = page + 1; setPage(p); load(debouncedSearch, p); }}
                    className="px-4 py-2 text-sm font-medium rounded-lg border border-gray-200 bg-white text-gray-700 hover:bg-gray-50 disabled:opacity-40 disabled:cursor-not-allowed transition-all shadow-sm"
                  >
                    Siguiente
                  </button>
                </div>
              </div>
            )}
          </>
        )}
      </main>
    </div>
  );
}
