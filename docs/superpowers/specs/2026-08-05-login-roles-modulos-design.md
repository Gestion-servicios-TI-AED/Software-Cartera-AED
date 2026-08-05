# Login con permisos por módulo (usuarios individuales) — Diseño

**Fecha:** 2026-08-05
**Estado:** Aprobado, pendiente de plan de implementación

## Resumen

Hoy Cartera AED tiene un solo candado de acceso: una clave compartida (`APP_PASSWORD`)
sin identidad individual. Cualquiera que la tenga ve absolutamente todo, en ambos
proyectos (Baía Kristal y Alegra). Este cambio reemplaza esa clave única por cuentas
individuales (correo + contraseña), donde cada persona tiene una lista explícita de
qué módulos puede ver, controlada por un usuario administrador desde la propia app.

## Motivación

Con dos proyectos (Baía Kristal, Alegra) y más personas usando la app, hace falta
poder decidir quién ve qué módulo — por ejemplo, alguien de Alegra no necesita ver
Encargos/Movimientos de Baía Kristal, o alguien de cartera no necesita ver
Oportunidades. Hoy eso no es posible: todo-o-nada.

## Alcance

**Incluye:**
- Cuentas individuales (correo + contraseña) reemplazando la clave compartida.
- Permisos por usuario a nivel de módulo (no un catálogo de roles reutilizables —
  cada usuario tiene su propia lista de módulos permitidos).
- Un flag `esAdmin` que da acceso total + gestión de usuarios.
- Enforcement real en el backend (403 si se pide un módulo sin permiso), no solo
  ocultar en el frontend.
- Pantalla de administración de usuarios (crear, editar módulos, activar/desactivar,
  resetear contraseña, dar/quitar admin) dentro de Ajustes, visible solo para admins.
- Historial de auditoría de los cambios que hace un admin sobre otros usuarios.
- El sidebar deja de depender de un selector manual de "proyecto activo": muestra
  directamente los módulos que la persona tiene permitidos, sin importar de qué
  proyecto sean.

**Explícitamente fuera de alcance (v1):**
- Cambio de contraseña autogestionado por el propio usuario — solo el admin resetea
  contraseñas de otros.
- Flujo de "olvidé mi contraseña" por correo (no hay infraestructura de envío de
  emails en el proyecto).
- Rate-limiting de intentos de login.
- Eliminación dura de usuarios — solo desactivación (`activo=false`).
- Auditoría de intentos de login (éxito/fallo) — el historial cubre solo acciones de
  administración sobre usuarios (ver sección de Auditoría).
- Catálogo de roles reutilizables — si en el futuro se necesita (muchos usuarios con
  el mismo set de permisos), se puede agregar sin romper este diseño, ya que
  `modulosPermitidos` seguiría siendo la fuente de verdad por usuario.

## Modelo de datos

Dos modelos nuevos en `schema.prisma`; se elimina `ConfiguracionApp`.

```prisma
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

model AuditoriaUsuario {
  id        Int      @id @default(autoincrement())
  actorId   Int
  actor     Usuario  @relation("AuditoriaActor", fields: [actorId], references: [id])
  usuarioId Int
  usuario   Usuario  @relation("AuditoriaAfectado", fields: [usuarioId], references: [id])
  accion    String   // 'crear' | 'modulos' | 'activar' | 'desactivar' | 'reset-password' | 'admin-on' | 'admin-off'
  detalle   Json?    // ej. { antes: ['negocios'], despues: ['negocios','movimientos'] }
  createdAt DateTime @default(now())
}
```

- `modulosPermitidos` reutiliza las mismas `key` que ya existen en
  `frontend/src/config/navItems.js` (`negocios`, `oportunidades`, `inventario`,
  `encargos`, `movimientos`, `resumen`, `dashboard`, `cartera-mora`, y sus
  equivalentes `alegra-*`). El backend no puede importar ese archivo directamente
  (depende de `lucide-react`, un paquete de frontend), así que se agrega un
  `backend/src/config/modulos.js` con el mismo array de claves en texto plano (sin
  íconos/labels), usado para validar `modulosPermitidos` al crear/editar un usuario.
  Ambos archivos quedan comentados cruzándose entre sí ("si agregas un módulo acá,
  agrégalo también en...") para que no se desincronicen.
- `esAdmin: true` implica acceso a todos los módulos sin necesidad de listarlos, más
  acceso a la gestión de usuarios y auditoría.
- Se elimina el modelo `ConfiguracionApp` (y su migración correspondiente que dropea
  la tabla), junto con `configuracionAppService.js`, `navPrefs.js` (frontend) y la
  ruta `GET/PUT /api/configuraciones/menu` — el interruptor global de menú queda
  reemplazado por los permisos individuales.

## Backend

### Login y sesión

`backend/src/routes/auth.js` (reescrito):
- `POST /api/auth/login` recibe `{ email, password }`. Busca `Usuario` por email,
  valida `activo`, compara con `bcrypt.compare(password, passwordHash)`. Si es
  válido, crea un token de sesión `${userId}.${exp}.${firma}` (HMAC-SHA256 con
  `SESSION_SECRET`, mismo mecanismo de firma que hoy, pero ahora codificando el id
  del usuario en vez de solo la expiración).
- `POST /api/auth/logout` — igual que hoy (borra la cookie).
- `GET /api/auth/check` — devuelve `{ id, email, nombre, esAdmin, modulosPermitidos }`
  del usuario autenticado (antes devolvía solo `{ ok: true }`).

`backend/src/middleware/auth.js`:
- `requireAuth` verifica la firma y expiración del token, extrae el `userId`, busca
  el `Usuario` en la base de datos (para reflejar de inmediato cualquier cambio de
  permisos o una desactivación, sin esperar a que expire la sesión), y si no existe o
  `activo=false` responde 401. Si es válido, deja `req.usuario = { id, email, nombre,
  esAdmin, modulosPermitidos }` disponible para el resto del pipeline.
- Nuevo `requireModulo(claveOClaves)`: acepta una clave sola o un array (basta con
  tener acceso a UNA de las claves dadas — necesario para un puñado de endpoints
  que alimentan más de un módulo del frontend a la vez, ver tabla abajo); revisa
  `req.usuario.esAdmin || claves.some(c => req.usuario.modulosPermitidos.includes(c))`;
  si no, responde 403.
- Nuevo `requireAdmin`: middleware que revisa `req.usuario.esAdmin`; si no, 403. Se
  usa en las rutas de gestión de usuarios y auditoría.

Se agrega la dependencia `bcryptjs` (pura JS, sin compilación nativa — evita
problemas de build en Windows que sí tiene el paquete `bcrypt`).

### Mapeo de rutas existentes a módulos

`requireModulo` se aplica **por sub-ruta**, no al router completo, porque varios
archivos de rutas de Baía Kristal mezclan más de un módulo bajo el mismo prefijo.
Esta tabla fue verificada línea por línea contra el uso real del frontend (cada
función de `utils/api.js` rastreada hasta la página que la llama) durante la
planeación de implementación — difiere en varios puntos de una primera
aproximación por prefijo de archivo, notados abajo:

| Router (prefijo montado) | Sub-rutas | Módulo requerido |
|---|---|---|
| `negocios.js` (`/api/negocios`) | `/`, `/:id`, `/:id/movimientos`, `/backfill*`, `/stats` | `negocios` |
| | `/movimientos`, `/movimientos/export` | `movimientos` — **no** `negocios`: alimentan la página "Movimientos" (`FiduciaMovimientos.jsx`, `FiduciaPropietario.jsx`), no la página "Negocios" |
| | `/cartera-mora`, `/:negocioId/flags` | `cartera-mora` |
| | `/dashboard-recaudo` | `['dashboard', 'resumen']` — lo consumen tanto `ReportePlanRecaudo.jsx` como `Resumen.jsx` |
| | `/resumen-etapas`, `/resumen-etapas/meses` | `resumen` |
| `opportunities.js` (`/api/opportunities`) | `/`, `/stages`, `/:id`, `/sync`, `/sync/status` | `oportunidades` |
| | `/:id/subforms` | `['oportunidades', 'negocios']` — lo consumen tanto `OpportunityDetail.jsx` como `Negocios.jsx` |
| | `/backfill-subforms`, `/backfill-subforms/status` | `requireAdmin` — solo los usa `Ajustes.jsx` |
| `inventario.js` (`/api/inventario`) | `/sync`, `/sync/status`, `/`, `/:id` | `inventario` |
| | `/verificar-project-code` | `requireAdmin` — solo lo usa `Ajustes.jsx` |
| `fiducia.js` (`/api/fiducia`) | `/encargos*`, `/propietarios`, `/movimientos` (endpoint propio, sin uso actual en el frontend), `/upload` | `encargos` |
| | `GET /encargos` | `['encargos', 'oportunidades']` — el KPI "Encargos activos" de `Dashboard.jsx` también lo llama |
| `stats.js` (`/api/stats`) | todo el router | `resumen` — único consumidor es `Resumen.jsx` |
| `configuracionesFrentes.js` (`/api/configuraciones/frentes*`) | `GET /frentes` | `negocios` — lo lee `Negocios.jsx` (Ajustes también lo lee, pero como admin pasa siempre) |
| | `PUT /frentes/:frente`, `PUT .../torres/:torre`, `PUT .../pisos/:piso` | `requireAdmin` — la edición solo ocurre en `Ajustes.jsx` |
| `fields.js` (`/api/fields`) | todo el router | sin restricción — metadatos no sensibles, usados por más de un módulo |
| `alegra/routes` (`/api/alegra`) | todo el router | sin restricción por ahora — solo existe `/status` (info de configuración de HubSpot, no datos de negocio); cuando existan endpoints reales de datos se les aplicará su `alegra-*` correspondiente igual que a Baía Kristal |

Rutas directas en `index.js` (`/api/sync`, `/api/sync/status`) quedan bajo el módulo
`oportunidades` — solo las consume `SyncStatus.jsx`, montado dentro de la página
Oportunidades (`Dashboard.jsx`), no la página Negocios.

### Gestión de usuarios (nuevas rutas, todas `requireAdmin`)

`backend/src/routes/usuarios.js` (nuevo, compartido — vive en la raíz junto a
`auth.js`, no dentro de `baia-kristal/` ni `alegra/`, porque gestiona acceso
transversal a ambos proyectos):

- `GET /api/usuarios` — lista todos los usuarios (sin `passwordHash`).
- `POST /api/usuarios` — crea usuario: `{ email, nombre, password, esAdmin,
  modulosPermitidos }`. Hashea la contraseña, guarda, registra auditoría `'crear'`.
- `PATCH /api/usuarios/:id` — edición parcial: `modulosPermitidos`, `esAdmin`,
  `activo`, `password` (opcional, si viene se re-hashea). Cada campo que cambia
  registra su propia fila de auditoría con la acción correspondiente (`'modulos'`,
  `'admin-on'`/`'admin-off'`, `'activar'`/`'desactivar'`, `'reset-password'`).
- `GET /api/usuarios/auditoria` — últimas 100 filas de `AuditoriaUsuario`, con
  `actor.nombre`/`actor.email` y `usuario.nombre`/`usuario.email` incluidos via
  `include`, ordenadas por `createdAt desc`.

No se expone `DELETE` — la baja de un usuario es `PATCH { activo: false }`.

### Auditoría

Cada handler de `usuarios.js` que modifica algo escribe, después de aplicar el
cambio, una fila en `AuditoriaUsuario` con `actorId = req.usuario.id` (quien está
logueado haciendo el cambio) y `usuarioId` (a quién afecta). Esto es automático —
no requiere que el admin haga nada aparte de la acción normal (crear, editar, etc.).
Para el cambio de módulos, `detalle` guarda `{ antes, despues }` con los arrays
completos, para poder leer exactamente qué se agregó/quitó sin ambigüedad.

## Frontend

### Login

`Login.jsx` pasa de un solo campo (clave) a dos campos: correo y contraseña.
`utils/api.js`: `login(email, password)` envía `{ email, password }` en vez de
`{ password }`.

### Identidad del usuario logueado

Nuevo hook `frontend/src/utils/usuarioActual.js` (`useUsuarioActual()`), mismo
patrón de caché+evento que `useHiddenNav()`: llama `GET /api/auth/check` una vez al
montar la app y expone `{ usuario, cargando }` a quien lo necesite (Sidebar, App,
Ajustes) sin pedirlo por triplicado.

### Sidebar

- Se elimina `utils/proyectoActivo.js` y toda referencia al selector de proyecto.
- El sidebar arma la lista combinando `NAV_ITEMS_BAIA_KRISTAL` + `NAV_ITEMS_ALEGRA`,
  filtrando cada ítem por `usuario.modulosPermitidos` (o mostrando todos si
  `usuario.esAdmin`).
- Los ítems se agrupan visualmente en dos bloques (uno por proyecto), cada uno con
  un rótulo pequeño (ícono compacto + texto tenue "BAÍA KRISTAL" / "ALEGRA") arriba;
  un grupo no aparece si la persona no tiene ningún módulo de ese proyecto.
- El logo de cabecera del sidebar deja de cambiar según "proyecto activo" (ese
  concepto desaparece) — pasa a ser una marca neutra "Cartera AED".

### Rutas protegidas

Nuevo componente `frontend/src/components/RutaProtegida.jsx`:
```jsx
<RutaProtegida modulo="negocios"><Negocios /></RutaProtegida>
```
Si `usuario.esAdmin` o `usuario.modulosPermitidos.includes(modulo)`, renderiza los
`children`; si no, muestra un estado simple "No tienes permiso para ver esta
sección" en vez de una página que de todas formas fallaría al pedir datos (403 del
backend). `App.jsx` envuelve cada `<Route>` existente con esto, usando la misma
`key` de módulo que ya tiene su ítem correspondiente en `navItems.js`.

### Ajustes — administración de usuarios

- Se retiran las tarjetas "Proyecto activo" y "Elementos del menú".
- Toda la página `Ajustes.jsx` pasa a requerir `esAdmin` (lo que queda —
  sincronización de planes de pago, verificación de Project Code — ya son
  herramientas de mantenimiento/admin); si un no-admin entra a `/ajustes`, ve el
  mismo estado de "sin permiso" que cualquier otra ruta protegida.
- Nueva tarjeta **"Usuarios y permisos"**:
  - Lista de usuarios: nombre, correo, badge Admin/Activo, conteo de módulos.
  - "Nuevo usuario": correo, nombre, contraseña inicial, toggle Admin, checkboxes de
    módulos agrupados por proyecto (los checkboxes se ocultan/deshabilitan si el
    toggle Admin está activo, ya que ese caso da acceso total).
  - Edición de un usuario existente: mismos campos, más activar/desactivar y un
    campo de contraseña opcional (si se llena, resetea).
- Nueva tarjeta **"Historial de cambios"**: lista de solo lectura, más reciente
  primero, de los últimos 100 registros de `GET /api/usuarios/auditoria` — fecha,
  quién hizo el cambio, a quién afectó, qué acción y detalle breve (para `'modulos'`,
  algo como "quitó Encargos, agregó Movimientos"). Sin filtros ni paginación en v1.

## Bootstrap y migración

- Nuevo script `backend/scripts/seedAdmin.js`, ejecutado una sola vez
  (`node scripts/seedAdmin.js`, o `npm run db:seed-admin`). Lee `ADMIN_EMAIL`,
  `ADMIN_PASSWORD`, `ADMIN_NOMBRE` de `.env`, hashea la contraseña con `bcryptjs` y
  hace `upsert` de un `Usuario` con `esAdmin: true`. Estas 3 variables se documentan
  en `.env`/CLAUDE.md como necesarias solo para ese arranque inicial.
- `APP_PASSWORD` deja de leerse en todo el código; se retira de `.env` y de la
  documentación (CLAUDE.md y el doc técnico externo).
- El formato del token de sesión cambia (ahora incluye `userId`), así que cualquier
  sesión activa antes del despliegue queda inválida — todo el mundo deberá volver a
  loguearse una vez desplegado. Aceptable: equipo pequeño, herramienta interna.
- Migración de Prisma: crea `Usuario` y `AuditoriaUsuario`, dropea `ConfiguracionApp`.

## Seguridad

- Contraseñas con `bcryptjs` (cost factor por defecto de la librería, 10), nunca en
  texto plano ni en logs.
- El token de sesión sigue siendo HMAC-firmado con `SESSION_SECRET` (no JWT
  completo) — timing-safe compare igual que hoy, ahora sobre un payload que incluye
  el id de usuario.
- `requireAuth` re-consulta la base de datos en cada request para reflejar
  desactivaciones/cambios de permiso de inmediato, en vez de confiar en lo que el
  token decía al momento del login.
- Sin rate-limiting de intentos de login en v1 (ver "Fuera de alcance") — riesgo
  aceptado dado el tamaño del equipo; queda como mejora futura si hiciera falta.

## Actualización de CLAUDE.md / doc técnico

Este cambio toca arquitectura (login), variables de entorno (`ADMIN_EMAIL`,
`ADMIN_PASSWORD`, `ADMIN_NOMBRE` nuevas; `APP_PASSWORD` retirada) y schema
(`Usuario`, `AuditoriaUsuario` nuevos; `ConfiguracionApp` eliminado) — se actualizan
ambos documentos como parte de la misma implementación, según la instrucción
existente en CLAUDE.md.
