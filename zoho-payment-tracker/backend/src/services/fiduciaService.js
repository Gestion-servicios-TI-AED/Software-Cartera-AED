const XLSX = require('xlsx');
const XlsxPopulate = require('xlsx-populate');
const { PrismaClient } = require('@prisma/client');
const { excluirEnResumen, excluirEnMovimiento } = require('../config/columnasExcluidas');

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

  return { encargo, hojas: hojasCreadas };
}

// ── Negocio parsing (spec-driven) ─────────────────────────────────────────────

function cleanNegRef(raw) {
  if (raw == null) return null;
  const s = String(raw).trim().replace(/\.0+$/, '');
  return s === '' ? null : s;
}

// Parse one or many compradores from a raw cell string.
// Handles all known formats from the fiducia Excel:
//   Single:  "NOMBRE (100%)"
//            "12345678 NOMBRE (100%)"
//   Multi:   "NOMBRE_A (12.5%) 28869349 NOMBRE_B (12.5%) 38237361 NOMBRE_C (12.5%) ..."
//            (first person may lack an ID; last person may lack a percentage)
// rawNroId / rawPct are the separate columns from Mov_Por_Propietario (used when the
// name cell doesn't embed that information).
function parseCompradoresCell(rawNombre, rawNroId, rawPct) {
  if (!rawNombre || String(rawNombre).trim() === '') return [];
  const s = String(rawNombre).replace(/[\r\n]/g, ' ').trim();

  // Split by (PCT%) markers — each segment holds the ID+name of the NEXT person.
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

  // Single-person path: no (PCT%) found at all and no ID prefix → use separate columns
  if (segments.length === 1 && segments[0].pct === null) {
    let nombre = segments[0].text.replace(/^\d+\s+/, '').trim();
    let porcentaje = null;
    if (rawPct != null) {
      const p = parseFloat(String(rawPct).replace(/[^0-9.]/g, ''));
      if (!isNaN(p)) porcentaje = p;
    }
    const nroId = rawNroId != null ? String(rawNroId).trim() || null : null;
    return nombre ? [{ nombre, nroId, porcentaje }] : [];
  }

  // Multi (or single with embedded PCT%) — derive each person from segments
  const isSingleEmbedded = segments.length === 1;
  return segments
    .map(({ text, pct }) => {
      const clean = text.replace(/^\|+\s*/, ''); // strip | separator that Excel embeds
      if (!clean) return null;
      const idMatch = clean.match(/^(\d{4,12})\s+([\s\S]+)/);
      let nroId = idMatch ? idMatch[1] : null;
      if (!nroId && isSingleEmbedded && rawNroId != null) {
        nroId = String(rawNroId).trim() || null;
      }
      const nombre = (idMatch ? idMatch[2] : clean).trim();
      return nombre ? { nombre, nroId, porcentaje: pct } : null;
    })
    .filter(Boolean);
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
  // Find all occurrences of 'Referencia' (col 7 = negocio ref, col 20 = mov ref)
  const refIdxs = columnas.reduce((acc, c, i) => {
    if ((c || '').toLowerCase().trim() === 'referencia') acc.push(i);
    return acc;
  }, []);
  const negRefIdx = refIdxs[0] ?? 6;   // Col 7 (index 6) — links to Negocio
  const movRefIdx = refIdxs[1] ?? -1;  // Col 20 (index 19) — payment reference

  const nroIdIdx      = colIdx(columnas, 'Nro ID Propietario') !== -1 ? colIdx(columnas, 'Nro ID Propietario') : colIdx(columnas, 'Nro ID Propietario 1');
  const propIdx       = colIdx(columnas, 'Propietario') !== -1 ? colIdx(columnas, 'Propietario') : colIdx(columnas, 'Propietario 1');
  const pctIdx        = colIdx(columnas, '% Participación') !== -1 ? colIdx(columnas, '% Participación') : colIdx(columnas, '% Participación 1');
  const tipoMovIdx    = colIdx(columnas, 'Tipo Movimiento');
  const fechaContIdx  = colIdx(columnas, 'Fecha Contable');
  const valorIdx      = colIdx(columnas, 'Valor');
  const comentIdx     = colIdx(columnas, 'Comentarios');
  const fechaBancoIdx = colIdx(columnas, 'Fecha Mov. Banco');
  const cuentaIdx     = colIdx(columnas, 'Cuenta Bancaria');
  const conceptoIdx   = colIdx(columnas, 'Concepto');
  const sucursalIdx   = colIdx(columnas, 'Sucursal');
  // La hoja trae dos columnas "Estado": la 1ª es el estado del inmueble
  // (PROMETIDO, VENDIDO…) y la 2ª el del movimiento (APLICADO…). Igual que
  // con 'Referencia', hay que quedarse con la ocurrencia correcta.
  const estadoIdxs = columnas.reduce((acc, c, i) => {
    if ((c || '').toLowerCase().trim() === 'estado') acc.push(i);
    return acc;
  }, []);
  const estadoIdx     = estadoIdxs[1] ?? estadoIdxs[0] ?? -1;
  const obsIdx        = colIdx(columnas, 'Observaciones');
  const razonIdx      = colIdx(columnas, 'Razones / Justificaciones');
  const idUnidadIdx   = colIdx(columnas, 'ID Unidad');
  // Dedup key: prefer 'ID Movimiento', fall back to 'ID Interno'
  const idMovIdx      = colIdx(columnas, 'ID Movimiento') !== -1
    ? colIdx(columnas, 'ID Movimiento')
    : colIdx(columnas, 'ID Interno');
  const idPersonaIdx  = colIdx(columnas, 'ID Persona');

  // Group by negocio referencia
  const negMap = new Map(); // referencia → { compradores: Map, movimientos: [] }
  for (const row of filas) {
    const referencia = cleanNegRef(row[negRefIdx]);
    if (!referencia) continue;

    if (!negMap.has(referencia)) negMap.set(referencia, { compradores: new Map(), movimientos: [] });
    const entry = negMap.get(referencia);

    // Compradores (unique by nroId, or nombre as fallback; enrich nroId if seen later)
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

    // Movement
    const idMovimiento = cleanStr(row[idMovIdx]);
    if (idMovimiento) {
      const v = (idx) => (idx !== -1 ? cleanStr(row[idx]) : null);
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
      entry.movimientos.push({ idMovimiento, referencia, datos });
    }
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
          datos: m.datos,
        })),
      });
      movCreated += toInsert.length;
    }
  }
  console.log(`[negocios] Mov_Por_Propietario: ${compCreated} compradores, ${movCreated} movimientos nuevos`);
}

module.exports = { procesarArchivoFiducia };
