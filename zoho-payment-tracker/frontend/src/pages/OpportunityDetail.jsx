import React, { useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { getOpportunity, getFieldsMetadata, getSubforms } from '../utils/api';
import { formatCOP, formatDate, formatDateTime } from '../utils/format';
import StageBadge from '../components/StageBadge';

function InfoRow({ label, children }) {
  return (
    <div className="flex flex-col gap-0.5">
      <span className="section-label">{label}</span>
      <div className="text-[15px] font-medium text-slate-800">{children || '—'}</div>
    </div>
  );
}

function FieldGrid({ data, fieldMap, isCurrency = false }) {
  if (!data) return null;
  const entries = Object.entries(data).filter(([, v]) => v !== null && v !== undefined && v !== '');
  if (entries.length === 0) return <p className="text-[14px] text-slate-500 italic">Sin datos disponibles</p>;

  return (
    <div className="grid grid-cols-2 gap-x-4 gap-y-3">
      {entries.map(([key, value]) => {
        const label = fieldMap[key] || key;
        let displayValue;
        if (isCurrency) {
          displayValue = formatCOP(value);
        } else if (typeof value === 'object' && value !== null) {
          displayValue = value.name || value.display_value || JSON.stringify(value);
        } else {
          displayValue = String(value);
        }
        return (
          <div key={key} className="flex flex-col gap-0.5">
            <span className="section-label">{label}</span>
            <span className="text-[14px] text-slate-700">{displayValue || '—'}</span>
          </div>
        );
      })}
    </div>
  );
}

function SubformTable({ rows }) {
  if (!rows || rows.length === 0) {
    return <p className="text-[14px] text-slate-500 italic">Sin datos registrados</p>;
  }

  const SKIP_KEYS = ['id', 'Created_Time', 'Modified_Time', '$line_tax', '$permissions', 'Owner'];
  const allKeys = [...new Set(rows.flatMap(Object.keys))].filter((k) => !SKIP_KEYS.includes(k));
  if (allKeys.length === 0) return <p className="text-[14px] text-slate-500 italic">Sin datos registrados</p>;

  const toLabel = (key) => key.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());

  // Parsea un valor como número eliminando separadores de miles y símbolos.
  // "7.000.000" → 7000000  |  "$ 5.597.599" → 5597599  |  0 → 0
  const parseAmt = (v) => {
    if (v == null || v === '') return NaN;
    if (typeof v === 'number') return v;
    const s = String(v).trim();
    if (/^\d{1,2}[\/\-]\d{1,2}[\/\-]\d{2,4}$/.test(s)) return NaN; // es una fecha
    return parseFloat(s.replace(/[^0-9-]/g, ''));
  };

  // Detecta automáticamente qué campos son monetarios: los que tienen al menos
  // un valor >= 1000 en alguna fila (en COP cualquier monto real supera eso).
  const moneyKeys = allKeys.filter((k) =>
    rows.some((row) => { const n = parseAmt(row[k]); return !isNaN(n) && n >= 1000; })
  );
  const filterKeys = moneyKeys.length > 0 ? moneyKeys : null;

  return (
    <div className="overflow-x-auto">
      <table className="w-full text-[14px]">
        <thead>
          <tr className="border-b border-aed-border bg-aed-base">
            {allKeys.map((key) => (
              <th key={key} className="section-label px-3 py-2 text-left whitespace-nowrap">
                {toLabel(key)}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.filter((row) => {
            if (!filterKeys) return true;
            return filterKeys.some((k) => {
              const n = parseAmt(row[k]);
              return !isNaN(n) && n !== 0;
            });
          }).map((row, i) => (
            <tr key={i} className="border-b border-aed-border hover:bg-brand-tint">
              {allKeys.map((key) => {
                const val = row[key];
                let display = '—';
                if (val != null && val !== '') {
                  if (typeof val === 'object') display = val.name || val.display_value || JSON.stringify(val);
                  else if (typeof val === 'number') display = formatCOP(val);
                  else display = String(val);
                }
                return (
                  <td key={key} className="px-3 py-2 text-slate-600 whitespace-nowrap">{display}</td>
                );
              })}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}



function SubformsAccordion({ opportunityId, fechaInicioPlanPagos }) {
  const [open, setOpen] = useState(false);
  const [subforms, setSubforms] = useState(null);
  const [loading, setLoading] = useState(false);

  // Enriquece las filas de Forma de Pago con una columna "Fecha estimada"
  // calculada a partir de fechaInicioPlanPagos + N meses según el número de cuota.
  function addDates(rows) {
    if (!fechaInicioPlanPagos || !rows?.length) return rows;
    const base = new Date(fechaInicioPlanPagos);
    const cuotaKey = Object.keys(rows[0] || {}).find((k) =>
      rows.some((r) => String(r[k] || '').toLowerCase().includes('separaci'))
    );
    if (!cuotaKey) return rows;
    return rows.map((row) => {
      const val = String(row[cuotaKey] || '').trim();
      let fecha = null;
      if (val.toLowerCase().includes('separaci')) {
        fecha = base;
      } else {
        const n = parseInt(val, 10);
        if (!isNaN(n) && n > 0) {
          const d = new Date(base);
          d.setMonth(d.getMonth() + n);
          fecha = d;
        }
      }
      if (!fecha) return row;
      return {
        'Fecha estimada': fecha.toLocaleDateString('es-CO', { day: '2-digit', month: '2-digit', year: 'numeric' }),
        ...row,
      };
    });
  }

  function toggle() {
    setOpen((o) => {
      if (!o && subforms === null) {
        setLoading(true);
        getSubforms(opportunityId)
          .then(setSubforms)
          .catch(() => setSubforms({ formaPago: [], propuestaPago: [] }))
          .finally(() => setLoading(false));
      }
      return !o;
    });
  }

  return (
    <div className="card overflow-hidden">
      <button
        onClick={toggle}
        className="w-full flex items-center justify-between px-4 py-3 hover:bg-aed-base transition-colors"
      >
        <span className="section-label">Forma y Propuesta de Pago</span>
        <svg
          className={`w-4 h-4 text-slate-500 transition-transform ${open ? 'rotate-180' : ''}`}
          fill="none" viewBox="0 0 24 24" stroke="currentColor"
        >
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
        </svg>
      </button>

      {open && (
        <div className="border-t border-aed-border p-4 flex flex-col gap-5">
          {loading ? (
            <span className="flex items-center gap-1.5 text-slate-500 text-[14px] py-1">
              <svg className="w-3 h-3 animate-spin text-brand" fill="none" viewBox="0 0 24 24">
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
              </svg>
              Cargando desde Zoho...
            </span>
          ) : subforms && (
            <>
              <div>
                <p className="section-label mb-2">Forma de Pago</p>
                <SubformTable rows={addDates(subforms.formaPago)} />
                {fechaInicioPlanPagos && subforms.formaPago?.length > 0 && (
                  <p className="text-[12px] text-slate-500 italic mt-2 px-1">
                    * Fechas estimadas con periodicidad mensual desde la fecha de separación. No representan fechas contractuales.
                  </p>
                )}
              </div>
              <div>
                <p className="section-label mb-2">Propuesta de Pago</p>
                <SubformTable rows={subforms.propuestaPago} />
              </div>
            </>
          )}
        </div>
      )}
    </div>
  );
}

export default function OpportunityDetail() {
  const { id } = useParams();
  const navigate = useNavigate();
  const [opportunity, setOpportunity] = useState(null);
  const [fieldMap, setFieldMap] = useState({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    Promise.all([getOpportunity(id), getFieldsMetadata()])
      .then(([opp, fields]) => {
        setOpportunity(opp);
        const map = {};
        fields.forEach((f) => { map[f.apiName] = f.fieldLabel; });
        setFieldMap(map);
      })
      .catch((err) => setError(err.message))
      .finally(() => setLoading(false));
  }, [id]);

  if (loading) {
    return (
      <div className="flex-1 flex items-center justify-center">
        <div className="flex items-center gap-2 text-slate-500">
          <svg className="w-5 h-5 animate-spin text-brand" fill="none" viewBox="0 0 24 24">
            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
          </svg>
          Cargando...
        </div>
      </div>
    );
  }

  if (error || !opportunity) {
    return (
      <div className="flex-1 flex items-center justify-center">
        <div className="text-center">
          <p className="text-red-500 text-[15px] mb-4">{error || 'Oportunidad no encontrada'}</p>
          <button onClick={() => navigate('/oportunidades')} className="btn-primary">Volver al Dashboard</button>
        </div>
      </div>
    );
  }

  const hasFinancialData = opportunity.camposFinancieros && Object.keys(opportunity.camposFinancieros).length > 0;

  return (
    <div className="flex flex-col min-h-screen bg-aed-base">
      {/* Topbar */}
      <header className="h-[52px] bg-white border-b border-aed-border flex items-center px-5 gap-3 flex-shrink-0 sticky top-0 z-10">
        <button
          onClick={() => navigate('/oportunidades')}
          className="w-8 h-8 flex items-center justify-center rounded-lg border border-aed-border hover:bg-aed-base transition-colors"
          title="Volver"
        >
          <svg className="w-4 h-4 text-slate-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
          </svg>
        </button>
        <div className="flex-1 min-w-0">
          <h1 className="text-[18px] font-bold text-slate-800 truncate">{opportunity.dealName}</h1>
        </div>
        <StageBadge stage={opportunity.stage} />
        <span className="text-[12px] text-slate-500 hidden sm:block">
          Sync {formatDateTime(opportunity.lastSyncedAt)}
        </span>
      </header>

      {/* 2-column body */}
      <div className="flex-1 p-5 grid grid-cols-[260px_1fr] gap-4 items-start">

        {/* LEFT — Info */}
        <div className="flex flex-col gap-3">
          <div className="card p-4 flex flex-col gap-4">
            <p className="section-label">Información general</p>
            <InfoRow label="Contacto">{opportunity.contactName}</InfoRow>
            <InfoRow label="Email">
              {opportunity.contactEmail
                ? <a href={`mailto:${opportunity.contactEmail}`} className="text-brand hover:underline">{opportunity.contactEmail}</a>
                : null}
            </InfoRow>
            <InfoRow label="Teléfono">
              {opportunity.contactPhone
                ? <a href={`tel:${opportunity.contactPhone}`} className="text-brand hover:underline">{opportunity.contactPhone}</a>
                : null}
            </InfoRow>
            <InfoRow label="Empresa / Proyecto">{opportunity.accountName}</InfoRow>
            <InfoRow label="Pago Separación">
              <span className="text-brand">{formatDate(opportunity.pagoSeparacion)}</span>
            </InfoRow>
            <InfoRow label="Referencia Recaudo">
              {opportunity.referenciaRecaudo
                ? <span className="font-mono text-[13px] bg-amber-50 text-amber-700 border border-amber-100 px-2 py-0.5 rounded">{opportunity.referenciaRecaudo}</span>
                : null}
            </InfoRow>
          </div>

          {opportunity.seccionInmueble && Object.keys(opportunity.seccionInmueble).length > 0 && (
            <div className="card p-4 flex flex-col gap-3">
              <p className="section-label">Inmueble</p>
              <FieldGrid data={opportunity.seccionInmueble} fieldMap={fieldMap} />
            </div>
          )}
        </div>

        {/* CENTER — Financial */}
        <div className="flex flex-col gap-3">
          {/* Plan de Pagos */}
          <div className="card p-4 flex flex-col gap-3">
            <p className="section-label">Plan de Pagos</p>
            {hasFinancialData ? (
              <table className="w-full text-[14px]">
                <thead>
                  <tr className="border-b border-aed-border bg-aed-base">
                    <th className="section-label px-3 py-2 text-left">Campo</th>
                    <th className="section-label px-3 py-2 text-right">Valor</th>
                  </tr>
                </thead>
                <tbody>
                  {Object.entries(opportunity.camposFinancieros)
                    .filter(([, value]) => {
                      if (value == null || value === '') return false;
                      const n = parseFloat(value);
                      return isNaN(n) || n !== 0;
                    })
                    .map(([key, value]) => (
                    <tr key={key} className="border-b border-aed-border hover:bg-brand-tint">
                      <td className="px-3 py-2.5 text-slate-600">{fieldMap[key] || key}</td>
                      <td className="px-3 py-2.5 text-right font-mono font-semibold text-slate-800">{formatCOP(value)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            ) : (
              <p className="text-[14px] text-slate-500 italic">Sin datos financieros</p>
            )}
          </div>

          {/* Cotización */}
          {opportunity.seccionCotizacion && Object.keys(opportunity.seccionCotizacion).length > 0 && (
            <div className="card p-4 flex flex-col gap-3">
              <p className="section-label">Cotización</p>
              <FieldGrid data={opportunity.seccionCotizacion} fieldMap={fieldMap} />
            </div>
          )}

          {/* Subforms lazy */}
          <SubformsAccordion opportunityId={id} fechaInicioPlanPagos={opportunity.fechaInicioPlanPagos} />
        </div>

      </div>
    </div>
  );
}
