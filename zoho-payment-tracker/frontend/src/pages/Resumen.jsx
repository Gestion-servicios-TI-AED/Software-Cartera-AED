import React, { useEffect, useState } from 'react';
import {
  TrendingUp, AlertTriangle, Target, Clock, Briefcase, CheckCircle, XCircle,
} from 'lucide-react';
import KpiCard from '../components/KpiCard';
import RecaudoChart from '../components/stats/RecaudoChart';
import PipelineBars from '../components/stats/PipelineBars';
import { AvancePorProyecto, Morosidad, EmbudoEstados } from '../components/stats/CarteraWidgets';
import {
  getStatsResumen,
  getStatsRecaudoMensual,
  getStatsPipeline,
  getStatsSync,
  getStatsCartera,
} from '../utils/api';
import { formatCOP, formatDateTime } from '../utils/format';

function variacionText(val) {
  if (val === null || val === undefined) return null;
  const sign = val >= 0 ? '▲' : '▼';
  return `${sign} ${Math.abs(val)}% vs mes anterior`;
}

export default function Resumen() {
  const [resumen, setResumen] = useState(null);
  const [recaudoMensual, setRecaudoMensual] = useState([]);
  const [pipeline, setPipeline] = useState([]);
  const [syncLogs, setSyncLogs] = useState([]);
  const [cartera, setCartera] = useState(null);
  const [moraDias, setMoraDias] = useState(30);

  useEffect(() => {
    Promise.allSettled([
      getStatsResumen().then(setResumen),
      getStatsRecaudoMensual().then(setRecaudoMensual),
      getStatsPipeline().then(setPipeline),
      getStatsSync(5).then(setSyncLogs),
      getStatsCartera().then(setCartera),
    ]);
  }, []);

  const lastSync = syncLogs[0];
  const syncOk = syncLogs.filter((s) => s.status === 'success').length;
  const syncErr = syncLogs.filter((s) => s.status === 'error').length;

  const c = cartera?.resumen;
  const morososActual = c ? c[`morosos${moraDias}`] : null;
  const pct = c?.pctGlobal ?? 0;

  return (
    <div className="flex flex-col min-h-screen bg-aed-base">
      {/* Topbar */}
      <header className="h-[52px] bg-white border-b border-aed-border flex items-center px-5 gap-3 flex-shrink-0 sticky top-0 z-10">
        <h1 className="text-[15px] font-bold text-slate-800">Resumen Gerencial</h1>
        <span className="text-xs text-slate-400">Cartera de cobranza</span>
      </header>

      <div className="flex-1 p-5 flex flex-col gap-4">
        {/* KPIs accionables */}
        <div className="grid grid-cols-5 gap-3">
          <KpiCard
            icon={AlertTriangle}
            iconBg="#fef2f2"
            iconColor="#dc2626"
            label="Por cobrar (cuota inicial)"
            value={c ? formatCOP(c.porCobrarTotal) : '—'}
            sub={c ? `de ${formatCOP(c.cuotaInicialTotal)} en cuotas` : undefined}
          />

          {/* % recaudado con barra */}
          <div className="card p-4 flex flex-col gap-1">
            <div className="w-8 h-8 rounded-lg flex items-center justify-center mb-1" style={{ background: '#f0fdf4' }}>
              <Target size={16} color="#16a34a" strokeWidth={2} />
            </div>
            <span className="text-[11px] text-slate-400 font-medium">% recaudado de cartera</span>
            <span className="text-[22px] font-bold text-slate-800 leading-tight tracking-tight">{c ? `${pct}%` : '—'}</span>
            <div className="h-1.5 w-full rounded-full bg-slate-100 overflow-hidden mt-1.5">
              <div className="h-full rounded-full bg-emerald-500 transition-all" style={{ width: `${Math.min(100, pct)}%` }} />
            </div>
          </div>

          <KpiCard
            icon={TrendingUp}
            iconBg="#eff6ff"
            iconColor="#3b82f6"
            label="Recaudo del mes"
            value={resumen ? formatCOP(resumen.recaudoMes) : '—'}
            sub={variacionText(resumen?.variacionMes) ?? undefined}
          />
          <KpiCard
            icon={Clock}
            iconBg="#fffbeb"
            iconColor="#d97706"
            label={`Morosos (+${moraDias} días)`}
            value={morososActual ?? '—'}
            sub={c ? 'sin abonar y con saldo' : undefined}
          />
          <KpiCard
            icon={Briefcase}
            iconBg="#faf5ff"
            iconColor="#7c3aed"
            label="Negocios en cobro"
            value={c ? c.negociosEnCobro : '—'}
            sub={resumen ? `Recaudo año: ${formatCOP(resumen.recaudoAnio)}` : undefined}
          />
        </div>

        {/* Accionable: avance por proyecto + morosidad */}
        <div className="grid grid-cols-2 gap-4">
          <div className="card p-4">
            <h2 className="text-[13px] font-semibold text-slate-700 mb-3">Avance de recaudo por proyecto</h2>
            <AvancePorProyecto data={cartera?.porProyecto ?? []} />
          </div>
          <div className="card p-4">
            <h2 className="text-[13px] font-semibold text-slate-700 mb-3 flex items-center gap-1.5">
              <AlertTriangle size={14} className="text-amber-500" /> Morosidad — requieren gestión
            </h2>
            <Morosidad negocios={cartera?.enCobro ?? []} dias={moraDias} onDiasChange={setMoraDias} />
          </div>
        </div>

        {/* Tendencia recaudo */}
        <div className="card p-4">
          <div className="flex items-baseline justify-between mb-3">
            <h2 className="text-[13px] font-semibold text-slate-700">Recaudo mensual — últimos 12 meses</h2>
            {resumen && (
              <span className="text-[11px] text-slate-400">
                YTD <b className="text-slate-600">{formatCOP(resumen.recaudoAnio)}</b>
                <span className="mx-1.5">·</span>
                Separaciones del mes <b className="text-slate-600">{resumen.separacionesMes}</b>
              </span>
            )}
          </div>
          <RecaudoChart data={recaudoMensual} />
        </div>

        {/* Distribución */}
        <div className="grid grid-cols-2 gap-4">
          <div className="card p-4">
            <h2 className="text-[13px] font-semibold text-slate-700 mb-3">Negocios por estado</h2>
            <EmbudoEstados data={cartera?.estados ?? []} />
          </div>
          <div className="card p-4">
            <h2 className="text-[13px] font-semibold text-slate-700 mb-3">Pipeline por etapa (Zoho)</h2>
            <PipelineBars data={pipeline} />
          </div>
        </div>

        {/* Footer sync */}
        <div className="card p-4 flex items-center gap-4 text-xs text-slate-500">
          {lastSync ? (
            <>
              {lastSync.status === 'success' ? (
                <CheckCircle size={14} className="text-green-500 flex-shrink-0" />
              ) : lastSync.status === 'error' ? (
                <XCircle size={14} className="text-red-500 flex-shrink-0" />
              ) : (
                <Clock size={14} className="text-yellow-500 flex-shrink-0" />
              )}
              <span>
                Última sync Zoho: <strong>{formatDateTime(lastSync.startedAt)}</strong>
                {' · '}{lastSync.recordsSync} registros
              </span>
              <span className="ml-auto">
                Últimas 5: {syncOk} OK · {syncErr} errores
              </span>
            </>
          ) : (
            <span>Sin historial de sincronización</span>
          )}
        </div>
      </div>
    </div>
  );
}
