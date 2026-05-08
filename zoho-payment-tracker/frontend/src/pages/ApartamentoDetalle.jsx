import React, { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { getNomenclaturaDetail } from '../utils/api';
import { formatExcelDate } from '../utils/format';

function PropertyCard({ label, value, icon }) {
  const hasValue = value != null && value !== '' && value !== '—';

  return (
    <div className={`rounded-xl border p-3.5 transition-all duration-150 ${
      hasValue ? 'border-aed-border bg-white hover:border-blue-200 hover:shadow-sm' : 'border-aed-border bg-aed-base'
    }`}>
      <div className="flex items-start gap-2.5">
        {icon && (
          <div className="flex items-center justify-center w-7 h-7 rounded-lg bg-aed-base border border-aed-border text-slate-400 flex-shrink-0 mt-0.5">
            {icon}
          </div>
        )}
        <div className="flex-1 min-w-0">
          <p className="section-label mb-0.5">{label}</p>
          <p className={`text-[13px] font-medium break-words ${hasValue ? 'text-slate-800' : 'text-slate-300 italic'}`}>
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
      <div className="flex-1 flex items-center justify-center">
        <div className="flex items-center gap-2 text-slate-400 text-[13px]">
          <svg className="w-5 h-5 animate-spin text-blue-400" fill="none" viewBox="0 0 24 24">
            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
          </svg>
          Cargando apartamento...
        </div>
      </div>
    );
  }

  if (error || !data) {
    return (
      <div className="flex-1 flex items-center justify-center">
        <div className="text-center">
          <p className="text-red-500 text-[13px] mb-4">{error || 'Apartamento no encontrado'}</p>
          <button onClick={() => navigate(-1)} className="btn-primary">Volver</button>
        </div>
      </div>
    );
  }

  const propiedades = data.propiedades || {};
  const movimientos = data.movimientos || [];
  const movKeys = data.movimientoKeys || [];

  return (
    <div className="flex flex-col min-h-screen bg-aed-base">
      <header className="h-[52px] bg-white border-b border-aed-border flex items-center px-5 gap-3 flex-shrink-0 sticky top-0 z-10">
        <button
          onClick={() => navigate(`/fiducia/${id}/nomenclaturas`)}
          className="w-8 h-8 flex items-center justify-center rounded-lg border border-aed-border hover:bg-aed-base transition-colors"
          title="Volver"
        >
          <svg className="w-4 h-4 text-slate-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
          </svg>
        </button>
        <div className="flex-1 min-w-0">
          <h1 className="text-[15px] font-bold text-slate-800 truncate">{nomenclatura}</h1>
        </div>
        <span className="text-[11px] text-slate-400">
          {data.encargo?.nombre}
          {data.encargo?.codigo && <span className="ml-1 text-blue-400">({data.encargo.codigo})</span>}
          <span className="mx-1.5">·</span>
          {data.totalMovimientos} mov.
        </span>
      </header>

      <div className="flex-1 p-5 flex flex-col gap-4">
        {/* Propiedades del inmueble */}
        <div>
          <p className="section-label mb-3">Información del Inmueble</p>
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3">
            {Object.entries(propiedades).map(([key, value]) => (
              <PropertyCard key={key} label={key} value={value} icon={getIconForKey(key)} />
            ))}
          </div>
        </div>

        {/* Movimientos */}
        <div>
          <button
            onClick={() => setShowMovimientos(!showMovimientos)}
            className="flex items-center gap-2 mb-3 group"
          >
            <p className="section-label">Movimientos</p>
            <span className="text-[10px] font-medium text-slate-400 bg-aed-base border border-aed-border px-2 py-0.5 rounded-full">
              {movimientos.length}
            </span>
            <svg
              className={`w-3 h-3 text-slate-400 transition-transform ${showMovimientos ? 'rotate-180' : ''}`}
              fill="none" viewBox="0 0 24 24" stroke="currentColor"
            >
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
            </svg>
          </button>

          {showMovimientos && movimientos.length > 0 && (
            <div className="card overflow-hidden">
              <div className="overflow-x-auto">
                <table className="w-full text-[12px]">
                  <thead>
                    <tr className="border-b border-aed-border bg-aed-base">
                      <th className="section-label px-4 py-3 text-left whitespace-nowrap">Hoja</th>
                      {movKeys.map((key) => (
                        <th key={key} className="section-label px-4 py-3 text-left whitespace-nowrap">{key}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {movimientos.map((mov) => (
                      <tr key={mov.id} className="border-b border-aed-border hover:bg-blue-50/40 transition-colors">
                        <td className="px-4 py-3 whitespace-nowrap">
                          <span className="text-[10px] font-medium text-slate-500 bg-aed-base border border-aed-border px-2 py-0.5 rounded">
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
                            <td key={key} className="px-4 py-3 text-slate-600 whitespace-nowrap">
                              {val != null && val !== '' ? String(val) : <span className="text-slate-300">—</span>}
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
            <div className="card p-8 text-center text-slate-400 text-[13px]">
              Sin movimientos registrados
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
