import React, { useState, useEffect } from 'react';
import { getSyncStatus, triggerSync } from '../utils/api';
import { formatDateTime } from '../utils/format';

export default function SyncStatus() {
  const [status, setStatus] = useState(null);
  const [syncing, setSyncing] = useState(false);

  async function loadStatus() {
    try {
      const s = await getSyncStatus();
      setStatus(s);
    } catch {
      // ignorar si el backend no está disponible aún
    }
  }

  useEffect(() => {
    loadStatus();
    const interval = setInterval(loadStatus, 15000);
    return () => clearInterval(interval);
  }, []);

  async function handleSync() {
    setSyncing(true);
    try {
      await triggerSync();
      // Esperar un momento y refrescar el estado
      setTimeout(() => {
        loadStatus();
        setSyncing(false);
      }, 3000);
    } catch {
      setSyncing(false);
    }
  }

  const isRunning = status?.status === 'running' || syncing;

  return (
    <div className="flex items-center gap-4">
      <div className="text-sm text-gray-500">
        {status?.status === 'never' && 'Sin sincronizaciones'}
        {status?.status === 'running' && (
          <span className="flex items-center gap-1.5 text-blue-600">
            <span className="w-2 h-2 rounded-full bg-blue-500 animate-pulse" />
            Sincronizando...
          </span>
        )}
        {status?.status === 'success' && (
          <span>
            Última sync:{' '}
            <span className="font-medium text-gray-700">
              {formatDateTime(status.finishedAt)}
            </span>{' '}
            <span className="text-green-600">({status.recordsSync} reg.)</span>
          </span>
        )}
        {status?.status === 'error' && (
          <span className="text-red-600">
            Error en sync: {status.errorMsg?.slice(0, 50)}
          </span>
        )}
      </div>

      <button
        onClick={handleSync}
        disabled={isRunning}
        className="btn-primary"
      >
        {isRunning ? (
          <>
            <svg className="w-4 h-4 animate-spin" fill="none" viewBox="0 0 24 24">
              <circle
                className="opacity-25"
                cx="12"
                cy="12"
                r="10"
                stroke="currentColor"
                strokeWidth="4"
              />
              <path
                className="opacity-75"
                fill="currentColor"
                d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"
              />
            </svg>
            Sincronizando...
          </>
        ) : (
          <>
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15"
              />
            </svg>
            Sincronizar ahora
          </>
        )}
      </button>
    </div>
  );
}
