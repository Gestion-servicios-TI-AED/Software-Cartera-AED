import React, { useState, useEffect, useCallback, useRef } from 'react';
import { Settings, RefreshCw } from 'lucide-react';
import { NAV_ITEMS } from '../config/navItems';
import { useHiddenNav } from '../utils/navPrefs';
import { triggerSubformsBackfill, getSubformsBackfillStatus } from '../utils/api';

function formatDuracion(segundos) {
  if (segundos == null) return null;
  if (segundos < 60) return `${segundos}s`;
  const min = Math.floor(segundos / 60);
  const seg = segundos % 60;
  return `${min} min${seg > 0 ? ` ${seg}s` : ''}`;
}

function SubformsBackfillCard() {
  const [status, setStatus] = useState(null);
  const [triggering, setTriggering] = useState(false);
  const pollRef = useRef(null);

  const stopPolling = useCallback(() => {
    if (pollRef.current) {
      clearInterval(pollRef.current);
      pollRef.current = null;
    }
  }, []);

  const startPolling = useCallback(() => {
    stopPolling();
    pollRef.current = setInterval(async () => {
      try {
        const res = await getSubformsBackfillStatus();
        setStatus(res);
        if (!res.running) stopPolling();
      } catch {
        // seguir intentando en el próximo tick
      }
    }, 2000);
  }, [stopPolling]);

  // Al cargar la página, revisa si ya hay un backfill corriendo (ej. lo
  // disparó otra persona, u otra pestaña) para reflejarlo sin necesidad
  // de hacer clic.
  useEffect(() => {
    getSubformsBackfillStatus()
      .then((res) => {
        setStatus(res);
        if (res.running) startPolling();
      })
      .catch(() => {});
    return stopPolling;
  }, [startPolling, stopPolling]);

  const handleTrigger = async () => {
    setTriggering(true);
    try {
      await triggerSubformsBackfill();
      startPolling();
    } catch (err) {
      console.error('Error al iniciar el backfill:', err);
    } finally {
      setTriggering(false);
    }
  };

  const running = status?.running;
  const result = status?.result;
  const enCurso = running && result?.running;

  return (
    <div className="card overflow-hidden">
      <div className="px-4 py-3 border-b border-aed-border">
        <h2 className="text-[15px] font-semibold text-slate-800">Plan de pagos desde Zoho</h2>
        <p className="text-[13px] text-slate-500 mt-0.5">
          Trae el plan de pagos (Forma de Pago / Propuesta de Pago) de Zoho para las oportunidades
          que todavía no lo tengan guardado — necesario para que el Dashboard de plan vs. recaudo
          muestre datos completos. Es seguro correrlo varias veces: solo procesa lo pendiente.
        </p>
      </div>

      <div className="px-4 py-3 flex flex-col gap-3">
        <button
          onClick={handleTrigger}
          disabled={triggering || enCurso}
          className="btn-secondary self-start px-3 py-1.5 text-[14px] flex items-center gap-1.5 disabled:opacity-50"
        >
          <RefreshCw size={13} className={enCurso ? 'animate-spin' : ''} />
          {enCurso ? 'Sincronizando…' : 'Sincronizar planes de pago'}
        </button>

        {enCurso && (
          <div className="flex flex-col gap-1.5">
            <div className="w-full h-2.5 rounded-full bg-aed-base overflow-hidden">
              <div
                className="h-full bg-brand transition-all duration-500"
                style={{ width: `${result.porcentaje}%` }}
              />
            </div>
            <p className="text-[13px] text-slate-500">
              {result.porcentaje}% · {result.procesadas} de {result.total} oportunidades
              {result.segundosRestantesEstimados != null && (
                <> · faltan ~{formatDuracion(result.segundosRestantesEstimados)}</>
              )}
              {result.errores > 0 && <span className="text-amber-600"> · {result.errores} errores</span>}
            </p>
          </div>
        )}

        {!enCurso && result?.ok === true && (
          <p className="text-[13px] text-success">
            Listo: {result.actualizadas} de {result.total} oportunidades actualizadas en {result.elapsed}
            {result.errores > 0 && <span className="text-amber-600"> ({result.errores} errores)</span>}
          </p>
        )}

        {!enCurso && result?.ok === false && (
          <p className="text-[13px] text-red-500">Error: {result.error}</p>
        )}
      </div>
    </div>
  );
}

function Toggle({ checked, onChange, label }) {
  return (
    <button
      role="switch"
      aria-checked={checked}
      aria-label={label}
      onClick={onChange}
      className={`relative w-11 h-6 rounded-full transition-colors flex-shrink-0 focus:outline-none focus:ring-2 focus:ring-[color:var(--brand)] focus:ring-offset-2 ${
        checked ? 'bg-brand' : 'bg-slate-300'
      }`}
    >
      <span
        className={`absolute top-0.5 left-0.5 w-5 h-5 rounded-full bg-white shadow transition-transform ${
          checked ? 'translate-x-5' : ''
        }`}
      />
    </button>
  );
}

export default function Ajustes() {
  const { hidden, setVisible } = useHiddenNav();

  return (
    <div className="flex flex-col min-h-screen bg-aed-base">
      {/* Topbar */}
      <header className="h-[52px] bg-white border-b border-aed-border flex items-center px-5 gap-2.5 flex-shrink-0 sticky top-0 z-10">
        <Settings size={18} className="text-slate-500" />
        <h1 className="text-[18px] font-bold text-slate-800">Ajustes</h1>
      </header>

      <div className="flex-1 p-5">
        <div className="max-w-2xl flex flex-col gap-4">
          <div className="card overflow-hidden">
            <div className="px-4 py-3 border-b border-aed-border">
              <h2 className="text-[15px] font-semibold text-slate-800">Elementos del menú</h2>
              <p className="text-[13px] text-slate-500 mt-0.5">
                Decide qué secciones se muestran en el menú lateral. Las que ocultes
                desaparecen de la barra, pero siguen funcionando si tienes su enlace.
              </p>
            </div>

            <div className="divide-y divide-aed-border">
              {NAV_ITEMS.map((item) => {
                const visible = !hidden.has(item.key);
                return (
                  <div key={item.key} className="flex items-center gap-3 px-4 py-3">
                    <span
                      className="w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0"
                      style={{ backgroundColor: `${item.color}14`, color: item.color }}
                    >
                      <item.Icon size={16} strokeWidth={2} />
                    </span>
                    <div className="flex-1 min-w-0">
                      <p className="text-[14px] font-medium text-slate-800">{item.label}</p>
                      <p className="text-[13px] text-slate-500">
                        {visible ? 'Visible en el menú' : 'Oculto'}
                      </p>
                    </div>
                    <Toggle
                      checked={visible}
                      label={`Mostrar ${item.label}`}
                      onChange={() => setVisible(item.key, !visible)}
                    />
                  </div>
                );
              })}
            </div>
          </div>

          <SubformsBackfillCard />
        </div>
      </div>
    </div>
  );
}
