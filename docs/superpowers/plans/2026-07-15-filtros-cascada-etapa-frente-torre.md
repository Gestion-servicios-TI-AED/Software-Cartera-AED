# Filtros en cascada Etapa → Frente → Torre — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** El filtro de Frente en el módulo de Negocios se acota según la Etapa elegida, y se agrega un tercer filtro de Torre (ej. "Torre 1", "Torre 2") que solo aparece cuando hay un Frente elegido, con las torres de ese frente.

**Architecture:** La relación Etapa↔Frente↔Torre es estática (viene de `ETAPA_POR_TORRE` + los valores reales de `Proyecto_Torre`), así que se calcula una sola vez en el backend (junto con `etapasDisponibles`/`frentesDisponibles`, que ya existen) y se manda al frontend como dos mapas (`frentesPorEtapa`, `torresPorFrente`). El frontend usa esos mapas para acotar las opciones de cada `<select>` en el cliente, sin llamadas adicionales al backend por cada cambio de filtro. De paso, se consolidan `valoresProyectoTorrePorEtapa()` y `valoresProyectoTorrePorFrente()` (que hoy repiten la misma consulta) en una sola función de una pasada, ya señalado como mejora pendiente en la revisión final del filtro de Frente.

**Tech Stack:** Node.js + Express + Prisma 5 (PostgreSQL) en el backend; React + Vite en el frontend. Sin suite de tests configurada — cada tarea se verifica con un script Node ad-hoc contra la BD real y/o `curl` contra el servidor de desarrollo.

## Global Constraints

- Sin migraciones de schema — el cambio es de consulta/presentación.
- El filtro de Torre solo tiene efecto si viene junto con `frente`; si `torre` llega sin `frente`, se ignora silenciosamente (no hay error, no rompe el request).
- Cascada de limpieza (confirmada con el usuario): cambiar Etapa limpia el Frente solo si el frente actual ya no pertenece a la nueva etapa (y Torre se limpia con él, porque dependía del frente borrado). Cambiar Frente (acción directa del usuario) siempre limpia Torre, sin excepción.
- Sin bucket "sin torre" para huérfanos — un negocio huérfano no tiene Frente, así que tampoco puede tener Torre (mismo criterio que Frente).
- Sin cascada inversa — elegir Frente o Torre no acota las opciones de Etapa.
- Tabla de referencia validada contra la BD real (spec, sección "Datos de referencia"): Kabo (torres 1-4, etapas 1-2), Prive (torres 1-4, etapas 1-2), Kala (torres 1-4, etapas 3-4), Kaliza (torres 1-3, etapas 3-4), Isla Laguna (torre 1, etapa 0), Vela Village (torres 1-2, etapa 0), The Plaza (torre 1, etapa 0).
- Spec de referencia: `docs/superpowers/specs/2026-07-15-filtros-cascada-etapa-frente-torre-design.md`.

---

## Task 1: Backend — consolidar `valoresProyectoTorre*` y agregar filtro de Torre

**Files:**
- Modify: `zoho-payment-tracker/backend/src/services/inventarioNegocioService.js`
- Modify: `zoho-payment-tracker/backend/src/routes/negocios.js` (handler `router.get('/', ...)`)

**Interfaces:**
- Produces:
  - `valoresProyectoTorre(): Promise<{ porEtapa: Map<string,string[]>, porFrente: Map<string,string[]>, porFrenteTorre: Map<string,string[]>, frentesPorEtapa: Record<string,string[]>, torresPorFrente: Record<string,string[]> }>` — reemplaza a `valoresProyectoTorrePorEtapa()` y `valoresProyectoTorrePorFrente()` (ninguna de las dos estaba exportada; se eliminan del archivo, no hace falta tocar `module.exports`).
  - `listarNegociosInventario({ ..., torre })` — nuevo parámetro opcional `torre: string`. El resultado agrega `frentesPorEtapa` y `torresPorFrente` (mismas claves que arriba).

- [ ] **Step 1: Reemplazar las dos funciones de agrupación por una sola, de una pasada**

En `zoho-payment-tracker/backend/src/services/inventarioNegocioService.js`, reemplaza el bloque completo (ambas funciones, desde el comentario de `valoresProyectoTorrePorEtapa` hasta el cierre de `valoresProyectoTorrePorFrente`):

```js
// Valores crudos de Proyecto_Torre en BD, agrupados por la etapa que les
// corresponde según ETAPA_POR_TORRE. Se usa para resolver el filtro de
// Etapa en SQL (`= ANY(...)`) sin duplicar la regla ahí.
async function valoresProyectoTorrePorEtapa() {
  const rows = await prisma.$queryRaw`
    SELECT DISTINCT datos->>'Proyecto_Torre' AS v
    FROM "InventarioItem"
    WHERE datos->>'Proyecto_Torre' IS NOT NULL`;
  const porEtapa = new Map();
  for (const { v } of rows) {
    const et = obtenerEtapaTorre(v);
    if (!porEtapa.has(et)) porEtapa.set(et, []);
    porEtapa.get(et).push(v);
  }
  return porEtapa;
}

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

por:

```js
// Valores crudos de Proyecto_Torre en BD, agrupados de tres formas a partir
// de una sola consulta (reemplaza a valoresProyectoTorrePorEtapa() y
// valoresProyectoTorrePorFrente(), que hacían la misma consulta por
// separado):
//  - porEtapa / porFrente: listas de valores crudos para los filtros de
//    Etapa y Frente en SQL (`= ANY(...)`), igual que antes.
//  - porFrenteTorre: listas de valores crudos por par Frente+Torre, para
//    el filtro de Torre (clave "Frente||Torre", ej. "Kabo||3").
//  - frentesPorEtapa / torresPorFrente: mapas estáticos que el frontend usa
//    para acotar las opciones de los selects en cascada, sin llamadas
//    adicionales al backend.
async function valoresProyectoTorre() {
  const rows = await prisma.$queryRaw`
    SELECT DISTINCT datos->>'Proyecto_Torre' AS v
    FROM "InventarioItem"
    WHERE datos->>'Proyecto_Torre' IS NOT NULL`;

  const porEtapa = new Map();
  const porFrente = new Map();
  const porFrenteTorre = new Map();
  const frentesPorEtapaSet = new Map();
  const torresPorFrenteSet = new Map();

  for (const { v } of rows) {
    const et = obtenerEtapaTorre(v);
    if (!porEtapa.has(et)) porEtapa.set(et, []);
    porEtapa.get(et).push(v);

    const info = parseProyectoTorre(v);
    if (!info) continue;

    if (!porFrente.has(info.proyecto)) porFrente.set(info.proyecto, []);
    porFrente.get(info.proyecto).push(v);

    const claveFrenteTorre = `${info.proyecto}||${info.torre}`;
    if (!porFrenteTorre.has(claveFrenteTorre)) porFrenteTorre.set(claveFrenteTorre, []);
    porFrenteTorre.get(claveFrenteTorre).push(v);

    if (!frentesPorEtapaSet.has(et)) frentesPorEtapaSet.set(et, new Set());
    frentesPorEtapaSet.get(et).add(info.proyecto);

    if (!torresPorFrenteSet.has(info.proyecto)) torresPorFrenteSet.set(info.proyecto, new Set());
    torresPorFrenteSet.get(info.proyecto).add(info.torre);
  }

  const frentesPorEtapa = {};
  for (const [et, set] of frentesPorEtapaSet) frentesPorEtapa[et] = [...set].sort();

  const torresPorFrente = {};
  for (const [fr, set] of torresPorFrenteSet) torresPorFrente[fr] = [...set].sort((a, b) => Number(a) - Number(b));

  return { porEtapa, porFrente, porFrenteTorre, frentesPorEtapa, torresPorFrente };
}
```

- [ ] **Step 2: Extender `construirFiltroCombinado()` para aceptar `torre`**

Reemplaza la firma y el cuerpo completo de `construirFiltroCombinado`:

```js
// Arma el WHERE del conjunto unificado. `valoresEtapa` es el Map que
// devuelve valoresProyectoTorrePorEtapa().
function construirFiltroCombinado({ search, estado, etapa, frente, saldoPendiente, valoresEtapa, valoresFrente }) {
  const condiciones = [];
  if (estado) {
    condiciones.push(Prisma.sql`c.estado ILIKE ${'%' + estado + '%'}`);
  }
  if (saldoPendiente === 'true') {
    condiciones.push(Prisma.sql`c."saldoActual" > 0`);
  }
  if (search) {
    const like = `%${search}%`;
    condiciones.push(Prisma.sql`(
      c.referencia ILIKE ${like}
      OR c.negocio_datos->>'Nomenclatura' ILIKE ${like}
      OR c.inventario_datos->>'Project_Code' ILIKE ${like}
      OR c.inventario_datos->>'Proyecto_Torre' ILIKE ${like}
      OR EXISTS (
        SELECT 1 FROM "NegocioComprador" comp
        WHERE comp."negocioId" = c.negocio_id
          AND (comp.nombre ILIKE ${like} OR comp."nroId" ILIKE ${like})
      )
    )`);
  }
  if (etapa) {
    const lista = valoresEtapa.get(etapa) || [];
    if (etapa === '0') {
      condiciones.push(Prisma.sql`(c.inventario_datos->>'Proyecto_Torre' = ANY(${lista}::text[]) OR c.inventario_datos IS NULL)`);
    } else {
      condiciones.push(Prisma.sql`c.inventario_datos->>'Proyecto_Torre' = ANY(${lista}::text[])`);
    }
  }
  if (frente) {
    const lista = valoresFrente.get(frente) || [];
    condiciones.push(Prisma.sql`c.inventario_datos->>'Proyecto_Torre' = ANY(${lista}::text[])`);
  }
  return condiciones.length ? Prisma.sql`WHERE ${Prisma.join(condiciones, ' AND ')}` : Prisma.empty;
}
```

por:

```js
// Arma el WHERE del conjunto unificado. `valores` es el objeto que
// devuelve valoresProyectoTorre(). Torre solo tiene efecto si viene junto
// con Frente (Torre sin Frente no identifica nada — Torre 1 existe en
// varios frentes); si `torre` llega sin `frente`, se ignora.
function construirFiltroCombinado({ search, estado, etapa, frente, torre, saldoPendiente, valores }) {
  const condiciones = [];
  if (estado) {
    condiciones.push(Prisma.sql`c.estado ILIKE ${'%' + estado + '%'}`);
  }
  if (saldoPendiente === 'true') {
    condiciones.push(Prisma.sql`c."saldoActual" > 0`);
  }
  if (search) {
    const like = `%${search}%`;
    condiciones.push(Prisma.sql`(
      c.referencia ILIKE ${like}
      OR c.negocio_datos->>'Nomenclatura' ILIKE ${like}
      OR c.inventario_datos->>'Project_Code' ILIKE ${like}
      OR c.inventario_datos->>'Proyecto_Torre' ILIKE ${like}
      OR EXISTS (
        SELECT 1 FROM "NegocioComprador" comp
        WHERE comp."negocioId" = c.negocio_id
          AND (comp.nombre ILIKE ${like} OR comp."nroId" ILIKE ${like})
      )
    )`);
  }
  if (etapa) {
    const lista = valores.porEtapa.get(etapa) || [];
    if (etapa === '0') {
      condiciones.push(Prisma.sql`(c.inventario_datos->>'Proyecto_Torre' = ANY(${lista}::text[]) OR c.inventario_datos IS NULL)`);
    } else {
      condiciones.push(Prisma.sql`c.inventario_datos->>'Proyecto_Torre' = ANY(${lista}::text[])`);
    }
  }
  if (frente && torre) {
    const lista = valores.porFrenteTorre.get(`${frente}||${torre}`) || [];
    condiciones.push(Prisma.sql`c.inventario_datos->>'Proyecto_Torre' = ANY(${lista}::text[])`);
  } else if (frente) {
    const lista = valores.porFrente.get(frente) || [];
    condiciones.push(Prisma.sql`c.inventario_datos->>'Proyecto_Torre' = ANY(${lista}::text[])`);
  }
  return condiciones.length ? Prisma.sql`WHERE ${Prisma.join(condiciones, ' AND ')}` : Prisma.empty;
}
```

- [ ] **Step 3: Actualizar `listarNegociosInventario()`**

Reemplaza la firma y el cuerpo (desde la declaración de la función hasta el `return` final):

```js
async function listarNegociosInventario({ search, estado, etapa, frente, saldoPendiente, page, limit }) {
  const [valoresEtapa, valoresFrente] = await Promise.all([
    valoresProyectoTorrePorEtapa(),
    valoresProyectoTorrePorFrente(),
  ]);
  const filtro = construirFiltroCombinado({ search, estado, etapa, frente, saldoPendiente, valoresEtapa, valoresFrente });
```

por:

```js
async function listarNegociosInventario({ search, estado, etapa, frente, torre, saldoPendiente, page, limit }) {
  const valores = await valoresProyectoTorre();
  const filtro = construirFiltroCombinado({ search, estado, etapa, frente, torre, saldoPendiente, valores });
```

(El resto del cuerpo de la función — las dos consultas `$queryRaw` en `Promise.all` y el `.map` que arma `data` — no cambia.)

Y el `return` final de la función:

```js
  return {
    data,
    total,
    etapasDisponibles: [...valoresEtapa.keys()].sort((a, b) => Number(a) - Number(b)),
    frentesDisponibles: [...valoresFrente.keys()].sort(),
  };
}
```

por:

```js
  return {
    data,
    total,
    etapasDisponibles: [...valores.porEtapa.keys()].sort((a, b) => Number(a) - Number(b)),
    frentesDisponibles: [...valores.porFrente.keys()].sort(),
    frentesPorEtapa: valores.frentesPorEtapa,
    torresPorFrente: valores.torresPorFrente,
  };
}
```

- [ ] **Step 4: Verificar con un script contra la BD real**

```bash
cd zoho-payment-tracker/backend && node -e "
const { listarNegociosInventario } = require('./src/services/inventarioNegocioService');
(async () => {
  const r = await listarNegociosInventario({ page: 1, limit: 1 });
  console.log('frentesPorEtapa:', r.frentesPorEtapa);
  console.log('torresPorFrente.Kabo:', r.torresPorFrente['Kabo']);
  console.log('torresPorFrente.Kaliza:', r.torresPorFrente['Kaliza']);

  const kaboTorre3 = await listarNegociosInventario({ frente: 'Kabo', torre: '3', page: 1, limit: 9999 });
  console.log('Kabo Torre 3 -> total:', kaboTorre3.total, 'todas correctas:', kaboTorre3.data.every(d => d.proyectoTorre === 'Kabo Torre 3'));

  // torre sin frente se ignora (mismo total que sin filtros)
  const soloTorre = await listarNegociosInventario({ torre: '3', page: 1, limit: 1 });
  const sinFiltro = await listarNegociosInventario({ page: 1, limit: 1 });
  console.log('torre sin frente ignorado:', soloTorre.total === sinFiltro.total, '(', soloTorre.total, 'vs', sinFiltro.total, ')');

  process.exit(0);
})();
"
```

Expected:
- `frentesPorEtapa` coincide con la tabla del spec: `{ '0': ['Isla Laguna','The Plaza','Vela Village'], '1': ['Kabo','Prive'], '2': ['Kabo','Prive'], '3': ['Kala','Kaliza'], '4': ['Kala','Kaliza'] }` (orden alfabético dentro de cada etapa).
- `torresPorFrente.Kabo` es `['1','2','3','4']`; `torresPorFrente.Kaliza` es `['1','2','3']`.
- `Kabo Torre 3` trae solo filas con `proyectoTorre === 'Kabo Torre 3'`, total > 0.
- El filtro `torre=3` sin `frente` da el mismo total que la consulta sin filtros (confirmando que se ignoró).

- [ ] **Step 5: Actualizar el handler `GET /api/negocios` en `negocios.js`**

Reemplaza el bloque completo del handler `router.get('/', async (req, res) => { ... });`:

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

por:

```js
// GET /api/negocios?search=&estado=&etapa=&frente=&torre=&saldoPendiente=&page=&limit=
router.get('/', async (req, res) => {
  try {
    const { search, estado, etapa, frente, torre, saldoPendiente, page = '1', limit = '50' } = req.query;
    const pageNum = Math.max(1, parseInt(page));
    const limitNum = Math.min(9999, Math.max(1, parseInt(limit)));
    const noFilters = !search && !estado && !etapa && !frente && !torre;

    const [{ data, total, etapasDisponibles, frentesDisponibles, frentesPorEtapa, torresPorFrente }, estadosRaw] = await Promise.all([
      listarNegociosInventario({ search, estado, etapa, frente, torre, saldoPendiente, page: pageNum, limit: limitNum }),
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
      ...(noFilters ? { etapas: etapasDisponibles, frentes: frentesDisponibles, frentesPorEtapa, torresPorFrente } : {}),
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});
```

- [ ] **Step 6: Verificar con el servidor corriendo**

```bash
cd zoho-payment-tracker/backend && npm run dev
```

En otra terminal:

```bash
COOKIE_JAR=$(mktemp)
PASS=$(node -e "require('dotenv').config({path:'zoho-payment-tracker/backend/.env'});process.stdout.write(process.env.APP_PASSWORD||'')")
curl -s -c "$COOKIE_JAR" -X POST http://localhost:3001/api/auth/login -H 'Content-Type: application/json' -d "{\"password\":\"$PASS\"}" > /dev/null

curl -s -b "$COOKIE_JAR" "http://localhost:3001/api/negocios?limit=1" | node -e "const d=JSON.parse(require('fs').readFileSync(0));console.log(d.frentesPorEtapa); console.log(d.torresPorFrente.Kabo)"
curl -s -b "$COOKIE_JAR" "http://localhost:3001/api/negocios?frente=Kaliza&torre=2&limit=200" | node -e "const d=JSON.parse(require('fs').readFileSync(0));console.log(d.pagination.total, d.data.every(x=>x.proyectoTorre==='Kaliza Torre 2'))"
```

Expected: `frentesPorEtapa`/`torresPorFrente.Kabo` iguales a los del Step 4; el filtro combinado `frente=Kaliza&torre=2` trae solo filas de "Kaliza Torre 2".

- [ ] **Step 7: Commit**

```bash
git add zoho-payment-tracker/backend/src/services/inventarioNegocioService.js zoho-payment-tracker/backend/src/routes/negocios.js
git commit -m "feat: filtro de Torre + mapas de cascada Etapa->Frente->Torre en GET /api/negocios"
```

---

## Task 2: Frontend — cascada de selects en `Negocios.jsx`

**Files:**
- Modify: `zoho-payment-tracker/frontend/src/pages/Negocios.jsx`

**Interfaces:**
- Consumes: `res.frentesPorEtapa` y `res.torresPorFrente` (nuevos campos de la respuesta de `GET /api/negocios`, Task 1) y el parámetro `torre` de `getNegocios(...)` (ya soportado por `api.js` sin cambios).

- [ ] **Step 1: Importar el ícono `Building`**

Cambia la línea del import de íconos:

```js
import { Search, X, ChevronDown, ChevronRight, User, Building2, Layers, BarChart3, History, RefreshCw, Download, CircleDot, Wallet, ClipboardList, Scale, MapPin } from 'lucide-react';
```

por:

```js
import { Search, X, ChevronDown, ChevronRight, User, Building2, Layers, BarChart3, History, RefreshCw, Download, CircleDot, Wallet, ClipboardList, Scale, MapPin, Building } from 'lucide-react';
```

- [ ] **Step 2: Agregar estado para Torre y los mapas de cascada**

En `Negocios()`, junto a los estados existentes:

```js
  const [frentes, setFrentes] = useState([]);
```

agrega justo debajo:

```js
  const [frentesPorEtapa, setFrentesPorEtapa] = useState({});
  const [torresPorFrente, setTorresPorFrente] = useState({});
```

Y junto a:

```js
  const [frenteFilter, setFrenteFilter] = useState('');
```

agrega:

```js
  const [torreFilter, setTorreFilter] = useState('');
```

- [ ] **Step 3: Incluir `torreFilter` en `filtersRef`, `fetchList` y `handleExport`**

Cambia:

```js
  filtersRef.current = { debouncedSearch, estadoFilter, etapaFilter, frenteFilter, saldoPendiente };
```

por:

```js
  filtersRef.current = { debouncedSearch, estadoFilter, etapaFilter, frenteFilter, torreFilter, saldoPendiente };
```

Cambia `fetchList`:

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

por:

```js
  const fetchList = useCallback((p = 1) => {
    const { debouncedSearch: s, estadoFilter: e, etapaFilter: et, frenteFilter: fr, torreFilter: tr, saldoPendiente: sp } = filtersRef.current;
    setLoading(true);
    getNegocios({ search: s || undefined, estado: e || undefined, etapa: et || undefined, frente: fr || undefined, torre: tr || undefined, saldoPendiente: sp || undefined, page: p, limit: 50 })
      .then((res) => {
        setNegocios(res.data);
        setPagination(res.pagination);
        if (res.estados) setEstados(res.estados);
        if (res.etapas) setEtapas(res.etapas);
        if (res.frentes) setFrentes(res.frentes);
        if (res.frentesPorEtapa) setFrentesPorEtapa(res.frentesPorEtapa);
        if (res.torresPorFrente) setTorresPorFrente(res.torresPorFrente);
        setPage(p);
      })
      .catch(console.error)
      .finally(() => setLoading(false));
  }, []);
```

Cambia el `useEffect` que dispara `fetchList`:

```js
  useEffect(() => { fetchList(1); }, [debouncedSearch, estadoFilter, etapaFilter, frenteFilter, saldoPendiente, fetchList]);
```

por:

```js
  useEffect(() => { fetchList(1); }, [debouncedSearch, estadoFilter, etapaFilter, frenteFilter, torreFilter, saldoPendiente, fetchList]);
```

Cambia `handleExport`:

```js
  const handleExport = useCallback(async (fmt) => {
    const { debouncedSearch: s, estadoFilter: e, etapaFilter: et, frenteFilter: fr, saldoPendiente: sp } = filtersRef.current;
    setExporting(true);
    try {
      const res = await getNegocios({ search: s || undefined, estado: e || undefined, etapa: et || undefined, frente: fr || undefined, saldoPendiente: sp || undefined, page: 1, limit: 9999 });
```

por:

```js
  const handleExport = useCallback(async (fmt) => {
    const { debouncedSearch: s, estadoFilter: e, etapaFilter: et, frenteFilter: fr, torreFilter: tr, saldoPendiente: sp } = filtersRef.current;
    setExporting(true);
    try {
      const res = await getNegocios({ search: s || undefined, estado: e || undefined, etapa: et || undefined, frente: fr || undefined, torre: tr || undefined, saldoPendiente: sp || undefined, page: 1, limit: 9999 });
```

- [ ] **Step 4: Incluir `torreFilter` en `clearFilters` y `hasFilters`, y agregar los handlers de cascada**

Cambia:

```js
  const clearFilters = () => { setSearch(''); setEstadoFilter(''); setEtapaFilter(''); setFrenteFilter(''); setSaldoPendiente(false); };
  const hasFilters = search || estadoFilter || etapaFilter || frenteFilter || saldoPendiente;
```

por:

```js
  const clearFilters = () => { setSearch(''); setEstadoFilter(''); setEtapaFilter(''); setFrenteFilter(''); setTorreFilter(''); setSaldoPendiente(false); };
  const hasFilters = search || estadoFilter || etapaFilter || frenteFilter || torreFilter || saldoPendiente;

  // Cambiar Etapa limpia el Frente elegido solo si ya no pertenece a la
  // nueva etapa (y Torre se limpia con él, porque dependía de ese frente).
  const handleEtapaChange = (value) => {
    setEtapaFilter(value);
    if (value && frenteFilter && !(frentesPorEtapa[value] || []).includes(frenteFilter)) {
      setFrenteFilter('');
      setTorreFilter('');
    }
  };

  // Cambiar Frente siempre limpia Torre: la Torre 1 de un frente nuevo es
  // un edificio distinto al anterior, nunca la misma selección "por
  // coincidencia".
  const handleFrenteChange = (value) => {
    setFrenteFilter(value);
    setTorreFilter('');
  };

  const frenteOptions = etapaFilter ? (frentesPorEtapa[etapaFilter] || []) : frentes;
  const torreOptions = frenteFilter ? (torresPorFrente[frenteFilter] || []) : [];
```

- [ ] **Step 5: Usar los nuevos handlers en los selects de Etapa y Frente, y agregar el select de Torre**

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

Reemplázalo por:

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
                  onChange={(e) => handleEtapaChange(e.target.value)}
                  className="input text-[14px] h-8 py-0 pr-2 leading-none"
                >
                  <option value="">Todas las etapas</option>
                  {etapas.map((et) => (
                    <option key={et} value={et}>Etapa {et}</option>
                  ))}
                </select>
              </div>
            )}

            {/* Frente filter */}
            {frentes.length > 0 && (
              <div className="field">
                <label className="field-label">
                  <MapPin size={13} className="text-[#7c3aed]" />
                  Frente
                  <HelpTip text="Filtra por el proyecto/desarrollo del inmueble asociado al negocio. Si hay una Etapa elegida, solo se muestran los frentes de esa etapa. Los negocios sin inmueble asociado no aparecen al filtrar por un Frente específico." />
                </label>
                <select
                  value={frenteFilter}
                  onChange={(e) => handleFrenteChange(e.target.value)}
                  className="input text-[14px] h-8 py-0 pr-2 leading-none"
                >
                  <option value="">Todos los frentes</option>
                  {frenteOptions.map((fr) => (
                    <option key={fr} value={fr}>{fr}</option>
                  ))}
                </select>
              </div>
            )}

            {/* Torre filter */}
            {frenteFilter && torreOptions.length > 0 && (
              <div className="field">
                <label className="field-label">
                  <Building size={13} className="text-[#7c3aed]" />
                  Torre
                  <HelpTip text="Filtra por la torre del Frente seleccionado." />
                </label>
                <select
                  value={torreFilter}
                  onChange={(e) => setTorreFilter(e.target.value)}
                  className="input text-[14px] h-8 py-0 pr-2 leading-none"
                >
                  <option value="">Todas las torres</option>
                  {torreOptions.map((tr) => (
                    <option key={tr} value={tr}>Torre {tr}</option>
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
- Elegir Etapa "1": el select de Frente solo ofrece Kabo y Prive (no Kala/Kaliza/Isla Laguna/...).
- Con Etapa "1" y Frente "Kabo" elegidos, cambiar Etapa a "3": Frente se limpia a "Todos los frentes" (Kabo no pertenece a Etapa 3), y el select de Torre desaparece.
- Elegir Frente "Kaliza" (sin Etapa): aparece el select de Torre con Torre 1, Torre 2, Torre 3 (no Torre 4 — Kaliza no tiene).
- Con Frente "Kaliza" y Torre "2" elegidos, cambiar Frente a "Kabo": Torre se limpia a "Todas las torres" y las opciones pasan a ser Torre 1-4 de Kabo.
- "Limpiar filtros" también limpia Frente y Torre.
- Exportar a Excel/CSV/PDF con Frente+Torre filtrados exporta solo esas filas.

- [ ] **Step 7: Commit**

```bash
git add zoho-payment-tracker/frontend/src/pages/Negocios.jsx
git commit -m "feat: cascada de filtros Etapa -> Frente -> Torre en el modulo de Negocios"
```
