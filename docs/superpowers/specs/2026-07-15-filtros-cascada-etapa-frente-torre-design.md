# Filtros en cascada Etapa → Frente → Torre — Design

## Contexto

El módulo de Negocios ya tiene filtros de Etapa (`docs/superpowers/specs/2026-07-15-todos-los-inmuebles-en-negocios-design.md`) y Frente (`docs/superpowers/specs/2026-07-15-filtro-frente-negocios-design.md`), independientes entre sí. El usuario pide que se comporten en cascada:

1. Al elegir una Etapa, el selector de Frente solo debe ofrecer los frentes que pertenecen a esa etapa.
2. Se agrega un tercer filtro, Torre (ej. "Torre 1", "Torre 2"), que solo aparece cuando hay un Frente elegido y ofrece las torres de ese frente.

## Datos de referencia (validados contra la BD real, 2026-07-15)

La relación Frente ↔ Etapa ↔ Torre es fija — viene de `ETAPA_POR_TORRE` (tabla que definió AED, ya en `inventarioNegocioService.js`) combinada con los valores reales de `Proyecto_Torre` en `InventarioItem`:

| Frente | Torres | Etapas |
|---|---|---|
| Kabo | 1, 2, 3, 4 | 1, 2 |
| Prive | 1, 2, 3, 4 | 1, 2 |
| Kala | 1, 2, 3, 4 | 3, 4 |
| Kaliza | 1, 2, 3 | 3, 4 |
| Isla Laguna | 1 | 0 |
| Vela Village | 1, 2 | 0 |
| The Plaza | 1 | 0 |

Esta relación no depende de búsqueda/estado/paginación — es estática, así que no hace falta recalcularla en cada request de lista; se calcula una vez y el frontend la usa para acotar las opciones de los `<select>` sin llamadas adicionales al backend.

## Cambios

### Backend (`inventarioNegocioService.js`)

**Consolidación (aprovechando el trabajo):** Hoy `valoresProyectoTorrePorEtapa()` y `valoresProyectoTorrePorFrente()` corren cada una su propia `SELECT DISTINCT datos->>'Proyecto_Torre' FROM "InventarioItem"` — la revisión final del filtro de Frente ya señaló esta duplicación como mejora pendiente. Se reemplazan ambas por una única función que hace la consulta una sola vez y devuelve las tres agrupaciones que hacen falta (etapa, frente, y el nuevo par frente+torre) en una sola pasada.

- `valoresProyectoTorre()` (nueva, reemplaza a las dos anteriores): ejecuta la consulta una vez y devuelve `{ porEtapa: Map<etapa, string[]>, porFrente: Map<frente, string[]>, porFrenteTorre: Map<"frente||torre", string[]> }`.
- `construirFiltroCombinado()` recibe un parámetro más, `torre`. La condición de Torre solo se agrega si **ambos** `frente` y `torre` vienen presentes (Torre sin Frente no identifica nada — Torre 1 existe en varios frentes); si `torre` llega sin `frente`, se ignora silenciosamente.
- `listarNegociosInventario({ ..., torre })` agrega el parámetro y, en la respuesta, además de `etapasDisponibles`/`frentesDisponibles` (sin cambios de forma), agrega dos mapas estáticos para que el frontend arme la cascada sin refetch:
  - `frentesPorEtapa: Record<string, string[]>` — ej. `{ "0": ["Isla Laguna","The Plaza","Vela Village"], "1": ["Kabo","Prive"], "2": ["Kabo","Prive"], "3": ["Kala","Kaliza"], "4": ["Kala","Kaliza"] }`.
  - `torresPorFrente: Record<string, string[]>` — ej. `{ "Kabo": ["1","2","3","4"], "Kaliza": ["1","2","3"], ... }`.
- Estos dos mapas se calculan y se devuelven en la misma condición que ya existe hoy para `etapas`/`frentes` (`noFilters`, es decir, la carga inicial sin filtros) — mismo patrón, no una llamada nueva.

### Frontend (`Negocios.jsx`)

- Nuevo estado `torreFilter` y `frentesPorEtapa`/`torresPorFrente` (guardados una vez desde la respuesta inicial, igual que `etapas`/`frentes`).
- El `<select>` de Frente, cuando `etapaFilter` tiene un valor, muestra solo `frentesPorEtapa[etapaFilter]` en vez de la lista completa de `frentes`.
- El `<select>` de Torre solo se renderiza cuando `frenteFilter` tiene un valor; sus opciones son `torresPorFrente[frenteFilter]`.
- Cascada de limpieza:
  - Al cambiar Etapa: si el `frenteFilter` actual ya no está en `frentesPorEtapa[nuevaEtapa]`, se limpia `frenteFilter` (y, en consecuencia, `torreFilter` también se limpia, porque dependía del frente que se acaba de borrar).
  - Al cambiar Frente (acción directa del usuario): `torreFilter` siempre se limpia, sin excepción — la Torre 1 de un frente nuevo es un edificio distinto al anterior, nunca la misma selección "por coincidencia".
- `torreFilter` se agrega a `filtersRef`, `fetchList`, el `useEffect` que dispara `fetchList`, `handleExport`, `clearFilters` y `hasFilters` — mismos puntos de wiring que ya tienen `etapaFilter`/`frenteFilter`.

## Fuera de alcance

- No se agrega cascada inversa (elegir Frente o Torre no acota las opciones de Etapa) — no fue pedido.
- No se toca la exportación a Excel/CSV/PDF más allá de que ya respeta `torreFilter` vía `filtersRef` (mismo mecanismo que Etapa/Frente).
- Sin migraciones de schema — el cambio es de consulta/presentación, igual que el resto del módulo.
- El filtro de Torre no tiene bucket "sin torre" para huérfanos, igual que Frente — un negocio huérfano no tiene Frente, así que tampoco puede tener Torre.
