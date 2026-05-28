import { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { ChevronRight } from 'lucide-react';
import { getAllNegocioMovimientos } from '../utils/api';
import { formatExcelDate } from '../utils/format';

function formatCOP(val) {
  if (val == null || val === '') return null;
  const n = parseFloat(String(val).replace(/[^0-9.-]/g, ''));
  if (isNaN(n)) return null;
  return new Intl.NumberFormat('es-CO', { style: 'currency', currency: 'COP', minimumFractionDigits: 0 }).format(n);
}

function estadoColor(estado) {
  if (!estado) return 'bg-slate-100 text-slate-500';
  const e = estado.toLowerCase();
  if (e.includes('escriturado') || e.includes('activo') || e.includes('vigente') || e.includes('prometido'))
    return 'bg-emerald-50 text-emerald-700 border border-emerald-200';
  if (e.includes('cancel') || e.includes('rescili') || e.includes('anulado'))
    return 'bg-red-50 text-red-700 border border-red-200';
  if (e.includes('mora') || e.includes('vencido') || e.includes('pendiente'))
    return 'bg-amber-50 text-amber-700 border border-amber-200';
  if (e.includes('promesa') || e.includes('proceso') || e.includes('tramite') || e.includes('libre'))
    return 'bg-blue-50 text-blue-700 border border-blue-200';
  return 'bg-slate-100 text-slate-500';
}

function formatCell(key, value) {
  if (value == null || value === '') return null;
  const k = (key || '').toLowerCase();
  if (k.includes('fecha')) {
    const f = formatExcelDate(value);
    return f !== '—' ? f : String(value);
  }
  if (
    k.includes('valor') || k.includes('monto') || k.includes('saldo') ||
    k.includes('cuota') || k.includes('aporte') || k.includes('abono')
  ) {
    const cop = formatCOP(value);
    return cop !== null ? cop : String(value);
  }
  return String(value);
}

function shortFideicomiso(raw) {
  if (!raw) return null;
  return String(raw).replace(/^\d+[\s-]+/, '').replace(/^P\.?A\.?\s*/i, '').trim();
}

function MovimientoRow({ mov }) {
  const [expanded, setExpanded] = useState(false);
  const datos = mov.datos || {};
  const fecha = datos['Fecha Contable'] ? formatExcelDate(datos['Fecha Contable']) : null;
  const tipo  = datos['Tipo Movimiento'] || null;
  const valor = datos['Valor'] ? formatCOP(datos['Valor']) : null;
  const estado = datos['Estado'];
  const fields = Object.keys(datos);

  function estadoBadgeColor(e) {
    if (!e) return '';
    const el = e.toLowerCase();
    if (el.includes('aplicado')) return 'text-emerald-700 bg-emerald-50';
    if (el.includes('pendiente') || el.includes('reversado')) return 'text-amber-700 bg-amber-50';
    return 'text-slate-600 bg-slate-100';
  }

  return (
    <>
      <tr
        onClick={() => setExpanded((e) => !e)}
        className="border-b border-aed-border hover:bg-blue-50/40 cursor-pointer transition-colors"
      >
        <td className="pl-4 pr-2 py-2.5 w-6">
          <ChevronRight
            size={12}
            strokeWidth={2.5}
            className={`text-slate-400 transition-transform ${expanded ? 'rotate-90 text-blue-500' : ''}`}
          />
        </td>
        <td className="px-3 py-2.5 whitespace-nowrap text-[11px] text-slate-500">
          {fecha ?? <span className="text-slate-300">—</span>}
        </td>
        <td className="px-3 py-2.5 text-[12px] text-slate-700 max-w-[220px]">
          <span className="line-clamp-1">{tipo ?? <span className="text-slate-300">—</span>}</span>
        </td>
        <td className="px-3 py-2.5 whitespace-nowrap text-[12px] text-right font-medium text-slate-700">
          {valor ?? <span className="text-slate-300">—</span>}
        </td>
        <td className="px-3 py-2.5 whitespace-nowrap text-right">
          {estado && (
            <span className={`text-[9px] font-bold px-2 py-0.5 rounded-full ${estadoBadgeColor(estado)}`}>
              {estado}
            </span>
          )}
        </td>
      </tr>
      {expanded && (
        <tr className="bg-blue-50/30 border-b border-aed-border">
          <td colSpan={5} className="px-5 py-3">
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-x-6 gap-y-2.5">
              {fields.map((col) => {
                const v = datos[col];
                const display = v != null && v !== '' ? (formatCell(col, v) ?? String(v)) : null;
                return (
                  <div key={col}>
                    <p className="section-label mb-0.5">{col}</p>
                    <p className="text-[11px] text-slate-700 break-words">
                      {display ?? <span className="text-slate-300 italic">—</span>}
                    </p>
                  </div>
                );
              })}
            </div>
          </td>
        </tr>
      )}
    </>
  );
}

export default function FiduciaPropietario() {
  const { nombre } = useParams();
  const navigate = useNavigate();
  const propietario = decodeURIComponent(nombre);

  const [data, setData]     = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    setLoading(true);
    getAllNegocioMovimientos({ search: propietario, limit: 500 })
      .then(setData)
      .finally(() => setLoading(false));
  }, [propietario]);

  // Group by negocio referencia
  const grupos = (data?.data || []).reduce((acc, mov) => {
    const key = mov.referencia;
    if (!acc[key]) acc[key] = { referencia: mov.referencia, negocio: mov.negocio, movimientos: [] };
    acc[key].movimientos.push(mov);
    return acc;
  }, {});

  const totalMov = data?.pagination?.total || 0;

  return (
    <div className="flex flex-col min-h-screen bg-aed-base">
      <header className="h-[52px] bg-white border-b border-aed-border flex items-center px-5 gap-3 flex-shrink-0 sticky top-0 z-10">
        <button
          onClick={() => navigate(-1)}
          className="w-8 h-8 flex items-center justify-center rounded-lg border border-aed-border hover:bg-aed-base transition-colors"
        >
          <svg className="w-4 h-4 text-slate-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
          </svg>
        </button>
        <div className="flex-1 min-w-0">
          <h1 className="text-[15px] font-bold text-slate-800 truncate">{propietario}</h1>
        </div>
        {!loading && (
          <span className="text-[11px] text-slate-400">
            {totalMov} movimiento{totalMov !== 1 ? 's' : ''}
          </span>
        )}
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
          <p className="text-center text-slate-400 text-[13px] py-16">
            Sin movimientos encontrados para este propietario.
          </p>
        ) : (
          Object.values(grupos).map((grupo) => {
            const neg = grupo.negocio;
            const nomenclatura = neg?.nomenclatura;
            const fideicomiso  = shortFideicomiso(neg?.fideicomiso);
            const estado       = neg?.estado;

            return (
              <div key={grupo.referencia} className="card overflow-hidden">
                <div className="bg-aed-base border-b border-aed-border px-5 py-3 flex items-center justify-between gap-3">
                  <div className="flex items-center gap-2 min-w-0">
                    <span className="text-[13px] font-semibold text-slate-800 font-mono flex-shrink-0">
                      {grupo.referencia}
                    </span>
                    {nomenclatura && (
                      <span className="text-[12px] text-slate-500 flex-shrink-0">· Apto {nomenclatura}</span>
                    )}
                    {fideicomiso && (
                      <span className="text-[11px] text-slate-400 truncate">· {fideicomiso}</span>
                    )}
                  </div>
                  <div className="flex items-center gap-2 flex-shrink-0">
                    {estado && (
                      <span className={`text-[9px] font-bold px-1.5 py-0.5 rounded-full ${estadoColor(estado)}`}>
                        {estado}
                      </span>
                    )}
                    <span className="text-[11px] text-slate-400">
                      {grupo.movimientos.length} mov.
                    </span>
                  </div>
                </div>

                <div className="overflow-x-auto">
                  <table className="w-full text-[12px]">
                    <thead>
                      <tr className="bg-white border-b border-aed-border">
                        <th className="w-6" />
                        <th className="section-label px-3 py-2.5 text-left whitespace-nowrap">Fecha</th>
                        <th className="section-label px-3 py-2.5 text-left">Tipo movimiento</th>
                        <th className="section-label px-3 py-2.5 text-right whitespace-nowrap">Valor</th>
                        <th className="section-label px-3 py-2.5 text-right whitespace-nowrap">Estado</th>
                      </tr>
                    </thead>
                    <tbody>
                      {grupo.movimientos.map((mov) => (
                        <MovimientoRow key={mov.id} mov={mov} />
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            );
          })
        )}
      </div>
    </div>
  );
}
