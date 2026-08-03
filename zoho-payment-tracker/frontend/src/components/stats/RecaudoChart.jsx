import React from 'react';
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
} from 'recharts';

const MESES = ['Ene','Feb','Mar','Abr','May','Jun','Jul','Ago','Sep','Oct','Nov','Dic'];

function formatMesLabel(mesStr) {
  // "2026-01" → "Ene 26"
  const [year, mon] = mesStr.split('-');
  return `${MESES[parseInt(mon, 10) - 1]} ${year.slice(2)}`;
}

function formatYAxis(value) {
  if (value >= 1_000_000) return `$${(value / 1_000_000).toFixed(1)}M`;
  if (value >= 1_000) return `$${(value / 1_000).toFixed(0)}K`;
  return `$${value}`;
}

function CustomTooltip({ active, payload, label }) {
  if (!active || !payload?.length) return null;
  const val = payload[0].value;
  const formatted = new Intl.NumberFormat('es-CO', {
    style: 'currency', currency: 'COP', minimumFractionDigits: 0, maximumFractionDigits: 0,
  }).format(val);
  return (
    <div className="bg-white border border-aed-border rounded-lg px-3 py-2 shadow-sm text-[14px]">
      <p className="font-medium text-slate-700">{label}</p>
      <p className="text-brand font-bold">{formatted}</p>
    </div>
  );
}

export default function RecaudoChart({ data = [] }) {
  const chartData = data.map((d) => ({ ...d, mesLabel: formatMesLabel(d.mes) }));

  if (!chartData.length) {
    return (
      <div className="h-48 flex items-center justify-center text-[16px] text-slate-400">
        Sin datos de recaudo
      </div>
    );
  }

  return (
    <ResponsiveContainer width="100%" height={200}>
      <BarChart data={chartData} margin={{ top: 4, right: 8, left: 8, bottom: 4 }}>
        <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" vertical={false} />
        <XAxis
          dataKey="mesLabel"
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
        <Bar dataKey="total" fill="#0e7581" radius={[4, 4, 0, 0]} maxBarSize={40} />
      </BarChart>
    </ResponsiveContainer>
  );
}
