import React, { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { getEncargo, getHoja } from '../utils/api';
import { formatDateTime } from '../utils/format';
import NavBar from '../components/NavBar';

function SheetTable({ encargoId, hoja }) {
  const [data, setData] = useState(null);
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(false);
  const [search, setSearch] = useState('');

  useEffect(() => {
    setLoading(true);
    getHoja(encargoId, hoja.id, 1)
      .then(setData)
      .catch(() => setData(null))
      .finally(() => setLoading(false));
  }, [hoja.id]);

  function loadPage(p) {
    setPage(p);
    setLoading(true);
    getHoja(encargoId, hoja.id, p)
      .then(setData)
      .finally(() => setLoading(false));
  }

  if (loading && !data) {
    return (
      <div className="flex items-center justify-center py-12 text-gray-400">
        <svg className="w-5 h-5 animate-spin mr-2" fill="none" viewBox="0 0 24 24">
          <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
          <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
        </svg>
        Cargando hoja...
      </div>
    );
  }

  if (!data) return <p className="text-gray-400 text-sm py-4">Sin datos</p>;

  const columnas = Array.isArray(data.columnas) ? data.columnas : [];
  const filas = Array.isArray(data.filas) ? data.filas : [];

  // Filtrado client-side sobre la página actual
  const filteredFilas = search
    ? filas.filter((row) =>
        (Array.isArray(row) ? row : Object.values(row)).some((cell) =>
          cell != null && String(cell).toLowerCase().includes(search.toLowerCase())
        )
      )
    : filas;

  return (
    <div>
      {/* Controles de hoja */}
      <div className="flex items-center gap-3 mb-3">
        <div className="relative">
          <svg className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
          </svg>
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Filtrar en esta hoja..."
            className="pl-9 pr-4 py-1.5 text-sm border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
        </div>
        <span className="text-xs text-gray-500">
          {filteredFilas.length} fila{filteredFilas.length !== 1 ? 's' : ''}
          {data.pagination && data.pagination.totalPages > 1 && ` · página ${data.pagination.page}/${data.pagination.totalPages}`}
        </span>
      </div>

      {/* Tabla */}
      <div className="overflow-x-auto rounded-lg border border-gray-200">
        <table className="w-full text-sm">
          <thead>
            <tr className="bg-gray-50 border-b border-gray-200">
              {columnas.map((col, i) => (
                <th
                  key={i}
                  className="px-3 py-2.5 text-left text-xs font-semibold text-gray-500 uppercase tracking-wide whitespace-nowrap"
                >
                  {col || `Col ${i + 1}`}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {filteredFilas.length === 0 ? (
              <tr>
                <td colSpan={columnas.length || 1} className="px-4 py-8 text-center text-gray-400">
                  Sin resultados
                </td>
              </tr>
            ) : (
              filteredFilas.map((row, ri) => {
                const cells = Array.isArray(row) ? row : columnas.map((c) => row[c]);
                return (
                  <tr key={ri} className="border-b border-gray-100 hover:bg-gray-50">
                    {cells.map((cell, ci) => (
                      <td key={ci} className="px-3 py-2 text-gray-700 whitespace-nowrap">
                        {cell != null && cell !== '' ? String(cell) : '—'}
                      </td>
                    ))}
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>

      {/* Paginación */}
      {data.pagination && data.pagination.totalPages > 1 && (
        <div className="mt-3 flex items-center justify-between">
          <span className="text-xs text-gray-500">
            {data.pagination.total} filas totales
          </span>
          <div className="flex gap-2">
            <button
              disabled={data.pagination.page === 1 || loading}
              onClick={() => loadPage(page - 1)}
              className="btn-secondary text-xs py-1 px-2 disabled:opacity-40"
            >Anterior</button>
            <button
              disabled={data.pagination.page === data.pagination.totalPages || loading}
              onClick={() => loadPage(page + 1)}
              className="btn-secondary text-xs py-1 px-2 disabled:opacity-40"
            >Siguiente</button>
          </div>
        </div>
      )}
    </div>
  );
}

export default function FiduciaDetalle() {
  const { id } = useParams();
  const navigate = useNavigate();
  const [encargo, setEncargo] = useState(null);
  const [activeHoja, setActiveHoja] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    getEncargo(id)
      .then((enc) => {
        setEncargo(enc);
        if (enc.hojas?.length > 0) setActiveHoja(enc.hojas[0]);
      })
      .catch((err) => setError(err.message))
      .finally(() => setLoading(false));
  }, [id]);

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="flex items-center gap-2 text-gray-500">
          <svg className="w-5 h-5 animate-spin text-blue-500" fill="none" viewBox="0 0 24 24">
            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
          </svg>
          Cargando...
        </div>
      </div>
    );
  }

  if (error || !encargo) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-center">
          <p className="text-red-600 mb-4">{error || 'Encargo no encontrado'}</p>
          <button onClick={() => navigate('/fiducia')} className="btn-primary">Volver</button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50">
      <header className="bg-white border-b border-gray-200 sticky top-0 z-10">
        <div className="max-w-screen-xl mx-auto px-6 py-4 flex items-center gap-4">
          <button onClick={() => navigate('/fiducia')} className="btn-secondary p-2" title="Volver">
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
            </svg>
          </button>
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2">
              <h1 className="text-lg font-bold text-gray-900 truncate">{encargo.nombre}</h1>
              {encargo.codigo && (
                <span className="text-xs font-mono bg-blue-50 text-blue-700 px-2 py-0.5 rounded border border-blue-200">
                  {encargo.codigo}
                </span>
              )}
            </div>
            <p className="text-xs text-gray-500 mt-0.5">
              {encargo.archivoNombre} · Importado {formatDateTime(encargo.createdAt)}
            </p>
          </div>
          <NavBar />
        </div>
      </header>

      <main className="max-w-screen-xl mx-auto px-6 py-6">
        {encargo.hojas.length === 0 ? (
          <p className="text-gray-400 text-sm">Este archivo no tiene hojas con datos.</p>
        ) : (
          <>
            {/* Tabs de hojas */}
            <div className="flex gap-1 mb-4 border-b border-gray-200 overflow-x-auto">
              {encargo.hojas.map((hoja) => (
                <button
                  key={hoja.id}
                  onClick={() => setActiveHoja(hoja)}
                  className={`px-4 py-2.5 text-sm font-medium whitespace-nowrap border-b-2 transition-colors ${
                    activeHoja?.id === hoja.id
                      ? 'border-blue-600 text-blue-700'
                      : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
                  }`}
                >
                  {hoja.nombreHoja}
                  <span className="ml-1.5 text-xs text-gray-400">({hoja.totalFilas})</span>
                </button>
              ))}
            </div>

            {/* Contenido de hoja activa */}
            {activeHoja && (
              <div className="bg-white rounded-xl border border-gray-200 p-5">
                <SheetTable encargoId={id} hoja={activeHoja} />
              </div>
            )}
          </>
        )}
      </main>
    </div>
  );
}
