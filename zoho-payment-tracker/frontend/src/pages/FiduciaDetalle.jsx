import React, { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { getEncargo, getHoja } from '../utils/api';
import { formatDateTime } from '../utils/format';

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
      <div className="flex items-center justify-center py-12 text-slate-400 text-[13px] gap-2">
        <svg className="w-5 h-5 animate-spin text-blue-400" fill="none" viewBox="0 0 24 24">
          <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
          <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
        </svg>
        Cargando hoja...
      </div>
    );
  }

  if (!data) return <p className="text-slate-400 text-[12px] py-4">Sin datos</p>;

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
          <svg className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
          </svg>
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Filtrar en esta hoja..."
            className="input pl-9 pr-4 py-1.5 text-[12px]"
          />
        </div>
        <span className="text-[11px] text-slate-400">
          {filteredFilas.length} fila{filteredFilas.length !== 1 ? 's' : ''}
          {data.pagination && data.pagination.totalPages > 1 && ` · página ${data.pagination.page}/${data.pagination.totalPages}`}
        </span>
      </div>

      {/* Tabla */}
      <div className="overflow-x-auto rounded-lg border border-aed-border">
        <table className="w-full text-[12px]">
          <thead>
            <tr className="bg-aed-base border-b border-aed-border">
              {columnas.map((col, i) => (
                <th key={i} className="section-label px-3 py-2.5 text-left whitespace-nowrap">
                  {col || `Col ${i + 1}`}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {filteredFilas.length === 0 ? (
              <tr>
                <td colSpan={columnas.length || 1} className="px-4 py-8 text-center text-slate-400">
                  Sin resultados
                </td>
              </tr>
            ) : (
              filteredFilas.map((row, ri) => {
                const cells = Array.isArray(row) ? row : columnas.map((c) => row[c]);
                return (
                  <tr key={ri} className="border-b border-aed-border hover:bg-blue-50/40">
                    {cells.map((cell, ci) => (
                      <td key={ci} className="px-3 py-2 text-slate-600 whitespace-nowrap">
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
          <span className="text-[11px] text-slate-400">
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
      <div className="flex-1 flex items-center justify-center">
        <div className="flex items-center gap-2 text-slate-400 text-[13px]">
          <svg className="w-5 h-5 animate-spin text-blue-400" fill="none" viewBox="0 0 24 24">
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
      <div className="flex-1 flex items-center justify-center">
        <div className="text-center">
          <p className="text-red-500 text-[13px] mb-4">{error || 'Encargo no encontrado'}</p>
          <button onClick={() => navigate('/fiducia')} className="btn-primary">Volver</button>
        </div>
      </div>
    );
  }

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
          <h1 className="text-[15px] font-bold text-slate-800 truncate">{encargo.nombre}</h1>
          {encargo.codigo && (
            <span className="text-[10px] font-mono bg-blue-50 text-blue-500 border border-blue-100 px-1.5 py-0.5 rounded">
              {encargo.codigo}
            </span>
          )}
        </div>
        <span className="text-[10px] text-slate-400 hidden sm:block">
          {encargo.archivoNombre} · {formatDateTime(encargo.createdAt)}
        </span>
      </header>

      <div className="flex-1 p-5">
        {encargo.hojas.length === 0 ? (
          <p className="text-slate-400 text-[13px]">Este archivo no tiene hojas con datos.</p>
        ) : (
          <>
            <div className="flex gap-1 mb-4 border-b border-aed-border overflow-x-auto">
              {encargo.hojas.map((hoja) => (
                <button
                  key={hoja.id}
                  onClick={() => setActiveHoja(hoja)}
                  className={`px-4 py-2.5 text-[13px] font-medium whitespace-nowrap border-b-2 transition-colors ${
                    activeHoja?.id === hoja.id
                      ? 'border-blue-500 text-blue-600'
                      : 'border-transparent text-slate-400 hover:text-slate-600 hover:border-slate-200'
                  }`}
                >
                  {hoja.nombreHoja}
                  <span className="ml-1.5 text-[11px] text-slate-400">({hoja.totalFilas})</span>
                </button>
              ))}
            </div>

            {activeHoja && (
              <div className="card p-4">
                <SheetTable encargoId={id} hoja={activeHoja} />
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}
