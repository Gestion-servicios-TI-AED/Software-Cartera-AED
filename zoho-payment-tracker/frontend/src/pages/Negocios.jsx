import { useState, useEffect, useCallback, useRef } from 'react';
import { Search, X, ChevronDown, ChevronRight, User, Building2, BarChart3, History, RefreshCw, Download, CircleDot, Wallet, ClipboardList, Scale } from 'lucide-react';
import { getNegocios, getNegocio, getNegocioMovimientos, triggerNegociosBackfill, getNegociosBackfillStatus, getNegociosStats, getSubforms } from '../utils/api';
import { formatExcelDate } from '../utils/format';
import { filtrarDatosResumen, filtrarKeysMovimiento } from '../utils/columnasExcluidas';
import ConceptoHint from '../components/ConceptoHint';
import HelpTip from '../components/HelpTip';
import { ListaInfo, ListaFinanciera } from '../components/DatosFinancieros';
import { ordenarFinanciero } from '../utils/ordenColumnas';
import { estadoBadgeClass } from '../utils/estados';
import { addFechaEstimada, formatFechaUTC } from '../utils/planDePagos';
import { construirPlan, normalizarPagos, conciliar } from '../utils/conciliacion';
import * as XLSX from 'xlsx';
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';

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

const UNIDAD_LABELS = {
  'PARQ':    'Parqueadero',
  'PARQ.':   'Parqueadero',
  'C.UTIL':  'Depósito',
  'C.UTIL.': 'Depósito',
  'DEP':     'Depósito',
  'DEP.':    'Depósito',
  'BOD':     'Bodega',
  'BOD.':    'Bodega',
  'LOC':     'Local',
  'LOC.':    'Local',
  'GAR':     'Garaje',
  'GAR.':    'Garaje',
};

function formatUnidadesAdicionales(raw) {
  const results = [];
  const groupRe = /\(([^)]+)\)/g;
  let m;
  while ((m = groupRe.exec(raw)) !== null) {
    for (const part of m[1].split('|')) {
      const eq = part.indexOf('=');
      if (eq === -1) continue;
      const code = part.slice(0, eq).trim();
      const val  = part.slice(eq + 1).trim();
      if (!val) continue;
      if (/INM|MATR/i.test(code)) continue; // skip Matrícula
      const label = UNIDAD_LABELS[code] || UNIDAD_LABELS[code.toUpperCase()] || code.replace(/\.$/, '');
      results.push(`${label} ${val}`);
      break;
    }
  }
  return results.length > 0 ? results.join('  ·  ') : null;
}

function formatCell(key, value) {
  if (value == null || value === '') return null;
  const k = (key || '').toLowerCase();
  if (k.includes('unidades adicionales')) {
    return formatUnidadesAdicionales(String(value)) ?? String(value);
  }
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
    if (APTO_KEYS.some((ak) => k === ak || k.includes(ak))) apto[key] = value;
    else if (FIN_KEYS.some((fk) => k === fk || k.includes(fk))) financiero[key] = value;
    else otros[key] = value;
  }
  return { apto, financiero, otros };
}

// ── Sub-components ──────────────────────────────────────────────────────────

function Accordion({ icon: Icon, title, badge, children, defaultOpen = true, accent = '#0f766e' }) {
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
  const estado = datos['Estado'];

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

function MovimientosSection({ referencia }) {
  const [movimientos, setMovimientos] = useState(null);
  const [page, setPage] = useState(1);
  const [pagination, setPagination] = useState(null);
  const [loading, setLoading] = useState(false);

  const load = useCallback(
    (p = 1) => {
      setLoading(true);
      getNegocioMovimientos(referencia, { page: p, limit: 50 })
        .then((res) => {
          setMovimientos(res.data);
          setPagination(res.pagination);
          setPage(p);
        })
        .finally(() => setLoading(false));
    },
    [referencia]
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
                  <th className="section-label px-3 py-2.5 text-right whitespace-nowrap"><span className="inline-flex items-center gap-1">Estado<ConceptoHint columna="Estado" hoja="movimiento" /></span></th>
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
        const subs = await getSubforms(oportunidad.id);
        // Todos los movimientos del negocio (loop defensivo si total > 200)
        const movs = [];
        let page = 1, totalPages = 1;
        do {
          const res = await getNegocioMovimientos(negocio.referencia, { page, limit: 200 });
          movs.push(...(res.data || []));
          totalPages = res.pagination?.totalPages ?? 1;
          page += 1;
        } while (page <= totalPages);
        if (alive) setDatos({ subforms: subs || { formaPago: [], propuestaPago: [] }, movimientos: movs });
      } catch (err) {
        if (alive) setError(err.message);
      } finally {
        if (alive) setLoading(false);
      }
    })();
    return () => { alive = false; };
  }, [oportunidad?.id, negocio.referencia]);

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

  const planRows = datos.subforms.formaPago?.length ? datos.subforms.formaPago : (datos.subforms.propuestaPago || []);
  const cuotasPlan = construirPlan(planRows, oportunidad.fechaInicioPlanPagos);
  if (cuotasPlan.length === 0) {
    return <p className="px-4 py-4 text-[14px] text-slate-500 italic">La oportunidad vinculada no tiene plan de pagos registrado.</p>;
  }

  const { cuotas, resumen } = conciliar(cuotasPlan, normalizarPagos(datos.movimientos));

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
            </p>
          ) : (
            <p className="text-[15px] font-bold text-slate-400">—</p>
          )}
        </div>
      </div>

      {/* Tabla de cuotas */}
      <div className="rounded-lg border border-aed-border overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-[14px]">
            <thead>
              <tr className="bg-aed-base border-b border-aed-border">
                <th className="section-label px-3 py-2 text-left whitespace-nowrap">Cuota</th>
                <th className="section-label px-3 py-2 text-left whitespace-nowrap">Fecha estimada</th>
                <th className="section-label px-3 py-2 text-right whitespace-nowrap">Valor plan</th>
                <th className="section-label px-3 py-2 text-right whitespace-nowrap">Cubierto</th>
                <th className="section-label px-3 py-2 text-right whitespace-nowrap">Estado</th>
              </tr>
            </thead>
            <tbody>
              {cuotas.map((c, i) => {
                const badge = badgeConciliacion(c);
                return (
                  <tr key={i} className="border-b border-aed-border last:border-0 hover:bg-brand-tint">
                    <td className="px-3 py-2 text-slate-700 whitespace-nowrap">{labelCuota(c.etiqueta)}</td>
                    <td className="px-3 py-2 text-slate-500 whitespace-nowrap">
                      {c.fechaEstimada ? formatFechaUTC(c.fechaEstimada) : '—'}
                    </td>
                    <td className="px-3 py-2 text-right text-slate-700 whitespace-nowrap tabular-nums">{formatCOP(c.valorPlan)}</td>
                    <td className="px-3 py-2 text-right whitespace-nowrap tabular-nums">
                      {c.cubierto > 0 ? (
                        <span className={c.estado === 'pagada' ? 'text-emerald-600' : 'text-amber-600'}>{formatCOP(c.cubierto)}</span>
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
                );
              })}
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
        * Conciliación estimada según fechas calculadas y pagos APLICADOS. No representa un estado de cuenta oficial.
      </p>
    </div>
  );
}

function NegocioDetalle({ referencia }) {
  const [negocio, setNegocio] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    setLoading(true);
    setError(null);
    getNegocio(referencia)
      .then(setNegocio)
      .catch((err) => setError(err.response?.data?.error || err.message))
      .finally(() => setLoading(false));
  }, [referencia]);

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

  const { apto, financiero } = categorizeDatos(filtrarDatosResumen(negocio.datos || {}));
  const aptoEntries = Object.entries(apto);
  const finEntries = ordenarFinanciero(Object.entries(financiero));

  const nomenclatura = negocio.datos?.Nomenclatura;
  const inventario = negocio.datos?.Inventario;
  const saldo = negocio.saldoActual ?? null;
  const saldoFmt = saldo != null ? formatCOP(saldo) : null;

  return (
    <div className="flex flex-col gap-3 p-5">
      {/* Header */}
      <div className="card px-4 py-3">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <p className="text-[12px] text-slate-500 mb-0.5 uppercase tracking-wide">Referencia</p>
            <h2 className="font-heading text-[19px] font-bold text-ink font-mono">{negocio.referencia}</h2>
            {(nomenclatura || inventario) && (
              <p className="text-[14px] text-slate-500 mt-0.5">
                {nomenclatura && <span className="font-medium text-slate-700">Apto {nomenclatura}</span>}
                {nomenclatura && inventario && <span className="mx-1.5 text-slate-300">·</span>}
                {inventario && <span>{inventario}</span>}
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
              <span className="text-[13px] text-slate-500 bg-aed-base border border-aed-border px-2 py-0.5 rounded-full">
                {negocio.totalMovimientos} mov.
              </span>
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
      <Accordion icon={User} title="Comprador" badge={negocio.compradores?.length} accent="#0f766e" defaultOpen>
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
      <Accordion icon={BarChart3} title="Estructura financiera y abonos" badge={finEntries.length} accent="#059669" defaultOpen>
        {finEntries.length > 0 ? (
          <ListaFinanciera entries={finEntries} format={formatCell} />
        ) : (
          <p className="px-4 py-4 text-[14px] text-slate-500 italic bg-white">Sin datos financieros en este archivo</p>
        )}
      </Accordion>

      {/* 4. Movimientos */}
      <Accordion icon={History} title="Historial de movimientos" badge={negocio.totalMovimientos} accent="#d97706" defaultOpen={false}>
        <MovimientosSection key={referencia} referencia={referencia} />
      </Accordion>

      {/* 5. Conciliación plan vs pagos reales */}
      <Accordion icon={Scale} title="Conciliación" accent="#0891b2" defaultOpen={false}>
        <ConciliacionSection key={referencia} negocio={negocio} />
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
      n.referencia,
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
        <div className="absolute right-0 top-8 z-50 bg-white border border-aed-border rounded-lg shadow-lg overflow-hidden min-w-[140px]">
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

// Etiqueta de proyecto/fideicomiso para los filtros y el resumen.
// Conserva el código numérico para que dos proyectos con el mismo nombre
// (p.ej. "14607-…BAIA KABO…" y "99203-…BAIA KABO…") no se vean idénticos.
function formatProyectoLabel(f) {
  const s = String(f ?? '');
  const code = (s.match(/^\d+/) || [''])[0];
  const name = s.replace(/^\d+[\s-]+/, '').replace(/^P\.?A\.?\s*/i, '').trim();
  return code ? `${code} · ${name}` : name;
}

function NegocioItem({ negocio, selected, onClick }) {
  const compradorPrincipal = cleanNombre(negocio.compradores?.[0]?.nombre);
  const extraCompradores = (negocio.compradores?.length ?? 0) - 1;
  const isSelected = selected === negocio.referencia;
  const nomenclatura = negocio.datos?.Nomenclatura;
  const inventario = negocio.datos?.Inventario;
  const saldo = formatSaldoCompact(getSaldoActual(negocio.datos));
  const saldoNum = saldo ? parseFloat(String(getSaldoActual(negocio.datos)).replace(/[^0-9.-]/g, '')) : null;

  return (
    <button
      onClick={() => onClick(negocio.referencia)}
      className={`w-full text-left px-3 py-2.5 border-b border-aed-border transition-colors relative ${
        isSelected ? 'bg-brand-soft' : 'hover:bg-brand-tint'
      }`}
    >
      {isSelected && (
        <span className="absolute left-0 top-2 bottom-2 w-0.5 bg-brand rounded-r" />
      )}
      <div className="flex items-start justify-between gap-2">
        <div className="flex-1 min-w-0">
          <p className={`text-[14px] font-semibold font-mono truncate ${isSelected ? 'text-brand-strong' : 'text-slate-700'}`}>
            {negocio.referencia}
          </p>
          {(nomenclatura || inventario) && (
            <p className="text-[13px] text-slate-500 truncate mt-0.5">
              {nomenclatura && <span className="font-medium">Apto {nomenclatura}</span>}
              {nomenclatura && inventario && <span className="mx-1 text-slate-300">·</span>}
              {inventario && <span>{inventario}</span>}
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
  const [fideicomisos, setFideicomisos] = useState([]);
  const [loading, setLoading] = useState(true);
  const [page, setPage] = useState(1);

  const [search, setSearch] = useState('');
  const [estadoFilter, setEstadoFilter] = useState('');
  const [fideicomisoFilter, setFideicomisoFilter] = useState('');
  const [saldoPendiente, setSaldoPendiente] = useState(false);
  const [selected, setSelected] = useState(null);
  const [stats, setStats] = useState(null);

  const debouncedSearch = useDebounce(search);
  const filtersRef = useRef({});
  filtersRef.current = { debouncedSearch, estadoFilter, fideicomisoFilter, saldoPendiente };

  const fetchList = useCallback((p = 1) => {
    const { debouncedSearch: s, estadoFilter: e, fideicomisoFilter: f, saldoPendiente: sp } = filtersRef.current;
    setLoading(true);
    getNegocios({ search: s || undefined, estado: e || undefined, fideicomiso: f || undefined, saldoPendiente: sp || undefined, page: p, limit: 50 })
      .then((res) => {
        setNegocios(res.data);
        setPagination(res.pagination);
        if (res.estados) setEstados(res.estados);
        if (res.fideicomisos) setFideicomisos(res.fideicomisos);
        setPage(p);
      })
      .catch(console.error)
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => { fetchList(1); }, [debouncedSearch, estadoFilter, fideicomisoFilter, saldoPendiente, fetchList]);

  const loadStats = useCallback(() => {
    getNegociosStats().then(setStats).catch(() => {});
  }, []);

  useEffect(() => { loadStats(); }, [loadStats]);

  const { syncing, trigger: triggerBackfill } = useBackfill(() => { fetchList(1); loadStats(); });

  const [exporting, setExporting] = useState(false);
  const handleExport = useCallback(async (fmt) => {
    const { debouncedSearch: s, estadoFilter: e, fideicomisoFilter: f, saldoPendiente: sp } = filtersRef.current;
    setExporting(true);
    try {
      const res = await getNegocios({ search: s || undefined, estado: e || undefined, fideicomiso: f || undefined, saldoPendiente: sp || undefined, page: 1, limit: 9999 });
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

  const clearFilters = () => { setSearch(''); setEstadoFilter(''); setFideicomisoFilter(''); setSaldoPendiente(false); };
  const hasFilters = search || estadoFilter || fideicomisoFilter || saldoPendiente;
  const isEmpty = !loading && pagination?.total === 0 && !hasFilters;

  // ── Resizable sidebar ──────────────────────────────────────────────────────
  const MIN_W = 220;
  const MAX_W = 520;
  const [sidebarW, setSidebarW] = useState(300);
  const dragging = useRef(false);

  const onDragStart = useCallback((e) => {
    e.preventDefault();
    dragging.current = true;
    const onMove = (ev) => {
      if (!dragging.current) return;
      const clientX = ev.touches ? ev.touches[0].clientX : ev.clientX;
      setSidebarW(Math.min(MAX_W, Math.max(MIN_W, clientX)));
    };
    const onUp = () => {
      dragging.current = false;
      window.removeEventListener('mousemove', onMove);
      window.removeEventListener('mouseup', onUp);
      window.removeEventListener('touchmove', onMove);
      window.removeEventListener('touchend', onUp);
    };
    window.addEventListener('mousemove', onMove);
    window.addEventListener('mouseup', onUp);
    window.addEventListener('touchmove', onMove, { passive: false });
    window.addEventListener('touchend', onUp);
  }, []);

  return (
    <div className="flex h-screen overflow-hidden">
      {/* ── Left panel ── */}
      <div style={{ width: sidebarW }} className="flex-shrink-0 bg-white border-r border-aed-border flex flex-col min-w-0">
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

            {/* Fideicomiso filter */}
            {fideicomisos.length > 0 && (
              <div className="field">
                <label className="field-label">
                  <Building2 size={13} className="text-[#7c3aed]" />
                  Proyecto
                  <HelpTip text="Filtra por el proyecto / fideicomiso al que pertenece el negocio." />
                </label>
                <select
                  value={fideicomisoFilter}
                  onChange={(e) => setFideicomisoFilter(e.target.value)}
                  className="input text-[14px] h-8 py-0 pr-2 leading-none"
                >
                  <option value="">Todos los proyectos</option>
                  {fideicomisos.map((f) => (
                    <option key={f} value={f}>
                      {formatProyectoLabel(f)}
                    </option>
                  ))}
                </select>
              </div>
            )}

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

      {/* ── Resize handle ── */}
      <div
        onMouseDown={onDragStart}
        onTouchStart={onDragStart}
        className="w-1 flex-shrink-0 bg-aed-border hover:bg-brand active:bg-brand-strong cursor-col-resize transition-colors group relative"
        title="Arrastrar para redimensionar"
      >
        <div className="absolute inset-y-0 -left-1 -right-1" />
      </div>

      {/* ── Right panel ── */}
      <div className="flex-1 min-w-0 overflow-y-auto bg-aed-base">
        {selected ? (
          <NegocioDetalle key={selected} referencia={selected} />
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
                <div className="grid grid-cols-3 gap-3">
                  <div className="card p-4">
                    <p className="section-label mb-1">Total negocios</p>
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

                {/* Por estado + Por proyecto */}
                <div className="grid grid-cols-2 gap-3">
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
                    <p className="section-label mb-3">Por proyecto</p>
                    <div className="flex flex-col gap-2">
                      {stats.porFideicomiso.map((f) => (
                        <div key={f.fideicomiso} className="flex items-center justify-between gap-2">
                          <span className="text-[13px] text-slate-600 truncate">
                            {formatProyectoLabel(f.fideicomiso)}
                          </span>
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
