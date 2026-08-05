import { useUsuarioActual } from '../utils/usuarioActual';

// Envuelve una página protegida por módulo (o por ser admin). `usuario` ya
// está garantizado no-nulo cuando esto se monta -- App.jsx solo renderiza
// <Routes> después de que cargarUsuarioActual() resolvió con éxito -- pero
// se maneja el caso nulo de todas formas por seguridad defensiva.
export default function RutaProtegida({ modulo, soloAdmin = false, children }) {
  const { usuario } = useUsuarioActual();
  if (!usuario) return null;

  const claves = modulo == null ? [] : (Array.isArray(modulo) ? modulo : [modulo]);
  const permitido = usuario.esAdmin || (!soloAdmin && claves.some((c) => usuario.modulosPermitidos.includes(c)));

  if (!permitido) {
    return (
      <div className="flex flex-col items-center justify-center h-screen gap-2 text-center bg-aed-base px-6">
        <p className="text-[16px] font-semibold text-slate-800">No tienes permiso para ver esta sección</p>
        <p className="text-[13px] text-slate-500">Pídele a un administrador que te dé acceso a este módulo.</p>
      </div>
    );
  }

  return children;
}
