import React, { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { getNomenclaturaDetail } from '../utils/api';
import { formatExcelDate } from '../utils/format';
import NavBar from '../components/NavBar';

function PropertyCard({ label, value, icon }) {
  const hasValue = value != null && value !== '' && value !== '—';

  return (
    <div className={`bg-white rounded-xl border p-4 transition-all duration-200 ${
      hasValue
        ? 'border-gray-200/80 hover:shadow-md hover:border-blue-200/60'
        : 'border-gray-100 bg-gray-50/50'
    }`}>
      <div className="flex items-start gap-3">
        {icon && (
          <div className="flex items-center justify-center w-8 h-8 rounded-lg bg-gradient-to-br from-slate-100 to-gray-100 text-gray-500 flex-shrink-0 mt-0.5">
            {icon}
          </div>
        )}
        <div className="flex-1 min-w-0">
          <p className="text-[11px] font-semibold text-gray-400 uppercase tracking-wider mb-1">{label}</p>
          <p className={`text-sm font-medium break-words ${hasValue ? 'text-gray-900' : 'text-gray-300 italic'}`}>
            {hasValue ? value : 'Sin dato'}
          </p>
        </div>
      </div>
    </div>
  );
}

function getIconForKey(key) {
  const k = key.toLowerCase();
  if (k.includes('nomenclatura') || k.includes('inmueble') || k.includes('apto'))
    return <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M2.25 21h19.5m-18-18v18m10.5-18v18m6-13.5V21M6.75 6.75h.75m-.75 3h.75m-.75 3h.75m3-6h.75m-.75 3h.75m-.75 3h.75M6.75 21v-3.375c0-.621.504-1.125 1.125-1.125h2.25c.621 0 1.125.504 1.125 1.125V21M3 3h12m-.75 4.5H21m-3.75 3H21m-3.75 3H21" /></svg>;
  if (k.includes('propietario') || k.includes('cliente') || k.includes('comprador'))
    return <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M15.75 6a3.75 3.75 0 11-7.5 0 3.75 3.75 0 017.5 0zM4.501 20.118a7.5 7.5 0 0114.998 0A17.933 17.933 0 0112 21.75c-2.676 0-5.216-.584-7.499-1.632z" /></svg>;
  if (k.includes('estado'))
    return <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 12.75L11.25 15 15 9.75M21 12a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>;
  if (k.includes('area') || k.includes('área'))
    return <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M3.75 3.75v4.5m0-4.5h4.5m-4.5 0L9 9M3.75 20.25v-4.5m0 4.5h4.5m-4.5 0L9 15M20.25 3.75h-4.5m4.5 0v4.5m0-4.5L15 9m5.25 11.25h-4.5m4.5 0v-4.5m0 4.5L15 15" /></svg>;
  if (k.includes('referencia'))
    return <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M5.25 8.25h15m-16.5 7.5h15m-1.8-13.5l-3.9 19.5m-2.1-19.5l-3.9 19.5" /></svg>;
  if (k.includes('fideicomiso') || k.includes('encargo'))
    return <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M12 21v-8.25M15.75 21v-8.25M8.25 21v-8.25M3 9l9-6 9 6m-1.5 12V10.332A48.36 48.36 0 0012 9.75c-2.551 0-5.056.2-7.5.582V21M3 21h18M12 6.75h.008v.008H12V6.75z" /></svg>;
  if (k.includes('tipo') || k.includes('categoria'))
    return <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9.568 3H5.25A2.25 2.25 0 003 5.25v4.318c0 .597.237 1.17.659 1.591l9.581 9.581c.699.699 1.78.872 2.607.33a18.095 18.095 0 005.223-5.223c.542-.827.369-1.908-.33-2.607L11.16 3.66A2.25 2.25 0 009.568 3z" /><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M6 6h.008v.008H6V6z" /></svg>;
  if (k.includes('inventario'))
    return <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M20.25 7.5l-.625 10.632a2.25 2.25 0 01-2.247 2.118H6.622a2.25 2.25 0 01-2.247-2.118L3.75 7.5M10 11.25h4M3.375 7.5h17.25c.621 0 1.125-.504 1.125-1.125v-1.5c0-.621-.504-1.125-1.125-1.125H3.375c-.621 0-1.125.504-1.125 1.125v1.5c0 .621.504 1.125 1.125 1.125z" /></svg>;
  if (k.includes('participación') || k.includes('participacion') || k.includes('%'))
    return <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M10.5 6a7.5 7.5 0 107.5 7.5h-7.5V6z" /><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M13.5 10.5H21A7.5 7.5 0 0013.5 3v7.5z" /></svg>;
  if (k.includes('nro') || k.includes('id ') || k.includes('identificación'))
    return <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M15 9h3.75M15 12h3.75M15 15h3.75M4.5 19.5h15a2.25 2.25 0 002.25-2.25V6.75A2.25 2.25 0 0019.5 4.5h-15a2.25 2.25 0 00-2.25 2.25v10.5A2.25 2.25 0 004.5 19.5zm6-10.125a1.875 1.875 0 11-3.75 0 1.875 1.875 0 013.75 0zm1.294 6.336a6.721 6.721 0 01-3.17.789 6.721 6.721 0 01-3.168-.789 3.376 3.376 0 016.338 0z" /></svg>;
  return <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M19.5 14.25v-2.625a3.375 3.375 0 00-3.375-3.375h-1.5A1.125 1.125 0 0113.5 7.125v-1.5a3.375 3.375 0 00-3.375-3.375H8.25m0 12.75h7.5m-7.5 3H12M10.5 2.25H5.625c-.621 0-1.125.504-1.125 1.125v17.25c0 .621.504 1.125 1.125 1.125h12.75c.621 0 1.125-.504 1.125-1.125V11.25a9 9 0 00-9-9z" /></svg>;
}

function formatCurrency(val) {
  if (val == null || val === '') return null;
  const num = typeof val === 'string' ? parseFloat(val.replace(/[^0-9.-]/g, '')) : Number(val);
  if (isNaN(num)) return val;
  return new Intl.NumberFormat('es-CO', { style: 'currency', currency: 'COP', minimumFractionDigits: 0 }).format(num);
}

export default function ApartamentoDetalle() {
  const { id, nomenclatura: rawNom } = useParams();
  const nomenclatura = decodeURIComponent(rawNom);
  const navigate = useNavigate();

  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [showMovimientos, setShowMovimientos] = useState(true);

  useEffect(() => {
    setLoading(true);
    getNomenclaturaDetail(id, nomenclatura)
      .then(setData)
      .catch((err) => setError(err.response?.data?.error || err.message))
      .finally(() => setLoading(false));
  }, [id, nomenclatura]);

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-slate-50 via-white to-blue-50">
        <div className="flex items-center gap-3 text-gray-500">
          <svg className="w-6 h-6 animate-spin text-blue-500" fill="none" viewBox="0 0 24 24">
            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
          </svg>
          <span className="font-medium">Cargando apartamento...</span>
        </div>
      </div>
    );
  }

  if (error || !data) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-slate-50 via-white to-blue-50">
        <div className="text-center">
          <p className="text-red-600 mb-4 font-medium">{error || 'Apartamento no encontrado'}</p>
          <button onClick={() => navigate(-1)} className="px-5 py-2.5 text-sm font-medium rounded-xl bg-blue-600 text-white hover:bg-blue-700 shadow-md transition-all">
            Volver
          </button>
        </div>
      </div>
    );
  }

  const propiedades = data.propiedades || {};
  const movimientos = data.movimientos || [];
  const movKeys = data.movimientoKeys || [];

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 via-white to-blue-50">
      {/* Header */}
      <header className="bg-white/80 backdrop-blur-md border-b border-gray-200/60 sticky top-0 z-20">
        <div className="max-w-screen-xl mx-auto px-6 py-4 flex items-center gap-4">
          <button
            onClick={() => navigate(`/fiducia/${id}/nomenclaturas`)}
            className="flex items-center justify-center w-9 h-9 rounded-lg border border-gray-200 bg-white hover:bg-gray-50 text-gray-500 hover:text-gray-700 transition-all shadow-sm"
            title="Volver a nomenclaturas"
          >
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
            </svg>
          </button>
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-3 flex-wrap">
              <div className="flex items-center justify-center w-10 h-10 rounded-xl bg-gradient-to-br from-blue-500 to-indigo-600 text-white shadow-lg shadow-blue-500/25">
                <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M2.25 21h19.5m-18-18v18m10.5-18v18m6-13.5V21M6.75 6.75h.75m-.75 3h.75m-.75 3h.75m3-6h.75m-.75 3h.75m-.75 3h.75M6.75 21v-3.375c0-.621.504-1.125 1.125-1.125h2.25c.621 0 1.125.504 1.125 1.125V21M3 3h12m-.75 4.5H21m-3.75 3H21m-3.75 3H21" />
                </svg>
              </div>
              <div>
                <h1 className="text-lg font-bold text-gray-900">{nomenclatura}</h1>
                <p className="text-xs text-gray-500 mt-0.5">
                  {data.encargo?.nombre}
                  {data.encargo?.codigo && <span className="ml-1 text-blue-600">({data.encargo.codigo})</span>}
                  <span className="mx-1.5">·</span>
                  {data.totalMovimientos} movimiento{data.totalMovimientos !== 1 ? 's' : ''}
                </p>
              </div>
            </div>
          </div>
          <NavBar />
        </div>
      </header>

      <main className="max-w-screen-xl mx-auto px-6 py-6 space-y-6">
        {/* Propiedades del inmueble */}
        <section>
          <div className="flex items-center gap-2 mb-4">
            <div className="w-1 h-5 rounded-full bg-gradient-to-b from-blue-500 to-indigo-600"></div>
            <h2 className="text-base font-bold text-gray-900">Información del Inmueble</h2>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-3">
            {Object.entries(propiedades).map(([key, value]) => (
              <PropertyCard
                key={key}
                label={key}
                value={value}
                icon={getIconForKey(key)}
              />
            ))}
          </div>
        </section>

        {/* Movimientos */}
        <section>
          <button
            onClick={() => setShowMovimientos(!showMovimientos)}
            className="flex items-center gap-2 mb-4 group"
          >
            <div className="w-1 h-5 rounded-full bg-gradient-to-b from-emerald-500 to-teal-600"></div>
            <h2 className="text-base font-bold text-gray-900">Movimientos</h2>
            <span className="text-xs font-medium text-gray-400 bg-gray-100 px-2 py-0.5 rounded-full">
              {movimientos.length}
            </span>
            <svg
              className={`w-4 h-4 text-gray-400 transition-transform ${showMovimientos ? 'rotate-180' : ''}`}
              fill="none" viewBox="0 0 24 24" stroke="currentColor"
            >
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
            </svg>
          </button>

          {showMovimientos && movimientos.length > 0 && (
            <div className="bg-white rounded-xl border border-gray-200/80 overflow-hidden shadow-sm">
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-gray-200 bg-gradient-to-r from-gray-50 to-slate-50">
                      <th className="px-4 py-3 text-left text-[11px] font-semibold text-gray-500 uppercase tracking-wider whitespace-nowrap">
                        Hoja
                      </th>
                      {movKeys.map((key) => (
                        <th key={key} className="px-4 py-3 text-left text-[11px] font-semibold text-gray-500 uppercase tracking-wider whitespace-nowrap">
                          {key}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {movimientos.map((mov, idx) => (
                      <tr key={mov.id} className={`border-b border-gray-100 hover:bg-blue-50/40 transition-colors ${idx % 2 === 0 ? 'bg-white' : 'bg-gray-50/30'}`}>
                        <td className="px-4 py-3 whitespace-nowrap">
                          <span className="text-xs font-medium text-gray-500 bg-gray-100 px-2 py-0.5 rounded">
                            {mov.nombreHoja}
                          </span>
                        </td>
                        {movKeys.map((key) => {
                          let val = mov[key];
                          const kl = key.toLowerCase();
                          if (kl.includes('valor') || kl.includes('monto') || kl.includes('saldo')) {
                            val = formatCurrency(val) || val;
                          } else if (kl.includes('fecha')) {
                            val = formatExcelDate(val) || val;
                          }
                          return (
                            <td key={key} className="px-4 py-3 text-gray-700 whitespace-nowrap text-sm">
                              {val != null && val !== '' ? String(val) : <span className="text-gray-300">—</span>}
                            </td>
                          );
                        })}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {showMovimientos && movimientos.length === 0 && (
            <div className="bg-white rounded-xl border border-gray-200 p-8 text-center text-gray-400">
              <p className="font-medium">Sin movimientos registrados</p>
            </div>
          )}
        </section>
      </main>
    </div>
  );
}
