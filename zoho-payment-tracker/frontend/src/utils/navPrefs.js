import { useState, useEffect, useCallback } from 'react';
import { getMenuOculto, actualizarMenuOculto } from './api';

// Preferencia de visibilidad de los ítems del menú lateral.
// Global para todos -- se guarda en la base de datos (tabla ConfiguracionApp)
// en vez de localStorage, porque no hay usuarios individuales: si alguien
// oculta un módulo, debe ocultarse para todo el que use la app, no solo en
// ese navegador. `cache`/`EVENT` siguen existiendo para que Sidebar y
// Ajustes (dos instancias del hook montadas a la vez) se mantengan
// sincronizados en la misma pestaña sin cada uno pedirle al servidor por su
// cuenta cada vez que el otro cambia algo.

const EVENT = 'aed-navprefs-changed';
let cache = null; // Set | null -- null mientras no se ha cargado del servidor

function persistirLocal(set) {
  cache = set;
  window.dispatchEvent(new Event(EVENT));
}

// Hook reactivo: devuelve el set de ocultos (vacío mientras carga la primera
// vez) y funciones para alternarlos -- cada cambio se manda al servidor de
// inmediato y queda visible para cualquier otra sesión en su próxima carga.
export function useHiddenNav() {
  const [hidden, setHidden] = useState(cache ?? new Set());

  useEffect(() => {
    const handler = () => setHidden(cache ?? new Set());
    window.addEventListener(EVENT, handler);

    if (cache === null) {
      getMenuOculto()
        .then((res) => persistirLocal(new Set(res.hidden || [])))
        .catch((err) => console.error('Error cargando preferencias del menú:', err));
    }

    return () => window.removeEventListener(EVENT, handler);
  }, []);

  const guardar = useCallback((next) => {
    persistirLocal(next); // optimista -- se ve al toque, sin esperar al servidor
    actualizarMenuOculto([...next]).catch((err) => {
      console.error('Error guardando preferencias del menú:', err);
    });
  }, []);

  const toggle = useCallback((key) => {
    const next = new Set(cache ?? []);
    if (next.has(key)) next.delete(key);
    else next.add(key);
    guardar(next);
  }, [guardar]);

  const setVisible = useCallback((key, visible) => {
    const next = new Set(cache ?? []);
    if (visible) next.delete(key);
    else next.add(key);
    guardar(next);
  }, [guardar]);

  return { hidden, toggle, setVisible };
}
