import { useState, useEffect, useCallback, useRef } from 'react';
import { useSearchParams } from 'react-router-dom';
import { Search, X, ChevronDown, ChevronRight, User, Building2, Layers, BarChart3, History, RefreshCw, Download, CircleDot, Wallet, ClipboardList, Scale, MapPin, Building } from 'lucide-react';
import { getNegocios, getNegocio, getNegocioMovimientos, triggerNegociosBackfill, getNegociosBackfillStatus, getNegociosStats, getSubforms, getConfiguracionesFrentes } from '../utils/api';
import { formatExcelDate } from '../utils/format';
import { filtrarDatosResumen, filtrarKeysMovimiento } from '../utils/columnasExcluidas';
import { etiquetaEtapa } from '../utils/etapas';
import ConceptoHint from '../components/ConceptoHint';
import HelpTip from '../components/HelpTip';
import { ListaInfo, ListaFinanciera } from '../components/DatosFinancieros';
import { ordenarFinanciero } from '../utils/ordenColumnas';
import { estadoBadgeClass } from '../utils/estados';
import { addFechaEstimada, formatFechaUTC } from '../utils/planDePagos';
import { obtenerProyecto, desglosarPiso } from '../utils/proyectos';
import { construirPlan, normalizarPagos, conciliar, parseMonto } from '../utils/conciliacion';
import { separarUnidadesAdicionales } from '../utils/unidadesAdicionales';
import * as XLSX from 'xlsx';
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import logoBaiaKristal from '../assets/baia-kristal-logo.png';
import cornerBaiaKristal from '../assets/baia-kristal-corner.png';

// ── Helpers ────────────────────────────────────────────────────────────────

function useDebounce(value, delay = 350) {
  const [debounced, setDebounced] = useState(value);
  useEffect(() => {
    const t = setTimeout(() => setDebounced(value), delay);
    return () => clearTimeout(t);
  }, [value, delay]);
  return debounced;
}

// Clases del badge de estado — centralizadas en utils/estados.js
// (un color = un significado, mismo mapeo en toda la app).
const estadoColor = estadoBadgeClass;

function formatCOP(val) {
  if (val == null || val === '') return null;
  const n = parseFloat(String(val).replace(/[^0-9.-]/g, ''));
  if (isNaN(n)) return null;
  return new Intl.NumberFormat('es-CO', { style: 'currency', currency: 'COP', minimumFractionDigits: 0 }).format(n);
}

function formatSaldoCompact(val) {
  if (val == null || val === '') return null;
  const n = parseFloat(String(val).replace(/[^0-9.-]/g, ''));
  if (isNaN(n) || n === 0) return null;
  if (Math.abs(n) >= 1_000_000) return `$${(n / 1_000_000).toFixed(1)}M`;
  if (Math.abs(n) >= 1_000) return `$${Math.round(n / 1_000)}K`;
  return `$${Math.round(n)}`;
}

const MONTH_MAP = { ene:0, feb:1, mar:2, abr:3, may:4, jun:5, jul:6, ago:7, sep:8, oct:9, nov:10, dic:11 };

function getSaldoActual(datos) {
  if (!datos) return null;
  if (datos['Saldo Actual'] != null && datos['Saldo Actual'] !== '') return datos['Saldo Actual'];
  // Fallback: most recent dated saldo key by chronological comparison
  const keys = Object.keys(datos).filter((k) => /^saldo\s+\w+\s+\d{4}$/i.test(k));
  let best = null, bestDate = null;
  for (const k of keys) {
    const parts = k.match(/^saldo\s+(\w+)\s+(\d{4})$/i);
    if (!parts) continue;
    const mo = MONTH_MAP[parts[1].toLowerCase().slice(0, 3)];
    if (mo === undefined) continue;
    const d = new Date(+parts[2], mo, 1);
    if (!bestDate || d > bestDate) {
      const v = datos[k];
      if (v != null && v !== '') { best = v; bestDate = d; }
    }
  }
  return best;
}

function formatCell(key, value) {
  if (value == null || value === '') return null;
  const k = (key || '').toLowerCase();
  if (k.includes('fecha')) {
    const formatted = formatExcelDate(value);
    return formatted !== '—' ? formatted : String(value);
  }
  if (k.includes('valor') || k.includes('monto') || k.includes('saldo') || k.includes('precio') ||
      k.includes('cuota') || k.includes('capital') || k.includes('deuda') || k.includes('abono') ||
      k.includes('descuento') || k.includes('credito') || k.includes('crédito') || k.includes('subsidio') ||
      k.includes('anticipo') || k.includes('importe') || k.includes('acreditacion') || k.includes('acreditación') ||
      k.includes('escritura') || k.includes('factura') || k.includes('aporte') || k.includes('canje') ||
      k.endsWith(' +') || k.endsWith(' (-)') || k.includes('movimiento posterior')) {
    const cop = formatCOP(value);
    return cop !== null ? cop : String(value);
  }
  if (k.includes('area') || k.includes('área')) {
    const n = parseFloat(String(value));
    if (!isNaN(n)) return `${n} m²`;
  }
  return String(value);
}

// Classify datos fields into apartment vs financial vs other
const APTO_KEYS = [
  'nomenclatura', 'area', 'área', 'm2', 'm²', 'tipo inmueble',
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
    if (APTO_KEYS.some((ak) => k === ak || k.includes(ak))) apto[key] = value;
    else if (FIN_KEYS.some((fk) => k === fk || k.includes(fk))) financiero[key] = value;
    else otros[key] = value;
  }
  return { apto, financiero, otros };
}

// Traduce un subconjunto de campos del Product de Zoho (InventarioItem.datos)
// al mismo formato [etiqueta, valor] que categorizeDatos, para inmuebles que
// todavía no tienen Negocio.datos (Excel de Movimientos) del cual sacar esta
// información. Ampliable si hace falta más adelante.
function categorizeInventarioDatos(datosInmueble) {
  if (!datosInmueble) return [];
  const campos = [
    ['Código de inmueble', datosInmueble.C_digo_inmueble],
    ['Categoría', datosInmueble.Product_Category],
    ['Tipo', datosInmueble.Tipo_Apto],
    ['Área privada (m²)', datosInmueble.Area_Privada_en_M2],
    ['Área construida (m²)', datosInmueble.Area_Construida_en_M2],
    ['Piso', datosInmueble.Piso],
    ['Alcobas', datosInmueble.No_Alcobas],
    ['Baños', datosInmueble.No_Ba_os],
    ['Estrato', datosInmueble.Estrato],
  ];
  return campos.filter(([, v]) => v != null && String(v).trim() !== '');
}

// ── Sub-components ──────────────────────────────────────────────────────────

function Accordion({ icon: Icon, title, badge, children, defaultOpen = true, accent = '#0e7581' }) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <div className="card overflow-hidden">
      <button
        onClick={() => setOpen((o) => !o)}
        className="w-full flex items-center gap-2.5 px-4 py-3 hover:bg-aed-base transition-colors"
      >
        {Icon && (
          <span
            className="w-7 h-7 rounded-lg flex items-center justify-center flex-shrink-0"
            style={{ backgroundColor: `${accent}14`, color: accent }}
          >
            <Icon size={15} strokeWidth={2} />
          </span>
        )}
        <span className="text-[14px] font-semibold text-slate-800 flex-1 text-left">{title}</span>
        {badge != null && badge !== 0 && (
          <span className="text-[12px] font-medium text-slate-500 bg-aed-base border border-aed-border px-2 py-0.5 rounded-full">
            {badge}
          </span>
        )}
        <ChevronDown
          size={14}
          strokeWidth={2}
          className={`text-slate-400 transition-transform flex-shrink-0 ${open ? 'rotate-180' : ''}`}
        />
      </button>
      {open && <div className="border-t border-aed-border">{children}</div>}
    </div>
  );
}

function MovimientoRow({ mov, fields }) {
  const [expanded, setExpanded] = useState(false);
  const datos = mov.datos || {};

  // Pick the best "fecha", "tipo/concepto", "valor" values from the movement datos
  const fecha = datos['Fecha Contable'] ? formatExcelDate(datos['Fecha Contable']) : null;
  const tipo = datos['Tipo Movimiento'] || datos['Concepto'] || null;
  const valor = datos['Valor'] ? formatCOP(datos['Valor']) : null;

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
      </tr>
      {expanded && (
        <tr className="bg-brand-tint border-b border-aed-border">
          <td colSpan={4} className="px-5 py-3">
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

function MovimientosSection({ id }) {
  const [movimientos, setMovimientos] = useState(null);
  const [page, setPage] = useState(1);
  const [pagination, setPagination] = useState(null);
  const [loading, setLoading] = useState(false);

  const load = useCallback(
    (p = 1) => {
      setLoading(true);
      getNegocioMovimientos(id, { page: p, limit: 50 })
        .then((res) => {
          setMovimientos(res.data);
          setPagination(res.pagination);
          setPage(p);
        })
        .finally(() => setLoading(false));
    },
    [id]
  );

  useEffect(() => { load(1); }, [load]);

  const fields =
    movimientos && movimientos.length > 0
      ? filtrarKeysMovimiento(Object.keys(movimientos[0].datos || {}))
      : [];

  return (
    <div>
      {loading && (
        <div className="flex items-center gap-2 px-4 py-4 text-[14px] text-slate-500">
          <svg className="w-4 h-4 animate-spin text-brand" fill="none" viewBox="0 0 24 24">
            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
          </svg>
          Cargando movimientos...
        </div>
      )}

      {!loading && movimientos && movimientos.length === 0 && (
        <p className="px-4 py-4 text-[14px] text-slate-500 italic">Sin movimientos registrados</p>
      )}

      {!loading && movimientos && movimientos.length > 0 && (
        <>
          <div className="overflow-x-auto">
            <table className="w-full text-[14px]">
              <thead>
                <tr className="bg-aed-base border-b border-aed-border">
                  <th className="w-6" />
                  <th className="section-label px-3 py-2.5 text-left whitespace-nowrap"><span className="inline-flex items-center gap-1">Fecha<ConceptoHint columna="Fecha Contable" hoja="movimiento" /></span></th>
                  <th className="section-label px-3 py-2.5 text-left"><span className="inline-flex items-center gap-1">Tipo movimiento<ConceptoHint columna="Tipo Movimiento" hoja="movimiento" /></span></th>
                  <th className="section-label px-3 py-2.5 text-right whitespace-nowrap"><span className="inline-flex items-center gap-1">Valor<ConceptoHint columna="Valor" hoja="movimiento" /></span></th>
                </tr>
              </thead>
              <tbody>
                {movimientos.map((mov) => (
                  <MovimientoRow key={mov.id} mov={mov} fields={fields} />
                ))}
              </tbody>
            </table>
          </div>
          {pagination && pagination.totalPages > 1 && (
            <div className="flex items-center justify-between px-4 py-2.5 border-t border-aed-border bg-aed-base">
              <span className="text-[13px] text-slate-500">
                {pagination.total} movimientos · pág. {pagination.page}/{pagination.totalPages}
              </span>
              <div className="flex gap-1">
                <button
                  disabled={page <= 1}
                  onClick={() => load(page - 1)}
                  className="px-2.5 py-1 rounded text-[13px] border border-aed-border bg-white hover:bg-aed-base disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
                >
                  ← Anterior
                </button>
                <button
                  disabled={page >= pagination.totalPages}
                  onClick={() => load(page + 1)}
                  className="px-2.5 py-1 rounded text-[13px] border border-aed-border bg-white hover:bg-aed-base disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
                >
                  Siguiente →
                </button>
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
}

// ── Forma de pago desde la oportunidad de Zoho vinculada ────────────────────

// Parsea un valor como número (ignora fechas y separadores de miles).
function parseAmt(v) {
  if (v == null || v === '') return NaN;
  if (typeof v === 'number') return v;
  const s = String(v).trim();
  if (/^\d{1,2}[\/\-]\d{1,2}[\/\-]\d{2,4}$/.test(s)) return NaN; // es una fecha
  return parseFloat(s.replace(/[^0-9-]/g, ''));
}

function PlanSubTable({ rows }) {
  if (!rows || rows.length === 0) {
    return <p className="px-3 py-3 text-[14px] text-slate-500 italic">Sin datos</p>;
  }
  const SKIP = ['id', 'Created_Time', 'Modified_Time', '$line_tax', '$permissions', 'Owner'];
  const keys = [...new Set(rows.flatMap(Object.keys))].filter((k) => !SKIP.includes(k));
  const toLabel = (k) => k.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());

  // Campos monetarios: los que tienen algún valor >= 1000. Se ocultan las filas
  // cuyos montos están todos en 0 (mismo criterio que la vista de Oportunidades).
  const moneyKeys = keys.filter((k) =>
    rows.some((row) => { const n = parseAmt(row[k]); return !isNaN(n) && n >= 1000; })
  );
  const visibleRows = moneyKeys.length === 0
    ? rows
    : rows.filter((row) => moneyKeys.some((k) => { const n = parseAmt(row[k]); return !isNaN(n) && n !== 0; }));

  if (visibleRows.length === 0) {
    return <p className="px-3 py-3 text-[14px] text-slate-500 italic">Sin datos</p>;
  }

  return (
    <div className="overflow-x-auto">
      <table className="w-full text-[14px]">
        <thead>
          <tr className="bg-aed-base border-b border-aed-border">
            {keys.map((k) => (
              <th key={k} className="section-label px-3 py-2 text-left whitespace-nowrap">{toLabel(k)}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {visibleRows.map((r, i) => (
            <tr key={i} className="border-b border-aed-border last:border-0 hover:bg-brand-tint">
              {keys.map((k) => {
                const v = r[k];
                let d = '—';
                if (v != null && v !== '') {
                  if (typeof v === 'object') d = v.name || v.display_value || JSON.stringify(v);
                  else if (typeof v === 'number') d = formatCOP(v);
                  else d = String(v);
                }
                return <td key={k} className="px-3 py-2 text-slate-600 whitespace-nowrap">{d}</td>;
              })}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function PlanDePagosZoho({ oportunidad }) {
  const [subforms, setSubforms] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let alive = true;
    getSubforms(oportunidad.id)
      .then((s) => { if (alive) setSubforms(s || { formaPago: [], propuestaPago: [] }); })
      .catch(() => { if (alive) setSubforms({ formaPago: [], propuestaPago: [] }); })
      .finally(() => { if (alive) setLoading(false); });
    return () => { alive = false; };
  }, [oportunidad.id]);

  if (loading) {
    return (
      <p className="flex items-center gap-2 px-4 py-4 text-[14px] text-slate-500">
        <svg className="w-4 h-4 animate-spin text-brand" fill="none" viewBox="0 0 24 24">
          <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
          <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
        </svg>
        Cargando…
      </p>
    );
  }

  const forma = addFechaEstimada(subforms?.formaPago || [], oportunidad.fechaInicioPlanPagos);
  const propuesta = addFechaEstimada(subforms?.propuestaPago || [], oportunidad.fechaInicioPlanPagos);
  const tieneFechas = (rows) => rows.some((r) => 'Fecha estimada' in r);

  if (forma.length === 0 && propuesta.length === 0) {
    return <p className="px-4 py-4 text-[14px] text-slate-500 italic">Sin forma ni propuesta de pago registradas</p>;
  }

  const aviso = (
    <p className="text-[12px] text-slate-500 italic mt-2 px-1">
      * Fechas estimadas con periodicidad mensual desde la fecha de separación. No representan fechas contractuales.
    </p>
  );

  return (
    <div className="flex flex-col gap-4 p-4">
      {forma.length > 0 && (
        <div>
          <p className="section-label mb-2">Forma de pago</p>
          <div className="rounded-lg border border-aed-border overflow-hidden">
            <PlanSubTable rows={forma} />
          </div>
          {tieneFechas(forma) && aviso}
        </div>
      )}
      {propuesta.length > 0 && (
        <div>
          <p className="section-label mb-2">Propuesta de pago</p>
          <div className="rounded-lg border border-aed-border overflow-hidden">
            <PlanSubTable rows={propuesta} />
          </div>
          {tieneFechas(propuesta) && aviso}
        </div>
      )}
    </div>
  );
}

// ── Conciliación: plan de pagos (Zoho) vs pagos reales (fiducia) ────────────

function badgeConciliacion(c) {
  if (c.atrasada) return { txt: 'Atrasada', cls: 'text-red-700 bg-red-50' };
  if (c.estado === 'pagada') return { txt: 'Pagada', cls: 'text-emerald-700 bg-emerald-50' };
  if (c.estado === 'parcial') return { txt: 'Parcial', cls: 'text-amber-700 bg-amber-50' };
  return { txt: 'Pendiente', cls: 'text-slate-600 bg-slate-100' };
}

// Etiquetas numéricas del subform ("1", "2"…) se muestran como "Cuota N".
function labelCuota(etiqueta) {
  return /^\d+$/.test(etiqueta) ? `Cuota ${etiqueta}` : etiqueta;
}

// Fila de cuota expandible: al hacer clic (si tiene pagos) despliega los
// pagos reales que cayeron en su tramo de la cascada — mismo patrón visual
// que MovimientoRow (flecha a la izquierda, colapsa/expande).
function CuotaRow({ c }) {
  const [expanded, setExpanded] = useState(false);
  const badge = badgeConciliacion(c);
  const tienePagos = c.pagosAplicados && c.pagosAplicados.length > 0;

  return (
    <>
      <tr
        onClick={() => tienePagos && setExpanded((e) => !e)}
        className={`border-b border-aed-border last:border-0 hover:bg-brand-tint ${tienePagos ? 'cursor-pointer' : ''}`}
      >
        <td className="pl-3 pr-1 py-2 w-6">
          {tienePagos && (
            <ChevronRight
              size={12}
              strokeWidth={2.5}
              className={`text-slate-500 transition-transform ${expanded ? 'rotate-90 text-brand' : ''}`}
            />
          )}
        </td>
        <td className="px-3 py-2 text-slate-700 whitespace-nowrap">{labelCuota(c.etiqueta)}</td>
        <td className="px-3 py-2 text-slate-500 whitespace-nowrap">
          {c.fechaEstimada ? formatFechaUTC(c.fechaEstimada) : '—'}
        </td>
        <td className="px-3 py-2 text-slate-500 whitespace-nowrap">
          {c.estado === 'pagada' && c.fechaCubierta ? formatFechaUTC(c.fechaCubierta) : '—'}
        </td>
        <td className="px-3 py-2 text-right text-slate-700 whitespace-nowrap tabular-nums">{formatCOP(c.valorPlan)}</td>
        <td className="px-3 py-2 text-right whitespace-nowrap tabular-nums">
          {c.cubierto > 0 ? (
            <span className={c.estado === 'pagada' ? 'text-emerald-600' : 'text-amber-600'}>{formatCOP(c.cubierto)}</span>
          ) : (
            <span className="text-slate-300">—</span>
          )}
        </td>
        <td className="px-3 py-2 text-right whitespace-nowrap tabular-nums">
          {formatCOP(c.valorPlan - c.cubierto)}
        </td>
        <td className="px-3 py-2 text-right whitespace-nowrap tabular-nums">
          {c.atrasada && c.diasAtraso != null ? (
            <span className="text-red-600 font-medium">{c.diasAtraso}</span>
          ) : (
            <span className="text-slate-300">—</span>
          )}
        </td>
        <td className="px-3 py-2 text-right whitespace-nowrap">
          <span className={`text-[12px] font-bold px-2 py-0.5 rounded-full ${badge.cls}`}>{badge.txt}</span>
          {c.atrasada && c.fechaEstimada && (
            <span className="block text-[11px] text-red-500 mt-0.5">venció {formatFechaUTC(c.fechaEstimada)}</span>
          )}
          {c.estado === 'pagada' && c.fechaCubierta && (
            <span className="block text-[11px] text-slate-400 mt-0.5">pagada el {formatFechaUTC(c.fechaCubierta)}</span>
          )}
        </td>
      </tr>
      {expanded && tienePagos && (
        <tr className="bg-brand-tint border-b border-aed-border">
          <td colSpan={9} className="px-5 py-3">
            <div className="flex flex-col gap-1.5">
              {c.pagosAplicados.map((p, i) => {
                const mismoMonto = Math.abs(p.destinado - p.valor) < 1;
                return (
                  <div key={i} className="flex items-center justify-between gap-4 text-[13px]">
                    <div className="flex items-center gap-2 min-w-0">
                      <span className="text-slate-500">{p.fecha ? formatFechaUTC(p.fecha) : 'Sin fecha'}</span>
                      {p.id && <span className="text-[12px] text-brand font-semibold font-mono bg-brand-tint px-1.5 py-0.5 rounded">Mov {p.id}</span>}
                    </div>
                    <div className="text-right">
                      <span className={`font-medium tabular-nums ${p.valor < 0 ? 'text-red-600' : 'text-slate-700'}`}>
                        {p.valor < 0 ? '-' : ''}{formatCOP(Math.abs(p.valor))}
                      </span>
                      {!mismoMonto && (
                        <span className={`block text-[11px] mt-0.5 ${p.destinado < 0 ? 'text-red-400' : 'text-slate-400'}`}>
                          destinado a esta cuota: {p.destinado < 0 ? '-' : ''}{formatCOP(Math.abs(p.destinado))}
                        </span>
                      )}
                    </div>
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

// Fetch + cómputo completo de la conciliación de un negocio (subforms Zoho +
// movimientos fiduciarios + ajustes de Fecha de Entrega configurados) --
// compartido entre ConciliacionSection (vista en pantalla) y el export de
// Estado de Cuenta (PDF), para no duplicar esta lógica en dos sitios.
async function obtenerConciliacionCompleta(negocio) {
  const oportunidad = negocio.oportunidad;
  if (!oportunidad) return { cuotas: [], resumen: null, movimientos: [], valorVenta: null };

  const [subs, configFrentes] = await Promise.all([
    getSubforms(oportunidad.id),
    getConfiguracionesFrentes().catch(() => ({ data: [] })),
  ]);
  // Todos los movimientos del negocio (loop defensivo si total > 200)
  const movimientos = [];
  let page = 1, totalPages = 1;
  do {
    const res = await getNegocioMovimientos(negocio.id, { page, limit: 200 });
    movimientos.push(...(res.data || []));
    totalPages = res.pagination?.totalPages ?? 1;
    page += 1;
  } while (page <= totalPages);

  const valorVentaKey = Object.keys(negocio.datos || {}).find((k) => k.toLowerCase() === 'valor venta');
  const valorVenta = valorVentaKey ? parseMonto(negocio.datos[valorVentaKey]) : null;

  // Propuesta de Pago primero (es con la que se hace la conciliación real
  // del negocio), Forma de Pago como respaldo solo si no hay propuesta.
  // Mismo criterio que dashboardRecaudoService.js (Dashboard / Cartera en
  // Gestión) para que no diverjan entre sí.
  const planRows = subs?.propuestaPago?.length ? subs.propuestaPago : (subs?.formaPago || []);
  const cuotasPlan = construirPlan(planRows, oportunidad.fechaInicioPlanPagos);
  if (cuotasPlan.length === 0) {
    return { cuotas: [], resumen: null, movimientos, valorVenta };
  }

  // Recalcular la última cuota (Saldo Contraentrega) para que cuadre con VALOR VENTA
  if (valorVenta != null && !isNaN(valorVenta) && cuotasPlan.length >= 2) {
    const sumaResto = cuotasPlan.slice(0, -1).reduce((s, c) => s + c.valorPlan, 0);
    const lastCuota = cuotasPlan[cuotasPlan.length - 1];
    lastCuota.valorPlan = valorVenta - sumaResto;
  }

  // Fecha de entrega configurada en Ajustes -- reemplaza la fecha estimada
  // (inferida) de Saldo Contraentrega. Prioridad: piso específico primero,
  // si no hay, toda la torre, si no hay, todo el proyecto -- son mutuamente
  // excluyentes en Ajustes, pero se resuelve en ese orden igual. Mismo
  // criterio que dashboardRecaudoService.js (Dashboard / Cartera en
  // Gestión) para que no diverjan entre sí.
  const configFrentesData = configFrentes?.data || [];
  const configFrente = negocio.frente
    ? configFrentesData.find((c) => c.frente === negocio.frente && c.torre === negocio.torre && c.piso === negocio.piso) ??
      configFrentesData.find((c) => c.frente === negocio.frente && c.torre === negocio.torre && c.piso === null) ??
      configFrentesData.find((c) => c.frente === negocio.frente && c.torre === null && c.piso === null)
    : null;
  if (configFrente?.fechaEntrega) {
    cuotasPlan[cuotasPlan.length - 1].fechaEstimada = new Date(configFrente.fechaEntrega);
  }

  const { cuotas, resumen } = conciliar(cuotasPlan, normalizarPagos(movimientos));

  if (valorVenta != null && !isNaN(valorVenta)) {
    resumen.totalPlan = valorVenta;
    resumen.porcentaje = valorVenta > 0 ? Math.round((resumen.totalPagado / valorVenta) * 100) : 0;
    resumen.saldoAFavor = Math.max(0, resumen.totalPagado - valorVenta);
  }

  return { cuotas, resumen, movimientos, valorVenta };
}

function ConciliacionSection({ negocio }) {
  const oportunidad = negocio.oportunidad;
  const [datos, setDatos] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    if (!oportunidad) { setLoading(false); return; }
    let alive = true;
    (async () => {
      try {
        const resultado = await obtenerConciliacionCompleta(negocio);
        if (alive) setDatos(resultado);
      } catch (err) {
        if (alive) setError(err.message);
      } finally {
        if (alive) setLoading(false);
      }
    })();
    return () => { alive = false; };
  }, [oportunidad?.id, negocio.id]);

  if (!oportunidad) {
    return <p className="px-4 py-4 text-[14px] text-slate-500 italic">Sin oportunidad de Zoho vinculada a esta referencia.</p>;
  }
  if (loading) {
    return (
      <p className="flex items-center gap-2 px-4 py-4 text-[14px] text-slate-500">
        <svg className="w-4 h-4 animate-spin text-brand" fill="none" viewBox="0 0 24 24">
          <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
          <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
        </svg>
        Cargando conciliación…
      </p>
    );
  }
  if (error) {
    return <p className="px-4 py-4 text-[14px] text-red-500">Error cargando la conciliación: {error}</p>;
  }
  if (!datos.resumen) {
    return <p className="px-4 py-4 text-[14px] text-slate-500 italic">La oportunidad vinculada no tiene plan de pagos registrado.</p>;
  }

  const { cuotas, resumen } = datos;

  return (
    <div className="flex flex-col gap-4 p-4">
      {/* Resumen */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <div className="rounded-lg border border-aed-border bg-white p-3">
          <p className="section-label mb-1">Total plan</p>
          <p className="text-[15px] font-bold text-slate-800 tabular-nums">{formatCOP(resumen.totalPlan)}</p>
        </div>
        <div className="rounded-lg border border-aed-border bg-white p-3">
          <p className="section-label mb-1">Total pagado</p>
          <p className="text-[15px] font-bold text-emerald-600 tabular-nums">
            {formatCOP(resumen.totalPagado) ?? '$ 0'}
            <span className="ml-1 text-[12px] font-semibold text-slate-500">({resumen.porcentaje}%)</span>
          </p>
        </div>
        <div className="rounded-lg border border-aed-border bg-white p-3">
          <p className="section-label mb-1">Cuotas pagadas</p>
          <p className="text-[15px] font-bold text-slate-800 tabular-nums">{resumen.cuotasPagadas}/{resumen.totalCuotas}</p>
        </div>
        <div className="rounded-lg border border-aed-border bg-white p-3">
          <p className="section-label mb-1">En mora</p>
          {resumen.cuotasEnMora > 0 ? (
            <p className="text-[15px] font-bold text-red-600 tabular-nums">
              {resumen.cuotasEnMora} {resumen.cuotasEnMora === 1 ? 'cuota' : 'cuotas'}
              <span className="block text-[12px] font-semibold">{formatCOP(resumen.montoEnMora)}</span>
              <span className="block text-[12px] font-semibold">{resumen.maxDiasAtraso} días</span>
            </p>
          ) : (
            <p className="text-[15px] font-bold text-slate-400">—</p>
          )}
        </div>
      </div>

      {resumen.saldoContraentrega && (
        <div className="rounded-lg border border-aed-border bg-white p-3">
          <p className="section-label mb-1">Saldo Contraentrega</p>
          <div className="flex items-center justify-between">
            <div>
              <p className="text-[15px] font-bold text-slate-800 tabular-nums">{formatCOP(resumen.saldoContraentrega.valorPlan)}</p>
              {resumen.saldoContraentrega.cubierto > 0 && (
                <p className="text-[12px] text-amber-600">Pagado: {formatCOP(resumen.saldoContraentrega.cubierto)}</p>
              )}
            </div>
            <div className="text-right">
              {resumen.saldoContraentrega.fechaEstimada ? (
                <p className="text-[13px] text-slate-600">{formatFechaUTC(resumen.saldoContraentrega.fechaEstimada)}</p>
              ) : (
                <p className="text-[13px] text-slate-400">—</p>
              )}
              <p className="text-[12px] text-slate-500">Fecha esperada</p>
            </div>
          </div>
        </div>
      )}

      {/* Tabla de cuotas */}
      <div className="rounded-lg border border-aed-border overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-[14px]">
            <thead>
              <tr className="bg-aed-base border-b border-aed-border">
                <th className="w-6" />
                <th className="section-label px-3 py-2 text-left whitespace-nowrap">Cuota</th>
                <th className="section-label px-3 py-2 text-left whitespace-nowrap">Fecha esperada</th>
                <th className="section-label px-3 py-2 text-left whitespace-nowrap">Fecha de pago</th>
                <th className="section-label px-3 py-2 text-right whitespace-nowrap">Valor de la cuota</th>
                <th className="section-label px-3 py-2 text-right whitespace-nowrap">Valor pagado</th>
                <th className="section-label px-3 py-2 text-right whitespace-nowrap">Diferencia</th>
                <th className="section-label px-3 py-2 text-right whitespace-nowrap">Días de atraso</th>
                <th className="section-label px-3 py-2 text-right whitespace-nowrap">Estado</th>
              </tr>
            </thead>
            <tbody>
              {cuotas.map((c, i) => <CuotaRow key={i} c={c} />)}
            </tbody>
          </table>
        </div>
      </div>

      {resumen.saldoAFavor > 0 && (
        <p className="text-[13px] font-semibold text-emerald-700 px-1">
          Saldo a favor: {formatCOP(resumen.saldoAFavor)}
        </p>
      )}

      <p className="text-[12px] text-slate-500 italic px-1">
        * Conciliación estimada según fechas calculadas, pagos aplicados y reversas (desistimientos y devoluciones). No representa un estado de cuenta oficial.
      </p>
    </div>
  );
}

function NegocioDetalle({ id }) {
  const [negocio, setNegocio] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [exportando, setExportando] = useState(false);

  useEffect(() => {
    setLoading(true);
    setError(null);
    getNegocio(id)
      .then(setNegocio)
      .catch((err) => setError(err.response?.data?.error || err.message))
      .finally(() => setLoading(false));
  }, [id]);

  async function handleExportarEstadoCuenta() {
    if (!negocio || exportando) return;
    setExportando(true);
    try {
      const datos = await obtenerConciliacionCompleta(negocio);
      if (!datos.resumen) {
        window.alert('Este negocio no tiene un plan de pagos registrado -- no se puede generar el estado de cuenta.');
        return;
      }
      await exportarEstadoCuenta(negocio, datos);
    } catch (err) {
      window.alert(`Error generando el estado de cuenta: ${err.message}`);
    } finally {
      setExportando(false);
    }
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center h-full min-h-[200px]">
        <div className="flex items-center gap-2 text-slate-500 text-[15px]">
          <svg className="w-5 h-5 animate-spin text-brand" fill="none" viewBox="0 0 24 24">
            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
          </svg>
          Cargando...
        </div>
      </div>
    );
  }

  if (error || !negocio) {
    return (
      <div className="flex items-center justify-center h-full min-h-[200px]">
        <p className="text-red-500 text-[15px]">{error || 'Negocio no encontrado'}</p>
      </div>
    );
  }

  const { apto, financiero } = categorizeDatos(separarUnidadesAdicionales(filtrarDatosResumen(negocio.datos || {})));
  const aptoEntriesBase = negocio.datos
    ? Object.entries(apto)
    : categorizeInventarioDatos(negocio.inventarioDatos);
  const finEntries = ordenarFinanciero(Object.entries(financiero));

  const nomenclatura = negocio.datos?.Nomenclatura;
  const saldo = negocio.saldoActual ?? null;
  const saldoFmt = saldo != null ? formatCOP(saldo) : null;

  // Extraer código numérico del Fideicomiso y separar Etapa / Torres
  const fideicomisoRaw = negocio.datos?.Fideicomiso || '';
  const codigoMatch = String(fideicomisoRaw).match(/^(\d+)/);
  const proyectoInfo = codigoMatch ? obtenerProyecto(codigoMatch[1]) : null;

  // Separar el Piso de la oportunidad de Zoho ("Kabo - Torre 4 - Piso 1")
  // en Torre ("Kabo 4") y Piso ("1")
  const pisoRaw = negocio.oportunidad?.seccionInmueble?.Piso
    || negocio.oportunidad?.seccionInmueble?.Piso_Lista
    || null;
  const pisoInfo = desglosarPiso(pisoRaw);

  // Etapa, Código de Inmueble y Project Code se muestran como un campo más
  // de la lista, igual que Nomenclatura — no como chips aparte.
  const aptoEntries = [
    ...(proyectoInfo?.etapa ? [['Etapa', proyectoInfo.etapa]] : []),
    ...(negocio.codigoInmueble ? [['Código de Inmueble', negocio.codigoInmueble]] : []),
    ...(negocio.projectCode ? [['Project Code', negocio.projectCode]] : []),
    ...aptoEntriesBase,
  ];

  return (
    <div className="flex flex-col gap-3 p-5">
      {/* Header */}
      <div className="card px-4 py-3">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <p className="text-[12px] text-slate-500 mb-0.5 uppercase tracking-wide">
              {negocio.referencia ? 'Referencia' : 'Project Code'}
            </p>
            <h2 className="font-heading text-[19px] font-bold text-ink font-mono">
              {negocio.referencia || negocio.projectCode || '—'}
            </h2>
            {(negocio.referencia && (negocio.projectCode || nomenclatura || proyectoInfo?.etapa || pisoInfo)) && (
              <p className="text-[15px] font-semibold text-brand-strong mt-0.5">
                {negocio.projectCode ? (
                  <span>{negocio.projectCode}</span>
                ) : (
                  <>
                    {nomenclatura && <span>Apto {nomenclatura}</span>}
                    {nomenclatura && (proyectoInfo?.etapa || pisoInfo) && <span className="mx-1.5 text-slate-300">·</span>}
                    {proyectoInfo?.etapa && <span>Etapa {proyectoInfo.etapa}</span>}
                    {proyectoInfo?.etapa && pisoInfo && <span className="mx-1.5 text-slate-300">·</span>}
                    {pisoInfo?.torre && <span>Torre {pisoInfo.torre}</span>}
                    {pisoInfo?.torre && pisoInfo?.piso && <span className="mx-1.5 text-slate-300">·</span>}
                    {pisoInfo?.piso && <span>Piso {pisoInfo.piso}</span>}
                  </>
                )}
              </p>
            )}
          </div>
          <div className="flex flex-col items-end gap-1.5 flex-shrink-0">
            <div className="flex items-center gap-2">
              {negocio.estado && (
                <span className={`text-[12px] font-bold px-2.5 py-1 rounded-full ${estadoColor(negocio.estado)}`}>
                  {negocio.estado}
                </span>
              )}
              {!negocio.tieneNegocio && (
                <span className="text-[12px] font-medium px-2.5 py-1 rounded-full bg-slate-100 text-slate-500">
                  Sin negocio
                </span>
              )}
              <span className="text-[13px] text-slate-500 bg-aed-base border border-aed-border px-2 py-0.5 rounded-full">
                {negocio.totalMovimientos} mov.
              </span>
              {negocio.oportunidad && (
                <button
                  onClick={handleExportarEstadoCuenta}
                  disabled={exportando}
                  title="Exportar estado de cuenta (PDF)"
                  className="flex items-center gap-1.5 text-[12px] font-semibold px-2.5 py-1 rounded-full bg-brand text-white hover:bg-brand-strong disabled:opacity-60 disabled:cursor-not-allowed transition-colors"
                >
                  {exportando ? (
                    <svg className="w-3 h-3 animate-spin" fill="none" viewBox="0 0 24 24">
                      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                    </svg>
                  ) : (
                    <Download size={12} />
                  )}
                  Estado de cuenta
                </button>
              )}
            </div>
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
      <Accordion icon={User} title="Comprador" badge={negocio.compradores?.length} accent="#0e7581" defaultOpen>
        {negocio.compradores && negocio.compradores.length > 0 ? (
          <div className="divide-y divide-aed-border">
            {negocio.compradores.map((c, i) => {
              const nombre = c.nombre.replace(/^\|+\s*/, '').replace(/^\d+\s+/, '').replace(/\s*\(\d+\.?\d*%\)\s*$/, '');
              return (
              <div key={c.id ?? i} className="flex items-center gap-3 px-4 py-3">
                <div className="w-8 h-8 rounded-full bg-brand-soft border border-brand-soft flex items-center justify-center text-[13px] font-bold text-brand-strong flex-shrink-0">
                  {nombre.charAt(0).toUpperCase()}
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

      {/* 2. Apartamento */}
      <Accordion icon={Building2} title="Info del apartamento" badge={aptoEntries.length} accent="#7c3aed" defaultOpen>
        {aptoEntries.length > 0 ? (
          <ListaInfo entries={aptoEntries} hoja="resumen" format={formatCell} />
        ) : (
          <p className="px-4 py-4 text-[14px] text-slate-500 italic bg-white">Sin datos del apartamento</p>
        )}
      </Accordion>

      {/* 3. Estructura financiera */}
      <Accordion icon={BarChart3} title="Estructura financiera y abonos" badge={finEntries.length} accent="#059669" defaultOpen={false}>
        {finEntries.length > 0 ? (
          <ListaFinanciera entries={finEntries} format={formatCell} />
        ) : (
          <p className="px-4 py-4 text-[14px] text-slate-500 italic bg-white">Sin datos financieros en este archivo</p>
        )}
      </Accordion>

      {/* 4. Conciliación plan vs pagos reales */}
      <Accordion icon={Scale} title="Conciliación" accent="#0891b2" defaultOpen={false}>
        <ConciliacionSection key={id} negocio={negocio} />
      </Accordion>

      {/* 5. Movimientos */}
      <Accordion icon={History} title="Historial de movimientos" badge={negocio.totalMovimientos} accent="#d97706" defaultOpen={false}>
        <MovimientosSection key={id} id={id} />
      </Accordion>

      {/* 6. Forma y propuesta de pago (oportunidad Zoho vinculada por referencia) */}
      <Accordion icon={ClipboardList} title="Forma y propuesta de pago" accent="#2563eb" defaultOpen={false}>
        {negocio.oportunidad ? (
          <PlanDePagosZoho oportunidad={negocio.oportunidad} />
        ) : (
          <p className="px-4 py-4 text-[14px] text-slate-500 italic">
            Sin oportunidad de Zoho vinculada a esta referencia.
          </p>
        )}
      </Accordion>
    </div>
  );
}

// ── CSV export ─────────────────────────────────────────────────────────────

function escapeCSV(v) {
  if (v == null) return '';
  const s = String(v).replace(/"/g, '""');
  return /[,"\n]/.test(s) ? `"${s}"` : s;
}

function toCSV(negocios) {
  const headers = [
    'Referencia', 'Estado', 'Fideicomiso', 'Nomenclatura', 'Área',
    'Inventario', 'Compradores', 'Cédulas', 'Total abonado', 'Valor Venta', 'Movimientos',
  ];
  const rows = negocios.map((n) => {
    const compradores = (n.compradores || [])
      .map((c) => c.nombre.replace(/^\|+\s*/, '').replace(/^\d+\s+/, '').replace(/\s*\(\d+\.?\d*%\)\s*$/, ''))
      .join(' | ');
    const cedulas = (n.compradores || []).map((c) => c.nroId || '').filter(Boolean).join(' | ');
    return [
      n.referencia,
      n.estado,
      n.datos?.Fideicomiso,
      n.datos?.Nomenclatura,
      n.datos?.Área ?? n.datos?.Area,
      n.datos?.Inventario,
      compradores,
      cedulas,
      getSaldoActual(n.datos),
      n.datos?.['Valor venta'] ?? n.datos?.['Valor Venta'],
      n.totalMovimientos,
    ].map(escapeCSV).join(',');
  });
  return [headers.join(','), ...rows].join('\n');
}

function triggerDownload(content, filename) {
  const blob = new Blob(['﻿' + content], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

function buildRows(negocios) {
  return negocios.map((n) => ({
    Referencia: n.referencia ?? '',
    Estado: n.estado ?? '',
    Fideicomiso: n.datos?.Fideicomiso ?? '',
    Nomenclatura: n.datos?.Nomenclatura ?? '',
    Área: n.datos?.Área ?? n.datos?.Area ?? '',
    Inventario: n.datos?.Inventario ?? '',
    Compradores: (n.compradores || [])
      .map((c) => c.nombre.replace(/^\|+\s*/, '').replace(/^\d+\s+/, '').replace(/\s*\(\d+\.?\d*%\)\s*$/, ''))
      .join(' | '),
    Cédulas: (n.compradores || []).map((c) => c.nroId || '').filter(Boolean).join(' | '),
    'Total abonado': getSaldoActual(n.datos) ?? '',
    'Valor Venta': n.datos?.['Valor venta'] ?? n.datos?.['Valor Venta'] ?? '',
    Movimientos: n.totalMovimientos ?? 0,
  }));
}

function exportExcel(negocios, filename) {
  const ws = XLSX.utils.json_to_sheet(buildRows(negocios));
  // Auto column widths
  const colWidths = Object.keys(buildRows([negocios[0] || {}])).map((k) => ({
    wch: Math.max(k.length, 12),
  }));
  ws['!cols'] = colWidths;
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, 'Negocios');
  XLSX.writeFile(wb, filename);
}

function exportPDF(negocios, filename) {
  const doc = new jsPDF({ orientation: 'landscape', unit: 'mm', format: 'a4' });
  const date = new Date().toLocaleDateString('es-CO', { day: '2-digit', month: '2-digit', year: 'numeric' });

  doc.setFontSize(13);
  doc.setTextColor(30, 41, 59);
  doc.text('Negocios', 14, 14);
  doc.setFontSize(8);
  doc.setTextColor(100, 116, 139);
  doc.text(`${date} · ${negocios.length} registros`, 14, 20);

  autoTable(doc, {
    startY: 25,
    head: [['Referencia', 'Estado', 'Nomenclatura', 'Compradores', 'Cédulas', 'Total abonado', 'Mov.']],
    body: negocios.map((n) => [
      n.referencia ?? '—',
      n.estado ?? '—',
      n.datos?.Nomenclatura ?? '—',
      (n.compradores || [])
        .map((c) => c.nombre.replace(/^\|+\s*/, '').replace(/^\d+\s+/, '').replace(/\s*\(\d+\.?\d*%\)\s*$/, ''))
        .join('\n') || '—',
      (n.compradores || []).map((c) => c.nroId || '').filter(Boolean).join('\n') || '—',
      getSaldoActual(n.datos) ?? '—',
      n.totalMovimientos ?? 0,
    ]),
    styles: { fontSize: 7.5, cellPadding: 2, overflow: 'linebreak' },
    headStyles: { fillColor: [15, 118, 110], textColor: 255, fontSize: 7.5, fontStyle: 'bold' },
    alternateRowStyles: { fillColor: [240, 253, 250] },
    columnStyles: { 0: { cellWidth: 28 }, 1: { cellWidth: 26 }, 2: { cellWidth: 22 }, 5: { cellWidth: 26 }, 6: { cellWidth: 12 } },
  });

  doc.save(filename);
}

// ── Estado de Cuenta (PDF por negocio) ──────────────────────────────────────

const COLOR_NAVY = [15, 23, 42];
const COLOR_TEAL = [15, 118, 110];
const COLOR_TEAL_LIGHT = [204, 251, 241];
const COLOR_RED = [185, 28, 28];
const COLOR_MUTED = [100, 116, 139];
// Colores de estado de la tabla resumen -- verde (pagado/bien), ámbar
// (pendiente/alerta), rojo (vencido/crítico), reservados solo para esto y
// no reutilizados como color categórico en otro lado del documento.
const COLOR_GREEN = [4, 120, 87];
const COLOR_AMBER = [180, 83, 9];

// Mismo criterio de "no es un pago" que normalizarPagos() en utils/conciliacion.js
// -- se repite aquí porque esta tabla necesita los campos crudos del
// movimiento (Fecha Mov. Banco, Fecha Contable) y no el objeto ya normalizado.
const TIPOS_EXCLUIDOS_APORTES = ['GENERADO POR VENTA UNIDAD'];

function limpiarNombreComprador(nombre) {
  return String(nombre || '').replace(/^\|+\s*/, '').replace(/^\d+\s+/, '').replace(/\s*\(\d+\.?\d*%\)\s*$/, '');
}

// Proporción real del recorte de cada asset (ancho/alto en px) -- para
// escalar sin deformar al dibujarlos en el PDF.
const LOGO_RATIO = 542 / 343;
const CORNER_RATIO = 267 / 348;

// Cache de las imágenes ya convertidas a data URL (fetch es asíncrono; se
// resuelve una sola vez y se reusa en exports siguientes).
const imageDataUrlCache = new Map();
async function cargarImagenComoDataUrl(url) {
  if (imageDataUrlCache.has(url)) return imageDataUrlCache.get(url);
  const blob = await (await fetch(url)).blob();
  const dataUrl = await new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result);
    reader.onerror = reject;
    reader.readAsDataURL(blob);
  });
  imageDataUrlCache.set(url, dataUrl);
  return dataUrl;
}

// Dibuja el encabezado y devuelve el Y a partir del cual debe arrancar el
// contenido (varía según el alto real del logo).
function drawEncabezadoEstadoCuenta(doc, pageWidth, logoDataUrl, cornerDataUrl) {
  if (cornerDataUrl) {
    const cornerH = 60;
    doc.addImage(cornerDataUrl, 'PNG', -6, -10, cornerH * CORNER_RATIO, cornerH);
  }

  const logoW = 38;
  const logoH = logoW / LOGO_RATIO;
  const logoY = 6;
  if (logoDataUrl) {
    doc.addImage(logoDataUrl, 'PNG', (pageWidth - logoW) / 2, logoY, logoW, logoH);
  }

  const tituloY = logoY + logoH + 9;
  doc.setFont(undefined, 'bold');
  doc.setFontSize(15);
  doc.setTextColor(...COLOR_NAVY);
  doc.text('ESTADO DE CUENTA', pageWidth / 2, tituloY, { align: 'center' });
  doc.setDrawColor(...COLOR_TEAL);
  doc.setLineWidth(0.6);
  doc.line(pageWidth / 2 - 30, tituloY + 2.5, pageWidth / 2 + 30, tituloY + 2.5);

  return tituloY + 10;
}

// Niveles de compresión para la tabla PLAN DE PAGOS -- de más cómodo a más
// apretado. Se elige el más grande que quepa en el alto disponible de la
// página para que la conciliación completa (a veces 30-40 cuotas) entre
// siempre en una sola página, sin importar cuántas filas tenga.
const NIVELES_TABLA_PLAN = [
  { fontSize: 7.5, cellPadding: 1.8, headFontSize: 7,   altoFila: 6.7 },
  { fontSize: 7,   cellPadding: 1.3, headFontSize: 6.5, altoFila: 5.5 },
  { fontSize: 6.3, cellPadding: 0.9, headFontSize: 6,   altoFila: 4.4 },
  { fontSize: 5.6, cellPadding: 0.6, headFontSize: 5.4, altoFila: 3.5 },
  { fontSize: 5,   cellPadding: 0.4, headFontSize: 4.8, altoFila: 2.9 },
];

function estiloTablaPlan(numFilasConHeader, alturaDisponible) {
  const presupuestoPorFila = alturaDisponible / numFilasConHeader;
  for (const nivel of NIVELES_TABLA_PLAN) {
    if (nivel.altoFila <= presupuestoPorFila) return nivel;
  }
  return NIVELES_TABLA_PLAN[NIVELES_TABLA_PLAN.length - 1];
}

function drawEncabezadoContinuacion(doc, negocio, pageWidth, logoDataUrl) {
  if (logoDataUrl) {
    const w = 16, h = w / LOGO_RATIO;
    doc.addImage(logoDataUrl, 'PNG', 14, 3, w, h);
  }
  doc.setFont(undefined, 'normal');
  doc.setFontSize(8);
  doc.setTextColor(...COLOR_MUTED);
  doc.text(`Estado de Cuenta · ${negocio.referencia || ''}`, pageWidth - 14, 10, { align: 'right' });
  doc.setDrawColor(...COLOR_TEAL);
  doc.setLineWidth(0.3);
  doc.line(14, 15, pageWidth - 14, 15);
}

async function exportarEstadoCuenta(negocio, datos) {
  const { cuotas, resumen, movimientos, valorVenta } = datos;
  const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });
  const pageWidth = doc.internal.pageSize.getWidth();
  const pageHeight = doc.internal.pageSize.getHeight();

  const [logoDataUrl, cornerDataUrl] = await Promise.all([
    cargarImagenComoDataUrl(logoBaiaKristal).catch(() => null),
    cargarImagenComoDataUrl(cornerBaiaKristal).catch(() => null),
  ]);
  const yInicio = drawEncabezadoEstadoCuenta(doc, pageWidth, logoDataUrl, cornerDataUrl);

  const hoy = new Date().toLocaleDateString('es-CO', { day: '2-digit', month: '2-digit', year: 'numeric' });
  const fechaCorte = negocio.negocioActualizadoEl
    ? new Date(negocio.negocioActualizadoEl).toLocaleDateString('es-CO', { day: '2-digit', month: '2-digit', year: 'numeric' })
    : hoy;
  const nombres = (negocio.compradores || []).map((c) => limpiarNombreComprador(c.nombre)).join('\n') || '—';
  const identificaciones = (negocio.compradores || []).map((c) => c.nroId).filter(Boolean).join('\n') || '—';
  const nombrePrincipal = (negocio.compradores?.[0] && limpiarNombreComprador(negocio.compradores[0].nombre)) || null;
  const nomenclatura = negocio.datos?.Nomenclatura;
  // Mismo texto que ya se ve en la lista/detalle de Negocios (ej. "Isla
  // Laguna - Torre 1 102", "Kala Golf Torre 1 1-C") -- se arma en
  // resolverProjectCode() del backend a partir de Proyecto_Torre + Product_Name
  // crudos de Zoho, tal cual vienen (por eso el guion aparece en unos
  // proyectos y en otros no). Solo cae a "Apto N" si el inmueble no tiene
  // inventario de Zoho vinculado (negocio "huérfano", sin projectCode).
  const inmuebleLabel = negocio.projectCode || (nomenclatura ? `Apto ${nomenclatura}` : null);

  // Bloque de información (izquierda) -- el valor puede envolver a varias
  // líneas (varios compradores, o un nombre largo) sin invadir la tabla
  // resumen de la derecha (que arranca en x=122).
  const infoRows = [
    ['Fecha de Generación', hoy],
    ['Fecha de Corte', fechaCorte],
    ['Nombre', nombres],
    ['Identificación', identificaciones],
    ['Referencia de Recaudo', negocio.referencia || '—'],
    ['Proyecto', 'Baía Kristal'],
    ['Inmueble', inmuebleLabel ?? '—'],
    ['Valor Inmueble', formatCOP(valorVenta) ?? '—'],
  ];
  const maxValueWidth = 122 - 55 - 3;
  let y = yInicio;
  doc.setFontSize(9);
  infoRows.forEach(([label, value]) => {
    doc.setFont(undefined, 'bold');
    doc.setTextColor(...COLOR_NAVY);
    doc.text(`${label}:`, 14, y);
    doc.setFont(undefined, 'normal');
    doc.setTextColor(51, 65, 85);
    const lines = doc.splitTextToSize(String(value), maxValueWidth);
    doc.text(lines, 55, y);
    y += Math.max(5.5, lines.length * 4.2 + 1.5);
  });

  // Tabla resumen coloreada (derecha)
  const valorCuota = cuotas.length > 1
    ? cuotas.slice(0, -1).reduce((s, c) => s + c.valorPlan, 0)
    : (cuotas[0]?.valorPlan ?? 0);
  const valorPendiente = Math.max(0, resumen.totalPlan - resumen.totalPagado);
  autoTable(doc, {
    startY: yInicio,
    margin: { left: 122 },
    tableWidth: 74,
    theme: 'plain',
    styles: { fontSize: 9, cellPadding: 2.2, fontStyle: 'bold', halign: 'center', valign: 'middle' },
    body: [
      ['VALOR CUOTA INICIAL', formatCOP(valorCuota) ?? '—'],
      ['VALOR CONSIGNADO', formatCOP(resumen.totalPagado) ?? '—'],
      ['VALOR PENDIENTE', formatCOP(valorPendiente) ?? '—'],
      ['VALOR VENCIDO', formatCOP(resumen.montoEnMora) ?? '$ 0'],
    ],
    columnStyles: { 0: { cellWidth: 38 }, 1: { cellWidth: 36 } },
    didParseCell: (data) => {
      // Columna izquierda (etiqueta): navy para todas, rojo solo en Vencido.
      // Columna derecha (valor): siempre fondo blanco, con el texto en el
      // mismo color de acento que la etiqueta de su fila.
      const esVencido = data.row.index === 3;
      const colorAcento = esVencido ? COLOR_RED : COLOR_NAVY;
      if (data.column.index === 0) {
        data.cell.styles.fillColor = colorAcento;
        data.cell.styles.textColor = 255;
      } else {
        data.cell.styles.fillColor = [255, 255, 255];
        data.cell.styles.textColor = colorAcento;
      }
    },
  });

  // Tabla PLAN DE PAGOS
  const planStartY = Math.max(y + 4, doc.lastAutoTable.finalY + 8);
  doc.setFont(undefined, 'bold');
  doc.setFontSize(10.5);
  doc.setTextColor(...COLOR_NAVY);
  doc.text('PLAN DE PAGOS', 14, planStartY);

  // Misma tabla que la Conciliación en pantalla (badgeConciliacion/labelCuota
  // en Negocios.jsx) -- no la versión resumida de solo 5 columnas de antes.
  // Toda la conciliación debe caber en esta única página (algunos negocios
  // tienen 30-40 cuotas) -- se calcula el estilo (fuente/padding) más grande
  // que aún quepa en el alto disponible, en vez de un tamaño fijo.
  const estadosPlan = cuotas.map((c) => badgeConciliacion(c));
  const COLOR_ESTADO = {
    Atrasada: COLOR_RED,
    Pagada: COLOR_GREEN,
    Parcial: COLOR_AMBER,
    Pendiente: COLOR_MUTED,
  };
  const planTableStartY = planStartY + 3;
  const alturaDisponiblePlan = pageHeight - planTableStartY - 15;
  const nivelPlan = estiloTablaPlan(cuotas.length + 1, alturaDisponiblePlan);
  autoTable(doc, {
    startY: planTableStartY,
    head: [['CUOTA', 'FECHA ESPERADA', 'FECHA DE PAGO', 'VALOR DE LA CUOTA', 'VALOR PAGADO', 'DIFERENCIA', 'DÍAS DE ATRASO', 'ESTADO']],
    body: cuotas.map((c) => {
      const badge = badgeConciliacion(c);
      return [
        labelCuota(c.etiqueta),
        c.fechaEstimada ? formatFechaUTC(c.fechaEstimada) : '—',
        c.estado === 'pagada' && c.fechaCubierta ? formatFechaUTC(c.fechaCubierta) : '—',
        formatCOP(c.valorPlan) ?? '—',
        c.cubierto > 0 ? formatCOP(c.cubierto) : '—',
        formatCOP(c.valorPlan - c.cubierto) ?? '—',
        c.atrasada && c.diasAtraso != null ? String(c.diasAtraso) : '—',
        badge.txt,
      ];
    }),
    styles: { fontSize: nivelPlan.fontSize, cellPadding: nivelPlan.cellPadding, halign: 'center', valign: 'middle' },
    headStyles: { fillColor: COLOR_TEAL, textColor: 255, fontStyle: 'bold', halign: 'center', fontSize: nivelPlan.headFontSize },
    alternateRowStyles: { fillColor: COLOR_TEAL_LIGHT },
    columnStyles: { 0: { cellWidth: 26 } },
    pageBreak: 'avoid',
    didParseCell: (data) => {
      if (data.section !== 'body' || data.column.index !== 7) return;
      const estado = estadosPlan[data.row.index];
      data.cell.styles.textColor = COLOR_ESTADO[estado.txt] ?? COLOR_NAVY;
      data.cell.styles.fontStyle = 'bold';
    },
  });

  // Detalle de Aportes siempre arranca en una página nueva -- así la
  // conciliación (arriba) queda sola en la página 1 sin importar cuánto
  // espacio le sobre o falte, y todo lo de movimientos queda agrupado aparte.
  doc.addPage();
  drawEncabezadoContinuacion(doc, negocio, pageWidth, logoDataUrl);

  // Tabla DETALLE DE APORTES (movimientos reales, orden cronológico)
  const aportes = (movimientos || [])
    .filter((m) => {
      const tipo = String(m.datos?.['Tipo Movimiento'] || '').trim().toUpperCase();
      return !TIPOS_EXCLUIDOS_APORTES.includes(tipo);
    })
    .map((m) => ({
      fechaConsignacion: m.datos?.['Fecha Mov. Banco'] ? formatExcelDate(m.datos['Fecha Mov. Banco']) : '—',
      fechaAplicacion: m.fechaContable ? formatFechaUTC(new Date(m.fechaContable)) : '—',
      valor: parseMonto(m.datos?.Valor),
      fechaOrden: m.fechaContable ? new Date(m.fechaContable) : null,
    }))
    .filter((a) => !isNaN(a.valor) && a.valor !== 0)
    // Más reciente primero -- sin fecha al final, igual que antes.
    .sort((a, b) => {
      if (!a.fechaOrden && !b.fechaOrden) return 0;
      if (!a.fechaOrden) return 1;
      if (!b.fechaOrden) return -1;
      return b.fechaOrden - a.fechaOrden;
    });
  const totalAportes = aportes.reduce((s, a) => s + a.valor, 0);

  // Posición fija (no doc.lastAutoTable.finalY) -- ya se forzó salto de
  // página arriba, así que siempre empieza justo debajo del mini-encabezado
  // recién dibujado, no importa qué tan larga fue la tabla de la página 1.
  const aportesStartY = 22;
  doc.setFont(undefined, 'bold');
  doc.setFontSize(10.5);
  doc.setTextColor(...COLOR_NAVY);
  doc.text('DETALLE DE APORTES', 14, aportesStartY);

  autoTable(doc, {
    startY: aportesStartY + 3,
    head: [['FECHA CONSIGNACIÓN', 'FECHA APLICACIÓN', 'VALOR CONSIGNADO', 'OBSERVACIÓN']],
    body: aportes.map((a) => [a.fechaConsignacion, a.fechaAplicacion, formatCOP(a.valor) ?? '—', '']),
    foot: [['', '', formatCOP(totalAportes) ?? '—', 'TOTAL']],
    styles: { fontSize: 8.5, cellPadding: 2.2, halign: 'center', valign: 'middle' },
    headStyles: { fillColor: COLOR_TEAL, textColor: 255, fontStyle: 'bold', halign: 'center' },
    alternateRowStyles: { fillColor: COLOR_TEAL_LIGHT },
    footStyles: { fillColor: [226, 232, 240], textColor: COLOR_NAVY, fontStyle: 'bold', halign: 'center' },
    margin: { top: 22 },
    didDrawPage: (data) => {
      if (data.pageNumber > 1) drawEncabezadoContinuacion(doc, negocio, pageWidth, logoDataUrl);
    },
  });

  const filename = `Estado de Cuenta - ${negocio.referencia || 'negocio'}${nombrePrincipal ? ' - ' + nombrePrincipal : ''}.pdf`;
  doc.save(filename);
}

// ── Export dropdown ────────────────────────────────────────────────────────

function ExportMenu({ onExport, disabled }) {
  const [open, setOpen] = useState(false);
  const menuRef = useRef(null);

  useEffect(() => {
    if (!open) return;
    function close(e) { if (menuRef.current && !menuRef.current.contains(e.target)) setOpen(false); }
    document.addEventListener('mousedown', close);
    return () => document.removeEventListener('mousedown', close);
  }, [open]);

  const options = [
    { label: 'Excel (.xlsx)', fmt: 'xlsx' },
    { label: 'CSV',           fmt: 'csv'  },
    { label: 'PDF',           fmt: 'pdf'  },
  ];

  return (
    <div className="relative" ref={menuRef}>
      <button
        onClick={() => setOpen((o) => !o)}
        disabled={disabled}
        title="Exportar"
        className={`w-7 h-7 flex items-center justify-center rounded-md border border-aed-border bg-white hover:bg-aed-base disabled:opacity-50 disabled:cursor-not-allowed transition-colors ${open ? 'bg-aed-base' : ''}`}
      >
        <Download size={12} className="text-slate-500" />
      </button>
      {open && (
        <div className="absolute right-0 top-8 z-50 bg-white border border-aed-border rounded-lg shadow-[var(--shadow-overlay)] overflow-hidden min-w-[140px]">
          {options.map(({ label, fmt }) => (
            <button
              key={fmt}
              onClick={() => { setOpen(false); onExport(fmt); }}
              className="w-full text-left px-3 py-2 text-[14px] text-slate-700 hover:bg-aed-base transition-colors"
            >
              {label}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

// ── List item ───────────────────────────────────────────────────────────────

function cleanNombre(nombre) {
  if (!nombre) return null;
  return nombre.replace(/^\d+\s+/, '').replace(/\s*\(\d+\.?\d*%\)\s*$/, '');
}

function NegocioItem({ negocio, selected, onClick }) {
  const compradorPrincipal = cleanNombre(negocio.compradores?.[0]?.nombre);
  const extraCompradores = (negocio.compradores?.length ?? 0) - 1;
  const isSelected = selected === negocio.id;
  const nomenclatura = negocio.datos?.Nomenclatura;
  const saldo = formatSaldoCompact(getSaldoActual(negocio.datos));
  const saldoNum = saldo ? parseFloat(String(getSaldoActual(negocio.datos)).replace(/[^0-9.-]/g, '')) : null;

  return (
    <button
      onClick={() => onClick(negocio.id)}
      className={`w-full text-left px-3 py-2.5 border-b border-aed-border transition-colors relative ${
        isSelected ? 'bg-brand-soft' : 'hover:bg-brand-tint'
      }`}
    >
      {isSelected && (
        <span className="absolute left-0 top-2 bottom-2 w-0.5 bg-brand rounded-r" />
      )}
      <div className="flex items-start justify-between gap-2">
        <div className="flex-1 min-w-0">
          <p className={`text-[14px] font-semibold truncate ${isSelected ? 'text-brand-strong' : 'text-slate-700'}`}>
            {negocio.projectCode || (nomenclatura ? `Apto ${nomenclatura}` : negocio.referencia)}
          </p>
          {negocio.proyectoTorre && (
            <p className="text-[13px] text-slate-500 truncate mt-0.5">
              {negocio.proyectoTorre} - {etiquetaEtapa(negocio.etapa)}
            </p>
          )}
          {compradorPrincipal && (
            <p className="text-[13px] text-slate-500 truncate mt-0.5">
              {compradorPrincipal}
              {extraCompradores > 0 && <span className="ml-1 text-slate-300">+{extraCompradores}</span>}
            </p>
          )}
        </div>
        <div className="flex flex-col items-end gap-1 flex-shrink-0">
          {negocio.estado && (
            <span className={`text-[12px] font-bold px-1.5 py-0.5 rounded-full ${estadoColor(negocio.estado)}`}>
              {negocio.estado}
            </span>
          )}
          {!negocio.tieneNegocio && (
            <span className="text-[11px] font-medium px-1.5 py-0.5 rounded-full bg-slate-100 text-slate-500">
              Sin negocio
            </span>
          )}
          {saldo && (
            <span className={`text-[12px] font-semibold tabular-nums ${saldoNum > 0 ? 'text-emerald-600' : 'text-slate-500'}`}>
              {saldo}
            </span>
          )}
        </div>
      </div>
    </button>
  );
}

// ── Backfill helper ─────────────────────────────────────────────────────────

function useBackfill(onSuccess) {
  const [syncing, setSyncing] = useState(false);
  const pollRef = useRef(null);

  const trigger = useCallback(async () => {
    setSyncing(true);
    try {
      await triggerNegociosBackfill();
    } catch {
      // ignore — backfill still may run
    }
    // Poll status endpoint until backfill finishes
    let attempts = 0;
    pollRef.current = setInterval(async () => {
      attempts++;
      try {
        const res = await getNegociosBackfillStatus();
        if (!res.running) {
          clearInterval(pollRef.current);
          setSyncing(false);
          if (res.result?.ok) onSuccess();
        }
      } catch { /* keep polling */ }
      if (attempts > 60) {
        clearInterval(pollRef.current);
        setSyncing(false);
      }
    }, 2000);
  }, [onSuccess]);

  useEffect(() => () => clearInterval(pollRef.current), []);
  return { syncing, trigger };
}

// ── Main component ──────────────────────────────────────────────────────────

export default function Negocios() {
  const [negocios, setNegocios] = useState([]);
  const [pagination, setPagination] = useState(null);
  const [estados, setEstados] = useState([]);
  const [etapas, setEtapas] = useState([]);
  const [frentes, setFrentes] = useState([]);
  const [frentesPorEtapa, setFrentesPorEtapa] = useState({});
  const [torresPorFrente, setTorresPorFrente] = useState({});
  const [torresPorEtapaFrente, setTorresPorEtapaFrente] = useState({});
  const [loading, setLoading] = useState(true);
  const [page, setPage] = useState(1);

  const [search, setSearch] = useState('');
  const [estadoFilter, setEstadoFilter] = useState('');
  const [etapaFilter, setEtapaFilter] = useState('');
  const [frenteFilter, setFrenteFilter] = useState('');
  const [torreFilter, setTorreFilter] = useState('');
  const [saldoPendiente, setSaldoPendiente] = useState(false);
  const [conMovimientos, setConMovimientos] = useState(false);
  // Deep link: ?negocio=inv-xxx / neg-xxx (ej. desde el menú de clic derecho
  // del Dashboard) preselecciona el detalle sin depender de que ese id esté
  // en la página actual de la lista de la izquierda.
  const [searchParams] = useSearchParams();
  const [selected, setSelected] = useState(() => searchParams.get('negocio') || null);
  const [stats, setStats] = useState(null);

  const debouncedSearch = useDebounce(search);
  const filtersRef = useRef({});
  filtersRef.current = { debouncedSearch, estadoFilter, etapaFilter, frenteFilter, torreFilter, saldoPendiente, conMovimientos };

  const fetchList = useCallback((p = 1) => {
    const { debouncedSearch: s, estadoFilter: e, etapaFilter: et, frenteFilter: fr, torreFilter: tr, saldoPendiente: sp, conMovimientos: cm } = filtersRef.current;
    setLoading(true);
    getNegocios({ search: s || undefined, estado: e || undefined, etapa: et || undefined, frente: fr || undefined, torre: tr || undefined, saldoPendiente: sp || undefined, conMovimientos: cm || undefined, page: p, limit: 50 })
      .then((res) => {
        setNegocios(res.data);
        setPagination(res.pagination);
        if (res.estados) setEstados(res.estados);
        if (res.etapas) setEtapas(res.etapas);
        if (res.frentes) setFrentes(res.frentes);
        if (res.frentesPorEtapa) setFrentesPorEtapa(res.frentesPorEtapa);
        if (res.torresPorFrente) setTorresPorFrente(res.torresPorFrente);
        if (res.torresPorEtapaFrente) setTorresPorEtapaFrente(res.torresPorEtapaFrente);
        setPage(p);
      })
      .catch(console.error)
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => { fetchList(1); }, [debouncedSearch, estadoFilter, etapaFilter, frenteFilter, torreFilter, saldoPendiente, conMovimientos, fetchList]);

  const loadStats = useCallback(() => {
    getNegociosStats().then(setStats).catch(() => {});
  }, []);

  useEffect(() => { loadStats(); }, [loadStats]);

  const { syncing, trigger: triggerBackfill } = useBackfill(() => { fetchList(1); loadStats(); });

  const [exporting, setExporting] = useState(false);
  const handleExport = useCallback(async (fmt) => {
    const { debouncedSearch: s, estadoFilter: e, etapaFilter: et, frenteFilter: fr, torreFilter: tr, saldoPendiente: sp, conMovimientos: cm } = filtersRef.current;
    setExporting(true);
    try {
      const res = await getNegocios({ search: s || undefined, estado: e || undefined, etapa: et || undefined, frente: fr || undefined, torre: tr || undefined, saldoPendiente: sp || undefined, conMovimientos: cm || undefined, page: 1, limit: 9999 });
      const date = new Date().toISOString().slice(0, 10);
      const base = `negocios-${date}`;
      if (fmt === 'xlsx') exportExcel(res.data, `${base}.xlsx`);
      else if (fmt === 'pdf') exportPDF(res.data, `${base}.pdf`);
      else triggerDownload(toCSV(res.data), `${base}.csv`);
    } catch (err) {
      console.error('Export error:', err);
    } finally {
      setExporting(false);
    }
  }, []);

  const clearFilters = () => { setSearch(''); setEstadoFilter(''); setEtapaFilter(''); setFrenteFilter(''); setTorreFilter(''); setSaldoPendiente(false); setConMovimientos(false); };
  const hasFilters = search || estadoFilter || etapaFilter || frenteFilter || torreFilter || saldoPendiente || conMovimientos;

  // Cambiar Etapa limpia el Frente elegido solo si ya no pertenece a la
  // nueva etapa (y Torre se limpia con él, porque dependía de ese frente).
  const handleEtapaChange = (value) => {
    setEtapaFilter(value);
    if (value && frenteFilter && !(frentesPorEtapa[value] || []).includes(frenteFilter)) {
      setFrenteFilter('');
      setTorreFilter('');
    } else if (value && frenteFilter && torreFilter && !(torresPorEtapaFrente[`${value}||${frenteFilter}`] || []).includes(torreFilter)) {
      // El Frente sigue siendo válido en la nueva Etapa, pero la Torre
      // elegida pertenecía a la otra etapa de ese mismo Frente (ej. Kabo
      // Torre 3 es Etapa 2; si el usuario estaba en Etapa 2 y vuelve a
      // Etapa 1, Torre 3 ya no aplica).
      setTorreFilter('');
    }
  };

  // Cambiar Frente siempre limpia Torre: la Torre 1 de un frente nuevo es
  // un edificio distinto al anterior, nunca la misma selección "por
  // coincidencia".
  const handleFrenteChange = (value) => {
    setFrenteFilter(value);
    setTorreFilter('');
  };

  const frenteOptions = etapaFilter ? (frentesPorEtapa[etapaFilter] || []) : frentes;
  const torreOptions = frenteFilter
    ? (etapaFilter ? (torresPorEtapaFrente[`${etapaFilter}||${frenteFilter}`] || []) : (torresPorFrente[frenteFilter] || []))
    : [];
  const isEmpty = !loading && pagination?.total === 0 && !hasFilters;

  const SIDEBAR_W = 520;

  return (
    <div className="flex h-screen overflow-hidden">
      {/* ── Left panel ── */}
      <div style={{ width: SIDEBAR_W }} className="flex-shrink-0 bg-white border-r border-aed-border flex flex-col min-w-0">
        {/* Panel header */}
        <div className="px-3 py-3 border-b border-aed-border">
          <div className="flex items-center gap-2 mb-2">
            <h1 className="text-[15px] font-bold text-slate-800 flex-1">Negocios</h1>
            {pagination && !isEmpty && (
              <span className="text-[12px] text-slate-500 bg-aed-base border border-aed-border px-2 py-0.5 rounded-full">
                {pagination.total}
              </span>
            )}
            <ExportMenu onExport={handleExport} disabled={exporting || loading} />
            <button
              onClick={triggerBackfill}
              disabled={syncing}
              title="Sincronizar negocios"
              className="w-7 h-7 flex items-center justify-center rounded-md border border-aed-border bg-white hover:bg-aed-base disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
            >
              <RefreshCw size={12} className={`text-slate-500 ${syncing ? 'animate-spin' : ''}`} />
            </button>
          </div>

          <div className="flex flex-col gap-2.5">
            {/* Search */}
            <div className="field">
              <label className="field-label">
                <Search size={13} className="text-brand" />
                Buscar
                <HelpTip text="Busca por referencia, nomenclatura, nombre del comprador o número de cédula." />
              </label>
              <div className="relative">
                <Search size={13} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-500" />
                <input
                  type="text"
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  placeholder="Ref., nomenclatura, comprador o cédula…"
                  className="input pl-7 text-[14px] h-8 py-0"
                />
                {search && (
                  <button onClick={() => setSearch('')} className="absolute right-2 top-1/2 -translate-y-1/2 text-slate-500 hover:text-slate-600">
                    <X size={12} />
                  </button>
                )}
              </div>
            </div>

            {/* Estado / Etapa / Frente / Torre — dos por línea */}
            <div className="grid grid-cols-2 gap-2.5">
              {/* Estado filter */}
              {estados.length > 0 && (
                <div className="field">
                  <label className="field-label">
                    <CircleDot size={13} className="text-info" />
                    Estado del negocio
                    <HelpTip text="Filtra según la situación del negocio: al día, en proceso, pendiente o cancelado." />
                  </label>
                  <select
                    value={estadoFilter}
                    onChange={(e) => setEstadoFilter(e.target.value)}
                    className="input text-[14px] h-8 py-0 pr-2 leading-none"
                  >
                    <option value="">Todos los estados</option>
                    {estados.map((e) => <option key={e} value={e}>{e}</option>)}
                  </select>
                </div>
              )}

              {/* Etapa filter */}
              {etapas.length > 0 && (
                <div className="field">
                  <label className="field-label">
                    <Layers size={13} className="text-[#7c3aed]" />
                    Etapa
                    <HelpTip text="Filtra por la etapa del inmueble asociado al negocio. Los proyectos sin etapa numerada y los negocios sin inmueble asociado se agrupan en Etapa 0." />
                  </label>
                  <select
                    value={etapaFilter}
                    onChange={(e) => handleEtapaChange(e.target.value)}
                    className="input text-[14px] h-8 py-0 pr-2 leading-none"
                  >
                    <option value="">Todas las etapas</option>
                    {etapas.map((et) => (
                      <option key={et} value={et}>{etiquetaEtapa(et)}</option>
                    ))}
                  </select>
                </div>
              )}

              {/* Frente filter */}
              {frentes.length > 0 && (
                <div className="field">
                  <label className="field-label">
                    <MapPin size={13} className="text-[#7c3aed]" />
                    Frente
                    <HelpTip text="Filtra por el proyecto/desarrollo del inmueble asociado al negocio. Si hay una Etapa elegida, solo se muestran los frentes de esa etapa. Los negocios sin inmueble asociado no aparecen al filtrar por un Frente específico." />
                  </label>
                  <select
                    value={frenteFilter}
                    onChange={(e) => handleFrenteChange(e.target.value)}
                    className="input text-[14px] h-8 py-0 pr-2 leading-none"
                  >
                    <option value="">Todos los frentes</option>
                    {frenteOptions.map((fr) => (
                      <option key={fr} value={fr}>{fr}</option>
                    ))}
                  </select>
                </div>
              )}

              {/* Torre filter */}
              {frenteFilter && torreOptions.length > 0 && (
                <div className="field">
                  <label className="field-label">
                    <Building size={13} className="text-[#7c3aed]" />
                    Torre
                    <HelpTip text="Filtra por la torre del Frente seleccionado." />
                  </label>
                  <select
                    value={torreFilter}
                    onChange={(e) => setTorreFilter(e.target.value)}
                    className="input text-[14px] h-8 py-0 pr-2 leading-none"
                  >
                    <option value="">Todas las torres</option>
                    {torreOptions.map((tr) => (
                      <option key={tr} value={tr}>Torre {tr}</option>
                    ))}
                  </select>
                </div>
              )}
            </div>

            {/* Con abonos toggle */}
            <button
              onClick={() => setSaldoPendiente((v) => !v)}
              className={`w-full h-8 flex items-center gap-2 px-2.5 rounded-md border text-[14px] font-medium transition-colors ${
                saldoPendiente
                  ? 'bg-success-bg border-success-border text-success'
                  : 'bg-white border-aed-border text-slate-500 hover:bg-aed-base'
              }`}
            >
              <Wallet size={13} className={saldoPendiente ? 'text-success' : 'text-slate-500'} />
              Solo con abonos
              <HelpTip text="Muestra únicamente los negocios que ya registran al menos un abono." />
            </button>

            {/* Con movimientos toggle */}
            <button
              onClick={() => setConMovimientos((v) => !v)}
              className={`w-full h-8 flex items-center gap-2 px-2.5 rounded-md border text-[14px] font-medium transition-colors ${
                conMovimientos
                  ? 'bg-success-bg border-success-border text-success'
                  : 'bg-white border-aed-border text-slate-500 hover:bg-aed-base'
              }`}
            >
              <History size={13} className={conMovimientos ? 'text-success' : 'text-slate-500'} />
              Solo con movimientos
              <HelpTip text="Muestra únicamente los inmuebles/negocios que tienen al menos un movimiento registrado." />
            </button>

            {hasFilters && (
              <button onClick={clearFilters} className="text-[13px] text-brand hover:text-brand-strong font-medium flex items-center gap-1 py-0.5">
                <X size={11} /> Limpiar filtros
              </button>
            )}
          </div>
        </div>

        {/* List */}
        <div className="flex-1 overflow-y-auto">
          {loading && (
            <div className="flex items-center justify-center py-10">
              <svg className="w-5 h-5 animate-spin text-brand" fill="none" viewBox="0 0 24 24">
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
              </svg>
            </div>
          )}

          {!loading && negocios.length === 0 && !isEmpty && (
            <div className="px-4 py-8 text-center">
              <p className="text-[14px] text-slate-500">Sin resultados para los filtros aplicados.</p>
            </div>
          )}

          {!loading && negocios.map((n) => (
            <NegocioItem key={n.id} negocio={n} selected={selected} onClick={setSelected} />
          ))}
        </div>

        {/* Pagination */}
        {pagination && pagination.totalPages > 1 && (
          <div className="flex items-center justify-between px-3 py-2 border-t border-aed-border bg-aed-base">
            <button disabled={page <= 1} onClick={() => fetchList(page - 1)}
              className="text-[13px] text-slate-500 hover:text-slate-700 disabled:opacity-40 disabled:cursor-not-allowed">← Ant.</button>
            <span className="text-[12px] text-slate-500">{page}/{pagination.totalPages}</span>
            <button disabled={page >= pagination.totalPages} onClick={() => fetchList(page + 1)}
              className="text-[13px] text-slate-500 hover:text-slate-700 disabled:opacity-40 disabled:cursor-not-allowed">Sig. →</button>
          </div>
        )}
      </div>

      {/* ── Right panel ── */}
      <div className="flex-1 min-w-0 overflow-y-auto bg-aed-base">
        {selected ? (
          <NegocioDetalle key={selected} id={selected} />
        ) : isEmpty ? (
          /* Empty state with sync button */
          <div className="flex flex-col items-center justify-center h-full text-center px-8">
            <div className="w-14 h-14 rounded-2xl bg-white border border-aed-border flex items-center justify-center mb-4">
              <Building2 size={24} className="text-slate-300" />
            </div>
            <p className="text-[16px] font-medium text-slate-600 mb-1">Sin negocios cargados</p>
            <p className="text-[14px] text-slate-500 mb-5 max-w-xs">
              Los datos se extraen automáticamente de los archivos Excel subidos a Encargos.
              Haz clic en Sincronizar para cargarlos.
            </p>
            <button
              onClick={triggerBackfill}
              disabled={syncing}
              className="btn-primary text-[14px] px-5 py-2 gap-2 disabled:opacity-60"
            >
              <RefreshCw size={13} className={syncing ? 'animate-spin' : ''} />
              {syncing ? 'Sincronizando…' : 'Sincronizar negocios'}
            </button>
            {syncing && (
              <p className="text-[13px] text-slate-500 mt-3">Esto puede tomar unos segundos…</p>
            )}
          </div>
        ) : (
          /* Stats dashboard */
          <div className="p-5 flex flex-col gap-4 overflow-y-auto">
            {stats ? (
              <>
                {/* KPIs */}
                <div className="grid grid-cols-4 gap-3">
                  <div className="card p-4">
                    <p className="section-label mb-1">Total inmuebles</p>
                    <p className="text-[28px] font-bold text-slate-800 tabular-nums">{stats.totalInmuebles}</p>
                  </div>
                  <div className="card p-4">
                    <p className="section-label mb-1">Con negocio</p>
                    <p className="text-[28px] font-bold text-slate-800 tabular-nums">{stats.totalNegocios}</p>
                  </div>
                  <div className="card p-4">
                    <p className="section-label mb-1">Con abonos</p>
                    <p className="text-[28px] font-bold text-emerald-600 tabular-nums">{stats.conSaldo}</p>
                  </div>
                  <div className="card p-4">
                    <p className="section-label mb-1">Total abonado</p>
                    <p className="text-[20px] font-bold text-emerald-600 tabular-nums leading-tight mt-1">
                      {stats.saldoTotal > 0
                        ? new Intl.NumberFormat('es-CO', { style: 'currency', currency: 'COP', minimumFractionDigits: 0 }).format(stats.saldoTotal)
                        : '—'}
                    </p>
                  </div>
                </div>

                {/* Por estado + Por etapa + Por frente */}
                <div className="grid grid-cols-3 gap-3">
                  <div className="card p-4">
                    <p className="section-label mb-3">Por estado</p>
                    <div className="flex flex-col gap-2">
                      {stats.porEstado.map((e) => (
                        <div key={e.estado} className="flex items-center justify-between gap-2">
                          <span className={`text-[12px] font-bold px-2 py-0.5 rounded-full flex-shrink-0 ${estadoColor(e.estado)}`}>
                            {e.estado}
                          </span>
                          <div className="flex items-center gap-2 flex-shrink-0">
                            <span className="text-[14px] font-semibold text-slate-700 tabular-nums">{e.count}</span>
                            {e.saldo > 0 && (
                              <span className="text-[12px] text-amber-600 tabular-nums">
                                {formatCOP(e.saldo)}
                              </span>
                            )}
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>

                  <div className="card p-4">
                    <p className="section-label mb-3">Por etapa</p>
                    <div className="flex flex-col gap-2">
                      {stats.porEtapa.map((e) => (
                        <div key={e.etapa} className="flex items-center justify-between gap-2">
                          <span className="text-[13px] text-slate-600 truncate">
                            {etiquetaEtapa(e.etapa)}
                          </span>
                          <div className="flex items-center gap-2 flex-shrink-0">
                            <span className="text-[14px] font-semibold text-slate-700 tabular-nums">{e.count}</span>
                            {e.saldo > 0 && (
                              <span className="text-[12px] text-amber-600 tabular-nums">
                                {formatCOP(e.saldo)}
                              </span>
                            )}
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>

                  <div className="card p-4">
                    <p className="section-label mb-3">Por frente</p>
                    <div className="flex flex-col gap-2">
                      {stats.porFrente.map((f) => (
                        <div key={f.frente} className="flex items-center justify-between gap-2">
                          <span className="text-[13px] text-slate-600 truncate">{f.frente}</span>
                          <div className="flex items-center gap-2 flex-shrink-0">
                            <span className="text-[14px] font-semibold text-slate-700 tabular-nums">{f.count}</span>
                            {f.saldo > 0 && (
                              <span className="text-[12px] text-amber-600 tabular-nums">
                                {formatCOP(f.saldo)}
                              </span>
                            )}
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                </div>

                <p className="text-[13px] text-slate-500 text-center">
                  Selecciona un negocio de la lista para ver el detalle completo
                </p>
              </>
            ) : (
              <div className="flex items-center justify-center h-40">
                <svg className="w-5 h-5 animate-spin text-brand/70" fill="none" viewBox="0 0 24 24">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                </svg>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
