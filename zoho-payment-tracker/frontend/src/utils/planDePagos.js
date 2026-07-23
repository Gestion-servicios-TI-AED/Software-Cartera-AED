// Cálculo de "Fecha estimada" para los subforms de plan de pagos de Zoho.
// fechaInicioPlanPagos es un campo de solo-fecha (medianoche UTC): toda la
// aritmética y el formateo se hacen en UTC para que la fecha mostrada no se
// corra un día en husos detrás de UTC (ej. Bogotá).

// Detecta la columna cuyo valor identifica la cuota: aquella donde alguna
// fila contiene "separaci" (p.ej. "Separación").
export function detectarCuotaKey(rows) {
  if (!rows?.length) return null;
  return (
    Object.keys(rows[0] || {}).find((k) =>
      rows.some((r) => String(r[k] || '').toLowerCase().includes('separaci'))
    ) || null
  );
}

// Fecha estimada de una cuota: "Separación" → fecha base; "N" → base + N meses.
export function fechaEstimadaCuota(fechaBase, cuotaVal) {
  if (!fechaBase) return null;
  const base = new Date(fechaBase);
  const val = String(cuotaVal || '').trim();
  if (val.toLowerCase().includes('separaci')) return base;
  const n = parseInt(val, 10);
  if (!isNaN(n) && n > 0) {
    const d = new Date(base);
    d.setUTCMonth(d.getUTCMonth() + n);
    return d;
  }
  return null;
}

export function formatFechaUTC(fecha) {
  return fecha.toLocaleDateString('es-CO', { day: '2-digit', month: '2-digit', year: 'numeric', timeZone: 'UTC' });
}

// "Saldo Contraentrega" (Forma de Pago) / "SALDO CONTRA ENTREGA" (Propuesta
// de Pago) -- misma cuota, distinto espaciado. Esa fila nunca trae fecha
// propia en Zoho (a diferencia de Separación/cuotas numeradas), así que acá
// se detecta para poder inferirle una fecha.
function esSaldoContraentrega(cuotaVal) {
  return String(cuotaVal ?? '').toLowerCase().replace(/\s+/g, '').includes('saldocontraentrega');
}

// Enriquece las filas con una columna "Fecha estimada" al inicio.
export function addFechaEstimada(rows, fechaBase) {
  if (!fechaBase || !rows?.length) return rows;
  const cuotaKey = detectarCuotaKey(rows);
  if (!cuotaKey) return rows;
  // Fecha de la última cuota real vista hasta el momento (Separación o
  // cuota numerada) -- se usa para inferir la de Saldo Contraentrega, que en
  // Zoho llega sin "Fecha_Estimada" propia: es la fecha que le sigue a esa
  // última cuota (filas de subtotal como "TOTAL CUOTA INICIAL" no la mueven,
  // porque tampoco tienen fecha propia).
  let ultimaFechaReal = null;
  return rows.map((row) => {
    let fecha = fechaEstimadaCuota(fechaBase, row[cuotaKey]);
    if (!fecha && esSaldoContraentrega(row[cuotaKey]) && ultimaFechaReal) {
      fecha = new Date(ultimaFechaReal);
      fecha.setUTCMonth(fecha.getUTCMonth() + 1);
    }
    if (fecha) ultimaFechaReal = fecha;
    if (!fecha) return row;
    return { 'Fecha estimada': formatFechaUTC(fecha), ...row };
  });
}
