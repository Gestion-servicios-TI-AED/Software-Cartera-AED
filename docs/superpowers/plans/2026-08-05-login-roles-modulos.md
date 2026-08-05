# Login con permisos por módulo Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Reemplazar la clave única compartida (`APP_PASSWORD`) por cuentas individuales (correo + contraseña) con permisos por módulo, gestión de usuarios desde Ajustes (solo admins), y un historial de auditoría de esos cambios.

**Architecture:** Un modelo `Usuario` (sin tabla de roles) con `modulosPermitidos: String[]` reutilizando las mismas `key` de `navItems.js`; un flag `esAdmin` que da acceso total. El backend re-consulta el usuario en cada request (`requireAuth`) y aplica `requireModulo(clave|claves[])` / `requireAdmin` por sub-ruta. El frontend arma el sidebar filtrando por `modulosPermitidos` y protege cada `<Route>` con un wrapper `RutaProtegida`.

**Tech Stack:** Express + Prisma (PostgreSQL) en el backend; React + React Router en el frontend; `bcryptjs` para contraseñas.

## Global Constraints

- Este repo no tiene framework de tests (`No test suite is configured`, ver CLAUDE.md). Los pasos de "verificación" de cada tarea son scripts ad hoc (Node con `assert`, `curl`, o Playwright) que se corren una vez para comprobar el comportamiento y **no se commitean** — no se introduce un framework de testing nuevo como parte de este trabajo. Esto es consistente con cómo se ha verificado todo el trabajo anterior en este repo.
- Todas las migraciones de Prisma en este proyecto se escriben a mano en `prisma/migrations/<timestamp>_<nombre>/migration.sql` (no `prisma migrate dev` interactivo) — ver migraciones previas como referencia del patrón.
- Antes de cada verificación que toque el backend, hay que reiniciar el proceso de `npm run dev` si estaba corriendo con código viejo (ver nota de cache-staleness en tareas anteriores de este repo).
- Todo archivo `.jsx`/`.js` tocado en el frontend se valida con `esbuild.buildSync` (sintaxis) antes de la verificación visual.
- Spec de referencia: `docs/superpowers/specs/2026-08-05-login-roles-modulos-design.md`.
- Mapeo módulo↔endpoint verificado línea por línea contra el uso real del frontend (no es el mapeo aproximado del spec original — ver tabla completa en la Tarea 10 y 11; se corrigieron varios cruces de módulo durante la planeación, documentados inline).

---

### Task 1: Dependencia `bcryptjs` y catálogo de módulos válidos

**Files:**
- Modify: `zoho-payment-tracker/backend/package.json`
- Create: `zoho-payment-tracker/backend/src/config/modulos.js`

**Interfaces:**
- Produces: `MODULOS_VALIDOS` (array de 16 strings) — usado por Tarea 7 (`routes/usuarios.js`) para validar `modulosPermitidos` al crear/editar un usuario.

- [ ] **Step 1: Instalar `bcryptjs`**

```bash
cd "zoho-payment-tracker/backend" && npm install bcryptjs
```

- [ ] **Step 2: Crear el catálogo de módulos**

Crear `zoho-payment-tracker/backend/src/config/modulos.js`:

```js
// Claves válidas de módulo -- deben reflejar 1:1 las `key` de
// frontend/src/config/navItems.js (NAV_ITEMS_BAIA_KRISTAL + NAV_ITEMS_ALEGRA).
// El backend no puede importar ese archivo (depende de lucide-react, un
// paquete de frontend), así que esta lista se mantiene sincronizada a mano.
// Si agregas un módulo nuevo en navItems.js, agrégalo también acá, o la
// creación/edición de usuarios en /api/usuarios lo rechazará como inválido.
const MODULOS_VALIDOS = [
  'negocios', 'oportunidades', 'inventario', 'encargos', 'movimientos',
  'resumen', 'dashboard', 'cartera-mora',
  'alegra-negocios', 'alegra-oportunidades', 'alegra-inventario', 'alegra-encargos',
  'alegra-movimientos', 'alegra-resumen', 'alegra-dashboard', 'alegra-cartera-mora',
];

module.exports = { MODULOS_VALIDOS };
```

- [ ] **Step 3: Verificar**

```bash
cd "zoho-payment-tracker/backend" && node -e "
const { MODULOS_VALIDOS } = require('./src/config/modulos');
const assert = require('assert');
assert.strictEqual(MODULOS_VALIDOS.length, 16);
assert.ok(MODULOS_VALIDOS.includes('negocios'));
assert.ok(MODULOS_VALIDOS.includes('alegra-cartera-mora'));
console.log('OK');
"
```
Expected: `OK`

- [ ] **Step 4: Commit**

```bash
git add zoho-payment-tracker/backend/package.json zoho-payment-tracker/backend/package-lock.json zoho-payment-tracker/backend/src/config/modulos.js
git commit -m "feat(auth): agrega bcryptjs y catálogo de módulos válidos"
```

---

### Task 2: Modelo de datos — `Usuario` y `AuditoriaUsuario`, retiro de `ConfiguracionApp`

**Files:**
- Modify: `zoho-payment-tracker/backend/prisma/schema.prisma:212-222`
- Create: `zoho-payment-tracker/backend/prisma/migrations/20260805120000_add_usuarios_auditoria/migration.sql`

**Interfaces:**
- Produces: modelos Prisma `Usuario` (`id, email, nombre, passwordHash, esAdmin, activo, modulosPermitidos, createdAt, updatedAt`) y `AuditoriaUsuario` (`id, actorId, usuarioId, accion, detalle, createdAt`), disponibles vía `prisma.usuario` / `prisma.auditoriaUsuario` en todas las tareas siguientes.

- [ ] **Step 1: Editar el schema**

En `zoho-payment-tracker/backend/prisma/schema.prisma`, reemplazar el bloque de `ConfiguracionApp` (líneas 212-222):

```prisma
// Configuración global de la aplicación, compartida por todos -- no hay
// usuarios individuales (una sola clave de acceso), así que cualquier ajuste
// acá aplica para todo el que entre. Clave/valor genérico (en vez de una
// columna por ajuste) para poder agregar más configuraciones globales sin
// nueva migración. Hoy solo se usa para `menuOculto` (qué ítems del sidebar
// están ocultos, ver Ajustes.jsx / navPrefs.js).
model ConfiguracionApp {
  clave     String   @id
  valor     Json
  updatedAt DateTime @updatedAt
}
```

por:

```prisma
// Cuenta individual de acceso -- reemplaza la clave única compartida
// (APP_PASSWORD). `modulosPermitidos` reutiliza las mismas `key` de
// frontend/src/config/navItems.js (ver también backend/src/config/modulos.js).
// `esAdmin` da acceso a todos los módulos sin necesidad de listarlos, más la
// gestión de usuarios en Ajustes.
model Usuario {
  id                Int      @id @default(autoincrement())
  email             String   @unique
  nombre            String
  passwordHash      String
  esAdmin           Boolean  @default(false)
  activo            Boolean  @default(true)
  modulosPermitidos String[] @default([])
  createdAt         DateTime @default(now())
  updatedAt         DateTime @updatedAt

  auditoriasComoActor    AuditoriaUsuario[] @relation("AuditoriaActor")
  auditoriasComoAfectado AuditoriaUsuario[] @relation("AuditoriaAfectado")
}

// Historial de acciones de administración sobre usuarios (crear, cambiar
// módulos, activar/desactivar, resetear contraseña, dar/quitar admin) --
// se escribe automáticamente desde routes/usuarios.js, nunca a mano.
model AuditoriaUsuario {
  id        Int      @id @default(autoincrement())
  actorId   Int
  actor     Usuario  @relation("AuditoriaActor", fields: [actorId], references: [id])
  usuarioId Int
  usuario   Usuario  @relation("AuditoriaAfectado", fields: [usuarioId], references: [id])
  accion    String
  detalle   Json?
  createdAt DateTime @default(now())
}
```

- [ ] **Step 2: Escribir la migración a mano**

Crear el directorio y archivo `zoho-payment-tracker/backend/prisma/migrations/20260805120000_add_usuarios_auditoria/migration.sql`:

```sql
-- DropTable
DROP TABLE "ConfiguracionApp";

-- CreateTable
CREATE TABLE "Usuario" (
    "id" SERIAL NOT NULL,
    "email" TEXT NOT NULL,
    "nombre" TEXT NOT NULL,
    "passwordHash" TEXT NOT NULL,
    "esAdmin" BOOLEAN NOT NULL DEFAULT false,
    "activo" BOOLEAN NOT NULL DEFAULT true,
    "modulosPermitidos" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Usuario_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Usuario_email_key" ON "Usuario"("email");

-- CreateTable
CREATE TABLE "AuditoriaUsuario" (
    "id" SERIAL NOT NULL,
    "actorId" INTEGER NOT NULL,
    "usuarioId" INTEGER NOT NULL,
    "accion" TEXT NOT NULL,
    "detalle" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AuditoriaUsuario_pkey" PRIMARY KEY ("id")
);

-- AddForeignKey
ALTER TABLE "AuditoriaUsuario" ADD CONSTRAINT "AuditoriaUsuario_actorId_fkey" FOREIGN KEY ("actorId") REFERENCES "Usuario"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AuditoriaUsuario" ADD CONSTRAINT "AuditoriaUsuario_usuarioId_fkey" FOREIGN KEY ("usuarioId") REFERENCES "Usuario"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
```

- [ ] **Step 3: Aplicar la migración y regenerar el cliente**

Si `npm run dev` está corriendo, deténlo primero (Prisma no puede regenerar el cliente con el proceso activo en Windows):

```bash
cd "zoho-payment-tracker/backend" && npx prisma migrate deploy && npx prisma generate
```
Expected: ambos comandos terminan sin error; la salida de `migrate deploy` incluye `20260805120000_add_usuarios_auditoria`.

- [ ] **Step 4: Verificar que las tablas existen**

```bash
cd "zoho-payment-tracker/backend" && node -e "
const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();
(async () => {
  const usuarios = await prisma.usuario.findMany();
  const auditoria = await prisma.auditoriaUsuario.findMany();
  console.log('usuarios:', usuarios.length, 'auditoria:', auditoria.length);
  await prisma.\$disconnect();
})();
"
```
Expected: `usuarios: 0 auditoria: 0` (tablas vacías pero existentes, sin error).

- [ ] **Step 5: Commit**

```bash
git add zoho-payment-tracker/backend/prisma/schema.prisma zoho-payment-tracker/backend/prisma/migrations/20260805120000_add_usuarios_auditoria
git commit -m "feat(db): agrega Usuario y AuditoriaUsuario, retira ConfiguracionApp"
```

---

### Task 3: `middleware/auth.js` — sesión con identidad, `requireModulo`, `requireAdmin`

**Files:**
- Modify: `zoho-payment-tracker/backend/src/middleware/auth.js` (reescritura completa)

**Interfaces:**
- Consumes: `prisma.usuario.findUnique`.
- Produces: `requireAuth` (deja `req.usuario = { id, email, nombre, esAdmin, modulosPermitidos }`), `requireModulo(claveOClaves: string|string[])`, `requireAdmin`, `createSessionToken(userId)`, `SESSION_COOKIE`, `MAX_AGE_MS` — usados por Tarea 4 (login), Tarea 7 (usuarios), y todas las tareas de gating (9, 10, 11).

- [ ] **Step 1: Reescribir el archivo completo**

Reemplazar todo el contenido de `zoho-payment-tracker/backend/src/middleware/auth.js`:

```js
// Candado de acceso: cuentas individuales (correo + contraseña) con sesión
// firmada en cookie httpOnly. El token codifica el id del usuario -- cada
// request re-consulta la base de datos (no solo verifica la firma) para que
// un cambio de permisos o una desactivación apliquen de inmediato, sin
// esperar a que expire la sesión.
const crypto = require('crypto');
const { PrismaClient } = require('@prisma/client');

const prisma = new PrismaClient();

const SESSION_COOKIE = 'session';
const MAX_AGE_MS = 30 * 24 * 60 * 60 * 1000; // 30 días

function sign(value) {
  return crypto.createHmac('sha256', process.env.SESSION_SECRET).update(value).digest('hex');
}

function createSessionToken(userId) {
  const exp = Date.now() + MAX_AGE_MS;
  const payload = `${userId}.${exp}`;
  return `${payload}.${sign(payload)}`;
}

// Devuelve el userId (number) si el token es válido, o null si no.
function verifySessionToken(token) {
  if (!token) return null;
  const [userId, exp, sig] = token.split('.');
  if (!userId || !exp || !sig) return null;
  if (Date.now() > Number(exp)) return null;

  const payload = `${userId}.${exp}`;
  const expected = Buffer.from(sign(payload));
  const actual = Buffer.from(sig);
  if (expected.length !== actual.length || !crypto.timingSafeEqual(expected, actual)) return null;

  return Number(userId);
}

function parseCookies(header = '') {
  const out = {};
  header.split(';').forEach((pair) => {
    const idx = pair.indexOf('=');
    if (idx === -1) return;
    const key = pair.slice(0, idx).trim();
    if (key) out[key] = decodeURIComponent(pair.slice(idx + 1).trim());
  });
  return out;
}

async function requireAuth(req, res, next) {
  const cookies = parseCookies(req.headers.cookie);
  const userId = verifySessionToken(cookies[SESSION_COOKIE]);
  if (userId == null) return res.status(401).json({ error: 'No autorizado' });

  try {
    const usuario = await prisma.usuario.findUnique({ where: { id: userId } });
    if (!usuario || !usuario.activo) return res.status(401).json({ error: 'No autorizado' });

    req.usuario = {
      id: usuario.id,
      email: usuario.email,
      nombre: usuario.nombre,
      esAdmin: usuario.esAdmin,
      modulosPermitidos: usuario.modulosPermitidos,
    };
    next();
  } catch (err) {
    res.status(500).json({ error: 'Error verificando sesión' });
  }
}

// Acepta una clave sola o un array -- basta con tener acceso a UNA de las
// claves dadas (usado en endpoints que alimentan más de un módulo del
// frontend, ej. /negocios/dashboard-recaudo lo consumen tanto Dashboard como
// Resumen). Los admins pasan siempre.
function requireModulo(claveOClaves) {
  const claves = Array.isArray(claveOClaves) ? claveOClaves : [claveOClaves];
  return (req, res, next) => {
    if (req.usuario.esAdmin || claves.some((c) => req.usuario.modulosPermitidos.includes(c))) {
      return next();
    }
    res.status(403).json({ error: 'No tienes permiso para este módulo' });
  };
}

function requireAdmin(req, res, next) {
  if (req.usuario.esAdmin) return next();
  res.status(403).json({ error: 'Requiere permisos de administrador' });
}

module.exports = {
  requireAuth, requireModulo, requireAdmin,
  createSessionToken, SESSION_COOKIE, MAX_AGE_MS,
};
```

- [ ] **Step 2: Verificar la lógica de firma/token de forma aislada**

```bash
cd "zoho-payment-tracker/backend" && SESSION_SECRET=test-secret node -e "
const assert = require('assert');
const { createSessionToken } = require('./src/middleware/auth');
// No podemos importar verifySessionToken directamente (no se exporta), así
// que probamos el contrato observable: dos tokens del mismo usuario en el
// mismo milisegundo tienen exp igual pero difieren si el userId difiere.
const t1 = createSessionToken(1);
const t2 = createSessionToken(2);
assert.notStrictEqual(t1, t2);
assert.ok(t1.startsWith('1.'));
assert.ok(t2.startsWith('2.'));
console.log('OK');
"
```
Expected: `OK`

- [ ] **Step 3: Commit**

```bash
git add zoho-payment-tracker/backend/src/middleware/auth.js
git commit -m "feat(auth): sesión con identidad de usuario, requireModulo y requireAdmin"
```

---

### Task 4: `routes/auth.js` — login por correo/contraseña

**Files:**
- Modify: `zoho-payment-tracker/backend/src/routes/auth.js` (reescritura completa)

**Interfaces:**
- Consumes: `requireAuth, createSessionToken, SESSION_COOKIE, MAX_AGE_MS` de `middleware/auth.js` (Tarea 3); `prisma.usuario.findUnique`; `bcrypt.compare` de `bcryptjs`.
- Produces: `POST /api/auth/login { email, password }`, `POST /api/auth/logout`, `GET /api/auth/check` → `{ id, email, nombre, esAdmin, modulosPermitidos }`. Consumido por el frontend en Tarea 13/16.

- [ ] **Step 1: Reescribir el archivo completo**

Reemplazar todo el contenido de `zoho-payment-tracker/backend/src/routes/auth.js`:

```js
const express = require('express');
const bcrypt = require('bcryptjs');
const { PrismaClient } = require('@prisma/client');
const { requireAuth, createSessionToken, SESSION_COOKIE, MAX_AGE_MS } = require('../middleware/auth');

const router = express.Router();
const prisma = new PrismaClient();

// La cookie solo debe marcarse Secure cuando el sitio realmente sirve por
// HTTPS — si no, el navegador la descarta en silencio y el login nunca
// "pega". Se activa a propósito con COOKIE_SECURE=true el día que haya
// dominio + certificado, en vez de asumirlo por NODE_ENV.
const COOKIE_SECURE = process.env.COOKIE_SECURE === 'true';

router.post('/login', async (req, res) => {
  const { email, password } = req.body || {};
  if (!email || !password) {
    return res.status(401).json({ error: 'Correo o contraseña incorrectos' });
  }

  const usuario = await prisma.usuario.findUnique({
    where: { email: String(email).toLowerCase().trim() },
  });
  if (!usuario || !usuario.activo) {
    return res.status(401).json({ error: 'Correo o contraseña incorrectos' });
  }

  const coincide = await bcrypt.compare(password, usuario.passwordHash);
  if (!coincide) {
    return res.status(401).json({ error: 'Correo o contraseña incorrectos' });
  }

  res.cookie(SESSION_COOKIE, createSessionToken(usuario.id), {
    httpOnly: true,
    sameSite: 'lax',
    secure: COOKIE_SECURE,
    maxAge: MAX_AGE_MS,
  });
  res.json({ ok: true });
});

router.post('/logout', (req, res) => {
  res.clearCookie(SESSION_COOKIE);
  res.json({ ok: true });
});

router.get('/check', requireAuth, (req, res) => res.json(req.usuario));

module.exports = router;
```

- [ ] **Step 2: Commit**

```bash
git add zoho-payment-tracker/backend/src/routes/auth.js
git commit -m "feat(auth): login por correo y contraseña en vez de clave compartida"
```

(La verificación end-to-end de login/check ocurre en la Tarea 5, una vez exista un usuario real creado por el script de arranque.)

---

### Task 5: Script de arranque del admin inicial

**Files:**
- Create: `zoho-payment-tracker/backend/scripts/seedAdmin.js`
- Modify: `zoho-payment-tracker/backend/package.json` (agregar script `db:seed-admin`)
- Modify: `zoho-payment-tracker/backend/.env` (agregar `ADMIN_EMAIL`, `ADMIN_PASSWORD`, `ADMIN_NOMBRE`; quitar `APP_PASSWORD`) — **paso manual, no se commitea** (`.env` no está en el repo)

**Interfaces:**
- Produces: un `Usuario` con `esAdmin: true` en la base de datos, necesario para poder loguearse por primera vez y usar la pantalla de Ajustes de la Tarea 18.

- [ ] **Step 1: Crear el script**

Crear `zoho-payment-tracker/backend/scripts/seedAdmin.js`:

```js
require('dotenv').config();
const bcrypt = require('bcryptjs');
const { PrismaClient } = require('@prisma/client');

const prisma = new PrismaClient();

async function main() {
  const email = process.env.ADMIN_EMAIL;
  const password = process.env.ADMIN_PASSWORD;
  const nombre = process.env.ADMIN_NOMBRE;

  if (!email || !password || !nombre) {
    console.error('Faltan ADMIN_EMAIL, ADMIN_PASSWORD o ADMIN_NOMBRE en .env');
    process.exit(1);
  }

  const passwordHash = await bcrypt.hash(password, 10);
  const emailNormalizado = email.toLowerCase().trim();

  const usuario = await prisma.usuario.upsert({
    where: { email: emailNormalizado },
    update: { passwordHash, esAdmin: true, activo: true, nombre },
    create: {
      email: emailNormalizado,
      nombre,
      passwordHash,
      esAdmin: true,
      activo: true,
      modulosPermitidos: [],
    },
  });

  console.log(`Usuario admin listo: ${usuario.email} (id ${usuario.id})`);
  await prisma.$disconnect();
}

main().catch((err) => {
  console.error('Error creando el admin inicial:', err);
  process.exit(1);
});
```

- [ ] **Step 2: Agregar el npm script**

En `zoho-payment-tracker/backend/package.json`, dentro de `"scripts"`, agregar después de `"db:studio"`:

```json
    "db:studio": "prisma studio",
    "db:seed-admin": "node scripts/seedAdmin.js"
```

- [ ] **Step 3: Agregar las variables al `.env` (manual)**

Abrir `zoho-payment-tracker/backend/.env` y:
1. Eliminar la línea `APP_PASSWORD=...` (ya no se lee en ningún lado).
2. Agregar (con tu correo real y una contraseña fuerte elegida por ti — no un valor de este documento):

```
ADMIN_EMAIL=tu-correo@aed.com.co
ADMIN_PASSWORD=elige-una-contraseña-fuerte
ADMIN_NOMBRE=Tu Nombre
```

- [ ] **Step 4: Correr el script y verificar el login end-to-end**

```bash
cd "zoho-payment-tracker/backend" && npm run db:seed-admin
```
Expected: `Usuario admin listo: tu-correo@aed.com.co (id 1)`

Con el backend corriendo (`npm run dev`), probar el flujo completo de login:

```bash
cd "zoho-payment-tracker/backend" && node -e "
(async () => {
  const email = process.env.ADMIN_EMAIL;
  const password = process.env.ADMIN_PASSWORD;
  const login = await fetch('http://localhost:3001/api/auth/login', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password }),
  });
  console.log('login status:', login.status);
  const cookie = login.headers.get('set-cookie');
  const check = await fetch('http://localhost:3001/api/auth/check', {
    headers: { Cookie: cookie },
  });
  console.log('check status:', check.status, await check.json());
})();
" 2>&1 | grep -v "^$"
```
(Nota: este comando necesita que `ADMIN_EMAIL`/`ADMIN_PASSWORD` estén en el entorno del shell — si no, exportarlas primero desde el `.env` o pegarlas directo en el script de prueba.)

Expected: `login status: 200`, `check status: 200 { id: 1, email: '...', nombre: '...', esAdmin: true, modulosPermitidos: [] }`.

- [ ] **Step 5: Commit**

```bash
git add zoho-payment-tracker/backend/scripts/seedAdmin.js zoho-payment-tracker/backend/package.json
git commit -m "feat(auth): script de arranque para crear el usuario admin inicial"
```
(El `.env` no se commitea — ya está fuera del control de versiones.)

---

### Task 6: `services/auditoriaService.js`

**Files:**
- Create: `zoho-payment-tracker/backend/src/services/auditoriaService.js`

**Interfaces:**
- Produces: `registrarAuditoria({ actorId, usuarioId, accion, detalle })`, `obtenerAuditoria(limit)` — consumidos por Tarea 7 (`routes/usuarios.js`).

- [ ] **Step 1: Crear el archivo**

```js
const { PrismaClient } = require('@prisma/client');

const prisma = new PrismaClient();

async function registrarAuditoria({ actorId, usuarioId, accion, detalle = null }) {
  await prisma.auditoriaUsuario.create({
    data: { actorId, usuarioId, accion, detalle },
  });
}

async function obtenerAuditoria(limit = 100) {
  return prisma.auditoriaUsuario.findMany({
    orderBy: { createdAt: 'desc' },
    take: limit,
    include: {
      actor: { select: { nombre: true, email: true } },
      usuario: { select: { nombre: true, email: true } },
    },
  });
}

module.exports = { registrarAuditoria, obtenerAuditoria };
```

- [ ] **Step 2: Verificar de forma aislada**

Con el admin ya creado en la Tarea 5 (id 1), probar que se puede registrar y leer una entrada:

```bash
cd "zoho-payment-tracker/backend" && node -e "
const assert = require('assert');
const { registrarAuditoria, obtenerAuditoria } = require('./src/services/auditoriaService');
(async () => {
  await registrarAuditoria({ actorId: 1, usuarioId: 1, accion: 'crear', detalle: null });
  const registros = await obtenerAuditoria(10);
  assert.ok(registros.length >= 1);
  assert.strictEqual(registros[0].accion, 'crear');
  assert.ok(registros[0].actor.email);
  console.log('OK', registros.length);
  process.exit(0);
})();
"
```
Expected: `OK <n>` con n >= 1.

- [ ] **Step 3: Commit**

```bash
git add zoho-payment-tracker/backend/src/services/auditoriaService.js
git commit -m "feat(auth): servicio de auditoría de cambios sobre usuarios"
```

---

### Task 7: `routes/usuarios.js` — CRUD de usuarios + auditoría (admin-only)

**Files:**
- Create: `zoho-payment-tracker/backend/src/routes/usuarios.js`

**Interfaces:**
- Consumes: `requireAdmin` (Tarea 3), `MODULOS_VALIDOS` (Tarea 1), `registrarAuditoria`/`obtenerAuditoria` (Tarea 6).
- Produces: `GET /api/usuarios`, `GET /api/usuarios/auditoria`, `POST /api/usuarios`, `PATCH /api/usuarios/:id` — montadas en Tarea 8, consumidas por el frontend en Tarea 13/18.

- [ ] **Step 1: Crear el archivo**

```js
const express = require('express');
const bcrypt = require('bcryptjs');
const { PrismaClient } = require('@prisma/client');
const { requireAdmin } = require('../middleware/auth');
const { MODULOS_VALIDOS } = require('../config/modulos');
const { registrarAuditoria, obtenerAuditoria } = require('../services/auditoriaService');

const router = express.Router();
const prisma = new PrismaClient();

router.use(requireAdmin);

function validarModulos(modulos) {
  return Array.isArray(modulos) && modulos.every((m) => MODULOS_VALIDOS.includes(m));
}

const SELECT_PUBLICO = {
  id: true, email: true, nombre: true, esAdmin: true, activo: true,
  modulosPermitidos: true, createdAt: true, updatedAt: true,
};

router.get('/', async (req, res) => {
  const usuarios = await prisma.usuario.findMany({
    select: SELECT_PUBLICO,
    orderBy: { nombre: 'asc' },
  });
  res.json(usuarios);
});

router.get('/auditoria', async (req, res) => {
  const registros = await obtenerAuditoria(100);
  res.json(registros);
});

router.post('/', async (req, res) => {
  const { email, nombre, password, esAdmin, modulosPermitidos } = req.body || {};

  if (!email || !nombre || !password) {
    return res.status(400).json({ error: 'Correo, nombre y contraseña son obligatorios' });
  }
  const modulos = esAdmin ? [] : (modulosPermitidos || []);
  if (!validarModulos(modulos)) {
    return res.status(400).json({ error: 'Módulo inválido en modulosPermitidos' });
  }

  const passwordHash = await bcrypt.hash(password, 10);

  let usuario;
  try {
    usuario = await prisma.usuario.create({
      data: {
        email: String(email).toLowerCase().trim(),
        nombre,
        passwordHash,
        esAdmin: !!esAdmin,
        modulosPermitidos: modulos,
      },
      select: SELECT_PUBLICO,
    });
  } catch (err) {
    if (err.code === 'P2002') {
      return res.status(409).json({ error: 'Ya existe un usuario con ese correo' });
    }
    throw err;
  }

  await registrarAuditoria({ actorId: req.usuario.id, usuarioId: usuario.id, accion: 'crear' });
  res.status(201).json(usuario);
});

router.patch('/:id', async (req, res) => {
  const id = Number(req.params.id);
  const actual = await prisma.usuario.findUnique({ where: { id } });
  if (!actual) return res.status(404).json({ error: 'Usuario no encontrado' });

  const { modulosPermitidos, esAdmin, activo, password } = req.body || {};
  const data = {};
  const eventos = [];

  if (modulosPermitidos !== undefined) {
    if (!validarModulos(modulosPermitidos)) {
      return res.status(400).json({ error: 'Módulo inválido en modulosPermitidos' });
    }
    data.modulosPermitidos = modulosPermitidos;
    eventos.push({ accion: 'modulos', detalle: { antes: actual.modulosPermitidos, despues: modulosPermitidos } });
  }

  if (esAdmin !== undefined && esAdmin !== actual.esAdmin) {
    data.esAdmin = !!esAdmin;
    eventos.push({ accion: esAdmin ? 'admin-on' : 'admin-off', detalle: null });
  }

  if (activo !== undefined && activo !== actual.activo) {
    data.activo = !!activo;
    eventos.push({ accion: activo ? 'activar' : 'desactivar', detalle: null });
  }

  if (password) {
    data.passwordHash = await bcrypt.hash(password, 10);
    eventos.push({ accion: 'reset-password', detalle: null });
  }

  if (Object.keys(data).length === 0) {
    return res.status(400).json({ error: 'Nada para actualizar' });
  }

  const usuario = await prisma.usuario.update({ where: { id }, data, select: SELECT_PUBLICO });

  for (const evento of eventos) {
    await registrarAuditoria({ actorId: req.usuario.id, usuarioId: id, ...evento });
  }

  res.json(usuario);
});

module.exports = router;
```

- [ ] **Step 2: Commit**

```bash
git add zoho-payment-tracker/backend/src/routes/usuarios.js
git commit -m "feat(auth): rutas de administración de usuarios y auditoría"
```
(Se monta y verifica end-to-end en la Tarea 8, junto con el resto del wiring de `index.js`.)

---

### Task 8: `index.js` — wiring, retiro del menú global, ruta de usuarios

**Files:**
- Modify: `zoho-payment-tracker/backend/src/index.js`
- Delete: `zoho-payment-tracker/backend/src/routes/configuraciones.js`
- Delete: `zoho-payment-tracker/backend/src/services/configuracionAppService.js`

**Interfaces:**
- Consumes: `usuariosRouter` (Tarea 7), `requireModulo` (Tarea 3).

- [ ] **Step 1: Borrar los archivos del menú global retirado**

```bash
rm zoho-payment-tracker/backend/src/routes/configuraciones.js
rm zoho-payment-tracker/backend/src/services/configuracionAppService.js
```

- [ ] **Step 2: Editar los imports de `index.js`**

En `zoho-payment-tracker/backend/src/index.js`, reemplazar:

```js
const { requireAuth } = require('./middleware/auth');
const authRouter = require('./routes/auth');
const opportunitiesRouter = require('./baia-kristal/routes/opportunities');
const fieldsRouter = require('./baia-kristal/routes/fields');
const fiduciaRouter = require('./baia-kristal/routes/fiducia');
const negociosRouter = require('./baia-kristal/routes/negocios');
const statsRouter = require('./baia-kristal/routes/stats');
const inventarioRouter = require('./baia-kristal/routes/inventario');
const configuracionesRouter = require('./routes/configuraciones'); // global (menú)
const configuracionesFrentesRouter = require('./baia-kristal/routes/configuracionesFrentes');
const alegraRouter = require('./alegra/routes');
```

por:

```js
const { requireAuth, requireModulo } = require('./middleware/auth');
const authRouter = require('./routes/auth');
const usuariosRouter = require('./routes/usuarios');
const opportunitiesRouter = require('./baia-kristal/routes/opportunities');
const fieldsRouter = require('./baia-kristal/routes/fields');
const fiduciaRouter = require('./baia-kristal/routes/fiducia');
const negociosRouter = require('./baia-kristal/routes/negocios');
const statsRouter = require('./baia-kristal/routes/stats');
const inventarioRouter = require('./baia-kristal/routes/inventario');
const configuracionesFrentesRouter = require('./baia-kristal/routes/configuracionesFrentes');
const alegraRouter = require('./alegra/routes');
```

- [ ] **Step 3: Editar el montaje de rutas**

Reemplazar:

```js
app.use('/api/configuraciones', configuracionesRouter); // global (menú)
app.use('/api/configuraciones', configuracionesFrentesRouter); // Baía Kristal (frentes)

// Rutas -- Alegra
app.use('/api/alegra', alegraRouter);
```

por:

```js
app.use('/api/configuraciones', configuracionesFrentesRouter); // Baía Kristal (frentes)

// Rutas -- Alegra
app.use('/api/alegra', alegraRouter);

// Rutas -- Usuarios y permisos (compartido, requiere admin -- ver requireAdmin dentro del router)
app.use('/api/usuarios', usuariosRouter);
```

- [ ] **Step 4: Gatear las rutas directas de sync**

Estas rutas solo las consume la página Oportunidades (`Dashboard.jsx` vía `components/SyncStatus.jsx`) — reemplazar:

```js
// GET /api/sync/status — ruta directa (también está en opportunities router)
app.get('/api/sync/status', async (req, res) => {
```

por:

```js
// GET /api/sync/status — ruta directa (también está en opportunities router)
app.get('/api/sync/status', requireModulo('oportunidades'), async (req, res) => {
```

y:

```js
// POST /api/sync — ruta directa
app.post('/api/sync', async (req, res) => {
```

por:

```js
// POST /api/sync — ruta directa
app.post('/api/sync', requireModulo('oportunidades'), async (req, res) => {
```

- [ ] **Step 5: Verificar que el servidor arranca**

```bash
cd "zoho-payment-tracker/backend" && node --check src/index.js
```
Expected: sin salida (sintaxis válida).

Reiniciar el backend (`npm run dev` en una terminal nueva, o el flujo habitual de este repo: matar el proceso en el puerto 3001 y volver a levantarlo) y probar:

```bash
curl -s -o /dev/null -w "%{http_code}\n" http://localhost:3001/api/health
```
Expected: `200`

```bash
curl -s -o /dev/null -w "%{http_code}\n" http://localhost:3001/api/usuarios
```
Expected: `401` (sin cookie de sesión).

- [ ] **Step 6: Commit**

```bash
git add zoho-payment-tracker/backend/src/index.js
git rm zoho-payment-tracker/backend/src/routes/configuraciones.js zoho-payment-tracker/backend/src/services/configuracionAppService.js
git commit -m "feat(auth): monta rutas de usuarios, retira el menú global de ConfiguracionApp"
```

---

### Task 9: Gating de `opportunities.js`, `inventario.js`, `stats.js`, `configuracionesFrentes.js`

**Files:**
- Modify: `zoho-payment-tracker/backend/src/baia-kristal/routes/opportunities.js`
- Modify: `zoho-payment-tracker/backend/src/baia-kristal/routes/inventario.js`
- Modify: `zoho-payment-tracker/backend/src/baia-kristal/routes/stats.js`
- Modify: `zoho-payment-tracker/backend/src/baia-kristal/routes/configuracionesFrentes.js`

**Interfaces:**
- Consumes: `requireModulo`, `requireAdmin` de `../../middleware/auth` (Tarea 3).

Mapeo verificado contra el uso real del frontend (cada función de `utils/api.js` rastreada hasta la página que la llama):

| Archivo | Sub-ruta | Middleware |
|---|---|---|
| `opportunities.js` | `/`, `/stages`, `/:id`, `/sync`, `/sync/status` | `requireModulo('oportunidades')` |
| | `/:id/subforms` | `requireModulo(['oportunidades', 'negocios'])` — lo consumen tanto `OpportunityDetail.jsx` como `Negocios.jsx` |
| | `/backfill-subforms`, `/backfill-subforms/status` | `requireAdmin` — solo los usa `Ajustes.jsx` |
| `inventario.js` | `/sync`, `/sync/status`, `/`, `/:id` | `requireModulo('inventario')` |
| | `/verificar-project-code` | `requireAdmin` — solo lo usa `Ajustes.jsx` |
| `stats.js` | todo el router | `requireModulo('resumen')` — único consumidor es `Resumen.jsx` |
| `configuracionesFrentes.js` | `GET /frentes` | `requireModulo('negocios')` — lo usa `Negocios.jsx` (Ajustes también lo lee, pero como admin ya pasa por `esAdmin`) |
| | `PUT /frentes/:frente`, `PUT /frentes/:frente/torres/:torre`, `PUT .../pisos/:piso` | `requireAdmin` — la edición solo ocurre en `Ajustes.jsx` |

- [ ] **Step 1: `opportunities.js`**

Agregar el import, después de la línea 11 (`} = require('../services/subformsBackfillService');`), antes de `const router = express.Router();`:

```js
const { requireModulo, requireAdmin } = require('../../middleware/auth');
```

Editar cada ruta:

```js
router.get('/', async (req, res) => {
```
→
```js
router.get('/', requireModulo('oportunidades'), async (req, res) => {
```

```js
router.get('/stages', async (req, res) => {
```
→
```js
router.get('/stages', requireModulo('oportunidades'), async (req, res) => {
```

```js
router.get('/:id', async (req, res) => {
```
→
```js
router.get('/:id', requireModulo('oportunidades'), async (req, res) => {
```

```js
router.get('/:id/subforms', async (req, res) => {
```
→
```js
router.get('/:id/subforms', requireModulo(['oportunidades', 'negocios']), async (req, res) => {
```

```js
router.post('/backfill-subforms', (req, res) => {
```
→
```js
router.post('/backfill-subforms', requireAdmin, (req, res) => {
```

```js
router.get('/backfill-subforms/status', (req, res) => {
```
→
```js
router.get('/backfill-subforms/status', requireAdmin, (req, res) => {
```

```js
router.post('/sync', async (req, res) => {
```
→
```js
router.post('/sync', requireModulo('oportunidades'), async (req, res) => {
```

```js
router.get('/sync/status', async (req, res) => {
```
→
```js
router.get('/sync/status', requireModulo('oportunidades'), async (req, res) => {
```

- [ ] **Step 2: `inventario.js`**

Agregar el import después de la línea 9 (`} = require('../services/inventarioNegocioService');`), antes de `const router = express.Router();`:

```js
const { requireModulo, requireAdmin } = require('../../middleware/auth');
```

Editar:

```js
router.post('/sync', (req, res) => {
```
→
```js
router.post('/sync', requireModulo('inventario'), (req, res) => {
```

```js
router.get('/sync/status', (req, res) => {
```
→
```js
router.get('/sync/status', requireModulo('inventario'), (req, res) => {
```

```js
router.get('/verificar-project-code', async (req, res) => {
```
→
```js
router.get('/verificar-project-code', requireAdmin, async (req, res) => {
```

```js
router.get('/', async (req, res) => {
```
→
```js
router.get('/', requireModulo('inventario'), async (req, res) => {
```

```js
router.get('/:id', async (req, res) => {
```
→
```js
router.get('/:id', requireModulo('inventario'), async (req, res) => {
```

- [ ] **Step 3: `stats.js`**

Todo el router es un solo módulo — agregar `router.use(requireModulo('resumen'))` justo después de la creación del router:

```js
const router = express.Router();
const prisma = new PrismaClient();
```
→
```js
const { requireModulo } = require('../../middleware/auth');

const router = express.Router();
const prisma = new PrismaClient();
router.use(requireModulo('resumen'));
```

- [ ] **Step 4: `configuracionesFrentes.js`**

Agregar el import después de la línea 11 (`const { invalidarCacheDashboard } = require('../services/dashboardRecaudoService');`), antes de `const router = express.Router();`:

```js
const { requireModulo, requireAdmin } = require('../../middleware/auth');
```

Editar:

```js
router.get('/frentes', async (req, res) => {
```
→
```js
router.get('/frentes', requireModulo('negocios'), async (req, res) => {
```

```js
router.put('/frentes/:frente', async (req, res) => {
```
→
```js
router.put('/frentes/:frente', requireAdmin, async (req, res) => {
```

```js
router.put('/frentes/:frente/torres/:torre', async (req, res) => {
```
→
```js
router.put('/frentes/:frente/torres/:torre', requireAdmin, async (req, res) => {
```

```js
router.put('/frentes/:frente/torres/:torre/pisos/:piso', async (req, res) => {
```
→
```js
router.put('/frentes/:frente/torres/:torre/pisos/:piso', requireAdmin, async (req, res) => {
```

- [ ] **Step 5: Verificar sintaxis**

```bash
cd "zoho-payment-tracker/backend" && for f in src/baia-kristal/routes/opportunities.js src/baia-kristal/routes/inventario.js src/baia-kristal/routes/stats.js src/baia-kristal/routes/configuracionesFrentes.js; do node --check "$f" || echo "FALLO: $f"; done
```
Expected: sin líneas `FALLO`.

- [ ] **Step 6: Commit**

```bash
git add zoho-payment-tracker/backend/src/baia-kristal/routes/opportunities.js zoho-payment-tracker/backend/src/baia-kristal/routes/inventario.js zoho-payment-tracker/backend/src/baia-kristal/routes/stats.js zoho-payment-tracker/backend/src/baia-kristal/routes/configuracionesFrentes.js
git commit -m "feat(auth): gating por módulo en opportunities, inventario, stats y frentes"
```

---

### Task 10: Gating de `negocios.js`

**Files:**
- Modify: `zoho-payment-tracker/backend/src/baia-kristal/routes/negocios.js`

**Interfaces:**
- Consumes: `requireModulo` de `../../middleware/auth` (Tarea 3).

Mapeo verificado (`getAllNegocioMovimientos`/`getAllNegocioMovimientosExport` alimentan la página "Movimientos", **no** "Negocios" — es la corrección más importante de este mapeo respecto al spec original):

| Sub-ruta | Módulo | Página que lo usa |
|---|---|---|
| `/backfill`, `/backfill/status`, `/`, `/stats`, `/:id`, `/:id/movimientos` | `negocios` | `Negocios.jsx` |
| `/movimientos`, `/movimientos/export` | `movimientos` | `FiduciaMovimientos.jsx`, `FiduciaPropietario.jsx` |
| `/dashboard-recaudo` | `['dashboard', 'resumen']` | `ReportePlanRecaudo.jsx` y `Resumen.jsx` |
| `/cartera-mora`, `/:negocioId/flags` | `cartera-mora` | `CarteraMora.jsx` |
| `/resumen-etapas/meses`, `/resumen-etapas` | `resumen` | `Resumen.jsx` |

- [ ] **Step 1: Agregar el import**

Después de la línea 18 (`} = require('../services/dashboardRecaudoService');`), antes de `const router = express.Router();`:

```js
const { requireModulo } = require('../../middleware/auth');
```

- [ ] **Step 2: Editar cada ruta**

```js
router.post('/backfill', (req, res) => {
```
→
```js
router.post('/backfill', requireModulo('negocios'), (req, res) => {
```

```js
router.get('/backfill/status', (req, res) => {
```
→
```js
router.get('/backfill/status', requireModulo('negocios'), (req, res) => {
```

```js
router.get('/', async (req, res) => {
```
→
```js
router.get('/', requireModulo('negocios'), async (req, res) => {
```

```js
router.get('/movimientos', async (req, res) => {
```
→
```js
router.get('/movimientos', requireModulo('movimientos'), async (req, res) => {
```

```js
router.get('/movimientos/export', async (req, res) => {
```
→
```js
router.get('/movimientos/export', requireModulo('movimientos'), async (req, res) => {
```

```js
router.get('/stats', async (_req, res) => {
```
→
```js
router.get('/stats', requireModulo('negocios'), async (_req, res) => {
```

```js
router.get('/dashboard-recaudo', async (req, res) => {
```
→
```js
router.get('/dashboard-recaudo', requireModulo(['dashboard', 'resumen']), async (req, res) => {
```

```js
router.get('/cartera-mora', async (req, res) => {
```
→
```js
router.get('/cartera-mora', requireModulo('cartera-mora'), async (req, res) => {
```

```js
router.patch('/:negocioId/flags', async (req, res) => {
```
→
```js
router.patch('/:negocioId/flags', requireModulo('cartera-mora'), async (req, res) => {
```

```js
router.get('/resumen-etapas/meses', async (req, res) => {
```
→
```js
router.get('/resumen-etapas/meses', requireModulo('resumen'), async (req, res) => {
```

```js
router.get('/resumen-etapas', async (req, res) => {
```
→
```js
router.get('/resumen-etapas', requireModulo('resumen'), async (req, res) => {
```

```js
router.get('/:id', async (req, res) => {
```
→
```js
router.get('/:id', requireModulo('negocios'), async (req, res) => {
```

```js
router.get('/:id/movimientos', async (req, res) => {
```
→
```js
router.get('/:id/movimientos', requireModulo('negocios'), async (req, res) => {
```

- [ ] **Step 3: Verificar sintaxis**

```bash
cd "zoho-payment-tracker/backend" && node --check src/baia-kristal/routes/negocios.js
```
Expected: sin salida.

- [ ] **Step 4: Commit**

```bash
git add zoho-payment-tracker/backend/src/baia-kristal/routes/negocios.js
git commit -m "feat(auth): gating por módulo en negocios.js (incluye separar movimientos)"
```

---

### Task 11: Gating de `fiducia.js`

**Files:**
- Modify: `zoho-payment-tracker/backend/src/baia-kristal/routes/fiducia.js`

**Interfaces:**
- Consumes: `requireModulo` de `../../middleware/auth` (Tarea 3).

Mapeo verificado: `GET /encargos` lo consume tanto `FiduciaModule.jsx` (módulo `encargos`) como el KPI de "Encargos activos" en `Dashboard.jsx` (módulo `oportunidades`). El resto de sub-rutas de este archivo son `encargos` (incluye `/movimientos` y `/propietarios`, que hoy no llama ningún componente del frontend — quedan gateadas igual que el resto por consistencia).

- [ ] **Step 1: Agregar el import**

Después de la línea 5 (`const { runBackfill } = require('./negocios');`), antes de `const router = express.Router();`:

```js
const { requireModulo } = require('../../middleware/auth');
```

- [ ] **Step 2: Editar cada ruta**

```js
router.post('/upload', upload.single('archivo'), async (req, res) => {
```
→
```js
router.post('/upload', requireModulo('encargos'), upload.single('archivo'), async (req, res) => {
```

```js
router.get('/encargos', async (req, res) => {
```
→
```js
router.get('/encargos', requireModulo(['encargos', 'oportunidades']), async (req, res) => {
```

```js
router.get('/encargos/:id', async (req, res) => {
```
→
```js
router.get('/encargos/:id', requireModulo('encargos'), async (req, res) => {
```

```js
router.get('/encargos/:id/hojas/:hojaId', async (req, res) => {
```
→
```js
router.get('/encargos/:id/hojas/:hojaId', requireModulo('encargos'), async (req, res) => {
```

Las dos rutas `router.patch('/encargos/:id', async (req, res) => {` (líneas 146 y 173, duplicadas en el archivo original) — reemplazar **ambas** ocurrencias por:
```js
router.patch('/encargos/:id', requireModulo('encargos'), async (req, res) => {
```
(usar reemplazo de todas las ocurrencias, ya que el texto es idéntico en las dos).

```js
router.delete('/encargos/:id', async (req, res) => {
```
→
```js
router.delete('/encargos/:id', requireModulo('encargos'), async (req, res) => {
```

```js
router.get('/movimientos', async (req, res) => {
```
→
```js
router.get('/movimientos', requireModulo('encargos'), async (req, res) => {
```

```js
router.get('/propietarios', async (req, res) => {
```
→
```js
router.get('/propietarios', requireModulo('encargos'), async (req, res) => {
```

```js
router.get('/encargos/:id/nomenclaturas', async (req, res) => {
```
→
```js
router.get('/encargos/:id/nomenclaturas', requireModulo('encargos'), async (req, res) => {
```

```js
router.get('/encargos/:id/negocio/:referencia', async (req, res) => {
```
→
```js
router.get('/encargos/:id/negocio/:referencia', requireModulo('encargos'), async (req, res) => {
```

- [ ] **Step 3: Verificar sintaxis**

```bash
cd "zoho-payment-tracker/backend" && node --check src/baia-kristal/routes/fiducia.js
```
Expected: sin salida.

- [ ] **Step 4: Verificación end-to-end del enforcement completo**

Reiniciar el backend. Con el usuario admin (Tarea 5) logueado, confirmar que sigue viendo todo:

```bash
cd "zoho-payment-tracker/backend" && node -e "
(async () => {
  const login = await fetch('http://localhost:3001/api/auth/login', {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: process.env.ADMIN_EMAIL, password: process.env.ADMIN_PASSWORD }),
  });
  const cookie = login.headers.get('set-cookie');
  const rutas = ['/api/negocios', '/api/negocios/cartera-mora', '/api/negocios/dashboard-recaudo', '/api/fiducia/encargos', '/api/opportunities'];
  for (const r of rutas) {
    const res = await fetch('http://localhost:3001' + r, { headers: { Cookie: cookie } });
    console.log(r, res.status);
  }
})();
"
```
Expected: todas `200` (el admin pasa todo).

Ahora crear un usuario de prueba SIN el módulo `cartera-mora` (usando Prisma directo, ya que la ruta de creación de usuarios se prueba en la Tarea 7 pero el flujo completo de admin UI llega hasta la Tarea 18):

```bash
cd "zoho-payment-tracker/backend" && node -e "
const bcrypt = require('bcryptjs');
const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();
(async () => {
  const passwordHash = await bcrypt.hash('prueba123', 10);
  await prisma.usuario.upsert({
    where: { email: 'prueba@aed.com.co' },
    update: { passwordHash, modulosPermitidos: ['negocios'] },
    create: { email: 'prueba@aed.com.co', nombre: 'Prueba', passwordHash, modulosPermitidos: ['negocios'] },
  });
  console.log('usuario de prueba listo');
})();
"
```

```bash
cd "zoho-payment-tracker/backend" && node -e "
(async () => {
  const login = await fetch('http://localhost:3001/api/auth/login', {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: 'prueba@aed.com.co', password: 'prueba123' }),
  });
  const cookie = login.headers.get('set-cookie');
  const okNegocios = await fetch('http://localhost:3001/api/negocios', { headers: { Cookie: cookie } });
  const bloqCartera = await fetch('http://localhost:3001/api/negocios/cartera-mora', { headers: { Cookie: cookie } });
  console.log('negocios:', okNegocios.status, '(esperado 200)');
  console.log('cartera-mora:', bloqCartera.status, '(esperado 403)');
})();
"
```
Expected: `negocios: 200`, `cartera-mora: 403`.

Borrar el usuario de prueba al terminar:
```bash
cd "zoho-payment-tracker/backend" && node -e "
const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();
prisma.usuario.delete({ where: { email: 'prueba@aed.com.co' } }).then(() => console.log('borrado'));
"
```

- [ ] **Step 5: Commit**

```bash
git add zoho-payment-tracker/backend/src/baia-kristal/routes/fiducia.js
git commit -m "feat(auth): gating por módulo en fiducia.js"
```

---

### Task 12: `navItems.js` — campo `proyecto` y export de claves por proyecto

**Files:**
- Modify: `zoho-payment-tracker/frontend/src/config/navItems.js`

**Interfaces:**
- Produces: `MODULOS_ALEGRA` (array de las 8 keys de Alegra, derivado de `NAV_ITEMS_ALEGRA`) — consumido por `App.jsx` (Tarea 16) para el `modulo` prop de la ruta comodín `/alegra/*`. `NAV_ITEMS_BAIA_KRISTAL`/`NAV_ITEMS_ALEGRA` mantienen su forma actual (sin campo nuevo) — el Sidebar (Tarea 17) ya las agrupa por proyecto usando las dos listas por separado, así que no hace falta un campo `proyecto` adicional por ítem.

- [ ] **Step 1: Reescribir el archivo completo**

```js
import { Target, Landmark, Banknote, Briefcase, BarChart3, Building2, LineChart, ShieldAlert } from 'lucide-react';

// Ítems del menú lateral, separados por proyecto. El Sidebar filtra ambas
// listas por los permisos del usuario logueado (ver utils/usuarioActual.js)
// y las agrupa visualmente por proyecto -- ya no hay un selector manual de
// "proyecto activo": lo que se ve depende exclusivamente de qué módulos
// tenga permitidos esa persona (ver Ajustes → Usuarios y permisos).
// `key` es el identificador que también usa el backend para el enforcement
// por módulo (ver backend/src/config/modulos.js -- debe mantenerse igual).
//
// Un solo acento (Harbor Teal, el color real de marca) para todo el menú --
// antes cada módulo tenía su propio color "arcoíris" (rosa, violeta, ámbar…)
// que no salía de la paleta documentada y se sentía poco sobrio en un
// sidebar ancho con etiquetas de texto visibles. La etiqueta ya distingue
// cuál módulo es cuál; el color solo comunica "activo", no identidad.
const BRAND_ACCENT = '#0e7581';

// Elección de íconos -- cada uno representa literalmente el contenido del
// módulo, no una metáfora genérica de dashboard:
//   Oportunidades → Target (pipeline de ventas de Zoho, no un dashboard cualquiera)
//   Inmuebles     → Building2 (son inmuebles/apartamentos, no cajas de bodega)
//   Encargos      → Landmark (encargos FIDUCIARIOS -- institución financiera/trust)
//   Movimientos   → Banknote (movimientos bancarios/de dinero, más financiero que unas flechas genéricas)
//   Dashboard     → LineChart (la página es literalmente Plan vs. Recaudo en el tiempo)
//   Cartera       → ShieldAlert (cartera en gestión/mora -- "atención, vigilar", sin ser un ícono de error crudo)
export const NAV_ITEMS_BAIA_KRISTAL = [
  { key: 'negocios',      to: '/',                    Icon: Briefcase,      label: 'Negocios',      color: BRAND_ACCENT, exact: true },
  { key: 'oportunidades', to: '/oportunidades',       Icon: Target,         label: 'Oportunidades', color: BRAND_ACCENT, exact: true },
  { key: 'inventario',    to: '/inventario',          Icon: Building2,      label: 'Inmuebles',     color: BRAND_ACCENT, exact: true },
  { key: 'encargos',      to: '/fiducia',             Icon: Landmark,       label: 'Encargos',      color: BRAND_ACCENT },
  { key: 'movimientos',   to: '/fiducia/movimientos', Icon: Banknote,       label: 'Movimientos',   color: BRAND_ACCENT },
  { key: 'resumen',       to: '/resumen',             Icon: BarChart3,      label: 'Resumen',       color: BRAND_ACCENT, exact: true },
  { key: 'dashboard',     to: '/dashboard',           Icon: LineChart,      label: 'Dashboard',     color: BRAND_ACCENT, exact: true },
  { key: 'cartera-mora',  to: '/cartera-mora',        Icon: ShieldAlert,    label: 'Cartera',       color: BRAND_ACCENT, exact: true },
];

// Alegra -- tendrá los mismos módulos que Baía Kristal (mismo menú, mismos
// íconos/labels), pero todavía no hay modelo de datos ni parser de Excel
// propio: cada ítem apunta por ahora a una subruta de la misma página
// placeholder (`/alegra/*` en App.jsx), lista para reemplazarse una por una
// sin tener que tocar este menú otra vez cuando se construya cada módulo.
export const NAV_ITEMS_ALEGRA = [
  { key: 'alegra-negocios',      to: '/alegra',                    Icon: Briefcase,   label: 'Negocios',      color: BRAND_ACCENT, exact: true },
  { key: 'alegra-oportunidades', to: '/alegra/oportunidades',       Icon: Target,      label: 'Oportunidades', color: BRAND_ACCENT, exact: true },
  { key: 'alegra-inventario',    to: '/alegra/inventario',          Icon: Building2,   label: 'Inmuebles',     color: BRAND_ACCENT, exact: true },
  { key: 'alegra-encargos',      to: '/alegra/fiducia',             Icon: Landmark,    label: 'Encargos',      color: BRAND_ACCENT },
  { key: 'alegra-movimientos',   to: '/alegra/fiducia/movimientos', Icon: Banknote,    label: 'Movimientos',   color: BRAND_ACCENT },
  { key: 'alegra-resumen',       to: '/alegra/resumen',             Icon: BarChart3,   label: 'Resumen',       color: BRAND_ACCENT, exact: true },
  { key: 'alegra-dashboard',     to: '/alegra/dashboard',           Icon: LineChart,   label: 'Dashboard',     color: BRAND_ACCENT, exact: true },
  { key: 'alegra-cartera-mora',  to: '/alegra/cartera-mora',        Icon: ShieldAlert, label: 'Cartera',       color: BRAND_ACCENT, exact: true },
];

// Lista combinada -- la usa el formulario de usuarios en Ajustes para listar
// los checkboxes de módulos de ambos proyectos en un solo lugar.
export const NAV_ITEMS = [...NAV_ITEMS_BAIA_KRISTAL, ...NAV_ITEMS_ALEGRA];

// Claves de Alegra -- las usa App.jsx para la ruta comodín `/alegra/*`
// (todos sus ítems today apuntan al mismo placeholder, así que basta con
// tener acceso a CUALQUIERA de ellas para entrar).
export const MODULOS_ALEGRA = NAV_ITEMS_ALEGRA.map((item) => item.key);
```

- [ ] **Step 2: Verificar sintaxis**

```bash
cd "zoho-payment-tracker/frontend" && node -e "
const esbuild = require('esbuild');
esbuild.buildSync({ entryPoints: ['src/config/navItems.js'], bundle: false, write: false, loader: { '.js': 'jsx' } });
console.log('OK');
"
```
Expected: `OK`

- [ ] **Step 3: Commit**

```bash
git add zoho-payment-tracker/frontend/src/config/navItems.js
git commit -m "feat(auth): agrega campo proyecto y MODULOS_ALEGRA a navItems"
```

---

### Task 13: `utils/api.js` — login por correo, endpoints de usuarios, retiro del menú global

**Files:**
- Modify: `zoho-payment-tracker/frontend/src/utils/api.js`
- Delete: `zoho-payment-tracker/frontend/src/utils/navPrefs.js`
- Delete: `zoho-payment-tracker/frontend/src/utils/proyectoActivo.js`

**Interfaces:**
- Produces: `login(email, password)`, `listarUsuarios()`, `crearUsuario(payload)`, `editarUsuario(id, payload)`, `obtenerAuditoriaUsuarios()` — consumidos por `Login.jsx` (Tarea 15) y `Ajustes.jsx` (Tarea 18).

- [ ] **Step 1: Actualizar `login`**

Reemplazar:

```js
export async function login(password) {
  const { data } = await api.post('/auth/login', { password });
  return data;
}
```

por:

```js
export async function login(email, password) {
  const { data } = await api.post('/auth/login', { email, password });
  return data;
}
```

- [ ] **Step 2: Quitar los wrappers del menú global retirado**

Eliminar:

```js
// Ítems del sidebar ocultos -- global para todos (ver navPrefs.js)
export async function getMenuOculto() {
  const { data } = await api.get('/configuraciones/menu');
  return data;
}

export async function actualizarMenuOculto(hidden) {
  const { data } = await api.put('/configuraciones/menu', { hidden });
  return data;
}

```
(dejar `getConfiguracionesFrentes` y las funciones `actualizarFechaEntrega*` intactas, no se tocan).

- [ ] **Step 3: Agregar los wrappers de usuarios**

Al final del archivo, después de `actualizarFechaEntregaProyecto`:

```js

// ── Usuarios y permisos (admin) ───────────────────────────
export async function listarUsuarios() {
  const { data } = await api.get('/usuarios');
  return data;
}

export async function crearUsuario(payload) {
  const { data } = await api.post('/usuarios', payload);
  return data;
}

export async function editarUsuario(id, payload) {
  const { data } = await api.patch(`/usuarios/${id}`, payload);
  return data;
}

export async function obtenerAuditoriaUsuarios() {
  const { data } = await api.get('/usuarios/auditoria');
  return data;
}
```

- [ ] **Step 4: Borrar los archivos retirados**

```bash
rm "zoho-payment-tracker/frontend/src/utils/navPrefs.js"
rm "zoho-payment-tracker/frontend/src/utils/proyectoActivo.js"
```

- [ ] **Step 5: Verificar sintaxis**

```bash
cd "zoho-payment-tracker/frontend" && node -e "
const esbuild = require('esbuild');
esbuild.buildSync({ entryPoints: ['src/utils/api.js'], bundle: false, write: false, loader: { '.js': 'jsx' } });
console.log('OK');
"
```
Expected: `OK`

- [ ] **Step 6: Commit**

```bash
git add zoho-payment-tracker/frontend/src/utils/api.js
git rm zoho-payment-tracker/frontend/src/utils/navPrefs.js zoho-payment-tracker/frontend/src/utils/proyectoActivo.js
git commit -m "feat(auth): login por correo y endpoints de usuarios en api.js"
```

---

### Task 14: `utils/usuarioActual.js` — hook de identidad compartida

**Files:**
- Create: `zoho-payment-tracker/frontend/src/utils/usuarioActual.js`

**Interfaces:**
- Consumes: `checkAuth` de `./api` (Tarea 13).
- Produces: `cargarUsuarioActual()` (promesa, puebla el caché), `limpiarUsuarioActual()`, `useUsuarioActual()` → `{ usuario }` — consumidos por `App.jsx` (Tarea 16), `Sidebar.jsx` (Tarea 17), `RutaProtegida.jsx` (Tarea 16), `Ajustes.jsx` (Tarea 18, indirectamente vía `RutaProtegida`).

- [ ] **Step 1: Crear el archivo**

```js
import { useState, useEffect } from 'react';
import { checkAuth } from './api';

// Identidad + permisos del usuario logueado. Mismo patrón de caché + evento
// que tenía navPrefs.js para el menú oculto: una sola llamada a
// GET /api/auth/check compartida entre todos los componentes montados a la
// vez (Sidebar, rutas protegidas, Ajustes), en vez de que cada uno la pida
// por su cuenta. App.jsx la dispara una vez al validar la sesión al arrancar
// (cargarUsuarioActual); mientras esté en caché, useUsuarioActual la lee de
// inmediato sin volver a pedirla al servidor.

const EVENT = 'aed-usuario-changed';
let cache = null; // { id, email, nombre, esAdmin, modulosPermitidos } | null

function persistir(usuario) {
  cache = usuario;
  window.dispatchEvent(new Event(EVENT));
}

export async function cargarUsuarioActual() {
  const usuario = await checkAuth();
  persistir(usuario);
  return usuario;
}

export function limpiarUsuarioActual() {
  persistir(null);
}

export function useUsuarioActual() {
  const [usuario, setUsuario] = useState(cache);

  useEffect(() => {
    const handler = () => setUsuario(cache);
    window.addEventListener(EVENT, handler);
    if (cache === null) {
      cargarUsuarioActual().catch(() => {});
    }
    return () => window.removeEventListener(EVENT, handler);
  }, []);

  return { usuario };
}
```

- [ ] **Step 2: Verificar sintaxis**

```bash
cd "zoho-payment-tracker/frontend" && node -e "
const esbuild = require('esbuild');
esbuild.buildSync({ entryPoints: ['src/utils/usuarioActual.js'], bundle: false, write: false, loader: { '.js': 'jsx' } });
console.log('OK');
"
```
Expected: `OK`

- [ ] **Step 3: Commit**

```bash
git add zoho-payment-tracker/frontend/src/utils/usuarioActual.js
git commit -m "feat(auth): hook useUsuarioActual con caché compartida"
```

---

### Task 15: `Login.jsx` — correo + contraseña

**Files:**
- Modify: `zoho-payment-tracker/frontend/src/pages/Login.jsx` (reescritura completa)

**Interfaces:**
- Consumes: `login(email, password)` de `../utils/api` (Tarea 13).

- [ ] **Step 1: Reescribir el archivo completo**

```jsx
import { useState } from 'react';
import { login } from '../utils/api';
import logoBaiaKristal from '../assets/baia-kristal-logo.png';

export default function Login({ onSuccess }) {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState(null);
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError(null);
    setLoading(true);
    try {
      await login(email, password);
      onSuccess();
    } catch (err) {
      setError(err.response?.data?.error || 'No se pudo iniciar sesión');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="flex items-center justify-center h-screen bg-aed-base">
      <form onSubmit={handleSubmit} className="card w-full max-w-[340px] p-6 flex flex-col gap-4">
        <div className="flex flex-col items-center gap-2 mb-1">
          <img src={logoBaiaKristal} alt="Baía Kristal" className="w-24 h-auto" />
          <h1 className="font-heading text-[17px] font-bold text-ink">Cartera AED</h1>
          <p className="text-[13px] text-slate-500">Ingresa con tu cuenta</p>
        </div>

        <input
          type="email"
          autoFocus
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          placeholder="Correo"
          className="input text-[14px] h-10"
        />

        <input
          type="password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          placeholder="Contraseña"
          className="input text-[14px] h-10"
        />

        {error && <p className="text-[13px] text-red-600 -mt-1">{error}</p>}

        <button type="submit" disabled={loading || !email || !password} className="btn-primary text-[14px] h-10 justify-center disabled:opacity-60">
          {loading ? 'Ingresando…' : 'Ingresar'}
        </button>
      </form>
    </div>
  );
}
```

- [ ] **Step 2: Verificar sintaxis**

```bash
cd "zoho-payment-tracker/frontend" && node -e "
const esbuild = require('esbuild');
esbuild.buildSync({ entryPoints: ['src/pages/Login.jsx'], bundle: false, write: false, loader: { '.jsx': 'jsx' } });
console.log('OK');
"
```
Expected: `OK`

- [ ] **Step 3: Commit**

```bash
git add zoho-payment-tracker/frontend/src/pages/Login.jsx
git commit -m "feat(auth): formulario de login con correo y contraseña"
```

(La verificación visual del login completo, ya con `App.jsx`/`RutaProtegida` en su lugar, se hace en la Tarea 16.)

---

### Task 16: `RutaProtegida.jsx` + wiring de `App.jsx`

**Files:**
- Create: `zoho-payment-tracker/frontend/src/components/RutaProtegida.jsx`
- Modify: `zoho-payment-tracker/frontend/src/App.jsx` (reescritura completa)

**Interfaces:**
- Consumes: `useUsuarioActual`, `cargarUsuarioActual`, `limpiarUsuarioActual` (Tarea 14); `MODULOS_ALEGRA` (Tarea 12).
- Produces: `<RutaProtegida modulo="clave"|["c1","c2"]>` y `<RutaProtegida soloAdmin>` — envuelven cada `<Route>`.

- [ ] **Step 1: Crear `RutaProtegida.jsx`**

```jsx
import { useUsuarioActual } from '../utils/usuarioActual';

// Envuelve una página protegida por módulo (o por ser admin). `usuario` ya
// está garantizado no-nulo cuando esto se monta -- App.jsx solo renderiza
// <Routes> después de que cargarUsuarioActual() resolvió con éxito -- pero
// se maneja el caso nulo de todas formas por seguridad defensiva.
export default function RutaProtegida({ modulo, soloAdmin = false, children }) {
  const { usuario } = useUsuarioActual();
  if (!usuario) return null;

  const claves = modulo == null ? [] : (Array.isArray(modulo) ? modulo : [modulo]);
  const permitido = usuario.esAdmin || (!soloAdmin && claves.some((c) => usuario.modulosPermitidos.includes(c)));

  if (!permitido) {
    return (
      <div className="flex flex-col items-center justify-center h-screen gap-2 text-center bg-aed-base px-6">
        <p className="text-[16px] font-semibold text-slate-800">No tienes permiso para ver esta sección</p>
        <p className="text-[13px] text-slate-500">Pídele a un administrador que te dé acceso a este módulo.</p>
      </div>
    );
  }

  return children;
}
```

- [ ] **Step 2: Reescribir `App.jsx` completo**

```jsx
import React, { useState, useEffect } from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import Sidebar from './components/Sidebar';
import RutaProtegida from './components/RutaProtegida';
import Login from './pages/Login';
import Negocios from './pages/Negocios';
import Inventario from './pages/Inventario';
import Dashboard from './pages/Dashboard';
import ReportePlanRecaudo from './pages/ReportePlanRecaudo';
import CarteraMora from './pages/CarteraMora';
import OpportunityDetail from './pages/OpportunityDetail';
import FiduciaModule from './pages/FiduciaModule';
import FiduciaDetalle from './pages/FiduciaDetalle';
import FiduciaMovimientos from './pages/FiduciaMovimientos';
import FiduciaPropietario from './pages/FiduciaPropietario';
import EncargoNomenclaturas from './pages/EncargoNomenclaturas';
import ApartamentoDetalle from './pages/ApartamentoDetalle';
import Resumen from './pages/Resumen';
import Ajustes from './pages/Ajustes';
import Alegra from './pages/Alegra';
import { MODULOS_ALEGRA } from './config/navItems';
import { cargarUsuarioActual, limpiarUsuarioActual } from './utils/usuarioActual';

export default function App() {
  const [authed, setAuthed] = useState(null); // null = verificando

  useEffect(() => {
    cargarUsuarioActual()
      .then(() => setAuthed(true))
      .catch(() => setAuthed(false));
  }, []);

  if (authed === null) return null;
  if (!authed) return <Login onSuccess={() => setAuthed(true)} />;

  return (
    <BrowserRouter>
      <div className="flex h-screen overflow-hidden">
        <Sidebar onLogout={() => { limpiarUsuarioActual(); setAuthed(false); }} />
        <div className="flex-1 overflow-y-auto">
          <Routes>
            <Route path="/" element={<RutaProtegida modulo="negocios"><Negocios /></RutaProtegida>} />
            <Route path="/inventario" element={<RutaProtegida modulo="inventario"><Inventario /></RutaProtegida>} />
            <Route path="/oportunidades" element={<RutaProtegida modulo="oportunidades"><Dashboard /></RutaProtegida>} />
            <Route path="/dashboard" element={<RutaProtegida modulo="dashboard"><ReportePlanRecaudo /></RutaProtegida>} />
            <Route path="/cartera-mora" element={<RutaProtegida modulo="cartera-mora"><CarteraMora /></RutaProtegida>} />
            <Route path="/opportunity/:id" element={<RutaProtegida modulo="oportunidades"><OpportunityDetail /></RutaProtegida>} />
            <Route path="/fiducia" element={<RutaProtegida modulo="encargos"><FiduciaModule /></RutaProtegida>} />
            <Route path="/fiducia/movimientos" element={<RutaProtegida modulo="movimientos"><FiduciaMovimientos /></RutaProtegida>} />
            <Route path="/fiducia/propietario/:nombre" element={<RutaProtegida modulo="movimientos"><FiduciaPropietario /></RutaProtegida>} />
            <Route path="/fiducia/:id/nomenclaturas" element={<RutaProtegida modulo="encargos"><EncargoNomenclaturas /></RutaProtegida>} />
            <Route path="/fiducia/:id/apartamento/:referencia" element={<RutaProtegida modulo="encargos"><ApartamentoDetalle /></RutaProtegida>} />
            <Route path="/fiducia/:id" element={<RutaProtegida modulo="encargos"><FiduciaDetalle /></RutaProtegida>} />
            <Route path="/resumen" element={<RutaProtegida modulo="resumen"><Resumen /></RutaProtegida>} />
            <Route path="/ajustes" element={<RutaProtegida soloAdmin><Ajustes /></RutaProtegida>} />
            <Route path="/alegra/*" element={<RutaProtegida modulo={MODULOS_ALEGRA}><Alegra /></RutaProtegida>} />
            <Route path="*" element={<Navigate to="/" replace />} />
          </Routes>
        </div>
      </div>
    </BrowserRouter>
  );
}
```

Nota: `/fiducia/propietario/:nombre` (`FiduciaPropietario.jsx`) se gatea como `movimientos` porque esa página solo llama `getAllNegocioMovimientos` (`/negocios/movimientos`, ya gateado como `movimientos` en la Tarea 10) — no usa nada de `fiducia.js`.

- [ ] **Step 3: Verificar sintaxis**

```bash
cd "zoho-payment-tracker/frontend" && for f in src/components/RutaProtegida.jsx src/App.jsx; do
node -e "
const esbuild = require('esbuild');
esbuild.buildSync({ entryPoints: ['$f'], bundle: false, write: false, loader: { '.jsx': 'jsx' } });
console.log('OK $f');
"
done
```
Expected: `OK` para ambos archivos.

- [ ] **Step 4: Commit**

```bash
git add zoho-payment-tracker/frontend/src/components/RutaProtegida.jsx zoho-payment-tracker/frontend/src/App.jsx
git commit -m "feat(auth): protege cada ruta por módulo con RutaProtegida"
```

(Verificación visual completa en la Tarea 17, una vez el Sidebar también esté actualizado — antes de eso la app no compila porque Sidebar todavía importa los hooks retirados en la Tarea 13.)

---

### Task 17: `Sidebar.jsx` — sin selector de proyecto, agrupado por permisos

**Files:**
- Modify: `zoho-payment-tracker/frontend/src/components/Sidebar.jsx` (reescritura completa)

**Interfaces:**
- Consumes: `useUsuarioActual` (Tarea 14) para leer la identidad; `NAV_ITEMS_BAIA_KRISTAL`, `NAV_ITEMS_ALEGRA` (Tarea 12). El logout en sí (`limpiarUsuarioActual`) ya lo maneja el `onLogout` que pasa `App.jsx` (Tarea 16) — Sidebar solo dispara `logout()` (la llamada a la API) y notifica al padre vía `onLogout?.()`.

- [ ] **Step 1: Reescribir el archivo completo**

```jsx
import React, { useState, useRef } from 'react';
import { createPortal } from 'react-dom';
import { NavLink, useLocation } from 'react-router-dom';
import { Settings, LogOut, ChevronLeft, ChevronRight, Layers } from 'lucide-react';
import { NAV_ITEMS_BAIA_KRISTAL, NAV_ITEMS_ALEGRA } from '../config/navItems';
import { useUsuarioActual } from '../utils/usuarioActual';
import { logout } from '../utils/api';
import logoBaiaKristal from '../assets/baia-kristal-logo.png';
import logoAlegra from '../assets/alegra-logo.svg';

const COLAPSADO_KEY = 'aed.sidebarColapsado';

// Colapsado por defecto (icon-only, w-[60px]) -- el usuario lo expande a
// demanda con el botón de arriba; la preferencia queda en localStorage para
// no tener que re-expandirlo cada vez que recarga.
function leerColapsado() {
  try {
    const v = localStorage.getItem(COLAPSADO_KEY);
    return v === null ? true : v === 'true';
  } catch {
    return true;
  }
}

function iniciales(nombre) {
  if (!nombre) return '';
  return nombre.trim().split(/\s+/).slice(0, 2).map((p) => p[0].toUpperCase()).join('');
}

// Envuelve cualquier ítem del sidebar con un tooltip propio (mismo estilo que
// HelpTip: fondo `ink`, texto blanco, sombra elevada) que aparece a la derecha
// del ícono cuando el sidebar está colapsado -- reemplaza el `title` nativo
// del navegador, que se ve plano y con retraso/estilo inconsistente entre
// sistemas operativos. Va en un portal a `document.body` con posición fija
// para no recortarse contra el `overflow-hidden` del layout general (App.jsx).
function ConTooltip({ label, activo, className = '', children }) {
  const ref = useRef(null);
  const [pos, setPos] = useState(null);

  if (!activo) return <div className={className}>{children}</div>;

  const show = () => {
    const el = ref.current;
    if (!el) return;
    const r = el.getBoundingClientRect();
    setPos({ top: r.top + r.height / 2, left: r.right + 10 });
  };
  const hide = () => setPos(null);

  return (
    <div ref={ref} className={className} onMouseEnter={show} onMouseLeave={hide}>
      {children}
      {pos &&
        createPortal(
          <div
            style={{ position: 'fixed', top: pos.top, left: pos.left, transform: 'translateY(-50%)', zIndex: 60 }}
            className="pointer-events-none whitespace-nowrap rounded-md bg-ink px-2.5 py-1.5 text-[13px] font-medium text-white shadow-[var(--shadow-overlay)]"
          >
            {label}
          </div>,
          document.body,
        )}
    </div>
  );
}

// Fila de navegación icono (+ etiqueta si el sidebar está expandido). Inactivo
// usa slate-600/900 (con buen contraste) -- activo usa el color de acento de
// marca vía estilo inline (fondo tenue 10% + texto en el color completo).
function SidebarItem({ to, Icon, label, color, exact, colapsado }) {
  const location = useLocation();
  const isActive = exact
    ? location.pathname === to
    : location.pathname.startsWith(to) &&
      !(to === '/fiducia' && location.pathname === '/fiducia/movimientos');

  return (
    <ConTooltip label={label} activo={colapsado} className="relative w-full group">
      {isActive && (
        <span
          className="absolute left-0 top-1 bottom-1 w-[3px] rounded-r"
          style={{ backgroundColor: color }}
        />
      )}
      <NavLink
        to={to}
        className={`flex items-center h-11 rounded-[10px] transition-colors ${
          colapsado ? 'justify-center px-0' : 'gap-3 px-3.5'
        } ${isActive ? '' : 'text-slate-600 hover:text-slate-900 hover:bg-slate-50'}`}
        style={isActive ? { backgroundColor: `${color}1a`, color } : undefined}
      >
        <Icon
          size={19}
          strokeWidth={1.9}
          className="flex-shrink-0 transition-transform group-hover:scale-110"
        />
        {!colapsado && (
          <span className="text-[14px] font-medium leading-none whitespace-nowrap overflow-hidden text-ellipsis">
            {label}
          </span>
        )}
      </NavLink>
    </ConTooltip>
  );
}

// Rótulo pequeño arriba de cada grupo de módulos (uno por proyecto) cuando el
// sidebar está expandido -- el logo de Alegra es un SVG ancho (ícono +
// wordmark); se recorta a un cuadrado mostrando solo el ícono, igual que en
// la cabecera colapsada que tenía antes el selector de proyecto, para que
// ambos rótulos se vean del mismo tamaño sin importar la composición
// original de cada logo.
function EtiquetaProyecto({ proyecto }) {
  const alegra = proyecto === 'alegra';
  return (
    <div className="flex items-center gap-1.5 px-3.5 pt-2.5 pb-1">
      <div className="w-3.5 h-3.5 rounded-sm overflow-hidden flex items-center flex-shrink-0">
        <img
          src={alegra ? logoAlegra : logoBaiaKristal}
          alt=""
          className={alegra ? 'h-3.5 w-auto max-w-none object-contain' : 'w-full h-full object-contain'}
        />
      </div>
      <span className="text-[10.5px] font-semibold text-slate-400 uppercase tracking-wide">
        {alegra ? 'Alegra' : 'Baía Kristal'}
      </span>
    </div>
  );
}

export default function Sidebar({ onLogout }) {
  const { usuario } = useUsuarioActual();
  const [colapsado, setColapsado] = useState(leerColapsado);

  const puedeVer = (item) => !!usuario && (usuario.esAdmin || usuario.modulosPermitidos.includes(item.key));
  const itemsBaiaKristal = NAV_ITEMS_BAIA_KRISTAL.filter(puedeVer);
  const itemsAlegra = NAV_ITEMS_ALEGRA.filter(puedeVer);

  const toggleColapsado = () => {
    setColapsado((prev) => {
      const next = !prev;
      try { localStorage.setItem(COLAPSADO_KEY, String(next)); } catch { /* noop */ }
      return next;
    });
  };

  const handleLogout = async () => {
    try {
      await logout();
    } finally {
      onLogout?.();
    }
  };

  return (
    <aside
      className={`${colapsado ? 'w-[60px]' : 'w-[212px]'} bg-white border-r border-aed-border flex flex-col py-4 px-2.5 gap-1 flex-shrink-0 h-screen sticky top-0 transition-[width] duration-200`}
    >
      <div className={`flex items-center mb-1 flex-shrink-0 ${colapsado ? 'justify-center' : 'justify-between px-1.5'}`}>
        <div className="flex items-center gap-2.5 min-w-0">
          <div
            className="w-8 h-8 rounded-[10px] flex items-center justify-center flex-shrink-0"
            style={{ backgroundColor: 'var(--brand-tint)', color: 'var(--brand-strong)' }}
            title="Cartera AED"
          >
            <Layers size={18} strokeWidth={2} />
          </div>
          {!colapsado && (
            <span className="font-heading text-[14px] font-bold text-ink leading-tight whitespace-nowrap">
              Cartera AED
            </span>
          )}
        </div>
        {!colapsado && (
          <button
            onClick={toggleColapsado}
            title="Colapsar menú"
            aria-label="Colapsar menú"
            className="w-6 h-6 flex items-center justify-center rounded-md text-slate-500 hover:bg-slate-100 hover:text-slate-900 transition-colors flex-shrink-0"
          >
            <ChevronLeft size={15} />
          </button>
        )}
      </div>

      {colapsado && (
        <button
          onClick={toggleColapsado}
          title="Expandir menú"
          aria-label="Expandir menú"
          className="w-full h-7 mb-2 flex items-center justify-center rounded-md text-slate-500 hover:bg-slate-100 hover:text-slate-900 transition-colors flex-shrink-0"
        >
          <ChevronRight size={15} />
        </button>
      )}

      {itemsBaiaKristal.length > 0 && (
        <div className="flex flex-col gap-1">
          {!colapsado && <EtiquetaProyecto proyecto="baia-kristal" />}
          {itemsBaiaKristal.map((item) => (
            <SidebarItem key={item.key} {...item} colapsado={colapsado} />
          ))}
        </div>
      )}

      {itemsAlegra.length > 0 && (
        <div className="flex flex-col gap-1">
          {itemsBaiaKristal.length > 0 && <div className="h-px bg-slate-200 my-1 mx-1.5" />}
          {!colapsado && <EtiquetaProyecto proyecto="alegra" />}
          {itemsAlegra.map((item) => (
            <SidebarItem key={item.key} {...item} colapsado={colapsado} />
          ))}
        </div>
      )}

      <div className="h-px bg-slate-200 my-1.5 mx-1.5" />

      {usuario?.esAdmin && (
        <ConTooltip label="Ajustes" activo={colapsado} className="relative w-full group">
          <NavLink
            to="/ajustes"
            className={({ isActive }) =>
              `flex items-center h-11 rounded-[10px] transition-colors ${colapsado ? 'justify-center px-0' : 'gap-3 px-3.5'} ${
                isActive
                  ? 'bg-slate-100 text-slate-900'
                  : 'text-slate-600 hover:bg-slate-100 hover:text-slate-900'
              }`
            }
          >
            <Settings size={19} strokeWidth={1.9} className="flex-shrink-0 transition-transform group-hover:scale-110" />
            {!colapsado && <span className="text-[14px] font-medium leading-none">Ajustes</span>}
          </NavLink>
        </ConTooltip>
      )}

      <div className={`mt-auto flex items-center pt-2 ${colapsado ? 'flex-col gap-2' : 'gap-2.5 px-1.5'}`}>
        <div
          className="w-8 h-8 rounded-full bg-gradient-to-br from-brand-soft to-emerald-100 flex items-center justify-center text-[13px] font-bold text-brand-strong flex-shrink-0"
          title={colapsado ? usuario?.nombre : undefined}
        >
          {iniciales(usuario?.nombre)}
        </div>
        <ConTooltip label="Cerrar sesión" activo={colapsado} className={colapsado ? '' : 'flex-1 min-w-0'}>
          <button
            onClick={handleLogout}
            aria-label="Cerrar sesión"
            className="flex items-center gap-1.5 text-slate-500 hover:text-slate-900 transition-colors w-full"
          >
            <LogOut size={15} strokeWidth={1.9} className="flex-shrink-0" />
            {!colapsado && <span className="text-[13px] font-medium truncate">Cerrar sesión</span>}
          </button>
        </ConTooltip>
      </div>
    </aside>
  );
}
```

- [ ] **Step 2: Verificar sintaxis**

```bash
cd "zoho-payment-tracker/frontend" && node -e "
const esbuild = require('esbuild');
esbuild.buildSync({ entryPoints: ['src/components/Sidebar.jsx'], bundle: false, write: false, loader: { '.jsx': 'jsx' } });
console.log('OK');
"
```
Expected: `OK`

- [ ] **Step 3: Verificación visual end-to-end (login + sidebar por permisos)**

Con backend y frontend corriendo, y el usuario admin de la Tarea 5 ya creado, escribir un script de Playwright temporal en el scratchpad (login con el admin, screenshot del sidebar completo con ambos proyectos visibles), y otro con el usuario de prueba de la Tarea 11 recreado con `modulosPermitidos: ['negocios', 'movimientos']` (login, screenshot confirmando que el sidebar solo muestra esos dos ítems y no muestra el link de "Ajustes"). Borrar los scripts y screenshots del scratchpad al terminar.

- [ ] **Step 4: Commit**

```bash
git add zoho-payment-tracker/frontend/src/components/Sidebar.jsx
git commit -m "feat(auth): sidebar sin selector de proyecto, agrupado por permisos del usuario"
```

---

### Task 18: `Ajustes.jsx` — Usuarios y permisos + Historial de cambios

**Files:**
- Modify: `zoho-payment-tracker/frontend/src/pages/Ajustes.jsx` (reescritura completa)

**Interfaces:**
- Consumes: `listarUsuarios, crearUsuario, editarUsuario, obtenerAuditoriaUsuarios` (Tarea 13); `NAV_ITEMS_BAIA_KRISTAL, NAV_ITEMS_ALEGRA` (Tarea 12). Ya no consume `useHiddenNav`, `useProyectoActivo`, `PROYECTOS` (retirados).

Toda la página ya está protegida como `soloAdmin` desde `App.jsx` (Tarea 16), así que sus componentes no necesitan volver a chequear `esAdmin`.

- [ ] **Step 1: Reescribir el archivo completo**

```jsx
import React, { useState, useEffect, useCallback, useRef } from 'react';
import ExcelJS from 'exceljs';
import {
  Settings, RefreshCw, Check, ChevronDown, Building2, Building, Rows3,
  CalendarClock, Lock, XCircle, Search, ChevronsUpDown, ChevronsDownUp,
  FileSearch, Download, AlertTriangle, Users,
} from 'lucide-react';
import { NAV_ITEMS_BAIA_KRISTAL, NAV_ITEMS_ALEGRA } from '../config/navItems';
import {
  triggerSubformsBackfill, getSubformsBackfillStatus, getInconsistenciasProjectCode,
  getConfiguracionesFrentes, actualizarFechaEntregaProyecto, actualizarFechaEntregaTorre, actualizarFechaEntregaPiso,
  listarUsuarios, crearUsuario, editarUsuario, obtenerAuditoriaUsuarios,
} from '../utils/api';

const MODULOS_POR_PROYECTO = [
  { proyecto: 'Baía Kristal', items: NAV_ITEMS_BAIA_KRISTAL },
  { proyecto: 'Alegra', items: NAV_ITEMS_ALEGRA },
];

function formatDuracion(segundos) {
  if (segundos == null) return null;
  if (segundos < 60) return `${segundos}s`;
  const min = Math.floor(segundos / 60);
  const seg = segundos % 60;
  return `${min} min${seg > 0 ? ` ${seg}s` : ''}`;
}

// Pill de estado con los colores de dominio de index.css (un color = un
// significado) -- evita reintroducir tonos de Tailwind sueltos por toda la
// página.
const BADGE_TONES = {
  success: { color: 'var(--success-text)', backgroundColor: 'var(--success-bg)', borderColor: 'var(--success-border)' },
  neutral: { color: 'var(--neutral-text)', backgroundColor: 'var(--neutral-bg)', borderColor: 'var(--neutral-border)' },
  warning: { color: 'var(--warning-text)', backgroundColor: 'var(--warning-bg)', borderColor: 'var(--warning-border)' },
};

function Badge({ tone = 'neutral', icon: Icon, children }) {
  return (
    <span
      className="badge text-[11.5px] px-2 py-0.5 leading-none whitespace-nowrap flex-shrink-0"
      style={BADGE_TONES[tone]}
    >
      {Icon && <Icon size={11} />}
      {children}
    </span>
  );
}

function SubformsBackfillCard() {
  const [status, setStatus] = useState(null);
  const [triggering, setTriggering] = useState(false);
  const pollRef = useRef(null);

  const stopPolling = useCallback(() => {
    if (pollRef.current) {
      clearInterval(pollRef.current);
      pollRef.current = null;
    }
  }, []);

  const startPolling = useCallback(() => {
    stopPolling();
    pollRef.current = setInterval(async () => {
      try {
        const res = await getSubformsBackfillStatus();
        setStatus(res);
        if (!res.running) stopPolling();
      } catch {
        // seguir intentando en el próximo tick
      }
    }, 2000);
  }, [stopPolling]);

  useEffect(() => {
    getSubformsBackfillStatus()
      .then((res) => {
        setStatus(res);
        if (res.running) startPolling();
      })
      .catch(() => {});
    return stopPolling;
  }, [startPolling, stopPolling]);

  const handleTrigger = async () => {
    setTriggering(true);
    try {
      await triggerSubformsBackfill();
      startPolling();
    } catch (err) {
      console.error('Error al iniciar el backfill:', err);
    } finally {
      setTriggering(false);
    }
  };

  const running = status?.running;
  const result = status?.result;
  const enCurso = running && result?.running;

  return (
    <div className="card overflow-hidden">
      <div className="px-4 py-3 border-b border-aed-border">
        <h2 className="text-[15px] font-semibold text-slate-800">Plan de pagos desde Zoho</h2>
        <p className="text-[13px] text-slate-500 mt-0.5">
          Trae el plan de pagos (Forma de Pago / Propuesta de Pago) de Zoho para las oportunidades
          que todavía no lo tengan guardado — necesario para que el Dashboard de plan vs. recaudo
          muestre datos completos. Es seguro correrlo varias veces: solo procesa lo pendiente.
        </p>
      </div>

      <div className="px-4 py-3.5 flex flex-col gap-3">
        <button
          onClick={handleTrigger}
          disabled={triggering || enCurso}
          className="btn-secondary self-start px-3 py-1.5 text-[14px] flex items-center gap-1.5 disabled:opacity-50"
        >
          <RefreshCw size={13} className={enCurso ? 'animate-spin' : ''} />
          {enCurso ? 'Sincronizando…' : 'Sincronizar planes de pago'}
        </button>

        {enCurso && (
          <div className="flex flex-col gap-1.5">
            <div className="w-full h-2 rounded-full bg-aed-base overflow-hidden">
              <div
                className="h-full rounded-full transition-all duration-500"
                style={{ width: `${result.porcentaje}%`, backgroundColor: 'var(--brand)' }}
              />
            </div>
            <p className="text-[13px] text-slate-500">
              {result.porcentaje}% · {result.procesadas} de {result.total} oportunidades
              {result.segundosRestantesEstimados != null && (
                <> · faltan ~{formatDuracion(result.segundosRestantesEstimados)}</>
              )}
              {result.errores > 0 && <span style={{ color: 'var(--warning-text)' }}> · {result.errores} errores</span>}
            </p>
          </div>
        )}

        {!enCurso && result?.ok === true && (
          <div className="flex items-center gap-1.5 text-[13px]" style={{ color: 'var(--success-text)' }}>
            <Check size={14} className="flex-shrink-0" />
            <span>
              Listo: {result.actualizadas} de {result.total} oportunidades actualizadas en {result.elapsed}
              {result.errores > 0 && <span style={{ color: 'var(--warning-text)' }}> ({result.errores} errores)</span>}
            </span>
          </div>
        )}

        {!enCurso && result?.ok === false && (
          <div className="flex items-center gap-1.5 text-[13px]" style={{ color: 'var(--danger-text)' }}>
            <XCircle size={14} className="flex-shrink-0" />
            <span>Error: {result.error}</span>
          </div>
        )}
      </div>
    </div>
  );
}

// Reporte on-demand: inmuebles cuyo Project_Code de Zoho no le pertenece
// (fue copiado de otro apartamento del mismo frente) -- problema de datos
// en Zoho, no del sync. Este botón solo lo detecta y lo deja descargar en
// Excel para pasárselo a quien administra Zoho; no corrige nada acá.
function ProjectCodeReportCard() {
  const [reporte, setReporte] = useState(null);
  const [cargando, setCargando] = useState(false);
  const [error, setError] = useState(null);

  const handleVerificar = async () => {
    setCargando(true);
    setError(null);
    try {
      const res = await getInconsistenciasProjectCode();
      setReporte(res);
    } catch (err) {
      setError(err.response?.data?.error || err.message);
    } finally {
      setCargando(false);
    }
  };

  const handleDescargar = async () => {
    if (!reporte) return;
    const wb = new ExcelJS.Workbook();
    const ws = wb.addWorksheet('Project Code inconsistentes');
    ws.columns = [
      { header: 'Frente', key: 'frente', width: 16 },
      { header: 'Torre', key: 'torre', width: 8 },
      { header: 'Unidad (Product Name)', key: 'productName', width: 20 },
      { header: 'Project Code actual (incorrecto)', key: 'projectCodeActual', width: 30 },
      { header: 'Estado del inmueble', key: 'estado', width: 16 },
      { header: 'Referencia de recaudo', key: 'referenciaRecaudo', width: 18 },
      { header: 'Zoho ID', key: 'zohoId', width: 22 },
    ];
    ws.getRow(1).font = { bold: true };
    for (const inc of reporte.inconsistencias) {
      ws.addRow({
        frente: inc.frente ?? '',
        torre: inc.torre ?? '',
        productName: inc.productName,
        projectCodeActual: inc.projectCodeActual,
        estado: inc.estado ?? '',
        referenciaRecaudo: inc.referenciaRecaudo ?? '',
        zohoId: inc.zohoId,
      });
    }
    const buffer = await wb.xlsx.writeBuffer();
    const blob = new Blob([buffer], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `project-code-inconsistentes-${new Date().toISOString().slice(0, 10)}.xlsx`;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="card overflow-hidden">
      <div className="px-4 py-3 border-b border-aed-border">
        <h2 className="text-[15px] font-semibold text-slate-800">Project Code inconsistentes</h2>
        <p className="text-[13px] text-slate-500 mt-0.5">
          Detecta inmuebles cuyo Project_Code de Zoho no coincide con su propia unidad -- señal de que
          fue copiado por error de otro apartamento del mismo frente. Es un problema de datos en Zoho,
          no de la sincronización: este reporte solo lo detecta para que se corrija en el origen.
        </p>
      </div>

      <div className="px-4 py-3.5 flex flex-col gap-3">
        <button
          onClick={handleVerificar}
          disabled={cargando}
          className="btn-secondary self-start px-3 py-1.5 text-[14px] flex items-center gap-1.5 disabled:opacity-50"
        >
          <FileSearch size={14} className={cargando ? 'animate-pulse' : ''} />
          {cargando ? 'Verificando…' : 'Verificar Project Code'}
        </button>

        {error && (
          <div className="flex items-center gap-1.5 text-[13px]" style={{ color: 'var(--danger-text)' }}>
            <XCircle size={14} className="flex-shrink-0" />
            <span>Error: {error}</span>
          </div>
        )}

        {reporte && reporte.total === 0 && (
          <div className="flex items-center gap-1.5 text-[13px]" style={{ color: 'var(--success-text)' }}>
            <Check size={14} className="flex-shrink-0" />
            <span>Sin inconsistencias -- todos los Project_Code coinciden con su propia unidad.</span>
          </div>
        )}

        {reporte && reporte.total > 0 && (
          <div className="flex flex-col gap-2.5">
            <div className="flex items-center gap-1.5 text-[13px]" style={{ color: 'var(--warning-text)' }}>
              <AlertTriangle size={14} className="flex-shrink-0" />
              <span>{reporte.total} inmuebles con Project_Code copiado de otra unidad.</span>
            </div>

            <div className="flex flex-col gap-1 max-h-40 overflow-y-auto pr-1">
              {reporte.porTorre.map((t) => (
                <div key={t.torre} className="flex items-center justify-between text-[13px] px-2 py-1 rounded bg-aed-base">
                  <span className="text-slate-600">{t.torre}</span>
                  <Badge tone="warning">{t.count}</Badge>
                </div>
              ))}
            </div>

            <button
              onClick={handleDescargar}
              className="btn-secondary self-start px-3 py-1.5 text-[14px] flex items-center gap-1.5"
            >
              <Download size={13} /> Descargar Excel
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

// Fecha en formato yyyy-mm-dd para el <input type="date">, sin líos de
// timezone (la fecha viene en UTC medianoche desde el backend).
function toInputDate(iso) {
  if (!iso) return '';
  return String(iso).slice(0, 10);
}

// Fila genérica de fecha configurable, usada para "todo el proyecto", "toda
// la torre" o un piso puntual. `bloqueada` la deshabilita porque un nivel
// distinto (proyecto/torre/piso) ya tiene una fecha configurada -- los tres
// son mutuamente excluyentes entre sí, hay que borrar uno para usar otro.
// `indent` controla la sangría visual según la profundidad (0 = proyecto,
// 1 = torre, 2 = piso); el borde izquierdo se enciende en verde cuando esta
// fila específica tiene una fecha activa, para que resalte entre docenas de
// filas vacías sin tener que leer cada una.
function FilaFecha({ Icon, etiqueta, subtitulo, fechaEntrega, bloqueada, motivoBloqueo, onGuardar, indent = 0 }) {
  const [valor, setValor] = useState(toInputDate(fechaEntrega));
  const [saving, setSaving] = useState(false);
  const [guardado, setGuardado] = useState(false);
  const [error, setError] = useState(null);
  const dirty = valor !== toInputDate(fechaEntrega);
  const configurada = !!fechaEntrega;

  useEffect(() => {
    setValor(toInputDate(fechaEntrega));
  }, [fechaEntrega]);

  const handleGuardar = async () => {
    setSaving(true);
    setGuardado(false);
    setError(null);
    try {
      await onGuardar(valor || null);
      setGuardado(true);
      setTimeout(() => setGuardado(false), 2000);
    } catch (err) {
      setError(err.response?.data?.error || err.message);
    } finally {
      setSaving(false);
    }
  };

  const marginNota = Icon ? '23.5px' : 0;

  return (
    <div
      className="py-2.5 pr-4 border-l-[3px] transition-colors"
      style={{ paddingLeft: `${16 + indent * 20}px`, borderLeftColor: configurada ? 'var(--success-border)' : 'transparent' }}
    >
      <div className="flex items-center gap-2.5">
        {Icon && (
          <Icon size={15} strokeWidth={2} className={`flex-shrink-0 ${configurada ? 'text-emerald-600' : 'text-slate-300'}`} />
        )}
        <div className="flex-1 min-w-0">
          <p className="text-[14px] font-medium text-slate-800">{etiqueta}</p>
          <p className="text-[13px] text-slate-500">{subtitulo}</p>
        </div>
        <input
          type="date"
          value={valor}
          onChange={(e) => setValor(e.target.value)}
          disabled={bloqueada}
          className="input text-[14px] h-8 py-0 w-40 disabled:opacity-40 disabled:cursor-not-allowed"
        />
        <button
          onClick={handleGuardar}
          disabled={bloqueada || saving || !dirty}
          className="btn-secondary px-2.5 py-1.5 text-[13px] flex items-center gap-1 disabled:opacity-40 disabled:cursor-not-allowed"
        >
          {guardado ? <Check size={13} style={{ color: 'var(--success-text)' }} /> : <RefreshCw size={13} className={saving ? 'animate-spin' : ''} />}
          {guardado ? 'Guardado' : 'Guardar'}
        </button>
      </div>
      {bloqueada && (
        <p className="text-[12px] mt-1.5 flex items-center gap-1" style={{ color: 'var(--warning-text)', marginLeft: marginNota }}>
          <Lock size={11} className="flex-shrink-0" /> {motivoBloqueo}
        </p>
      )}
      {error && (
        <p className="text-[12px] mt-1 flex items-center gap-1" style={{ color: 'var(--danger-text)', marginLeft: marginNota }}>
          <XCircle size={11} className="flex-shrink-0" /> {error}
        </p>
      )}
    </div>
  );
}

function GrupoTorre({ frente, torre, torreWide, pisos, expandido, onToggle, onGuardadoTorre, onGuardadoPiso }) {
  const configuradas = pisos.filter((p) => p.fechaEntrega).length;
  const torreConfigurada = !!torreWide.fechaEntrega;

  return (
    <div>
      <button
        onClick={onToggle}
        className="w-full flex items-center gap-2 py-2 pr-4 hover:bg-aed-base transition-colors text-left"
        style={{ paddingLeft: '20px' }}
      >
        <ChevronDown
          size={13}
          className={`text-slate-400 transition-transform flex-shrink-0 ${expandido ? '' : '-rotate-90'}`}
        />
        <Building size={14} className="text-slate-400 flex-shrink-0" />
        <span className="text-[14px] font-medium text-slate-700 flex-1">Torre {torre}</span>
        {torreConfigurada ? (
          <Badge tone="success" icon={CalendarClock}>Toda la torre</Badge>
        ) : configuradas > 0 ? (
          <Badge tone="success">{configuradas}/{pisos.length} pisos</Badge>
        ) : (
          <Badge tone="neutral">{pisos.length > 0 ? `${pisos.length} pisos` : 'Sin pisos'}</Badge>
        )}
      </button>
      {expandido && (
        <div className="border-t border-aed-border">
          <FilaFecha
            Icon={Building}
            indent={1}
            etiqueta="Toda la torre"
            subtitulo={torreWide.fechaEntrega ? 'Fecha configurada para todos los pisos' : 'Sin configurar — usa la fecha inferida del plan'}
            fechaEntrega={torreWide.fechaEntrega}
            bloqueada={configuradas > 0}
            motivoBloqueo="Ya hay fechas configuradas por piso — bórralas para usar una fecha única para esta torre."
            onGuardar={(fecha) => onGuardadoTorre(frente, torre, fecha)}
          />
          {pisos.length > 0 && (
            <div className="divide-y divide-aed-border border-t border-aed-border">
              {pisos.map((p) => (
                <FilaFecha
                  key={`${p.frente}-${p.torre}-${p.piso}`}
                  Icon={Rows3}
                  indent={2}
                  etiqueta={`Piso ${p.piso}`}
                  subtitulo={p.fechaEntrega ? 'Fecha configurada' : 'Sin configurar — usa la fecha inferida del plan'}
                  fechaEntrega={p.fechaEntrega}
                  bloqueada={torreConfigurada}
                  motivoBloqueo="Toda la torre usa una fecha única (arriba) — bórrala para configurar este piso por separado."
                  onGuardar={(fecha) => onGuardadoPiso(frente, torre, p.piso, fecha)}
                />
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function GrupoFrente({
  frente, proyecto, torres, expandido, onToggle,
  torresExpandidas, onToggleTorre, onGuardadoTorre, onGuardadoProyecto, onGuardadoPiso,
}) {
  const torresConFecha = [...torres.values()].filter(
    (t) => t.torreWide.fechaEntrega || t.pisos.some((p) => p.fechaEntrega)
  ).length;
  const proyectoConfigurado = !!proyecto.fechaEntrega;

  return (
    <div>
      <button
        onClick={onToggle}
        className="w-full flex items-center gap-2.5 px-4 py-3 hover:bg-aed-base transition-colors text-left"
      >
        <ChevronDown
          size={14}
          className={`text-slate-400 transition-transform flex-shrink-0 ${expandido ? '' : '-rotate-90'}`}
        />
        <span
          className="w-7 h-7 rounded-lg flex items-center justify-center flex-shrink-0"
          style={{ backgroundColor: 'var(--brand-tint)', color: 'var(--brand-strong)' }}
        >
          <Building2 size={14} strokeWidth={2} />
        </span>
        <span className="text-[14px] font-semibold text-slate-800 flex-1">{frente}</span>
        {proyectoConfigurado ? (
          <Badge tone="success" icon={CalendarClock}>Todo el proyecto</Badge>
        ) : torresConFecha > 0 ? (
          <Badge tone="success">{torresConFecha}/{torres.size} torres</Badge>
        ) : (
          <Badge tone="neutral">Sin configurar</Badge>
        )}
      </button>
      {expandido && (
        <div className="border-t border-aed-border">
          <FilaFecha
            Icon={Building2}
            indent={0}
            etiqueta="Todo el proyecto"
            subtitulo={proyecto.fechaEntrega ? 'Fecha configurada para todas las torres' : 'Sin configurar — usa la fecha inferida del plan'}
            fechaEntrega={proyecto.fechaEntrega}
            bloqueada={torresConFecha > 0}
            motivoBloqueo="Ya hay fechas configuradas por torre o por piso — bórralas para usar una fecha única aquí."
            onGuardar={(fecha) => onGuardadoProyecto(frente, fecha)}
          />
          <div className="divide-y divide-aed-border border-t border-aed-border">
            {[...torres.entries()].map(([torre, grupoTorre]) => (
              <GrupoTorre
                key={`${frente}-${torre}`}
                frente={frente}
                torre={torre}
                torreWide={grupoTorre.torreWide}
                pisos={grupoTorre.pisos}
                expandido={torresExpandidas.has(`${frente}||${torre}`)}
                onToggle={() => onToggleTorre(frente, torre)}
                onGuardadoTorre={onGuardadoTorre}
                onGuardadoPiso={onGuardadoPiso}
              />
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

function SkeletonFrentes() {
  return (
    <div className="divide-y divide-aed-border">
      {[96, 130, 110].map((w, i) => (
        <div key={i} className="flex items-center gap-2.5 px-4 py-3 animate-pulse">
          <div className="w-3.5 h-3.5 rounded bg-slate-200" />
          <div className="w-7 h-7 rounded-lg bg-slate-200" />
          <div className="h-3.5 rounded bg-slate-200" style={{ width: `${w}px` }} />
          <div className="flex-1" />
          <div className="h-5 w-20 rounded-full bg-slate-200" />
        </div>
      ))}
    </div>
  );
}

function FechaEntregaFrenteCard() {
  const [configs, setConfigs] = useState(null);
  const [error, setError] = useState(null);
  const [expandidos, setExpandidos] = useState(new Set());
  const [torresExpandidas, setTorresExpandidas] = useState(new Set());
  const [busqueda, setBusqueda] = useState('');

  useEffect(() => {
    getConfiguracionesFrentes()
      .then((res) => {
        setConfigs(res.data);
        const conFecha = new Set();
        const torresConFecha = new Set();
        for (const c of res.data) {
          if (!c.fechaEntrega) continue;
          conFecha.add(c.frente);
          if (c.torre !== null) torresConFecha.add(`${c.frente}||${c.torre}`);
        }
        setExpandidos(conFecha);
        setTorresExpandidas(torresConFecha);
      })
      .catch((err) => setError(err.message));
  }, []);

  const handleGuardadoProyecto = async (frente, fecha) => {
    const actualizado = await actualizarFechaEntregaProyecto(frente, fecha);
    setConfigs((prev) => prev.map((c) => (c.frente === frente && c.torre === null ? { ...c, fechaEntrega: actualizado.fechaEntrega } : c)));
  };

  const handleGuardadoTorre = async (frente, torre, fecha) => {
    const actualizado = await actualizarFechaEntregaTorre(frente, torre, fecha);
    setConfigs((prev) => prev.map((c) => (c.frente === frente && c.torre === torre && c.piso === null ? { ...c, fechaEntrega: actualizado.fechaEntrega } : c)));
  };

  const handleGuardadoPiso = async (frente, torre, piso, fecha) => {
    const actualizado = await actualizarFechaEntregaPiso(frente, torre, piso, fecha);
    setConfigs((prev) => prev.map((c) => (c.frente === frente && c.torre === torre && c.piso === piso ? { ...c, fechaEntrega: actualizado.fechaEntrega } : c)));
  };

  const toggleFrente = (frente) => {
    setExpandidos((prev) => {
      const next = new Set(prev);
      if (next.has(frente)) next.delete(frente);
      else next.add(frente);
      return next;
    });
  };

  const toggleTorre = (frente, torre) => {
    const key = `${frente}||${torre}`;
    setTorresExpandidas((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  };

  const porFrente = configs?.reduce((acc, c) => {
    if (!acc.has(c.frente)) acc.set(c.frente, { proyecto: null, torres: new Map() });
    const grupo = acc.get(c.frente);
    if (c.torre === null) {
      grupo.proyecto = c;
      return acc;
    }
    if (!grupo.torres.has(c.torre)) grupo.torres.set(c.torre, { torreWide: null, pisos: [] });
    const grupoTorre = grupo.torres.get(c.torre);
    if (c.piso === null) grupoTorre.torreWide = c;
    else grupoTorre.pisos.push(c);
    return acc;
  }, new Map());

  const frentesFiltrados = porFrente
    ? [...porFrente.entries()].filter(([frente]) => frente.toLowerCase().includes(busqueda.toLowerCase()))
    : [];

  const totalConfigurados = configs?.filter((c) => c.fechaEntrega).length ?? 0;

  const expandirTodo = () => {
    if (!porFrente) return;
    setExpandidos(new Set(porFrente.keys()));
    const todasTorres = new Set();
    for (const [frente, grupo] of porFrente) {
      for (const torre of grupo.torres.keys()) todasTorres.add(`${frente}||${torre}`);
    }
    setTorresExpandidas(todasTorres);
  };

  const colapsarTodo = () => {
    setExpandidos(new Set());
    setTorresExpandidas(new Set());
  };

  return (
    <div className="card overflow-hidden">
      <div className="px-4 py-3 border-b border-aed-border">
        <div className="flex items-start justify-between gap-3">
          <div>
            <h2 className="text-[15px] font-semibold text-slate-800">Fecha de entrega por Frente, Torre y Piso</h2>
            <p className="text-[13px] text-slate-500 mt-0.5 max-w-2xl">
              Reemplaza la fecha estimada de la cuota "Saldo Contraentrega" (que por defecto se infiere
              a partir de las cuotas anteriores) por la fecha real de entrega cuando se conozca. Se puede
              configurar una fecha única para todo el proyecto, para una torre completa, o para un piso
              específico — solo un nivel a la vez para cada torre. Afecta la conciliación de todos los
              negocios correspondientes, tanto en el detalle de cada negocio como en el Dashboard y
              Cartera en Gestión.
            </p>
          </div>
          {totalConfigurados > 0 && (
            <Badge tone="success" icon={CalendarClock}>{totalConfigurados} configuradas</Badge>
          )}
        </div>

        {configs && configs.length > 0 && (
          <div className="flex items-center gap-2 mt-3">
            <div className="relative flex-1 max-w-[220px]">
              <Search size={13} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none" />
              <input
                type="text"
                value={busqueda}
                onChange={(e) => setBusqueda(e.target.value)}
                placeholder="Buscar frente…"
                className="input h-8 py-0 pl-8 text-[13px]"
              />
            </div>
            <button onClick={expandirTodo} className="btn-secondary px-2.5 py-1.5 text-[12.5px] flex items-center gap-1">
              <ChevronsUpDown size={12} /> Expandir todo
            </button>
            <button onClick={colapsarTodo} className="btn-secondary px-2.5 py-1.5 text-[12.5px] flex items-center gap-1">
              <ChevronsDownUp size={12} /> Colapsar todo
            </button>
          </div>
        )}
      </div>

      {error && <p className="px-4 py-3 text-[13px] text-red-500">Error: {error}</p>}

      {!error && !configs && <SkeletonFrentes />}

      {porFrente && frentesFiltrados.length === 0 && (
        <p className="px-4 py-6 text-[14px] text-slate-400 text-center">
          Ningún frente coincide con "{busqueda}".
        </p>
      )}

      {porFrente && frentesFiltrados.length > 0 && (
        <div className="divide-y divide-aed-border">
          {frentesFiltrados.map(([frente, grupo]) => (
            <GrupoFrente
              key={frente}
              frente={frente}
              proyecto={grupo.proyecto}
              torres={grupo.torres}
              expandido={expandidos.has(frente)}
              onToggle={() => toggleFrente(frente)}
              torresExpandidas={torresExpandidas}
              onToggleTorre={toggleTorre}
              onGuardadoTorre={handleGuardadoTorre}
              onGuardadoProyecto={handleGuardadoProyecto}
              onGuardadoPiso={handleGuardadoPiso}
            />
          ))}
        </div>
      )}
    </div>
  );
}

function Seccion({ title, icon: Icon, color, children }) {
  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-center gap-2 px-1">
        {Icon && (
          <span
            className="w-5 h-5 rounded flex items-center justify-center flex-shrink-0"
            style={{ backgroundColor: `${color}1a`, color }}
          >
            <Icon size={12} strokeWidth={2.5} />
          </span>
        )}
        <h2 className="text-[12px] font-semibold text-slate-500 uppercase tracking-wide">{title}</h2>
      </div>
      <div className="flex flex-col gap-4">{children}</div>
    </div>
  );
}

// Formulario de alta/edición de usuario. En edición no se piden correo/nombre
// (no son editables acá) y la contraseña es opcional (solo se cambia si se
// escribe algo). Los checkboxes de módulos se ocultan si es admin, porque
// ese caso ya da acceso a todo -- no tiene sentido marcarlos uno por uno.
function FormularioUsuario({ usuario, onGuardado, onCancelar }) {
  const esEdicion = !!usuario;
  const [email, setEmail] = useState(usuario?.email ?? '');
  const [nombre, setNombre] = useState(usuario?.nombre ?? '');
  const [password, setPassword] = useState('');
  const [esAdmin, setEsAdmin] = useState(usuario?.esAdmin ?? false);
  const [modulos, setModulos] = useState(new Set(usuario?.modulosPermitidos ?? []));
  const [guardando, setGuardando] = useState(false);
  const [error, setError] = useState(null);

  const toggleModulo = (key) => {
    setModulos((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError(null);
    setGuardando(true);
    try {
      if (esEdicion) {
        const payload = { modulosPermitidos: [...modulos], esAdmin };
        if (password) payload.password = password;
        await editarUsuario(usuario.id, payload);
      } else {
        await crearUsuario({ email, nombre, password, esAdmin, modulosPermitidos: [...modulos] });
      }
      onGuardado();
    } catch (err) {
      setError(err.response?.data?.error || err.message);
    } finally {
      setGuardando(false);
    }
  };

  return (
    <form onSubmit={handleSubmit} className="px-4 py-3.5 flex flex-col gap-3 border-t border-aed-border bg-aed-base">
      {!esEdicion && (
        <>
          <input
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="Correo"
            required
            className="input text-[14px] h-9"
          />
          <input
            type="text"
            value={nombre}
            onChange={(e) => setNombre(e.target.value)}
            placeholder="Nombre"
            required
            className="input text-[14px] h-9"
          />
        </>
      )}
      <input
        type="password"
        value={password}
        onChange={(e) => setPassword(e.target.value)}
        placeholder={esEdicion ? 'Nueva contraseña (opcional)' : 'Contraseña inicial'}
        required={!esEdicion}
        className="input text-[14px] h-9"
      />

      <label className="flex items-center gap-2 text-[13px] text-slate-700">
        <input type="checkbox" checked={esAdmin} onChange={(e) => setEsAdmin(e.target.checked)} />
        Administrador (acceso total + gestión de usuarios)
      </label>

      {!esAdmin && (
        <div className="flex flex-col gap-2 max-h-56 overflow-y-auto border border-aed-border rounded-lg p-2.5 bg-white">
          {MODULOS_POR_PROYECTO.map(({ proyecto, items }) => (
            <div key={proyecto}>
              <p className="text-[11px] font-semibold text-slate-400 uppercase tracking-wide mb-1">{proyecto}</p>
              {items.map((item) => (
                <label key={item.key} className="flex items-center gap-2 text-[13px] text-slate-700 py-0.5">
                  <input type="checkbox" checked={modulos.has(item.key)} onChange={() => toggleModulo(item.key)} />
                  {item.label}
                </label>
              ))}
            </div>
          ))}
        </div>
      )}

      {error && <p className="text-[13px] text-red-600">{error}</p>}

      <div className="flex items-center gap-2">
        <button type="submit" disabled={guardando} className="btn-primary px-3 py-1.5 text-[14px] disabled:opacity-60">
          {guardando ? 'Guardando…' : 'Guardar'}
        </button>
        <button type="button" onClick={onCancelar} className="btn-secondary px-3 py-1.5 text-[14px]">
          Cancelar
        </button>
      </div>
    </form>
  );
}

function UsuariosCard() {
  const [usuarios, setUsuarios] = useState(null);
  const [error, setError] = useState(null);
  const [creando, setCreando] = useState(false);
  const [editandoId, setEditandoId] = useState(null);

  const cargar = () => {
    listarUsuarios().then(setUsuarios).catch((err) => setError(err.message));
  };

  useEffect(cargar, []);

  const handleGuardado = () => {
    setCreando(false);
    setEditandoId(null);
    cargar();
  };

  return (
    <div className="card overflow-hidden">
      <div className="px-4 py-3 border-b border-aed-border flex items-center justify-between gap-3">
        <div>
          <h2 className="text-[15px] font-semibold text-slate-800">Usuarios y permisos</h2>
          <p className="text-[13px] text-slate-500 mt-0.5">
            Cada usuario ve solo los módulos que tenga permitidos acá, sin importar de qué
            proyecto sean. Administrador da acceso total, incluida esta pantalla.
          </p>
        </div>
        {!creando && (
          <button onClick={() => setCreando(true)} className="btn-secondary self-start px-3 py-1.5 text-[13px] flex-shrink-0">
            Nuevo usuario
          </button>
        )}
      </div>

      {creando && <FormularioUsuario onGuardado={handleGuardado} onCancelar={() => setCreando(false)} />}

      {error && <p className="px-4 py-3 text-[13px] text-red-500">Error: {error}</p>}

      {usuarios && (
        <div className="divide-y divide-aed-border">
          {usuarios.map((u) => (
            <div key={u.id}>
              <div className="flex items-center gap-3 px-4 py-3">
                <div className="flex-1 min-w-0">
                  <p className="text-[14px] font-medium text-slate-800 flex items-center gap-1.5 flex-wrap">
                    {u.nombre}
                    {u.esAdmin && <Badge tone="success">Admin</Badge>}
                    {!u.activo && <Badge tone="neutral">Inactivo</Badge>}
                  </p>
                  <p className="text-[13px] text-slate-500">
                    {u.email} · {u.esAdmin ? 'acceso total' : `${u.modulosPermitidos.length} módulo(s)`}
                  </p>
                </div>
                <button
                  onClick={() => setEditandoId(editandoId === u.id ? null : u.id)}
                  className="btn-secondary px-2.5 py-1.5 text-[13px] flex-shrink-0"
                >
                  {editandoId === u.id ? 'Cerrar' : 'Editar'}
                </button>
              </div>
              {editandoId === u.id && (
                <FormularioUsuario usuario={u} onGuardado={handleGuardado} onCancelar={() => setEditandoId(null)} />
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function describirAccionAuditoria(r) {
  switch (r.accion) {
    case 'crear': return 'creó la cuenta';
    case 'activar': return 'la activó';
    case 'desactivar': return 'la desactivó';
    case 'admin-on': return 'le dio permisos de administrador';
    case 'admin-off': return 'le quitó permisos de administrador';
    case 'reset-password': return 'le restableció la contraseña';
    case 'modulos': {
      const antes = new Set(r.detalle?.antes ?? []);
      const despues = new Set(r.detalle?.despues ?? []);
      const agregados = [...despues].filter((m) => !antes.has(m));
      const quitados = [...antes].filter((m) => !despues.has(m));
      const partes = [];
      if (agregados.length) partes.push(`agregó ${agregados.join(', ')}`);
      if (quitados.length) partes.push(`quitó ${quitados.join(', ')}`);
      return partes.length ? partes.join(' · ') : 'actualizó los módulos';
    }
    default: return r.accion;
  }
}

function AuditoriaCard() {
  const [registros, setRegistros] = useState(null);
  const [error, setError] = useState(null);

  useEffect(() => {
    obtenerAuditoriaUsuarios().then(setRegistros).catch((err) => setError(err.message));
  }, []);

  return (
    <div className="card overflow-hidden">
      <div className="px-4 py-3 border-b border-aed-border">
        <h2 className="text-[15px] font-semibold text-slate-800">Historial de cambios</h2>
        <p className="text-[13px] text-slate-500 mt-0.5">Últimos 100 cambios de administración sobre usuarios.</p>
      </div>

      {error && <p className="px-4 py-3 text-[13px] text-red-500">Error: {error}</p>}

      {registros && registros.length === 0 && (
        <p className="px-4 py-6 text-[14px] text-slate-400 text-center">Sin cambios registrados todavía.</p>
      )}

      {registros && registros.length > 0 && (
        <div className="divide-y divide-aed-border max-h-96 overflow-y-auto">
          {registros.map((r) => (
            <div key={r.id} className="px-4 py-2.5 text-[13px]">
              <p className="text-slate-700">
                <span className="font-medium">{r.actor.nombre}</span> {describirAccionAuditoria(r)} de{' '}
                <span className="font-medium">{r.usuario.nombre}</span>
              </p>
              <p className="text-slate-400 text-[12px]">{new Date(r.createdAt).toLocaleString('es-CO')}</p>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

export default function Ajustes() {
  return (
    <div className="flex flex-col min-h-screen bg-aed-base">
      {/* Topbar */}
      <header className="h-[52px] bg-white border-b border-aed-border flex items-center px-5 gap-2.5 flex-shrink-0 sticky top-0 z-10">
        <Settings size={18} className="text-slate-500" />
        <h1 className="text-[18px] font-bold text-slate-800">Ajustes</h1>
      </header>

      <div className="flex-1 p-5">
        <div className="grid grid-cols-1 xl:grid-cols-2 gap-6 items-start">
          <Seccion title="Usuarios" icon={Users} color="#64748b">
            <UsuariosCard />
            <AuditoriaCard />
          </Seccion>

          <Seccion title="Sincronización de datos" icon={RefreshCw} color="#1d4ed8">
            <SubformsBackfillCard />
            <ProjectCodeReportCard />
          </Seccion>

          <div className="xl:col-span-2">
            <Seccion title="Conciliación" icon={CalendarClock} color="#0e7581">
              <FechaEntregaFrenteCard />
            </Seccion>
          </div>
        </div>
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Verificar sintaxis**

```bash
cd "zoho-payment-tracker/frontend" && node -e "
const esbuild = require('esbuild');
esbuild.buildSync({ entryPoints: ['src/pages/Ajustes.jsx'], bundle: false, write: false, loader: { '.jsx': 'jsx' } });
console.log('OK');
"
```
Expected: `OK`

- [ ] **Step 3: Verificación visual end-to-end completa**

Con backend y frontend corriendo (backend reiniciado después de todas las tareas anteriores), escribir un script de Playwright temporal en el scratchpad que:
1. Inicia sesión con el admin de la Tarea 5.
2. Va a `/ajustes`, confirma que aparecen las tarjetas "Usuarios y permisos" e "Historial de cambios".
3. Crea un usuario de prueba nuevo desde el formulario (correo, nombre, contraseña, un par de módulos marcados, sin admin).
4. Confirma que aparece en la lista y que "Historial de cambios" muestra una entrada `crear`.
5. Edita ese usuario para agregarle un módulo más, confirma que "Historial de cambios" muestra una entrada `modulos` con el detalle correcto.
6. Cierra sesión, inicia sesión con el usuario de prueba, confirma que el sidebar solo muestra los módulos asignados y que no hay link de "Ajustes".
7. Intenta navegar directo a `/ajustes` con ese usuario (vía `page.goto`), confirma que ve el mensaje "No tienes permiso para ver esta sección" en vez de la pantalla de administración.

Tomar capturas de cada paso, revisarlas, y borrar los scripts/capturas del scratchpad al terminar. Si algo no se ve bien (por ejemplo el layout del formulario o los checkboxes agrupados), ajustar el CSS y repetir la verificación antes de continuar.

- [ ] **Step 4: Commit**

```bash
git add zoho-payment-tracker/frontend/src/pages/Ajustes.jsx
git commit -m "feat(auth): pantalla de administración de usuarios y auditoría en Ajustes"
```

---

### Task 19: Actualizar CLAUDE.md y la documentación técnica externa

**Files:**
- Modify: `zoho-payment-tracker/CLAUDE.md` (o `Software-Cartera-AED/CLAUDE.md`, confirmar la ruta real del archivo raíz del repo)
- Modify: `C:\Users\GabrielEliasValdelam\Desktop\Documentaciones\Zoho-Payment-Tracker-Documentacion-Tecnica.md`

**Interfaces:** (ninguna — solo documentación)

Este cambio toca arquitectura (login), variables de entorno y schema — CLAUDE.md ya tiene una instrucción permanente de mantener sincronizado el doc técnico externo con cambios de esta magnitud.

- [ ] **Step 1: Actualizar CLAUDE.md**

En la sección **"Environment Variables"**: quitar la línea de `APP_PASSWORD` (ya no se lee); agregar:
```
- `ADMIN_EMAIL`, `ADMIN_PASSWORD`, `ADMIN_NOMBRE` — solo para el arranque inicial (`npm run db:seed-admin`), crean el primer usuario admin. El resto de usuarios se gestionan desde Ajustes → Usuarios y permisos.
```

En la sección **"Database"**, en la lista de modelos compartidos: quitar `ConfiguracionApp (clave/valor genérico; hoy solo menuOculto)` y agregar en su lugar:
```
- `Usuario` — cuenta individual (correo/contraseña/`esAdmin`/`modulosPermitidos`), reemplaza la antigua clave única compartida
- `AuditoriaUsuario` — historial de cambios de administración sobre usuarios (quién cambió qué a quién)
```

Agregar una nueva subsección dentro de **"Architecture"**, justo después de "Key Patterns", titulada `### Autenticación y permisos`:
```markdown
### Autenticación y permisos

Cuentas individuales (correo + contraseña, `bcryptjs`), no una clave compartida.
Cada `Usuario` tiene `modulosPermitidos: String[]` con las mismas `key` que
`frontend/src/config/navItems.js` (reflejadas en texto plano en
`backend/src/config/modulos.js`, porque el backend no puede importar un archivo
que depende de `lucide-react`). `esAdmin: true` da acceso a todo, incluida la
gestión de usuarios en Ajustes. El enforcement es real en el backend
(`requireModulo(clave|claves[])` / `requireAdmin` en `middleware/auth.js`,
aplicado por sub-ruta en cada router) — el frontend además oculta/protege por
UI (`RutaProtegida`, `Sidebar.jsx`) pero eso es solo para la experiencia, no la
única barrera. Cada cambio de administración sobre un usuario queda en
`AuditoriaUsuario`, visible en Ajustes → Historial de cambios.
```

En la sección **"Commands"**, dentro del bloque de comandos del backend, agregar después de `db:studio`:
```
npm run db:seed-admin # Crea/actualiza el usuario admin inicial desde ADMIN_EMAIL/ADMIN_PASSWORD/ADMIN_NOMBRE (correr una sola vez al desplegar este cambio)
```

- [ ] **Step 2: Actualizar el doc técnico externo**

En `Zoho-Payment-Tracker-Documentacion-Tecnica.md`, actualizar las secciones de Seguridad (reemplazar la descripción de "clave única compartida" por el nuevo modelo de cuentas + permisos por módulo + auditoría), Base de datos (nuevos modelos), y Variables de entorno.

- [ ] **Step 3: Commit**

```bash
git add zoho-payment-tracker/CLAUDE.md
git commit -m "docs: actualiza CLAUDE.md con el nuevo sistema de login y permisos"
```
(El doc técnico externo vive fuera del repo — no se commitea acá, pero se edita como parte de esta misma tarea según la instrucción existente en CLAUDE.md.)

---

## Nota final de alcance

Al terminar la Tarea 19, queda pendiente (fuera de este plan, según el spec):
- Borrar el usuario de prueba `prueba@aed.com.co` de la Tarea 11/17 si sigue existiendo en la base de datos (verificar con `listarUsuarios()` desde Ajustes y desactivarlo o dejarlo como cuenta de prueba real, según se decida en ese momento).
- Confirmar con el resto del equipo qué módulos le corresponden a cada persona real antes de dar de baja cualquier acceso compartido que estuvieran usando con la clave anterior.
