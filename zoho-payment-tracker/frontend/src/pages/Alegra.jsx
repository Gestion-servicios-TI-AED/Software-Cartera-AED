import { useEffect, useState } from 'react';
import { CheckCircle2, XCircle } from 'lucide-react';
import { getAlegraStatus } from '../utils/api';
import logoAlegra from '../assets/alegra-logo.svg';

// Placeholder mientras se define el modelo de datos de Alegra -- falta la
// muestra real del Excel (mucho más simple que el de fiducia de Baía
// Kristal) y decidir qué propiedades de HubSpot importan. Confirma acá si
// ya hay credenciales de HubSpot configuradas, para no tener que revisar
// el .env del servidor a mano.
export default function Alegra() {
  const [status, setStatus] = useState(null);
  const [error, setError] = useState(false);

  useEffect(() => {
    getAlegraStatus()
      .then(setStatus)
      .catch(() => setError(true));
  }, []);

  return (
    <div className="flex flex-col items-center justify-center min-h-screen gap-4 p-8 text-center bg-aed-base">
      <img src={logoAlegra} alt="Alegra" className="h-14 w-auto" />
      <div>
        <h1 className="font-heading text-[20px] font-bold text-ink">Cartera Alegra</h1>
        <p className="text-[14px] text-slate-500 max-w-md mt-1">
          Este módulo está en construcción. Falta definir el modelo de datos a partir
          de una muestra real del Excel de Alegra y las propiedades de HubSpot que
          vamos a usar como plan de pagos.
        </p>
      </div>

      <div className="card px-4 py-3 flex items-center gap-2 text-[13px]">
        {error ? (
          <span className="text-red-500">No se pudo consultar el estado del módulo.</span>
        ) : status ? (
          <>
            {status.hubspotConfigurado ? (
              <CheckCircle2 size={16} className="text-emerald-600 flex-shrink-0" />
            ) : (
              <XCircle size={16} className="text-slate-400 flex-shrink-0" />
            )}
            <span className="text-slate-600">
              HubSpot: {status.hubspotConfigurado ? 'token configurado' : 'falta HUBSPOT_ACCESS_TOKEN en el backend'}
            </span>
          </>
        ) : (
          <span className="text-slate-400">Consultando estado…</span>
        )}
      </div>
    </div>
  );
}
