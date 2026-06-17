// Traduce los nombres de columna "Saldo ..." a la terminología de "Abonado".
// El campo que el Excel llama "Saldo" es en realidad el dinero ABONADO a la fecha,
// no una deuda. Renombramos solo en la capa de presentación (la clave de datos
// sigue siendo "Saldo ..." en la base, para no romper el origen ni el backend).

const MES_RE = /^saldo\s+([a-záéíóú]{3,}\.?\s+\d{4})$/i;

export function etiquetaColumna(col) {
  if (col == null) return col;
  const s = String(col).trim();
  const low = s.toLowerCase();
  if (low === 'saldo actual') return 'Total abonado';
  if (low === 'saldo inicial') return 'Abonado inicial';
  const m = s.match(MES_RE);
  if (m) return `Abonado ${m[1]}`;
  return s;
}
