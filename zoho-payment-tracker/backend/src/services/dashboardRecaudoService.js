const { prisma, parseProyectoTorre, obtenerEtapaTorre, valoresProyectoTorre } = require('./inventarioNegocioService');
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
    select: { id: true, referencia: true, datos: true },
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
      nomenclatura: inv.datos?.Project_Code ?? null,
      valorInmueble,
      fechaSaldoContraentrega,
      valorSaldoContraentrega,
      totalAbonado,
      opportunityId: oportunidad?.id ?? null,
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

module.exports = { resolverNegociosYOportunidades, obtenerDashboardRecaudo, invalidarCacheDashboard };
