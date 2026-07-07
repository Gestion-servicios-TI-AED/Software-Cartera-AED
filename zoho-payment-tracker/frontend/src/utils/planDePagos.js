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

// Enriquece las filas con una columna "Fecha estimada" al inicio.
export function addFechaEstimada(rows, fechaBase) {
  if (!fechaBase || !rows?.length) return rows;
  const cuotaKey = detectarCuotaKey(rows);
  if (!cuotaKey) return rows;
  return rows.map((row) => {
    const fecha = fechaEstimadaCuota(fechaBase, row[cuotaKey]);
    if (!fecha) return row;
    return { 'Fecha estimada': formatFechaUTC(fecha), ...row };
  });
}
