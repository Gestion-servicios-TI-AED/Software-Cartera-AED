# Filtro de Frente en el módulo de Negocios — Design

## Contexto

El módulo de Negocios (`zoho-payment-tracker`) ya tiene un filtro de Etapa que agrupa los inmuebles por la etapa constructiva de su Torre (1-4, con "0" para lo que no tiene etapa numerada). El usuario quiere un filtro adicional por **Frente** — el nombre del proyecto/desarrollo (Kabo, Prive, Kala, Kaliza, Isla Laguna, Vela Village, The Plaza) — independiente de la Etapa.

## Origen del dato

`InventarioItem.datos.Proyecto_Torre` (ej. `"Kabo - Torre 3"`, `"Kala Golf - Torre 4"`) ya se parsea con `parseProyectoTorre()` (`inventarioNegocioService.js`) para extraer `{ proyecto, torre }`. El campo `proyecto` de ese parseo **es** el Frente.

Se valida contra la base real (2026-07-15):
- `Proyecto_Torre` está poblado en el 100% de los 1936 `InventarioItem` (0 nulos).
- `Project_Code` (alternativa que se consideró) tiene 118 nulos — por eso se descarta como fuente y se usa `Proyecto_Torre`, ya usado por Etapa.
- Los 7 frentes reales, parseados: Isla Laguna, Kabo, Kala, Kaliza, Prive, The Plaza, Vela Village.

Los negocios huérfanos (sin `InventarioItem` vinculado — depósitos, parqueaderos sueltos, etc.) no tienen `Proyecto_Torre`, así que no tienen Frente. Al filtrar por un Frente específico, simplemente no aparecen — mismo comportamiento que ya tienen hoy con el filtro de Estado (que tampoco aplica a filas sin `Negocio.estado`).

## Cambios

### Backend (`inventarioNegocioService.js`)

- Nueva función `valoresProyectoTorrePorFrente()`, análoga a `valoresProyectoTorrePorEtapa()`: agrupa los valores crudos de `Proyecto_Torre` en BD por el `proyecto` que arroja `parseProyectoTorre()`, devolviendo un `Map<frente, valoresProyectoTorre[]>`.
- `construirFiltroCombinado()` recibe un nuevo parámetro `frente` y, si viene, agrega `c.inventario_datos->>'Proyecto_Torre' = ANY(${lista}::text[])` al WHERE (mismo patrón que el filtro de Etapa, sin el caso especial de `IS NULL` porque Frente no tiene bucket "sin frente").
- `listarNegociosInventario({ ..., frente })` pasa el nuevo parámetro y agrega `frentesDisponibles` (nombres únicos, orden alfabético) al resultado — mismo patrón que `etapasDisponibles`.
- `GET /api/negocios` (route handler) pasa `req.query.frente` a `listarNegociosInventario` y expone `frentes` en la respuesta cuando no hay filtros activos (mismo patrón que `etapas`).

### Frontend (`Negocios.jsx`)

- Nuevo estado `frenteFilter`, incluido en `filtersRef`, en la llamada a `getNegocios(...)`, en `clearFilters()` y en `hasFilters`.
- Nuevo `<select>` "Frente" junto al de Etapa, poblado desde `frentes` (igual que `etapas`), con opción "Todos los frentes" por defecto. Orden alfabético.
- Se puede combinar libremente con Etapa, Estado, búsqueda y "Solo con abonos" (AND, como ya funciona hoy entre los filtros existentes).

## Fuera de alcance

- No se toca la exportación a Excel/CSV/PDF (Frente ya es derivable de `Nomenclatura`/`Project_Code`/`Proyecto_Torre` en los datos exportados; no hace falta columna nueva).
- No hay migración de schema — el cambio es de consulta y presentación, igual que el resto del módulo.
- No se agrega un bucket "Sin frente" para huérfanos (confirmado con el usuario: se excluyen simplemente al filtrar por un Frente específico).
