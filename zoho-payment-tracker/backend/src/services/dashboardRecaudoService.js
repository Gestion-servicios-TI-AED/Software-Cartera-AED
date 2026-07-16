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
async function obtenerDashboardRecaudo({ search, etapa, frente, torre, conMovimientos, page, limit }) {
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

  // "Solo con movimientos" se resuelve aquí (no en el WHERE de arriba) porque
  // el vínculo Inmueble->Negocio se resuelve en bloque en JS, no por join SQL.
  const inmueblesEnAlcance = conMovimientos === 'true'
    ? inmuebles.filter((inv) => {
        const negocio = negocioPorInmuebleId.get(inv.id);
        return negocio && (movimientosPorNegocioId.get(negocio.id)?.length ?? 0) > 0;
      })
    : inmuebles;

  const mesesSet = new Set();
  const totalesPorMes = new Map();
  const totalesPorEtapa = new Map();
  const filasCompletas = inmueblesEnAlcance.map((inv) => {
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

      const sumar = (mes, campo, valor) => {
        mesesSet.add(mes);
        if (!porMes[mes]) porMes[mes] = { esperado: 0, recaudado: 0 };
        porMes[mes][campo] += valor;

        if (!totalesPorMes.has(mes)) totalesPorMes.set(mes, { esperado: 0, recaudado: 0 });
        totalesPorMes.get(mes)[campo] += valor;

        if (etapa != null) {
          if (!totalesPorEtapa.has(etapa)) totalesPorEtapa.set(etapa, { esperado: 0, recaudado: 0 });
          totalesPorEtapa.get(etapa)[campo] += valor;
        }
      };

      // Esperado: por mes de cada cuota del plan (sin cambios).
      for (const c of cuotas) {
        if (!c.fechaEstimada) continue;
        sumar(mesKey(c.fechaEstimada), 'esperado', c.valorPlan);
      }

      // Recaudado: por mes real de cada movimiento -- a diferencia de la
      // cascada de conciliar() (donde el sobrante de un pago se corre a la
      // siguiente cuota), aquí lo que entró en un mes se cuenta completo en
      // ese mes, sin repartirlo hacia el mes de la cuota que termine cubriendo.
      for (const p of pagos) {
        if (!p.fecha) continue;
        sumar(mesKey(p.fecha), 'recaudado', p.valor);
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
      porMes,
    };
  });

  const meses = [...mesesSet].sort();
  const totales = Object.fromEntries(meses.map((m) => [m, totalesPorMes.get(m)]));
  const etapasOrdenadas = [...totalesPorEtapa.keys()].sort((a, b) => Number(a) - Number(b));
  const totalesEtapa = Object.fromEntries(etapasOrdenadas.map((e) => [e, totalesPorEtapa.get(e)]));

  const total = filasCompletas.length;
  const pageNum = Math.max(1, page);
  const limitNum = Math.max(1, limit);
  const data = filasCompletas.slice((pageNum - 1) * limitNum, pageNum * limitNum);

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

module.exports = { construirFiltroInventario, resolverNegociosYOportunidades, obtenerDashboardRecaudo };
