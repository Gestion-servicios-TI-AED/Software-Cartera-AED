# Filtro de Frente en el módulo de Negocios — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Agregar un filtro de "Frente" (Kabo, Prive, Kala, Kaliza, Isla Laguna, Vela Village, The Plaza) al módulo de Negocios, combinable con los filtros existentes (Etapa, Estado, búsqueda, Solo con abonos).

**Architecture:** El Frente se deriva del mismo campo que ya usa el filtro de Etapa (`InventarioItem.datos.Proyecto_Torre`, parseado con `parseProyectoTorre()`), así que no hace falta lógica de parseo nueva — solo agrupar por `proyecto` en vez de por etapa. Backend: nueva función `valoresProyectoTorrePorFrente()` en `inventarioNegocioService.js` (mismo patrón que `valoresProyectoTorrePorEtapa()`), un condicional más en `construirFiltroCombinado()`, y `frentesDisponibles` expuesto en `listarNegociosInventario()`. Frontend: un `<select>` "Frente" junto al de Etapa en `Negocios.jsx`.

**Tech Stack:** Node.js + Express + Prisma 5 (PostgreSQL) en el backend; React + Vite en el frontend. Sin suite de tests configurada — cada tarea se verifica con un script Node ad-hoc contra la BD real y/o `curl` contra el servidor de desarrollo (mismo patrón ya usado en esta sesión).

## Global Constraints

- No modificar el pipeline de sync de Zoho ni de Movimientos/Fiducia (spec, "Fuera de alcance").
- Sin migraciones de schema (spec, "Fuera de alcance").
- No se agrega un bucket "Sin frente" para huérfanos — al filtrar por un Frente específico, los negocios huérfanos simplemente no aparecen (confirmado con el usuario en el spec).
- Frente se deriva de `Proyecto_Torre` (100% de los 1936 `InventarioItem` lo tienen), no de `Project_Code` (118 nulos) — ya validado en el spec.
- Spec de referencia: `docs/superpowers/specs/2026-07-15-filtro-frente-negocios-design.md`.

---

## Task 1: Backend — filtro de Frente en `listarNegociosInventario`

**Files:**
- Modify: `zoho-payment-tracker/backend/src/services/inventarioNegocioService.js`
- Modify: `zoho-payment-tracker/backend/src/routes/negocios.js` (handler `router.get('/', ...)`)

**Interfaces:**
- Consumes: `parseProyectoTorre` (ya existe en el mismo archivo).
- Produces:
  - `valoresProyectoTorrePorFrente(): Promise<Map<string, string[]>>` — mapa de nombre de Frente (ej. `"Kabo"`) a la lista de valores crudos de `Proyecto_Torre` que le pertenecen.
  - `listarNegociosInventario({ ..., frente })` — nuevo parámetro opcional `frente: string`.
  - El resultado de `listarNegociosInventario` agrega `frentesDisponibles: string[]` (nombres de Frente, orden alfabético).

- [ ] **Step 1: Agregar `valoresProyectoTorrePorFrente()` al servicio**

En `zoho-payment-tracker/backend/src/services/inventarioNegocioService.js`, justo después del cierre de `valoresProyectoTorrePorEtapa()` (después de la línea `}` que cierra esa función, antes del comentario `// CTE compartida...`), agrega:

```js

// Valores crudos de Proyecto_Torre en BD, agrupados por el nombre de Frente
// (el `proyecto` que devuelve parseProyectoTorre). Mismo patrón que
// valoresProyectoTorrePorEtapa(), para resolver el filtro de Frente en SQL
// (`= ANY(...)`) sin duplicar el parseo ahí.
async function valoresProyectoTorrePorFrente() {
  const rows = await prisma.$queryRaw`
    SELECT DISTINCT datos->>'Proyecto_Torre' AS v
    FROM "InventarioItem"
    WHERE datos->>'Proyecto_Torre' IS NOT NULL`;
  const porFrente = new Map();
  for (const { v } of rows) {
    const info = parseProyectoTorre(v);
    if (!info) continue;
    if (!porFrente.has(info.proyecto)) porFrente.set(info.proyecto, []);
    porFrente.get(info.proyecto).push(v);
  }
  return porFrente;
}
```

- [ ] **Step 2: Extender `construirFiltroCombinado()` para aceptar `frente`**

En el mismo archivo, cambia la firma de `construirFiltroCombinado`:

```js
function construirFiltroCombinado({ search, estado, etapa, frente, saldoPendiente, valoresEtapa, valoresFrente }) {
```

(antes era `function construirFiltroCombinado({ search, estado, etapa, saldoPendiente, valoresEtapa }) {`)

Justo después del bloque `if (etapa) { ... }` (antes del `return condiciones.length ? ...`), agrega:

```js
  if (frente) {
    const lista = valoresFrente.get(frente) || [];
    condiciones.push(Prisma.sql`c.inventario_datos->>'Proyecto_Torre' = ANY(${lista}::text[])`);
  }
```

- [ ] **Step 3: Pasar `frente` y `frentesDisponibles` en `listarNegociosInventario()`**

Cambia la firma y el cuerpo de `listarNegociosInventario`:

```js
async function listarNegociosInventario({ search, estado, etapa, frente, saldoPendiente, page, limit }) {
  const [valoresEtapa, valoresFrente] = await Promise.all([
    valoresProyectoTorrePorEtapa(),
    valoresProyectoTorrePorFrente(),
  ]);
  const filtro = construirFiltroCombinado({ search, estado, etapa, frente, saldoPendiente, valoresEtapa, valoresFrente });
```

(reemplaza las dos líneas actuales `const valoresEtapa = await valoresProyectoTorrePorEtapa();` y `const filtro = construirFiltroCombinado({ search, estado, etapa, saldoPendiente, valoresEtapa });`)

Y al final de la función, cambia el `return` para agregar `frentesDisponibles`:

```js
  return {
    data,
    total,
    etapasDisponibles: [...valoresEtapa.keys()].sort((a, b) => Number(a) - Number(b)),
    frentesDisponibles: [...valoresFrente.keys()].sort(),
  };
```

(reemplaza el `return { data, total, etapasDisponibles: ... };` actual)

- [ ] **Step 4: Exportar `valoresProyectoTorrePorFrente` en `module.exports`**

Agrega `valoresProyectoTorrePorFrente` al `module.exports` del archivo (no es estrictamente necesaria fuera del servicio, pero sigue el mismo patrón que `valoresProyectoTorrePorEtapa` — que tampoco se exporta; **no la agregues** al `module.exports`, se mantiene privada del módulo igual que su análoga de Etapa).

- [ ] **Step 5: Verificar con un script contra la BD real**

```bash
cd zoho-payment-tracker/backend && node -e "
const { listarNegociosInventario } = require('./src/services/inventarioNegocioService');
(async () => {
  const r = await listarNegociosInventario({ page: 1, limit: 3 });
  console.log('frentesDisponibles:', r.frentesDisponibles);

  const kabo = await listarNegociosInventario({ frente: 'Kabo', page: 1, limit: 9999 });
  console.log('Kabo total:', kabo.total, 'todas con proyectoTorre que empieza con Kabo:', kabo.data.every(d => d.proyectoTorre?.startsWith('Kabo')));

  // Combinar Frente + Etapa: Kabo solo tiene etapas 1 y 2 (ETAPA_POR_TORRE)
  const kaboEtapa2 = await listarNegociosInventario({ frente: 'Kabo', etapa: '2', page: 1, limit: 9999 });
  console.log('Kabo + Etapa 2 total:', kaboEtapa2.total, 'todas etapa 2:', kaboEtapa2.data.every(d => d.etapa === '2'));

  // La suma de todos los frentes debe igualar el total de inmuebles con Proyecto_Torre (todos, ya que esta poblado al 100%)
  let suma = 0;
  for (const f of r.frentesDisponibles) {
    const p = await listarNegociosInventario({ frente: f, page: 1, limit: 9999 });
    console.log('frente', f, '->', p.total);
    suma += p.total;
  }
  console.log('suma frentes:', suma);
  process.exit(0);
})();
"
```

Expected:
- `frentesDisponibles` es `['Isla Laguna', 'Kabo', 'Kala', 'Kaliza', 'Prive', 'The Plaza', 'Vela Village']` (orden alfabético).
- `Kabo total` > 0, y todas las filas devueltas tienen `proyectoTorre` empezando con `"Kabo"`.
- `Kabo + Etapa 2` trae solo filas con `etapa: '2'` (Kabo 3 y Kabo 4 son etapa 2; Kabo 1/2 son etapa 1).
- La suma de todos los frentes es igual a 1936 (el total de `InventarioItem`, ya que `Proyecto_Torre` está poblado al 100% y cada inmueble solo puede tener un frente) — los huérfanos (`neg-*`) nunca cuentan aquí porque no tienen `Proyecto_Torre`.

- [ ] **Step 6: Actualizar el handler `GET /api/negocios` en `negocios.js`**

En `zoho-payment-tracker/backend/src/routes/negocios.js`, reemplaza el bloque completo del handler `router.get('/', async (req, res) => { ... });`:

```js
// GET /api/negocios?search=&estado=&etapa=&frente=&saldoPendiente=&page=&limit=
router.get('/', async (req, res) => {
  try {
    const { search, estado, etapa, frente, saldoPendiente, page = '1', limit = '50' } = req.query;
    const pageNum = Math.max(1, parseInt(page));
    const limitNum = Math.min(9999, Math.max(1, parseInt(limit)));
    const noFilters = !search && !estado && !etapa && !frente;

    const [{ data, total, etapasDisponibles, frentesDisponibles }, estadosRaw] = await Promise.all([
      listarNegociosInventario({ search, estado, etapa, frente, saldoPendiente, page: pageNum, limit: limitNum }),
      noFilters
        ? prisma.negocio.findMany({
            select: { estado: true },
            where: { estado: { not: null } },
            distinct: ['estado'],
            orderBy: { estado: 'asc' },
          })
        : Promise.resolve(null),
    ]);

    res.json({
      data,
      pagination: {
        total,
        page: pageNum,
        limit: limitNum,
        totalPages: Math.ceil(total / limitNum),
      },
      ...(estadosRaw ? { estados: estadosRaw.map((e) => e.estado).filter(Boolean) } : {}),
      ...(noFilters ? { etapas: etapasDisponibles, frentes: frentesDisponibles } : {}),
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});
```

- [ ] **Step 7: Verificar con el servidor corriendo**

```bash
cd zoho-payment-tracker/backend && npm run dev
```

En otra terminal (autenticando primero — ver Global Constraints del plan de "todos los inmuebles en Negocios" sobre `APP_PASSWORD`):

```bash
COOKIE_JAR=$(mktemp)
PASS=$(node -e "require('dotenv').config({path:'zoho-payment-tracker/backend/.env'});process.stdout.write(process.env.APP_PASSWORD||'')")
curl -s -c "$COOKIE_JAR" -X POST http://localhost:3001/api/auth/login -H 'Content-Type: application/json' -d "{\"password\":\"$PASS\"}" > /dev/null

curl -s -b "$COOKIE_JAR" "http://localhost:3001/api/negocios?limit=1" | node -e "const d=JSON.parse(require('fs').readFileSync(0));console.log(d.frentes)"
curl -s -b "$COOKIE_JAR" "http://localhost:3001/api/negocios?frente=Prive&limit=200" | node -e "const d=JSON.parse(require('fs').readFileSync(0));console.log(d.pagination.total, d.data.every(x=>x.proyectoTorre?.startsWith('Prive')))"
```

Expected: `d.frentes` trae los 7 nombres; el filtro `frente=Prive` trae solo filas de Prive.

- [ ] **Step 8: Commit**

```bash
git add zoho-payment-tracker/backend/src/services/inventarioNegocioService.js zoho-payment-tracker/backend/src/routes/negocios.js
git commit -m "feat: filtro de Frente en GET /api/negocios"
```

---

## Task 2: Frontend — selector de Frente en `Negocios.jsx`

**Files:**
- Modify: `zoho-payment-tracker/frontend/src/pages/Negocios.jsx`

**Interfaces:**
- Consumes: `res.frentes` (nuevo campo de la respuesta de `GET /api/negocios`, Task 1) y el parámetro `frente` de `getNegocios(...)` (ya soportado por `api.js` sin cambios, porque `getNegocios` pasa `params` tal cual a Axios).

- [ ] **Step 1: Importar el ícono `MapPin`**

Cambia la línea del import de íconos (línea 2):

```js
import { Search, X, ChevronDown, ChevronRight, User, Building2, Layers, BarChart3, History, RefreshCw, Download, CircleDot, Wallet, ClipboardList, Scale } from 'lucide-react';
```

por:

```js
import { Search, X, ChevronDown, ChevronRight, User, Building2, Layers, BarChart3, History, RefreshCw, Download, CircleDot, Wallet, ClipboardList, Scale, MapPin } from 'lucide-react';
```

- [ ] **Step 2: Agregar estado `frenteFilter` y `frentes`**

En `Negocios()`, junto a los estados existentes:

```js
  const [estados, setEstados] = useState([]);
  const [etapas, setEtapas] = useState([]);
```

agrega justo debajo:

```js
  const [frentes, setFrentes] = useState([]);
```

Y junto a:

```js
  const [estadoFilter, setEstadoFilter] = useState('');
  const [etapaFilter, setEtapaFilter] = useState('');
```

agrega:

```js
  const [frenteFilter, setFrenteFilter] = useState('');
```

- [ ] **Step 3: Incluir `frenteFilter` en `filtersRef`, `fetchList` y `handleExport`**

Cambia:

```js
  filtersRef.current = { debouncedSearch, estadoFilter, etapaFilter, saldoPendiente };
```

por:

```js
  filtersRef.current = { debouncedSearch, estadoFilter, etapaFilter, frenteFilter, saldoPendiente };
```

Cambia `fetchList`:

```js
  const fetchList = useCallback((p = 1) => {
    const { debouncedSearch: s, estadoFilter: e, etapaFilter: et, saldoPendiente: sp } = filtersRef.current;
    setLoading(true);
    getNegocios({ search: s || undefined, estado: e || undefined, etapa: et || undefined, saldoPendiente: sp || undefined, page: p, limit: 50 })
      .then((res) => {
        setNegocios(res.data);
        setPagination(res.pagination);
        if (res.estados) setEstados(res.estados);
        if (res.etapas) setEtapas(res.etapas);
        setPage(p);
      })
      .catch(console.error)
      .finally(() => setLoading(false));
  }, []);
```

por:

```js
  const fetchList = useCallback((p = 1) => {
    const { debouncedSearch: s, estadoFilter: e, etapaFilter: et, frenteFilter: fr, saldoPendiente: sp } = filtersRef.current;
    setLoading(true);
    getNegocios({ search: s || undefined, estado: e || undefined, etapa: et || undefined, frente: fr || undefined, saldoPendiente: sp || undefined, page: p, limit: 50 })
      .then((res) => {
        setNegocios(res.data);
        setPagination(res.pagination);
        if (res.estados) setEstados(res.estados);
        if (res.etapas) setEtapas(res.etapas);
        if (res.frentes) setFrentes(res.frentes);
        setPage(p);
      })
      .catch(console.error)
      .finally(() => setLoading(false));
  }, []);
```

Cambia el `useEffect` que dispara `fetchList`:

```js
  useEffect(() => { fetchList(1); }, [debouncedSearch, estadoFilter, etapaFilter, saldoPendiente, fetchList]);
```

por:

```js
  useEffect(() => { fetchList(1); }, [debouncedSearch, estadoFilter, etapaFilter, frenteFilter, saldoPendiente, fetchList]);
```

Cambia `handleExport`:

```js
  const handleExport = useCallback(async (fmt) => {
    const { debouncedSearch: s, estadoFilter: e, etapaFilter: et, saldoPendiente: sp } = filtersRef.current;
    setExporting(true);
    try {
      const res = await getNegocios({ search: s || undefined, estado: e || undefined, etapa: et || undefined, saldoPendiente: sp || undefined, page: 1, limit: 9999 });
```

por:

```js
  const handleExport = useCallback(async (fmt) => {
    const { debouncedSearch: s, estadoFilter: e, etapaFilter: et, frenteFilter: fr, saldoPendiente: sp } = filtersRef.current;
    setExporting(true);
    try {
      const res = await getNegocios({ search: s || undefined, estado: e || undefined, etapa: et || undefined, frente: fr || undefined, saldoPendiente: sp || undefined, page: 1, limit: 9999 });
```

- [ ] **Step 4: Incluir `frenteFilter` en `clearFilters` y `hasFilters`**

Cambia:

```js
  const clearFilters = () => { setSearch(''); setEstadoFilter(''); setEtapaFilter(''); setSaldoPendiente(false); };
  const hasFilters = search || estadoFilter || etapaFilter || saldoPendiente;
```

por:

```js
  const clearFilters = () => { setSearch(''); setEstadoFilter(''); setEtapaFilter(''); setFrenteFilter(''); setSaldoPendiente(false); };
  const hasFilters = search || estadoFilter || etapaFilter || frenteFilter || saldoPendiente;
```

- [ ] **Step 5: Agregar el `<select>` de Frente en el JSX, junto al de Etapa**

Ubica el bloque del filtro de Etapa:

```jsx
            {/* Etapa filter */}
            {etapas.length > 0 && (
              <div className="field">
                <label className="field-label">
                  <Layers size={13} className="text-[#7c3aed]" />
                  Etapa
                  <HelpTip text="Filtra por la etapa del inmueble asociado al negocio. Los proyectos sin etapa numerada y los negocios sin inmueble asociado se agrupan en Etapa 0." />
                </label>
                <select
                  value={etapaFilter}
                  onChange={(e) => setEtapaFilter(e.target.value)}
                  className="input text-[14px] h-8 py-0 pr-2 leading-none"
                >
                  <option value="">Todas las etapas</option>
                  {etapas.map((et) => (
                    <option key={et} value={et}>Etapa {et}</option>
                  ))}
                </select>
              </div>
            )}
```

Agrega justo después (antes del comentario `{/* Con abonos toggle */}`):

```jsx
            {/* Frente filter */}
            {frentes.length > 0 && (
              <div className="field">
                <label className="field-label">
                  <MapPin size={13} className="text-[#7c3aed]" />
                  Frente
                  <HelpTip text="Filtra por el proyecto/desarrollo del inmueble asociado al negocio. Los negocios sin inmueble asociado no aparecen al filtrar por un Frente específico." />
                </label>
                <select
                  value={frenteFilter}
                  onChange={(e) => setFrenteFilter(e.target.value)}
                  className="input text-[14px] h-8 py-0 pr-2 leading-none"
                >
                  <option value="">Todos los frentes</option>
                  {frentes.map((fr) => (
                    <option key={fr} value={fr}>{fr}</option>
                  ))}
                </select>
              </div>
            )}
```

- [ ] **Step 6: Verificar en el navegador**

```bash
cd zoho-payment-tracker/backend && npm run dev
```
(en otra terminal)
```bash
cd zoho-payment-tracker/frontend && npm run dev
```

Abrir el módulo Negocios. Verificar:
- Aparece el filtro "Frente" junto al de "Etapa", con las 7 opciones (Isla Laguna, Kabo, Kala, Kaliza, Prive, The Plaza, Vela Village) en orden alfabético.
- Elegir "Kabo" filtra la lista a solo inmuebles de Kabo (Kabo Torre 1-4).
- Combinar "Kabo" + Etapa 2 filtra a solo Kabo Torre 3 y Torre 4.
- "Limpiar filtros" también limpia el Frente seleccionado.
- Exportar a Excel/CSV/PDF con un Frente filtrado exporta solo esas filas (usa `handleExport`, que ya lee `frenteFilter`).

- [ ] **Step 7: Commit**

```bash
git add zoho-payment-tracker/frontend/src/pages/Negocios.jsx
git commit -m "feat: selector de Frente en el modulo de Negocios"
```
