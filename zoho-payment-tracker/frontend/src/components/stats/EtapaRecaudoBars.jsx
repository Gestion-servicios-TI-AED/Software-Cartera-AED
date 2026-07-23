import React from 'react';
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer,
} from 'recharts';
import { etiquetaEtapa, compararEtapas } from '../../utils/etapas';

function formatYAxis(value) {
  if (value >= 1_000_000) return `$${(value / 1_000_000).toFixed(1)}M`;
  if (value >= 1_000) return `$${(value / 1_000).toFixed(0)}K`;
  return `$${value}`;
}

function formatCOPCompleto(v) {
  return new Intl.NumberFormat('es-CO', {
    style: 'currency', currency: 'COP', minimumFractionDigits: 0, maximumFractionDigits: 0,
  }).format(v);
}

function CustomTooltip({ active, payload, label }) {
  if (!active || !payload?.length) return null;
  const esperado = payload.find((p) => p.dataKey === 'esperado')?.value ?? 0;
  const recaudado = payload.find((p) => p.dataKey === 'recaudado')?.value ?? 0;
  const pct = esperado > 0 ? Math.round((recaudado / esperado) * 1000) / 10 : 0;
  return (
    <div className="bg-white border border-aed-border rounded-lg px-3 py-2 shadow-sm text-[14px]">
      <p className="font-medium text-slate-700 mb-1">{etiquetaEtapa(label)}</p>
      <p className="text-slate-500">Esperado: <b className="text-slate-700">{formatCOPCompleto(esperado)}</b></p>
      <p className="text-brand">Recaudado: <b>{formatCOPCompleto(recaudado)}</b></p>
      <p className="text-[13px] text-slate-400 mt-0.5">{pct}% avance</p>
    </div>
  );
}

// Recaudo por Etapa del proyecto (1, 2, 3…) -- no confundir con la Etapa/Stage
// de Zoho (ver PipelineBars), esta es la etapa constructiva usada en
// Negocios/Inmuebles/Dashboard.
export default function EtapaRecaudoBars({ totalesPorEtapa = {} }) {
  const etapas = Object.keys(totalesPorEtapa).sort(compararEtapas);

  if (!etapas.length) {
    return (
      <div className="h-64 flex items-center justify-center text-[16px] text-slate-400">
        Sin datos por etapa
      </div>
    );
  }

  const chartData = etapas.map((et) => ({
    etapa: et,
    esperado: totalesPorEtapa[et]?.esperado ?? 0,
    recaudado: totalesPorEtapa[et]?.recaudado ?? 0,
  }));

  return (
    <ResponsiveContainer width="100%" height={280}>
      <BarChart data={chartData} margin={{ top: 4, right: 16, left: 8, bottom: 4 }}>
        <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" vertical={false} />
        <XAxis
          dataKey="etapa"
          tickFormatter={etiquetaEtapa}
          tick={{ fontSize: 11, fill: '#64748b' }}
          axisLine={false}
          tickLine={false}
        />
        <YAxis
          tickFormatter={formatYAxis}
          tick={{ fontSize: 11, fill: '#64748b' }}
          axisLine={false}
          tickLine={false}
          width={52}
        />
        <Tooltip content={<CustomTooltip />} cursor={{ fill: '#f1f5f9' }} />
        <Legend
          verticalAlign="top"
          height={28}
          iconType="circle"
          formatter={(value) => <span className="text-[13px] text-slate-600">{value}</span>}
        />
        <Bar dataKey="esperado" name="Esperado (plan)" fill="#cbd5e1" radius={[4, 4, 0, 0]} maxBarSize={44} />
        <Bar dataKey="recaudado" name="Recaudado" fill="#0f766e" radius={[4, 4, 0, 0]} maxBarSize={44} />
      </BarChart>
    </ResponsiveContainer>
  );
}
