const XLSX = require('xlsx');
const XlsxPopulate = require('xlsx-populate');
const { PrismaClient } = require('@prisma/client');

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

function extractColumnsAndRows(raw2d) {
  if (!raw2d || raw2d.length === 0) return { columnas: [], filas: [], totalFilas: 0 };

  let headerIdx = 0;
  for (let i = 0; i < Math.min(raw2d.length, 10); i++) {
    const nonEmpty = (raw2d[i] || []).filter((c) => c !== null && c !== '').length;
    if (nonEmpty >= 2) { headerIdx = i; break; }
  }

  const columnas = (raw2d[headerIdx] || []).map((c) => (c != null ? String(c).trim() : ''));
  const filas = raw2d.slice(headerIdx + 1).filter((row) =>
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

module.exports = { procesarArchivoFiducia };
