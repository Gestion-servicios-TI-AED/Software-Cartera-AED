// Columnas del informe de fiducia que NO deben guardarse ni mostrarse, según el
// concepto provisto por Cartera (ver docs/proyecto/DICCIONARIO-COLUMNAS-FIDUCIA.md).
//
// Dos motivos de exclusión:
//   - "no aplica" / "en este momento no aplica"
//   - "necesario para cuando se va a entregar el inmueble" (uso futuro, aún no se gestiona)
//
// La exclusión es POR HOJA: "Observaciones" del resumen se excluye, pero
// "Observaciones" del movimiento (Hoja2) sí aplica y se conserva.

const norm = (s) => (s == null ? '' : String(s).trim().toLowerCase());

// Hoja Resumen (alimenta Negocio.datos)
const COLS_RESUMEN_EXCLUIR = [
  // no aplica
  'Canje', 'Subsidio', 'Descuentos', 'Valor Acreditación', 'Movimiento Posterior',
  // necesario para cuando se va a entregar el inmueble
  'Fecha Autoriz. Escritura', 'Matricula Inmobiliaria', 'Valor Escritura', 'Observaciones',
  'Fecha Factura', 'Número Factura', 'Número Escritura Publica', 'Notaria',
  'Fecha Envío Contabilidad',
  // 'Valor Factura' SÍ se conserva desde que Etapa 1 y 2 empezaron a
  // entregarse -- confirmado con el usuario: para inmuebles VENDIDO de esas
  // etapas, el Valor Venta real pasa a ser esta columna (no la "Valor venta"
  // original) en cuanto se emite la factura. Ver uso en
  // dashboardRecaudoService.js / Negocios.jsx (resolverValorVenta()).
];

// Hoja Movimientos / Mov_Por_Propietario (alimenta NegocioMovimiento.datos)
const COLS_MOVIMIENTO_EXCLUIR = ['Sucursal'];

const setResumen = new Set(COLS_RESUMEN_EXCLUIR.map(norm));
const setMovimiento = new Set(COLS_MOVIMIENTO_EXCLUIR.map(norm));

const excluirEnResumen = (col) => setResumen.has(norm(col));
const excluirEnMovimiento = (col) => setMovimiento.has(norm(col));

module.exports = {
  COLS_RESUMEN_EXCLUIR,
  COLS_MOVIMIENTO_EXCLUIR,
  excluirEnResumen,
  excluirEnMovimiento,
};
