import React, { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { getMovimientosFiducia } from '../utils/api';
import NavBar from '../components/NavBar';

export default function FiduciaPropietario() {
  const { nombre } = useParams();
  const navigate = useNavigate();
  const propietario = decodeURIComponent(nombre);

  const [data, setData] = useState(null);
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(true);

  async function load(p = 1) {
    setLoading(true);
    try {
      const res = await getMovimientosFiducia({ propietario, page: p, limit: 200 });
      setData(res);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { load(1); }, [propietario]);

  // Agrupar movimientos por encargo y hoja
  const grupos = data?.data?.reduce((acc, mov) => {
    const key = `${mov.encargId}__${mov.nombreHoja}`;
    if (!acc[key]) {
      acc[key] = {
        encargo: mov.encargo,
        nombreHoja: mov.nombreHoja,
        movimientos: [],
      };
    }
    acc[key].movimientos.push(mov);
    return acc;
  }, {}) || {};

  const columnas = data?.data?.length ? Object.keys(data.data[0].datos || {}) : [];
  const totalRegistros = data?.pagination?.total || 0;

  return (
    <div className="min-h-screen bg-gray-50">
      <header className="bg-white border-b border-gray-200 sticky top-0 z-10">
        <div className="max-w-screen-xl mx-auto px-6 py-4 flex items-center gap-4">
          <button onClick={() => navigate(-1)} className="btn-secondary p-2" title="Volver">
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
            </svg>
          </button>
          <div className="flex-1 min-w-0">
            <h1 className="text-lg font-bold text-gray-900 truncate">{propietario}</h1>
            <p className="text-xs text-gray-500 mt-0.5">
              {totalRegistros} movimiento{totalRegistros !== 1 ? 's' : ''} en todos los encargos
            </p>
          </div>
          <NavBar />
        </div>
      </header>

      <main className="max-w-screen-xl mx-auto px-6 py-6 space-y-6">
        {loading ? (
          <div className="flex items-center justify-center py-16 text-gray-400">
            <svg className="w-5 h-5 animate-spin mr-2" fill="none" viewBox="0 0 24 24">
              <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
              <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
            </svg>
            Cargando...
          </div>
        ) : Object.keys(grupos).length === 0 ? (
          <p className="text-center text-gray-400 py-16">Sin movimientos para este propietario</p>
        ) : (
          Object.values(grupos).map((grupo, idx) => (
            <div key={idx} className="bg-white rounded-xl border border-gray-200 overflow-hidden">
              {/* Encabezado del grupo */}
              <div className="bg-gray-50 border-b border-gray-200 px-5 py-3 flex items-center justify-between">
                <div>
                  <button
                    onClick={() => navigate(`/fiducia/${grupo.encargo?.id || ''}`)}
                    className="font-semibold text-blue-700 hover:underline text-sm"
                  >
                    {grupo.encargo?.nombre || 'Encargo'}
                  </button>
                  {grupo.encargo?.codigo && (
                    <span className="ml-2 text-xs font-mono bg-blue-50 text-blue-700 px-2 py-0.5 rounded border border-blue-200">
                      {grupo.encargo.codigo}
                    </span>
                  )}
                  <span className="ml-3 text-xs text-gray-500">· Hoja: {grupo.nombreHoja}</span>
                </div>
                <span className="text-xs text-gray-400">
                  {grupo.movimientos.length} registro{grupo.movimientos.length !== 1 ? 's' : ''}
                </span>
              </div>

              {/* Tabla de movimientos del grupo */}
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-gray-100">
                      {columnas.map((col) => (
                        <th key={col} className="px-3 py-2.5 text-left text-xs font-semibold text-gray-500 uppercase tracking-wide whitespace-nowrap">
                          {col}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {grupo.movimientos.map((mov) => (
                      <tr key={mov.id} className="border-b border-gray-100 hover:bg-gray-50">
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
            </div>
          ))
        )}
      </main>
    </div>
  );
}
