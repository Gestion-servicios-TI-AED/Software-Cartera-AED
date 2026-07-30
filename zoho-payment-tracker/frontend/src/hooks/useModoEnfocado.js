import { useState, useEffect, useCallback } from 'react';

// Modo enfocado: el elemento que lo use pasa a cubrir toda la pantalla (por
// encima del sidebar, vía position:fixed en el componente que lo consume) y,
// si el navegador lo permite, pide pantalla completa real. Se sincroniza con
// el evento nativo por si el usuario sale con Esc en vez del botón.
export function useModoEnfocado() {
  const [enfocado, setEnfocado] = useState(false);

  useEffect(() => {
    const onFullscreenChange = () => {
      if (!document.fullscreenElement) setEnfocado(false);
    };
    document.addEventListener('fullscreenchange', onFullscreenChange);
    return () => document.removeEventListener('fullscreenchange', onFullscreenChange);
  }, []);

  const toggleEnfocado = useCallback(() => {
    setEnfocado((actual) => {
      const siguiente = !actual;
      if (siguiente) {
        document.documentElement.requestFullscreen?.().catch(() => {});
      } else if (document.fullscreenElement) {
        document.exitFullscreen?.().catch(() => {});
      }
      return siguiente;
    });
  }, []);

  return [enfocado, toggleEnfocado];
}
