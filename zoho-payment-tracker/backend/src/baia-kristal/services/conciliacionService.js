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

// Construye las cuotas del plan desde las filas del subform. `esPlanNegociado`
// distingue el origen: true para Propuesta de Pago (el plan real que ese
// cliente negoció, con exactamente tantas filas como meses tiene su plan real)
// y false para Forma de Pago (la plantilla genérica del proyecto, con más
// filas placeholder -- Cuota 9 a 55, todas en $0 -- de las que cualquier
// cliente real necesita). Afecta solo cómo se infiere la fecha de Saldo
// Contraentrega cuando no trae la suya -- ver comentario más abajo.
function construirPlan(rows, fechaBase, { esPlanNegociado = true } = {}) {
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
    // El fallback "última cuota + 1 mes" solo es confiable en un plan
    // realmente negociado (Propuesta de Pago): ahí el número de filas
    // corresponde 1 a 1 con los meses reales de ESE cliente. En la Forma de
    // Pago genérica (cuando no hubo Propuesta, el cliente se adaptó al plan
    // original del proyecto) el número de filas es solo la capacidad máxima
    // de la plantilla -- Cuota 9 a 55, todas en $0 -- y no refleja los meses
    // reales hasta la entrega. Contarlas igual dispara Saldo Contraentrega
    // años después de la entrega real (confirmado con Nelcy Marimón González,
    // Kala Torre 2 1-G: calculaba 2031 en vez de ~2027). Sin un plan
    // negociado, es mejor dejar la fecha sin inferir -- queda pendiente de la
    // fecha de entrega configurada en Ajustes, que es la fuente confiable acá.
    if (!fechaEstimada && esPlanNegociado && cuotaKey && esSaldoContraentrega(row[cuotaKey]) && ultimaFechaReal) {
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
  const pagos = (movimientos || [])
    .filter((m) => {
      const tipo = String(m.datos?.['Tipo Movimiento'] || '').trim().toUpperCase();
      return !TIPOS_EXCLUIDOS_SIEMPRE.includes(tipo);
    })
    .map((m) => ({
      id: m.idMovimiento ?? null,
      fecha: m.fechaContable ? new Date(m.fechaContable) : null,
      valor: parseMonto(m.datos?.Valor),
      tipo: String(m.datos?.['Tipo Movimiento'] || '').trim().toUpperCase(),
    }))
    .filter((p) => !isNaN(p.valor) && p.valor !== 0)
    .sort((a, b) => {
      if (!a.fecha && !b.fecha) return 0;
      if (!a.fecha) return 1;
      if (!b.fecha) return -1;
      return a.fecha - b.fecha;
    });

  // Un DESISTIMIENTOS cancela todo lo anterior: el cliente sacó su plata, así
  // que el saldo real vuelve a $0 en ese punto. Si más adelante vuelve a
  // abonar, la conciliación debe arrancar de $0 justo después del último
  // desistimiento -- no arrastrar pagos que ya fueron devueltos. DESISTIMIENTOS
  // siempre corta (es una señal explícita, sin importar si el acumulado da
  // exactamente $0). AJUSTE MANUAL + y - en cambio se usa también para
  // abonos normales (no es exclusivo de reversar), así que solo cuenta como
  // corte cuando de verdad deja el acumulado en $0 -- si no, es un ajuste
  // más, no un reinicio. Se toma el ÚLTIMO punto de corte que aparezca en la
  // cronología. Confirmado contra datos reales: 211 negocios con
  // DESISTIMIENTOS explícito + 17 más que cancelan el acumulado vía AJUSTE
  // MANUAL. Los movimientos de antes del corte siguen intactos en el
  // historial de movimientos -- esta función solo alimenta la cascada de
  // conciliación, no filtra qué se muestra en pantalla.
  const TOLERANCIA_CANCELACION = 1; // pesos, margen de redondeo
  let acumulado = 0;
  let ultimoReinicioIdx = -1;
  pagos.forEach((p, i) => {
    acumulado += p.valor;
    if (p.tipo === 'DESISTIMIENTOS') {
      ultimoReinicioIdx = i;
    } else if (p.tipo === 'AJUSTE MANUAL + Y -' && Math.abs(acumulado) < TOLERANCIA_CANCELACION) {
      ultimoReinicioIdx = i;
    }
  });
  const vigentes = ultimoReinicioIdx >= 0 ? pagos.slice(ultimoReinicioIdx + 1) : pagos;

  return vigentes.map(({ tipo, ...resto }) => resto);
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
    // Menos de $1 pendiente se cuenta como pagada -- residuo de redondeo de
    // centavos entre el plan (Zoho) y los movimientos reales (Excel), no una
    // deuda real. Sin este margen, esas cuotas quedaban "atrasadas" para
    // siempre por deber fracciones de peso.
    const estado = c.valorPlan - cubierto < 1 ? 'pagada' : cubierto > 0 ? 'parcial' : 'pendiente';
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
