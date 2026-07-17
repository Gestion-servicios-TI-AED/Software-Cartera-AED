const { prisma, parseProyectoTorre, obtenerEtapaTorre, resolverProjectCode, valoresProyectoTorre } = require('./inventarioNegocioService');
const { construirPlan, normalizarPagos, conciliar } = require('./conciliacionService');

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
      id: true, referencia: true, datos: true, estado: true,
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
  const oportunidadesExactas = referenciasNegocio.length
    ? await prisma.opportunity.findMany({
        where: { referenciaRecaudo: { in: referenciasNegocio } },
        select: { id: true, referenciaRecaudo: true, fechaInicioPlanPagos: true, formaPago: true, propuestaPago: true },
        orderBy: { id: 'asc' },
      })
    : [];
  // orderBy id asc + primer-visto-gana: mismo desempate que
  // findOportunidadByReferencia ahora usa para una referenciaRecaudo con mas
  // de una Opportunity -- sin esto, `new Map(...)` se hubiera quedado con la
  // ULTIMA fila (orden no determinista), no necesariamente la misma que
  // resuelve el camino uno-a-uno.
  const oportunidadPorReferencia = new Map();
  for (const o of oportunidadesExactas) {
    if (!oportunidadPorReferencia.has(o.referenciaRecaudo)) oportunidadPorReferencia.set(o.referenciaRecaudo, o);
  }

  // Respaldo tolerante a formato (igual que findOportunidadByReferencia), solo
  // para las referencias que no calzaron exacto -- típicamente pocas.
  const sinMatch = referenciasNegocio.filter((r) => !oportunidadPorReferencia.has(r) && r.length >= 6);
  for (const referencia of sinMatch) {
    const opp = await prisma.opportunity.findFirst({
      where: { referenciaRecaudo: { contains: referencia, mode: 'insensitive' } },
      orderBy: { id: 'asc' },
      select: { id: true, referenciaRecaudo: true, fechaInicioPlanPagos: true, formaPago: true, propuestaPago: true },
    });
    if (opp) oportunidadPorReferencia.set(referencia, opp);
  }

  return { negocioPorInmuebleId, oportunidadPorReferencia };
}

function mesKey(fecha) {
  return `${fecha.getUTCFullYear()}-${String(fecha.getUTCMonth() + 1).padStart(2, '0')}`;
}

// Calcula, para TODO el inventario (sin filtrar), la fila completa de cada
// inmueble -- construirPlan+normalizarPagos+conciliar por cada uno con
// oportunidad vinculada. Es la parte cara del reporte Dashboard, por eso se
// cachea en vez de correrla en cada request.
async function construirFilasCompletas() {
  const valores = await valoresProyectoTorre();

  const inmuebles = await prisma.$queryRaw`
    SELECT id, datos, "referenciaRecaudo"
    FROM "InventarioItem"
    ORDER BY datos->>'Proyecto_Torre' ASC NULLS LAST, datos->>'Project_Code' ASC NULLS LAST
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
    let valorInmueble = null;
    let fechaSaldoContraentrega = null;
    let valorSaldoContraentrega = null;
    let totalAbonado = null;
    let cuotasEnMora = 0;
    let montoEnMora = 0;
    let maxDiasAtraso = 0;
    let esperadoAFecha = null;
    if (oportunidad) {
      const planRows = oportunidad.formaPago?.length ? oportunidad.formaPago : (oportunidad.propuestaPago || []);
      const cuotasPlan = construirPlan(planRows, oportunidad.fechaInicioPlanPagos);
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

      // Esperado: por mes de cada cuota del plan.
      for (const c of cuotas) {
        if (!c.fechaEstimada) continue;
        const mes = mesKey(c.fechaEstimada);
        if (!porMes[mes]) porMes[mes] = { esperado: 0, recaudado: 0 };
        porMes[mes].esperado += c.valorPlan;
      }

      // Recaudado: por mes real de cada movimiento -- a diferencia de la
      // cascada de conciliar() (donde el sobrante de un pago se corre a la
      // siguiente cuota), aquí lo que entró en un mes se cuenta completo en
      // ese mes, sin repartirlo hacia el mes de la cuota que termine cubriendo.
      for (const p of pagos) {
        if (!p.fecha) continue;
        const mes = mesKey(p.fecha);
        if (!porMes[mes]) porMes[mes] = { esperado: 0, recaudado: 0 };
        porMes[mes].recaudado += p.valor;
      }
    }

    return {
      id: inv.id,
      etapa,
      frente: info ? info.proyecto : null,
      torre: info ? info.torre : null,
      nomenclatura: resolverProjectCode(inv.datos),
      valorInmueble,
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
      // Identidad del negocio -- para el listado de Cartera en Gestión.
      negocioId: negocio?.id ?? null,
      referencia: negocio?.referencia ?? null,
      comprador: negocio?.compradores?.[0]?.nombre ?? null,
      estado: negocio?.estado ?? null,
      // Campo interno, no se expone en la respuesta -- resuelve el filtro
      // "Solo con movimientos" sin tener que recorrer movimientos otra vez.
      _tieneMovimientos: !!negocio && (movimientosPorNegocioId.get(negocio.id)?.length ?? 0) > 0,
      porMes,
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

// Reporte Dashboard: plan de pagos vs. recaudado, por mes, para todo el
// inventario que cumple los filtros (no solo la página actual -- los totales
// necesitan el conjunto filtrado completo, sin importar la paginación). El
// cálculo pesado por inmueble sale del cache (ver arriba); aquí solo se
// filtra, pagina y reagregan totales en memoria.
async function obtenerDashboardRecaudo({ search, etapa, frente, torre, conMovimientos, page, limit }) {
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

  // Totales del subconjunto filtrado -- reagregar es barato (solo sumar lo
  // que ya está calculado en cada fila, no volver a correr conciliar()).
  const mesesSet = new Set();
  const totalesPorMes = new Map();
  const totalesPorEtapa = new Map();
  for (const f of filas) {
    for (const [mes, v] of Object.entries(f.porMes)) {
      mesesSet.add(mes);
      if (!totalesPorMes.has(mes)) totalesPorMes.set(mes, { esperado: 0, recaudado: 0 });
      const t = totalesPorMes.get(mes);
      t.esperado += v.esperado;
      t.recaudado += v.recaudado;

      if (f.etapa != null) {
        if (!totalesPorEtapa.has(f.etapa)) totalesPorEtapa.set(f.etapa, { esperado: 0, recaudado: 0 });
        const te = totalesPorEtapa.get(f.etapa);
        te.esperado += v.esperado;
        te.recaudado += v.recaudado;
      }
    }
  }
  const meses = [...mesesSet].sort();
  const totales = Object.fromEntries(meses.map((m) => [m, totalesPorMes.get(m)]));
  const etapasOrdenadas = [...totalesPorEtapa.keys()].sort((a, b) => Number(a) - Number(b));
  const totalesEtapa = Object.fromEntries(etapasOrdenadas.map((e) => [e, totalesPorEtapa.get(e)]));

  const total = filas.length;
  const pageNum = Math.max(1, page);
  const limitNum = Math.max(1, limit);
  const data = filas
    .slice((pageNum - 1) * limitNum, pageNum * limitNum)
    .map(({ _tieneMovimientos, ...fila }) => fila);

  return {
    data,
    meses,
    totales,
    totalesPorEtapa: totalesEtapa,
    pagination: { total, page: pageNum, limit: limitNum, totalPages: Math.ceil(total / limitNum) },
    etapasDisponibles: [...valores.porEtapa.keys()].sort((a, b) => Number(a) - Number(b)),
    frentesDisponibles: [...valores.porFrente.keys()].sort(),
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

async function obtenerCarteraMora({ search, etapa, frente, torre, rango, page, limit }) {
  const { filas: todasLasFilas, valores } = await obtenerCache();

  let filas = todasLasFilas.filter((f) => f.cuotasEnMora > 0);
  if (search) {
    const s = search.toLowerCase();
    filas = filas.filter((f) =>
      f.nomenclatura?.toLowerCase().includes(s) ||
      f.comprador?.toLowerCase().includes(s) ||
      f.referencia?.toLowerCase().includes(s) ||
      `${f.frente ?? ''} ${f.torre ?? ''}`.toLowerCase().includes(s)
    );
  }
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
  filas = [...filas].sort((a, b) => b.maxDiasAtraso - a.maxDiasAtraso);

  const totalCuotasEnMora = filas.reduce((s, f) => s + f.cuotasEnMora, 0);
  const totalMontoEnMora = filas.reduce((s, f) => s + f.montoEnMora, 0);
  // % de lo que ya debería estar recaudado (según el plan, a la fecha de
  // hoy) que está vencido -- no sobre el valor total del apartamento, que
  // incluye cuotas futuras que todavía no le tocaba pagar.
  const totalEsperadoAFecha = filas.reduce((s, f) => s + (f.esperadoAFecha ?? 0), 0);
  const pctMoraPortafolio = totalEsperadoAFecha > 0 ? (totalMontoEnMora / totalEsperadoAFecha) * 100 : null;

  const total = filas.length;
  const pageNum = Math.max(1, page);
  const limitNum = Math.max(1, limit);
  const data = filas
    .slice((pageNum - 1) * limitNum, pageNum * limitNum)
    .map(({ _tieneMovimientos, porMes, esperadoAFecha, ...fila }) => ({
      ...fila,
      pctEnMora: esperadoAFecha > 0 ? (fila.montoEnMora / esperadoAFecha) * 100 : null,
    }));

  return {
    data,
    resumen: { negociosEnMora: total, totalCuotasEnMora, totalMontoEnMora, totalEsperadoAFecha, pctMoraPortafolio },
    porRangoMora,
    pagination: { total, page: pageNum, limit: limitNum, totalPages: Math.ceil(total / limitNum) },
    etapasDisponibles: [...valores.porEtapa.keys()].sort((a, b) => Number(a) - Number(b)),
    frentesDisponibles: [...valores.porFrente.keys()].sort(),
    frentesPorEtapa: valores.frentesPorEtapa,
    torresPorFrente: valores.torresPorFrente,
    torresPorEtapaFrente: valores.torresPorEtapaFrente,
  };
}

module.exports = { resolverNegociosYOportunidades, obtenerDashboardRecaudo, obtenerCarteraMora, invalidarCacheDashboard };
