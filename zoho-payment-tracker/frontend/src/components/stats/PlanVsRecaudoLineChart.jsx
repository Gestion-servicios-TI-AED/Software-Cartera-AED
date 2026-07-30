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
// formato en el eje. Sin "$" y sin decimales (salvo en B, donde 1 decimal sí
// aporta) para que los ticks queden cortos y limpios ("200M", no "$200.0M").
function formatYAxis(value) {
  const signo = value < 0 ? '-' : '';
  const abs = Math.abs(value);
  if (abs >= 1_000_000_000) return `${signo}${(abs / 1_000_000_000).toFixed(1)}B`;
  if (abs >= 1_000_000) return `${signo}${Math.round(abs / 1_000_000)}M`;
  if (abs >= 1_000) return `${signo}${Math.round(abs / 1_000)}K`;
  return `${signo}${Math.round(abs)}`;
}

// Redondea al siguiente paso "bonito" (1, 2 o 5 veces una potencia de 10) --
// mismo criterio que usan Recharts/d3 para generar ticks legibles. Hace
// falta calcularlo a mano porque el dominio de los ejes ya no es automático
// (se fija a mano para alinear el $0 del eje izquierdo con el del derecho),
// y un dominio exacto (no redondeado) da ticks feos tipo "$29932.1M".
function pasoLindo(rango, cantidadTicks = 5) {
  if (!(rango > 0)) return 1;
  const pasoAprox = rango / cantidadTicks;
  const exp = Math.floor(Math.log10(pasoAprox));
  const base = 10 ** exp;
  const norm = pasoAprox / base;
  let pasoNorm;
  if (norm < 1.5) pasoNorm = 1;
  else if (norm < 3) pasoNorm = 2;
  else if (norm < 7) pasoNorm = 5;
  else pasoNorm = 10;
  return pasoNorm * base;
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
export default function PlanVsRecaudoLineChart({ meses = [], totales = {}, granularidad = 'mes', altura = 640 }) {
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
    const porRecaudar = totales[mes]?.porRecaudar ?? 0;
    esperadoAcumulado += esperado;
    recaudadoAcumulado += recaudado;
    return {
      mesLabel: granularidad === 'dia' || granularidad === 'quincena' ? formatDiaLabel(mes) : formatMesLabel(mes),
      esperado,
      recaudado,
      porRecaudar,
      esperadoAcumulado,
      recaudadoAcumulado,
    };
  });

  const muchosMeses = chartData.length > 14;

  // El eje derecho (oculto) tiene su propia escala -- si no se alinea el $0
  // de ambos ejes, una línea del eje derecho puede aparecer visualmente a la
  // altura del "-$35M" del eje izquierdo aunque su valor real sea $0 (ahí es
  // donde cae su CERO, no donde cae ese número). Se calculan los dos dominios
  // a mano (en vez de dejar que Recharts los autocalcule cada uno por su
  // lado) para forzar que el $0 de ambos quede exactamente en la misma altura.
  const valoresIzq = chartData.flatMap((d) => [d.esperado, d.recaudado, d.porRecaudar]);
  const valoresDer = chartData.flatMap((d) => [d.esperadoAcumulado, d.recaudadoAcumulado]);
  const izqMaxDatos = Math.max(0, ...valoresIzq);
  const izqMinDatos = Math.min(0, ...valoresIzq);
  // Dominio del eje izquierdo redondeado a un paso "bonito" (no el mínimo/
  // máximo exacto de los datos) -- así los ticks quedan en números limpios
  // ($30.000M, no "$29932.1M") y $0 cae justo en un borde de paso.
  //
  // El paso de referencia es el que se usaría en tamaño normal (640px). En
  // pantalla completa hay más espacio, así que se subdivide ese MISMO paso
  // en fracciones limpias (÷2, ÷5) según cuánto más alta esté la gráfica --
  // pedirle a pasoLindo() directamente "más ticks" no sirve: su sistema de
  // pasos 1/2/5/10 es discreto, así que un objetivo apenas mayor puede caer
  // en el mismo "escalón" y no cambiar nada (o, con datos que cambian en
  // producción, caer del otro lado del escalón sin avisar). Dividir el paso
  // de referencia sí garantiza una diferencia real y predecible.
  const pasoReferencia = pasoLindo(izqMaxDatos - izqMinDatos, 10);
  const factorAltura = (typeof altura === 'number' ? altura : 640) / 640;
  let pasoIzq = pasoReferencia;
  if (factorAltura >= 3) pasoIzq = pasoReferencia / 5;
  else if (factorAltura >= 1.2) pasoIzq = pasoReferencia / 2;
  const izqMax = Math.ceil(izqMaxDatos / pasoIzq) * pasoIzq;
  const izqMin = izqMinDatos < 0 ? Math.floor(izqMinDatos / pasoIzq) * pasoIzq : 0;
  const ticksIzq = [];
  for (let v = izqMin; v <= izqMax + pasoIzq / 2; v += pasoIzq) ticksIzq.push(Math.round(v));

  const derMinDatos = Math.min(0, ...valoresDer);
  const derMax = Math.max(0, ...valoresDer);
  // Fracción del eje izquierdo (ya redondeado) que queda por debajo de cero
  // -- se replica en el eje derecho para que el $0 de ambos caiga a la
  // misma altura.
  const fraccionNegativa = izqMax === izqMin ? 0 : (0 - izqMin) / (izqMax - izqMin);
  let derMin = derMinDatos;
  if (fraccionNegativa > 0 && fraccionNegativa < 1) {
    derMin = Math.min(derMinDatos, -(fraccionNegativa / (1 - fraccionNegativa)) * derMax);
  }

  return (
    <ResponsiveContainer width="100%" height={altura}>
      <LineChart data={chartData} margin={{ top: 4, right: 16, left: 8, bottom: muchosMeses ? 24 : 4 }}>
        <CartesianGrid stroke="#64748b" strokeOpacity={0.18} vertical={false} />
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
          domain={[izqMin, izqMax]}
          ticks={ticksIzq}
          tickFormatter={formatYAxis}
          tick={{ fontSize: 11, fill: '#64748b' }}
          axisLine={false}
          tickLine={false}
          width={52}
        />
        <YAxis yAxisId="right" domain={[derMin, derMax]} orientation="right" hide />
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
          name="Proyectado (plan)"
          stroke="#3b82f6"
          strokeWidth={2}
          strokeDasharray="5 4"
          dot={{ r: 2.5, fill: '#3b82f6' }}
          activeDot={{ r: 4 }}
          hide={ocultas.has('esperado')}
        />
        <Line
          yAxisId="left"
          type="monotone"
          dataKey="recaudado"
          name="Recaudado"
          stroke="#16a34a"
          strokeWidth={2.5}
          hide={ocultas.has('recaudado')}
          dot={{ r: 2.5, fill: '#16a34a' }}
          activeDot={{ r: 5 }}
        />
        <Line
          yAxisId="left"
          type="monotone"
          dataKey="porRecaudar"
          name="Por recaudar"
          stroke="#ea580c"
          strokeWidth={2}
          dot={{ r: 2.5, fill: '#ea580c' }}
          activeDot={{ r: 4 }}
          hide={ocultas.has('porRecaudar')}
        />
        <Line
          yAxisId="right"
          type="monotone"
          dataKey="esperadoAcumulado"
          name="Proyectado acumulado"
          stroke="#93c5fd"
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
          stroke="#86efac"
          strokeWidth={1.5}
          dot={false}
          activeDot={{ r: 3 }}
          hide={ocultas.has('recaudadoAcumulado')}
        />
      </LineChart>
    </ResponsiveContainer>
  );
}
