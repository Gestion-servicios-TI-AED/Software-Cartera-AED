// Conciliación de cartera: cruza el plan de pagos de Zoho (Forma de pago)
// contra los pagos reales del negocio (movimientos APLICADOS) con lógica de
// cascada acumulada: los pagos, en orden cronológico, van cubriendo las
// cuotas en el orden del plan.
import { detectarCuotaKey, fechaEstimadaCuota } from './planDePagos.js';

// Parsea un valor monetario a número. NaN para vacíos y fechas dd/mm/aaaa.
//
// Hay dos formatos distintos en juego: los montos del plan de Zoho vienen
// formateados a la colombiana ("$ 4.877.904", el punto es separador de
// miles), mientras que el Valor de los movimientos de fiducia es un número
// plano de Excel serializado tal cual ("361446462.5", el punto SÍ es
// decimal). Se intenta primero como número plano (preserva el decimal real);
// solo si eso falla se cae al modo "quitar todo lo que no sea dígito", que
// interpreta los puntos como separadores de miles.
export function parseMonto(v) {
  if (v == null || v === '') return NaN;
  if (typeof v === 'number') return v;
  const s = String(v).trim();
  if (/^\d{1,2}[\/\-]\d{1,2}[\/\-]\d{2,4}$/.test(s)) return NaN; // es una fecha
  const plano = Number(s);
  if (!isNaN(plano)) return plano;
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

// Tipos de movimiento que representan una reversa real de pago (desistimiento,
// devolución) y por eso se incluyen sin importar su Estado: muchos de estos
// quedaron con un Estado irrecuperable tras el bug de la columna duplicada
// (ver fiduciaService.js), pero su Tipo Movimiento sí es confiable.
const TIPOS_REVERSA_SIEMPRE = ['DESISTIMIENTOS', 'DEVOLUCION MAYOR VALOR PAGADO'];

// Pagos reales: movimientos APLICADO (cualquier signo — antes se descartaban
// los negativos por error) más las reversas reconocidas de arriba, sin
// importar su Estado. Ordenados por fecha contable ascendente (sin fecha al
// final — igual cuentan en la bolsa).
export function normalizarPagos(movimientos) {
  return (movimientos || [])
    .filter((m) => {
      const estado = String(m.datos?.Estado || '').trim().toUpperCase();
      if (estado === 'APLICADO') return true;
      const tipo = String(m.datos?.['Tipo Movimiento'] || '').trim().toUpperCase();
      return TIPOS_REVERSA_SIEMPRE.includes(tipo);
    })
    .map((m) => ({ fecha: m.fechaContable ? new Date(m.fechaContable) : null, valor: parseMonto(m.datos?.Valor) }))
    .filter((p) => !isNaN(p.valor) && p.valor !== 0)
    .sort((a, b) => {
      if (!a.fecha && !b.fecha) return 0;
      if (!a.fecha) return 1;
      if (!b.fecha) return -1;
      return a.fecha - b.fecha;
    });
}

// Pagos (con su fecha y valor completos, sin prorratear) cuyo propio tramo en
// el acumulado se cruza con [desde, hasta). Un pago que cubre el final de una
// cuota y el inicio de la siguiente aparece completo en ambas — decisión
// explícita de diseño, no un bug.
//
// Limitación conocida y aceptada: si una reversa hace bajar el acumulado y un
// pago posterior vuelve a cruzar ese mismo rango numérico, ese pago posterior
// puede aparecer también en una cuota anterior a la que en verdad pertenece
// cronológicamente. Resolverlo requeriría un modelo de "dueño" por rango en
// vez de superposición numérica, fuera de alcance por ahora (ver verificación
// de este archivo, que reproduce y documenta el caso).
function pagosEnTramo(prefijos, desde, hasta) {
  let antes = 0;
  const resultado = [];
  for (const p of prefijos) {
    const lo = Math.min(antes, p.acumulado);
    const hi = Math.max(antes, p.acumulado);
    if (hi > desde && lo < hasta) {
      // Porción del pago que realmente cae dentro de esta cuota (el ancho de
      // la superposición). Con el mismo signo del pago: si es una reversa,
      // lo destinado también es negativo (consume de lo ya asignado aquí).
      const solape = Math.min(hi, hasta) - Math.max(lo, desde);
      const destinado = p.valor >= 0 ? solape : -solape;
      resultado.push({ fecha: p.fecha, valor: p.valor, destinado });
    }
    antes = p.acumulado;
  }
  return resultado;
}

// Cascada acumulada. Una cuota no pagada cuya fecha estimada ya venció queda
// marcada "atrasada". fechaCubierta = fecha del pago cuyo acumulado alcanzó
// el requerido acumulado del plan hasta esa cuota.
export function conciliar(cuotasPlan, pagos) {
  const totalPagado = pagos.reduce((s, p) => s + p.valor, 0);
  let acumuladoPago = 0;
  const prefijos = pagos.map((p) => ({ fecha: p.fecha, valor: p.valor, acumulado: (acumuladoPago += p.valor) }));

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
