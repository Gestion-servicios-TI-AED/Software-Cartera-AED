// Reparación puntual (2026-07-07): NegocioMovimiento.datos.Estado se pobló
// con la 1ª columna "Estado" del Excel (estado del inmueble: PROMETIDO,
// VENDIDO…) en vez de la 2ª (estado del movimiento: APLICADO…), porque el
// parser tomaba la primera ocurrencia del header duplicado.
//
// Este script reconstruye el Estado correcto desde las hojas crudas
// (HojaFiduciaria.filas conserva ambas columnas) haciendo match por
// ID Movimiento, y actualiza los registros existentes. Es idempotente:
// si el Estado ya es el correcto, no toca la fila.
//
// Resultado de la corrida (2026-07-07): 25.471 filas reparadas a su estado
// real. Quedaron 2.031 filas SIN reparar (sinMatch): sus ID Movimiento no
// aparecen en las hojas crudas actuales (archivos ya reemplazados), así que
// conservan el estado del inmueble y NUNCA cuentan como pago APLICADO. Si la
// Conciliación de un negocio parece subcontar pagos, revisar si sus
// movimientos caen en este grupo. Se corrigen solas si el Excel que las
// originó se vuelve a subir (el parser ya toma la columna correcta).
//
// Uso: node scripts/fix-estado-movimientos.js
const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

function cleanStr(v) {
  if (v == null) return null;
  const s = String(v).replace(/[\r\n]/g, ' ').trim();
  return s === '' ? null : s;
}

function allIdx(columnas, name) {
  const target = name.toLowerCase();
  return columnas.reduce((acc, c, i) => {
    if ((c || '').toLowerCase().trim() === target) acc.push(i);
    return acc;
  }, []);
}

async function main() {
  const hojas = await prisma.hojaFiduciaria.findMany({
    where: { nombreHoja: 'Mov_Por_Propietario' },
    select: { id: true, columnas: true, filas: true },
    orderBy: { createdAt: 'asc' },
  });
  console.log(`Hojas Mov_Por_Propietario: ${hojas.length}`);

  // idMovimiento → estado del movimiento (2ª columna "Estado" de la hoja).
  // Se procesan en orden cronológico: la hoja más reciente pisa a la anterior.
  const mapa = new Map();
  for (const h of hojas) {
    const estadoIdxs = allIdx(h.columnas, 'Estado');
    if (estadoIdxs.length < 2) {
      console.warn(`  hoja ${h.id}: sin 2ª columna Estado (${estadoIdxs.length} encontradas) — omitida`);
      continue;
    }
    const estadoIdx = estadoIdxs[1];
    const idMovIdxs = allIdx(h.columnas, 'ID Movimiento');
    const idIntIdxs = allIdx(h.columnas, 'ID Interno');
    const keyIdx = idMovIdxs[0] ?? idIntIdxs[0] ?? -1;
    if (keyIdx === -1) {
      console.warn(`  hoja ${h.id}: sin columna ID Movimiento / ID Interno — omitida`);
      continue;
    }
    for (const row of h.filas) {
      const id = cleanStr(row[keyIdx]);
      const estado = cleanStr(row[estadoIdx]);
      if (id && estado) mapa.set(id, estado);
    }
  }
  console.log(`Estados de movimiento en hojas crudas: ${mapa.size}`);
  if (mapa.size === 0) {
    console.log('Nada que reparar.');
    return;
  }

  const movs = await prisma.negocioMovimiento.findMany({
    select: { id: true, idMovimiento: true, datos: true },
  });
  console.log(`NegocioMovimiento en BD: ${movs.length}`);

  let actualizados = 0;
  let yaCorrectos = 0;
  let sinMatch = 0;
  const BATCH = 100;
  for (let i = 0; i < movs.length; i += BATCH) {
    const batch = movs.slice(i, i + BATCH);
    const updates = [];
    for (const m of batch) {
      const key = m.idMovimiento ? cleanStr(m.idMovimiento) : null;
      const estado = key ? mapa.get(key) : undefined;
      if (!estado) { sinMatch++; continue; }
      if (m.datos && m.datos.Estado === estado) { yaCorrectos++; continue; }
      actualizados++;
      updates.push(
        prisma.negocioMovimiento.update({
          where: { id: m.id },
          data: { datos: { ...(m.datos || {}), Estado: estado } },
        })
      );
    }
    if (updates.length) await Promise.all(updates);
    if ((i / BATCH) % 20 === 0) console.log(`  procesados ${Math.min(i + BATCH, movs.length)}/${movs.length}…`);
  }

  console.log({ actualizados, yaCorrectos, sinMatch });
}

main()
  .catch((e) => { console.error(e); process.exitCode = 1; })
  .finally(() => prisma.$disconnect());
