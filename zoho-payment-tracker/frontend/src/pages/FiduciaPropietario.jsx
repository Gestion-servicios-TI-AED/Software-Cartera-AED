import React, { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { getMovimientosFiducia } from '../utils/api';

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
    <div className="flex flex-col min-h-screen bg-aed-base">
      <header className="h-[52px] bg-white border-b border-aed-border flex items-center px-5 gap-3 flex-shrink-0 sticky top-0 z-10">
        <button
          onClick={() => navigate(-1)}
          className="w-8 h-8 flex items-center justify-center rounded-lg border border-aed-border hover:bg-aed-base transition-colors"
          title="Volver"
        >
          <svg className="w-4 h-4 text-slate-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
          </svg>
        </button>
        <div className="flex-1 min-w-0">
          <h1 className="text-[15px] font-bold text-slate-800 truncate">{propietario}</h1>
        </div>
        <span className="text-[11px] text-slate-400">
          {totalRegistros} movimiento{totalRegistros !== 1 ? 's' : ''} en todos los encargos
        </span>
      </header>

      <div className="flex-1 p-5 flex flex-col gap-4">
        {loading ? (
          <div className="flex items-center justify-center py-16 text-slate-400 text-[13px] gap-2">
            <svg className="w-5 h-5 animate-spin text-blue-400" fill="none" viewBox="0 0 24 24">
              <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
              <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
            </svg>
            Cargando...
          </div>
        ) : Object.keys(grupos).length === 0 ? (
          <p className="text-center text-slate-400 text-[13px] py-16">Sin movimientos para este propietario</p>
        ) : (
          Object.values(grupos).map((grupo, idx) => (
            <div key={idx} className="card overflow-hidden">
              <div className="bg-aed-base border-b border-aed-border px-5 py-3 flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <button
                    onClick={() => navigate(`/fiducia/${grupo.encargo?.id || ''}`)}
                    className="text-[13px] font-semibold text-blue-500 hover:underline"
                  >
                    {grupo.encargo?.nombre || 'Encargo'}
                  </button>
                  {grupo.encargo?.codigo && (
                    <span className="text-[10px] font-mono bg-blue-50 text-blue-500 border border-blue-100 px-1.5 py-0.5 rounded">
                      {grupo.encargo.codigo}
                    </span>
                  )}
                  <span className="text-[11px] text-slate-400">· Hoja: {grupo.nombreHoja}</span>
                </div>
                <span className="text-[11px] text-slate-400">
                  {grupo.movimientos.length} registro{grupo.movimientos.length !== 1 ? 's' : ''}
                </span>
              </div>

              <div className="overflow-x-auto">
                <table className="w-full text-[12px]">
                  <thead>
                    <tr className="border-b border-aed-border">
                      {columnas.map((col) => (
                        <th key={col} className="section-label px-3 py-2.5 text-left whitespace-nowrap">
                          {col}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {grupo.movimientos.map((mov) => (
                      <tr key={mov.id} className="border-b border-aed-border hover:bg-blue-50/40">
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
            </div>
          ))
        )}
      </div>
    </div>
  );
}
