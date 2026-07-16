import React from 'react';
import {
  LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer,
} from 'recharts';

const MESES = ['Ene','Feb','Mar','Abr','May','Jun','Jul','Ago','Sep','Oct','Nov','Dic'];

function formatMesLabel(mesStr) {
  const [year, mon] = mesStr.split('-');
  return `${MESES[parseInt(mon, 10) - 1]} ${year.slice(2)}`;
}

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
  return (
    <div className="bg-white border border-aed-border rounded-lg px-3 py-2 shadow-sm text-[14px]">
      <p className="font-medium text-slate-700 mb-1">{label}</p>
      {payload.map((p) => (
        <p key={p.dataKey} className="flex items-center gap-1.5" style={{ color: p.color }}>
          <span className="w-2 h-2 rounded-full inline-block flex-shrink-0" style={{ background: p.color }} />
          {p.name}: <b>{formatCOPCompleto(p.value)}</b>
        </p>
      ))}
    </div>
  );
}

// Tendencia mensual de Plan de pagos (Esperado) vs. Recaudado real, para todo
// el portafolio (o el subconjunto filtrado). Incluye meses futuros del plan
// -- por eso "Recaudado" naturalmente cae por debajo de "Esperado" en meses
// que aún no vencen.
export default function PlanVsRecaudoLineChart({ meses = [], totales = {} }) {
  if (!meses.length) {
    return (
      <div className="h-64 flex items-center justify-center text-[16px] text-slate-400">
        Sin datos de plan de pagos
      </div>
    );
  }

  const chartData = meses.map((mes) => ({
    mesLabel: formatMesLabel(mes),
    esperado: totales[mes]?.esperado ?? 0,
    recaudado: totales[mes]?.recaudado ?? 0,
  }));

  const muchosMeses = chartData.length > 14;

  return (
    <ResponsiveContainer width="100%" height={280}>
      <LineChart data={chartData} margin={{ top: 4, right: 16, left: 8, bottom: muchosMeses ? 24 : 4 }}>
        <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" vertical={false} />
        <XAxis
          dataKey="mesLabel"
          tick={{ fontSize: 11, fill: '#64748b' }}
          axisLine={false}
          tickLine={false}
          angle={muchosMeses ? -40 : 0}
          textAnchor={muchosMeses ? 'end' : 'middle'}
          height={muchosMeses ? 46 : 30}
          interval={muchosMeses ? 'preserveStartEnd' : 0}
        />
        <YAxis
          tickFormatter={formatYAxis}
          tick={{ fontSize: 11, fill: '#64748b' }}
          axisLine={false}
          tickLine={false}
          width={52}
        />
        <Tooltip content={<CustomTooltip />} />
        <Legend
          verticalAlign="top"
          height={28}
          iconType="circle"
          formatter={(value) => <span className="text-[13px] text-slate-600">{value}</span>}
        />
        <Line
          type="monotone"
          dataKey="esperado"
          name="Esperado (plan)"
          stroke="#94a3b8"
          strokeWidth={2}
          strokeDasharray="5 4"
          dot={{ r: 2.5, fill: '#94a3b8' }}
          activeDot={{ r: 4 }}
        />
        <Line
          type="monotone"
          dataKey="recaudado"
          name="Recaudado"
          stroke="#0f766e"
          strokeWidth={2.5}
          dot={{ r: 2.5, fill: '#0f766e' }}
          activeDot={{ r: 5 }}
        />
      </LineChart>
    </ResponsiveContainer>
  );
}
