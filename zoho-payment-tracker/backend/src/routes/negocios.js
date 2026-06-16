const express = require('express');
const { PrismaClient } = require('@prisma/client');
const { excluirEnResumen, excluirEnMovimiento } = require('../config/columnasExcluidas');

const router = express.Router();
const prisma = new PrismaClient();

// ── Helpers ────────────────────────────────────────────────────────────────

function cleanRef(ref) {
  if (ref == null) return null;
  const s = String(ref).trim().replace(/\.0+$/, '');
  return s === '' ? null : s;
}

// Parse one or many compradores from a raw cell.
// Handles all known formats:
//   Single:  "NOMBRE (100%)"  /  "12345678 NOMBRE (100%)"  /  "NOMBRE"
//   Multi:   "NOMBRE_A (12.5%) 28869349 NOMBRE_B (12.5%) ..."
// rawNroId / rawPct are separate columns used only when the name cell is plain text.
// Always returns an array (empty if nothing parseable).
function parseCompradoresCell(rawNombre, rawNroId, rawPct) {
  if (!rawNombre || String(rawNombre).trim() === '') return [];
  const s = String(rawNombre).replace(/[\r\n]/g, ' ').trim();

  const pctPattern = /\((\d+\.?\d*)%\)/g;
  const segments = [];
  let lastEnd = 0;
  let m;
  while ((m = pctPattern.exec(s)) !== null) {
    segments.push({ text: s.slice(lastEnd, m.index).trim(), pct: parseFloat(m[1]) });
    lastEnd = m.index + m[0].length;
  }
  const remaining = s.slice(lastEnd).trim();
  if (remaining) segments.push({ text: remaining, pct: null });

  // Single-person path: no embedded (PCT%) — use separate columns
  if (segments.length === 1 && segments[0].pct === null) {
    const nombre = segments[0].text.replace(/^\d+\s+/, '').trim();
    let porcentaje = null;
    if (rawPct != null) {
      const p = parseFloat(String(rawPct).replace(/[^0-9.]/g, ''));
      if (!isNaN(p)) porcentaje = p;
    }
    const nroId = rawNroId != null ? String(rawNroId).trim() || null : null;
    return nombre ? [{ nombre, nroId, porcentaje }] : [];
  }

  const isSingleEmbedded = segments.length === 1; // one person, pct was embedded
  return segments
    .map(({ text, pct }) => {
      const clean = text.replace(/^\|+\s*/, ''); // strip | separator that Excel embeds
      if (!clean) return null;
      const idMatch = clean.match(/^(\d{4,12})\s+([\s\S]+)/);
      let nroId = idMatch ? idMatch[1] : null;
      // Single person with embedded (%): use separate rawNroId column if no ID in text
      if (!nroId && isSingleEmbedded && rawNroId != null) {
        nroId = String(rawNroId).trim() || null;
      }
      const nombre = (idMatch ? idMatch[2] : clean).trim();
      return nombre ? { nombre, nroId, porcentaje: pct } : null;
    })
    .filter(Boolean);
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

// Parse date string: "dd/mm/yyyy", "dd-mm-yyyy", or Excel serial number → Date
function parseFechaStr(s) {
  if (!s) return null;
  const str = String(s).trim();
  // Excel serial (integer ≥ 20000 → year ≥ 1954)
  if (/^\d+$/.test(str)) {
    const serial = parseInt(str, 10);
    if (serial >= 20000) {
      const dt = new Date((serial - 25569) * 86400000);
      return isNaN(dt.getTime()) ? null : dt;
    }
  }
  // dd/mm/yyyy or dd-mm-yyyy
  const m = str.match(/^(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{4})$/);
  if (!m) return null;
  const dt = new Date(+m[3], +m[2] - 1, +m[1]);
  return isNaN(dt.getTime()) ? null : dt;
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
      // Stored filas: old parser used wrong header, real header is at filas[2] (col 8 = 'Referencia')
      const found = findHeaderInStoredFilas(filas, 'Referencia', 7);
      if (!found) { console.warn('[backfill] Resumen: header row not found'); continue; }
      const { headers, dataRows } = found;
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

      // Find key column indices from stored headers
      const ci = (name) => {
        const target = name.toLowerCase();
        return storedCols.findIndex((c) => (c || '').toLowerCase().trim() === target);
      };
      const ciOr = (...names) => {
        for (const n of names) { const i = ci(n); if (i !== -1) return i; }
        return -1;
      };

      // Col 7 = index 6 = Referencia (negocio key)
      const refIdxs = storedCols.reduce((a, c, i) => { if ((c||'').toLowerCase().trim() === 'referencia') a.push(i); return a; }, []);
      const negRefIdx = refIdxs[0] ?? 6;
      const movRefIdx = refIdxs[1] ?? -1;

      const nroIdIdx   = ciOr('Nro ID Propietario', 'Nro ID Propietario 1');
      const propIdx    = ciOr('Propietario', 'Propietario 1');
      const pctIdx     = ciOr('% Participación', '% Participación 1');
      const tipoMovIdx = ci('Tipo Movimiento');
      const fechaContIdx  = ci('Fecha Contable');
      const valorIdx      = ci('Valor');
      const comentIdx     = ci('Comentarios');
      const fechaBancoIdx = ci('Fecha Mov. Banco');
      const cuentaIdx     = ci('Cuenta Bancaria');
      const conceptoIdx   = ci('Concepto');
      const sucursalIdx   = ci('Sucursal');
      const estadoIdx     = ci('Estado');
      const obsIdx        = ci('Observaciones');
      const razonIdx      = ci('Razones / Justificaciones');
      const idUnidadIdx   = ci('ID Unidad');
      const idMovIdx      = ciOr('ID Movimiento', 'ID Interno');
      const idPersonaIdx  = ci('ID Persona');

      const negMap = new Map();
      for (const row of filas) {
        const referencia = cleanRef(cleanStr(row[negRefIdx]));
        if (!referencia) continue;

        if (!negMap.has(referencia)) negMap.set(referencia, { compradores: new Map(), movimientos: [] });
        const entry = negMap.get(referencia);

        const comps = parseCompradoresCell(row[propIdx], row[nroIdIdx], pctIdx !== -1 ? row[pctIdx] : null);
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

        const idMovimiento = cleanStr(row[idMovIdx]);
        if (idMovimiento) {
          const v = (idx) => (idx !== -1 ? cleanStr(row[idx]) : null);
          const fechaContable = parseFechaStr(v(fechaContIdx));
          const datos = {};
          const movFields = [
            ['Tipo Movimiento', tipoMovIdx], ['Fecha Contable', fechaContIdx],
            ['Valor', valorIdx], ['Comentarios', comentIdx],
            ['Fecha Mov. Banco', fechaBancoIdx], ['Cuenta Bancaria', cuentaIdx],
            ['Concepto', conceptoIdx], ['Sucursal', sucursalIdx],
            ['Referencia Movimiento', movRefIdx], ['Estado', estadoIdx],
            ['Observaciones', obsIdx], ['Razones / Justificaciones', razonIdx],
            ['ID Unidad', idUnidadIdx], ['ID Movimiento', idMovIdx],
            ['ID Persona', idPersonaIdx], ['Nro ID Propietario', nroIdIdx],
          ];
          for (const [name, idx] of movFields) {
            if (excluirEnMovimiento(name)) continue; // columnas "no aplica" (Sucursal)
            const val = v(idx);
            if (val !== null) datos[name] = val;
          }
          entry.movimientos.push({ idMovimiento, referencia, fechaContable, datos });
        }
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

// GET /api/negocios?search=&estado=&fideicomiso=&page=&limit=
router.get('/', async (req, res) => {
  try {
    const { search, estado, fideicomiso, saldoPendiente, page = '1', limit = '50' } = req.query;
    const pageNum = Math.max(1, parseInt(page));
    const limitNum = Math.min(9999, Math.max(1, parseInt(limit)));

    const where = {};
    if (estado) where.estado = { contains: estado, mode: 'insensitive' };
    if (fideicomiso) where.datos = { path: ['Fideicomiso'], equals: fideicomiso };
    if (saldoPendiente === 'true') where.saldoActual = { gt: 0 };
    if (search) {
      where.OR = [
        { referencia: { contains: search, mode: 'insensitive' } },
        { compradores: { some: { nombre: { contains: search, mode: 'insensitive' } } } },
        { compradores: { some: { nroId: { contains: search, mode: 'insensitive' } } } },
        { datos: { path: ['Nomenclatura'], string_contains: search } },
      ];
    }

    const noFilters = !search && !estado && !fideicomiso;

    const [total, negocios, estadosRaw, fideicomisosRaw] = await Promise.all([
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
      noFilters
        ? prisma.$queryRaw`
            SELECT DISTINCT datos->>'Fideicomiso' AS fideicomiso
            FROM "Negocio"
            WHERE datos->>'Fideicomiso' IS NOT NULL AND datos->>'Fideicomiso' != ''
            ORDER BY 1`
        : Promise.resolve(null),
    ]);

    res.json({
      data: negocios.map((n) => ({
        id: n.id,
        referencia: n.referencia,
        estado: n.estado,
        datos: n.datos,
        saldoActual: n.saldoActual,
        compradores: n.compradores,
        totalMovimientos: n._count.movimientos,
      })),
      pagination: {
        total,
        page: pageNum,
        limit: limitNum,
        totalPages: Math.ceil(total / limitNum),
      },
      ...(estadosRaw ? { estados: estadosRaw.map((e) => e.estado).filter(Boolean) } : {}),
      ...(fideicomisosRaw ? { fideicomisos: fideicomisosRaw.map((r) => r.fideicomiso).filter(Boolean) } : {}),
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/negocios/movimientos — todos los movimientos con contexto de negocio
router.get('/movimientos', async (req, res) => {
  try {
    const { search, fideicomiso, estado, fechaDesde, fechaHasta, page = '1', limit = '50' } = req.query;
    const pageNum = Math.max(1, parseInt(page));
    const limitNum = Math.min(200, Math.max(1, parseInt(limit)));

    // Filtros que viven en el modelo Negocio
    const negocioWhere = {};
    if (estado) negocioWhere.estado = { contains: estado, mode: 'insensitive' };
    if (fideicomiso) negocioWhere.datos = { path: ['Fideicomiso'], equals: fideicomiso };
    if (search) {
      negocioWhere.OR = [
        { referencia: { contains: search, mode: 'insensitive' } },
        { compradores: { some: { nombre: { contains: search, mode: 'insensitive' } } } },
        { compradores: { some: { nroId:   { contains: search, mode: 'insensitive' } } } },
        { datos: { path: ['Nomenclatura'], string_contains: search } },
      ];
    }

    // Resolver IDs de negocios que coinciden con los filtros
    let negocioIds = null;
    if (Object.keys(negocioWhere).length > 0) {
      const matching = await prisma.negocio.findMany({
        where: negocioWhere,
        select: { id: true },
      });
      negocioIds = matching.map((n) => n.id);
      if (negocioIds.length === 0) {
        return res.json({
          data: [],
          pagination: { total: 0, page: pageNum, limit: limitNum, totalPages: 0 },
          fideicomisos: [],
          estados: [],
        });
      }
    }

    // Filtros que viven en NegocioMovimiento
    const movWhere = {};
    if (negocioIds !== null) movWhere.negocioId = { in: negocioIds };
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

    // Opciones de filtro (solo cuando no hay filtros activos)
    const noFilters = !search && !fideicomiso && !estado && !fechaDesde && !fechaHasta;
    const [fideicomisosRaw, estadosRaw] = await Promise.all([
      noFilters
        ? prisma.$queryRaw`SELECT DISTINCT datos->>'Fideicomiso' AS fideicomiso FROM "Negocio" WHERE datos->>'Fideicomiso' IS NOT NULL AND datos->>'Fideicomiso' != '' ORDER BY 1`
        : Promise.resolve(null),
      noFilters
        ? prisma.negocio.findMany({ select: { estado: true }, where: { estado: { not: null } }, distinct: ['estado'], orderBy: { estado: 'asc' } })
        : Promise.resolve(null),
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
    res.json({ ...negocio, totalMovimientos: negocio._count.movimientos });
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
