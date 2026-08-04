const XLSX = require('xlsx');
const XlsxPopulate = require('xlsx-populate');
const { PrismaClient } = require('@prisma/client');
const { excluirEnResumen } = require('../config/columnasExcluidas');
const {
  resolverColumnasMovPorPropietario,
  parseCompradoresCell,
  extraerDatosMovimiento,
} = require('./movPorPropietarioParser');
const { invalidarCacheDashboard } = require('./dashboardRecaudoService');

const prisma = new PrismaClient();

// Columnas que suelen contener el nombre del propietario/cliente
const PROPIETARIO_KEYS = [
  'propietario', 'prop', 'cliente', 'client', 'nombre', 'name',
  'beneficiario', 'titular', 'copropietario', 'tercero', 'usuario',
  'comprador', 'adquirente', 'adquiriente',
];

function detectPropietarioKey(columnas) {
  const lower = columnas.map((c) => (c || '').toLowerCase().trim());
  for (const key of PROPIETARIO_KEYS) {
    const idx = lower.findIndex((c) => c === key || c.includes(key));
    if (idx !== -1) return idx;
  }
  // Fallback: primera columna de texto (posición 0)
  return 0;
}

function extractCodigo(filename) {
  const stem = filename.replace(/\.[^.]+$/, '');
  const match = stem.match(/^([A-Z]{1,4}\d{3,})/i) || stem.match(/(\d{4,})/);
  return match ? match[1].toUpperCase() : null;
}

function normalizeCell(val) {
  if (val === null || val === undefined || val === '') return null;
  if (val instanceof Date) {
    return val.toLocaleDateString('es-CO', { day: '2-digit', month: '2-digit', year: 'numeric' });
  }
  return String(val);
}

async function readWithPassword(buffer, password) {
  const workbook = await XlsxPopulate.fromDataAsync(buffer, { password });
  const sheets = {};
  for (const sheet of workbook.sheets()) {
    const usedRange = sheet.usedRange();
    sheets[sheet.name()] = usedRange
      ? (usedRange.value() || []).map((row) => (Array.isArray(row) ? row : []).map(normalizeCell))
      : [];
  }
  return sheets;
}

function readWithoutPassword(buffer) {
  const workbook = XLSX.read(buffer, { type: 'buffer', cellDates: false, raw: false });
  const sheets = {};
  for (const sheetName of workbook.SheetNames) {
    sheets[sheetName] = XLSX.utils.sheet_to_json(workbook.Sheets[sheetName], {
      header: 1, defval: null, blankrows: false, raw: false,
    });
  }
  return sheets;
}

// All fiducia sheets: first 6 rows are metadata, row 7 (index 6) is the header.
const FIDUCIA_HEADER_ROW = 6;

function extractColumnsAndRows(raw2d) {
  if (!raw2d || raw2d.length === 0) return { columnas: [], filas: [], totalFilas: 0 };
  if (raw2d.length <= FIDUCIA_HEADER_ROW) return { columnas: [], filas: [], totalFilas: 0 };

  const columnas = (raw2d[FIDUCIA_HEADER_ROW] || []).map((c) => (c != null ? String(c).trim() : ''));
  const filas = raw2d.slice(FIDUCIA_HEADER_ROW + 1).filter((row) =>
    (Array.isArray(row) ? row : []).some((c) => c !== null && c !== '' && c !== undefined)
  );

  return { columnas, filas, totalFilas: filas.length };
}

async function procesarArchivoFiducia(buffer, filename, metadata = {}) {
  const password = process.env.EXCEL_PASSWORD;
  let sheetsMap;

  if (password && password !== 'COMPLETAR') {
    try {
      sheetsMap = await readWithPassword(buffer, password);
    } catch (err) {
      if (err.message?.toLowerCase().includes('password') || err.message?.toLowerCase().includes('incorrect')) {
        throw new Error(`Contraseña incorrecta para "${filename}"`);
      }
      console.warn(`[fiducia] xlsx-populate falló (${err.message}), reintentando sin contraseña`);
      sheetsMap = readWithoutPassword(buffer);
    }
  } else {
    try {
      sheetsMap = readWithoutPassword(buffer);
    } catch {
      throw new Error(`No se pudo leer "${filename}". Si está protegido, configura EXCEL_PASSWORD en .env`);
    }
  }

  // Deduplicación: si viene emailId y ya existe un encargo con ese correo+archivo, no reimportar
  if (metadata.emailId) {
    const existing = await prisma.encargFiduciario.findFirst({
      where: { emailId: metadata.emailId, archivoNombre: filename },
    });
    if (existing) {
      console.log(`[fiducia] Archivo "${filename}" del correo ${metadata.emailId} ya existe, omitiendo`);
      return { encargo: existing, hojas: [], skipped: true };
    }
  }

  const nombre = metadata.nombre || filename.replace(/\.[^.]+$/, '');
  const codigo = metadata.codigo || extractCodigo(filename);

  const encargo = await prisma.encargFiduciario.create({
    data: {
      nombre,
      codigo,
      archivoNombre: filename,
      emailId: metadata.emailId || null,
      emailAsunto: metadata.emailAsunto || null,
      emailFecha: metadata.emailFecha ? new Date(metadata.emailFecha) : null,
    },
  });

  const hojasCreadas = [];

  for (const [sheetName, raw2d] of Object.entries(sheetsMap)) {
    const { columnas, filas, totalFilas } = extractColumnsAndRows(raw2d);
    if (totalFilas === 0 && columnas.length === 0) continue;

    const hoja = await prisma.hojaFiduciaria.create({
      data: { encargId: encargo.id, nombreHoja: sheetName, columnas, filas, totalFilas },
    });

    // Normalizar cada fila como { columna: valor } y detectar propietario
    const propietarioIdx = detectPropietarioKey(columnas);

    const BATCH = 100;
    for (let i = 0; i < filas.length; i += BATCH) {
      await prisma.movimientoFiduciario.createMany({
        data: filas.slice(i, i + BATCH).map((row) => {
          const datos = {};
          columnas.forEach((col, ci) => {
            if (col) datos[col] = row[ci] ?? null;
          });
          const propietario = row[propietarioIdx] ? String(row[propietarioIdx]).trim() : null;
          return {
            encargId: encargo.id,
            hojaId: hoja.id,
            nombreHoja: sheetName,
            propietario: propietario || null,
            datos,
          };
        }),
      });
    }

    hojasCreadas.push({ id: hoja.id, nombreHoja: sheetName, totalFilas });

    // Populate Negocio tables based on sheet name
    const sheetKey = sheetName.toLowerCase().trim();
    try {
      if (sheetKey === 'movimientos') {
        await processResumenSheet(columnas, filas);
      } else if (sheetKey === 'mov_por_propietario') {
        await processMovPorPropietarioSheet(columnas, filas);
      }
    } catch (negErr) {
      console.warn(`[negocios] Error procesando "${sheetName}": ${negErr.message}`);
    }
  }

  console.log(`[fiducia] "${filename}" → ${hojasCreadas.length} hojas, encargo ${encargo.id}`);

  // Auto-detectar nombre del proyecto desde la columna Fideicomiso
  if (!metadata.nombre) {
    try {
      const firstSheet = Object.values(sheetsMap)[0];
      if (firstSheet && firstSheet.length > 0) {
        const { columnas, filas } = extractColumnsAndRows(firstSheet);
        const fideiIdx = columnas.findIndex((c) => (c || '').toLowerCase().trim() === 'fideicomiso');
        if (fideiIdx !== -1 && filas.length > 0) {
          const fideiVal = filas[0][fideiIdx];
          if (fideiVal) {
            // Extraer nombre limpio: "99289- P.A. KALA TORRE 3 Y 4" -> "KALA TORRE 3 Y 4"
            let projectName = String(fideiVal).trim();
            // Remover código numérico al inicio (e.g. "99289-" or "99289 -")
            projectName = projectName.replace(/^\d+[\s-]+/, '');
            // Remover prefijos comunes como "P.A.", "PA ", "FIDEICOMISO", etc.
            projectName = projectName.replace(/^(P\.?A\.?\s*|FIDEICOMISO\s*|ENCARGO\s*)/i, '');
            projectName = projectName.trim();
            if (projectName.length > 2) {
              await prisma.encargFiduciario.update({
                where: { id: encargo.id },
                data: { nombre: projectName },
              });
              encargo.nombre = projectName;
              console.log(`[fiducia] Nombre auto-detectado: "${projectName}"`);
            }
          }
        }
      }
    } catch (err) {
      console.warn(`[fiducia] No se pudo auto-detectar nombre del proyecto: ${err.message}`);
    }
  }

  if (hojasCreadas.length > 0) invalidarCacheDashboard();

  return { encargo, hojas: hojasCreadas };
}

// ── Negocio parsing (spec-driven) ─────────────────────────────────────────────

function cleanNegRef(raw) {
  if (raw == null) return null;
  const s = String(raw).trim().replace(/\.0+$/, '');
  return s === '' ? null : s;
}

function cleanStr(v) {
  if (v == null) return null;
  const s = String(v).replace(/[\r\n]/g, ' ').trim();
  return s === '' ? null : s;
}

async function applyNroIdRaw(negocioId, list) {
  for (const c of list) {
    if (!c.nroId) continue;
    await prisma.$executeRaw`
      UPDATE "NegocioComprador" SET "nroId" = ${c.nroId}
      WHERE "negocioId"::text = ${negocioId} AND nombre = ${c.nombre}
    `;
  }
}

function colIdx(columnas, name) {
  const target = name.toLowerCase();
  return columnas.findIndex((c) => (c || '').toLowerCase().trim() === target);
}

// Hoja Movimientos (Resumen) — upsert Negocio por Referencia (col 8, index 7)
async function processResumenSheet(columnas, filas) {
  const refIdx = 7;        // Col 8: Referencia — primary key
  const propietariosIdx = 9; // Col 10: Propietarios
  const estadoIdx = colIdx(columnas, 'Estado');

  let upserted = 0;
  for (const row of filas) {
    const referencia = cleanNegRef(row[refIdx]);
    if (!referencia) continue;

    const estado = estadoIdx !== -1 ? cleanStr(row[estadoIdx]) : null;

    const datos = {};
    columnas.forEach((col, idx) => {
      if (!col || excluirEnResumen(col)) return; // columnas "no aplica" / uso futuro
      const v = cleanStr(row[idx]);
      if (v !== null) datos[col] = v;
    });

    const negocio = await prisma.negocio.upsert({
      where: { referencia },
      create: { referencia, estado, datos },
      update: { estado, datos },
    });
    upserted++;

    // Parse compradores from Propietarios column — only set if Mov_Por_Propietario
    // hasn't already populated them (check count first to avoid overwriting richer data)
    const comps = parseCompradoresCell(row[propietariosIdx], null, null);
    if (comps.length > 0) {
      const existing = await prisma.negocioComprador.count({ where: { negocioId: negocio.id } });
      if (existing === 0) {
        await prisma.negocioComprador.createMany({
          data: comps.map((c, i) => ({
            negocioId: negocio.id,
            nombre: c.nombre,
            nroId: c.nroId,
            porcentaje: c.porcentaje,
            orden: i,
          })),
        });
        await applyNroIdRaw(negocio.id, comps);
      }
    }
  }
  if (upserted > 0) console.log(`[negocios] Resumen: upserted ${upserted} negocios`);
}

// Hoja Mov_Por_Propietario — upsert compradores + insert movements (dedup by idMovimiento)
async function processMovPorPropietarioSheet(columnas, filas) {
  const idx = resolverColumnasMovPorPropietario(columnas);

  // Group by negocio referencia
  const negMap = new Map(); // referencia → { compradores: Map, movimientos: [] }
  for (const row of filas) {
    const referencia = cleanNegRef(row[idx.negRefIdx]);
    if (!referencia) continue;

    if (!negMap.has(referencia)) negMap.set(referencia, { compradores: new Map(), movimientos: [] });
    const entry = negMap.get(referencia);

    // Compradores (unique by nroId, or nombre as fallback; enrich nroId if seen later)
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

  let compCreated = 0, movCreated = 0;
  for (const [referencia, entry] of negMap.entries()) {
    let negocio = await prisma.negocio.findUnique({ where: { referencia } });
    if (!negocio) negocio = await prisma.negocio.create({ data: { referencia } });

    // Replace compradores
    const list = [...entry.compradores.values()];
    if (list.length > 0) {
      await prisma.negocioComprador.deleteMany({ where: { negocioId: negocio.id } });
      await prisma.negocioComprador.createMany({
        data: list.map((c) => ({
          negocioId: negocio.id,
          nombre: c.nombre,
          nroId: c.nroId,
          porcentaje: c.porcentaje,
          orden: c.orden,
        })),
      });
      await applyNroIdRaw(negocio.id, list);
      compCreated += list.length;
    }

    // Insert movements — skip existing idMovimiento
    const ids = entry.movimientos.map((m) => m.idMovimiento);
    const existing = await prisma.negocioMovimiento.findMany({
      where: { idMovimiento: { in: ids } },
      select: { idMovimiento: true },
    });
    const existingSet = new Set(existing.map((m) => m.idMovimiento));

    const toInsert = entry.movimientos.filter((m) => !existingSet.has(m.idMovimiento));
    if (toInsert.length > 0) {
      await prisma.negocioMovimiento.createMany({
        data: toInsert.map((m) => ({
          negocioId: negocio.id,
          referencia: m.referencia,
          idMovimiento: m.idMovimiento,
          fechaContable: m.fechaContable ?? null,
          datos: m.datos,
        })),
      });
      movCreated += toInsert.length;
    }
  }
  console.log(`[negocios] Mov_Por_Propietario: ${compCreated} compradores, ${movCreated} movimientos nuevos`);
}

module.exports = { procesarArchivoFiducia };
