import { useState, useEffect, useCallback } from 'react';

// Qué proyecto se está viendo (Baía Kristal / Alegra) -- es navegación
// personal de cada quien (como "en qué pestaña estoy"), no una preferencia
// compartida como la visibilidad del menú (navPrefs.js), así que vive en
// localStorage por navegador, no en la base de datos.
//
// El control para cambiarlo vive en Ajustes; Sidebar solo LEE este valor
// (vía useProyectoActivo) para decidir qué lista de ítems mostrar. El evento
// custom sincroniza ambos si están montados a la vez en la misma pestaña.

const KEY = 'aed.proyectoActivo';
const EVENT = 'aed-proyecto-changed';

export const PROYECTOS = [
  { key: 'baia-kristal', label: 'Baía Kristal', corta: 'BK', ruta: '/' },
  { key: 'alegra',       label: 'Alegra',       corta: 'AL', ruta: '/alegra' },
];

export function leerProyectoActivo() {
  try {
    return localStorage.getItem(KEY) || 'baia-kristal';
  } catch {
    return 'baia-kristal';
  }
}

function persistir(p) {
  try { localStorage.setItem(KEY, p); } catch { /* noop */ }
  window.dispatchEvent(new Event(EVENT));
}

export function useProyectoActivo() {
  const [proyecto, setProyectoState] = useState(leerProyectoActivo);

  useEffect(() => {
    const handler = () => setProyectoState(leerProyectoActivo());
    window.addEventListener(EVENT, handler);
    window.addEventListener('storage', handler); // sincroniza entre pestañas
    return () => {
      window.removeEventListener(EVENT, handler);
      window.removeEventListener('storage', handler);
    };
  }, []);

  const setProyecto = useCallback((p) => {
    persistir(p);
    setProyectoState(p);
  }, []);

  return { proyecto, setProyecto };
}
