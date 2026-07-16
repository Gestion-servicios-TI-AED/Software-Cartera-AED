// Puerto exacto (CommonJS) de zoho-payment-tracker/frontend/src/utils/
// conciliacion.js + planDePagos.js (ES modules) — sin cambios de
// comportamiento. El backend necesita esta misma lógica para el reporte
// Dashboard, que la corre para todo el inventario a la vez en vez de un
// negocio a la vez (que es como la usa ConciliacionSection en Negocios.jsx).

// ── Puerto de planDePagos.js ────────────────────────────────────────────────

// Detecta la columna cuyo valor identifica la cuota: aquella donde alguna
// fila contiene "separaci" (p.ej. "Separación").
function detectarCuotaKey(rows) {
  if (!rows?.length) return null;
  return (
    Object.keys(rows[0] || {}).find((k) =>
      rows.some((r) => String(r[k] || '').toLowerCase().includes('separaci'))
    ) || null
  );
}

// Fecha estimada de una cuota: "Separación" → fecha base; "N" → base + N meses.
function fechaEstimadaCuota(fechaBase, cuotaVal) {
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

// ── Puerto de conciliacion.js ────────────────────────────────────────────────

// Parsea un valor monetario a número. NaN para vacíos y fechas dd/mm/aaaa.
function parseMonto(v) {
  if (v == null || v === '') return NaN;
  if (typeof v === 'number') return v;
  const s = String(v).trim();
  if (/^\d{1,2}[\/\-]\d{1,2}[\/\-]\d{2,4}$/.test(s)) return NaN; // es una fecha
  const plano = Number(s);
  if (!isNaN(plano)) return plano;
  return parseFloat(s.replace(/[^0-9-]/g, ''));
}

const SKIP_KEYS = ['id', 'Created_Time', 'Modified_Time', '$line_tax', '$permissions', 'Owner'];

// Construye las cuotas del plan desde las filas del subform.
function construirPlan(rows, fechaBase) {
  if (!rows?.length) return [];
  const keys = [...new Set(rows.flatMap(Object.keys))].filter((k) => !SKIP_KEYS.includes(k));
  const cuotaKey = detectarCuotaKey(rows);
  const moneyKeys = keys.filter(
    (k) => k !== cuotaKey && rows.some((r) => { const n = parseMonto(r[k]); return !isNaN(n) && n >= 1000; })
  );
  const plan = [];
  rows.forEach((row, i) => {
    let valorPlan = NaN;
    for (const k of moneyKeys) {
      const n = parseMonto(row[k]);
      if (!isNaN(n) && n !== 0) { valorPlan = n; break; }
    }
    if (isNaN(valorPlan) || valorPlan <= 0) return;
    const etiqueta = cuotaKey ? String(row[cuotaKey] ?? `Fila ${i + 1}`) : `Fila ${i + 1}`;
    plan.push({
      etiqueta,
      valorPlan,
      fechaEstimada: cuotaKey ? fechaEstimadaCuota(fechaBase, row[cuotaKey]) : null,
    });
  });

  if (plan.length >= 2) {
    const last = plan[plan.length - 1];
    const prev = plan[plan.length - 2];
    if (!last.fechaEstimada && prev.fechaEstimada) {
      const d = new Date(prev.fechaEstimada);
      d.setUTCMonth(d.getUTCMonth() + 1);
      last.fechaEstimada = d;
    }
  }

  return plan;
}

// "Generado por venta unidad" no es un pago -- es el asiento que registra el
// valor total de venta del inmueble (siempre negativo, de -9M a -1.269M en
// los datos reales), y sumarlo cancela pagos reales de ese mismo negocio.
const TIPOS_EXCLUIDOS_SIEMPRE = ['GENERADO POR VENTA UNIDAD'];

// Pagos reales: todo movimiento del negocio cuenta (cualquier Tipo
// Movimiento y cualquier Estado, incluyendo null, salvo los excluidos
// arriba) -- la mayoría de tipos (AJUSTE MANUAL + y -, LEGALIZACION_APORTES,
// SUBROGACION BANCO..., etc.) nunca traen Estado "Aplicado" poblado en el
// Excel de origen, pero igual representan plata real del negocio. Ordenados
// por fecha contable ascendente (sin fecha al final).
function normalizarPagos(movimientos) {
  return (movimientos || [])
    .filter((m) => {
      const tipo = String(m.datos?.['Tipo Movimiento'] || '').trim().toUpperCase();
      return !TIPOS_EXCLUIDOS_SIEMPRE.includes(tipo);
    })
    .map((m) => ({ id: m.idMovimiento ?? null, fecha: m.fechaContable ? new Date(m.fechaContable) : null, valor: parseMonto(m.datos?.Valor) }))
    .filter((p) => !isNaN(p.valor) && p.valor !== 0)
    .sort((a, b) => {
      if (!a.fecha && !b.fecha) return 0;
      if (!a.fecha) return 1;
      if (!b.fecha) return -1;
      return a.fecha - b.fecha;
    });
}

// Pagos (con su fecha y valor completos) cuyo propio tramo en el acumulado
// se cruza con [desde, hasta).
function pagosEnTramo(prefijos, desde, hasta) {
  let antes = 0;
  const resultado = [];
  for (const p of prefijos) {
    const lo = Math.min(antes, p.acumulado);
    const hi = Math.max(antes, p.acumulado);
    if (hi > desde && lo < hasta) {
      const solape = Math.min(hi, hasta) - Math.max(lo, desde);
      const destinado = p.valor >= 0 ? solape : -solape;
      resultado.push({ id: p.id, fecha: p.fecha, valor: p.valor, destinado });
    }
    antes = p.acumulado;
  }
  return resultado;
}

// Cascada acumulada. Una cuota no pagada cuya fecha estimada ya venció queda
// marcada "atrasada".
function conciliar(cuotasPlan, pagos) {
  const totalPagado = pagos.reduce((s, p) => s + p.valor, 0);
  let acumuladoPago = 0;
  const prefijos = pagos.map((p) => ({ id: p.id, fecha: p.fecha, valor: p.valor, acumulado: (acumuladoPago += p.valor) }));

  const hoy = new Date();
  let disponible = totalPagado;
  let requerido = 0;

  const cuotas = cuotasPlan.map((c) => {
    const requeridoAntes = requerido;
    const cubierto = Math.max(0, Math.min(c.valorPlan, disponible));
    disponible -= cubierto;
    requerido += c.valorPlan;
    const estado = cubierto >= c.valorPlan ? 'pagada' : cubierto > 0 ? 'parcial' : 'pendiente';
    let fechaCubierta = null;
    if (estado === 'pagada') {
      const p = prefijos.find((x) => x.acumulado >= requerido);
      fechaCubierta = p ? p.fecha : null;
    }
    const atrasada = estado !== 'pagada' && c.fechaEstimada != null && c.fechaEstimada < hoy;
    const diasAtraso = atrasada ? Math.floor((hoy.getTime() - c.fechaEstimada.getTime()) / 86400000) : null;
    const pagosAplicados = pagosEnTramo(prefijos, requeridoAntes, requerido);
    return { ...c, cubierto, estado, atrasada, diasAtraso, fechaCubierta, pagosAplicados };
  });

  const totalPlan = cuotas.reduce((s, c) => s + c.valorPlan, 0);
  const enMora = cuotas.filter((c) => c.atrasada);
  const maxDiasAtraso = enMora.length > 0 ? Math.max(...enMora.map((c) => c.diasAtraso ?? 0)) : 0;
  const saldoContraentrega = cuotas.length > 0 ? cuotas[cuotas.length - 1] : null;
  const resumen = {
    totalPlan,
    totalPagado,
    porcentaje: totalPlan > 0 ? Math.round((totalPagado / totalPlan) * 100) : 0,
    cuotasPagadas: cuotas.filter((c) => c.estado === 'pagada').length,
    totalCuotas: cuotas.length,
    cuotasEnMora: enMora.length,
    montoEnMora: enMora.reduce((s, c) => s + (c.valorPlan - c.cubierto), 0),
    maxDiasAtraso,
    saldoAFavor: Math.max(0, totalPagado - totalPlan),
    saldoContraentrega,
  };
  return { cuotas, resumen };
}

module.exports = {
  detectarCuotaKey,
  fechaEstimadaCuota,
  parseMonto,
  construirPlan,
  normalizarPagos,
  conciliar,
};
