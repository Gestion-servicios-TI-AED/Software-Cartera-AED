const { Prisma } = require('@prisma/client');
const { prisma, parseProyectoTorre, obtenerEtapaTorre, valoresProyectoTorre } = require('./inventarioNegocioService');
const { construirPlan, normalizarPagos, conciliar } = require('./conciliacionService');

// Arma el WHERE (solo sobre InventarioItem, sin huérfanos) para el reporte
// Dashboard: mismos filtros Etapa/Frente/Torre/búsqueda que el módulo de
// Negocios, sin Estado/Solo con abonos (ese reporte no tiene esos campos —
// no hay Negocio.estado/saldoActual cuando el inmueble no tiene negocio).
function construirFiltroInventario({ search, etapa, frente, torre, valores }) {
  const condiciones = [];
  if (search) {
    const like = `%${search}%`;
    condiciones.push(Prisma.sql`(inv.datos->>'Project_Code' ILIKE ${like} OR inv.datos->>'Proyecto_Torre' ILIKE ${like})`);
  }
  if (etapa) {
    const lista = valores.porEtapa.get(etapa) || [];
    condiciones.push(Prisma.sql`inv.datos->>'Proyecto_Torre' = ANY(${lista}::text[])`);
  }
  if (frente && torre) {
    const lista = valores.porFrenteTorre.get(`${frente}||${torre}`) || [];
    condiciones.push(Prisma.sql`inv.datos->>'Proyecto_Torre' = ANY(${lista}::text[])`);
  } else if (frente) {
    const lista = valores.porFrente.get(frente) || [];
    condiciones.push(Prisma.sql`inv.datos->>'Proyecto_Torre' = ANY(${lista}::text[])`);
  }
  return condiciones.length ? Prisma.sql`WHERE ${Prisma.join(condiciones, ' AND ')}` : Prisma.empty;
}

// Resuelve, para un conjunto de InventarioItem ya filtrado, su Negocio y
// Opportunity vinculados -- en bloque (pocas queries, no una por inmueble),
// para que sea viable sobre todo el portafolio filtrado a la vez. Mismo
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

// Reporte Dashboard: plan de pagos vs. recaudado, por mes, para todo el
// inventario que cumple los filtros (no solo la página actual -- los
// totales necesitan el conjunto filtrado completo, sin importar la
// paginación). Corre construirPlan+normalizarPagos+conciliar por cada
// inmueble con oportunidad vinculada.
async function obtenerDashboardRecaudo({ search, etapa, frente, torre, page, limit }) {
  const valores = await valoresProyectoTorre();
  const filtro = construirFiltroInventario({ search, etapa, frente, torre, valores });

  const inmuebles = await prisma.$queryRaw`
    SELECT id, datos, "referenciaRecaudo"
    FROM "InventarioItem" inv
    ${filtro}
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

  const mesesSet = new Set();
  const totalesPorMes = new Map();
  const filasCompletas = inmuebles.map((inv) => {
    const info = parseProyectoTorre(inv.datos?.Proyecto_Torre);
    const negocio = negocioPorInmuebleId.get(inv.id) ?? null;
    const oportunidad = negocio ? oportunidadPorReferencia.get(negocio.referencia) ?? null : null;

    const porMes = {};
    if (oportunidad) {
      const planRows = oportunidad.formaPago?.length ? oportunidad.formaPago : (oportunidad.propuestaPago || []);
      const cuotasPlan = construirPlan(planRows, oportunidad.fechaInicioPlanPagos);
      const pagos = normalizarPagos(movimientosPorNegocioId.get(negocio.id) || []);
      const { cuotas } = conciliar(cuotasPlan, pagos);
      for (const c of cuotas) {
        if (!c.fechaEstimada) continue;
        const mes = mesKey(c.fechaEstimada);
        mesesSet.add(mes);
        if (!porMes[mes]) porMes[mes] = { esperado: 0, recaudado: 0 };
        porMes[mes].esperado += c.valorPlan;
        porMes[mes].recaudado += c.cubierto;

        if (!totalesPorMes.has(mes)) totalesPorMes.set(mes, { esperado: 0, recaudado: 0 });
        const t = totalesPorMes.get(mes);
        t.esperado += c.valorPlan;
        t.recaudado += c.cubierto;
      }
    }

    return {
      id: inv.id,
      etapa: info ? obtenerEtapaTorre(inv.datos.Proyecto_Torre) : null,
      frente: info ? info.proyecto : null,
      torre: info ? info.torre : null,
      nomenclatura: inv.datos?.Project_Code ?? null,
      porMes,
    };
  });

  const meses = [...mesesSet].sort();
  const totales = Object.fromEntries(meses.map((m) => [m, totalesPorMes.get(m)]));

  const total = filasCompletas.length;
  const pageNum = Math.max(1, page);
  const limitNum = Math.max(1, limit);
  const data = filasCompletas.slice((pageNum - 1) * limitNum, pageNum * limitNum);

  return {
    data,
    meses,
    totales,
    pagination: { total, page: pageNum, limit: limitNum, totalPages: Math.ceil(total / limitNum) },
    etapasDisponibles: [...valores.porEtapa.keys()].sort((a, b) => Number(a) - Number(b)),
    frentesDisponibles: [...valores.porFrente.keys()].sort(),
    frentesPorEtapa: valores.frentesPorEtapa,
    torresPorFrente: valores.torresPorFrente,
    torresPorEtapaFrente: valores.torresPorEtapaFrente,
  };
}

module.exports = { construirFiltroInventario, resolverNegociosYOportunidades, obtenerDashboardRecaudo };
