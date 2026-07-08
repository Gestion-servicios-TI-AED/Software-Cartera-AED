# Reversas de pago y desglose de pagos por cuota en Conciliación

## Contexto

La sección "Conciliación" de un negocio (`Negocios.jsx` → `ConciliacionSection`, utils `frontend/src/utils/conciliacion.js`) cruza el plan de pagos (Forma de pago de Zoho) contra los movimientos reales del negocio, filtrando hoy estrictamente por `datos.Estado === 'APLICADO'` y descartando cualquier valor no positivo.

Dos problemas de fondo, encontrados al depurar un caso real (referencia `1370121410800`, que mostraba 726% pagado por un bug de parseo ya corregido en commit `ae65219`) y al revisar otro caso (`9928935431404`, ratio 9x contra `saldoActual`):

1. **Reversas de pago no se restan.** Existen movimientos que representan dinero que salió o se revirtió (desistimientos, devoluciones), pero `normalizarPagos()` los descarta por dos motivos independientes:
   - 22 movimientos tienen `Estado = APLICADO` pero valor negativo, y el filtro `p.valor > 0` los excluye — esto es un bug puro, sin ambigüedad.
   - Movimientos de tipo `DESISTIMIENTOS` (356 casos) y `DEVOLUCION MAYOR VALOR PAGADO` (27 casos) casi nunca tienen `Estado = APLICADO`: muchos son parte de los ~2.031 registros cuyo `Estado` quedó irrecuperable tras el bug de la columna duplicada (ver commit `37a72d1`) — su `Estado` guarda el valor viejo (estado del inmueble), no el del movimiento. Su `Tipo Movimiento` sí es confiable y debe usarse para incluirlos igual.
   - Se investigaron otros tipos de movimiento negativo (`GENERADO POR VENTA UNIDAD`, `RECLASIFICACION MOVIMIENTO EN CUENTAS`, `AJUSTE MANUAL + y -`, `APROVECHAMIENTO_NEGATIVO`) y se decidió NO incluirlos: el primero es un asiento contable automático (no un pago real), y los demás quedan fuera de alcance por ahora.

2. **No se puede auditar qué pagos cubren cada cuota.** La tabla de Conciliación muestra el monto cubierto por cuota, pero no cuáles movimientos reales lo componen — dificulta verificar la cascada contra el extracto bancario.

## Objetivo

1. Ampliar `normalizarPagos()` para incluir, además de `APLICADO` (cualquier signo), los movimientos con `Tipo Movimiento` en `DESISTIMIENTOS` o `DEVOLUCION MAYOR VALOR PAGADO` sin importar su `Estado`.
2. Que cada cuota de la tabla de Conciliación pueda expandirse (mismo patrón visual de flecha/chevron que ya usa "Historial de movimientos" en la misma página) para mostrar los pagos reales (fecha + valor completo) cuyo tramo en la cascada acumulada se cruza con el de esa cuota.

## Alcance

### 1. `frontend/src/utils/conciliacion.js` — `normalizarPagos()`

Reemplazar el filtro de inclusión:

```js
const TIPOS_REVERSA_SIEMPRE = ['DESISTIMIENTOS', 'DEVOLUCION MAYOR VALOR PAGADO'];

export function normalizarPagos(movimientos) {
  return (movimientos || [])
    .filter((m) => {
      const estado = String(m.datos?.Estado || '').trim().toUpperCase();
      if (estado === 'APLICADO') return true;
      const tipo = String(m.datos?.['Tipo Movimiento'] || '').trim().toUpperCase();
      return TIPOS_REVERSA_SIEMPRE.includes(tipo);
    })
    .map((m) => ({ fecha: m.fechaContable ? new Date(m.fechaContable) : null, valor: parseMonto(m.datos?.Valor) }))
    .filter((p) => !isNaN(p.valor) && p.valor !== 0)
    .sort(/* igual que hoy */);
}
```

Cambios respecto a la versión actual: la condición de inclusión pasa de "solo `Estado === 'APLICADO'`" a "`Estado === 'APLICADO'` O `Tipo Movimiento` es una reversa reconocida"; el filtro final pasa de `valor > 0` a `valor !== 0` (permite negativos).

Comparación de nombres: el matching de `Tipo Movimiento` es por igualdad exacta (mayúsculas, trim), igual de estricto que el de `Estado` ya existente en el archivo — no se usa `includes` para evitar falsos positivos con tipos similares no confirmados.

### 2. `frontend/src/utils/conciliacion.js` — `conciliar()`

Cada cuota ya ocupa un tramo `[requeridoAntes, requeridoDespues)` dentro del acumulado total de pagos (plan consumido en orden). Para cada cuota, se calcula qué pagos (del array ya ordenado con sus sumas prefijas) tienen su propio tramo `[acumuladoAntes, acumuladoDespues)` cruzado con el de la cuota, y se listan completos (sin prorratear):

```js
function tramosSuperpuestos(pagos, desde, hasta) {
  let acumulado = 0;
  const resultado = [];
  for (const p of pagos) {
    const antes = acumulado;
    acumulado += p.valor;
    const lo = Math.min(antes, acumulado);
    const hi = Math.max(antes, acumulado);
    if (hi > desde && lo < hasta) resultado.push({ fecha: p.fecha, valor: p.valor });
  }
  return resultado;
}
```

`conciliar()` invoca esto por cuota (usando los mismos `requeridoAntes`/`requerido` que ya calcula) y agrega el campo `pagosAplicados` a cada cuota devuelta. `Math.min`/`Math.max` normalizan el caso de pagos negativos (reversas), cuyo "ancho" en el acumulado es hacia atrás.

Nota: un pago que cruza el límite entre dos cuotas aparece completo en ambas — comportamiento decidido explícitamente (no se prorratea).

### 3. `frontend/src/pages/Negocios.jsx` — `ConciliacionSection`

- Cada `<tr>` de cuota se vuelve expandible: al hacer clic, se despliega una fila adicional con la lista de `pagosAplicados` (fecha formateada + valor en COP; los negativos se muestran en rojo con signo, ej. "-$ 480.019").
- Si `pagosAplicados` está vacío, no se muestra flecha de expansión (o se deshabilita), y no hay fila expandible.
- El chevron y la interacción de expandir/colapsar siguen el mismo patrón visual que `MovimientoRow` (columna de flecha a la izquierda, `ChevronRight` que rota al expandir), para mantener consistencia dentro del mismo módulo.

## Fuera de alcance

- No se modifica ninguna otra vista (Oportunidades, dashboard, exportes) — el cambio de `normalizarPagos` es local a Conciliación.
- No se incluyen `GENERADO POR VENTA UNIDAD`, `RECLASIFICACION MOVIMIENTO EN CUENTAS`, `AJUSTE MANUAL + y -` ni `APROVECHAMIENTO_NEGATIVO` como reversas — quedan documentados como decisión explícita, no como pendiente técnico.
- No se prorratea el valor de un pago partido entre dos cuotas.
- No se toca la reparación de datos de `Estado` en movimientos (script `fix-estado-movimientos.js` ya corrido) — los ~2.031 registros irreparables permanecen con su `Estado` viejo; por eso el matching por `Tipo Movimiento` se hace sin depender de `Estado` para estos dos tipos.

## Testing (manual — el repo no tiene suite de tests)

- Verificar con datos reales el caso `1370121410800`: sigue dando ~100% pagado (ya lo confirma el fix anterior, no debería cambiar porque no tiene reversas).
- Verificar con datos reales el caso `9928935431404`: su reversa (`DESISTIMIENTOS`, -$92.671.291) ahora debe restarse del total pagado, acercando el resultado a `saldoActual` (11.568.065) en vez del 9x actual.
- Verificar que los 22 movimientos APLICADO-negativos ahora se resten correctamente en los negocios que los tienen.
- Expandir una cuota con pagos y confirmar que la lista mostrada, sumada, es coherente con el `cubierto` de esa cuota (salvo el caso de pagos que cruzan el límite, que aparecen completos en ambas cuotas vecinas).
- Expandir una cuota sin pagos (pendiente) y confirmar que no rompe / muestra vacío correctamente.
