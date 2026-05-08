import React, { useState, useEffect, useCallback } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { getMovimientosFiducia, getPropietarios, getEncargos } from '../utils/api';

function useDebounce(value, delay = 350) {
  const [debounced, setDebounced] = useState(value);
  useEffect(() => {
    const t = setTimeout(() => setDebounced(value), delay);
    return () => clearTimeout(t);
  }, [value, delay]);
  return debounced;
}

export default function FiduciaMovimientos() {
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();

  const [movimientos, setMovimientos] = useState(null);
  const [propietarios, setPropietarios] = useState([]);
  const [encargos, setEncargos] = useState([]);
  const [loading, setLoading] = useState(true);

  // Filtros
  const [search, setSearch] = useState(searchParams.get('search') || '');
  const [propietario, setPropietario] = useState(searchParams.get('propietario') || '');
  const [encargId, setEncargId] = useState(searchParams.get('encargId') || '');
  const [page, setPage] = useState(1);

  const debouncedSearch = useDebounce(search);

  async function loadMovimientos(overrides = {}) {
    setLoading(true);
    try {
      const params = {
        search: (overrides.search ?? debouncedSearch) || undefined,
        propietario: (overrides.propietario ?? propietario) || undefined,
        encargId: (overrides.encargId ?? encargId) || undefined,
        page: overrides.page ?? page,
        limit: 50,
      };
      const res = await getMovimientosFiducia(params);
      setMovimientos(res);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    getEncargos({ limit: 100 }).then((r) => setEncargos(r.data || []));
    getPropietarios().then(setPropietarios);
  }, []);

  useEffect(() => {
    setPage(1);
    loadMovimientos({ page: 1 });
  }, [debouncedSearch, propietario, encargId]);

  // Derivar columnas dinámicamente del primer registro
  const columnas = movimientos?.data?.length
    ? Object.keys(movimientos.data[0].datos || {})
    : [];

  const pagination = movimientos?.pagination;

  return (
    <div className="flex flex-col min-h-screen bg-aed-base">
      <header className="h-[52px] bg-white border-b border-aed-border flex items-center px-5 gap-3 flex-shrink-0 sticky top-0 z-10">
        <h1 className="text-[15px] font-bold text-slate-800">Movimientos Fiduciarios</h1>
        <span className="text-xs text-slate-400">Todos los encargos</span>
      </header>

      <div className="flex-1 p-5 flex flex-col gap-4">
        {/* Filtros */}
        <div className="card p-4 flex flex-wrap gap-3 items-end">
          <div className="flex-1 min-w-48">
            <label className="section-label block mb-1">Buscar</label>
            <div className="relative">
              <svg className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
              </svg>
              <input
                type="text"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Buscar en todos los campos..."
                className="input w-full pl-9 pr-4 py-2 text-[13px]"
              />
            </div>
          </div>

          <div className="min-w-52">
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

          <div className="min-w-52">
            <label className="section-label block mb-1">Encargo fiduciario</label>
            <select
              value={encargId}
              onChange={(e) => setEncargId(e.target.value)}
              className="input w-full py-2 px-3 text-[13px]"
            >
              <option value="">Todos los encargos</option>
              {encargos.map((e) => (
                <option key={e.id} value={e.id}>
                  {e.nombre}{e.codigo ? ` (${e.codigo})` : ''}
                </option>
              ))}
            </select>
          </div>

          {(search || propietario || encargId) && (
            <button
              onClick={() => { setSearch(''); setPropietario(''); setEncargId(''); }}
              className="btn-secondary text-[12px] py-2"
            >
              Limpiar filtros
            </button>
          )}

          {pagination && (
            <span className="text-[12px] text-slate-400 ml-auto self-center">
              {pagination.total.toLocaleString()} registros
            </span>
          )}
        </div>

        {/* Tabla */}
        {loading && !movimientos ? (
          <div className="flex items-center justify-center py-16 text-slate-400 text-[13px] gap-2">
            <svg className="w-5 h-5 animate-spin text-blue-400" fill="none" viewBox="0 0 24 24">
              <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
              <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
            </svg>
            Cargando...
          </div>
        ) : !movimientos?.data?.length ? (
          <div className="flex flex-col items-center justify-center py-16 text-slate-400">
            <svg className="w-12 h-12 mb-3 text-slate-200" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
            </svg>
            <p className="text-[13px] font-medium">Sin movimientos</p>
            <p className="text-[12px] mt-1">Importa un archivo Excel desde el módulo Fiducia</p>
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
                      <th key={col} className="section-label px-3 py-2.5 text-left whitespace-nowrap">
                        {col}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {movimientos.data.map((mov) => (
                    <tr
                      key={mov.id}
                      className="border-b border-aed-border hover:bg-blue-50/60 cursor-pointer transition-colors"
                      onClick={() => navigate(`/fiducia/propietario/${encodeURIComponent(mov.propietario || '')}`)}
                    >
                      <td className="px-3 py-2.5">
                        {mov.propietario ? (
                          <span className="font-medium text-blue-500">{mov.propietario}</span>
                        ) : (
                          <span className="text-slate-300 italic">—</span>
                        )}
                      </td>
                      <td className="px-3 py-2.5 text-slate-500 whitespace-nowrap">
                        {mov.encargo?.nombre || '—'}
                        {mov.encargo?.codigo && <span className="ml-1 text-blue-400">({mov.encargo.codigo})</span>}
                      </td>
                      <td className="px-3 py-2.5 text-slate-400 whitespace-nowrap">{mov.nombreHoja}</td>
                      {columnas.map((col) => (
                        <td key={col} className="px-3 py-2.5 text-slate-600 whitespace-nowrap">
                          {mov.datos?.[col] ?? '—'}
                        </td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {pagination && pagination.totalPages > 1 && (
              <div className="px-4 py-3 border-t border-aed-border flex items-center justify-between">
                <span className="text-[11px] text-slate-400">
                  Página {pagination.page} de {pagination.totalPages} · {pagination.total.toLocaleString()} registros
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
