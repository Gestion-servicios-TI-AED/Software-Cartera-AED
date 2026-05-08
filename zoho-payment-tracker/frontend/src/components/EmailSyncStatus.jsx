import React, { useState, useEffect } from 'react';
import { getEmailSyncStatus, triggerEmailSync } from '../utils/api';
import { formatDateTime } from '../utils/format';

export default function EmailSyncStatus() {
  const [status, setStatus] = useState(null);
  const [syncing, setSyncing] = useState(false);

  async function loadStatus() {
    try {
      const s = await getEmailSyncStatus();
      setStatus(s);
    } catch {
      // backend no disponible aún
    }
  }

  useEffect(() => {
    loadStatus();
    const interval = setInterval(loadStatus, 20000);
    return () => clearInterval(interval);
  }, []);

  async function handleSync() {
    setSyncing(true);
    try {
      await triggerEmailSync();
      setTimeout(() => {
        loadStatus();
        setSyncing(false);
      }, 4000);
    } catch {
      setSyncing(false);
    }
  }

  const isRunning = status?.status === 'running' || syncing;

  return (
    <div className="flex items-center gap-3">
      <div className="text-sm text-gray-500">
        {(!status || status.status === 'never') && (
          <span className="text-gray-400">Correos: sin sync</span>
        )}
        {status?.status === 'running' && (
          <span className="flex items-center gap-1.5 text-indigo-600">
            <span className="w-2 h-2 rounded-full bg-indigo-500 animate-pulse" />
            Procesando correos...
          </span>
        )}
        {status?.status === 'success' && (
          <span>
            Correos:{' '}
            <span className="font-medium text-gray-700">{formatDateTime(status.finishedAt)}</span>{' '}
            <span className="text-indigo-600">({status.movimientosCreados} filas)</span>
          </span>
        )}
        {status?.status === 'error' && (
          <span className="text-red-500 text-xs">
            Error correos: {status.errorMsg?.slice(0, 60)}
          </span>
        )}
      </div>

      <button
        onClick={handleSync}
        disabled={isRunning}
        title="Procesar correos con adjuntos Excel"
        className="btn-secondary flex items-center gap-1.5 text-sm"
      >
        {isRunning ? (
          <>
            <svg className="w-4 h-4 animate-spin" fill="none" viewBox="0 0 24 24">
              <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
              <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
            </svg>
            Procesando...
          </>
        ) : (
          <>
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
            </svg>
            Procesar correos
          </>
        )}
      </button>
    </div>
  );
}
