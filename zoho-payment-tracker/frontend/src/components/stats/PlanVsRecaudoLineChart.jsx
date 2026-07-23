import React, { useState } from 'react';
import {
  LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer,
} from 'recharts';

const MESES = ['Ene','Feb','Mar','Abr','May','Jun','Jul','Ago','Sep','Oct','Nov','Dic'];

function formatMesLabel(mesStr) {
  const [year, mon] = mesStr.split('-');
  return `${MESES[parseInt(mon, 10) - 1]} ${year.slice(2)}`;
}

function formatDiaLabel(diaStr) {
  const [, mon, dia] = diaStr.split('-');
  return `${parseInt(dia, 10)} ${MESES[parseInt(mon, 10) - 1]}`;
}

// Con la vista "Saldo contraentrega" un mes puede quedar en negativo (una
// reversa/devolución más grande que lo esperado ese mes) -- sin esto, el
// signo se perdía en el redondeo a M/K y se veía un número gigante sin
// formato en el eje.
function formatYAxis(value) {
  const signo = value < 0 ? '-' : '';
  const abs = Math.abs(value);
  if (abs >= 1_000_000) return `${signo}$${(abs / 1_000_000).toFixed(1)}M`;
  if (abs >= 1_000) return `${signo}$${(abs / 1_000).toFixed(0)}K`;
  return `${signo}$${abs}`;
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
export default function PlanVsRecaudoLineChart({ meses = [], totales = {}, granularidad = 'mes' }) {
  // Series ocultas -- clic en el ítem de la leyenda muestra/oculta esa línea
  // sin perder los datos (Recharts sigue calculando ejes/tooltip, solo se
  // deja de dibujar la línea vía el prop `hide`).
  const [ocultas, setOcultas] = useState(() => new Set());
  const toggleSerie = (dataKey) => {
    setOcultas((prev) => {
      const next = new Set(prev);
      if (next.has(dataKey)) next.delete(dataKey);
      else next.add(dataKey);
      return next;
    });
  };

  if (!meses.length) {
    return (
      <div className="h-64 flex items-center justify-center text-[16px] text-slate-400">
        Sin datos de plan de pagos
      </div>
    );
  }

  // Acumulado: suma corrida mes a mes en el orden de la serie -- se grafica
  // en un eje Y secundario (a la derecha) porque su escala crece mucho más
  // que el valor mensual y aplastaría esas líneas si compartieran eje.
  let esperadoAcumulado = 0;
  let recaudadoAcumulado = 0;
  const chartData = meses.map((mes) => {
    const esperado = totales[mes]?.esperado ?? 0;
    const recaudado = totales[mes]?.recaudado ?? 0;
    esperadoAcumulado += esperado;
    recaudadoAcumulado += recaudado;
    return {
      mesLabel: granularidad === 'dia' || granularidad === 'quincena' ? formatDiaLabel(mes) : formatMesLabel(mes),
      esperado,
      recaudado,
      esperadoAcumulado,
      recaudadoAcumulado,
    };
  });

  const muchosMeses = chartData.length > 14;

  return (
    <ResponsiveContainer width="100%" height={400}>
      <LineChart data={chartData} margin={{ top: 4, right: 16, left: 8, bottom: muchosMeses ? 24 : 4 }}>
        <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" vertical={false} />
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
          yAxisId="left"
          tickFormatter={formatYAxis}
          tick={{ fontSize: 11, fill: '#64748b' }}
          axisLine={false}
          tickLine={false}
          width={52}
        />
        <YAxis yAxisId="right" orientation="right" hide />
        <Tooltip content={<CustomTooltip />} />
        <Legend
          verticalAlign="top"
          height={28}
          iconType="circle"
          onClick={(entry) => toggleSerie(entry.dataKey)}
          formatter={(value, entry) => (
            <span
              className="text-[13px] cursor-pointer select-none"
              style={{
                color: ocultas.has(entry.dataKey) ? '#cbd5e1' : '#475569',
                textDecoration: ocultas.has(entry.dataKey) ? 'line-through' : 'none',
              }}
            >
              {value}
            </span>
          )}
        />
        <Line
          yAxisId="left"
          type="monotone"
          dataKey="esperado"
          name="Esperado (plan)"
          stroke="#94a3b8"
          strokeWidth={2}
          strokeDasharray="5 4"
          dot={{ r: 2.5, fill: '#94a3b8' }}
          activeDot={{ r: 4 }}
          hide={ocultas.has('esperado')}
        />
        <Line
          yAxisId="left"
          type="monotone"
          dataKey="recaudado"
          name="Recaudado"
          stroke="#0f766e"
          strokeWidth={2.5}
          hide={ocultas.has('recaudado')}
          dot={{ r: 2.5, fill: '#0f766e' }}
          activeDot={{ r: 5 }}
        />
        <Line
          yAxisId="right"
          type="monotone"
          dataKey="esperadoAcumulado"
          name="Esperado acumulado"
          stroke="#c4b5fd"
          strokeWidth={1.5}
          strokeDasharray="2 3"
          dot={false}
          activeDot={{ r: 3 }}
          hide={ocultas.has('esperadoAcumulado')}
        />
        <Line
          yAxisId="right"
          type="monotone"
          dataKey="recaudadoAcumulado"
          name="Recaudado acumulado"
          stroke="#7c3aed"
          strokeWidth={1.5}
          dot={false}
          activeDot={{ r: 3 }}
          hide={ocultas.has('recaudadoAcumulado')}
        />
      </LineChart>
    </ResponsiveContainer>
  );
}
