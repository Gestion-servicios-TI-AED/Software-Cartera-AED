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
  // Formato colombiano ("$110.499.735,00"): "." separador de miles, ","
  // separador decimal. Quitar todo lo que no fuera dígito/"-" concatenaba
  // la parte decimal con la entera (110.499.735,00 -> 11049973500, x100 de
  // más) -- confirmado en producción en 16 oportunidades (ej. Kala Torre 1
  // 2-J: Separación se leía como $11.000M en vez de $110M).
  const negativo = s.includes('-');
  const soloNumeros = s.replace(/[^0-9.,]/g, '');
  const ultimaComa = soloNumeros.lastIndexOf(',');
  const resultado = ultimaComa !== -1
    ? parseFloat(`${soloNumeros.slice(0, ultimaComa).replace(/\./g, '')}.${soloNumeros.slice(ultimaComa + 1)}`)
    : parseFloat(soloNumeros.replace(/\./g, ''));
  return negativo ? -Math.abs(resultado) : resultado;
}

const SKIP_KEYS = ['id', 'Created_Time', 'Modified_Time', '$line_tax', '$permissions', 'Owner'];

// "Saldo Contraentrega" (formaPago) / "SALDO CONTRA ENTREGA" (propuestaPago)
// -- misma cuota, distinto espaciado. Normaliza quitando espacios para
// detectarla igual en ambos subforms.
function esSaldoContraentrega(etiqueta) {
  return String(etiqueta ?? '').toLowerCase().replace(/\s+/g, '').includes('saldocontraentrega');
}

// Construye las cuotas del plan desde las filas del subform.
function construirPlan(rows, fechaBase) {
  if (!rows?.length) return [];
  const keys = [...new Set(rows.flatMap(Object.keys))].filter((k) => !SKIP_KEYS.includes(k));
  const cuotaKey = detectarCuotaKey(rows);
  // Propuesta de Pago trae dos columnas de plata en paralelo por fila:
  // Pago_Cliente (lo que ese cliente concretamente acordó pagar en esa
  // cuota -- puede ser $0 en cuotas legítimamente sin cobro porque adelantó
  // plata en otra) y Pago_Standard (la plantilla genérica del plan, sin
  // negociar). Si existe Pago_Cliente, se usa ESA columna exclusivamente
  // en todas las filas -- nunca se cae a Pago_Standard fila por fila
  // cuando Pago_Cliente da $0, porque eso mezclaba las dos columnas según
  // cuál diera cero, inflando el total del plan y dejando la cuota Saldo
  // Contraentrega en negativo al ajustarla contra Valor Venta.
  const moneyKeys = keys.includes('Pago_Cliente')
    ? ['Pago_Cliente']
    : keys.filter(
        (k) => k !== cuotaKey && rows.some((r) => { const n = parseMonto(r[k]); return !isNaN(n) && n >= 1000; })
      );
  const plan = [];
  // Fecha de la última cuota real vista en el cronograma (Separación o cuota
  // numerada, TENGA O NO monto) -- se necesita para inferirle una fecha a
  // Saldo Contraentrega cuando no trae la suya. Antes ese "prev" se leía del
  // propio array `plan` YA FILTRADO (sin las cuotas en $0), así que si el
  // cliente tenía muchas cuotas intermedias legítimamente en $0 (pagó todo
  // en la primera y el resto contraentrega), el fallback anclaba la fecha a
  // la última cuota CON MONTO en vez de la última cuota del cronograma,
  // adelantando la fecha de vencimiento años -- confirmado con un caso real
  // donde Saldo Contraentrega vencía real en 09/10/2026 (después de 19
  // cuotas mensuales en $0) pero la conciliación la mostraba vencida desde
  // 09/04/2025 (justo después de la única cuota con monto), marcándola con
  // 470 días de atraso que no eran reales.
  let ultimaFechaReal = null;
  rows.forEach((row, i) => {
    // Filas de subtotal (ej. "TOTAL CUOTA INICIAL" en Propuesta de Pago,
    // presente en el 100% de las 1649 propuestas) no son una cuota real --
    // son la suma de Separación + las cuotas anteriores, ya contadas. Sin
    // este filtro se duplicaba ese monto en el plan, lo que podía dejar la
    // última cuota (Saldo Contraentrega) en negativo al ajustarla contra
    // Valor Venta, y disparaba falsos positivos de mora en las cuotas
    // reales (el pago se consumía cubriendo esta fila fantasma).
    if (cuotaKey && String(row[cuotaKey] ?? '').toLowerCase().includes('total')) return;
    let valorPlan = NaN;
    for (const k of moneyKeys) {
      const n = parseMonto(row[k]);
      if (!isNaN(n) && n !== 0) { valorPlan = n; break; }
    }
    const fechaPropia = cuotaKey ? fechaEstimadaCuota(fechaBase, row[cuotaKey]) : null;
    if (fechaPropia) ultimaFechaReal = fechaPropia;
    if (isNaN(valorPlan) || valorPlan <= 0) {
      // La cuota Saldo Contraentrega SIEMPRE se incluye en el plan aunque
      // venga en $0 (el cliente ya pagó todo por adelantado en cuotas
      // anteriores) -- es el ancla que cierra el plan. Si se descarta como
      // cualquier otra fila sin monto, la última cuota REAL que quede (ej.
      // "Cuota 2") termina mostrándose como si fuera el Saldo Contraentrega,
      // con su fecha y su valor -- confirmado en 90 de 1868 negocios
      // (ej. Isla Laguna Torre 1 545, pagado 100% en 2 cuotas).
      if (!(cuotaKey && esSaldoContraentrega(row[cuotaKey]))) return;
      valorPlan = 0;
    }
    const etiqueta = cuotaKey ? String(row[cuotaKey] ?? `Fila ${i + 1}`) : `Fila ${i + 1}`;
    let fechaEstimada = fechaPropia;
    if (!fechaEstimada && cuotaKey && esSaldoContraentrega(row[cuotaKey]) && ultimaFechaReal) {
      const d = new Date(ultimaFechaReal);
      d.setUTCMonth(d.getUTCMonth() + 1);
      fechaEstimada = d;
    }
    plan.push({ etiqueta, valorPlan, fechaEstimada });
  });

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
