// Ordena las columnas financieras del resumen para que se lean en un flujo lógico
// y, sobre todo, que las columnas de cada mes queden juntas y en orden cronológico:
//   ... → Saldo Inicial → [Mes A: +, (-), Saldo] → [Mes B: +, (-), Saldo] → Saldo Actual → ...

const MESES = {
  ene: 1, feb: 2, mar: 3, abr: 4, may: 5, jun: 6,
  jul: 7, ago: 8, sep: 9, oct: 10, nov: 11, dic: 12,
};

const mesNum = (token) => MESES[token.toLowerCase().slice(0, 3)] ?? 99;

// Campos fijos antes de los meses (en este orden).
const ANTES = ['valor venta', 'cuota inicial', 'crédito', 'credito', 'aportes posteriores', 'saldo inicial'];
// Campos fijos después de los meses (en este orden).
const DESPUES = ['saldo actual', 'cumple acreditación', 'cumple acreditacion'];

// Detecta columnas de mes y devuelve su clave de orden, o null si no es de mes.
//   "<Mes> <Año> +"   → sub 0 (ingreso)
//   "<Mes> <Año> (-)" → sub 1 (salida)
//   "Saldo <Mes> <Año>" → sub 2 (saldo del mes)
function parseMes(key) {
  const k = String(key).toLowerCase().trim();
  let m = k.match(/^saldo\s+([a-záéíóú]{3,})\.?\s+(\d{4})$/);
  if (m) return { anio: +m[2], mes: mesNum(m[1]), sub: 2 };
  m = k.match(/^([a-záéíóú]{3,})\.?\s+(\d{4})\s*(\+|\(-\))$/);
  if (m) return { anio: +m[2], mes: mesNum(m[1]), sub: m[3] === '+' ? 0 : 1 };
  return null;
}

function rank(key) {
  const k = String(key).toLowerCase().trim();
  const antes = ANTES.indexOf(k);
  if (antes !== -1) return { grupo: 0, a: antes, b: 0, c: 0 };
  const mes = parseMes(key);
  if (mes) return { grupo: 1, a: mes.anio, b: mes.mes, c: mes.sub };
  const despues = DESPUES.indexOf(k);
  if (despues !== -1) return { grupo: 2, a: despues, b: 0, c: 0 };
  return { grupo: 3, a: 0, b: 0, c: 0 };
}

// Recibe y devuelve un array de entradas [clave, valor] (Object.entries).
export function ordenarFinanciero(entries) {
  return [...(entries || [])].sort((x, y) => {
    const rx = rank(x[0]);
    const ry = rank(y[0]);
    if (rx.grupo !== ry.grupo) return rx.grupo - ry.grupo;
    if (rx.grupo === 3) return String(x[0]).localeCompare(String(y[0]), 'es');
    return rx.a - ry.a || rx.b - ry.b || rx.c - ry.c;
  });
}

const NOMBRE_MES = {
  1: 'Enero', 2: 'Febrero', 3: 'Marzo', 4: 'Abril', 5: 'Mayo', 6: 'Junio',
  7: 'Julio', 8: 'Agosto', 9: 'Septiembre', 10: 'Octubre', 11: 'Noviembre', 12: 'Diciembre',
};

// Separa las entradas financieras para mostrarlas como texto plano:
//   - antes:   campos fijos que van antes de los meses (Valor venta … Saldo Inicial)
//   - meses:   un objeto por mes con { etiqueta, ingreso, salida, saldo } en orden cronológico
//   - despues: campos fijos que van después (Saldo Actual, Cumple Acreditación)
//   - otras:   cualquier otra columna no clasificada (orden alfabético)
export function separarFinanciero(entries) {
  const antes = [];
  const despues = [];
  const otras = [];
  const mapaMeses = new Map();

  for (const [k, v] of entries || []) {
    const mes = parseMes(k);
    if (mes) {
      const clave = `${mes.anio}-${mes.mes}`;
      if (!mapaMeses.has(clave)) {
        mapaMeses.set(clave, {
          etiqueta: `${NOMBRE_MES[mes.mes] ?? '?'} ${mes.anio}`,
          anio: mes.anio, mes: mes.mes, ingreso: null, salida: null, saldo: null,
        });
      }
      const slot = mapaMeses.get(clave);
      if (mes.sub === 0) slot.ingreso = v;
      else if (mes.sub === 1) slot.salida = v;
      else slot.saldo = v;
      continue;
    }
    const r = rank(k);
    if (r.grupo === 0) antes.push([k, v, r.a]);
    else if (r.grupo === 2) despues.push([k, v, r.a]);
    else otras.push([k, v]);
  }

  antes.sort((a, b) => a[2] - b[2]);
  despues.sort((a, b) => a[2] - b[2]);
  otras.sort((a, b) => String(a[0]).localeCompare(String(b[0]), 'es'));
  const meses = [...mapaMeses.values()].sort((a, b) => a.anio - b.anio || a.mes - b.mes);

  return {
    antes: antes.map(([k, v]) => [k, v]),
    meses,
    despues: despues.map(([k, v]) => [k, v]),
    otras,
  };
}
