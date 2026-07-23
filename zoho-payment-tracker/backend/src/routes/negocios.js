const express = require('express');
const { PrismaClient } = require('@prisma/client');
const { excluirEnResumen } = require('../config/columnasExcluidas');
const {
  resolverColumnasMovPorPropietario,
  parseCompradoresCell,
  extraerDatosMovimiento,
} = require('../services/movPorPropietarioParser');
const {
  listarNegociosInventario,
  obtenerNegocioPorId,
  obtenerMovimientosPorId,
  estadisticasPorEtapaYFrente,
} = require('../services/inventarioNegocioService');
const { obtenerDashboardRecaudo, obtenerCarteraMora, invalidarCacheDashboard } = require('../services/dashboardRecaudoService');

const router = express.Router();
const prisma = new PrismaClient();

// ── Helpers ────────────────────────────────────────────────────────────────

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

// Corre `fn` sobre `items` en lotes concurrentes en vez de uno-por-uno
// secuencial -- contra una base de datos remota, el cuello de botella es la
// latencia de ida y vuelta de cada query, no el trabajo en si, asi que
// paralelizar dentro de cada lote da una mejora de velocidad enorme.
async function runBatched(items, batchSize, fn) {
  for (let i = 0; i < items.length; i += batchSize) {
    const batch = items.slice(i, i + batchSize);
    await Promise.all(batch.map(fn));
  }
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

    // Traer solo los IDs livianos primero -- cargar columnas+filas (JSON grande)
    // hoja por hoja evita mantener las 630K+ filas de las 285 hojas en memoria
    // a la vez, que parecia estar colgando el proceso sin avisar (sin query
    // activa ni uso de CPU visible, posiblemente por presion de memoria en el
    // motor nativo de Prisma).
    const hojaIds = await prisma.hojaFiduciaria.findMany({
      where: { nombreHoja: { in: ['Movimientos', 'Mov_Por_Propietario'] } },
      select: { id: true, nombreHoja: true },
      orderBy: { createdAt: 'asc' },
    });

    // ── Phase 1: Resumen sheet → upsert Negocio.datos + estado ────────────
    // Primero se acumula en memoria (deduplicado por referencia, ultima hoja
    // gana para estado/datos/saldo, primera hoja con Propietarios gana para
    // el seed de compradores -- mismo criterio que antes) y solo AL FINAL se
    // escribe a la base de datos, en lotes concurrentes en vez de una fila a
    // la vez. Con overlap de referencias entre hojas (confirmado: el conteo
    // de Negocio se estancaba mientras seguian llegando filas) esto tambien
    // reduce muchisimo el numero total de escrituras.
    const __hojasFase1 = hojaIds.filter((h) => h.nombreHoja === 'Movimientos');
    const resumenMap = new Map();
    for (const hojaRef of __hojasFase1) {
      const hoja = await prisma.hojaFiduciaria.findUnique({
        where: { id: hojaRef.id },
        select: { columnas: true, filas: true },
      });
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
        const propietariosRaw = propietariosIdx !== -1 ? row[propietariosIdx] : null;

        const existing = resumenMap.get(referencia);
        if (!existing) {
          resumenMap.set(referencia, { estado, datos, saldoActual, propietariosRaw });
        } else {
          existing.estado = estado;
          existing.datos = datos;
          existing.saldoActual = saldoActual;
          if (!existing.propietariosRaw && propietariosRaw) existing.propietariosRaw = propietariosRaw;
        }
      }
    }

    const resumenEntries = [...resumenMap.entries()];
    await runBatched(resumenEntries, 20, async ([referencia, data]) => {
      const negocio = await prisma.negocio.upsert({
        where: { referencia },
        create: { referencia, estado: data.estado, datos: data.datos, saldoActual: data.saldoActual },
        update: { estado: data.estado, datos: data.datos, saldoActual: data.saldoActual },
      });

      // Seed compradores from Propietarios column (only if Mov_Por_Propietario hasn't already set them)
      if (data.propietariosRaw) {
        const comps = parseCompradoresCell(data.propietariosRaw, null, null);
        if (comps.length > 0) {
          const existingComps = await prisma.negocioComprador.count({ where: { negocioId: negocio.id } });
          if (existingComps === 0) {
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
    });

    // ── Phase 2: Mov_Por_Propietario → compradores + movements ────────────
    const __hojasFase2 = hojaIds.filter((h) => h.nombreHoja === 'Mov_Por_Propietario');
    for (const hojaRef of __hojasFase2) {
      const hoja = await prisma.hojaFiduciaria.findUnique({
        where: { id: hojaRef.id },
        select: { columnas: true, filas: true },
      });
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

      const negMapEntries = [...negMap.entries()];

      // Una sola consulta para saber que negocios y que idMovimiento ya
      // existen, en vez de una consulta de cada tipo por cada uno de los
      // ~300 negocios de la hoja -- muchas hojas son reexportaciones
      // acumuladas con enorme solapamiento (confirmado: varias hojas
      // seguidas agregaban 0-6 movimientos nuevos sobre miles de filas), asi
      // que la mayoria de estas consultas serian redundantes de todas formas.
      const referenciasHoja = negMapEntries.map(([r]) => r);
      const idsMovHoja = negMapEntries.flatMap(([, entry]) => entry.movimientos.map((m) => m.idMovimiento));
      const [existingNegocios, existingMovIds] = await Promise.all([
        prisma.negocio.findMany({ where: { referencia: { in: referenciasHoja } }, select: { id: true, referencia: true } }),
        idsMovHoja.length > 0
          ? prisma.negocioMovimiento.findMany({ where: { idMovimiento: { in: idsMovHoja } }, select: { idMovimiento: true } })
          : [],
      ]);
      const negocioByRef = new Map(existingNegocios.map((n) => [n.referencia, n]));
      const existingMovSet = new Set(existingMovIds.map((m) => m.idMovimiento));

      let compCount = 0, movCount = 0;
      await runBatched(negMapEntries, 20, async ([referencia, entry]) => {
        let neg = negocioByRef.get(referencia);
        if (!neg) {
          neg = await prisma.negocio.create({ data: { referencia } });
          negocioByRef.set(referencia, neg);
        }

        const list = [...entry.compradores.values()];
        if (list.length > 0) {
          await prisma.negocioComprador.deleteMany({ where: { negocioId: neg.id } });
          await prisma.negocioComprador.createMany({
            data: list.map((c) => ({ negocioId: neg.id, nombre: c.nombre, nroId: c.nroId, porcentaje: c.porcentaje, orden: c.orden })),
          });
          await applyNroIdRaw(neg.id, list);
          compCount += list.length;
        }

        const toInsert = entry.movimientos.filter((m) => !existingMovSet.has(m.idMovimiento));
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
      });
      console.log(`[backfill] Mov_Por_Propietario: ${compCount} compradores, ${movCount} movimientos`);
    }

    const total = await prisma.negocio.count();
    const elapsed = ((Date.now() - startedAt) / 1000).toFixed(1);
    backfillResult = { ok: true, negocios: total, elapsed: `${elapsed}s` };
    console.log(`[backfill] Listo: ${total} negocios en ${elapsed}s`);
    invalidarCacheDashboard();
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

// GET /api/negocios?search=&estado=&etapa=&frente=&torre=&saldoPendiente=&page=&limit=
router.get('/', async (req, res) => {
  try {
    const { search, estado, etapa, frente, torre, saldoPendiente, conMovimientos, page = '1', limit = '50' } = req.query;
    const pageNum = Math.max(1, parseInt(page));
    const limitNum = Math.min(9999, Math.max(1, parseInt(limit)));
    const noFilters = !search && !estado && !etapa && !frente && !torre;

    const [{ data, total, etapasDisponibles, frentesDisponibles, frentesPorEtapa, torresPorFrente, torresPorEtapaFrente }, estadosRaw] = await Promise.all([
      listarNegociosInventario({ search, estado, etapa, frente, torre, saldoPendiente, conMovimientos, page: pageNum, limit: limitNum }),
      noFilters
        ? prisma.negocio.findMany({
            select: { estado: true },
            where: { estado: { not: null } },
            distinct: ['estado'],
            orderBy: { estado: 'asc' },
          })
        : Promise.resolve(null),
    ]);

    res.json({
      data,
      pagination: {
        total,
        page: pageNum,
        limit: limitNum,
        totalPages: Math.ceil(total / limitNum),
      },
      ...(estadosRaw ? { estados: estadosRaw.map((e) => e.estado).filter(Boolean) } : {}),
      ...(noFilters ? { etapas: etapasDisponibles, frentes: frentesDisponibles, frentesPorEtapa, torresPorFrente, torresPorEtapaFrente } : {}),
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
    const [totalInmuebles, total, conSaldo, saldoAgg, porEstado, { porEtapa, porFrente }] = await Promise.all([
      prisma.inventarioItem.count(),
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
      estadisticasPorEtapaYFrente(),
    ]);

    res.json({
      totalInmuebles,
      totalNegocios: total,
      conSaldo,
      saldoTotal: saldoAgg._sum.saldoActual ?? 0,
      porEstado: porEstado.map((r) => ({ estado: r.estado, count: Number(r.count), saldo: Number(r.saldo) })),
      porEtapa,
      porFrente,
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/negocios/dashboard-recaudo?search=&etapa=&frente=&torre=&conMovimientos=&sortBy=&sortDir=&page=&limit=
router.get('/dashboard-recaudo', async (req, res) => {
  try {
    const { search, etapa, frente, torre, conMovimientos, sortBy, sortDir, page = '1', limit = '50' } = req.query;
    const pageNum = Math.max(1, parseInt(page));
    const limitNum = Math.min(9999, Math.max(1, parseInt(limit)));
    const resultado = await obtenerDashboardRecaudo({ search, etapa, frente, torre, conMovimientos, sortBy, sortDir, page: pageNum, limit: limitNum });
    res.json(resultado);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/negocios/cartera-mora?search=&etapa=&frente=&torre=&rango=&vista=&sortBy=&sortDir=&page=&limit=
router.get('/cartera-mora', async (req, res) => {
  try {
    const { search, etapa, frente, torre, rango, vista, sortBy, sortDir, page = '1', limit = '50' } = req.query;
    const pageNum = Math.max(1, parseInt(page));
    const limitNum = Math.min(9999, Math.max(1, parseInt(limit)));
    const resultado = await obtenerCarteraMora({ search, etapa, frente, torre, rango, vista, sortBy, sortDir, page: pageNum, limit: limitNum });
    res.json(resultado);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/negocios/:id  (id = "inv-<InventarioItem.id>" o "neg-<Negocio.id>")
router.get('/:id', async (req, res) => {
  try {
    const id = decodeURIComponent(req.params.id);
    const detalle = await obtenerNegocioPorId(id);
    if (detalle === undefined) return res.status(400).json({ error: 'Id inválido' });
    if (detalle === null) return res.status(404).json({ error: 'No encontrado' });
    res.json(detalle);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/negocios/:id/movimientos?page=&limit=
router.get('/:id/movimientos', async (req, res) => {
  try {
    const id = decodeURIComponent(req.params.id);
    const { page = '1', limit = '50' } = req.query;
    const pageNum = Math.max(1, parseInt(page));
    const limitNum = Math.min(200, Math.max(1, parseInt(limit)));

    const resultado = await obtenerMovimientosPorId(id, { page: pageNum, limit: limitNum });
    if (resultado === undefined) return res.status(400).json({ error: 'Id inválido' });
    if (resultado === null) return res.status(404).json({ error: 'No encontrado' });
    res.json(resultado);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
module.exports.runBackfill = runBackfill;
