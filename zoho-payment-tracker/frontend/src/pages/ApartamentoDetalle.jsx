import { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { ChevronDown, ChevronRight, User, Building2, BarChart3, History } from 'lucide-react';
import { getNomenclaturaDetail } from '../utils/api';
import { formatExcelDate } from '../utils/format';
import { filtrarDatosResumen, filtrarKeysMovimiento } from '../utils/columnasExcluidas';
import { separarUnidadesAdicionales } from '../utils/unidadesAdicionales';
import ConceptoHint from '../components/ConceptoHint';
import { ListaInfo, ListaFinanciera } from '../components/DatosFinancieros';
import { ordenarFinanciero } from '../utils/ordenColumnas';
import { estadoBadgeClass } from '../utils/estados';

// ── Helpers (mismos que Negocios) ─────────────────────────────────────────

function formatCOP(val) {
  if (val == null || val === '') return null;
  const n = parseFloat(String(val).replace(/[^0-9.-]/g, ''));
  if (isNaN(n)) return null;
  return new Intl.NumberFormat('es-CO', { style: 'currency', currency: 'COP', minimumFractionDigits: 0 }).format(n);
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
    k.includes('precio') || k.includes('cuota') || k.includes('capital') ||
    k.includes('deuda') || k.includes('abono') || k.includes('descuento') ||
    k.includes('credito') || k.includes('crédito') || k.includes('subsidio') ||
    k.includes('anticipo') || k.includes('importe') || k.includes('acreditacion') ||
    k.includes('acreditación') || k.includes('escritura') || k.includes('factura') ||
    k.includes('aporte') || k.includes('canje') || k.endsWith(' +') ||
    k.endsWith(' (-)') || k.includes('movimiento posterior')
  ) {
    const cop = formatCOP(value);
    return cop !== null ? cop : String(value);
  }
  if (k.includes('area') || k.includes('área')) {
    const n = parseFloat(String(value));
    if (!isNaN(n)) return `${n} m²`;
  }
  return String(value);
}

// Color del estado — centralizado en utils/estados.js
const estadoColor = estadoBadgeClass;

const APTO_KEYS = [
  'nomenclatura', 'area', 'área', 'm2', 'm²', 'tipo inmueble', 'categoria', 'categoría',
  'inventario', 'fideicomiso', 'etapa', 'torre', 'bloque', 'edificio',
  'matricula', 'matrícula', 'folio', 'parqueadero', 'garaje', 'parking',
  'deposito', 'depósito', 'bodega', 'notaria', 'notaría', 'escritura',
  'unidad', 'piso', 'interior', 'proyecto', 'fecha contrato', 'número escritura',
  'numero escritura', 'unidades adicionales',
];
const FIN_KEYS = [
  'valor venta', 'cuota inicial', 'credito', 'crédito', 'subsidio', 'descuento',
  'saldo actual', 'saldo inicial', 'valor factura', 'valor escritura', 'aportes',
  'valor acreditacion', 'valor acreditación', 'saldo may', 'saldo jun', 'saldo jul',
  'saldo ago', 'saldo sep', 'saldo oct', 'saldo nov', 'saldo dic', 'saldo ene',
  'saldo feb', 'saldo mar', 'saldo abr', 'saldo ',
  'canje', 'cumple', 'movimiento posterior', 'número factura', 'numero factura',
  ' +', ' (-)', 'fecha autoriz', 'fecha envío', 'fecha factura',
];

function categorizeDatos(datos) {
  const apto = {}, financiero = {}, otros = {};
  for (const [key, value] of Object.entries(datos || {})) {
    if (value == null || String(value).trim() === '') continue;
    const k = key.toLowerCase();
    if (APTO_KEYS.some((ak) => k === ak || k.includes(ak)))       apto[key]       = value;
    else if (FIN_KEYS.some((fk) => k === fk || k.includes(fk))) financiero[key] = value;
    else                                                           otros[key]      = value;
  }
  return { apto, financiero, otros };
}

function cleanNombre(nombre) {
  if (!nombre) return null;
  return nombre.replace(/^\d+\s+/, '').replace(/\s*\(\d+\.?\d*%\)\s*$/, '');
}

// ── Sub-components ────────────────────────────────────────────────────────

function Accordion({ icon: Icon, title, badge, children, defaultOpen = true }) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <div className="card overflow-hidden">
      <button
        onClick={() => setOpen((o) => !o)}
        className="w-full flex items-center gap-2.5 px-4 py-3 hover:bg-aed-base transition-colors"
      >
        {Icon && <Icon size={14} className="text-slate-500 flex-shrink-0" strokeWidth={1.75} />}
        <span className="text-[14px] font-semibold text-slate-700 flex-1 text-left">{title}</span>
        {badge != null && badge !== 0 && (
          <span className="text-[12px] font-medium text-slate-500 bg-aed-base border border-aed-border px-2 py-0.5 rounded-full">
            {badge}
          </span>
        )}
        <ChevronDown
          size={13}
          strokeWidth={2}
          className={`text-slate-500 transition-transform flex-shrink-0 ${open ? 'rotate-180' : ''}`}
        />
      </button>
      {open && <div className="border-t border-aed-border">{children}</div>}
    </div>
  );
}

function MovimientoRow({ mov, fields }) {
  const [expanded, setExpanded] = useState(false);
  const datos = mov.datos || {};

  const fecha  = datos['Fecha Contable'] ? formatExcelDate(datos['Fecha Contable']) : null;
  const tipo   = datos['Tipo Movimiento'] || datos['Concepto'] || null;
  const valor  = datos['Valor'] ? formatCOP(datos['Valor']) : null;
  const estado = datos['Estado'];

  function estadoBadgeColor(e) {
    if (!e) return '';
    const el = e.toLowerCase();
    if (el.includes('aplicado'))                               return 'text-emerald-700 bg-emerald-50';
    if (el.includes('pendiente') || el.includes('reversado')) return 'text-amber-700 bg-amber-50';
    return 'text-slate-600 bg-slate-100';
  }

  return (
    <>
      <tr
        onClick={() => setExpanded((e) => !e)}
        className="border-b border-aed-border hover:bg-brand-tint cursor-pointer transition-colors"
      >
        <td className="pl-4 pr-2 py-2.5 w-6">
          <ChevronRight
            size={12}
            strokeWidth={2.5}
            className={`text-slate-500 transition-transform ${expanded ? 'rotate-90 text-brand' : ''}`}
          />
        </td>
        <td className="px-3 py-2.5 whitespace-nowrap text-[13px] text-slate-500">
          {fecha ?? <span className="text-slate-300">—</span>}
        </td>
        <td className="px-3 py-2.5 text-[14px] text-slate-700 max-w-[200px]">
          <span className="line-clamp-1">{tipo ?? <span className="text-slate-300">—</span>}</span>
        </td>
        <td className="px-3 py-2.5 whitespace-nowrap text-[14px] text-right font-medium text-slate-700">
          {valor ?? <span className="text-slate-300">—</span>}
        </td>
        <td className="px-3 py-2.5 whitespace-nowrap text-right">
          {estado && (
            <span className={`text-[12px] font-bold px-2 py-0.5 rounded-full ${estadoBadgeColor(estado)}`}>
              {estado}
            </span>
          )}
        </td>
      </tr>
      {expanded && (
        <tr className="bg-brand-tint border-b border-aed-border">
          <td colSpan={5} className="px-5 py-3">
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-x-6 gap-y-2.5">
              {fields.map((col) => {
                const v = datos[col];
                const display = v != null && v !== '' ? (formatCell(col, v) ?? String(v)) : null;
                return (
                  <div key={col}>
                    <p className="section-label mb-0.5 inline-flex items-center gap-1">{col}<ConceptoHint columna={col} hoja="movimiento" /></p>
                    <p className="text-[13px] text-slate-700 break-words">
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

// ── Main page ─────────────────────────────────────────────────────────────

export default function ApartamentoDetalle() {
  const { id, nomenclatura: rawNom } = useParams();
  const nomenclatura = decodeURIComponent(rawNom);
  const navigate = useNavigate();

  const [data, setData]       = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError]     = useState(null);

  useEffect(() => {
    setLoading(true);
    getNomenclaturaDetail(id, nomenclatura)
      .then(setData)
      .catch((err) => setError(err.response?.data?.error || err.message))
      .finally(() => setLoading(false));
  }, [id, nomenclatura]);

  if (loading) {
    return (
      <div className="flex-1 flex items-center justify-center min-h-screen">
        <div className="flex items-center gap-2 text-slate-500 text-[15px]">
          <svg className="w-5 h-5 animate-spin text-brand" fill="none" viewBox="0 0 24 24">
            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
          </svg>
          Cargando…
        </div>
      </div>
    );
  }

  if (error || !data) {
    return (
      <div className="flex-1 flex items-center justify-center min-h-screen">
        <div className="text-center">
          <p className="text-red-500 text-[15px] mb-4">{error || 'No encontrado'}</p>
          <button onClick={() => navigate(-1)} className="btn-primary text-[15px]">Volver</button>
        </div>
      </div>
    );
  }

  const { negocio, movimientos, totalMovimientos, encargo } = data;
  const { apto, financiero } = categorizeDatos(separarUnidadesAdicionales(filtrarDatosResumen(negocio.datos || {})));
  const aptoEntries = Object.entries(apto);
  const finEntries  = ordenarFinanciero(Object.entries(financiero));

  const saldo    = negocio.saldoActual ?? null;
  const saldoFmt = saldo != null ? formatCOP(saldo) : null;
  const movFields = movimientos.length > 0 ? filtrarKeysMovimiento(Object.keys(movimientos[0].datos || {})) : [];

  return (
    <div className="flex flex-col min-h-screen bg-aed-base">
      {/* Header */}
      <header className="h-[52px] bg-white border-b border-aed-border flex items-center px-5 gap-3 flex-shrink-0 sticky top-0 z-10">
        <button
          onClick={() => navigate(`/fiducia/${id}/nomenclaturas`)}
          className="w-8 h-8 flex items-center justify-center rounded-lg border border-aed-border hover:bg-aed-base transition-colors"
        >
          <svg className="w-4 h-4 text-slate-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
          </svg>
        </button>
        <div className="flex-1 min-w-0">
          <h1 className="text-[18px] font-bold text-slate-800 truncate">{nomenclatura}</h1>
        </div>
        <span className="text-[13px] text-slate-500">
          {encargo?.nombre}
          {encargo?.codigo && <span className="ml-1 text-brand">({encargo.codigo})</span>}
          <span className="mx-1.5">·</span>
          {totalMovimientos} mov.
        </span>
      </header>

      <div className="flex flex-col gap-3 p-5">
        {/* Tarjeta de resumen */}
        <div className="card px-4 py-3">
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <p className="text-[13px] text-slate-500 mb-0.5">Referencia</p>
              <h2 className="text-[19px] font-bold text-slate-800 font-mono">{negocio.referencia}</h2>
              {(negocio.datos?.Nomenclatura || negocio.datos?.Inventario) && (
                <p className="text-[14px] text-slate-500 mt-0.5">
                  {negocio.datos.Nomenclatura && (
                    <span className="font-medium">Apto {negocio.datos.Nomenclatura}</span>
                  )}
                  {negocio.datos.Nomenclatura && negocio.datos.Inventario && (
                    <span className="mx-1.5 text-slate-300">·</span>
                  )}
                  {negocio.datos.Inventario && <span>{negocio.datos.Inventario}</span>}
                </p>
              )}
            </div>
            <div className="flex flex-col items-end gap-1.5 flex-shrink-0">
              {negocio.estado && (
                <span className={`text-[12px] font-bold px-2.5 py-1 rounded-full ${estadoColor(negocio.estado)}`}>
                  {negocio.estado}
                </span>
              )}
              {saldoFmt && (
                <div className="text-right">
                  <p className="text-[12px] text-slate-500 uppercase tracking-wide">Total abonado</p>
                  <p className={`text-[16px] font-bold tabular-nums ${saldo > 0 ? 'text-emerald-600' : 'text-slate-500'}`}>
                    {saldoFmt}
                  </p>
                </div>
              )}
            </div>
          </div>
        </div>

        {/* 1. Comprador */}
        <Accordion icon={User} title="Comprador" badge={negocio.compradores?.length} defaultOpen>
          {negocio.compradores?.length > 0 ? (
            <div className="divide-y divide-aed-border">
              {negocio.compradores.map((c, i) => {
                const nombre = cleanNombre(c.nombre);
                return (
                  <div key={c.id ?? i} className="flex items-center gap-3 px-4 py-3">
                    <div className="w-8 h-8 rounded-full bg-brand-soft border border-brand-soft flex items-center justify-center text-[13px] font-bold text-brand-strong flex-shrink-0">
                      {nombre?.charAt(0).toUpperCase() ?? '?'}
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-[15px] font-medium text-slate-800">{nombre}</p>
                      {c.nroId && <p className="text-[13px] text-slate-500 mt-0.5">{c.nroId}</p>}
                    </div>
                    {c.porcentaje != null && (
                      <span className="text-[14px] font-semibold text-slate-500 flex-shrink-0">{c.porcentaje}%</span>
                    )}
                  </div>
                );
              })}
            </div>
          ) : (
            <p className="px-4 py-4 text-[14px] text-slate-500 italic">Sin compradores registrados</p>
          )}
        </Accordion>

        {/* 2. Info del apartamento */}
        <Accordion icon={Building2} title="Info del apartamento" badge={aptoEntries.length} defaultOpen>
          {aptoEntries.length > 0
            ? <ListaInfo entries={aptoEntries} hoja="resumen" format={formatCell} />
            : <p className="px-4 py-4 text-[14px] text-slate-500 italic bg-white">Sin datos del apartamento</p>}
        </Accordion>

        {/* 3. Estructura financiera */}
        <Accordion icon={BarChart3} title="Estructura financiera y abonos" badge={finEntries.length} defaultOpen>
          {finEntries.length > 0
            ? <ListaFinanciera entries={finEntries} format={formatCell} />
            : <p className="px-4 py-4 text-[14px] text-slate-500 italic bg-white">Sin datos financieros</p>}
        </Accordion>

        {/* 4. Movimientos */}
        <Accordion icon={History} title="Historial de movimientos" badge={totalMovimientos} defaultOpen={false}>
          {movimientos.length === 0 ? (
            <p className="px-4 py-4 text-[14px] text-slate-500 italic">Sin movimientos registrados</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-[14px]">
                <thead>
                  <tr className="bg-aed-base border-b border-aed-border">
                    <th className="w-6" />
                    <th className="section-label px-3 py-2.5 text-left whitespace-nowrap"><span className="inline-flex items-center gap-1">Fecha<ConceptoHint columna="Fecha Contable" hoja="movimiento" /></span></th>
                    <th className="section-label px-3 py-2.5 text-left"><span className="inline-flex items-center gap-1">Tipo movimiento<ConceptoHint columna="Tipo Movimiento" hoja="movimiento" /></span></th>
                    <th className="section-label px-3 py-2.5 text-right whitespace-nowrap"><span className="inline-flex items-center gap-1">Valor<ConceptoHint columna="Valor" hoja="movimiento" /></span></th>
                    <th className="section-label px-3 py-2.5 text-right whitespace-nowrap"><span className="inline-flex items-center gap-1">Estado<ConceptoHint columna="Estado" hoja="movimiento" /></span></th>
                  </tr>
                </thead>
                <tbody>
                  {movimientos.map((mov) => (
                    <MovimientoRow key={mov.id} mov={mov} fields={movFields} />
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </Accordion>
      </div>
    </div>
  );
}
