// Repro for backfill Phase 1 header detection.
// Bug: when the 'Movimientos' sheet is parsed correctly (header in `columnas`,
// `filas` = pure data), runBackfill's findHeaderInStoredFilas() returns null and
// Phase 1 is skipped, leaving Negocio.datos empty.
// This test locks the EXPECTED behavior: a header must be resolved for both
// legacy files (header embedded in filas) and current files (header in columnas).

const assert = require('assert');

function cleanStr(v) {
  if (v == null) return null;
  const s = String(v).replace(/[\r\n]/g, ' ').trim();
  return s === '' ? null : s;
}

function findHeaderInStoredFilas(filas, knownCol, knownIdx) {
  for (let i = 0; i < Math.min(filas.length, 8); i++) {
    const row = filas[i] || [];
    if (cleanStr(row[knownIdx])?.toLowerCase() === knownCol.toLowerCase()) {
      return { headers: row.map((c) => cleanStr(c) ?? ''), dataRows: filas.slice(i + 1) };
    }
  }
  return null;
}

// The resolver after the fix: prefer embedded header (legacy), else fall back to
// stored columnas when 'Referencia' is correctly at index 7 (current files).
function resolveHeader(hoja) {
  const filas = Array.isArray(hoja.filas) ? hoja.filas : [];
  const storedCols = Array.isArray(hoja.columnas) ? hoja.columnas : [];
  const found = findHeaderInStoredFilas(filas, 'Referencia', 7);
  if (found) return found;
  if (storedCols.findIndex((c) => (c || '').toLowerCase().trim() === 'referencia') === 7) {
    return { headers: storedCols.map((c) => cleanStr(c) ?? ''), dataRows: filas };
  }
  return null;
}

// ── Case 1: current file (header in columnas, filas = data) — the failing case ──
const currentFile = {
  columnas: ['Inv', 'Fideicomiso', 'x', 'y', 'z', 'Nomenclatura', 'Area', 'Referencia', 'Estado', 'w', 'Propietarios'],
  filas: [
    ['97728', null, null, null, null, 'TORRE 1 - APT 101', '60', '1423614110103', 'ACTIVO', null, 'JUAN PEREZ (100%)'],
    ['97731', null, null, null, null, 'TORRE 1 - APT 102', '60', '1423614110406', 'ACTIVO', null, 'ANA GOMEZ (100%)'],
  ],
};
const r1 = resolveHeader(currentFile);
assert(r1 !== null, 'BUG: header not resolved for current-format file');
assert.strictEqual(r1.headers[7], 'Referencia');
assert.strictEqual(r1.headers[5], 'Nomenclatura');
assert.strictEqual(r1.dataRows.length, 2, 'all data rows must be kept');
assert.strictEqual(cleanStr(r1.dataRows[0][7]), '1423614110103');

// ── Case 2: legacy file (header leaked into filas) — must still work ────────────
const legacyFile = {
  columnas: ['meta', 'meta', 'meta', 'meta', 'meta', 'meta', 'meta', 'meta'],
  filas: [
    ['', '', '', '', '', '', '', ''],
    ['title', '', '', '', '', '', '', ''],
    ['Inv', 'Fideicomiso', 'x', 'y', 'z', 'Nomenclatura', 'Area', 'Referencia', 'Estado'],
    ['97728', 'FID', '', '', '', 'APT 101', '60', '1423614110103', 'ACTIVO'],
  ],
};
const r2 = resolveHeader(legacyFile);
assert(r2 !== null, 'legacy header must still be found inside filas');
assert.strictEqual(r2.headers[7], 'Referencia');
assert.strictEqual(r2.dataRows.length, 1);
assert.strictEqual(cleanStr(r2.dataRows[0][7]), '1423614110103');

console.log('OK: header resolves for both current (columnas) and legacy (embedded) files');
