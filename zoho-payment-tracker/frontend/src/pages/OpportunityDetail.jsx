import React, { useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { getOpportunity, getFieldsMetadata, getSubforms, getMovimientos } from '../utils/api';
import { formatCOP, formatDate, formatDateTime } from '../utils/format';
import CollapsibleSection from '../components/CollapsibleSection';
import StageBadge from '../components/StageBadge';

function FieldGrid({ data, fieldMap, isCurrency = false }) {
  if (!data || Object.keys(data).length === 0) {
    return <p className="text-sm text-gray-400 mt-3">Sin datos disponibles</p>;
  }

  const entries = Object.entries(data).filter(([, v]) => v !== null && v !== undefined && v !== '');

  if (entries.length === 0) {
    return <p className="text-sm text-gray-400 mt-3">Sin datos disponibles</p>;
  }

  return (
    <div className="mt-4 grid grid-cols-1 sm:grid-cols-2 gap-x-8 gap-y-3">
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
          <div key={key} className="flex flex-col">
            <span className="text-xs text-gray-500 uppercase tracking-wide">{label}</span>
            <span className="text-sm font-medium text-gray-800 mt-0.5">{displayValue || '—'}</span>
          </div>
        );
      })}
    </div>
  );
}

function SubformTable({ rows, title }) {
  if (!rows || rows.length === 0) {
    return <p className="text-sm text-gray-400 mt-3">Sin datos disponibles</p>;
  }

  // Obtener todas las claves únicas excluyendo campos internos de Zoho
  const SKIP_KEYS = ['id', 'Created_Time', 'Modified_Time', '$line_tax', '$permissions', 'Owner'];
  const allKeys = [...new Set(rows.flatMap(Object.keys))].filter((k) => !SKIP_KEYS.includes(k));

  if (allKeys.length === 0) {
    return <p className="text-sm text-gray-400 mt-3">Sin datos disponibles</p>;
  }

  // Convertir api_name a label legible
  const toLabel = (key) =>
    key.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());

  return (
    <div className="mt-4 overflow-x-auto">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-gray-200 bg-gray-50">
            {allKeys.map((key) => (
              <th
                key={key}
                className="px-3 py-2 text-left text-xs font-semibold text-gray-500 uppercase tracking-wide whitespace-nowrap"
              >
                {toLabel(key)}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row, i) => (
            <tr key={i} className="border-b border-gray-100 hover:bg-gray-50">
              {allKeys.map((key) => {
                const val = row[key];
                let display = '—';
                if (val != null && val !== '') {
                  if (typeof val === 'object') {
                    display = val.name || val.display_value || JSON.stringify(val);
                  } else if (typeof val === 'number') {
                    display = formatCOP(val);
                  } else {
                    display = String(val);
                  }
                }
                return (
                  <td key={key} className="px-3 py-2.5 text-gray-700 whitespace-nowrap">
                    {display}
                  </td>
                );
              })}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function MovimientosSection({ opportunityId }) {
  const [movimientos, setMovimientos] = useState(null);
  const [loading, setLoading] = useState(false);

  function load() {
    if (movimientos !== null || loading) return;
    setLoading(true);
    getMovimientos(opportunityId)
      .then((res) => setMovimientos(res.data || []))
      .catch(() => setMovimientos([]))
      .finally(() => setLoading(false));
  }

  if (movimientos === null) {
    return (
      <div className="mt-4">
        <button onClick={load} disabled={loading} className="btn-secondary text-sm">
          {loading ? (
            <span className="flex items-center gap-2">
              <svg className="w-4 h-4 animate-spin" fill="none" viewBox="0 0 24 24">
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
              </svg>
              Cargando...
            </span>
          ) : 'Cargar movimientos de pago'}
        </button>
      </div>
    );
  }

  if (movimientos.length === 0) {
    return <p className="text-sm text-gray-400 mt-3">Sin movimientos registrados para esta oportunidad</p>;
  }

  // Derive columns from all row keys, excluding internal ones
  const SKIP = ['_hoja', 'id', 'opportunityId', 'matched', 'emailId'];
  const datosKeys = [...new Set(movimientos.flatMap((m) => Object.keys(m.datos || {})))].filter((k) => !SKIP.includes(k));

  return (
    <div className="mt-4 space-y-6">
      {movimientos.map((mov, idx) => (
        <div key={mov.id} className="border border-gray-200 rounded-lg overflow-hidden">
          <div className="bg-gray-50 px-4 py-2 flex items-center justify-between">
            <div className="text-xs text-gray-500">
              <span className="font-medium text-gray-700">{mov.archivoNombre || 'Archivo desconocido'}</span>
              {mov.emailFecha && <span className="ml-2">— {formatDateTime(mov.emailFecha)}</span>}
            </div>
            {mov.emailSubject && (
              <span className="text-xs text-gray-400 truncate max-w-xs">{mov.emailSubject}</span>
            )}
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-gray-200">
                  {datosKeys.map((k) => (
                    <th key={k} className="px-3 py-2 text-left text-xs font-semibold text-gray-500 uppercase tracking-wide whitespace-nowrap">
                      {k.replace(/_/g, ' ')}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                <tr className="hover:bg-gray-50">
                  {datosKeys.map((k) => {
                    const val = mov.datos?.[k];
                    let display = '—';
                    if (val != null && val !== '') {
                      if (typeof val === 'number') display = formatCOP(val);
                      else if (typeof val === 'object') display = JSON.stringify(val);
                      else display = String(val);
                    }
                    return <td key={k} className="px-3 py-2.5 text-gray-700 whitespace-nowrap">{display}</td>;
                  })}
                </tr>
              </tbody>
            </table>
          </div>
        </div>
      ))}
      <p className="text-xs text-gray-400">{movimientos.length} movimiento{movimientos.length !== 1 ? 's' : ''} registrado{movimientos.length !== 1 ? 's' : ''}</p>
    </div>
  );
}

export default function OpportunityDetail() {
  const { id } = useParams();
  const navigate = useNavigate();
  const [opportunity, setOpportunity] = useState(null);
  const [fieldMap, setFieldMap] = useState({});
  const [subforms, setSubforms] = useState(null);
  const [subformsLoading, setSubformsLoading] = useState(false);
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

  function loadSubforms() {
    if (subforms !== null || subformsLoading) return;
    setSubformsLoading(true);
    getSubforms(id)
      .then(setSubforms)
      .catch(() => setSubforms({ formaPago: [], propuestaPago: [] }))
      .finally(() => setSubformsLoading(false));
  }

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="flex items-center gap-2 text-gray-500">
          <svg className="w-5 h-5 animate-spin text-blue-500" fill="none" viewBox="0 0 24 24">
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
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-center">
          <p className="text-red-600 mb-4">{error || 'Oportunidad no encontrada'}</p>
          <button onClick={() => navigate('/')} className="btn-primary">Volver al Dashboard</button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50">
      <header className="bg-white border-b border-gray-200 sticky top-0 z-10">
        <div className="max-w-screen-lg mx-auto px-6 py-4 flex items-center gap-4">
          <button onClick={() => navigate('/')} className="btn-secondary p-2" title="Volver">
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
            </svg>
          </button>
          <div className="flex-1 min-w-0">
            <h1 className="text-lg font-bold text-gray-900 truncate">{opportunity.dealName}</h1>
            <p className="text-xs text-gray-500 mt-0.5">Sync: {formatDateTime(opportunity.lastSyncedAt)}</p>
          </div>
          <StageBadge stage={opportunity.stage} />
        </div>
      </header>

      <main className="max-w-screen-lg mx-auto px-6 py-6 space-y-4">

        {/* Sección 1 — Resumen */}
        <CollapsibleSection title="Resumen del Negocio" defaultOpen>
          <div className="mt-4 grid grid-cols-1 sm:grid-cols-3 gap-4">
            <div>
              <p className="text-xs text-gray-500 uppercase tracking-wide">Contacto</p>
              <p className="text-sm font-medium mt-0.5">{opportunity.contactName || '—'}</p>
            </div>
            <div>
              <p className="text-xs text-gray-500 uppercase tracking-wide">Email</p>
              <p className="text-sm font-medium mt-0.5">
                {opportunity.contactEmail
                  ? <a href={`mailto:${opportunity.contactEmail}`} className="text-blue-600 hover:underline">{opportunity.contactEmail}</a>
                  : '—'}
              </p>
            </div>
            <div>
              <p className="text-xs text-gray-500 uppercase tracking-wide">Teléfono</p>
              <p className="text-sm font-medium mt-0.5">
                {opportunity.contactPhone
                  ? <a href={`tel:${opportunity.contactPhone}`} className="text-blue-600 hover:underline">{opportunity.contactPhone}</a>
                  : '—'}
              </p>
            </div>
            <div>
              <p className="text-xs text-gray-500 uppercase tracking-wide">Empresa / Proyecto</p>
              <p className="text-sm font-medium mt-0.5">{opportunity.accountName || '—'}</p>
            </div>
            <div>
              <p className="text-xs text-gray-500 uppercase tracking-wide">Pago Separación</p>
              <p className="text-sm font-medium mt-0.5 text-blue-700">{formatDate(opportunity.pagoSeparacion)}</p>
            </div>
            <div>
              <p className="text-xs text-gray-500 uppercase tracking-wide">Referencia Recaudo</p>
              {opportunity.referenciaRecaudo
                ? <span className="inline-block mt-0.5 font-mono text-xs bg-amber-50 text-amber-800 px-2 py-1 rounded border border-amber-200">{opportunity.referenciaRecaudo}</span>
                : <p className="text-sm font-medium mt-0.5 text-gray-400">—</p>}
            </div>
          </div>
        </CollapsibleSection>

        {/* Sección 2 — Inmueble */}
        <CollapsibleSection title="Información del Inmueble">
          <FieldGrid data={opportunity.seccionInmueble} fieldMap={fieldMap} />
        </CollapsibleSection>

        {/* Sección 3 — Cotización */}
        <CollapsibleSection title="Cotización">
          <FieldGrid data={opportunity.seccionCotizacion} fieldMap={fieldMap} />
        </CollapsibleSection>

        {/* Sección 4 — Plan de Pagos */}
        <CollapsibleSection title="Plan de Pagos">
          {opportunity.referenciaRecaudo && (
            <div className="mt-4 p-4 bg-amber-50 border border-amber-200 rounded-lg">
              <p className="text-xs text-amber-700 font-semibold uppercase tracking-wide">Referencia de Recaudo</p>
              <p className="text-lg font-bold text-amber-900 mt-0.5">{opportunity.referenciaRecaudo}</p>
            </div>
          )}
          <div className="mt-4">
            {opportunity.camposFinancieros && Object.keys(opportunity.camposFinancieros).length > 0 ? (
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-gray-200">
                    <th className="text-left py-2 text-xs font-semibold text-gray-500 uppercase tracking-wide">Campo</th>
                    <th className="text-right py-2 text-xs font-semibold text-gray-500 uppercase tracking-wide">Valor</th>
                  </tr>
                </thead>
                <tbody>
                  {Object.entries(opportunity.camposFinancieros).map(([key, value]) => (
                    <tr key={key} className="border-b border-gray-100 hover:bg-gray-50">
                      <td className="py-2.5 text-gray-600">{fieldMap[key] || key}</td>
                      <td className="py-2.5 text-right font-mono font-medium">{formatCOP(value)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            ) : (
              <p className="text-sm text-gray-400">Sin datos financieros</p>
            )}
          </div>
        </CollapsibleSection>

        {/* Sección 5 — Forma de Pago (subform — carga bajo demanda) */}
        <CollapsibleSection title="Forma de Pago" defaultOpen={false}>
          {subforms === null ? (
            <div className="mt-4">
              <button
                onClick={loadSubforms}
                disabled={subformsLoading}
                className="btn-secondary text-sm"
              >
                {subformsLoading ? (
                  <span className="flex items-center gap-2">
                    <svg className="w-4 h-4 animate-spin" fill="none" viewBox="0 0 24 24">
                      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                    </svg>
                    Cargando desde Zoho...
                  </span>
                ) : 'Cargar datos de Forma de Pago'}
              </button>
            </div>
          ) : (
            <SubformTable rows={subforms.formaPago} title="Forma de Pago" />
          )}
        </CollapsibleSection>

        {/* Sección 6 — Propuesta de Pago (subform — carga bajo demanda) */}
        <CollapsibleSection title="Propuesta de Pago" defaultOpen={false}>
          {subforms === null ? (
            <div className="mt-4">
              <button
                onClick={loadSubforms}
                disabled={subformsLoading}
                className="btn-secondary text-sm"
              >
                {subformsLoading ? (
                  <span className="flex items-center gap-2">
                    <svg className="w-4 h-4 animate-spin" fill="none" viewBox="0 0 24 24">
                      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                    </svg>
                    Cargando desde Zoho...
                  </span>
                ) : 'Cargar datos de Propuesta de Pago'}
              </button>
            </div>
          ) : (
            <SubformTable rows={subforms.propuestaPago} title="Propuesta de Pago" />
          )}
        </CollapsibleSection>

        {/* Sección 7 — Movimientos de pago (desde correos Excel) */}
        <CollapsibleSection title="Movimientos de Pago" defaultOpen={false}>
          <MovimientosSection opportunityId={opportunity.id} />
        </CollapsibleSection>

      </main>
    </div>
  );
}
