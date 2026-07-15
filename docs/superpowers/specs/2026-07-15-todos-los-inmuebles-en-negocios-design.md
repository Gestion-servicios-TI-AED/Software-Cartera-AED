# Todos los inmuebles en el módulo de Negocios

## Contexto

Hoy `GET /api/negocios` (y todo el módulo `Negocios.jsx`) pagina sobre la tabla `Negocio` (979 filas), que solo existen para inmuebles que ya tienen datos de Movimientos/Fiducia cargados desde Excel. Los ~1936 inmuebles reales de Zoho (`InventarioItem`, categorías Apartamento/Suite/Local/Oficina — sin categorías raras que filtrar) que aún no tienen negocio simplemente no aparecen en el módulo.

En la misma sesión ya se resolvió el cruce `Negocio.referencia` ↔ `InventarioItem.referenciaRecaudo` con un respaldo por Nomenclatura → Código de inmueble (función `resolverInventarioPorNegocio` en `backend/src/routes/negocios.js`), usado hoy para `projectCode`/`proyectoTorre`/`etapa`. Ese mismo cruce, invertido, es la base de este cambio.

Hallazgo que condiciona el diseño (verificado contra la BD real): existen **40 `Negocio` reales** (con comprador, saldo, movimientos) cuya Referencia no calza con ningún `InventarioItem` — típicamente depósitos y parqueaderos ("DEP 13", "PARQ 25") que se venden como parte de un negocio pero no están cargados como Producto en Zoho. No se pueden perder de la vista.

## Objetivo

El módulo de Negocios pasa a mostrar **todos los inmuebles** de Zoho, con la información de negocio (oportunidad, comprador, saldo, movimientos, conciliación) cuando exista, y sin ella (secciones en estado vacío) cuando no exista todavía. Los 40 negocios sin inmueble asociado se siguen mostrando, como filas propias.

## Arquitectura

**Fuente de la lista**: `InventarioItem` LEFT JOIN `Negocio` (resuelto vía `LEFT JOIN LATERAL`, priorizando match directo por Referencia de Recaudo sobre el respaldo por Nomenclatura/Código), **UNION ALL** con los `Negocio` que no calzan con ningún `InventarioItem`. Total combinado ≈ 1976 filas.

**Dónde vive cada regla:**
- `ETAPA_POR_TORRE` (backend/src/routes/negocios.js) se queda como única fuente de la regla de negocio, solo en JS. Para el filtro de Etapa en SQL, JS resuelve primero qué valores crudos de `Proyecto_Torre` (de los ~19 distintos que existen) corresponden a la etapa pedida, y esa lista chica se pasa a la consulta como `= ANY($lista)` — cero duplicación de la regla en SQL.
- Los endpoints de una sola fila (detalle, movimientos) NO usan el JOIN pesado: se resuelven con Prisma ORM normal, ya con el id conocido de antemano.

**Identificador único**, para poder seleccionar/pedir detalle de cualquier fila sin ambigüedad entre las dos tablas de origen:
- `inv-<InventarioItem.id>` para filas ancladas en un inmueble.
- `neg-<Negocio.id>` para los negocios huérfanos (sin inmueble).

## Backend

### `GET /api/negocios` (lista)

Query SQL cruda (vía `prisma.$queryRaw` con fragmentos `Prisma.sql`/`Prisma.join` para construir el `WHERE` de forma segura), estructurada en dos mitades unidas con `UNION ALL` y las mismas columnas de salida en ambas:

1. **Mitad inmuebles**: `InventarioItem` con `LEFT JOIN LATERAL` hacia `Negocio` (match directo por `referenciaRecaudo = referencia`, o respaldo `datos->>'Nomenclatura' = datos->>'C_digo_inmueble'`; `ORDER BY (match directo) DESC LIMIT 1` para priorizar), más `LEFT JOIN LATERAL` para `compradores` (`jsonb_agg` desde `NegocioComprador`, ordenado por `orden`) y para `totalMovimientos` (`COUNT(*)` desde `NegocioMovimiento`).
2. **Mitad huérfanos**: `Negocio` cuya referencia no calza con ningún `InventarioItem` (ni directo ni por Nomenclatura), con las columnas de inmueble en `NULL`.

**Filtros** (aplicados sobre el conjunto ya unido):
- **Etapa**: `datos_inmueble->>'Proyecto_Torre' = ANY($lista)` (lista resuelta en JS, ver arriba). Los huérfanos y los inmuebles sin etapa numerada caen en Etapa 0 — mismo bucket que ya existe hoy.
- **Estado** / **Solo con abonos**: sobre las columnas de `Negocio` (`estado`, `saldoActual`); al venir `NULL` por el `LEFT JOIN` cuando no hay negocio, excluyen automáticamente esas filas sin código especial.
- **Búsqueda**: además de lo que ya busca hoy (Negocio.referencia, Negocio.datos->>'Nomenclatura', comprador nombre/nroId), se agrega `datos_inmueble->>'Project_Code'` y `datos_inmueble->>'Proyecto_Torre'`.

**Orden por defecto**: `datos_inmueble->>'Proyecto_Torre' ASC, datos_inmueble->>'Project_Code' ASC` (agrupado por edificio); los huérfanos (sin esas columnas) ordenan al final.

**Paginación**: `COUNT(*)` sobre el mismo `FROM`/`JOIN`/`WHERE` combinado, en paralelo a la consulta de datos.

**Forma de cada fila:**
```js
{
  id,                 // "inv-<uuid>" o "neg-<uuid>"
  tieneNegocio,        // boolean
  referencia, estado, saldoActual, compradores, totalMovimientos, datos,  // null si no hay negocio
  projectCode, proyectoTorre, etapa,  // null si es huérfano (sin inmueble)
}
```

### `GET /api/negocios/:id` (detalle)

- `id` empieza con `inv-` → se busca el `InventarioItem` por su id (404 si no existe). Se resuelve su `Negocio` vinculado con la misma lógica de 2 niveles (directo, luego Nomenclatura/Código), ahora partiendo del inmueble ya conocido — se elimina el tercer nivel de respaldo actual (buscar el inmueble vía `Inmueble.id` de la oportunidad), porque ya no hace falta: el inmueble es el punto de partida.
- `id` empieza con `neg-` → se busca el `Negocio` directamente, sin inmueble que resolver.
- Misma forma de respuesta en ambos casos (con los campos del lado ausente en `null`), más `oportunidad` y `codigoInmueble` como hoy.

### `GET /api/negocios/:id/movimientos`

Mismo `id` prefijado; resuelve el negocio vinculado (o ninguno) igual que el detalle. Si no hay negocio, responde `{ data: [], pagination: { total: 0, ... } }` en vez de error.

## Frontend (`Negocios.jsx`)

- `selected`, `NegocioItem`, `NegocioDetalle`: pasan a usar `negocio.id` (el id prefijado) en vez de `negocio.referencia` para selección y para las llamadas a `getNegocio`/`getNegocioMovimientos`.
- **`NegocioItem`**: título y subtítulo sin cambios (ya son independientes del negocio). Se agrega badge discreto **"Sin negocio"** cuando `!tieneNegocio`, en el lugar del badge de Estado.
- **`NegocioDetalle`**: encabezado usa "Referencia" / `negocio.referencia` cuando existe; si no, la etiqueta pasa a "Project Code" / `negocio.projectCode`, con el badge "Sin negocio" junto al estado.
- **Info del apartamento**: nueva función `categorizeInventarioDatos(datosInmueble)` (paralela a `categorizeDatos`, sin reusar el clasificador difuso por substring ya que los nombres de campo de Zoho Product no coinciden con los del Excel) que arma entradas `[etiqueta, valor]` desde el inmueble cuando no hay `Negocio.datos`: Código de inmueble, Categoría (`Product_Category`), Tipo (`Tipo_Apto`), Área privada y construida (m²), Piso, Alcobas, Baños, Estrato. Ampliable después si falta algo.
- Comprador / Conciliación / Historial de movimientos: ya manejan el estado vacío hoy ("Sin compradores registrados", "Sin oportunidad de Zoho vinculada...", lista vacía) — sin cambios adicionales.

## Fuera de alcance

- **Límite conocido y aceptado**: la detección de "huérfano" (y el `LEFT JOIN LATERAL` de la lista) solo usa los 2 niveles de respaldo (Referencia de Recaudo directa, luego Nomenclatura/Código) — no replica el tercer nivel que usa el detalle *actual* (Inmueble.id de la oportunidad Zoho vinculada). Verificado contra la BD real: de los 40 huérfanos, solo 2 se resolverían por esa vía. Sumar un `JOIN` de 3 tablas (inmueble ↔ negocio ↔ oportunidad) en el `LATERAL`/anti-join por 2 filas de 1976 no vale la complejidad — esos 2 negocios (y sus inmuebles correspondientes) van a aparecer como dos filas separadas en vez de una sola fila fusionada. El endpoint de detalle (`GET /:id`) tampoco reintenta ese tercer nivel al partir de un `neg-` huérfano.
- No se modifica el pipeline de sync de Zoho ni de Movimientos/Fiducia — este cambio es solo de lectura/presentación en el módulo de Negocios.
- No se agregan nuevos campos de Zoho Product más allá de los listados en "Info del apartamento"; se puede ampliar en una entrega futura si hace falta.
- No se cambia el criterio de exportación (Excel/PDF/CSV) del listado en esta entrega — exporta lo que la lista muestre en pantalla, con las mismas columnas de hoy (los campos de inmueble en `null` para huérfanos, y viceversa).
- Sin migraciones de schema: todo el cambio es de consulta/presentación.

## Testing (manual — el repo no tiene suite de tests)

- Lista sin filtros: aparecen ~1976 filas (1936 inmuebles + 40 huérfanos), agrupadas por Proyecto/Torre.
- Un inmueble con negocio real (ej. Nomenclatura 24105 usado en esta sesión): detalle completo, sin badge "Sin negocio".
- Un inmueble sin negocio: aparece en la lista con badge "Sin negocio", título = Project Code, subtítulo = Proyecto Torre - Etapa; al abrir el detalle, Comprador/Conciliación/Movimientos en estado vacío, "Info del apartamento" con los datos básicos del inventario.
- Un negocio huérfano (ej. un "DEP 13"): aparece al final de la lista, sin projectCode/proyectoTorre/etapa, con sus datos de negocio normales.
- Filtro Estado / Solo con abonos: los inmuebles sin negocio y los huérfanos sin ese estado desaparecen de la lista mientras el filtro esté activo.
- Filtro Etapa: sigue sumando exactamente el total combinado sin huecos ni duplicados (mismo chequeo que se hizo para el filtro actual).
- Búsqueda por Project Code / Proyecto Torre: encuentra inmuebles sin negocio.
- Paginación y orden por defecto (Proyecto/Torre) se mantienen estables entre páginas.
