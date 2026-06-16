// Columnas del informe de fiducia que NO deben mostrarse, según el concepto
// provisto por Cartera (ver DICCIONARIO-COLUMNAS-FIDUCIA.md en la raíz del repo).
//
// Motivos: "no aplica" / "en este momento no aplica", o
// "necesario para cuando se va a entregar el inmueble" (uso futuro).
//
// La exclusión es POR HOJA: "Observaciones" del resumen se oculta, pero
// "Observaciones" del movimiento sí aplica y se conserva.

const norm = (s) => (s == null ? '' : String(s).trim().toLowerCase());

// Resumen → Negocio.datos
const COLS_RESUMEN_EXCLUIR = [
  'Canje', 'Subsidio', 'Descuentos', 'Valor Acreditación', 'Movimiento Posterior',
  'Fecha Autoriz. Escritura', 'Matricula Inmobiliaria', 'Valor Escritura', 'Observaciones',
  'Fecha Factura', 'Número Factura', 'Número Escritura Publica', 'Notaria',
  'Valor Factura', 'Fecha Envío Contabilidad',
];

// Movimientos → NegocioMovimiento.datos
const COLS_MOVIMIENTO_EXCLUIR = ['Sucursal'];

const setResumen = new Set(COLS_RESUMEN_EXCLUIR.map(norm));
const setMovimiento = new Set(COLS_MOVIMIENTO_EXCLUIR.map(norm));

export const excluirEnResumen = (col) => setResumen.has(norm(col));
export const excluirEnMovimiento = (col) => setMovimiento.has(norm(col));

// Filtra un objeto `datos` del resumen, quitando las columnas excluidas.
export const filtrarDatosResumen = (datos) =>
  Object.fromEntries(Object.entries(datos || {}).filter(([k]) => !excluirEnResumen(k)));

// Filtra una lista de nombres de columna de movimiento.
export const filtrarKeysMovimiento = (keys) =>
  (keys || []).filter((k) => !excluirEnMovimiento(k));
