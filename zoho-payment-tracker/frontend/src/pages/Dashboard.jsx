import React, { useEffect, useState } from 'react';
import { BarChart2, Clock, Wallet, Landmark } from 'lucide-react';
import PaymentPlanTable from '../components/PaymentPlanTable';
import SyncStatus from '../components/SyncStatus';
import EmailSyncStatus from '../components/EmailSyncStatus';
import KpiCard from '../components/KpiCard';
import { getOpportunities, getEncargos, getStages } from '../utils/api';
import { formatCOP } from '../utils/format';

const INTERMEDIATE_STAGES = [
  'Qualification',
  'Value Proposition',
  'Id. Decision Makers',
  'Perception Analysis',
  'Proposal/Price Quote',
  'Negotiation/Review',
];

export default function Dashboard() {
  const [kpis, setKpis] = useState({ total: null, enNegociacion: null, recaudado: null, encargos: null });

  useEffect(() => {
    // Total oportunidades + recaudado (muestra de datos reales)
    getOpportunities({ page: 1, limit: 1 })
      .then((res) => setKpis((k) => ({ ...k, total: res.pagination?.total ?? null })))
      .catch(() => {});

    // Encargos activos
    getEncargos({ page: 1, limit: 1 })
      .then((res) => setKpis((k) => ({ ...k, encargos: res.pagination?.total ?? res.total ?? null })))
      .catch(() => {});

    // Etapas para "en negociación"
    getStages()
      .then((stages) => {
        const enNeg = Array.isArray(stages)
          ? stages.filter((s) => INTERMEDIATE_STAGES.includes(s)).length
          : null;
        setKpis((k) => ({ ...k, enNegociacion: enNeg }));
      })
      .catch(() => {});
  }, []);

  return (
    <div className="flex flex-col min-h-screen bg-aed-base">
      {/* Topbar */}
      <header className="h-[52px] bg-white border-b border-aed-border flex items-center px-5 gap-3 flex-shrink-0 sticky top-0 z-10">
        <h1 className="text-[15px] font-bold text-slate-800">Oportunidades</h1>
        <span className="text-xs text-slate-400">CRM Zoho</span>
        <div className="flex items-center gap-4 ml-1">
          <EmailSyncStatus />
          <SyncStatus />
        </div>
      </header>

      <div className="flex-1 p-5 flex flex-col gap-4">
        {/* KPIs */}
        <div className="grid grid-cols-4 gap-3">
          <KpiCard
            icon={BarChart2}
            iconBg="#eff6ff"
            iconColor="#3b82f6"
            label="Total oportunidades"
            value={kpis.total !== null ? kpis.total : '—'}
          />
          <KpiCard
            icon={Clock}
            iconBg="#fffbeb"
            iconColor="#d97706"
            label="En negociación"
            value={kpis.enNegociacion !== null ? kpis.enNegociacion : '—'}
          />
          <KpiCard
            icon={Wallet}
            iconBg="#f0fdf4"
            iconColor="#16a34a"
            label="Total recaudado"
            value="—"
            sub="Ver detalle por oportunidad"
          />
          <KpiCard
            icon={Landmark}
            iconBg="#faf5ff"
            iconColor="#7c3aed"
            label="Encargos activos"
            value={kpis.encargos !== null ? kpis.encargos : '—'}
          />
        </div>

        {/* Tabla */}
        <PaymentPlanTable />
      </div>
    </div>
  );
}
