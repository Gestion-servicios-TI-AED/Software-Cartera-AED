import React, { useEffect, useState } from 'react';
import {
  TrendingUp, AlertTriangle, Target, Clock, Briefcase, CheckCircle, XCircle,
} from 'lucide-react';
import KpiCard from '../components/KpiCard';
import HelpTip from '../components/HelpTip';
import PlanVsRecaudoLineChart from '../components/stats/PlanVsRecaudoLineChart';
import EtapaRecaudoBars from '../components/stats/EtapaRecaudoBars';
import PipelineBars from '../components/stats/PipelineBars';
import { TopMorosos, EmbudoEstados } from '../components/stats/CarteraWidgets';
import {
  getStatsResumen,
  getStatsPipeline,
  getStatsSync,
  getStatsCartera,
  getDashboardRecaudo,
} from '../utils/api';
import { formatCOP, formatDateTime } from '../utils/format';

function variacionText(val) {
  if (val === null || val === undefined) return null;
  const sign = val >= 0 ? '▲' : '▼';
  return `${sign} ${Math.abs(val)}% vs mes anterior`;
}

export default function Resumen() {
  const [resumen, setResumen] = useState(null);
  const [pipeline, setPipeline] = useState([]);
  const [syncLogs, setSyncLogs] = useState([]);
  const [cartera, setCartera] = useState(null);
  const [planRecaudo, setPlanRecaudo] = useState(null);
  const [moraDias, setMoraDias] = useState(30);

  useEffect(() => {
    Promise.allSettled([
      getStatsResumen().then(setResumen),
      getStatsPipeline().then(setPipeline),
      getStatsSync(5).then(setSyncLogs),
      getStatsCartera().then(setCartera),
      // limit=1: solo interesan meses/totales/totalesPorEtapa (agregados sobre
      // todo el portafolio sin filtros), no las filas -- el backend ya calcula
      // los totales sobre el conjunto completo antes de paginar.
      getDashboardRecaudo({ page: 1, limit: 1 }).then(setPlanRecaudo),
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
        <h1 className="text-[18px] font-bold text-slate-800">Resumen Gerencial</h1>
        <span className="text-[14px] text-slate-500">Cartera de cobranza</span>
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
            hint="Dinero pendiente de la cuota inicial pactada en todos los negocios en cobro."
          />

          {/* % recaudado con barra */}
          <div className="card p-4 flex flex-col gap-1">
            <div className="w-8 h-8 rounded-lg flex items-center justify-center mb-1" style={{ background: '#f0fdf4' }}>
              <Target size={16} color="#16a34a" strokeWidth={2} />
            </div>
            <span className="inline-flex items-center gap-1 text-[14px] text-slate-500 font-medium">
              % recaudado de cartera
              <HelpTip text="Porcentaje de la cuota inicial total que ya fue abonado por los compradores." />
            </span>
            <span className="font-heading text-[25px] font-bold text-ink leading-tight tracking-tight">{c ? `${pct}%` : '—'}</span>
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

          {/* Morosos con umbral seleccionable */}
          <div className="card p-4 flex flex-col gap-1">
            <div className="w-8 h-8 rounded-lg flex items-center justify-center mb-1" style={{ background: '#fffbeb' }}>
              <Clock size={16} color="#d97706" strokeWidth={2} />
            </div>
            <span className="inline-flex items-center gap-1 text-[14px] text-slate-500 font-medium">
              {`Morosos (+${moraDias} días)`}
              <HelpTip text={`Negocios con saldo pendiente que no registran abonos en los últimos ${moraDias} días.`} />
            </span>
            <span className="font-heading text-[25px] font-bold text-ink leading-tight tracking-tight">{morososActual ?? '—'}</span>
            <div className="flex gap-1 mt-1">
              {[30, 60, 90].map((d) => (
                <button
                  key={d}
                  onClick={() => setMoraDias(d)}
                  className={`text-[12px] font-medium px-1.5 py-0.5 rounded-md border transition-colors ${
                    moraDias === d
                      ? 'bg-brand border-brand text-white'
                      : 'bg-white border-aed-border text-slate-500 hover:bg-aed-base'
                  }`}
                >
                  {d}d
                </button>
              ))}
            </div>
          </div>

          <KpiCard
            icon={Briefcase}
            iconBg="#faf5ff"
            iconColor="#7c3aed"
            label="Negocios en cobro"
            value={c ? c.negociosEnCobro : '—'}
            sub={resumen ? `Recaudo año: ${formatCOP(resumen.recaudoAnio)}` : undefined}
            hint="Negocios activos que todavía tienen saldo de cuota inicial por cobrar."
          />
        </div>

        {/* Prioridad de gestión: top morosos */}
        <div className="card p-4">
          <h2 className="text-[15px] font-semibold text-slate-700 mb-3 flex items-center gap-1.5">
            <AlertTriangle size={14} className="text-red-500" /> Top 10 morosos — prioridad de gestión
            <HelpTip text="Los 10 negocios más urgentes a gestionar: primero los que nunca abonaron o llevan más días sin hacerlo, y en empate, el mayor monto pendiente." />
          </h2>
          <TopMorosos negocios={cartera?.enCobro ?? []} />
        </div>

        {/* Tendencia: plan de pagos vs. recaudo real, mes a mes */}
        <div className="card p-4">
          <div className="flex items-baseline justify-between mb-1 flex-wrap gap-2">
            <h2 className="text-[15px] font-semibold text-slate-700 flex items-center gap-1.5">
              Plan de pagos vs. Recaudo — tendencia mensual
              <HelpTip text="Compara, mes a mes y para todo el portafolio, cuánto se esperaba recaudar según el plan de pagos de cada negocio contra lo efectivamente recaudado. Incluye meses futuros del plan, por eso lo recaudado cae por debajo de lo esperado en los meses que aún no vencen." />
            </h2>
            {resumen && (
              <span className="text-[13px] text-slate-500 inline-flex items-center gap-1 flex-wrap">
                Recaudado en el año
                <b className="text-slate-600">{formatCOP(resumen.recaudoAnio)}</b>
                <span className="mx-1">·</span>
                Separaciones este mes
                <b className="text-slate-600">{resumen.separacionesMes}</b>
              </span>
            )}
          </div>
          <PlanVsRecaudoLineChart meses={planRecaudo?.meses ?? []} totales={planRecaudo?.totales ?? {}} />
        </div>

        {/* Distribución por etapa: constructiva y CRM */}
        <div className="grid grid-cols-2 gap-4">
          <div className="card p-4">
            <h2 className="text-[15px] font-semibold text-slate-700 mb-3 flex items-center gap-1.5">
              Recaudo por Etapa del proyecto
              <HelpTip text="Esperado vs. recaudado del plan de pagos, agrupado por Etapa constructiva (1, 2, 3…) — no confundir con la Etapa/Stage de Zoho del panel de la derecha." />
            </h2>
            <EtapaRecaudoBars totalesPorEtapa={planRecaudo?.totalesPorEtapa ?? {}} />
          </div>
          <div className="card p-4">
            <h2 className="text-[15px] font-semibold text-slate-700 mb-3">Pipeline por etapa (Zoho)</h2>
            <PipelineBars data={pipeline} />
          </div>
        </div>

        {/* Negocios por estado */}
        <div className="card p-4">
          <h2 className="text-[15px] font-semibold text-slate-700 mb-3">Negocios por estado</h2>
          <EmbudoEstados data={cartera?.estados ?? []} />
        </div>

        {/* Footer sync */}
        <div className="card p-4 flex items-center gap-4 text-[14px] text-slate-500">
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
