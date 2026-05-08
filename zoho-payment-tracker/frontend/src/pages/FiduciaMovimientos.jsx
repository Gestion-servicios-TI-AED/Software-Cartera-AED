import React, { useState, useEffect, useCallback } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { getMovimientosFiducia, getPropietarios, getEncargos } from '../utils/api';
import NavBar from '../components/NavBar';

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
    <div className="min-h-screen bg-gray-50">
      <header className="bg-white border-b border-gray-200 sticky top-0 z-10">
        <div className="max-w-screen-xl mx-auto px-6 py-4 flex items-center gap-6">
          <div>
            <h1 className="text-xl font-bold text-gray-900">Movimientos Fiduciarios</h1>
            <p className="text-xs text-gray-500 mt-0.5">Todos los registros de todos los encargos</p>
          </div>
          <NavBar />
        </div>
      </header>

      <main className="max-w-screen-xl mx-auto px-6 py-6">
        {/* Filtros */}
        <div className="bg-white rounded-xl border border-gray-200 p-4 mb-5 flex flex-wrap gap-3 items-end">
          {/* Búsqueda libre */}
          <div className="flex-1 min-w-48">
            <label className="block text-xs font-medium text-gray-500 mb-1">Buscar</label>
            <div className="relative">
              <svg className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
              </svg>
              <input
                type="text"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Buscar en todos los campos..."
                className="w-full pl-9 pr-4 py-2 text-sm border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>
          </div>

          {/* Filtro propietario */}
          <div className="min-w-56">
            <label className="block text-xs font-medium text-gray-500 mb-1">Propietario</label>
            <select
              value={propietario}
              onChange={(e) => setPropietario(e.target.value)}
              className="w-full py-2 px-3 text-sm border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
            >
              <option value="">Todos los propietarios</option>
              {propietarios.map((p) => (
                <option key={p.propietario} value={p.propietario}>
                  {p.propietario} ({p.total})
                </option>
              ))}
            </select>
          </div>

          {/* Filtro encargo */}
          <div className="min-w-56">
            <label className="block text-xs font-medium text-gray-500 mb-1">Encargo fiduciario</label>
            <select
              value={encargId}
              onChange={(e) => setEncargId(e.target.value)}
              className="w-full py-2 px-3 text-sm border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
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
              className="btn-secondary text-sm py-2"
            >
              Limpiar filtros
            </button>
          )}

          {pagination && (
            <span className="text-sm text-gray-500 ml-auto self-center">
              {pagination.total.toLocaleString()} registros
            </span>
          )}
        </div>

        {/* Tabla */}
        {loading && !movimientos ? (
          <div className="flex items-center justify-center py-16 text-gray-400">
            <svg className="w-5 h-5 animate-spin mr-2" fill="none" viewBox="0 0 24 24">
              <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
              <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
            </svg>
            Cargando...
          </div>
        ) : !movimientos?.data?.length ? (
          <div className="text-center py-16 text-gray-400">
            <svg className="w-12 h-12 mx-auto mb-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
            </svg>
            <p className="font-medium">Sin movimientos</p>
            <p className="text-sm mt-1">Importa un archivo Excel desde el módulo Fiducia</p>
          </div>
        ) : (
          <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-gray-200 bg-gray-50">
                    <th className="px-3 py-2.5 text-left text-xs font-semibold text-gray-500 uppercase tracking-wide whitespace-nowrap">Propietario</th>
                    <th className="px-3 py-2.5 text-left text-xs font-semibold text-gray-500 uppercase tracking-wide whitespace-nowrap">Encargo</th>
                    <th className="px-3 py-2.5 text-left text-xs font-semibold text-gray-500 uppercase tracking-wide whitespace-nowrap">Hoja</th>
                    {columnas.map((col) => (
                      <th key={col} className="px-3 py-2.5 text-left text-xs font-semibold text-gray-500 uppercase tracking-wide whitespace-nowrap">
                        {col}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {movimientos.data.map((mov) => (
                    <tr
                      key={mov.id}
                      className="border-b border-gray-100 hover:bg-blue-50 cursor-pointer"
                      onClick={() => navigate(`/fiducia/propietario/${encodeURIComponent(mov.propietario || '')}`)}
                    >
                      <td className="px-3 py-2.5">
                        {mov.propietario ? (
                          <span className="font-medium text-blue-700 hover:underline">{mov.propietario}</span>
                        ) : (
                          <span className="text-gray-400 italic">—</span>
                        )}
                      </td>
                      <td className="px-3 py-2.5 text-gray-500 text-xs whitespace-nowrap">
                        {mov.encargo?.nombre || '—'}
                        {mov.encargo?.codigo && <span className="ml-1 text-blue-600">({mov.encargo.codigo})</span>}
                      </td>
                      <td className="px-3 py-2.5 text-gray-500 text-xs whitespace-nowrap">{mov.nombreHoja}</td>
                      {columnas.map((col) => (
                        <td key={col} className="px-3 py-2.5 text-gray-700 whitespace-nowrap">
                          {mov.datos?.[col] ?? '—'}
                        </td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {pagination && pagination.totalPages > 1 && (
              <div className="px-4 py-3 border-t border-gray-100 flex items-center justify-between">
                <span className="text-xs text-gray-500">
                  Página {pagination.page} de {pagination.totalPages} · {pagination.total.toLocaleString()} registros
                </span>
                <div className="flex gap-2">
                  <button
                    disabled={pagination.page === 1 || loading}
                    onClick={() => { const p = page - 1; setPage(p); loadMovimientos({ page: p }); }}
                    className="btn-secondary text-xs py-1 px-3 disabled:opacity-40"
                  >Anterior</button>
                  <button
                    disabled={pagination.page === pagination.totalPages || loading}
                    onClick={() => { const p = page + 1; setPage(p); loadMovimientos({ page: p }); }}
                    className="btn-secondary text-xs py-1 px-3 disabled:opacity-40"
                  >Siguiente</button>
                </div>
              </div>
            )}
          </div>
        )}
      </main>
    </div>
  );
}
