export function formatCOP(value) {
  if (value === null || value === undefined || value === '') return '—';
  const num = typeof value === 'string' ? parseFloat(value) : value;
  if (isNaN(num)) return '—';
  return new Intl.NumberFormat('es-CO', {
    style: 'currency',
    currency: 'COP',
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(num);
}

export function formatDate(value) {
  if (!value) return '—';
  const d = new Date(value);
  if (isNaN(d.getTime())) return '—';
  return d.toLocaleDateString('es-CO', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
  });
}

export function formatDateTime(value) {
  if (!value) return '—';
  const d = new Date(value);
  if (isNaN(d.getTime())) return '—';
  return d.toLocaleString('es-CO', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

export function formatExcelDate(serial) {
  if (serial == null || serial === '') return '—';
  const num = Number(serial);
  if (isNaN(num)) {
    // Si no es un número, intentar formato de fecha estándar
    const d = new Date(serial);
    if (!isNaN(d.getTime())) return formatDate(serial);
    return serial; // Devolver tal cual si no se reconoce
  }
  
  // Excel usa los días desde el 1 de enero de 1900
  // La diferencia en días con el 1 de enero de 1970 es 25569
  const date = new Date(Math.round((num - 25569) * 86400 * 1000));
  return date.toLocaleDateString('es-CO', {
    timeZone: 'UTC',
    day: '2-digit',
    month: '2-digit',
    year: 'numeric'
  });
}
