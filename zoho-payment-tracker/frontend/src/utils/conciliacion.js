// Conciliación de cartera: cruza el plan de pagos de Zoho (Forma de pago)
// contra los pagos reales del negocio (movimientos APLICADOS) con lógica de
// cascada acumulada: los pagos, en orden cronológico, van cubriendo las
// cuotas en el orden del plan.
import { detectarCuotaKey, fechaEstimadaCuota } from './planDePagos.js';

// Parsea un valor monetario a número. NaN para vacíos y fechas dd/mm/aaaa.
export function parseMonto(v) {
  if (v == null || v === '') return NaN;
  if (typeof v === 'number') return v;
  const s = String(v).trim();
  if (/^\d{1,2}[\/\-]\d{1,2}[\/\-]\d{2,4}$/.test(s)) return NaN; // es una fecha
  return parseFloat(s.replace(/[^0-9-]/g, ''));
}

const SKIP_KEYS = ['id', 'Created_Time', 'Modified_Time', '$line_tax', '$permissions', 'Owner'];

// Construye las cuotas del plan desde las filas del subform. Se excluyen las
// filas sin monto positivo (mismo espíritu que el filtrado de PlanSubTable).
export function construirPlan(rows, fechaBase) {
  if (!rows?.length) return [];
  const keys = [...new Set(rows.flatMap(Object.keys))].filter((k) => !SKIP_KEYS.includes(k));
  const cuotaKey = detectarCuotaKey(rows);
  // Columnas monetarias: alguna fila con valor >= 1000 (en COP todo monto real supera eso).
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
    if (isNaN(valorPlan) || valorPlan <= 0) return; // fila sin monto → no es cuota
    const etiqueta = cuotaKey ? String(row[cuotaKey] ?? `Fila ${i + 1}`) : `Fila ${i + 1}`;
    plan.push({
      etiqueta,
      valorPlan,
      fechaEstimada: cuotaKey ? fechaEstimadaCuota(fechaBase, row[cuotaKey]) : null,
    });
  });
  return plan;
}

// Pagos reales: solo APLICADOS con valor positivo, ordenados por fecha
// contable ascendente (sin fecha al final — igual cuentan en la bolsa).
export function normalizarPagos(movimientos) {
  return (movimientos || [])
    .filter((m) => String(m.datos?.Estado || '').trim().toUpperCase() === 'APLICADO')
    .map((m) => ({ fecha: m.fechaContable ? new Date(m.fechaContable) : null, valor: parseMonto(m.datos?.Valor) }))
    .filter((p) => !isNaN(p.valor) && p.valor > 0)
    .sort((a, b) => {
      if (!a.fecha && !b.fecha) return 0;
      if (!a.fecha) return 1;
      if (!b.fecha) return -1;
      return a.fecha - b.fecha;
    });
}

// Cascada acumulada. Una cuota no pagada cuya fecha estimada ya venció queda
// marcada "atrasada". fechaCubierta = fecha del pago cuyo acumulado alcanzó
// el requerido acumulado del plan hasta esa cuota.
export function conciliar(cuotasPlan, pagos) {
  const totalPagado = pagos.reduce((s, p) => s + p.valor, 0);
  let acumuladoPago = 0;
  const prefijos = pagos.map((p) => ({ fecha: p.fecha, acumulado: (acumuladoPago += p.valor) }));

  const hoy = new Date();
  let disponible = totalPagado;
  let requerido = 0;

  const cuotas = cuotasPlan.map((c) => {
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
    return { ...c, cubierto, estado, atrasada, fechaCubierta };
  });

  const totalPlan = cuotas.reduce((s, c) => s + c.valorPlan, 0);
  const enMora = cuotas.filter((c) => c.atrasada);
  const resumen = {
    totalPlan,
    totalPagado,
    porcentaje: totalPlan > 0 ? Math.round((totalPagado / totalPlan) * 100) : 0,
    cuotasPagadas: cuotas.filter((c) => c.estado === 'pagada').length,
    totalCuotas: cuotas.length,
    cuotasEnMora: enMora.length,
    montoEnMora: enMora.reduce((s, c) => s + (c.valorPlan - c.cubierto), 0),
    saldoAFavor: Math.max(0, totalPagado - totalPlan),
  };
  return { cuotas, resumen };
}
