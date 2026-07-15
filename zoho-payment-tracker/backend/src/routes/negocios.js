const express = require('express');
const { PrismaClient } = require('@prisma/client');
const { excluirEnResumen } = require('../config/columnasExcluidas');
const {
  resolverColumnasMovPorPropietario,
  parseCompradoresCell,
  extraerDatosMovimiento,
} = require('../services/movPorPropietarioParser');

const router = express.Router();
const prisma = new PrismaClient();

// ── Helpers ────────────────────────────────────────────────────────────────

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

// Resuelve el inmueble (Product de Zoho) de cada negocio: primero por
// Referencia de Recaudo directa; si no calza (pasa cuando la Referencia
// viene truncada/enmascarada con "****" en el Excel de origen), por
// Nomenclatura → Código de inmueble, igual que el respaldo del detalle de
// negocio. Devuelve un Map de Negocio.referencia → { datos } de InventarioItem.
async function resolverInventarioPorNegocio(negocios) {
  const refs = negocios.map((n) => n.referencia);
  const items = refs.length
    ? await prisma.inventarioItem.findMany({
        where: { referenciaRecaudo: { in: refs } },
        select: { referenciaRecaudo: true, datos: true },
      })
    : [];
  const porReferencia = new Map(items.map((it) => [it.referenciaRecaudo, it]));

  const pendientes = negocios
    .filter((n) => !porReferencia.has(n.referencia))
    .map((n) => ({ referencia: n.referencia, codigo: n.datos?.Nomenclatura }))
    .filter((p) => p.codigo != null && /^\d+$/.test(String(p.codigo)));
  if (pendientes.length) {
    const encontrados = await Promise.all(
      pendientes.map((p) =>
        prisma.inventarioItem.findFirst({
          where: { datos: { path: ['C_digo_inmueble'], equals: Number(p.codigo) } },
          select: { datos: true },
        })
      )
    );
    pendientes.forEach((p, i) => {
      if (encontrados[i]) porReferencia.set(p.referencia, encontrados[i]);
    });
  }
  return porReferencia;
}

function cleanRef(ref) {
  if (ref == null) return null;
  const s = String(ref).trim().replace(/\.0+$/, '');
  return s === '' ? null : s;
}

// ── Backfill ───────────────────────────────────────────────────────────────

let backfillRunning = false;
let backfillResult = null;

// Prisma client may be outdated and silently ignore nroId in createMany.
// After each createMany, call this to set nroId via raw SQL.
async function applyNroIdRaw(negocioId, list) {
  for (const c of list) {
    if (!c.nroId) continue;
    await prisma.$executeRaw`
      UPDATE "NegocioComprador" SET "nroId" = ${c.nroId}
      WHERE "negocioId"::text = ${negocioId} AND nombre = ${c.nombre}
    `;
  }
}

function cleanStr(v) {
  if (v == null) return null;
  const s = String(v).replace(/[\r\n]/g, ' ').trim();
  return s === '' ? null : s;
}

// Extract the most recent saldo from datos, using chronological comparison for dated keys
const MONTH_MAP = { ene:0, feb:1, mar:2, abr:3, may:4, jun:5, jul:6, ago:7, sep:8, oct:9, nov:10, dic:11 };

function extractSaldoActual(datos) {
  if (!datos) return null;
  const direct = datos['Saldo Actual'];
  if (direct != null && direct !== '') {
    const n = parseFloat(String(direct).replace(/[^0-9.-]/g, ''));
    if (!isNaN(n)) return n;
  }
  const keys = Object.keys(datos).filter((k) => /^saldo\s+\w+\s+\d{4}$/i.test(k));
  let best = null, bestDate = null;
  for (const k of keys) {
    const parts = k.match(/^saldo\s+(\w+)\s+(\d{4})$/i);
    if (!parts) continue;
    const mo = MONTH_MAP[parts[1].toLowerCase().slice(0, 3)];
    if (mo === undefined) continue;
    const d = new Date(+parts[2], mo, 1);
    if (!bestDate || d > bestDate) {
      const v = datos[k];
      if (v != null && v !== '') {
        const n = parseFloat(String(v).replace(/[^0-9.-]/g, ''));
        if (!isNaN(n)) { best = n; bestDate = d; }
      }
    }
  }
  return best;
}

// Find the real header row in stored filas by scanning for a known column name at a known index.
// Returns { headers, dataRows } or null if not found.
function findHeaderInStoredFilas(filas, knownCol, knownIdx) {
  for (let i = 0; i < Math.min(filas.length, 8); i++) {
    const row = filas[i] || [];
    if (cleanStr(row[knownIdx])?.toLowerCase() === knownCol.toLowerCase()) {
      return { headers: row.map((c) => cleanStr(c) ?? ''), dataRows: filas.slice(i + 1) };
    }
  }
  return null;
}

async function runBackfill() {
  if (backfillRunning) return;
  backfillRunning = true;
  backfillResult = null;
  const startedAt = Date.now();

  try {
    // Wipe existing Negocio data so we start fresh
    await prisma.negocioMovimiento.deleteMany({});
    await prisma.negocioComprador.deleteMany({});
    await prisma.negocio.deleteMany({});

    const hojas = await prisma.hojaFiduciaria.findMany({
      where: { nombreHoja: { in: ['Movimientos', 'Mov_Por_Propietario'] } },
      select: { nombreHoja: true, columnas: true, filas: true },
      orderBy: { createdAt: 'asc' },
    });

    // ── Phase 1: Resumen sheet → upsert Negocio.datos + estado ────────────
    for (const hoja of hojas.filter((h) => h.nombreHoja === 'Movimientos')) {
      const filas = Array.isArray(hoja.filas) ? hoja.filas : [];
      const storedCols = Array.isArray(hoja.columnas) ? hoja.columnas : [];
      // Two file shapes must both resolve to a header + data rows:
      //  - legacy: header leaked into stored `filas` (col 8 = 'Referencia') → scan for it
      //  - current: header correctly captured as `columnas`, `filas` is pure data
      let headers, dataRows;
      const found = findHeaderInStoredFilas(filas, 'Referencia', 7);
      if (found) {
        ({ headers, dataRows } = found);
      } else if (storedCols.findIndex((c) => (c || '').toLowerCase().trim() === 'referencia') === 7) {
        headers = storedCols.map((c) => cleanStr(c) ?? '');
        dataRows = filas;
      } else {
        console.warn('[backfill] Resumen: header row not found'); continue;
      }
      const estadoIdx = headers.findIndex((h) => h.toLowerCase() === 'estado');

      const propietariosIdx = headers.findIndex((h) => h.toLowerCase() === 'propietarios');

      for (const row of dataRows) {
        const referencia = cleanRef(cleanStr(row[7]));
        if (!referencia) continue;
        const estado = estadoIdx !== -1 ? cleanStr(row[estadoIdx]) : null;
        const datos = {};
        headers.forEach((col, idx) => {
          if (!col || excluirEnResumen(col)) return; // columnas "no aplica" / uso futuro
          const v = cleanStr(row[idx]);
          if (v !== null) datos[col] = v;
        });
        const saldoActual = extractSaldoActual(datos);
        const negocio = await prisma.negocio.upsert({
          where: { referencia },
          create: { referencia, estado, datos, saldoActual },
          update: { estado, datos, saldoActual },
        });

        // Seed compradores from Propietarios column (only if Mov_Por_Propietario hasn't already set them)
        if (propietariosIdx !== -1) {
          const comps = parseCompradoresCell(row[propietariosIdx], null, null);
          if (comps.length > 0) {
            const existing = await prisma.negocioComprador.count({ where: { negocioId: negocio.id } });
            if (existing === 0) {
              await prisma.negocioComprador.createMany({
                data: comps.map((c, i) => ({
                  negocioId: negocio.id, nombre: c.nombre, nroId: c.nroId,
                  porcentaje: c.porcentaje, orden: i,
                })),
              });
              await applyNroIdRaw(negocio.id, comps);
            }
          }
        }
      }
    }

    // ── Phase 2: Mov_Por_Propietario → compradores + movements ────────────
    for (const hoja of hojas.filter((h) => h.nombreHoja === 'Mov_Por_Propietario')) {
      const filas = Array.isArray(hoja.filas) ? hoja.filas : [];
      // Stored columnas are correct for this sheet (auto-detection picked the right row)
      const storedCols = Array.isArray(hoja.columnas) ? hoja.columnas : [];
      const idx = resolverColumnasMovPorPropietario(storedCols);

      const negMap = new Map();
      for (const row of filas) {
        const referencia = cleanRef(cleanStr(row[idx.negRefIdx]));
        if (!referencia) continue;

        if (!negMap.has(referencia)) negMap.set(referencia, { compradores: new Map(), movimientos: [] });
        const entry = negMap.get(referencia);

        const comps = parseCompradoresCell(row[idx.propIdx], row[idx.nroIdIdx], idx.pctIdx !== -1 ? row[idx.pctIdx] : null);
        for (const comp of comps) {
          const byId   = comp.nroId ? entry.compradores.get(comp.nroId) : undefined;
          const byName = entry.compradores.get(comp.nombre);
          if (byId) {
            // Already known by cedula — nothing to do
          } else if (byName) {
            // Known by name — enrich with cedula if we now have it
            if (comp.nroId) {
              entry.compradores.delete(comp.nombre);
              entry.compradores.set(comp.nroId, { ...byName, nroId: comp.nroId });
            }
          } else {
            const key = comp.nroId || comp.nombre;
            entry.compradores.set(key, { ...comp, orden: entry.compradores.size });
          }
        }

        const mov = extraerDatosMovimiento(row, idx);
        if (mov) entry.movimientos.push({ ...mov, referencia });
      }

      let compCount = 0, movCount = 0;
      for (const [referencia, entry] of negMap.entries()) {
        let neg = await prisma.negocio.findUnique({ where: { referencia } });
        if (!neg) neg = await prisma.negocio.create({ data: { referencia } });

        const list = [...entry.compradores.values()];
        if (list.length > 0) {
          await prisma.negocioComprador.deleteMany({ where: { negocioId: neg.id } });
          await prisma.negocioComprador.createMany({
            data: list.map((c) => ({ negocioId: neg.id, nombre: c.nombre, nroId: c.nroId, porcentaje: c.porcentaje, orden: c.orden })),
          });
          await applyNroIdRaw(neg.id, list);
          compCount += list.length;
        }

        const ids = entry.movimientos.map((m) => m.idMovimiento);
        const existing = await prisma.negocioMovimiento.findMany({ where: { idMovimiento: { in: ids } }, select: { idMovimiento: true } });
        const existingSet = new Set(existing.map((m) => m.idMovimiento));
        const toInsert = entry.movimientos.filter((m) => !existingSet.has(m.idMovimiento));
        if (toInsert.length > 0) {
          const BATCH = 100;
          for (let i = 0; i < toInsert.length; i += BATCH) {
            await prisma.negocioMovimiento.createMany({
              data: toInsert.slice(i, i + BATCH).map((m) => ({
                negocioId: neg.id, referencia: m.referencia, idMovimiento: m.idMovimiento,
                fechaContable: m.fechaContable ?? null, datos: m.datos,
              })),
            });
          }
          movCount += toInsert.length;
        }
      }
      console.log(`[backfill] Mov_Por_Propietario: ${compCount} compradores, ${movCount} movimientos`);
    }

    const total = await prisma.negocio.count();
    const elapsed = ((Date.now() - startedAt) / 1000).toFixed(1);
    backfillResult = { ok: true, negocios: total, elapsed: `${elapsed}s` };
    console.log(`[backfill] Listo: ${total} negocios en ${elapsed}s`);
  } catch (err) {
    backfillResult = { ok: false, error: err.message };
    console.error('[backfill] Error:', err.message);
  } finally {
    backfillRunning = false;
  }
}

// POST /api/negocios/backfill — extrae datos de MovimientoFiduciario existente
router.post('/backfill', (req, res) => {
  if (backfillRunning) {
    return res.json({ message: 'Backfill ya en ejecución', running: true });
  }
  res.json({ message: 'Backfill iniciado en segundo plano', running: true });
  runBackfill();
});

// GET /api/negocios/backfill/status
router.get('/backfill/status', (req, res) => {
  res.json({
    running: backfillRunning,
    result: backfillResult,
  });
});

// ── CRUD ───────────────────────────────────────────────────────────────────

// GET /api/negocios?search=&estado=&etapa=&page=&limit=
router.get('/', async (req, res) => {
  try {
    const { search, estado, etapa, saldoPendiente, page = '1', limit = '50' } = req.query;
    const pageNum = Math.max(1, parseInt(page));
    const limitNum = Math.min(9999, Math.max(1, parseInt(limit)));

    const noFilters = !search && !estado && !etapa;

    // Etapa de cada negocio (vía su inmueble asociado), solo cuando hace
    // falta: para poblar las opciones del filtro (sin filtros activos) o
    // para resolver qué negocios caen en la etapa pedida.
    let etapaPorReferencia = null;
    if (noFilters || etapa) {
      const todosNegocios = await prisma.negocio.findMany({ select: { referencia: true, datos: true } });
      const inventarioPorNegocio = await resolverInventarioPorNegocio(todosNegocios);
      etapaPorReferencia = new Map(
        todosNegocios.map((n) => [n.referencia, obtenerEtapaTorre(inventarioPorNegocio.get(n.referencia)?.datos?.Proyecto_Torre)])
      );
    }

    const where = {};
    const andConditions = [];
    if (estado) where.estado = { contains: estado, mode: 'insensitive' };
    if (saldoPendiente === 'true') where.saldoActual = { gt: 0 };
    if (search) {
      andConditions.push({
        OR: [
          { referencia: { contains: search, mode: 'insensitive' } },
          { compradores: { some: { nombre: { contains: search, mode: 'insensitive' } } } },
          { compradores: { some: { nroId: { contains: search, mode: 'insensitive' } } } },
          { datos: { path: ['Nomenclatura'], string_contains: search } },
        ],
      });
    }
    if (etapa) {
      const referenciasEtapa = [...etapaPorReferencia.entries()]
        .filter(([, et]) => et === etapa)
        .map(([referencia]) => referencia);
      andConditions.push({ referencia: { in: referenciasEtapa } });
    }
    if (andConditions.length) where.AND = andConditions;

    const [total, negocios, estadosRaw] = await Promise.all([
      prisma.negocio.count({ where }),
      prisma.negocio.findMany({
        where,
        skip: (pageNum - 1) * limitNum,
        take: limitNum,
        orderBy: { referencia: 'asc' },
        include: {
          compradores: { orderBy: { orden: 'asc' } },
          _count: { select: { movimientos: true } },
        },
      }),
      noFilters
        ? prisma.negocio.findMany({
            select: { estado: true },
            where: { estado: { not: null } },
            distinct: ['estado'],
            orderBy: { estado: 'asc' },
          })
        : Promise.resolve(null),
    ]);

    // Project Code / Proyecto+Torre+Etapa de Zoho Products para esta página,
    // con el mismo respaldo por Nomenclatura que usa el detalle de negocio
    // cuando la Referencia de Recaudo viene truncada/enmascarada en el Excel.
    const inventarioPorNegocioPagina = await resolverInventarioPorNegocio(negocios);

    res.json({
      data: negocios.map((n) => {
        const inv = inventarioPorNegocioPagina.get(n.referencia);
        const info = parseProyectoTorre(inv?.datos?.Proyecto_Torre);
        return {
          id: n.id,
          referencia: n.referencia,
          estado: n.estado,
          datos: n.datos,
          saldoActual: n.saldoActual,
          compradores: n.compradores,
          totalMovimientos: n._count.movimientos,
          projectCode: inv?.datos?.Project_Code ?? null,
          proyectoTorre: info ? formatearProyectoTorre(info) : null,
          etapa: info ? obtenerEtapaTorre(inv.datos.Proyecto_Torre) : null,
        };
      }),
      pagination: {
        total,
        page: pageNum,
        limit: limitNum,
        totalPages: Math.ceil(total / limitNum),
      },
      ...(estadosRaw ? { estados: estadosRaw.map((e) => e.estado).filter(Boolean) } : {}),
      ...(noFilters ? { etapas: [...new Set(etapaPorReferencia.values())].sort((a, b) => Number(a) - Number(b)) } : {}),
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/negocios/movimientos — todos los movimientos con contexto de negocio
router.get('/movimientos', async (req, res) => {
  try {
    const { search, fideicomiso, estado, tipoMovimiento, estadoMovimiento, fechaDesde, fechaHasta, page = '1', limit = '50' } = req.query;
    const pageNum = Math.max(1, parseInt(page));
    const limitNum = Math.min(200, Math.max(1, parseInt(limit)));

    // Filtros que viven en el modelo Negocio
    const negocioWhere = {};
    if (estado) negocioWhere.estado = { contains: estado, mode: 'insensitive' };
    if (fideicomiso) negocioWhere.datos = { path: ['Fideicomiso'], string_contains: fideicomiso };
    if (search) {
      negocioWhere.OR = [
        { referencia: { contains: search, mode: 'insensitive' } },
        { compradores: { some: { nombre: { contains: search, mode: 'insensitive' } } } },
        { compradores: { some: { nroId:   { contains: search, mode: 'insensitive' } } } },
        { datos: { path: ['Nomenclatura'], string_contains: search } },
      ];
    }

    // Resolver IDs de negocios que coinciden con los filtros de negocio
    const hasNegocioFilters = Object.keys(negocioWhere).length > 0;
    let negocioIds = null;
    if (hasNegocioFilters) {
      const matching = await prisma.negocio.findMany({
        where: negocioWhere,
        select: { id: true },
      });
      negocioIds = matching.map((n) => n.id);
      // Si hay filtros de negocio pero ninguno coincide, devolver vacío
      if (negocioIds.length === 0) {
        return res.json({
          data: [],
          pagination: { total: 0, page: pageNum, limit: limitNum, totalPages: 0 },
          fideicomisos: [],
          estados: [],
          tiposMovimiento: [],
          estadosMovimiento: [],
        });
      }
    }

    // Filtros que viven en NegocioMovimiento
    const movWhere = {};

    // Condición OR: negocios que coinciden O idMovimiento que coincide
    const orConditions = [];
    if (negocioIds !== null) {
      orConditions.push({ negocioId: { in: negocioIds } });
    }
    if (search) {
      orConditions.push({ idMovimiento: { contains: search, mode: 'insensitive' } });
    }
    if (orConditions.length > 0) {
      movWhere.OR = orConditions;
    }
    if (tipoMovimiento) {
      movWhere.AND = [...(movWhere.AND || []), { datos: { path: ['Tipo Movimiento'], equals: tipoMovimiento } }];
    }
    if (estadoMovimiento) {
      movWhere.AND = [...(movWhere.AND || []), { datos: { path: ['Estado'], equals: estadoMovimiento } }];
    }
    if (fechaDesde || fechaHasta) {
      movWhere.fechaContable = {};
      if (fechaDesde) movWhere.fechaContable.gte = new Date(fechaDesde);
      if (fechaHasta) {
        const d = new Date(fechaHasta);
        d.setHours(23, 59, 59, 999);
        movWhere.fechaContable.lte = d;
      }
    }

    const [total, movimientos] = await Promise.all([
      prisma.negocioMovimiento.count({ where: movWhere }),
      prisma.negocioMovimiento.findMany({
        where: movWhere,
        skip: (pageNum - 1) * limitNum,
        take: limitNum,
        orderBy: [{ fechaContable: { sort: 'desc', nulls: 'last' } }, { createdAt: 'desc' }],
        include: {
          negocio: {
            include: { compradores: { orderBy: { orden: 'asc' } } },
          },
        },
      }),
    ]);

    // Opciones de filtro — siempre se devuelven
    const [fideicomisosRaw, estadosRaw, tiposMovRaw, estadosMovRaw] = await Promise.all([
      prisma.$queryRaw`SELECT DISTINCT datos->>'Fideicomiso' AS fideicomiso FROM "Negocio" WHERE datos->>'Fideicomiso' IS NOT NULL AND datos->>'Fideicomiso' != '' ORDER BY 1`,
      prisma.negocio.findMany({ select: { estado: true }, where: { estado: { not: null } }, distinct: ['estado'], orderBy: { estado: 'asc' } }),
      prisma.$queryRaw`SELECT DISTINCT datos->>'Tipo Movimiento' AS tipo FROM "NegocioMovimiento" WHERE datos->>'Tipo Movimiento' IS NOT NULL AND datos->>'Tipo Movimiento' != '' ORDER BY 1`,
      prisma.$queryRaw`SELECT DISTINCT datos->>'Estado' AS estado FROM "NegocioMovimiento" WHERE datos->>'Estado' IS NOT NULL AND datos->>'Estado' != '' ORDER BY 1`,
    ]);

    res.json({
      data: movimientos.map((m) => ({
        id: m.id,
        referencia: m.referencia,
        fechaContable: m.fechaContable,
        datos: m.datos,
        negocio: m.negocio
          ? {
              estado: m.negocio.estado,
              fideicomiso: m.negocio.datos?.Fideicomiso ?? null,
              nomenclatura: m.negocio.datos?.Nomenclatura ?? null,
              inventario: m.negocio.datos?.Inventario ?? null,
              compradores: m.negocio.compradores,
            }
          : null,
      })),
      pagination: { total, page: pageNum, limit: limitNum, totalPages: Math.ceil(total / limitNum) },
      ...(fideicomisosRaw ? { fideicomisos: fideicomisosRaw.map((r) => r.fideicomiso).filter(Boolean) } : {}),
      ...(estadosRaw ? { estados: estadosRaw.map((e) => e.estado).filter(Boolean) } : {}),
      ...(tiposMovRaw ? { tiposMovimiento: tiposMovRaw.map((r) => r.tipo).filter(Boolean) } : {}),
      ...(estadosMovRaw ? { estadosMovimiento: estadosMovRaw.map((r) => r.estado).filter(Boolean) } : {}),
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/negocios/stats — resumen agregado para el dashboard
router.get('/stats', async (_req, res) => {
  try {
    const [total, conSaldo, saldoAgg, porEstado, porFideicomiso] = await Promise.all([
      prisma.negocio.count(),
      prisma.negocio.count({ where: { saldoActual: { gt: 0 } } }),
      prisma.negocio.aggregate({ _sum: { saldoActual: true } }),
      prisma.$queryRaw`
        SELECT COALESCE(estado, 'Sin estado') AS estado,
               COUNT(*)::int                  AS count,
               COALESCE(SUM("saldoActual"), 0)::float AS saldo
        FROM "Negocio"
        GROUP BY estado
        ORDER BY COUNT(*) DESC
      `,
      prisma.$queryRaw`
        SELECT datos->>'Fideicomiso'                   AS fideicomiso,
               COUNT(*)::int                           AS count,
               COALESCE(SUM("saldoActual"), 0)::float  AS saldo
        FROM "Negocio"
        WHERE datos->>'Fideicomiso' IS NOT NULL AND datos->>'Fideicomiso' != ''
        GROUP BY datos->>'Fideicomiso'
        ORDER BY COUNT(*) DESC
      `,
    ]);

    res.json({
      totalNegocios: total,
      conSaldo,
      saldoTotal: saldoAgg._sum.saldoActual ?? 0,
      porEstado: porEstado.map((r) => ({ estado: r.estado, count: Number(r.count), saldo: Number(r.saldo) })),
      porFideicomiso: porFideicomiso.map((r) => ({ fideicomiso: r.fideicomiso, count: Number(r.count), saldo: Number(r.saldo) })),
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Busca la oportunidad de Zoho vinculada a un negocio por su referencia.
// La clave de unión es Negocio.referencia ↔ Opportunity.referenciaRecaudo.
async function findOportunidadByReferencia(referencia) {
  const select = {
    id: true, dealName: true, stage: true, referenciaRecaudo: true,
    pagoSeparacion: true, fechaInicioPlanPagos: true, camposFinancieros: true,
    seccionInmueble: true, lastSyncedAt: true,
  };
  // Coincidencia exacta primero; luego tolerante a espacios/formato.
  let opp = await prisma.opportunity.findFirst({ where: { referenciaRecaudo: referencia }, select });
  if (!opp && referencia && referencia.length >= 6) {
    opp = await prisma.opportunity.findFirst({
      where: { referenciaRecaudo: { contains: referencia, mode: 'insensitive' } },
      select,
    });
  }
  return opp;
}

// GET /api/negocios/:referencia
router.get('/:referencia', async (req, res) => {
  try {
    const referencia = decodeURIComponent(req.params.referencia);
    const negocio = await prisma.negocio.findUnique({
      where: { referencia },
      include: {
        compradores: { orderBy: { orden: 'asc' } },
        _count: { select: { movimientos: true } },
      },
    });
    if (!negocio) return res.status(404).json({ error: 'Negocio no encontrado' });
    const oportunidad = await findOportunidadByReferencia(referencia);
    // Código de Inmueble de Zoho Products — cruzado por la misma Referencia
    // de Recaudo que ya se usa para vincular Negocio ↔ InventarioItem.
    // Si no hay match directo (pasa en ~57 casos), dos respaldos en orden:
    //  1. El Inmueble.id que trae la oportunidad de Zoho vinculada (el dato
    //     "oficial" — el lookup real de Deals a Products), cuando exista.
    //  2. La Nomenclatura del Excel cuando venga en crudo como el código
    //     numérico de Zoho (heurística, pero cubre casos sin oportunidad).
    let inmueble = await prisma.inventarioItem.findFirst({
      where: { referenciaRecaudo: referencia },
      select: { datos: true },
    });
    if (!inmueble) {
      const inmuebleId = oportunidad?.seccionInmueble?.Inmueble?.id;
      if (inmuebleId) {
        inmueble = await prisma.inventarioItem.findFirst({
          where: { zohoId: inmuebleId },
          select: { datos: true },
        });
      }
    }
    if (!inmueble) {
      const nomenclatura = negocio.datos?.Nomenclatura;
      if (nomenclatura != null && /^\d+$/.test(String(nomenclatura))) {
        inmueble = await prisma.inventarioItem.findFirst({
          where: { datos: { path: ['C_digo_inmueble'], equals: Number(nomenclatura) } },
          select: { datos: true },
        });
      }
    }
    const codigoInmueble = inmueble?.datos?.C_digo_inmueble ?? null;
    const projectCode = inmueble?.datos?.Project_Code ?? null;
    res.json({ ...negocio, totalMovimientos: negocio._count.movimientos, oportunidad, codigoInmueble, projectCode });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/negocios/:referencia/movimientos?page=&limit=
router.get('/:referencia/movimientos', async (req, res) => {
  try {
    const referencia = decodeURIComponent(req.params.referencia);
    const { page = '1', limit = '50' } = req.query;
    const pageNum = Math.max(1, parseInt(page));
    const limitNum = Math.min(200, Math.max(1, parseInt(limit)));

    const negocio = await prisma.negocio.findUnique({ where: { referencia } });
    if (!negocio) return res.status(404).json({ error: 'Negocio no encontrado' });

    const [total, movimientos] = await Promise.all([
      prisma.negocioMovimiento.count({ where: { negocioId: negocio.id } }),
      prisma.negocioMovimiento.findMany({
        where: { negocioId: negocio.id },
        skip: (pageNum - 1) * limitNum,
        take: limitNum,
        orderBy: [{ fechaContable: { sort: 'desc', nulls: 'last' } }, { createdAt: 'desc' }],
      }),
    ]);

    res.json({
      data: movimientos,
      pagination: { total, page: pageNum, limit: limitNum, totalPages: Math.ceil(total / limitNum) },
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
module.exports.runBackfill = runBackfill;
