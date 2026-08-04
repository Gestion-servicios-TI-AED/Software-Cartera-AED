// Parseo compartido de la hoja "Mov_Por_Propietario" del Excel de fiducia.
// Usado tanto por la subida manual (fiduciaService.js, inserta incremental)
// como por el backfill completo (routes/negocios.js, borra y reconstruye).
//
// Se centraliza aquí justamente porque esta lógica vivió duplicada en ambos
// archivos y ambas copias tenían el mismo bug: la hoja trae dos columnas
// "Referencia" (negocio y pago) y dos "Estado" (inmueble y movimiento), y hay
// que quedarse con la ocurrencia correcta de cada una. El bug de Estado se
// arregló una vez (commit 37a72d1) y se volvió a colar por la copia
// duplicada (commit 1e64b87) — de ahí esta extracción.
const { excluirEnMovimiento } = require('../config/columnasExcluidas');

function cleanStr(v) {
  if (v == null) return null;
  const s = String(v).replace(/[\r\n]/g, ' ').trim();
  return s === '' ? null : s;
}

// Parsea fecha en "dd/mm/yyyy", "dd-mm-yyyy", o serial de Excel → Date.
function parseFechaStr(s) {
  if (!s) return null;
  const str = String(s).trim();
  if (/^\d+$/.test(str)) {
    const serial = parseInt(str, 10);
    if (serial >= 20000) {
      const dt = new Date((serial - 25569) * 86400000);
      return isNaN(dt.getTime()) ? null : dt;
    }
  }
  const m = str.match(/^(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{4})$/);
  if (!m) return null;
  const dt = new Date(+m[3], +m[2] - 1, +m[1]);
  return isNaN(dt.getTime()) ? null : dt;
}

// Resuelve los índices de columna de la hoja. Referencia y Estado están
// duplicadas: se toma la 2ª ocurrencia de cada una (la 1ª es la del
// inmueble/negocio, la 2ª la del movimiento/pago), con fallback a la 1ª si
// por algún motivo no hay una 2ª ocurrencia.
function resolverColumnasMovPorPropietario(columnas) {
  const ci = (name) => {
    const target = name.toLowerCase();
    return columnas.findIndex((c) => (c || '').toLowerCase().trim() === target);
  };
  const ciOr = (...names) => {
    for (const n of names) { const i = ci(n); if (i !== -1) return i; }
    return -1;
  };
  const allIdx = (name) => columnas.reduce((acc, c, i) => {
    if ((c || '').toLowerCase().trim() === name.toLowerCase()) acc.push(i);
    return acc;
  }, []);

  const refIdxs = allIdx('Referencia');
  const estadoIdxs = allIdx('Estado');

  return {
    negRefIdx: refIdxs[0] ?? 6,
    movRefIdx: refIdxs[1] ?? -1,
    nroIdIdx: ciOr('Nro ID Propietario', 'Nro ID Propietario 1'),
    propIdx: ciOr('Propietario', 'Propietario 1'),
    pctIdx: ciOr('% Participación', '% Participación 1'),
    tipoMovIdx: ci('Tipo Movimiento'),
    fechaContIdx: ci('Fecha Contable'),
    valorIdx: ci('Valor'),
    comentIdx: ci('Comentarios'),
    fechaBancoIdx: ci('Fecha Mov. Banco'),
    cuentaIdx: ci('Cuenta Bancaria'),
    conceptoIdx: ci('Concepto'),
    sucursalIdx: ci('Sucursal'),
    estadoIdx: estadoIdxs[1] ?? estadoIdxs[0] ?? -1,
    obsIdx: ci('Observaciones'),
    razonIdx: ci('Razones / Justificaciones'),
    idUnidadIdx: ci('ID Unidad'),
    idMovIdx: ciOr('ID Movimiento', 'ID Interno'),
    idPersonaIdx: ci('ID Persona'),
  };
}

// Parsea uno o varios compradores de una celda cruda.
// Formatos conocidos:
//   Único:   "NOMBRE (100%)"  /  "12345678 NOMBRE (100%)"  /  "NOMBRE"
//   Múltiple: "NOMBRE_A (12.5%) 28869349 NOMBRE_B (12.5%) ..."
// rawNroId / rawPct son las columnas separadas, usadas solo cuando la celda
// de nombre no trae esa info embebida.
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

  const isSingleEmbedded = segments.length === 1;
  return segments
    .map(({ text, pct }) => {
      const clean = text.replace(/^\|+\s*/, '');
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

// Construye { idMovimiento, fechaContable, datos } para una fila usando los
// índices ya resueltos. Devuelve null si la fila no tiene ID Movimiento (no
// es una fila de movimiento real, p.ej. fila de encabezado residual).
function extraerDatosMovimiento(row, idx) {
  const idMovimiento = cleanStr(row[idx.idMovIdx]);
  if (!idMovimiento) return null;

  const v = (i) => (i !== -1 ? cleanStr(row[i]) : null);
  const fechaContable = parseFechaStr(v(idx.fechaContIdx));
  const datos = {};
  const movFields = [
    ['Tipo Movimiento', idx.tipoMovIdx], ['Fecha Contable', idx.fechaContIdx],
    ['Valor', idx.valorIdx], ['Comentarios', idx.comentIdx],
    ['Fecha Mov. Banco', idx.fechaBancoIdx], ['Cuenta Bancaria', idx.cuentaIdx],
    ['Concepto', idx.conceptoIdx], ['Sucursal', idx.sucursalIdx],
    ['Referencia Movimiento', idx.movRefIdx], ['Estado', idx.estadoIdx],
    ['Observaciones', idx.obsIdx], ['Razones / Justificaciones', idx.razonIdx],
    ['ID Unidad', idx.idUnidadIdx], ['ID Movimiento', idx.idMovIdx],
    ['ID Persona', idx.idPersonaIdx], ['Nro ID Propietario', idx.nroIdIdx],
  ];
  for (const [name, i] of movFields) {
    if (excluirEnMovimiento(name)) continue;
    const val = v(i);
    if (val !== null) datos[name] = val;
  }
  return { idMovimiento, fechaContable, datos };
}

module.exports = {
  resolverColumnasMovPorPropietario,
  parseCompradoresCell,
  extraerDatosMovimiento,
  cleanStr,
  parseFechaStr,
};
