import { useState, useEffect, useCallback } from 'react';

// Preferencia de visibilidad de los ítems del menú lateral.
// Se guarda en localStorage como una lista de `key` ocultos.
// Sin backend: es una preferencia local del navegador.

const KEY = 'aed.hiddenNav';
const EVENT = 'aed-navprefs-changed';

export function getHiddenNav() {
  try {
    return new Set(JSON.parse(localStorage.getItem(KEY) || '[]'));
  } catch {
    return new Set();
  }
}

function persist(set) {
  localStorage.setItem(KEY, JSON.stringify([...set]));
  // Notifica a otras instancias del hook en la misma pestaña.
  window.dispatchEvent(new Event(EVENT));
}

// Hook reactivo: devuelve el set de ocultos y funciones para alternarlos.
export function useHiddenNav() {
  const [hidden, setHidden] = useState(getHiddenNav);

  useEffect(() => {
    const handler = () => setHidden(getHiddenNav());
    window.addEventListener(EVENT, handler);
    window.addEventListener('storage', handler); // sincroniza entre pestañas
    return () => {
      window.removeEventListener(EVENT, handler);
      window.removeEventListener('storage', handler);
    };
  }, []);

  const toggle = useCallback((key) => {
    const next = getHiddenNav();
    if (next.has(key)) next.delete(key);
    else next.add(key);
    persist(next);
  }, []);

  const setVisible = useCallback((key, visible) => {
    const next = getHiddenNav();
    if (visible) next.delete(key);
    else next.add(key);
    persist(next);
  }, []);

  return { hidden, toggle, setVisible };
}
