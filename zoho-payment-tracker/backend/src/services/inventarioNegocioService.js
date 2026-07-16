const { PrismaClient, Prisma } = require('@prisma/client');

const prisma = new PrismaClient();

// Etapa de cada Torre, según la tabla que definió AED (proyecto + número de
// torre → etapa). Lo que no aparezca acá (Isla Laguna, Vela Village, The
// Plaza, Laguna y Ambiental, Urbanismo, o negocios sin inmueble) cae en "0".
const ETAPA_POR_TORRE = {
  'KABO 1': '1', 'KABO 2': '1', 'PRIVE 2': '1', 'PRIVE 3': '1',
  'KABO 3': '2', 'KABO 4': '2', 'PRIVE 1': '2', 'PRIVE 4': '2',
  'KALA 1': '3', 'KALA 2': '3', 'KALIZA 1': '3', 'KALIZA 2': '3',
  'KALA 3': '4', 'KALA 4': '4', 'KALIZA 3': '4',
};

// Parsea el campo Proyecto_Torre del Product de Zoho ("Kabo - Torre 3",
// "Kala Golf - Torre  4") en { proyecto: "Kabo", torre: "3" }.
function parseProyectoTorre(proyectoTorreRaw) {
  const m = String(proyectoTorreRaw ?? '').match(/^(.+?)\s*-\s*Torre\s*(\d+)/i);
  if (!m) return null;
  const proyecto = m[1].trim().replace(/\s*golf$/i, ''); // "Kala Golf" → "Kala"
  return { proyecto, torre: m[2] };
}

// Etiqueta legible para el selector de negocios: "Kabo Torre 3".
function formatearProyectoTorre(info) {
  return `${info.proyecto} Torre ${info.torre}`;
}

function obtenerEtapaTorre(proyectoTorreRaw) {
  const info = parseProyectoTorre(proyectoTorreRaw);
  return (info && ETAPA_POR_TORRE[`${info.proyecto.toUpperCase()} ${info.torre}`]) ?? '0';
}

// Valores crudos de Proyecto_Torre en BD, agrupados de tres formas a partir
// de una sola consulta (reemplaza a valoresProyectoTorrePorEtapa() y
// valoresProyectoTorrePorFrente(), que hacían la misma consulta por
// separado):
//  - porEtapa / porFrente: listas de valores crudos para los filtros de
//    Etapa y Frente en SQL (`= ANY(...)`), igual que antes.
//  - porFrenteTorre: listas de valores crudos por par Frente+Torre, para
//    el filtro de Torre (clave "Frente||Torre", ej. "Kabo||3").
//  - frentesPorEtapa / torresPorFrente: mapas estáticos que el frontend usa
//    para acotar las opciones de los selects en cascada, sin llamadas
//    adicionales al backend.
async function valoresProyectoTorre() {
  const rows = await prisma.$queryRaw`
    SELECT DISTINCT datos->>'Proyecto_Torre' AS v
    FROM "InventarioItem"
    WHERE datos->>'Proyecto_Torre' IS NOT NULL`;

  const porEtapa = new Map();
  const porFrente = new Map();
  const porFrenteTorre = new Map();
  const frentesPorEtapaSet = new Map();
  const torresPorFrenteSet = new Map();
  const torresPorEtapaFrenteSet = new Map();

  for (const { v } of rows) {
    const et = obtenerEtapaTorre(v);
    if (!porEtapa.has(et)) porEtapa.set(et, []);
    porEtapa.get(et).push(v);

    const info = parseProyectoTorre(v);
    if (!info) continue;

    if (!porFrente.has(info.proyecto)) porFrente.set(info.proyecto, []);
    porFrente.get(info.proyecto).push(v);

    const claveFrenteTorre = `${info.proyecto}||${info.torre}`;
    if (!porFrenteTorre.has(claveFrenteTorre)) porFrenteTorre.set(claveFrenteTorre, []);
    porFrenteTorre.get(claveFrenteTorre).push(v);

    if (!frentesPorEtapaSet.has(et)) frentesPorEtapaSet.set(et, new Set());
    frentesPorEtapaSet.get(et).add(info.proyecto);

    if (!torresPorFrenteSet.has(info.proyecto)) torresPorFrenteSet.set(info.proyecto, new Set());
    torresPorFrenteSet.get(info.proyecto).add(info.torre);

    // Igual que torresPorFrenteSet, pero acotado a la Etapa de esta fila —
    // necesario porque un mismo Frente reparte sus torres entre dos etapas
    // (ej. Kabo 1/2 -> Etapa 1, Kabo 3/4 -> Etapa 2), así que el filtro de
    // Torre debe respetar la Etapa activa cuando también hay una elegida.
    const claveEtapaFrente = `${et}||${info.proyecto}`;
    if (!torresPorEtapaFrenteSet.has(claveEtapaFrente)) torresPorEtapaFrenteSet.set(claveEtapaFrente, new Set());
    torresPorEtapaFrenteSet.get(claveEtapaFrente).add(info.torre);
  }

  const frentesPorEtapa = {};
  for (const [et, set] of frentesPorEtapaSet) frentesPorEtapa[et] = [...set].sort();

  const torresPorFrente = {};
  for (const [fr, set] of torresPorFrenteSet) torresPorFrente[fr] = [...set].sort((a, b) => Number(a) - Number(b));

  const torresPorEtapaFrente = {};
  for (const [key, set] of torresPorEtapaFrenteSet) torresPorEtapaFrente[key] = [...set].sort((a, b) => Number(a) - Number(b));

  return { porEtapa, porFrente, porFrenteTorre, frentesPorEtapa, torresPorFrente, torresPorEtapaFrente };
}

// CTE compartida entre la consulta de datos y la de conteo: une todos los
// InventarioItem (con su Negocio vinculado, si existe) con los Negocio que
// no calzan con ningún InventarioItem ("huérfanos" — depósitos, parqueaderos,
// etc. que se venden como parte de un negocio pero no están en Zoho Products).
const BASE_CTE = Prisma.sql`
WITH inmuebles AS (
  SELECT
    ('inv-' || inv.id) AS id,
    inv.datos AS inventario_datos,
    neg.id AS negocio_id,
    neg.referencia AS referencia,
    neg.estado AS estado,
    neg."saldoActual" AS "saldoActual",
    neg.datos AS negocio_datos
  FROM "InventarioItem" inv
  LEFT JOIN LATERAL (
    SELECT n.* FROM "Negocio" n
    WHERE n.referencia = inv."referenciaRecaudo"
       OR (n.datos->>'Nomenclatura') = (inv.datos->>'C_digo_inmueble')
    ORDER BY (n.referencia = inv."referenciaRecaudo") DESC, n.id ASC
    LIMIT 1
  ) neg ON true
),
huerfanos AS (
  SELECT
    ('neg-' || n.id) AS id,
    NULL::jsonb AS inventario_datos,
    n.id AS negocio_id,
    n.referencia AS referencia,
    n.estado AS estado,
    n."saldoActual" AS "saldoActual",
    n.datos AS negocio_datos
  FROM "Negocio" n
  WHERE NOT EXISTS (
    -- Un negocio es huérfano solo si NO fue el ganador del LATERAL de
    -- ningún inmueble (no basta con que "algún" inmueble calce con él por
    -- Nomenclatura: si dos negocios comparten Nomenclatura y calzan con el
    -- mismo inmueble, el LATERAL de arriba solo elige uno con LIMIT 1 — sin
    -- este chequeo contra inmuebles.negocio_id, el otro desaparecería sin
    -- aparecer ni colgado de un inmueble ni como huérfano).
    SELECT 1 FROM inmuebles i WHERE i.negocio_id = n.id
  )
),
combinado AS (
  SELECT * FROM inmuebles
  UNION ALL
  SELECT * FROM huerfanos
)
`;

// Arma el WHERE del conjunto unificado. `valores` es el objeto que
// devuelve valoresProyectoTorre(). Torre solo tiene efecto si viene junto
// con Frente (Torre sin Frente no identifica nada — Torre 1 existe en
// varios frentes); si `torre` llega sin `frente`, se ignora.
function construirFiltroCombinado({ search, estado, etapa, frente, torre, saldoPendiente, valores }) {
  const condiciones = [];
  if (estado) {
    condiciones.push(Prisma.sql`c.estado ILIKE ${'%' + estado + '%'}`);
  }
  if (saldoPendiente === 'true') {
    condiciones.push(Prisma.sql`c."saldoActual" > 0`);
  }
  if (search) {
    const like = `%${search}%`;
    condiciones.push(Prisma.sql`(
      c.referencia ILIKE ${like}
      OR c.negocio_datos->>'Nomenclatura' ILIKE ${like}
      OR c.inventario_datos->>'Project_Code' ILIKE ${like}
      OR c.inventario_datos->>'Proyecto_Torre' ILIKE ${like}
      OR EXISTS (
        SELECT 1 FROM "NegocioComprador" comp
        WHERE comp."negocioId" = c.negocio_id
          AND (comp.nombre ILIKE ${like} OR comp."nroId" ILIKE ${like})
      )
    )`);
  }
  if (etapa) {
    const lista = valores.porEtapa.get(etapa) || [];
    if (etapa === '0') {
      condiciones.push(Prisma.sql`(c.inventario_datos->>'Proyecto_Torre' = ANY(${lista}::text[]) OR c.inventario_datos IS NULL)`);
    } else {
      condiciones.push(Prisma.sql`c.inventario_datos->>'Proyecto_Torre' = ANY(${lista}::text[])`);
    }
  }
  if (frente && torre) {
    const lista = valores.porFrenteTorre.get(`${frente}||${torre}`) || [];
    condiciones.push(Prisma.sql`c.inventario_datos->>'Proyecto_Torre' = ANY(${lista}::text[])`);
  } else if (frente) {
    const lista = valores.porFrente.get(frente) || [];
    condiciones.push(Prisma.sql`c.inventario_datos->>'Proyecto_Torre' = ANY(${lista}::text[])`);
  }
  return condiciones.length ? Prisma.sql`WHERE ${Prisma.join(condiciones, ' AND ')}` : Prisma.empty;
}

// Lista unificada InventarioItem + Negocio (incluidos los huérfanos), con
// paginación, orden por Proyecto/Torre y los mismos filtros que ya existían
// (Estado, Solo con abonos, búsqueda) más Etapa y búsqueda por datos del
// inmueble (Project Code, Proyecto/Torre).
async function listarNegociosInventario({ search, estado, etapa, frente, torre, saldoPendiente, page, limit }) {
  const valores = await valoresProyectoTorre();
  const filtro = construirFiltroCombinado({ search, estado, etapa, frente, torre, saldoPendiente, valores });

  const [totalRows, filas] = await Promise.all([
    prisma.$queryRaw`
      ${BASE_CTE}
      SELECT COUNT(*)::int AS total FROM combinado c ${filtro}
    `,
    prisma.$queryRaw`
      ${BASE_CTE}
      SELECT
        c.id, c.inventario_datos, c.negocio_id, c.referencia, c.estado, c."saldoActual", c.negocio_datos,
        COALESCE((
          SELECT jsonb_agg(jsonb_build_object('id', comp.id, 'nombre', comp.nombre, 'nroId', comp."nroId", 'porcentaje', comp.porcentaje, 'orden', comp.orden) ORDER BY comp.orden)
          FROM "NegocioComprador" comp WHERE comp."negocioId" = c.negocio_id
        ), '[]'::jsonb) AS compradores,
        (SELECT COUNT(*)::int FROM "NegocioMovimiento" m WHERE m."negocioId" = c.negocio_id) AS "totalMovimientos"
      FROM combinado c
      ${filtro}
      ORDER BY c.inventario_datos->>'Proyecto_Torre' ASC NULLS LAST, c.inventario_datos->>'Project_Code' ASC NULLS LAST
      LIMIT ${limit} OFFSET ${(page - 1) * limit}
    `,
  ]);
  const total = totalRows[0]?.total ?? 0;

  const data = filas.map((f) => {
    const info = parseProyectoTorre(f.inventario_datos?.Proyecto_Torre);
    return {
      id: f.id,
      tieneNegocio: f.negocio_id != null,
      referencia: f.referencia,
      estado: f.estado,
      saldoActual: f.saldoActual,
      datos: f.negocio_datos,
      compradores: f.compradores,
      totalMovimientos: f.totalMovimientos,
      projectCode: f.inventario_datos?.Project_Code ?? null,
      proyectoTorre: info ? formatearProyectoTorre(info) : null,
      etapa: info ? obtenerEtapaTorre(f.inventario_datos.Proyecto_Torre) : null,
    };
  });

  return {
    data,
    total,
    etapasDisponibles: [...valores.porEtapa.keys()].sort((a, b) => Number(a) - Number(b)),
    frentesDisponibles: [...valores.porFrente.keys()].sort(),
    frentesPorEtapa: valores.frentesPorEtapa,
    torresPorFrente: valores.torresPorFrente,
    torresPorEtapaFrente: valores.torresPorEtapaFrente,
  };
}

// Busca la oportunidad de Zoho vinculada a un negocio por su referencia.
// La clave de unión es Negocio.referencia ↔ Opportunity.referenciaRecaudo.
async function findOportunidadByReferencia(referencia) {
  if (!referencia) return null;
  const select = {
    id: true, dealName: true, stage: true, referenciaRecaudo: true,
    pagoSeparacion: true, fechaInicioPlanPagos: true, camposFinancieros: true,
    seccionInmueble: true, lastSyncedAt: true,
  };
  // Coincidencia exacta primero; luego tolerante a espacios/formato.
  let opp = await prisma.opportunity.findFirst({ where: { referenciaRecaudo: referencia }, select });
  if (!opp && referencia.length >= 6) {
    opp = await prisma.opportunity.findFirst({
      where: { referenciaRecaudo: { contains: referencia, mode: 'insensitive' } },
      select,
    });
  }
  return opp;
}

// Dado un InventarioItem, resuelve el id del Negocio vinculado: directo por
// Referencia de Recaudo, si no por Nomenclatura → Código de inmueble, igual
// que el respaldo que ya usaba el detalle de negocio. null si no hay match.
async function resolverNegocioIdDesdeInmueble(inmueble) {
  if (inmueble.referenciaRecaudo) {
    const negocio = await prisma.negocio.findUnique({
      where: { referencia: inmueble.referenciaRecaudo },
      select: { id: true },
    });
    if (negocio) return negocio.id;
  }
  if (inmueble.datos?.C_digo_inmueble != null) {
    const negocio = await prisma.negocio.findFirst({
      where: { datos: { path: ['Nomenclatura'], equals: String(inmueble.datos.C_digo_inmueble) } },
      orderBy: { id: 'asc' },
      select: { id: true },
    });
    if (negocio) return negocio.id;
  }
  return null;
}

const INCLUDE_NEGOCIO_DETALLE = {
  compradores: { orderBy: { orden: 'asc' } },
  _count: { select: { movimientos: true } },
};

// Detalle unificado de una fila del módulo de Negocios, a partir del id
// prefijado que devuelve listarNegociosInventario(). undefined si el
// prefijo no se reconoce; null si el recurso no existe.
async function obtenerNegocioPorId(id) {
  if (id.startsWith('inv-')) {
    const inventarioId = id.slice('inv-'.length);
    const inmueble = await prisma.inventarioItem.findUnique({ where: { id: inventarioId } });
    if (!inmueble) return null;

    const negocioId = await resolverNegocioIdDesdeInmueble(inmueble);
    const negocio = negocioId
      ? await prisma.negocio.findUnique({ where: { id: negocioId }, include: INCLUDE_NEGOCIO_DETALLE })
      : null;

    const oportunidad = await findOportunidadByReferencia(negocio?.referencia ?? null);
    const info = parseProyectoTorre(inmueble.datos?.Proyecto_Torre);
    return {
      id,
      tieneNegocio: !!negocio,
      referencia: negocio?.referencia ?? null,
      estado: negocio?.estado ?? null,
      datos: negocio?.datos ?? null,
      saldoActual: negocio?.saldoActual ?? null,
      compradores: negocio?.compradores ?? [],
      totalMovimientos: negocio?._count?.movimientos ?? 0,
      oportunidad,
      codigoInmueble: inmueble.datos?.C_digo_inmueble ?? null,
      projectCode: inmueble.datos?.Project_Code ?? null,
      proyectoTorre: info ? formatearProyectoTorre(info) : null,
      etapa: info ? obtenerEtapaTorre(inmueble.datos.Proyecto_Torre) : null,
      inventarioDatos: inmueble.datos ?? null,
      negocioId: negocio?.id ?? null,
    };
  }

  if (id.startsWith('neg-')) {
    const negocioId = id.slice('neg-'.length);
    const negocio = await prisma.negocio.findUnique({ where: { id: negocioId }, include: INCLUDE_NEGOCIO_DETALLE });
    if (!negocio) return null;
    const oportunidad = await findOportunidadByReferencia(negocio.referencia);
    return {
      id,
      tieneNegocio: true,
      referencia: negocio.referencia,
      estado: negocio.estado,
      datos: negocio.datos,
      saldoActual: negocio.saldoActual,
      compradores: negocio.compradores,
      totalMovimientos: negocio._count.movimientos,
      oportunidad,
      codigoInmueble: null,
      projectCode: null,
      proyectoTorre: null,
      etapa: null,
      inventarioDatos: null,
      negocioId: negocio.id,
    };
  }

  return undefined;
}

// Movimientos de la fila identificada por `id` (mismo esquema de prefijo
// que obtenerNegocioPorId). Si no hay negocio vinculado, devuelve una
// página vacía en vez de error.
async function obtenerMovimientosPorId(id, { page, limit }) {
  let negocioId = null;

  if (id.startsWith('inv-')) {
    const inmueble = await prisma.inventarioItem.findUnique({ where: { id: id.slice('inv-'.length) } });
    if (!inmueble) return null;
    negocioId = await resolverNegocioIdDesdeInmueble(inmueble);
  } else if (id.startsWith('neg-')) {
    const negocio = await prisma.negocio.findUnique({ where: { id: id.slice('neg-'.length) }, select: { id: true } });
    if (!negocio) return null;
    negocioId = negocio.id;
  } else {
    return undefined;
  }

  if (!negocioId) {
    return { data: [], pagination: { total: 0, page, limit, totalPages: 0 } };
  }

  const [total, movimientos] = await Promise.all([
    prisma.negocioMovimiento.count({ where: { negocioId } }),
    prisma.negocioMovimiento.findMany({
      where: { negocioId },
      skip: (page - 1) * limit,
      take: limit,
      orderBy: [{ fechaContable: { sort: 'desc', nulls: 'last' } }, { createdAt: 'desc' }],
    }),
  ]);
  return { data: movimientos, pagination: { total, page, limit, totalPages: Math.ceil(total / limit) } };
}

module.exports = {
  prisma,
  ETAPA_POR_TORRE,
  parseProyectoTorre,
  formatearProyectoTorre,
  obtenerEtapaTorre,
  valoresProyectoTorre,
  listarNegociosInventario,
  findOportunidadByReferencia,
  resolverNegocioIdDesdeInmueble,
  obtenerNegocioPorId,
  obtenerMovimientosPorId,
};
