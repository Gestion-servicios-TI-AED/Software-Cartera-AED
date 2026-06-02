import React, { useEffect, useState } from 'react';
import {
  TrendingUp, Wallet, BarChart3, CalendarCheck, Briefcase, CheckCircle, XCircle, Clock,
} from 'lucide-react';
import KpiCard from '../components/KpiCard';
import RecaudoChart from '../components/stats/RecaudoChart';
import EstadoDonut from '../components/stats/EstadoDonut';
import PipelineBars from '../components/stats/PipelineBars';
import {
  getStatsResumen,
  getStatsRecaudoMensual,
  getStatsPipeline,
  getStatsTopDeudores,
  getStatsSync,
  getNegociosStats,
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
  const [deudores, setDeudores] = useState([]);
  const [syncLogs, setSyncLogs] = useState([]);
  const [negStats, setNegStats] = useState(null);

  useEffect(() => {
    Promise.allSettled([
      getStatsResumen().then(setResumen),
      getStatsRecaudoMensual().then(setRecaudoMensual),
      getStatsPipeline().then(setPipeline),
      getStatsTopDeudores(10).then(setDeudores),
      getStatsSync(5).then(setSyncLogs),
      getNegociosStats().then(setNegStats),
    ]);
  }, []);

  const lastSync = syncLogs[0];
  const syncOk = syncLogs.filter((s) => s.status === 'success').length;
  const syncErr = syncLogs.filter((s) => s.status === 'error').length;

  return (
    <div className="flex flex-col min-h-screen bg-aed-base">
      {/* Topbar */}
      <header className="h-[52px] bg-white border-b border-aed-border flex items-center px-5 gap-3 flex-shrink-0 sticky top-0 z-10">
        <h1 className="text-[15px] font-bold text-slate-800">Resumen Gerencial</h1>
        <span className="text-xs text-slate-400">Vista ejecutiva</span>
      </header>

      <div className="flex-1 p-5 flex flex-col gap-4">
        {/* KPIs */}
        <div className="grid grid-cols-5 gap-3">
          <KpiCard
            icon={Wallet}
            iconBg="#eff6ff"
            iconColor="#3b82f6"
            label="Saldo total cartera"
            value={resumen ? formatCOP(resumen.saldoCartera) : '—'}
            sub={resumen ? `${resumen.negociosActivos} negocios activos` : undefined}
          />
          <KpiCard
            icon={TrendingUp}
            iconBg="#f0fdf4"
            iconColor="#16a34a"
            label="Recaudo del mes"
            value={resumen ? formatCOP(resumen.recaudoMes) : '—'}
            sub={variacionText(resumen?.variacionMes) ?? undefined}
          />
          <KpiCard
            icon={BarChart3}
            iconBg="#faf5ff"
            iconColor="#7c3aed"
            label="Recaudo año (YTD)"
            value={resumen ? formatCOP(resumen.recaudoAnio) : '—'}
          />
          <KpiCard
            icon={CalendarCheck}
            iconBg="#fffbeb"
            iconColor="#d97706"
            label="Separaciones del mes"
            value={resumen !== null ? resumen.separacionesMes : '—'}
          />
          <KpiCard
            icon={Briefcase}
            iconBg="#fef2f2"
            iconColor="#dc2626"
            label="Negocios activos"
            value={resumen !== null ? resumen.negociosActivos : '—'}
          />
        </div>

        {/* Tendencia recaudo */}
        <div className="card p-4">
          <h2 className="text-[13px] font-semibold text-slate-700 mb-3">
            Recaudo mensual — últimos 12 meses
          </h2>
          <RecaudoChart data={recaudoMensual} />
        </div>

        {/* Distribución */}
        <div className="grid grid-cols-2 gap-4">
          <div className="card p-4">
            <h2 className="text-[13px] font-semibold text-slate-700 mb-3">
              Negocios por estado
            </h2>
            <EstadoDonut data={negStats?.porEstado ?? []} />
          </div>
          <div className="card p-4">
            <h2 className="text-[13px] font-semibold text-slate-700 mb-3">
              Pipeline por etapa (Zoho)
            </h2>
            <PipelineBars data={pipeline} />
          </div>
        </div>

        {/* Rankings */}
        <div className="grid grid-cols-2 gap-4">
          {/* Top deudores */}
          <div className="card p-4">
            <h2 className="text-[13px] font-semibold text-slate-700 mb-3">
              Top 10 deudores (saldo pendiente)
            </h2>
            {deudores.length === 0 ? (
              <p className="text-sm text-slate-400">Sin datos</p>
            ) : (
              <table className="w-full text-xs">
                <thead>
                  <tr className="text-slate-400 border-b border-slate-100">
                    <th className="text-left py-1 font-medium">#</th>
                    <th className="text-left py-1 font-medium">Comprador</th>
                    <th className="text-right py-1 font-medium">Saldo</th>
                  </tr>
                </thead>
                <tbody>
                  {deudores.map((d, i) => (
                    <tr key={d.referencia} className="border-b border-slate-50 hover:bg-slate-50">
                      <td className="py-1.5 text-slate-400">{i + 1}</td>
                      <td className="py-1.5 text-slate-700 max-w-[160px] truncate" title={d.nombre}>
                        {d.nombre}
                      </td>
                      <td className="py-1.5 text-right font-medium text-slate-800">
                        {formatCOP(d.saldoActual)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>

          {/* Recaudo por fideicomiso */}
          <div className="card p-4">
            <h2 className="text-[13px] font-semibold text-slate-700 mb-3">
              Cartera por proyecto (fideicomiso)
            </h2>
            {!negStats?.porFideicomiso?.length ? (
              <p className="text-sm text-slate-400">Sin datos</p>
            ) : (
              <table className="w-full text-xs">
                <thead>
                  <tr className="text-slate-400 border-b border-slate-100">
                    <th className="text-left py-1 font-medium">Proyecto</th>
                    <th className="text-right py-1 font-medium">Negocios</th>
                    <th className="text-right py-1 font-medium">Saldo</th>
                  </tr>
                </thead>
                <tbody>
                  {negStats.porFideicomiso.map((f) => (
                    <tr key={f.fideicomiso} className="border-b border-slate-50 hover:bg-slate-50">
                      <td
                        className="py-1.5 text-slate-700 max-w-[160px] truncate"
                        title={f.fideicomiso}
                      >
                        {f.fideicomiso}
                      </td>
                      <td className="py-1.5 text-right text-slate-500">{f.count}</td>
                      <td className="py-1.5 text-right font-medium text-slate-800">
                        {formatCOP(f.saldo)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
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
