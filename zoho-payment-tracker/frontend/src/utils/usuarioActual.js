import { useState, useEffect } from 'react';
import { checkAuth } from './api';

// Identidad + permisos del usuario logueado. Mismo patrón de caché + evento
// que tenía navPrefs.js para el menú oculto: una sola llamada a
// GET /api/auth/check compartida entre todos los componentes montados a la
// vez (Sidebar, rutas protegidas, Ajustes), en vez de que cada uno la pida
// por su cuenta. App.jsx la dispara una vez al validar la sesión al arrancar
// (cargarUsuarioActual); mientras esté en caché, useUsuarioActual la lee de
// inmediato sin volver a pedirla al servidor.

const EVENT = 'aed-usuario-changed';
let cache = null; // { id, email, nombre, esAdmin, modulosPermitidos } | null

function persistir(usuario) {
  cache = usuario;
  window.dispatchEvent(new Event(EVENT));
}

export async function cargarUsuarioActual() {
  const usuario = await checkAuth();
  persistir(usuario);
  return usuario;
}

export function limpiarUsuarioActual() {
  persistir(null);
}

export function useUsuarioActual() {
  const [usuario, setUsuario] = useState(cache);

  useEffect(() => {
    const handler = () => setUsuario(cache);
    window.addEventListener(EVENT, handler);
    if (cache === null) {
      cargarUsuarioActual().catch(() => {});
    }
    return () => window.removeEventListener(EVENT, handler);
  }, []);

  return { usuario };
}
