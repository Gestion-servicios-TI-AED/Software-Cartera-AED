// Spinner de carga -- mismo SVG que ya se repetía copiado en varias páginas
// (Negocios, FiduciaMovimientos, Inventario...), centralizado acá para no
// seguir duplicándolo cada vez que una vista tarda en traer datos.
export default function Spinner({ label = 'Cargando…', size = 16, className = '' }) {
  return (
    <div className={`flex items-center justify-center gap-2 py-10 text-[14px] text-slate-500 ${className}`}>
      <svg className="animate-spin text-brand" style={{ width: size, height: size }} fill="none" viewBox="0 0 24 24">
        <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
        <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
      </svg>
      {label}
    </div>
  );
}
