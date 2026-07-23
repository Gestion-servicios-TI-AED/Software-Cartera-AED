// Concepto de cada columna del informe de fiducia, según Cartera.
// Fuente: docs/proyecto/DICCIONARIO-COLUMNAS-FIDUCIA.md. Redacción pulida para lectura.
//
// Separado por hoja porque una misma columna puede significar cosas distintas:
//   - "resumen"     → Negocio.datos (PLANTILLA DEL RESUMEN)
//   - "movimiento"  → NegocioMovimiento.datos (Hoja2 / Mov_Por_Propietario)

const norm = (s) => String(s ?? '').trim().toLowerCase();

// Columnas presentes en ambas hojas con el mismo significado.
const COMPARTIDAS = {
  'fideicomiso': 'Nombre del patrimonio autónomo.',
  'inventario': 'Fideicomiso.',
  'categoria': 'Etapa.',
  'tipo inmueble': 'Tipo de inmueble.',
  'nomenclatura': 'Número del inmueble.',
  'area': 'Área.',
  'referencia': 'Código de inmueble para recaudo y demás trámites.',
};

const RESUMEN = {
  ...COMPARTIDAS,
  'estado': 'Condición actual del inmueble: opcionado (antes de promesa), prometido (promesa firmada), para firma de escritura (autorizado) o vendido (escritura firmada).',
  'propietarios': 'Nombre de los compradores o empresa compradora.',
  'representante legal o apoderado': 'Representante legal cuando compra un ente jurídico (empresa).',
  'unidades adicionales': 'Cuando compran depósito y parqueadero, se coloca la descripción de estos.',
  'parqueadero': 'Número del parqueadero adicional que compra el propietario, si aplica.',
  'depósito': 'Número del depósito o cuarto útil adicional que compra el propietario, si aplica.',
  'fecha contrato': 'Fecha de vinculación.',
  'valor venta': 'Valor del inmueble.',
  'cuota inicial': 'Valor de la cuota inicial a pagar.',
  'crédito': 'Descripción de cómo se pagará lo que falta contra entrega.',
  'credito': 'Descripción de cómo se pagará lo que falta contra entrega.',
  'aportes posteriores': 'Cuando se trae valor de otra fiducia y se traslada a esta fiduciaria.',
  'cumple acreditación': 'Si cumple con las condiciones para seguir en la compra.',
  'cumple acreditacion': 'Si cumple con las condiciones para seguir en la compra.',
  'saldo inicial': 'Abonado total a la fecha del inmueble (al inicio del período del reporte).',
  'saldo actual': 'Total abonado a la fecha.',
};

const MOVIMIENTO = {
  ...COMPARTIDAS,
  'estado': 'Condición actual del inmueble (opcionado, prometido, para firma de escritura o vendido).',
  'nro id propietario 1': 'Identificación de los compradores.',
  'nro id propietario': 'Identificación de los compradores.',
  'propietario 1': 'Nombre de los compradores o empresa compradora.',
  'propietario': 'Nombre de los compradores o empresa compradora.',
  '% participación 1': 'Porcentaje que corresponde a cada comprador en el inmueble.',
  '% participación': 'Porcentaje que corresponde a cada comprador en el inmueble.',
  '% participacion 1': 'Porcentaje que corresponde a cada comprador en el inmueble.',
  '% participacion': 'Porcentaje que corresponde a cada comprador en el inmueble.',
  // Nota: Cartera dejó "Tipo Movimiento" sin concepto y puso "cómo fue realizado el
  // pago" sobre "Comentarios" (posible corrimiento; ver diccionario). Aquí usamos
  // descripciones fieles al dato real para no propagar esa ambigüedad.
  'tipo movimiento': 'Tipo de movimiento: cómo se realizó el pago (aporte, monetización, traslado de otra partida, etc.).',
  'fecha contable': 'El día en que el banco registra el pago.',
  'valor': 'Valor aportado individual por pago realizado.',
  'comentarios': 'Comentario del movimiento (texto generado por la fiducia).',
  'fecha mov. banco': 'El día en que el cliente efectuó el pago en el banco.',
  'cuenta bancaria': 'Cuenta de recaudo de este fideicomiso.',
  'concepto': 'Dato interno del banco según sus códigos de transacciones.',
  'observaciones': 'Datos informativos del movimiento; si es algo particular, lo describe la fiducia.',
  'razones / justificaciones': 'Código interno de fiducia.',
  'id interno': 'Código interno de fiducia.',
  'id movimiento': 'Código interno de fiducia.',
  'referencia movimiento': 'Código de inmueble para recaudo y demás trámites.',
};

// Devuelve el concepto de una columna, o null si no hay (entonces no se muestra ícono).
export function getConcepto(columna, hoja = 'movimiento') {
  const key = norm(columna);
  if (!key) return null;

  const tabla = hoja === 'resumen' ? RESUMEN : MOVIMIENTO;
  if (tabla[key]) return tabla[key];

  // Columnas dinámicas de saldos por mes (solo resumen): "May 2026 +", "Jun 2026 (-)", "Saldo May 2026"
  if (hoja === 'resumen') {
    if (/^saldo\s+\w+\s+\d{4}$/.test(key)) return 'Abonado acumulado tras el ingreso y la salida del mes.';
    if (/\d{4}\s*\+$/.test(key)) return 'Ingreso del inmueble en el mes.';
    if (/\d{4}\s*\(-\)$/.test(key)) return 'Salida de recursos del inmueble en el mes.';
  }

  return null;
}
