import React from 'react';
import PaymentPlanTable from '../components/PaymentPlanTable';
import SyncStatus from '../components/SyncStatus';
import EmailSyncStatus from '../components/EmailSyncStatus';
import NavBar from '../components/NavBar';

export default function Dashboard() {
  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <header className="bg-white border-b border-gray-200 sticky top-0 z-10">
        <div className="max-w-screen-xl mx-auto px-6 py-4 flex items-center justify-between">
          <div className="flex items-center gap-6">
            <div>
              <h1 className="text-xl font-bold text-gray-900">Cartera</h1>
              <p className="text-xs text-gray-500 mt-0.5">Seguimiento de Planes de Pago · Zoho CRM</p>
            </div>
            <NavBar />
          </div>
          <div className="flex items-center gap-6 flex-wrap justify-end">
            <EmailSyncStatus />
            <SyncStatus />
          </div>
        </div>
      </header>

      {/* Contenido */}
      <main className="max-w-screen-xl mx-auto px-6 py-6">
        <PaymentPlanTable />
      </main>
    </div>
  );
}
