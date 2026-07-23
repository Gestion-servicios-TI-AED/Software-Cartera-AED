# Diccionario de columnas — Informe de Movimientos Fiducia

> Fuente: `16013-Informe Movimientos-20260611 (1).xlsx` (PA Inmobiliario Vela Village).
> Conceptos provistos por el área de **Cartera** de AED.
> Generado: 2026-06-16.

El archivo tiene **dos hojas**:

| Hoja real | Rol | Fila de conceptos | Fila de nombres de columna | Primera fila de datos |
|---|---|---|---|---|
| `PLANTILLA DEL RESUMEN` | Resumen por inmueble/negocio | Fila 4 | Fila 5 | Fila 6 |
| `Hoja2` | Movimientos (pagos) por propietario | Fila 4 (+ fila 5 para 2 columnas) | Fila 6 | Fila 7 |

> ⚠️ **Ojo:** los nombres de hoja de este export (`PLANTILLA DEL RESUMEN`, `Hoja2`) **no coinciden** con los que el software espera hoy (`Movimientos`, `Mov_Por_Propietario`). Ver nota al final.

Convención de la columna **¿Aplica?**:
- ✅ → la columna **aplica** y el software la conserva.
- ❌ → concepto **`no aplica`** / **`en este momento no aplica`** → se quita del software.
- 🚫 → concepto **`necesario para cuando se va a entregar el inmueble`** (uso futuro, aún no se gestiona) → por decisión de Cartera (2026-06-16) también se quita del software por ahora.

---

## Hoja 1 — `PLANTILLA DEL RESUMEN` (Resumen por negocio)

| # | Columna (nombre) | Concepto (Cartera) | ¿Aplica? |
|---|---|---|---|
| 0 | ID | *(sin concepto — identificador interno)* | ✅ |
| 1 | Fideicomiso | nombre de patrimonio autónomo | ✅ |
| 2 | Inventario | Fideicomiso | ✅ |
| 3 | Categoria | etapa | ✅ |
| 4 | Tipo Inmueble | tipo de inmueble | ✅ |
| 5 | Nomenclatura | número del inmueble | ✅ |
| 6 | Area | área | ✅ |
| 7 | Referencia | código de inmueble para recaudo y demás trámites | ✅ |
| 8 | Estado | condición actual del inmueble: antes de promesa (opcionado), después de firma de promesa (prometido), autorizado para escritura (para firma de escritura), Vendido (después de firma de escritura) | ✅ |
| 9 | Propietarios | nombre de los compradores o empresa compradora | ✅ |
| 10 | Representante Legal o Apoderado | representante legal cuando compra un ente jurídico (empresa) | ✅ |
| 11 | Unidades Adicionales | cuando compran depósito y parqueadero se coloca la descripción de este | ✅ |
| 12 | Fecha Contrato | fecha de vinculación | ✅ |
| 13 | Valor venta | valor del inmueble | ✅ |
| 14 | Cuota Inicial | valor de la cuota inicial a pagar | ✅ |
| 15 | Crédito | descripción de cómo se pagará el saldo contra entrega | ✅ |
| 16 | Aportes Posteriores | cuando se trae valor de otra fiducia y se traslada a esta fiduciaria | ✅ |
| 17 | **Canje** | **en este momento no aplica** | ❌ |
| 18 | **Subsidio** | **en este momento no aplica** | ❌ |
| 19 | **Descuentos** | **en este momento no aplica** | ❌ |
| 20 | **Valor Acreditación** | **en este momento no aplica** | ❌ |
| 21 | Cumple Acreditación | si cumple con las condiciones para seguir en la compra | ✅ |
| 22 | Fecha Autoriz. Escritura | necesario para cuando se va a entregar el inmueble | 🚫 |
| 23 | Matricula Inmobiliaria | necesario para cuando se va a entregar el inmueble | 🚫 |
| 24 | Valor Escritura | necesario para cuando se va a entregar el inmueble | 🚫 |
| 25 | Observaciones | necesario para cuando se va a entregar el inmueble | 🚫 |
| 26 | Fecha Factura | necesario para cuando se va a entregar el inmueble | 🚫 |
| 27 | Número Factura | necesario para cuando se va a entregar el inmueble | 🚫 |
| 28 | Número Escritura Publica | necesario para cuando se va a entregar el inmueble | 🚫 |
| 29 | Notaria | necesario para cuando se va a entregar el inmueble | 🚫 |
| 30 | Valor Factura | necesario para cuando se va a entregar el inmueble | 🚫 |
| 31 | Fecha Envío Contabilidad | necesario para cuando se va a entregar el inmueble | 🚫 |
| 32 | Saldo Inicial | abono total a la fecha del inmueble | ✅ |
| 33 | May 2026 + | ingreso del inmueble en un mes específico | ✅ |
| 34 | May 2026 (-) | salida de recursos del inmueble en un mes específico | ✅ |
| 35 | Saldo May 2026 | saldo que queda después de las dos columnas anteriores | ✅ |
| 36 | Jun 2026 + | ingreso del inmueble en un mes específico | ✅ |
| 37 | Jun 2026 (-) | salida de recursos del inmueble en un mes específico | ✅ |
| 38 | Saldo Jun 2026 | saldo que queda después de las dos columnas anteriores | ✅ |
| 39 | **Movimiento Posterior** | **en este momento no aplica** | ❌ |
| 40 | Saldo Actual | saldo pagado a la fecha | ✅ |

> Las columnas `May 2026 / Jun 2026 / Saldo <mes>` son dinámicas: cambian de nombre según el período del reporte.

### Columnas quitadas — Hoja 1
**No aplica (❌):** `Canje`, `Subsidio`, `Descuentos`, `Valor Acreditación`, `Movimiento Posterior`
**Uso futuro / entrega del inmueble (🚫):** `Fecha Autoriz. Escritura`, `Matricula Inmobiliaria`, `Valor Escritura`, `Observaciones`, `Fecha Factura`, `Número Factura`, `Número Escritura Publica`, `Notaria`, `Valor Factura`, `Fecha Envío Contabilidad`

---

## Hoja 2 — `Hoja2` (Movimientos / pagos por propietario)

| # | Columna (nombre) | Concepto (Cartera) | ¿Aplica? |
|---|---|---|---|
| 0 | Fideicomiso | nombre de patrimonio autónomo | ✅ |
| 1 | Inventario | Fideicomiso | ✅ |
| 2 | Categoria | etapa | ✅ |
| 3 | Tipo Inmueble | tipo de inmueble | ✅ |
| 4 | Nomenclatura | número del inmueble | ✅ |
| 5 | Area | área | ✅ |
| 6 | Referencia | código de inmueble para recaudo y demás trámites | ✅ |
| 7 | Estado | condición actual del inmueble (opcionado / prometido / para firma de escritura / vendido) | ✅ |
| 8 | Nro ID Propietario 1 | identificación de los compradores | ✅ |
| 9 | Propietario 1 | nombre de los compradores o empresa compradora | ✅ |
| 10 | % Participación 1 | cuánto % corresponde a cada comprador en el inmueble | ✅ |
| 11 | Tipo Movimiento | *(sin concepto en la fila — ver ⚠️ abajo; probablemente "cómo fue realizado el pago")* | ✅ |
| 12 | Fecha Contable | el día que el banco registra el pago | ✅ |
| 13 | Valor | valor aportado individual por pago realizado | ✅ |
| 14 | Comentarios | "cómo fue realizado el pago (pesos / monetización / traslado de otra partida)" — ⚠️ ver nota | ✅ |
| 15 | Fecha Mov. Banco | el día que fue efectuado el pago en el banco por el cliente | ✅ |
| 16 | Cuenta Bancaria | cuenta de recaudo de este fideicomiso | ✅ |
| 17 | Concepto | dato interno del banco según sus códigos de transacciones | ✅ |
| 18 | **Sucursal** | **no aplica** | ❌ |
| 19 | Referencia *(2ª)* | código de inmueble para recaudo y demás trámites | ✅ |
| 20 | Estado *(2ª)* | *(sin concepto — estado del movimiento: APLICADO, etc.)* | ✅ |
| 21 | Observaciones | para datos informativos del movimiento; si es algo particular lo describe la fiducia | ✅ |
| 22 | Razones / Justificaciones | código interno de fiducia | ✅ |
| 23 | ID Interno | código interno de fiducia | ✅ |

### Columnas NO aplica — Hoja 2
- `Sucursal`

> ⚠️ **Ambigüedad a confirmar con Cartera (Hoja 2):** la fila de conceptos deja `Tipo Movimiento` (col 11) **sin concepto**, mientras `Comentarios` (col 14) recibe *"cómo fue realizado el pago…"*. Por el contenido real de los datos, ese concepto describe mejor a **Tipo Movimiento** que a Comentarios. Conviene que Cartera confirme si hubo un corrimiento de una celda.

---

## Impacto en el software (revisión por módulos)

Lista única de exclusión, definida una sola vez y reutilizada en backend y frontend:
- Backend: `zoho-payment-tracker/backend/src/config/columnasExcluidas.js`
- Frontend: `zoho-payment-tracker/frontend/src/utils/columnasExcluidas.js`

### Cambios aplicados (2026-06-16)

**Backend — dejan de guardarse en las tablas curadas (`Negocio.datos` / `NegocioMovimiento.datos`):**
- `services/fiduciaService.js` — parser en vivo (`processResumenSheet`, `processMovPorPropietarioSheet`).
- `routes/negocios.js` — backfill (Fase 1 resumen, Fase 2 movimientos).

> Para limpiar datos ya almacenados, correr el backfill: `POST /api/negocios/backfill`. Las importaciones nuevas ya quedan limpias.

**Frontend — dejan de mostrarse:**
- `pages/Negocios.jsx` (resumen + movimientos)
- `pages/ApartamentoDetalle.jsx` (resumen + movimientos)
- `pages/FiduciaPropietario.jsx` (movimientos)
- `pages/FiduciaMovimientos.jsx` (movimientos)

### No modificado (a propósito)
- **Visor crudo del Excel** (`pages/FiduciaDetalle.jsx` + tabla `HojaFiduciaria`) y la tabla cruda `MovimientoFiduciario`: muestran el archivo subido tal cual (espejo 1:1 para auditoría). No se filtran para no alterar la fidelidad del original. Si se quiere también ocultar ahí, se puede aplicar la misma lista.

### ⚠️ Discrepancia de formato (importante)

El parser actual (`fiduciaService.js`) está hecho para hojas llamadas **`Movimientos`** y **`Mov_Por_Propietario`** con el encabezado en la **fila 7**. Este export trae hojas **`PLANTILLA DEL RESUMEN`** y **`Hoja2`** con encabezados en filas **5 y 6**. Si el formato del informe cambió, el problema no es solo de conceptos: el software no estaría mapeando bien este archivo. Hay que confirmar cuál formato es el vigente antes de tocar el parser.
