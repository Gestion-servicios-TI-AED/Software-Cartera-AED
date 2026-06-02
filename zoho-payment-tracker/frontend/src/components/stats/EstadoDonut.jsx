import React from 'react';
import { PieChart, Pie, Cell, Tooltip, Legend, ResponsiveContainer } from 'recharts';

const COLORS = ['#3b82f6','#10b981','#f59e0b','#ef4444','#8b5cf6','#06b6d4','#f97316','#6366f1'];

function CustomTooltip({ active, payload }) {
  if (!active || !payload?.length) return null;
  const { name, value } = payload[0];
  return (
    <div className="bg-white border border-aed-border rounded-lg px-3 py-2 shadow-sm text-xs">
      <p className="font-medium text-slate-700">{name}</p>
      <p className="text-slate-600">{value} negocios</p>
    </div>
  );
}

export default function EstadoDonut({ data = [] }) {
  if (!data.length) {
    return (
      <div className="h-48 flex items-center justify-center text-sm text-slate-400">
        Sin datos
      </div>
    );
  }

  // Agrupar estados con < 2% como "Otros"
  const total = data.reduce((s, d) => s + d.count, 0);
  const threshold = total * 0.02;
  const main = data.filter((d) => d.count >= threshold);
  const others = data.filter((d) => d.count < threshold);
  const chartData = others.length
    ? [...main, { estado: 'Otros', count: others.reduce((s, d) => s + d.count, 0) }]
    : main;

  return (
    <ResponsiveContainer width="100%" height={200}>
      <PieChart>
        <Pie
          data={chartData}
          dataKey="count"
          nameKey="estado"
          cx="50%"
          cy="50%"
          innerRadius={55}
          outerRadius={80}
          paddingAngle={2}
        >
          {chartData.map((_, i) => (
            <Cell key={i} fill={COLORS[i % COLORS.length]} />
          ))}
        </Pie>
        <Tooltip content={<CustomTooltip />} />
        <Legend
          formatter={(value) => <span className="text-[11px] text-slate-600">{value}</span>}
          iconSize={10}
          iconType="circle"
        />
      </PieChart>
    </ResponsiveContainer>
  );
}
