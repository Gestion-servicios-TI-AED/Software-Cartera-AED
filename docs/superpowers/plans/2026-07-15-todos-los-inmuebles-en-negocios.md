# Todos los inmuebles en el módulo de Negocios — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** El módulo de Negocios (`zoho-payment-tracker`) pasa a mostrar los ~1936 inmuebles de Zoho (`InventarioItem`) además de los 979 `Negocio` existentes, cruzados entre sí, sin perder los ~40 negocios que no calzan con ningún inmueble.

**Architecture:** Nuevo servicio `backend/src/services/inventarioNegocioService.js` concentra la resolución Inmueble↔Negocio. La lista (`GET /api/negocios`) pasa a una consulta SQL cruda (`InventarioItem` LEFT JOIN LATERAL `Negocio`, UNION ALL con los `Negocio` huérfanos). Detalle y movimientos siguen con Prisma ORM normal, ahora partiendo de un id prefijado (`inv-`/`neg-`) que identifica la fila sin ambigüedad. Frontend (`Negocios.jsx`) cambia su llave de selección de `referencia` a `id` y agrega un badge "Sin negocio" + una sección "Info del apartamento" que también lee datos del inventario.

**Tech Stack:** Node.js + Express + Prisma 5 (PostgreSQL) en el backend; React + Vite en el frontend. Sin suite de tests configurada — cada tarea se verifica con un script Node ad-hoc contra la BD real (mismo patrón ya usado en esta sesión) y/o `curl` contra el servidor de desarrollo.

## Global Constraints

- No modificar el pipeline de sync de Zoho ni de Movimientos/Fiducia (spec, "Fuera de alcance").
- Sin migraciones de schema — todo el cambio es de consulta/presentación (spec, "Fuera de alcance").
- El respaldo por Inmueble.id de la oportunidad Zoho (tercer nivel del detalle actual) NO se replica en la detección de huérfanos ni en el `LEFT JOIN LATERAL` de la lista — límite conocido y aceptado, documentado en el spec (afecta 2 de 979 negocios).
- Id de fila: `inv-<InventarioItem.id>` para inmuebles, `neg-<Negocio.id>` para huérfanos — es la única llave de selección/detalle/movimientos en todo el módulo.
- Spec de referencia: `docs/superpowers/specs/2026-07-15-todos-los-inmuebles-en-negocios-design.md`.
- El backend exige sesión: cualquier verificación por `curl` contra `/api/negocios*` debe autenticar primero contra `POST /api/auth/login` (body `{"password": "<APP_PASSWORD>"}`, cookie de sesión) y reenviar esa cookie en las siguientes llamadas. **Nunca** escribas el valor de `APP_PASSWORD` como texto literal en este plan ni en ningún archivo commiteado — léelo del `.env` en el momento de verificar, con `node -e "require('dotenv').config({path:'zoho-payment-tracker/backend/.env'});process.stdout.write(process.env.APP_PASSWORD||'')"`.

---

## Task 1: Extraer helpers compartidos a un servicio (refactor sin cambio de comportamiento)

**Files:**
- Create: `zoho-payment-tracker/backend/src/services/inventarioNegocioService.js`
- Modify: `zoho-payment-tracker/backend/src/routes/negocios.js:1-75` (imports y borrado de los helpers movidos)

**Interfaces:**
- Produces (exportado desde `inventarioNegocioService.js`, usado por tareas siguientes):
  - `ETAPA_POR_TORRE: Record<string, string>`
  - `parseProyectoTorre(proyectoTorreRaw: string|null): { proyecto: string, torre: string } | null`
  - `formatearProyectoTorre(info: { proyecto: string, torre: string }): string`
  - `obtenerEtapaTorre(proyectoTorreRaw: string|null): string`
  - `resolverInventarioPorNegocio(negocios: { referencia: string, datos: object|null }[]): Promise<Map<string, { datos: object }>>`

- [ ] **Step 1: Crear el servicio moviendo el código tal cual (sin cambios de lógica)**

Crea `zoho-payment-tracker/backend/src/services/inventarioNegocioService.js`:

```js
const { PrismaClient } = require('@prisma/client');

const prisma = new PrismaClient();

// Etapa de cada Torre, según la tabla que definió AED (proyecto + número de
// torre → etapa). Lo que no aparezca acá (Isla Laguna, Vela Village, The
// Plaza, Laguna y Ambiental, Urbanismo, o negocios sin inmueble) cae en "0".
const ETAPA_POR_TORRE = {
  'KABO 1': '1', 'KABO 2': '1', 'PRIVE 2': '1', 'PRIVE 3': '1',
  'KABO 3': '2', 'KABO 4': '2', 'PRIVE 1': '2', 'PRIVE 4': '2',
  'KALA 1': '3', 'KALA 2': '3', 'KALIZA 1': '3', 'KALIZA 2': '3',
  'KALA 3': '4', 'KALA 4': '4', 'KALIZA 3': '4',
};

// Parsea el campo Proyecto_Torre del Product de Zoho ("Kabo - Torre 3",
// "Kala Golf - Torre  4") en { proyecto: "Kabo", torre: "3" }.
function parseProyectoTorre(proyectoTorreRaw) {
  const m = String(proyectoTorreRaw ?? '').match(/^(.+?)\s*-\s*Torre\s*(\d+)/i);
  if (!m) return null;
  const proyecto = m[1].trim().replace(/\s*golf$/i, ''); // "Kala Golf" → "Kala"
  return { proyecto, torre: m[2] };
}

// Etiqueta legible para el selector de negocios: "Kabo Torre 3".
function formatearProyectoTorre(info) {
  return `${info.proyecto} Torre ${info.torre}`;
}

function obtenerEtapaTorre(proyectoTorreRaw) {
  const info = parseProyectoTorre(proyectoTorreRaw);
  return (info && ETAPA_POR_TORRE[`${info.proyecto.toUpperCase()} ${info.torre}`]) ?? '0';
}

// Resuelve el inmueble (Product de Zoho) de cada negocio: primero por
// Referencia de Recaudo directa; si no calza (pasa cuando la Referencia
// viene truncada/enmascarada con "****" en el Excel de origen), por
// Nomenclatura → Código de inmueble, igual que el respaldo del detalle de
// negocio. Devuelve un Map de Negocio.referencia → { datos } de InventarioItem.
async function resolverInventarioPorNegocio(negocios) {
  const refs = negocios.map((n) => n.referencia);
  const items = refs.length
    ? await prisma.inventarioItem.findMany({
        where: { referenciaRecaudo: { in: refs } },
        select: { referenciaRecaudo: true, datos: true },
      })
    : [];
  const porReferencia = new Map(items.map((it) => [it.referenciaRecaudo, it]));

  const pendientes = negocios
    .filter((n) => !porReferencia.has(n.referencia))
    .map((n) => ({ referencia: n.referencia, codigo: n.datos?.Nomenclatura }))
    .filter((p) => p.codigo != null && /^\d+$/.test(String(p.codigo)));
  if (pendientes.length) {
    const encontrados = await Promise.all(
      pendientes.map((p) =>
        prisma.inventarioItem.findFirst({
          where: { datos: { path: ['C_digo_inmueble'], equals: Number(p.codigo) } },
          select: { datos: true },
        })
      )
    );
    pendientes.forEach((p, i) => {
      if (encontrados[i]) porReferencia.set(p.referencia, encontrados[i]);
    });
  }
  return porReferencia;
}

module.exports = {
  prisma,
  ETAPA_POR_TORRE,
  parseProyectoTorre,
  formatearProyectoTorre,
  obtenerEtapaTorre,
  resolverInventarioPorNegocio,
};
```

- [ ] **Step 2: Borrar los helpers movidos de `negocios.js` e importarlos del servicio**

En `zoho-payment-tracker/backend/src/routes/negocios.js`, reemplaza las líneas 1–75 (desde el primer `require` hasta el cierre de `resolverInventarioPorNegocio`, justo antes de `function cleanRef`) por:

```js
const express = require('express');
const { PrismaClient } = require('@prisma/client');
const { excluirEnResumen } = require('../config/columnasExcluidas');
const {
  resolverColumnasMovPorPropietario,
  parseCompradoresCell,
  extraerDatosMovimiento,
} = require('../services/movPorPropietarioParser');
const {
  parseProyectoTorre,
  formatearProyectoTorre,
  obtenerEtapaTorre,
  resolverInventarioPorNegocio,
} = require('../services/inventarioNegocioService');

const router = express.Router();
const prisma = new PrismaClient();

// ── Helpers ────────────────────────────────────────────────────────────────

```

(El resto del archivo, empezando en `function cleanRef(ref) {`, queda igual — solo se borra el bloque `ETAPA_POR_TORRE` / `parseProyectoTorre` / `formatearProyectoTorre` / `obtenerEtapaTorre` / `resolverInventarioPorNegocio` que ahora vive en el servicio.)

- [ ] **Step 3: Verificar que no rompió nada (mismo comportamiento de antes)**

Con el backend corriendo (`cd zoho-payment-tracker/backend && npm run dev` en otra terminal), corre:

```bash
node -e "
const axios = require('axios');
axios.get('http://localhost:3001/api/negocios?limit=3').then(res => {
  console.log('total:', res.data.pagination.total);
  console.log('primer negocio:', JSON.stringify(res.data.data[0], null, 2));
});
"
```

Expected: `total: 979` (sin cambios, todavía basado solo en `Negocio`) y el primer registro trae `projectCode`/`proyectoTorre`/`etapa` como antes.

- [ ] **Step 4: Commit**

```bash
git add zoho-payment-tracker/backend/src/services/inventarioNegocioService.js zoho-payment-tracker/backend/src/routes/negocios.js
git commit -m "refactor: extraer helpers de inmueble/etapa a inventarioNegocioService"
```

---

## Task 2: Construir la consulta unificada `listarNegociosInventario`

**Files:**
- Modify: `zoho-payment-tracker/backend/src/services/inventarioNegocioService.js`

**Interfaces:**
- Consumes: `prisma`, `ETAPA_POR_TORRE`, `parseProyectoTorre`, `formatearProyectoTorre`, `obtenerEtapaTorre` (definidos en Task 1, mismo archivo).
- Produces:
  - `listarNegociosInventario({ search, estado, etapa, saldoPendiente, page, limit }: { search?: string, estado?: string, etapa?: string, saldoPendiente?: string, page: number, limit: number }) => Promise<{ data: FilaNegocio[], total: number, etapasDisponibles: string[] }>`
  - `FilaNegocio = { id: string, tieneNegocio: boolean, referencia: string|null, estado: string|null, saldoActual: number|null, datos: object|null, compradores: object[], totalMovimientos: number, projectCode: string|null, proyectoTorre: string|null, etapa: string|null }`

- [ ] **Step 1: Agregar `Prisma` al import y las nuevas funciones al final de `inventarioNegocioService.js`**

Modifica la primera línea del archivo:

```js
const { PrismaClient, Prisma } = require('@prisma/client');
```

Agrega al final del archivo (antes de `module.exports`):

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

// CTE compartida entre la consulta de datos y la de conteo: une todos los
// InventarioItem (con su Negocio vinculado, si existe) con los Negocio que
// no calzan con ningún InventarioItem ("huérfanos" — depósitos, parqueaderos,
// etc. que se venden como parte de un negocio pero no están en Zoho Products).
const BASE_CTE = Prisma.sql`
WITH inmuebles AS (
  SELECT
    ('inv-' || inv.id) AS id,
    inv.datos AS inventario_datos,
    neg.id AS negocio_id,
    neg.referencia AS referencia,
    neg.estado AS estado,
    neg."saldoActual" AS "saldoActual",
    neg.datos AS negocio_datos
  FROM "InventarioItem" inv
  LEFT JOIN LATERAL (
    SELECT n.* FROM "Negocio" n
    WHERE n.referencia = inv."referenciaRecaudo"
       OR (n.datos->>'Nomenclatura') = (inv.datos->>'C_digo_inmueble')
    ORDER BY (n.referencia = inv."referenciaRecaudo") DESC
    LIMIT 1
  ) neg ON true
),
huerfanos AS (
  SELECT
    ('neg-' || n.id) AS id,
    NULL::jsonb AS inventario_datos,
    n.id AS negocio_id,
    n.referencia AS referencia,
    n.estado AS estado,
    n."saldoActual" AS "saldoActual",
    n.datos AS negocio_datos
  FROM "Negocio" n
  WHERE NOT EXISTS (
    SELECT 1 FROM "InventarioItem" inv2
    WHERE inv2."referenciaRecaudo" = n.referencia
       OR (inv2.datos->>'C_digo_inmueble') = (n.datos->>'Nomenclatura')
  )
),
combinado AS (
  SELECT * FROM inmuebles
  UNION ALL
  SELECT * FROM huerfanos
)
`;

// Arma el WHERE del conjunto unificado. `valoresEtapa` es el Map que
// devuelve valoresProyectoTorrePorEtapa().
function construirFiltroCombinado({ search, estado, etapa, saldoPendiente, valoresEtapa }) {
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
  return condiciones.length ? Prisma.sql`WHERE ${Prisma.join(condiciones, ' AND ')}` : Prisma.empty;
}

// Lista unificada InventarioItem + Negocio (incluidos los huérfanos), con
// paginación, orden por Proyecto/Torre y los mismos filtros que ya existían
// (Estado, Solo con abonos, búsqueda) más Etapa y búsqueda por datos del
// inmueble (Project Code, Proyecto/Torre).
async function listarNegociosInventario({ search, estado, etapa, saldoPendiente, page, limit }) {
  const valoresEtapa = await valoresProyectoTorrePorEtapa();
  const filtro = construirFiltroCombinado({ search, estado, etapa, saldoPendiente, valoresEtapa });

  const totalRows = await prisma.$queryRaw`
    ${BASE_CTE}
    SELECT COUNT(*)::int AS total FROM combinado c ${filtro}
  `;
  const total = totalRows[0]?.total ?? 0;

  const filas = await prisma.$queryRaw`
    ${BASE_CTE}
    SELECT
      c.id, c.inventario_datos, c.negocio_id, c.referencia, c.estado, c."saldoActual", c.negocio_datos,
      COALESCE((
        SELECT jsonb_agg(jsonb_build_object('id', comp.id, 'nombre', comp.nombre, 'nroId', comp."nroId", 'porcentaje', comp.porcentaje, 'orden', comp.orden) ORDER BY comp.orden)
        FROM "NegocioComprador" comp WHERE comp."negocioId" = c.negocio_id
      ), '[]'::jsonb) AS compradores,
      (SELECT COUNT(*)::int FROM "NegocioMovimiento" m WHERE m."negocioId" = c.negocio_id) AS "totalMovimientos"
    FROM combinado c
    ${filtro}
    ORDER BY c.inventario_datos->>'Proyecto_Torre' ASC NULLS LAST, c.inventario_datos->>'Project_Code' ASC NULLS LAST
    LIMIT ${limit} OFFSET ${(page - 1) * limit}
  `;

  const data = filas.map((f) => {
    const info = parseProyectoTorre(f.inventario_datos?.Proyecto_Torre);
    return {
      id: f.id,
      tieneNegocio: f.negocio_id != null,
      referencia: f.referencia,
      estado: f.estado,
      saldoActual: f.saldoActual,
      datos: f.negocio_datos,
      compradores: f.compradores,
      totalMovimientos: f.totalMovimientos,
      projectCode: f.inventario_datos?.Project_Code ?? null,
      proyectoTorre: info ? formatearProyectoTorre(info) : null,
      etapa: info ? obtenerEtapaTorre(f.inventario_datos.Proyecto_Torre) : null,
    };
  });

  return {
    data,
    total,
    etapasDisponibles: [...valoresEtapa.keys()].sort((a, b) => Number(a) - Number(b)),
  };
}
```

Actualiza el `module.exports` al final del archivo para incluir `listarNegociosInventario`:

```js
module.exports = {
  prisma,
  ETAPA_POR_TORRE,
  parseProyectoTorre,
  formatearProyectoTorre,
  obtenerEtapaTorre,
  resolverInventarioPorNegocio,
  listarNegociosInventario,
};
```

- [ ] **Step 2: Verificar con un script contra la BD real (sin necesidad de levantar el servidor)**

```bash
cd zoho-payment-tracker/backend && node -e "
const { listarNegociosInventario } = require('./src/services/inventarioNegocioService');
(async () => {
  const r = await listarNegociosInventario({ page: 1, limit: 5 });
  console.log('total:', r.total, '(esperado ~1976)');
  console.log('etapasDisponibles:', r.etapasDisponibles);
  console.log('primeras filas:', r.data.map(d => ({ id: d.id, tieneNegocio: d.tieneNegocio, projectCode: d.projectCode, proyectoTorre: d.proyectoTorre })));

  // Caso conocido: Nomenclatura 24105 (Prive Torre 4), buscado por texto
  const porBusqueda = await listarNegociosInventario({ search: '24105', page: 1, limit: 5 });
  console.log('busqueda 24105 ->', porBusqueda.data.map(d => ({ id: d.id, projectCode: d.projectCode, etapa: d.etapa, tieneNegocio: d.tieneNegocio })));

  // Partición de etapas: debe sumar el total sin huecos
  let suma = 0;
  for (const et of r.etapasDisponibles) {
    const p = await listarNegociosInventario({ etapa: et, page: 1, limit: 9999 });
    console.log('etapa', et, '->', p.total);
    suma += p.total;
  }
  console.log('suma etapas:', suma, 'vs total sin filtro:', r.total);

  // Saldo pendiente y Estado excluyen huérfanos/inmuebles sin negocio
  const conAbonos = await listarNegociosInventario({ saldoPendiente: 'true', page: 1, limit: 9999 });
  console.log('con abonos -> ninguno sin negocio:', conAbonos.data.every(d => d.tieneNegocio));
  process.exit(0);
})();
"
```

Expected:
- `total` ronda 1976 (1936 inmuebles + ~40 huérfanos — el número exacto de huérfanos puede variar levemente si hubo syncs recientes; validar que sea consistente con `total InventarioItem` + negocios no matcheados).
- La búsqueda por "24105" devuelve una fila con `projectCode: "Prive Torre 4 1-E"`, `etapa: "2"`, `tieneNegocio: true`.
- La suma de todas las etapas es exactamente igual al total sin filtro (partición sin huecos ni duplicados).
- Todas las filas con `saldoPendiente=true` tienen `tieneNegocio: true`.

Si el campo `inventario_datos`/`negocio_datos`/`compradores` llega como **string** en vez de objeto (revisar con `typeof f.inventario_datos`), agregar `JSON.parse(...)` al mapear — Prisma+pg normalmente deserializa `jsonb` automáticamente, pero conviene confirmarlo antes de seguir.

- [ ] **Step 3: Commit**

```bash
git add zoho-payment-tracker/backend/src/services/inventarioNegocioService.js
git commit -m "feat: consulta unificada InventarioItem+Negocio (listarNegociosInventario)"
```

---

## Task 3: Conectar `GET /api/negocios` a la consulta unificada

**Files:**
- Modify: `zoho-payment-tracker/backend/src/routes/negocios.js` (reemplaza el handler de `router.get('/', ...)`, líneas ~253-352 tras el Task 1 — buscar por el comentario `// GET /api/negocios?search=&estado=&etapa=&page=&limit=`)

**Interfaces:**
- Consumes: `listarNegociosInventario` de `../services/inventarioNegocioService` (Task 2), más `prisma.negocio.findMany` para las opciones de Estado (sin cambios).

- [ ] **Step 1: Actualizar el import y reemplazar el handler**

Agrega `listarNegociosInventario` al import ya existente en `negocios.js` (el que se dejó en el Task 1):

```js
const {
  parseProyectoTorre,
  formatearProyectoTorre,
  obtenerEtapaTorre,
  resolverInventarioPorNegocio,
  listarNegociosInventario,
} = require('../services/inventarioNegocioService');
```

Reemplaza todo el bloque del handler `router.get('/', async (req, res) => { ... });` (desde el comentario `// GET /api/negocios?search=&estado=&etapa=&page=&limit=` hasta su `});` de cierre) por:

```js
// GET /api/negocios?search=&estado=&etapa=&saldoPendiente=&page=&limit=
router.get('/', async (req, res) => {
  try {
    const { search, estado, etapa, saldoPendiente, page = '1', limit = '50' } = req.query;
    const pageNum = Math.max(1, parseInt(page));
    const limitNum = Math.min(9999, Math.max(1, parseInt(limit)));
    const noFilters = !search && !estado && !etapa;

    const [{ data, total, etapasDisponibles }, estadosRaw] = await Promise.all([
      listarNegociosInventario({ search, estado, etapa, saldoPendiente, page: pageNum, limit: limitNum }),
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
      ...(noFilters ? { etapas: etapasDisponibles } : {}),
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});
```

- [ ] **Step 2: Verificar con el servidor corriendo**

```bash
cd zoho-payment-tracker/backend && npm run dev
```

En otra terminal:

```bash
# Autenticar y guardar la cookie de sesión (ver Global Constraints — nunca escribas el password literal)
curl -s -c /tmp/negocios-cookies.txt -X POST http://localhost:3001/api/auth/login \
  -H 'Content-Type: application/json' \
  -d "{\"password\":\"$(node -e "require('dotenv').config({path:'zoho-payment-tracker/backend/.env'});process.stdout.write(process.env.APP_PASSWORD||'')")\"}" > /dev/null

curl -s -b /tmp/negocios-cookies.txt "http://localhost:3001/api/negocios?limit=3" | node -e "const d=JSON.parse(require('fs').readFileSync(0));console.log(d.pagination, d.etapas, d.data[0])"
curl -s -b /tmp/negocios-cookies.txt "http://localhost:3001/api/negocios?etapa=0&limit=3" | node -e "const d=JSON.parse(require('fs').readFileSync(0));console.log(d.pagination.total, d.data.map(x=>x.tieneNegocio))"
curl -s -b /tmp/negocios-cookies.txt "http://localhost:3001/api/negocios?saldoPendiente=true&limit=200" | node -e "const d=JSON.parse(require('fs').readFileSync(0));console.log('total:',d.pagination.total,'todos con negocio:',d.data.every(x=>x.tieneNegocio))"
```

Expected: `pagination.total` ≈ 1976 sin filtros; con `etapa=0` un subconjunto que incluye filas con `tieneNegocio: false`; con `saldoPendiente=true` todas las filas tienen `tieneNegocio: true`.

- [ ] **Step 3: Eliminar `resolverInventarioPorNegocio` (queda sin uso)**

Desde este punto, ningún código de `negocios.js` llama a `resolverInventarioPorNegocio` — la nueva consulta unificada la reemplaza por completo. Bórrala de `inventarioNegocioService.js` (la función completa, definida en el Task 1) y quítala de `module.exports`:

```js
module.exports = {
  prisma,
  ETAPA_POR_TORRE,
  parseProyectoTorre,
  formatearProyectoTorre,
  obtenerEtapaTorre,
  listarNegociosInventario,
};
```

Confirma que no queda ninguna referencia:

```bash
grep -rn "resolverInventarioPorNegocio" zoho-payment-tracker/backend/src
```

Expected: sin resultados.

- [ ] **Step 4: Commit**

```bash
git add zoho-payment-tracker/backend/src/routes/negocios.js zoho-payment-tracker/backend/src/services/inventarioNegocioService.js
git commit -m "feat: GET /api/negocios lista todos los inmuebles + negocios huerfanos"
```

---

## Task 4: Detalle por id prefijado (`GET /api/negocios/:id`)

**Files:**
- Modify: `zoho-payment-tracker/backend/src/services/inventarioNegocioService.js` (agregar `resolverNegocioIdDesdeInmueble` y `obtenerNegocioPorId`)
- Modify: `zoho-payment-tracker/backend/src/routes/negocios.js` (reemplazar el handler de `router.get('/:referencia', ...)`, actualmente líneas ~607-655 antes de este Task)

**Interfaces:**
- Consumes: `prisma` (Task 1).
- Produces:
  - `resolverNegocioIdDesdeInmueble(inmueble: { referenciaRecaudo: string|null, datos: object|null }): Promise<string|null>` — id de `Negocio` vinculado, o `null`.
  - `obtenerNegocioPorId(id: string): Promise<DetalleNegocio | null | undefined>` — `undefined` si el prefijo no es `inv-`/`neg-`, `null` si no existe, si no el detalle.
  - `DetalleNegocio` incluye todo lo de `FilaNegocio` (Task 2) más `oportunidad`, `codigoInmueble`, `inventarioDatos`, `negocioId`.

- [ ] **Step 1: Agregar las funciones al servicio**

Agrega en `inventarioNegocioService.js`, antes de `module.exports` (necesita `findOportunidadByReferencia`, que se mueve aquí desde `negocios.js` porque ahora la usan tanto el detalle como, potencialmente, otros consumidores del servicio):

```js
// Busca la oportunidad de Zoho vinculada a un negocio por su referencia.
// La clave de unión es Negocio.referencia ↔ Opportunity.referenciaRecaudo.
async function findOportunidadByReferencia(referencia) {
  if (!referencia) return null;
  const select = {
    id: true, dealName: true, stage: true, referenciaRecaudo: true,
    pagoSeparacion: true, fechaInicioPlanPagos: true, camposFinancieros: true,
    seccionInmueble: true, lastSyncedAt: true,
  };
  let opp = await prisma.opportunity.findFirst({ where: { referenciaRecaudo: referencia }, select });
  if (!opp && referencia.length >= 6) {
    opp = await prisma.opportunity.findFirst({
      where: { referenciaRecaudo: { contains: referencia, mode: 'insensitive' } },
      select,
    });
  }
  return opp;
}

// Dado un InventarioItem, resuelve el id del Negocio vinculado (directo por
// Referencia de Recaudo, luego por Nomenclatura → Código de inmueble) o null.
async function resolverNegocioIdDesdeInmueble(inmueble) {
  if (inmueble.referenciaRecaudo) {
    const negocio = await prisma.negocio.findUnique({
      where: { referencia: inmueble.referenciaRecaudo },
      select: { id: true },
    });
    if (negocio) return negocio.id;
  }
  if (inmueble.datos?.C_digo_inmueble != null) {
    const negocio = await prisma.negocio.findFirst({
      where: { datos: { path: ['Nomenclatura'], equals: String(inmueble.datos.C_digo_inmueble) } },
      select: { id: true },
    });
    if (negocio) return negocio.id;
  }
  return null;
}

const INCLUDE_NEGOCIO_DETALLE = {
  compradores: { orderBy: { orden: 'asc' } },
  _count: { select: { movimientos: true } },
};

// Detalle unificado de una fila del módulo de Negocios, a partir del id
// prefijado que devuelve listarNegociosInventario(). undefined si el
// prefijo no se reconoce; null si el recurso no existe.
async function obtenerNegocioPorId(id) {
  if (id.startsWith('inv-')) {
    const inventarioId = id.slice('inv-'.length);
    const inmueble = await prisma.inventarioItem.findUnique({ where: { id: inventarioId } });
    if (!inmueble) return null;

    const negocioId = await resolverNegocioIdDesdeInmueble(inmueble);
    const negocio = negocioId
      ? await prisma.negocio.findUnique({ where: { id: negocioId }, include: INCLUDE_NEGOCIO_DETALLE })
      : null;

    const oportunidad = await findOportunidadByReferencia(negocio?.referencia ?? null);
    const info = parseProyectoTorre(inmueble.datos?.Proyecto_Torre);
    return {
      id,
      tieneNegocio: !!negocio,
      referencia: negocio?.referencia ?? null,
      estado: negocio?.estado ?? null,
      datos: negocio?.datos ?? null,
      saldoActual: negocio?.saldoActual ?? null,
      compradores: negocio?.compradores ?? [],
      totalMovimientos: negocio?._count?.movimientos ?? 0,
      oportunidad,
      codigoInmueble: inmueble.datos?.C_digo_inmueble ?? null,
      projectCode: inmueble.datos?.Project_Code ?? null,
      proyectoTorre: info ? formatearProyectoTorre(info) : null,
      etapa: info ? obtenerEtapaTorre(inmueble.datos.Proyecto_Torre) : null,
      inventarioDatos: inmueble.datos ?? null,
      negocioId: negocio?.id ?? null,
    };
  }

  if (id.startsWith('neg-')) {
    const negocioId = id.slice('neg-'.length);
    const negocio = await prisma.negocio.findUnique({ where: { id: negocioId }, include: INCLUDE_NEGOCIO_DETALLE });
    if (!negocio) return null;
    const oportunidad = await findOportunidadByReferencia(negocio.referencia);
    return {
      id,
      tieneNegocio: true,
      referencia: negocio.referencia,
      estado: negocio.estado,
      datos: negocio.datos,
      saldoActual: negocio.saldoActual,
      compradores: negocio.compradores,
      totalMovimientos: negocio._count.movimientos,
      oportunidad,
      codigoInmueble: null,
      projectCode: null,
      proyectoTorre: null,
      etapa: null,
      inventarioDatos: null,
      negocioId: negocio.id,
    };
  }

  return undefined;
}
```

Actualiza `module.exports` para agregar `resolverNegocioIdDesdeInmueble`, `obtenerNegocioPorId` y `findOportunidadByReferencia`.

- [ ] **Step 2: Reemplazar la ruta en `negocios.js`**

Agrega `obtenerNegocioPorId` al import de `../services/inventarioNegocioService` (mismo bloque de import que ya existe). Reemplaza el bloque completo desde el comentario `// Busca la oportunidad de Zoho vinculada...` hasta el cierre del handler `router.get('/:referencia', ...)` por:

```js
// GET /api/negocios/:id  (id = "inv-<InventarioItem.id>" o "neg-<Negocio.id>")
router.get('/:id', async (req, res) => {
  try {
    const id = decodeURIComponent(req.params.id);
    const detalle = await obtenerNegocioPorId(id);
    if (detalle === undefined) return res.status(400).json({ error: 'Id inválido' });
    if (detalle === null) return res.status(404).json({ error: 'No encontrado' });
    res.json(detalle);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});
```

- [ ] **Step 3: Verificar con el servidor corriendo**

```bash
cd zoho-payment-tracker/backend && node -e "
const { listarNegociosInventario } = require('./src/services/inventarioNegocioService');
(async () => {
  const conNegocio = await listarNegociosInventario({ search: '24105', page: 1, limit: 1 });
  const sinNegocio = await listarNegociosInventario({ page: 1, limit: 9999 }).then(r => r.data.find(d => !d.tieneNegocio));
  const huerfano = await listarNegociosInventario({ page: 1, limit: 9999 }).then(r => r.data.find(d => d.id.startsWith('neg-')));
  console.log('ids a probar:', { conNegocio: conNegocio.data[0]?.id, sinNegocio: sinNegocio?.id, huerfano: huerfano?.id });
  process.exit(0);
})();
"
```

Con los tres ids impresos, contra el servidor corriendo:

```bash
# Autenticar (una vez; reusa /tmp/negocios-cookies.txt si ya la generaste en este Task)
curl -s -c /tmp/negocios-cookies.txt -X POST http://localhost:3001/api/auth/login \
  -H 'Content-Type: application/json' \
  -d "{\"password\":\"$(node -e "require('dotenv').config({path:'zoho-payment-tracker/backend/.env'});process.stdout.write(process.env.APP_PASSWORD||'')")\"}" > /dev/null

curl -s -b /tmp/negocios-cookies.txt "http://localhost:3001/api/negocios/<id-con-negocio>" | node -e "const d=JSON.parse(require('fs').readFileSync(0));console.log(d.referencia, d.projectCode, d.tieneNegocio)"
curl -s -b /tmp/negocios-cookies.txt "http://localhost:3001/api/negocios/<id-sin-negocio>" | node -e "const d=JSON.parse(require('fs').readFileSync(0));console.log(d.referencia, d.projectCode, d.tieneNegocio, d.oportunidad)"
curl -s -b /tmp/negocios-cookies.txt "http://localhost:3001/api/negocios/<id-huerfano>" | node -e "const d=JSON.parse(require('fs').readFileSync(0));console.log(d.referencia, d.projectCode, d.proyectoTorre, d.tieneNegocio)"
```

Expected: el primero trae `referencia`/`projectCode`/`tieneNegocio: true`; el segundo trae `projectCode` pero `referencia: null`, `tieneNegocio: false`, `oportunidad: null`; el tercero trae `referencia` pero `projectCode: null`, `proyectoTorre: null`.

- [ ] **Step 4: Commit**

```bash
git add zoho-payment-tracker/backend/src/services/inventarioNegocioService.js zoho-payment-tracker/backend/src/routes/negocios.js
git commit -m "feat: GET /api/negocios/:id resuelve inmuebles y negocios huerfanos por id prefijado"
```

---

## Task 5: Movimientos por id prefijado (`GET /api/negocios/:id/movimientos`)

**Files:**
- Modify: `zoho-payment-tracker/backend/src/services/inventarioNegocioService.js` (agregar `obtenerMovimientosPorId`)
- Modify: `zoho-payment-tracker/backend/src/routes/negocios.js` (reemplazar el handler de `router.get('/:referencia/movimientos', ...)`)

**Interfaces:**
- Consumes: `resolverNegocioIdDesdeInmueble` (Task 4).
- Produces: `obtenerMovimientosPorId(id: string, { page: number, limit: number }): Promise<{ data: object[], pagination: object } | null | undefined>`.

- [ ] **Step 1: Agregar la función al servicio**

Agrega en `inventarioNegocioService.js`, antes de `module.exports`:

```js
// Movimientos de la fila identificada por `id` (mismo esquema de prefijo
// que obtenerNegocioPorId). Si no hay negocio vinculado, devuelve una
// página vacía en vez de error.
async function obtenerMovimientosPorId(id, { page, limit }) {
  let negocioId = null;

  if (id.startsWith('inv-')) {
    const inmueble = await prisma.inventarioItem.findUnique({ where: { id: id.slice('inv-'.length) } });
    if (!inmueble) return null;
    negocioId = await resolverNegocioIdDesdeInmueble(inmueble);
  } else if (id.startsWith('neg-')) {
    const negocio = await prisma.negocio.findUnique({ where: { id: id.slice('neg-'.length) }, select: { id: true } });
    if (!negocio) return null;
    negocioId = negocio.id;
  } else {
    return undefined;
  }

  if (!negocioId) {
    return { data: [], pagination: { total: 0, page, limit, totalPages: 0 } };
  }

  const [total, movimientos] = await Promise.all([
    prisma.negocioMovimiento.count({ where: { negocioId } }),
    prisma.negocioMovimiento.findMany({
      where: { negocioId },
      skip: (page - 1) * limit,
      take: limit,
      orderBy: [{ fechaContable: { sort: 'desc', nulls: 'last' } }, { createdAt: 'desc' }],
    }),
  ]);
  return { data: movimientos, pagination: { total, page, limit, totalPages: Math.ceil(total / limit) } };
}
```

Agrega `obtenerMovimientosPorId` a `module.exports`.

- [ ] **Step 2: Reemplazar la ruta en `negocios.js`**

Agrega `obtenerMovimientosPorId` al import de `../services/inventarioNegocioService`. Reemplaza el handler `router.get('/:referencia/movimientos', ...)` por:

```js
// GET /api/negocios/:id/movimientos?page=&limit=
router.get('/:id/movimientos', async (req, res) => {
  try {
    const id = decodeURIComponent(req.params.id);
    const { page = '1', limit = '50' } = req.query;
    const pageNum = Math.max(1, parseInt(page));
    const limitNum = Math.min(200, Math.max(1, parseInt(limit)));

    const resultado = await obtenerMovimientosPorId(id, { page: pageNum, limit: limitNum });
    if (resultado === undefined) return res.status(400).json({ error: 'Id inválido' });
    if (resultado === null) return res.status(404).json({ error: 'No encontrado' });
    res.json(resultado);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});
```

- [ ] **Step 3: Verificar con el servidor corriendo**

Reusa los tres ids obtenidos en el Task 4 (con negocio, sin negocio, huérfano):

```bash
# Autenticar (una vez; reusa /tmp/negocios-cookies.txt si ya la generaste en este Task)
curl -s -c /tmp/negocios-cookies.txt -X POST http://localhost:3001/api/auth/login \
  -H 'Content-Type: application/json' \
  -d "{\"password\":\"$(node -e "require('dotenv').config({path:'zoho-payment-tracker/backend/.env'});process.stdout.write(process.env.APP_PASSWORD||'')")\"}" > /dev/null

curl -s -b /tmp/negocios-cookies.txt "http://localhost:3001/api/negocios/<id-con-negocio>/movimientos?limit=5" | node -e "const d=JSON.parse(require('fs').readFileSync(0));console.log(d.pagination)"
curl -s -b /tmp/negocios-cookies.txt "http://localhost:3001/api/negocios/<id-sin-negocio>/movimientos" | node -e "const d=JSON.parse(require('fs').readFileSync(0));console.log(d)"
```

Expected: el primero trae `pagination.total > 0` con datos; el segundo trae `{ data: [], pagination: { total: 0, ... } }` sin error.

- [ ] **Step 4: Commit**

```bash
git add zoho-payment-tracker/backend/src/services/inventarioNegocioService.js zoho-payment-tracker/backend/src/routes/negocios.js
git commit -m "feat: GET /api/negocios/:id/movimientos soporta ids sin negocio vinculado"
```

---

## Task 6: Frontend — identificador `id`, badge "Sin negocio", encabezado de respaldo

**Files:**
- Modify: `zoho-payment-tracker/frontend/src/pages/Negocios.jsx:1080` (`NegocioItem`, `isSelected`/`onClick`)
- Modify: `zoho-payment-tracker/frontend/src/pages/Negocios.jsx:1112-1123` (`NegocioItem`, badge de Estado)
- Modify: `zoho-payment-tracker/frontend/src/pages/Negocios.jsx:722-734` (`NegocioDetalle`, prop `referencia` → `id`)
- Modify: `zoho-payment-tracker/frontend/src/pages/Negocios.jsx:793-819` (`NegocioDetalle`, encabezado)
- Modify: `zoho-payment-tracker/frontend/src/pages/Negocios.jsx:1417-1418` (render de `NegocioDetalle`)

**Interfaces:**
- Consumes: `negocio.id` (prefijado `inv-`/`neg-`), `negocio.tieneNegocio` (boolean) — nuevos campos que ya devuelve el backend desde el Task 3/4.

- [ ] **Step 1: `NegocioItem` selecciona y resalta por `id`**

En `NegocioItem` (línea 1080), cambia:

```js
  const isSelected = selected === negocio.referencia;
```
por:
```js
  const isSelected = selected === negocio.id;
```

Y en el `onClick` del botón (línea 1087):
```jsx
      onClick={() => onClick(negocio.referencia)}
```
por:
```jsx
      onClick={() => onClick(negocio.id)}
```

- [ ] **Step 2: Badge "Sin negocio" quando `!tieneNegocio`**

Reemplaza el bloque del badge de Estado (líneas 1112-1123):

```jsx
        <div className="flex flex-col items-end gap-1 flex-shrink-0">
          {negocio.estado && (
            <span className={`text-[12px] font-bold px-1.5 py-0.5 rounded-full ${estadoColor(negocio.estado)}`}>
              {negocio.estado}
            </span>
          )}
          {saldo && (
            <span className={`text-[12px] font-semibold tabular-nums ${saldoNum > 0 ? 'text-emerald-600' : 'text-slate-500'}`}>
              {saldo}
            </span>
          )}
        </div>
```

por:

```jsx
        <div className="flex flex-col items-end gap-1 flex-shrink-0">
          {negocio.estado && (
            <span className={`text-[12px] font-bold px-1.5 py-0.5 rounded-full ${estadoColor(negocio.estado)}`}>
              {negocio.estado}
            </span>
          )}
          {!negocio.tieneNegocio && (
            <span className="text-[11px] font-medium px-1.5 py-0.5 rounded-full bg-slate-100 text-slate-500">
              Sin negocio
            </span>
          )}
          {saldo && (
            <span className={`text-[12px] font-semibold tabular-nums ${saldoNum > 0 ? 'text-emerald-600' : 'text-slate-500'}`}>
              {saldo}
            </span>
          )}
        </div>
```

- [ ] **Step 3: `NegocioDetalle` recibe `id` en vez de `referencia`**

Cambia la firma y el fetch (líneas 722, 730, 734):

```js
function NegocioDetalle({ referencia }) {
  ...
    getNegocio(referencia)
      .then(setNegocio)
      .catch((err) => setError(err.response?.data?.error || err.message))
      .finally(() => setLoading(false));
  }, [referencia]);
```

por:

```js
function NegocioDetalle({ id }) {
  ...
    getNegocio(id)
      .then(setNegocio)
      .catch((err) => setError(err.response?.data?.error || err.message))
      .finally(() => setLoading(false));
  }, [id]);
```

- [ ] **Step 4: Encabezado con respaldo cuando no hay `referencia`**

Reemplaza el bloque del encabezado (líneas 792-812):

```jsx
          <div className="min-w-0">
            <p className="text-[12px] text-slate-500 mb-0.5 uppercase tracking-wide">Referencia</p>
            <h2 className="font-heading text-[19px] font-bold text-ink font-mono">{negocio.referencia}</h2>
            {(negocio.projectCode || nomenclatura || proyectoInfo?.etapa || pisoInfo) && (
              <p className="text-[15px] font-semibold text-brand-strong mt-0.5">
                {negocio.projectCode ? (
                  <span>{negocio.projectCode}</span>
                ) : (
                  <>
                    {nomenclatura && <span>Apto {nomenclatura}</span>}
                    {nomenclatura && (proyectoInfo?.etapa || pisoInfo) && <span className="mx-1.5 text-slate-300">·</span>}
                    {proyectoInfo?.etapa && <span>Etapa {proyectoInfo.etapa}</span>}
                    {proyectoInfo?.etapa && pisoInfo && <span className="mx-1.5 text-slate-300">·</span>}
                    {pisoInfo?.torre && <span>Torre {pisoInfo.torre}</span>}
                    {pisoInfo?.torre && pisoInfo?.piso && <span className="mx-1.5 text-slate-300">·</span>}
                    {pisoInfo?.piso && <span>Piso {pisoInfo.piso}</span>}
                  </>
                )}
              </p>
            )}
          </div>
```

por:

```jsx
          <div className="min-w-0">
            <p className="text-[12px] text-slate-500 mb-0.5 uppercase tracking-wide">
              {negocio.referencia ? 'Referencia' : 'Project Code'}
            </p>
            <h2 className="font-heading text-[19px] font-bold text-ink font-mono">
              {negocio.referencia || negocio.projectCode || '—'}
            </h2>
            {(negocio.referencia && (negocio.projectCode || nomenclatura || proyectoInfo?.etapa || pisoInfo)) && (
              <p className="text-[15px] font-semibold text-brand-strong mt-0.5">
                {negocio.projectCode ? (
                  <span>{negocio.projectCode}</span>
                ) : (
                  <>
                    {nomenclatura && <span>Apto {nomenclatura}</span>}
                    {nomenclatura && (proyectoInfo?.etapa || pisoInfo) && <span className="mx-1.5 text-slate-300">·</span>}
                    {proyectoInfo?.etapa && <span>Etapa {proyectoInfo.etapa}</span>}
                    {proyectoInfo?.etapa && pisoInfo && <span className="mx-1.5 text-slate-300">·</span>}
                    {pisoInfo?.torre && <span>Torre {pisoInfo.torre}</span>}
                    {pisoInfo?.torre && pisoInfo?.piso && <span className="mx-1.5 text-slate-300">·</span>}
                    {pisoInfo?.piso && <span>Piso {pisoInfo.piso}</span>}
                  </>
                )}
              </p>
            )}
          </div>
```

Nota: cuando no hay `referencia`, `negocio.projectCode` ya se muestra como `<h2>` (título principal), así que se omite repetirlo en el subtítulo — de ahí el `negocio.referencia &&` agregado a la condición del subtítulo.

Luego, en el bloque de badges junto al estado (justo debajo, donde está `{negocio.estado && (...)}`), agrega el mismo badge "Sin negocio" que en `NegocioItem`. Busca:

```jsx
              {negocio.estado && (
                <span className={`text-[12px] font-bold px-2.5 py-1 rounded-full ${estadoColor(negocio.estado)}`}>
                  {negocio.estado}
                </span>
              )}
```

y agrega inmediatamente después:

```jsx
              {!negocio.tieneNegocio && (
                <span className="text-[12px] font-medium px-2.5 py-1 rounded-full bg-slate-100 text-slate-500">
                  Sin negocio
                </span>
              )}
```

- [ ] **Step 5: El componente padre pasa `id` en vez de `referencia`**

Al final del archivo, donde se renderiza el detalle (líneas 1417-1418):

```jsx
        {selected ? (
          <NegocioDetalle key={selected} referencia={selected} />
```

por:

```jsx
        {selected ? (
          <NegocioDetalle key={selected} id={selected} />
```

- [ ] **Step 6: Verificar en el navegador**

```bash
cd zoho-payment-tracker/backend && npm run dev
```
(en otra terminal)
```bash
cd zoho-payment-tracker/frontend && npm run dev
```

Abrir `http://localhost:5173` → módulo Negocios. Verificar:
- La lista muestra ~1976 filas (ya no ~979).
- Seleccionar un inmueble sin negocio (busca uno con badge "Sin negocio" en la lista) → el detalle carga, encabezado muestra "Project Code" como etiqueta, badge "Sin negocio" junto al estado (que estará vacío).
- Seleccionar un negocio con inmueble vinculado → funciona exactamente igual que antes (sin badge "Sin negocio", encabezado "Referencia").
- Buscar "24105" → aparece el inmueble con Project Code "Prive Torre 4 1-E".

- [ ] **Step 7: Commit**

```bash
git add zoho-payment-tracker/frontend/src/pages/Negocios.jsx
git commit -m "feat: seleccion e identificacion por id en vez de referencia, badge Sin negocio"
```

---

## Task 7: Frontend — "Info del apartamento" con datos del inventario cuando no hay negocio

**Files:**
- Modify: `zoho-payment-tracker/frontend/src/pages/Negocios.jsx:114-124` (agregar `categorizeInventarioDatos` después de `categorizeDatos`)
- Modify: `zoho-payment-tracker/frontend/src/pages/Negocios.jsx:758-785` (`NegocioDetalle`, construcción de `aptoEntries`)

**Interfaces:**
- Consumes: `negocio.inventarioDatos` (raw `InventarioItem.datos`, agregado al detalle en el Task 4).
- Produces: `categorizeInventarioDatos(datosInmueble: object|null): [string, unknown][]` — entradas `[etiqueta, valor]` listas para `ListaInfo`.

- [ ] **Step 1: Agregar `categorizeInventarioDatos` después de `categorizeDatos`**

Justo después del cierre de `categorizeDatos` (línea 124, `}`), agrega:

```js

// Traduce un subconjunto de campos del Product de Zoho (InventarioItem.datos)
// al mismo formato [etiqueta, valor] que categorizeDatos, para inmuebles que
// todavía no tienen Negocio.datos (Excel de Movimientos) del cual sacar esta
// información. Ampliable si hace falta más adelante.
function categorizeInventarioDatos(datosInmueble) {
  if (!datosInmueble) return [];
  const campos = [
    ['Código de inmueble', datosInmueble.C_digo_inmueble],
    ['Categoría', datosInmueble.Product_Category],
    ['Tipo', datosInmueble.Tipo_Apto],
    ['Área privada (m²)', datosInmueble.Area_Privada_en_M2],
    ['Área construida (m²)', datosInmueble.Area_Construida_en_M2],
    ['Piso', datosInmueble.Piso],
    ['Alcobas', datosInmueble.No_Alcobas],
    ['Baños', datosInmueble.No_Ba_os],
    ['Estrato', datosInmueble.Estrato],
  ];
  return campos.filter(([, v]) => v != null && String(v).trim() !== '');
}
```

- [ ] **Step 2: Usar `categorizeInventarioDatos` como respaldo en `aptoEntries`**

En `NegocioDetalle`, ubica el bloque (líneas 758-785):

```js
  const { apto, financiero } = categorizeDatos(separarUnidadesAdicionales(filtrarDatosResumen(negocio.datos || {})));
  const aptoEntriesBase = Object.entries(apto);
  const finEntries = ordenarFinanciero(Object.entries(financiero));
```

y

```js
  const aptoEntries = [
    ...(proyectoInfo?.etapa ? [['Etapa', proyectoInfo.etapa]] : []),
    ...(negocio.codigoInmueble ? [['Código de Inmueble', negocio.codigoInmueble]] : []),
    ...(negocio.projectCode ? [['Project Code', negocio.projectCode]] : []),
    ...aptoEntriesBase,
  ];
```

Reemplázalos por:

```js
  const { apto, financiero } = categorizeDatos(separarUnidadesAdicionales(filtrarDatosResumen(negocio.datos || {})));
  const aptoEntriesBase = negocio.datos
    ? Object.entries(apto)
    : categorizeInventarioDatos(negocio.inventarioDatos);
  const finEntries = ordenarFinanciero(Object.entries(financiero));
```

y

```js
  const aptoEntries = [
    ...(proyectoInfo?.etapa ? [['Etapa', proyectoInfo.etapa]] : []),
    ...(negocio.codigoInmueble ? [['Código de Inmueble', negocio.codigoInmueble]] : []),
    ...(negocio.projectCode ? [['Project Code', negocio.projectCode]] : []),
    ...aptoEntriesBase,
  ];
```

(Este segundo bloque no cambia de código — se deja igual, solo confirma que sigue usando `aptoEntriesBase`, ahora ya con el respaldo aplicado arriba. Si tu editor no marca diferencia aquí, no hace falta tocarlo.)

- [ ] **Step 3: Verificar en el navegador**

Con ambos servidores corriendo, seleccionar un inmueble sin negocio (badge "Sin negocio"). En el acordeón "Info del apartamento" deben aparecer, cuando existan en Zoho, filas como "Código de inmueble", "Categoría", "Tipo", "Área privada (m²)", "Piso", "Alcobas", "Baños", "Estrato" — ya no el mensaje "Sin datos del apartamento" para esos ~1000 inmuebles.

Para un negocio con `Negocio.datos` normal, el acordeón debe verse exactamente igual que antes (sin cambios de comportamiento).

- [ ] **Step 4: Commit**

```bash
git add zoho-payment-tracker/frontend/src/pages/Negocios.jsx
git commit -m "feat: Info del apartamento usa datos del inventario cuando no hay negocio"
```

---

## Task 8: QA manual de punta a punta

**Files:** ninguno (solo verificación).

- [ ] **Step 1: Recorrer el checklist del spec**

Con ambos servidores corriendo, en el navegador:

- [ ] Lista sin filtros: ~1976 filas, agrupadas visualmente por Proyecto/Torre.
- [ ] Un inmueble con negocio real (Nomenclatura 24105): detalle completo, sin badge "Sin negocio".
- [ ] Un inmueble sin negocio: badge "Sin negocio" en la lista y en el detalle; título = Project Code; subtítulo Proyecto Torre - Etapa; Comprador/Conciliación/Movimientos en estado vacío; "Info del apartamento" con datos básicos del inventario.
- [ ] Un negocio huérfano (buscar "DEP" o "PARQ" en el buscador): aparece al final de la lista, sin Project Code/Proyecto Torre/Etapa, con sus datos de negocio normales (comprador, saldo, movimientos, conciliación si tiene oportunidad).
- [ ] Filtro Estado y "Solo con abonos": los inmuebles sin negocio y los huérfanos sin ese estado desaparecen mientras el filtro esté activo; reaparecen al limpiar filtros.
- [ ] Filtro Etapa: cada etapa (0-4) filtra correctamente; el total de todas las etapas sumadas coincide con el total sin filtros.
- [ ] Búsqueda por Project Code o por "Torre" de un proyecto: encuentra inmuebles sin negocio.
- [ ] Exportar a Excel/CSV/PDF con la lista completa: no debe tirar error aunque haya filas sin `datos`/`compradores` (celdas en blanco para esas columnas).
- [ ] Paginación: navegar entre páginas mantiene el orden por Proyecto/Torre de forma estable.

- [ ] **Step 2: Si todo pasa, no hay commit adicional — el trabajo ya quedó commiteado en cada tarea.**
