const { prisma, parseProyectoTorre, formatearProyectoTorre, parsePisoNumero, obtenerEtapaTorre, resolverProjectCode, valoresProyectoTorre, compararEtapas, esFrenteSeleccionable } = require('./inventarioNegocioService');
const { construirPlan, normalizarPagos, conciliar, parseMonto } = require('./conciliacionService');
const { obtenerFechasEntregaConfiguradas, CLAVE_TODAS } = require('./configuracionFrenteService');
const { elegirOportunidadVigente } = require('../config/estadosOportunidad');

// ── Cache en memoria del cálculo pesado ─────────────────────────────────────
// obtenerDashboardRecaudo recibe filtros distintos en cada llamada (Etapa,
// Frente, Torre, búsqueda, Solo con movimientos), pero el cálculo caro --
// construirPlan+normalizarPagos+conciliar por cada inmueble del portafolio --
// es el mismo sin importar el filtro. Se calcula una sola vez para TODO el
// portafolio sin filtrar, se cachea en memoria, y cada request solo filtra y
// reagrega sobre ese resultado ya calculado (rápido, sin volver a correr
// conciliar()). invalidarCacheDashboard() se llama desde cualquier lugar que
// cambie los datos fuente: sync de Zoho, backfill de subforms, subida de
// Fiducia, backfill de negocios, sync de inventario.
let cache = null; // { filas, valores, builtAt }
let cacheEnConstruccion = null; // Promise en vuelo -- evita reconstruir en paralelo

function invalidarCacheDashboard() {
  cache = null;
  cacheEnConstruccion = null;
}

// Resuelve, para un conjunto de InventarioItem, su Negocio y Opportunity
// vinculados -- en bloque (pocas queries, no una por inmueble). Mismo
// criterio de match que resolverNegocioIdDesdeInmueble/
// findOportunidadByReferencia (inventarioNegocioService.js), resuelto con
// mapas en JS en vez de una consulta SQL por inmueble.
async function resolverNegociosYOportunidades(inmuebles) {
  // orderBy id asc: mismo desempate que resolverNegocioIdDesdeInmueble usa
  // en su fallback por Nomenclatura (`orderBy: { id: 'asc' }, LIMIT 1`). Si
  // dos negocios comparten Nomenclatura, ese resolver se queda con el de
  // menor id -- el Map de abajo debe reproducir el mismo ganador.
  const negocios = await prisma.negocio.findMany({
    select: {
      id: true, referencia: true, datos: true, estado: true, enTramite: true, esCanje: true,
      compradores: { orderBy: { orden: 'asc' }, take: 1, select: { nombre: true } },
    },
    orderBy: { id: 'asc' },
  });
  const negocioPorReferencia = new Map(negocios.map((n) => [n.referencia, n]));
  const negocioPorNomenclatura = new Map();
  for (const n of negocios) {
    if (n.datos?.Nomenclatura == null) continue;
    const clave = String(n.datos.Nomenclatura);
    // Primer negocio (menor id, por el orderBy de arriba) con esta
    // Nomenclatura gana -- no sobrescribir si ya hay uno.
    if (!negocioPorNomenclatura.has(clave)) negocioPorNomenclatura.set(clave, n);
  }

  const negocioPorInmuebleId = new Map();
  for (const inv of inmuebles) {
    let negocio = inv.referenciaRecaudo ? negocioPorReferencia.get(inv.referenciaRecaudo) : null;
    if (!negocio && inv.datos?.C_digo_inmueble != null) {
      negocio = negocioPorNomenclatura.get(String(inv.datos.C_digo_inmueble)) ?? null;
    }
    if (negocio) negocioPorInmuebleId.set(inv.id, negocio);
  }

  const referenciasNegocio = [...new Set([...negocioPorInmuebleId.values()].map((n) => n.referencia).filter(Boolean))];
  const SELECT_OPORTUNIDAD = { id: true, referenciaRecaudo: true, stage: true, fechaInicioPlanPagos: true, formaPago: true, propuestaPago: true };
  const oportunidadesExactas = referenciasNegocio.length
    ? await prisma.opportunity.findMany({
        where: { referenciaRecaudo: { in: referenciasNegocio } },
        select: SELECT_OPORTUNIDAD,
        orderBy: { id: 'asc' },
      })
    : [];
  // Si una referenciaRecaudo tiene más de una Opportunity (raro pero real --
  // casi siempre un error de datos en Zoho: la referencia debería haberse
  // anulado en la desistida), nunca debe ganar una desistida/backout sobre
  // una vigente -- ver elegirOportunidadVigente en config/estadosOportunidad.js
  // (mismo criterio que findOportunidadByReferencia en inventarioNegocioService.js).
  const candidatasPorReferencia = new Map();
  for (const o of oportunidadesExactas) {
    if (!candidatasPorReferencia.has(o.referenciaRecaudo)) candidatasPorReferencia.set(o.referenciaRecaudo, []);
    candidatasPorReferencia.get(o.referenciaRecaudo).push(o);
  }
  const oportunidadPorReferencia = new Map();
  for (const [referencia, candidatas] of candidatasPorReferencia) {
    oportunidadPorReferencia.set(referencia, elegirOportunidadVigente(candidatas));
  }

  // Respaldo tolerante a formato (igual que findOportunidadByReferencia), solo
  // para las referencias que no calzaron exacto -- típicamente pocas.
  const sinMatch = referenciasNegocio.filter((r) => !oportunidadPorReferencia.has(r) && r.length >= 6);
  for (const referencia of sinMatch) {
    const candidatas = await prisma.opportunity.findMany({
      where: { referenciaRecaudo: { contains: referencia, mode: 'insensitive' } },
      select: SELECT_OPORTUNIDAD,
    });
    const elegida = elegirOportunidadVigente(candidatas);
    if (elegida) oportunidadPorReferencia.set(referencia, elegida);
  }

  return { negocioPorInmuebleId, oportunidadPorReferencia };
}

function mesKey(fecha) {
  return `${fecha.getUTCFullYear()}-${String(fecha.getUTCMonth() + 1).padStart(2, '0')}`;
}

// Mismo criterio que mesKey pero a nivel de día -- usado por el rango
// "Último mes" de la tendencia (Resumen Gerencial), que con granularidad
// mensual solo tenía un punto para graficar.
function diaKey(fecha) {
  return `${fecha.getUTCFullYear()}-${String(fecha.getUTCMonth() + 1).padStart(2, '0')}-${String(fecha.getUTCDate()).padStart(2, '0')}`;
}

// Acumula Esperado/Recaudado por período (mes o día, según keyFn) en los tres
// desgloses de siempre (total, Cuota Inicial, Saldo Contraentrega) -- misma
// lógica exacta para ambas granularidades, factorizada para no duplicar el
// cálculo financiero (cascada, saldo a favor, etc.) en dos sitios que se
// puedan desincronizar.
function periodoVacio() {
  return { esperado: 0, recaudado: 0, porRecaudar: 0 };
}

function acumularPorPeriodo({ cuotas, cuotasCuotaInicial, ultimaCuota, pagos, resumen, keyFn, porPeriodo, porPeriodoInicial, porPeriodoContraentrega }) {
  // "Por recaudar" de un período = suma de la Diferencia (Valor de la cuota
  // - Valor pagado) de la conciliación, de las cuotas cuya fecha ESPERADA cae
  // en ese período -- mismo campo que ve el usuario en Negocios → Conciliación
  // (columna "Diferencia"). A diferencia de Esperado/Recaudado, no depende de
  // la fecha real del pago: es el saldo HOY de las cuotas que vencían en ese
  // mes/día, sin importar cuándo (o si) se terminó de pagar.
  for (const c of cuotas) {
    if (!c.fechaEstimada) continue;
    const k = keyFn(c.fechaEstimada);
    if (!porPeriodo[k]) porPeriodo[k] = periodoVacio();
    porPeriodo[k].esperado += c.valorPlan;
    porPeriodo[k].porRecaudar += c.valorPlan - c.cubierto;
  }
  for (const p of pagos) {
    if (!p.fecha) continue;
    const k = keyFn(p.fecha);
    if (!porPeriodo[k]) porPeriodo[k] = periodoVacio();
    porPeriodo[k].recaudado += p.valor;
  }
  for (const c of cuotasCuotaInicial) {
    if (c.fechaEstimada) {
      const k = keyFn(c.fechaEstimada);
      if (!porPeriodoInicial[k]) porPeriodoInicial[k] = periodoVacio();
      porPeriodoInicial[k].esperado += c.valorPlan;
      porPeriodoInicial[k].porRecaudar += c.valorPlan - c.cubierto;
    }
    for (const p of c.pagosAplicados) {
      if (!p.fecha) continue;
      const k = keyFn(p.fecha);
      if (!porPeriodoInicial[k]) porPeriodoInicial[k] = periodoVacio();
      porPeriodoInicial[k].recaudado += p.destinado;
    }
  }
  if (ultimaCuota) {
    if (ultimaCuota.fechaEstimada) {
      const k = keyFn(ultimaCuota.fechaEstimada);
      if (!porPeriodoContraentrega[k]) porPeriodoContraentrega[k] = periodoVacio();
      porPeriodoContraentrega[k].esperado += ultimaCuota.valorPlan;
      porPeriodoContraentrega[k].porRecaudar += ultimaCuota.valorPlan - ultimaCuota.cubierto;
    }
    for (const p of ultimaCuota.pagosAplicados) {
      if (!p.fecha) continue;
      const k = keyFn(p.fecha);
      if (!porPeriodoContraentrega[k]) porPeriodoContraentrega[k] = periodoVacio();
      porPeriodoContraentrega[k].recaudado += p.destinado;
    }
  }
  // Saldo a favor (pagó de más sobre el total del plan): esa porción no la
  // cubre pagosAplicados de ninguna cuota (la cascada de conciliar() solo
  // reparte hasta completar el plan), así que sin esto Inicial + Contraentrega
  // sumaba menos que "Recaudado" (ambos) en los negocios con sobrepago. Se
  // atribuye a Contraentrega (es la plata que entra después de cubrir todo el
  // plan, incluida la última cuota).
  if (resumen.saldoAFavor > 0) {
    let acumulado = 0;
    for (const p of pagos) {
      const antes = acumulado;
      acumulado += p.valor;
      const lo = Math.min(antes, acumulado);
      const hi = Math.max(antes, acumulado);
      if (hi > resumen.totalPlan) {
        const solape = hi - Math.max(lo, resumen.totalPlan);
        const destinado = p.valor >= 0 ? solape : -solape;
        if (destinado !== 0 && p.fecha) {
          const k = keyFn(p.fecha);
          if (!porPeriodoContraentrega[k]) porPeriodoContraentrega[k] = periodoVacio();
          porPeriodoContraentrega[k].recaudado += destinado;
        }
      }
    }
  }
}

// Calcula, para TODO el inventario (sin filtrar), la fila completa de cada
// inmueble -- construirPlan+normalizarPagos+conciliar por cada uno con
// oportunidad vinculada. Es la parte cara del reporte Dashboard, por eso se
// cachea en vez de correrla en cada request.
async function construirFilasCompletas() {
  const valores = await valoresProyectoTorre();
  const fechasEntregaConfiguradas = await obtenerFechasEntregaConfiguradas();

  // Orden por Product_Name (no Project_Code): el mismo problema de datos que
  // rompe la nomenclatura (Project_Code copiado de otro inmueble, ver botón
  // "Verificar Project Code" en Ajustes) también rompía este orden -- una
  // unidad como "246" se colaba entre las "204" porque su Project_Code decía
  // "204", en vez de aparecer cerca de "245"/"247".
  const inmuebles = await prisma.$queryRaw`
    SELECT id, datos, piso, "referenciaRecaudo", estado
    FROM "InventarioItem"
    ORDER BY datos->>'Proyecto_Torre' ASC NULLS LAST, datos->>'Product_Name' ASC NULLS LAST
  `;

  const { negocioPorInmuebleId, oportunidadPorReferencia } = await resolverNegociosYOportunidades(inmuebles);

  const negocioIds = [...new Set([...negocioPorInmuebleId.values()].map((n) => n.id))];
  const movimientos = negocioIds.length
    ? await prisma.negocioMovimiento.findMany({ where: { negocioId: { in: negocioIds } } })
    : [];
  const movimientosPorNegocioId = new Map();
  for (const m of movimientos) {
    if (!movimientosPorNegocioId.has(m.negocioId)) movimientosPorNegocioId.set(m.negocioId, []);
    movimientosPorNegocioId.get(m.negocioId).push(m);
  }

  const filas = inmuebles.map((inv) => {
    const info = parseProyectoTorre(inv.datos?.Proyecto_Torre);
    const etapa = info ? obtenerEtapaTorre(inv.datos.Proyecto_Torre) : null;
    const negocio = negocioPorInmuebleId.get(inv.id) ?? null;
    const oportunidad = negocio ? oportunidadPorReferencia.get(negocio.referencia) ?? null : null;

    const porMes = {};
    // Mismo "por mes" de arriba, pero separado en Cuota Inicial (todo el plan
    // MENOS Saldo Contraentrega, ~30%) y Saldo Contraentrega (última cuota,
    // ~70%) -- para el filtro 30%/70%/ambos de la tendencia mensual del
    // Resumen Gerencial. Se llenan más abajo, junto con porMes.
    const porMesInicial = {};
    const porMesContraentrega = {};
    // Mismos tres desgloses de arriba, pero por día -- solo se usa para el
    // rango "Último mes" de la tendencia (con granularidad mensual ese rango
    // queda con un solo punto para graficar).
    const porDia = {};
    const porDiaInicial = {};
    const porDiaContraentrega = {};
    let valorInmueble = null;
    let valorCuotaInicial = null;
    let abonadoCuotaInicial = null;
    let fechaSaldoContraentrega = null;
    let valorSaldoContraentrega = null;
    let totalAbonado = null;
    let cuotasEnMora = 0;
    let montoEnMora = 0;
    let maxDiasAtraso = 0;
    // Mora contada SOLO sobre la Cuota Inicial (todo el plan MENOS Saldo
    // Contraentrega) -- usada por Cartera en Gestión, que no debe considerar
    // atrasada la última cuota (pendiente hasta escrituración, no cobranza
    // activa). Ver uso en obtenerCarteraMora().
    let cuotasEnMoraInicial = 0;
    let montoEnMoraInicial = 0;
    let maxDiasAtrasoInicial = 0;
    let esperadoAFechaInicial = null;
    let esperadoAFecha = null;
    // Saldo Contraentrega vencido -- separado de la mora de arriba porque NO
    // es cobranza activa (ver nota en cuotasEnMoraInicial): un apartado
    // propio en Cartera en Gestión para que el equipo revise, sin mezclarlo
    // con la mora real de la Cuota Inicial.
    let saldoContraentregaVencido = false;
    let pendienteSaldoContraentrega = null;
    let diasAtrasoSaldoContraentrega = null;

    // Fecha de entrega configurada en Ajustes para este inmueble -- se
    // calcula acá afuera (solo depende de Frente/Torre/Piso, no del
    // negocio) para poder usarla también cuando NO hay conciliación posible
    // (sin negocio, sin oportunidad, o sin plan de pagos en Zoho): antes
    // solo se veía en inmuebles con plan de pagos, dejando "vacíos" los
    // demás de un mismo Frente/Torre/Piso aunque la fecha SÍ estuviera
    // configurada. Prioridad: piso específico primero, si no hay, toda la
    // torre, si no hay, todo el proyecto -- son mutuamente excluyentes en
    // Ajustes, así que en la práctica nunca hay dos a la vez, pero igual se
    // resuelve en ese orden.
    const pisoNumero = parsePisoNumero(inv.piso);
    const fechaConfigurada = info
      ? (pisoNumero && fechasEntregaConfiguradas.get(`${info.proyecto}||${info.torre}||${pisoNumero}`)) ??
        fechasEntregaConfiguradas.get(`${info.proyecto}||${info.torre}||${CLAVE_TODAS}`) ??
        fechasEntregaConfiguradas.get(`${info.proyecto}||${CLAVE_TODAS}||${CLAVE_TODAS}`) ??
        null
      : null;

    if (oportunidad) {
      // Propuesta de Pago primero (es con la que se hace la conciliación real
      // del negocio), Forma de Pago como respaldo solo si no hay propuesta.
      const planRows = oportunidad.propuestaPago?.length ? oportunidad.propuestaPago : (oportunidad.formaPago || []);
      const cuotasPlan = construirPlan(planRows, oportunidad.fechaInicioPlanPagos);

      // Ajustar la última cuota (Saldo Contraentrega) para que el total del
      // plan cuadre con Valor Venta del Excel -- mismo ajuste que ya hacía
      // ConciliacionSection en Negocios.jsx (frontend) pero que este cálculo
      // de portafolio nunca replicaba, causando que Cartera en Gestión y el
      // Dashboard mostraran cuotas/mora distintas a la Conciliación real de
      // cada negocio (la última cuota es justo la que casi siempre está en
      // mora en los casos más viejos, así que la diferencia era grande ahí).
      const valorVentaKey = Object.keys(negocio.datos || {}).find((k) => k.toLowerCase() === 'valor venta');
      const valorVenta = valorVentaKey ? parseMonto(negocio.datos[valorVentaKey]) : null;
      if (valorVenta != null && !isNaN(valorVenta) && cuotasPlan.length >= 2) {
        const sumaResto = cuotasPlan.slice(0, -1).reduce((s, c) => s + c.valorPlan, 0);
        cuotasPlan[cuotasPlan.length - 1].valorPlan = valorVenta - sumaResto;
      }

      // Reemplaza la fecha estimada (inferida) de la cuota Saldo
      // Contraentrega cuando se conoce la fecha real de entrega. Mismo
      // criterio que debe aplicar ConciliacionSection en Negocios.jsx.
      if (cuotasPlan.length > 0 && fechaConfigurada) {
        cuotasPlan[cuotasPlan.length - 1].fechaEstimada = fechaConfigurada;
      }

      const pagos = normalizarPagos(movimientosPorNegocioId.get(negocio.id) || []);
      const { cuotas, resumen } = conciliar(cuotasPlan, pagos);
      // Valor del inmueble = total del plan de pagos (suma de todas las
      // cuotas), la misma variable que usa la conciliación en Negocios.jsx.
      // Si no hay cuotas (p.ej. la Opportunity no tiene Fecha Inicio Plan de
      // Pagos en Zoho), totalPlan da 0 por el reduce -- dejarlo en null en
      // vez de 0 para que se muestre "sin datos", no "vale $0".
      valorInmueble = cuotas.length > 0 ? resumen.totalPlan : null;
      // Saldo contra entrega = última cuota del plan (mismo criterio que
      // ConciliacionSection en Negocios.jsx / resumen.saldoContraentrega).
      fechaSaldoContraentrega = resumen.saldoContraentrega?.fechaEstimada ?? null;
      valorSaldoContraentrega = resumen.saldoContraentrega?.valorPlan ?? null;
      // Cuota inicial = todo el plan MENOS la última cuota (Saldo
      // Contraentrega) -- la parte que se paga antes de la entrega
      // (comercialmente ronda el 30% del valor del inmueble, pero el % real
      // depende de cómo se negoció ese plan puntual). Se deriva de la
      // conciliación real de cada negocio, no se hardcodea un 30%.
      const cuotasCuotaInicial = cuotas.slice(0, -1);
      valorCuotaInicial = cuotasCuotaInicial.length > 0
        ? cuotasCuotaInicial.reduce((s, c) => s + c.valorPlan, 0)
        : null;
      abonadoCuotaInicial = cuotasCuotaInicial.length > 0
        ? cuotasCuotaInicial.reduce((s, c) => s + c.cubierto, 0)
        : null;
      totalAbonado = resumen.totalPagado;
      cuotasEnMora = resumen.cuotasEnMora;
      montoEnMora = resumen.montoEnMora;
      maxDiasAtraso = resumen.maxDiasAtraso;
      // Recaudo esperado a la fecha = suma de las cuotas cuya fecha estimada
      // ya pasó (pagadas o no) -- lo que "ya debería" haberse recaudado según
      // el plan, para sacar el % de lo vencido sobre lo esperado (no sobre el
      // valor total del apartamento, que incluye cuotas futuras).
      const hoy = new Date();
      esperadoAFecha = cuotas
        .filter((c) => c.fechaEstimada && c.fechaEstimada <= hoy)
        .reduce((s, c) => s + c.valorPlan, 0);

      // Mismo cálculo de mora de arriba, pero excluyendo la última cuota
      // (Saldo Contraentrega) -- esa cuota queda pendiente hasta la
      // escrituración del inmueble, así que aunque su fecha estimada ya haya
      // pasado no representa mora de cobranza activa (a veces "atrasada" por
      // años). Cartera en Gestión usa estos campos en vez de los de arriba.
      const enMoraInicial = cuotasCuotaInicial.filter((c) => c.atrasada);
      cuotasEnMoraInicial = enMoraInicial.length;
      montoEnMoraInicial = enMoraInicial.reduce((s, c) => s + (c.valorPlan - c.cubierto), 0);
      maxDiasAtrasoInicial = enMoraInicial.length > 0 ? Math.max(...enMoraInicial.map((c) => c.diasAtraso ?? 0)) : 0;
      esperadoAFechaInicial = cuotasCuotaInicial
        .filter((c) => c.fechaEstimada && c.fechaEstimada <= hoy)
        .reduce((s, c) => s + c.valorPlan, 0);

      // Saldo Contraentrega vencido: fecha estimada ya pasada y todavía con
      // saldo real por cubrir (> $1.000, para no contar como "vencido" un
      // negocio que ya pagó todo salvo un residuo de redondeo de centavos).
      const sce = resumen.saldoContraentrega;
      if (sce?.atrasada) {
        const pendiente = Math.max(0, sce.valorPlan - sce.cubierto);
        if (pendiente > 1000) {
          saldoContraentregaVencido = true;
          pendienteSaldoContraentrega = pendiente;
          diasAtrasoSaldoContraentrega = sce.diasAtraso;
        }
      }

      const ultimaCuota = cuotas[cuotas.length - 1];
      const paramsAcumular = { cuotas, cuotasCuotaInicial, ultimaCuota, pagos, resumen };
      acumularPorPeriodo({
        ...paramsAcumular, keyFn: mesKey,
        porPeriodo: porMes, porPeriodoInicial: porMesInicial, porPeriodoContraentrega: porMesContraentrega,
      });
      acumularPorPeriodo({
        ...paramsAcumular, keyFn: diaKey,
        porPeriodo: porDia, porPeriodoInicial: porDiaInicial, porPeriodoContraentrega: porDiaContraentrega,
      });
    }

    // Respaldo cuando no hay conciliación posible (sin negocio, sin
    // oportunidad vinculada, o la oportunidad no tiene plan de pagos en
    // Zoho): usar el precio de lista del inmueble (Unit_Price de Zoho) en
    // vez de dejarlo vacío. Cubre 1924 de 1936 inmuebles -- no reemplaza el
    // valor de la conciliación cuando SÍ existe, solo llena el hueco.
    if (valorInmueble == null) {
      const precio = Number(inv.datos?.Unit_Price);
      if (!isNaN(precio) && precio > 0) valorInmueble = precio;
    }

    // Igual para la fecha de entrega: si no hay conciliación (por eso sigue
    // en null acá) pero SÍ hay una fecha configurada en Ajustes para este
    // Frente/Torre/Piso, mostrarla igual -- así un Frente completo se ve
    // con la misma fecha sin importar si cada inmueble tiene o no plan de
    // pagos en Zoho.
    if (fechaSaldoContraentrega == null && fechaConfigurada) {
      fechaSaldoContraentrega = fechaConfigurada;
    }

    return {
      id: inv.id,
      etapa,
      frente: info ? info.proyecto : null,
      torre: info ? info.torre : null,
      // nomenclatura: string completo "Frente Torre N unidad" -- se sigue
      // armando desde Product_Name (siempre propio del registro, nunca
      // duplicado dentro de la misma torre) en vez de confiar en
      // Project_Code -- Zoho trae Project_Code copiado por error de otro
      // inmueble en 244 casos (ver botón "Verificar Project Code" en
      // Ajustes), lo que hacía que dos unidades distintas se mostraran con
      // la misma nomenclatura acá. resolverProjectCode() sigue siendo el
      // respaldo para los pocos casos sin Product_Name o Proyecto_Torre.
      // Se mantiene completo (no solo la unidad) para que la búsqueda por
      // texto siga encontrando "Isla Laguna Torre 1 101" -- la tabla
      // muestra por separado solo la unidad (Product_Name) en su propia
      // columna, ver `unidad` abajo.
      nomenclatura: (info && inv.datos?.Product_Name)
        ? `${formatearProyectoTorre(info)} ${inv.datos.Product_Name}`
        : resolverProjectCode(inv.datos),
      // Solo la unidad (ej. "101"), para la columna Nomenclatura en pantalla
      // -- Frente/Torre ya tienen sus propias columnas, repetirlos ahí era
      // redundante.
      unidad: inv.datos?.Product_Name ?? null,
      valorInmueble,
      valorCuotaInicial,
      abonadoCuotaInicial,
      fechaSaldoContraentrega,
      valorSaldoContraentrega,
      totalAbonado,
      opportunityId: oportunidad?.id ?? null,
      // Datos de mora -- mismo criterio que la Conciliación de Negocios.jsx
      // (plan de pagos de Zoho vs. movimientos reales), agregado acá para el
      // reporte de Cartera en Gestión.
      cuotasEnMora,
      montoEnMora,
      maxDiasAtraso,
      esperadoAFecha,
      cuotasEnMoraInicial,
      montoEnMoraInicial,
      maxDiasAtrasoInicial,
      esperadoAFechaInicial,
      saldoContraentregaVencido,
      pendienteSaldoContraentrega,
      diasAtrasoSaldoContraentrega,
      // Identidad del negocio -- para el listado de Cartera en Gestión.
      negocioId: negocio?.id ?? null,
      referencia: negocio?.referencia ?? null,
      comprador: negocio?.compradores?.[0]?.nombre ?? null,
      estado: negocio?.estado ?? null,
      // Marcado manual desde Cartera en Gestión (clic derecho) -- ver
      // obtenerCarteraMora() para cómo afecta el filtro/exclusión.
      enTramite: negocio?.enTramite ?? false,
      esCanje: negocio?.esCanje ?? false,
      // Estado propio del inmueble en Inventario (InventarioItem.estado,
      // sincronizado del Producto de Zoho) -- vocabulario distinto al estado
      // del Negocio/oportunidad de arriba. Se usa SOLO para las tarjetas
      // Inmuebles disponibles/vendidos de Resumen Gerencial.
      estadoInventario: inv.estado ?? null,
      // Campo interno, no se expone en la respuesta -- resuelve el filtro
      // "Solo con movimientos" sin tener que recorrer movimientos otra vez.
      _tieneMovimientos: !!negocio && (movimientosPorNegocioId.get(negocio.id)?.length ?? 0) > 0,
      porMes,
      porMesInicial,
      porMesContraentrega,
      porDia,
      porDiaInicial,
      porDiaContraentrega,
    };
  });

  return { filas, valores };
}

async function obtenerCache() {
  if (cache) return cache;
  if (!cacheEnConstruccion) {
    cacheEnConstruccion = construirFilasCompletas()
      .then((resultado) => {
        cache = { ...resultado, builtAt: Date.now() };
        cacheEnConstruccion = null;
        return cache;
      })
      .catch((err) => {
        cacheEnConstruccion = null;
        throw err;
      });
  }
  return cacheEnConstruccion;
}

// Ordenamiento de 3 estados por encabezado (asc → desc → sin ordenar) para
// el Dashboard -- mismo criterio que ordenarCarteraMora(). Sin orden
// explícito, se deja el orden que ya trae la consulta (Product_Name).
const CAMPOS_ORDENABLES_DASHBOARD = new Set([
  'etapa', 'frente', 'torre', 'unidad', 'valorInmueble', 'valorCuotaInicial', 'abonadoCuotaInicial',
  'totalAbonado', 'pendienteRecaudar', 'cuotasEnMora', 'montoEnMora',
  'fechaSaldoContraentrega', 'valorSaldoContraentrega',
]);
const CAMPOS_NUMERICOS_DASHBOARD = new Set([
  'valorInmueble', 'valorCuotaInicial', 'abonadoCuotaInicial', 'totalAbonado', 'pendienteRecaudar',
  'cuotasEnMora', 'montoEnMora', 'valorSaldoContraentrega',
]);

function ordenarDashboard(filas, sortBy, sortDir) {
  if (!CAMPOS_ORDENABLES_DASHBOARD.has(sortBy) || (sortDir !== 'asc' && sortDir !== 'desc')) {
    return filas;
  }
  const dir = sortDir === 'asc' ? 1 : -1;
  return [...filas].sort((a, b) => {
    let va = a[sortBy];
    let vb = b[sortBy];
    // No es un campo directo -- se calcula igual que en la columna en pantalla.
    if (sortBy === 'pendienteRecaudar') {
      va = (a.valorInmueble != null && a.totalAbonado != null) ? Math.max(0, a.valorInmueble - a.totalAbonado) : null;
      vb = (b.valorInmueble != null && b.totalAbonado != null) ? Math.max(0, b.valorInmueble - b.totalAbonado) : null;
    }
    // Nulos siempre al final, sin importar la dirección.
    if (va == null && vb == null) return 0;
    if (va == null) return 1;
    if (vb == null) return -1;

    if (sortBy === 'etapa') return dir * compararEtapas(va, vb);
    if (sortBy === 'fechaSaldoContraentrega') return dir * (new Date(va) - new Date(vb));
    if (CAMPOS_NUMERICOS_DASHBOARD.has(sortBy)) return dir * (va - vb);
    return dir * String(va).localeCompare(String(vb), 'es', { numeric: true, sensitivity: 'base' });
  });
}

// Reporte Dashboard: plan de pagos vs. recaudado, por mes, para todo el
// inventario que cumple los filtros (no solo la página actual -- los totales
// necesitan el conjunto filtrado completo, sin importar la paginación). El
// cálculo pesado por inmueble sale del cache (ver arriba); aquí solo se
// filtra, pagina y reagregan totales en memoria.
async function obtenerDashboardRecaudo({ search, etapa, frente, torre, conMovimientos, sortBy, sortDir, page, limit }) {
  const { filas: todasLasFilas, valores } = await obtenerCache();

  let filas = todasLasFilas;
  if (search) {
    const s = search.toLowerCase();
    filas = filas.filter((f) =>
      f.nomenclatura?.toLowerCase().includes(s) ||
      `${f.frente ?? ''} ${f.torre ?? ''}`.toLowerCase().includes(s)
    );
  }
  if (etapa) filas = filas.filter((f) => f.etapa === etapa);
  if (frente && torre) filas = filas.filter((f) => f.frente === frente && f.torre === torre);
  else if (frente) filas = filas.filter((f) => f.frente === frente);
  if (conMovimientos === 'true') filas = filas.filter((f) => f._tieneMovimientos);
  filas = ordenarDashboard(filas, sortBy, sortDir);

  // Totales del subconjunto filtrado -- reagregar es barato (solo sumar lo
  // que ya está calculado en cada fila, no volver a correr conciliar()).
  const mesesSet = new Set();
  const totalesPorMes = new Map();
  const totalesPorMesInicial = new Map();
  const totalesPorMesContraentrega = new Map();
  const totalesPorEtapa = new Map();
  // Mismo desglose de arriba pero por día -- solo lo consume el rango
  // "Último mes" de la tendencia (Resumen Gerencial).
  const diasSet = new Set();
  const totalesPorDia = new Map();
  const totalesPorDiaInicial = new Map();
  const totalesPorDiaContraentrega = new Map();
  // Totales de las columnas fijas monetarias (para la fila de totales del
  // <tfoot>, igual que ya se hace por mes) -- mismo criterio de "pendiente
  // por recaudar" que la columna en pantalla (Math.max(0, valor - abonado)).
  const totalesColumnasFijas = {
    valorInmueble: 0, valorCuotaInicial: 0, abonadoCuotaInicial: 0,
    valorSaldoContraentrega: 0, totalAbonado: 0, pendienteRecaudar: 0,
    cuotasEnMora: 0, montoEnMora: 0,
    // KPIs de gerencial: mismo criterio de "flotar en 0 por fila antes de
    // sumar" que pendienteRecaudar de arriba, para no dejar que un negocio
    // sobrepagado (saldo a favor) esconda la deuda real de otro negocio.
    pendienteContraentrega: 0, recaudadoContraentrega: 0,
    cuotasEnMoraInicial: 0, montoEnMoraInicial: 0,
    // "Disponible" = sin negocio vinculado o con estado LIBRE (aún no
    // vendido) -- valor de lista (valorInmueble/Unit_Price) de lo que queda
    // por vender. "Vendidos" = estado exactamente VENDIDO (no incluye
    // etapas posteriores como escrituración, a propósito).
    valorDisponible: 0, cantidadDisponible: 0,
    valorVendidos: 0, cantidadVendidos: 0,
  };
  for (const f of filas) {
    if (f.valorInmueble != null) totalesColumnasFijas.valorInmueble += f.valorInmueble;
    if (f.valorCuotaInicial != null) totalesColumnasFijas.valorCuotaInicial += f.valorCuotaInicial;
    if (f.abonadoCuotaInicial != null) totalesColumnasFijas.abonadoCuotaInicial += f.abonadoCuotaInicial;
    if (f.valorSaldoContraentrega != null) totalesColumnasFijas.valorSaldoContraentrega += f.valorSaldoContraentrega;
    if (f.totalAbonado != null) totalesColumnasFijas.totalAbonado += f.totalAbonado;
    if (f.valorInmueble != null && f.totalAbonado != null) {
      totalesColumnasFijas.pendienteRecaudar += Math.max(0, f.valorInmueble - f.totalAbonado);
    }
    totalesColumnasFijas.cuotasEnMora += f.cuotasEnMora ?? 0;
    totalesColumnasFijas.montoEnMora += f.montoEnMora ?? 0;
    totalesColumnasFijas.cuotasEnMoraInicial += f.cuotasEnMoraInicial ?? 0;
    totalesColumnasFijas.montoEnMoraInicial += f.montoEnMoraInicial ?? 0;

    // Saldo Pendiente Contraentrega: lo que aún falta de la última cuota,
    // usando lo abonado hacia esa parte (lo que sobra después de cubrir la
    // Cuota Inicial) -- consistente con la cascada de conciliar(). Cuando el
    // plan tiene una sola cuota (todo es Saldo Contraentrega, sin Cuota
    // Inicial separada) abonadoCuotaInicial es null -- tratarlo como 0, no
    // saltar la fila, porque en ese caso el 100% de lo abonado va hacia acá.
    if (f.valorSaldoContraentrega != null && f.totalAbonado != null) {
      const abonadoHaciaContraentrega = f.totalAbonado - (f.abonadoCuotaInicial ?? 0);
      totalesColumnasFijas.pendienteContraentrega += Math.max(0, f.valorSaldoContraentrega - abonadoHaciaContraentrega);
      // Recaudado real hacia el 70%, tope en el valor de esa cuota (lo que
      // sobrepasa el plan es saldo a favor, no "recaudado contraentrega").
      totalesColumnasFijas.recaudadoContraentrega += Math.min(Math.max(0, abonadoHaciaContraentrega), f.valorSaldoContraentrega);
    }

    // Disponible vs. Vendidos -- según el estado propio del inmueble en
    // Inventario (Vendido/Reservado/Disponible/Separado/Stand-By/Pend
    // Revision/VIP), NO el estado del Negocio/oportunidad. Vendido y VIP
    // cuentan como vendidos; el resto (incluye null, por si acaso) como
    // disponible -- confirmado con el usuario, cubre el 100% del inventario.
    if (f.estadoInventario === 'Vendido' || f.estadoInventario === 'VIP') {
      if (f.valorInmueble != null) totalesColumnasFijas.valorVendidos += f.valorInmueble;
      totalesColumnasFijas.cantidadVendidos += 1;
    } else {
      if (f.valorInmueble != null) totalesColumnasFijas.valorDisponible += f.valorInmueble;
      totalesColumnasFijas.cantidadDisponible += 1;
    }

    for (const [mes, v] of Object.entries(f.porMes)) {
      mesesSet.add(mes);
      if (!totalesPorMes.has(mes)) totalesPorMes.set(mes, periodoVacio());
      const t = totalesPorMes.get(mes);
      t.esperado += v.esperado;
      t.recaudado += v.recaudado;
      t.porRecaudar += v.porRecaudar ?? 0;

      if (f.etapa != null) {
        if (!totalesPorEtapa.has(f.etapa)) totalesPorEtapa.set(f.etapa, { esperado: 0, recaudado: 0 });
        const te = totalesPorEtapa.get(f.etapa);
        te.esperado += v.esperado;
        te.recaudado += v.recaudado;
      }
    }
    // Mismo desglose de arriba, pero para Cuota Inicial y Saldo Contraentrega
    // por separado -- filtro 30%/70%/ambos de la tendencia mensual.
    for (const [mes, v] of Object.entries(f.porMesInicial)) {
      mesesSet.add(mes);
      if (!totalesPorMesInicial.has(mes)) totalesPorMesInicial.set(mes, periodoVacio());
      const t = totalesPorMesInicial.get(mes);
      t.esperado += v.esperado;
      t.recaudado += v.recaudado;
      t.porRecaudar += v.porRecaudar ?? 0;
    }
    for (const [mes, v] of Object.entries(f.porMesContraentrega)) {
      mesesSet.add(mes);
      if (!totalesPorMesContraentrega.has(mes)) totalesPorMesContraentrega.set(mes, periodoVacio());
      const t = totalesPorMesContraentrega.get(mes);
      t.esperado += v.esperado;
      t.recaudado += v.recaudado;
      t.porRecaudar += v.porRecaudar ?? 0;
    }

    // Mismos tres desgloses de arriba, pero por día (rango "Último mes").
    for (const [dia, v] of Object.entries(f.porDia)) {
      diasSet.add(dia);
      if (!totalesPorDia.has(dia)) totalesPorDia.set(dia, periodoVacio());
      const t = totalesPorDia.get(dia);
      t.esperado += v.esperado;
      t.recaudado += v.recaudado;
      t.porRecaudar += v.porRecaudar ?? 0;
    }
    for (const [dia, v] of Object.entries(f.porDiaInicial)) {
      diasSet.add(dia);
      if (!totalesPorDiaInicial.has(dia)) totalesPorDiaInicial.set(dia, periodoVacio());
      const t = totalesPorDiaInicial.get(dia);
      t.esperado += v.esperado;
      t.recaudado += v.recaudado;
      t.porRecaudar += v.porRecaudar ?? 0;
    }
    for (const [dia, v] of Object.entries(f.porDiaContraentrega)) {
      diasSet.add(dia);
      if (!totalesPorDiaContraentrega.has(dia)) totalesPorDiaContraentrega.set(dia, periodoVacio());
      const t = totalesPorDiaContraentrega.get(dia);
      t.esperado += v.esperado;
      t.recaudado += v.recaudado;
      t.porRecaudar += v.porRecaudar ?? 0;
    }
  }
  const meses = [...mesesSet].sort();
  const totales = Object.fromEntries(meses.map((m) => [m, totalesPorMes.get(m)]));
  const totalesInicial = Object.fromEntries(meses.map((m) => [m, totalesPorMesInicial.get(m) ?? periodoVacio()]));
  const totalesContraentrega = Object.fromEntries(meses.map((m) => [m, totalesPorMesContraentrega.get(m) ?? periodoVacio()]));
  const etapasOrdenadas = [...totalesPorEtapa.keys()].sort(compararEtapas);
  const totalesEtapa = Object.fromEntries(etapasOrdenadas.map((e) => [e, totalesPorEtapa.get(e)]));

  const dias = [...diasSet].sort();
  const totalesDia = Object.fromEntries(dias.map((d) => [d, totalesPorDia.get(d)]));
  const totalesDiaInicial = Object.fromEntries(dias.map((d) => [d, totalesPorDiaInicial.get(d) ?? periodoVacio()]));
  const totalesDiaContraentrega = Object.fromEntries(dias.map((d) => [d, totalesPorDiaContraentrega.get(d) ?? periodoVacio()]));

  const total = filas.length;
  const pageNum = Math.max(1, page);
  const limitNum = Math.max(1, limit);
  // porMesInicial/porMesContraentrega SÍ se mandan por fila (a diferencia de
  // porDia*, que nadie en el frontend usa a nivel de fila) -- las necesita el
  // filtro 30%/70%/Ambos de Dashboard (Plan vs. Recaudo) para recalcular las
  // columnas mensuales de cada inmueble sin tener que pedir los datos otra
  // vez al servidor cada vez que alguien cambia el filtro.
  const data = filas
    .slice((pageNum - 1) * limitNum, pageNum * limitNum)
    .map(({ _tieneMovimientos, porDia, porDiaInicial, porDiaContraentrega, ...fila }) => fila);

  return {
    data,
    meses,
    totales,
    totalesInicial,
    totalesContraentrega,
    dias,
    totalesDia,
    totalesDiaInicial,
    totalesDiaContraentrega,
    totalesColumnasFijas,
    totalesPorEtapa: totalesEtapa,
    pagination: { total, page: pageNum, limit: limitNum, totalPages: Math.ceil(total / limitNum) },
    etapasDisponibles: [...valores.porEtapa.keys()].sort(compararEtapas),
    frentesDisponibles: [...valores.porFrente.keys()].filter(esFrenteSeleccionable).sort(),
    frentesPorEtapa: valores.frentesPorEtapa,
    torresPorFrente: valores.torresPorFrente,
    torresPorEtapaFrente: valores.torresPorEtapaFrente,
  };
}

// Cartera en Gestión: negocios con al menos una cuota atrasada del plan de
// pagos de Zoho -- mismo concepto que la hoja "CARTERA EN GESTIÓN" que trae
// la fiduciaria (cuotas en mora, días de atraso, valor vencido), pero
// calculado en vivo con nuestra propia conciliación en vez de importar un
// Excel. Reutiliza el mismo cache que el reporte de recaudo (misma parte
// cara: construirPlan+normalizarPagos+conciliar por inmueble).
// Mismos rangos de antigüedad que traían las hojas por torre del Excel de
// Bancolombia (6-30, 31-60, 61-90, más de 90 días), más un rango 1-5 que
// separaba la hoja RESUMEN. Se agrupa por negocio usando su días de atraso
// más alto (maxDiasAtraso) -- si un negocio debe varias cuotas en mora a la
// vez, el monto completo va al rango de la más vencida, no repartido por
// cuota individual (el Excel sí lo hacía cuota por cuota; acá no se guarda
// el detalle de cada cuota en el cache, solo el agregado por negocio).
const RANGOS_MORA = [
  { key: '1-5', label: '1 a 5 días', min: 1, max: 5 },
  { key: '6-30', label: '6 a 30 días', min: 6, max: 30 },
  { key: '31-60', label: '31 a 60 días', min: 31, max: 60 },
  { key: '61-90', label: '61 a 90 días', min: 61, max: 90 },
  { key: '90+', label: 'Más de 90 días', min: 91, max: Infinity },
];

function claveRangoMora(dias) {
  return (RANGOS_MORA.find((r) => dias >= r.min && dias <= r.max) ?? RANGOS_MORA[RANGOS_MORA.length - 1]).key;
}

// Ordenamiento de 3 estados por encabezado (asc → desc → sin ordenar) para
// la tabla de Cartera en Gestión. `etapa` usa compararEtapas (mismo criterio
// que el resto del archivo para ese campo); el resto de campos de texto usa
// localeCompare con `numeric: true` para que columnas como Torre/Nomenclatura
// ordenen "2" antes que "10" en vez de alfabéticamente puro.
const CAMPOS_ORDENABLES_MORA = new Set([
  'etapa', 'frente', 'torre', 'unidad', 'referencia', 'comprador', 'estado',
  'valorInmueble', 'cuotasEnMora', 'maxDiasAtraso', 'montoEnMora', 'pctEnMora',
  'fechaSaldoContraentrega',
]);
const CAMPOS_NUMERICOS_MORA = new Set(['valorInmueble', 'cuotasEnMora', 'maxDiasAtraso', 'montoEnMora', 'pctEnMora']);

function ordenarCarteraMora(filas, sortBy, sortDir) {
  if (!CAMPOS_ORDENABLES_MORA.has(sortBy) || (sortDir !== 'asc' && sortDir !== 'desc')) {
    // Sin orden explícito: días de atraso descendente (el más urgente
    // primero) -- comportamiento por defecto de siempre.
    return [...filas].sort((a, b) => b.maxDiasAtraso - a.maxDiasAtraso);
  }
  const dir = sortDir === 'asc' ? 1 : -1;
  return [...filas].sort((a, b) => {
    const va = a[sortBy];
    const vb = b[sortBy];
    // Nulos siempre al final, sin importar la dirección -- "sin dato" no es
    // ni el mayor ni el menor valor real.
    if (va == null && vb == null) return 0;
    if (va == null) return 1;
    if (vb == null) return -1;

    if (sortBy === 'etapa') return dir * compararEtapas(va, vb);
    if (sortBy === 'fechaSaldoContraentrega') return dir * (new Date(va) - new Date(vb));
    if (CAMPOS_NUMERICOS_MORA.has(sortBy)) return dir * (va - vb);
    return dir * String(va).localeCompare(String(vb), 'es', { numeric: true, sensitivity: 'base' });
  });
}

async function obtenerCarteraMora({ search, etapa, frente, torre, rango, vista, tramite, sortBy, sortDir, page, limit }) {
  const { filas: filasCache, valores } = await obtenerCache();

  // Canje: el comprador está aportando otra cosa a cambio del apartamento
  // (no es una deuda real), así que nunca suma a la cartera -- salvo que el
  // usuario pida explícitamente ver solo los canjes (`tramite === 'canje'`).
  // Se filtra ACÁ, antes de todo lo demás (conteos incluidos), para que
  // ninguna suma/tarjeta de la vista "Todos" los cuente por accidente.
  const todasLasFilas = tramite === 'canje'
    ? filasCache.filter((f) => f.esCanje)
    : filasCache.filter((f) => !f.esCanje);

  // Conteo de cada vista sobre TODO el portafolio (sin los filtros de
  // búsqueda/etapa/frente/torre de abajo, pero sí con el filtro canje/trámite
  // de arriba) -- se devuelve siempre, sin importar cuál vista se pidió, para
  // poder mostrar la cantidad en el botón de la vista que NO está activa (el
  // usuario la ve sin tener que cambiarse).
  const conteos = {
    inicial: todasLasFilas.filter((f) => f.cuotasEnMoraInicial > 0).length,
    contraentrega: todasLasFilas.filter((f) => f.saldoContraentregaVencido).length,
  };

  // Dos vistas sobre el mismo cache, seleccionadas por `vista`:
  //  - 'inicial' (default): mora de la Cuota Inicial (el plan completo MENOS
  //    Saldo Contraentrega) -- la cobranza activa real.
  //  - 'contraentrega': negocios cuyo Saldo Contraentrega (la cuota final,
  //    ~70%, pendiente hasta escrituración) ya venció -- apartado propio
  //    porque NO es cobranza activa de la misma forma, pero el equipo igual
  //    quiere poder revisarlos sin que se mezclen con la mora real de arriba.
  // En ambos casos se remapean los campos calculados en
  // construirFilasCompletas() sobre los nombres de siempre (cuotasEnMora,
  // montoEnMora, maxDiasAtraso, esperadoAFecha) para que el resto de esta
  // función y el frontend (CarteraMora.jsx) no necesiten saber la diferencia.
  let filas = vista === 'contraentrega'
    ? todasLasFilas
        .filter((f) => f.saldoContraentregaVencido)
        .map((f) => ({
          ...f,
          cuotasEnMora: 1,
          montoEnMora: f.pendienteSaldoContraentrega,
          maxDiasAtraso: f.diasAtrasoSaldoContraentrega ?? 0,
          esperadoAFecha: f.valorSaldoContraentrega ?? 0,
        }))
    : todasLasFilas
        .filter((f) => f.cuotasEnMoraInicial > 0)
        .map((f) => ({
          ...f,
          cuotasEnMora: f.cuotasEnMoraInicial,
          montoEnMora: f.montoEnMoraInicial,
          maxDiasAtraso: f.maxDiasAtrasoInicial,
          esperadoAFecha: f.esperadoAFechaInicial,
        }));
  if (search) {
    const s = search.toLowerCase();
    filas = filas.filter((f) =>
      f.nomenclatura?.toLowerCase().includes(s) ||
      f.comprador?.toLowerCase().includes(s) ||
      f.referencia?.toLowerCase().includes(s) ||
      `${f.frente ?? ''} ${f.torre ?? ''}`.toLowerCase().includes(s)
    );
  }
  // "canje" ya se resolvió arriba (excluido de todasLasFilas salvo que sea
  // justo lo que se pidió ver). En_trámite/no_en_trámite es un filtro más
  // fino sobre lo que queda.
  if (tramite === 'en_tramite') filas = filas.filter((f) => f.enTramite);
  else if (tramite === 'no_en_tramite') filas = filas.filter((f) => !f.enTramite);
  if (etapa) filas = filas.filter((f) => f.etapa === etapa);
  if (frente && torre) filas = filas.filter((f) => f.frente === frente && f.torre === torre);
  else if (frente) filas = filas.filter((f) => f.frente === frente);

  // Rangos de antigüedad calculados sobre el conjunto YA filtrado por
  // búsqueda/etapa/frente/torre, pero SIN aplicar todavía el filtro de rango
  // -- así el usuario ve el tamaño de cada balde aunque ya haya elegido uno.
  const porRangoMoraMap = new Map(RANGOS_MORA.map((r) => [r.key, { count: 0, monto: 0 }]));
  for (const f of filas) {
    const b = porRangoMoraMap.get(claveRangoMora(f.maxDiasAtraso));
    b.count += 1;
    b.monto += f.montoEnMora;
  }
  const porRangoMora = RANGOS_MORA.map((r) => ({ rango: r.key, label: r.label, ...porRangoMoraMap.get(r.key) }));

  if (rango) filas = filas.filter((f) => claveRangoMora(f.maxDiasAtraso) === rango);

  const totalCuotasEnMora = filas.reduce((s, f) => s + f.cuotasEnMora, 0);
  const totalMontoEnMora = filas.reduce((s, f) => s + f.montoEnMora, 0);
  // % de lo que ya debería estar recaudado (según el plan, a la fecha de
  // hoy) que está vencido -- no sobre el valor total del apartamento, que
  // incluye cuotas futuras que todavía no le tocaba pagar.
  const totalEsperadoAFecha = filas.reduce((s, f) => s + (f.esperadoAFecha ?? 0), 0);
  const pctMoraPortafolio = totalEsperadoAFecha > 0 ? (totalMontoEnMora / totalEsperadoAFecha) * 100 : null;

  // pctEnMora se calcula antes de ordenar (no solo en la página final) para
  // que se pueda ordenar por esa columna igual que las demás.
  filas = filas.map((f) => ({
    ...f,
    pctEnMora: f.esperadoAFecha > 0 ? (f.montoEnMora / f.esperadoAFecha) * 100 : null,
  }));
  filas = ordenarCarteraMora(filas, sortBy, sortDir);

  const total = filas.length;
  const pageNum = Math.max(1, page);
  const limitNum = Math.max(1, limit);
  const data = filas
    .slice((pageNum - 1) * limitNum, pageNum * limitNum)
    .map(({
      _tieneMovimientos, porMes, porMesInicial, porMesContraentrega,
      porDia, porDiaInicial, porDiaContraentrega, esperadoAFecha,
      cuotasEnMoraInicial, montoEnMoraInicial, maxDiasAtrasoInicial, esperadoAFechaInicial,
      saldoContraentregaVencido, pendienteSaldoContraentrega, diasAtrasoSaldoContraentrega,
      ...fila
    }) => fila);

  return {
    data,
    resumen: { negociosEnMora: total, totalCuotasEnMora, totalMontoEnMora, totalEsperadoAFecha, pctMoraPortafolio },
    conteos,
    porRangoMora,
    pagination: { total, page: pageNum, limit: limitNum, totalPages: Math.ceil(total / limitNum) },
    etapasDisponibles: [...valores.porEtapa.keys()].sort(compararEtapas),
    frentesDisponibles: [...valores.porFrente.keys()].filter(esFrenteSeleccionable).sort(),
    frentesPorEtapa: valores.frentesPorEtapa,
    torresPorFrente: valores.torresPorFrente,
    torresPorEtapaFrente: valores.torresPorEtapaFrente,
  };
}

// ── Resumen Gerencial: "Consolidado de Cartera" por Etapa ───────────────────
// Réplica en vivo del Excel manual "CONSOLIDADO DE CARTERA" que Gerencia arma
// cada mes -- misma agrupación por Etapa que obtenerEtapaTorre(), pero
// calculada sobre la conciliación real (cache de construirFilasCompletas())
// en vez de copiarse a mano cada mes. Columnas EXACTAS pedidas (ni una más):
// Uni. Totales/Vendidas Fidu/Vendidas CRM/Disponible, Valor Total Venta/
// Ventas Fiduciaria/Cuotas Iniciales/Uni. Disponibles, VR. Total Recaudado,
// % Recaudo/Ventas, % Recaudo/Cuota Inicial, Cartera >5 días + %, VR. Total
// Pendiente, Valor Cuotas Iniciales por Recaudar, Valor en Crédito por
// Recaudar, Fecha de Corte. Una sola columna del Excel completo no tiene
// todavía un criterio confirmado en el sistema (queda en `null`, el
// frontend la marca como "Pendiente"):
//  - UNI VENDIDAS (FIDU): un conteo fiduciario distinto del estado de
//    Inventario que no sabemos reproducir.
//
// CARTERA > 5 DÍAS sí se completa (a pedido explícito, con el mejor criterio
// disponible hoy, aunque no calce 100% con la definición exacta del Excel):
// mismo criterio que ya usa Cartera en Gestión (columna "Cuota Inicial", sin
// Saldo Contraentrega) -- todo negocio con mora activa cuyo mayor atraso
// supera 5 días, SIN el filtro "sin trámites pendientes" del Excel (no
// existe ese flag en el sistema).
//
// VALOR EN CRÉDITO POR RECAUDAR EN FIDUCIARIA = pendiente del Saldo
// Contraentrega (el 70%) -- confirmado con el usuario. Se le dice "crédito"
// porque esa porción suele pagarse vía crédito hipotecario al momento de la
// entrega. Misma fórmula que ya usa `totalesColumnasFijas.pendienteContraentrega`
// en obtenerDashboardRecaudo() más abajo -- no cambiar uno sin el otro.
const ESTADOS_INV_VENDIDA_CRM = new Set(['Vendido', 'Reservado', 'Separado']);
const UMBRAL_CARTERA_DIAS = 5;

function acumuladoEtapaVacio() {
  return {
    uniTotales: 0,
    uniVendidasCRM: 0,
    uniDisponible: 0,
    valorTotalVentasFiduciaria: 0,
    valorCuotasIniciales: 0,
    valorTotalUnidadesDisponibles: 0,
    recaudoReal: 0,
    recaudoCuotaInicial: 0,
    carteraMas5Dias: 0,
    esperadoAFechaInicial: 0,
    pendienteCredito: 0,
    pendienteTotalFiduciaria: 0,
    pendienteCuotaInicial: 0,
  };
}

const CAMPOS_SUMABLES_TOTAL = [
  'uniTotales', 'uniVendidasCRM', 'uniDisponible',
  'valorTotalVenta', 'valorTotalVentasFiduciaria', 'valorCuotasIniciales', 'valorTotalUnidadesDisponibles',
  'recaudoReal', 'recaudoCuotaInicial', 'carteraMas5Dias', 'esperadoAFechaInicial',
  'pendienteTotalFiduciaria', 'pendienteCuotaInicial', 'pendienteCredito',
];

async function obtenerResumenPorEtapa() {
  const { filas } = await obtenerCache();

  const porEtapa = new Map();

  for (const f of filas) {
    if (f.etapa == null) continue;
    if (!porEtapa.has(f.etapa)) porEtapa.set(f.etapa, acumuladoEtapaVacio());
    const e = porEtapa.get(f.etapa);
    e.uniTotales += 1;
    if (ESTADOS_INV_VENDIDA_CRM.has(f.estadoInventario)) e.uniVendidasCRM += 1;
    else if (f.estadoInventario === 'Disponible') e.uniDisponible += 1;

    // "Fiduciaria" = tiene Negocio vinculado (encargo fiduciario real);
    // "Disponibles" = sin Negocio todavía -- mismo corte que ya usan las
    // tarjetas de Inmuebles disponibles/vendidos de este Resumen, pero por
    // presencia de Negocio en vez de estadoInventario (son clasificaciones
    // independientes: Zoho Producto vs. Zoho Negocio).
    if (f.negocioId != null) {
      if (f.valorInmueble != null) e.valorTotalVentasFiduciaria += f.valorInmueble;
      if (f.valorCuotaInicial != null) e.valorCuotasIniciales += f.valorCuotaInicial;
      if (f.totalAbonado != null) e.recaudoReal += f.totalAbonado;
      if (f.abonadoCuotaInicial != null) e.recaudoCuotaInicial += f.abonadoCuotaInicial;
      if (f.esperadoAFechaInicial != null) e.esperadoAFechaInicial += f.esperadoAFechaInicial;
      if ((f.maxDiasAtrasoInicial ?? 0) > UMBRAL_CARTERA_DIAS) e.carteraMas5Dias += f.montoEnMoraInicial ?? 0;
      // Los 3 "pendiente" se calculan por NEGOCIO (no sobre el agregado de la
      // etapa) y cada uno con su propio piso en 0 -- mismo criterio que ya
      // usa totalesColumnasFijas más abajo (pendienteRecaudar/
      // pendienteContraentrega) para las tarjetas KPI de este mismo Resumen.
      // Es a propósito: si se calculara sobre el agregado, el saldo a favor
      // de un negocio sobrepagado podría "tapar" la deuda real de otro
      // dentro de la misma etapa, y de paso Total ya no cuadraría con Cuota
      // Inicial + Crédito sumados.
      if (f.valorInmueble != null && f.totalAbonado != null) {
        e.pendienteTotalFiduciaria += Math.max(0, f.valorInmueble - f.totalAbonado);
      }
      if (f.valorCuotaInicial != null && f.abonadoCuotaInicial != null) {
        e.pendienteCuotaInicial += Math.max(0, f.valorCuotaInicial - f.abonadoCuotaInicial);
      }
      if (f.valorSaldoContraentrega != null && f.totalAbonado != null) {
        const abonadoHaciaContraentrega = f.totalAbonado - (f.abonadoCuotaInicial ?? 0);
        e.pendienteCredito += Math.max(0, f.valorSaldoContraentrega - abonadoHaciaContraentrega);
      }
    } else if (f.valorInmueble != null) {
      e.valorTotalUnidadesDisponibles += f.valorInmueble;
    }
  }

  const fechaCorte = new Date().toISOString();
  const etapas = [...porEtapa.keys()].sort(compararEtapas).map((etapa) => {
    const e = porEtapa.get(etapa);
    return {
      etapa,
      uniTotales: e.uniTotales,
      uniVendidasFidu: null,
      uniVendidasCRM: e.uniVendidasCRM,
      uniDisponible: e.uniDisponible,
      valorTotalVenta: e.valorTotalVentasFiduciaria + e.valorTotalUnidadesDisponibles,
      valorTotalVentasFiduciaria: e.valorTotalVentasFiduciaria,
      valorCuotasIniciales: e.valorCuotasIniciales,
      valorTotalUnidadesDisponibles: e.valorTotalUnidadesDisponibles,
      recaudoReal: e.recaudoReal,
      // No son columnas del Excel pedido -- se exponen solo para que el
      // reduce del total de abajo (CAMPOS_SUMABLES_TOTAL) pueda sumarlas y
      // sacar el % correcto en la fila TOTAL GENERAL (ahí no hay un `e` con
      // el que cerrar).
      recaudoCuotaInicial: e.recaudoCuotaInicial,
      esperadoAFechaInicial: e.esperadoAFechaInicial,
      pctRecaudoSobreVentasFiduciaria: e.valorTotalVentasFiduciaria > 0 ? e.recaudoReal / e.valorTotalVentasFiduciaria : null,
      pctRecaudoSobreCuotaInicial: e.valorCuotasIniciales > 0 ? e.recaudoCuotaInicial / e.valorCuotasIniciales : null,
      carteraMas5Dias: e.carteraMas5Dias,
      pctCarteraMas5Dias: e.esperadoAFechaInicial > 0 ? e.carteraMas5Dias / e.esperadoAFechaInicial : null,
      pendienteTotalFiduciaria: e.pendienteTotalFiduciaria,
      pendienteCuotaInicial: e.pendienteCuotaInicial,
      pendienteCredito: e.pendienteCredito,
      fechaCorte,
    };
  });

  const total = etapas.reduce((acc, e) => {
    for (const key of CAMPOS_SUMABLES_TOTAL) acc[key] = (acc[key] ?? 0) + (e[key] ?? 0);
    return acc;
  }, {});
  Object.assign(total, {
    etapa: 'TOTAL GENERAL',
    uniVendidasFidu: null,
    pctRecaudoSobreVentasFiduciaria: total.valorTotalVentasFiduciaria > 0 ? total.recaudoReal / total.valorTotalVentasFiduciaria : null,
    pctRecaudoSobreCuotaInicial: total.valorCuotasIniciales > 0 ? total.recaudoCuotaInicial / total.valorCuotasIniciales : null,
    pctCarteraMas5Dias: total.esperadoAFechaInicial > 0 ? total.carteraMas5Dias / total.esperadoAFechaInicial : null,
    // El Excel deja "Fecha de Corte" vacía en la fila de totales -- solo la
    // repite en cada fila de Etapa.
    fechaCorte: null,
  });

  return { etapas, total, fechaCorte };
}

// ── Consolidado de Cartera por Etapa: navegación mes a mes ──────────────────
// El cálculo de arriba es siempre en vivo (estado actual del portafolio) --
// no hay forma de reconstruir con certeza cómo se veía en un mes ya cerrado
// (no tenemos snapshots históricos de Zoho/Fiducia, solo el estado de hoy).
// En vez de fingir un histórico, se guarda una foto fija al cierre de cada
// mes (ver cron en index.js) y se navega entre esas fotos + el mes actual en
// vivo -- mismo criterio que usa Gerencia con el Excel: cierra una hoja del
// mes y abre la siguiente.
function mesKeyDeFecha(fecha) {
  return `${fecha.getUTCFullYear()}-${String(fecha.getUTCMonth() + 1).padStart(2, '0')}`;
}

function mesAnteriorKey(fecha = new Date()) {
  const d = new Date(Date.UTC(fecha.getUTCFullYear(), fecha.getUTCMonth() - 1, 1));
  return mesKeyDeFecha(d);
}

const MESES_ETIQUETA = ['Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio', 'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre'];

function etiquetaMes(mesKey) {
  const [anio, mes] = mesKey.split('-');
  return `${MESES_ETIQUETA[parseInt(mes, 10) - 1]} ${anio}`;
}

// Lista de meses navegables: los ya cerrados (con foto guardada) + el mes
// actual en vivo, siempre al final -- mismo orden que las pestañas del Excel.
async function obtenerMesesDisponiblesResumen() {
  const cerrados = await prisma.resumenCarteraMensual.findMany({
    select: { mes: true },
    orderBy: { mes: 'asc' },
  });
  const mesActual = mesKeyDeFecha(new Date());
  const meses = cerrados.map((r) => ({ mes: r.mes, etiqueta: etiquetaMes(r.mes), enVivo: false }));
  meses.push({ mes: mesActual, etiqueta: etiquetaMes(mesActual), enVivo: true });
  return meses;
}

// Datos de un mes puntual: si es el mes actual (o no se pide ninguno), se
// calcula en vivo; si es un mes ya cerrado, se lee la foto guardada.
async function obtenerResumenCarteraMes(mes) {
  const mesActual = mesKeyDeFecha(new Date());
  if (!mes || mes === mesActual) {
    const datos = await obtenerResumenPorEtapa();
    return { ...datos, mes: mesActual, etiqueta: etiquetaMes(mesActual), enVivo: true };
  }
  const fila = await prisma.resumenCarteraMensual.findUnique({ where: { mes } });
  if (!fila) return null;
  return { ...fila.datos, mes: fila.mes, etiqueta: etiquetaMes(fila.mes), enVivo: false };
}

// Cierra el mes anterior si todavía no tiene foto guardada -- llamado desde
// un cron diario (ver index.js), no solo el día 1, para autocurarse si el
// servidor estuvo caído justo al cambio de mes. El chequeo previo evita
// duplicados sin necesitar una transacción (la única carrera posible es
// entre corridas del mismo proceso, que corre en serie).
async function cerrarMesAnteriorSiFalta() {
  const mes = mesAnteriorKey();
  const yaExiste = await prisma.resumenCarteraMensual.findUnique({ where: { mes } });
  if (yaExiste) return null;
  const datos = await obtenerResumenPorEtapa();
  return prisma.resumenCarteraMensual.create({ data: { mes, datos } });
}

module.exports = {
  resolverNegociosYOportunidades, obtenerDashboardRecaudo, obtenerCarteraMora, obtenerResumenPorEtapa,
  obtenerMesesDisponiblesResumen, obtenerResumenCarteraMes, cerrarMesAnteriorSiFalta,
  invalidarCacheDashboard,
};
