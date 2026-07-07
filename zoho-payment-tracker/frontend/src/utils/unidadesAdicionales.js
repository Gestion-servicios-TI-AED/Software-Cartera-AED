// Separa el campo "Unidades Adicionales" del Excel de fiducia (un solo string
// con parqueadero y depósito mezclados, ej. "(PARQ.=P9 | M.INM=) (C.UTIL=D4 | M.INM=)")
// en campos independientes "Parqueadero" y "Depósito", listos para mostrarse
// como filas propias en la grilla de info del apartamento.

const UNIDAD_LABELS = {
  PARQ: 'Parqueadero', 'PARQ.': 'Parqueadero',
  'C.UTIL': 'Depósito', 'C.UTIL.': 'Depósito',
  DEP: 'Depósito', 'DEP.': 'Depósito',
  BOD: 'Bodega', 'BOD.': 'Bodega',
  LOC: 'Local', 'LOC.': 'Local',
  GAR: 'Garaje', 'GAR.': 'Garaje',
};

// Parsea el string crudo y agrupa los valores por etiqueta (label → [valores]).
// Cada unidad adicional viene en su propio grupo "(...)"; dentro del grupo se
// toma el primer par código=valor que no sea matrícula/inmueble (INM/MATR).
function agruparPorLabel(raw) {
  const porLabel = {};
  const groupRe = /\(([^)]+)\)/g;
  let m;
  while ((m = groupRe.exec(raw)) !== null) {
    for (const part of m[1].split('|')) {
      const eq = part.indexOf('=');
      if (eq === -1) continue;
      const code = part.slice(0, eq).trim();
      const val = part.slice(eq + 1).trim();
      if (!val) continue;
      if (/INM|MATR/i.test(code)) continue;
      const label = UNIDAD_LABELS[code] || UNIDAD_LABELS[code.toUpperCase()] || code.replace(/\.$/, '');
      (porLabel[label] ||= []).push(val);
      break;
    }
  }
  return porLabel;
}

// Recibe el objeto `datos` de un negocio y devuelve una copia donde el campo
// "Unidades Adicionales" fue reemplazado por campos separados por tipo
// (ej. "Parqueadero": "P29, P30", "Depósito": "D38"). Si hay varias unidades
// del mismo tipo, sus valores se listan juntos separados por coma. Si no
// existe el campo o no trae datos parseables, devuelve `datos` sin cambios.
export function separarUnidadesAdicionales(datos) {
  const key = Object.keys(datos || {}).find((k) => k.toLowerCase().includes('unidades adicionales'));
  if (!key || !datos[key]) return datos;

  const porLabel = agruparPorLabel(String(datos[key]));
  if (Object.keys(porLabel).length === 0) return datos;

  const { [key]: _omitido, ...resto } = datos;
  const nuevos = {};
  for (const [label, valores] of Object.entries(porLabel)) {
    nuevos[label] = valores.join(', ');
  }
  return { ...resto, ...nuevos };
}
