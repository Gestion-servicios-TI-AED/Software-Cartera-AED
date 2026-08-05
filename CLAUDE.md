@../SECURITY.md

# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

**Cartera AED** — sistema interno de AED para el seguimiento de cartera de varios proyectos inmobiliarios. Cada proyecto tiene su propio CRM, su propio formato de Excel y su propia lógica de conciliación, aislados en su propia carpeta del backend (ver `Repository Structure`):

- **Baía Kristal** (`backend/src/baia-kristal/`) — CRM Zoho + Excel de fiducia (muchas columnas, movimientos bancarios detallados). Es el proyecto original y el más completo; el resto de este documento describe su arquitectura en detalle salvo que se diga lo contrario.
- **Alegra** (`backend/src/alegra/`) — CRM HubSpot + su propio Excel (bastantes menos columnas). En construcción: por ahora solo existe el scaffold (`GET /api/alegra/status`) y un cliente HubSpot básico (`alegra/services/hubspotClient.js`); falta definir el schema de datos (Prisma) y la lógica de conciliación propia una vez se tenga una muestra real del Excel.

Lo compartido entre proyectos (login por cuenta individual, gestión de usuarios y permisos por módulo) vive en la raíz de `backend/src/` (`middleware/auth.js`, `routes/auth.js`, `routes/usuarios.js`, `config/modulos.js`), no dentro de la carpeta de ningún proyecto.

## Documentación técnica

Existe una documentación técnica completa del proyecto (arquitectura, base de datos, despliegue, seguridad, métricas) en:

`C:\Users\GabrielEliasValdelam\Desktop\Documentaciones\Zoho-Payment-Tracker-Documentacion-Tecnica.md`

**Mantenla actualizada automáticamente**: cuando hagas un cambio significativo en el código de este repositorio (nuevo módulo o funcionalidad, endpoint nuevo, cambio de schema/migración, variable de entorno nueva, cambio de arquitectura o del proceso de despliegue), actualiza en ese mismo cambio la(s) sección(es) correspondientes de ese documento -- no esperes a que te lo pidan aparte. No hace falta regenerar el documento completo por cada edición menor, solo mantener sincronizadas las partes que dejen de reflejar la realidad del código.

## Repository Structure

```
zoho-payment-tracker/
  backend/
    src/
      index.js               — arranque del server, CORS, cron, montaje de rutas (compartido)
      middleware/auth.js      — login por cuenta individual + requireModulo/requireAdmin, compartido por todos los proyectos
      routes/auth.js          — login/logout/check, compartido
      routes/usuarios.js      — CRUD de usuarios, permisos por módulo y auditoría (solo admins), compartido
      config/modulos.js       — catálogo de módulos en texto plano (espejo de frontend/src/config/navItems.js), compartido
      baia-kristal/
        config/                — columnasExcluidas.js, zoho.js
        routes/                 — negocios, fiducia, opportunities, inventario, fields, stats,
                                   configuracionesFrentes.js (fechas de entrega por frente/torre/piso)
        services/               — zohoSync, zohoAuth, fiduciaService, conciliacionService,
                                   dashboardRecaudoService, inventarioNegocioService, etc.
      alegra/
        routes/index.js        — placeholder (GET /status) mientras se define el schema
        services/hubspotClient.js — cliente HubSpot (Private App access token, sin OAuth)
  frontend/  — React + Vite + Tailwind (port 5173) — SIN separar por proyecto todavía
```

Al agregar rutas/servicios de un proyecto, van DENTRO de su carpeta (`baia-kristal/` o `alegra/`); lo que aplique a cualquier proyecto (auth, config global) va en la raíz de `src/`. Los `require()` relativos entre `routes/` y `services/` de un mismo proyecto se resuelven igual que antes de la separación (`../services/x`), porque ambas carpetas se movieron juntas manteniendo su estructura relativa.

## Commands

### Backend (`zoho-payment-tracker/backend/`)
```bash
npm run dev          # Nodemon auto-reload
npm start            # Production
npm run db:migrate   # Create new migration from schema changes
npm run db:deploy    # Apply migrations to DB (use on deploy)
npm run db:generate  # Regenerate Prisma client after schema edit
npm run db:studio    # Open Prisma Studio GUI
npm run db:seed-admin # Crea/actualiza el usuario admin inicial desde ADMIN_EMAIL/ADMIN_PASSWORD/ADMIN_NOMBRE (correr una sola vez al desplegar este cambio)
```

### Frontend (`zoho-payment-tracker/frontend/`)
```bash
npm run dev     # Dev server
npm run build   # Production bundle
```

No test suite is configured.

## Architecture

### Data Sources & Sync (Baía Kristal)

> Nota: `CLAUDE.md` describía antes una tercera fuente por correo de Outlook (`emailSync.js` + modelo `PagoMovimiento`) — **eso no existe en el código actual**, se corrigió acá. La ingesta de movimientos es 100% por carga manual de Excel (punto 2).

Dos fuentes de datos independientes alimentan Baía Kristal:

1. **Zoho CRM** (`baia-kristal/services/zohoSync.js`) — Cron horario + endpoint manual `/api/sync`. Usa OAuth 2.0 con refresh token. Sincronización incremental via `If-Modified-Since`. Solo procesa oportunidades con campo `Pago_Separacion` definido.

2. **Fiducia Excel** (`baia-kristal/services/fiduciaService.js`) — Upload manual desde frontend. Soporta Excel protegidos con `EXCEL_PASSWORD`. Detecta nombre de proyecto desde columna "Fideicomiso". Agrupa por nomenclatura para vista de propietario/apartamento.

Alegra (en construcción) usará HubSpot como CRM (`alegra/services/hubspotClient.js`, token estático de Private App, sin OAuth) + su propio Excel, con su propia lógica de conciliación — no comparte tablas ni servicios con Baía Kristal.

### Key Patterns

- **Subform Fallback**: Subforms de Zoho se persisten en DB al primer fetch; peticiones siguientes se sirven desde DB a menos que falten, evitando llamadas duplicadas a la API.
- **Dynamic Field Mapping**: `syncFieldMetadata()` descarga todos los campos de Zoho y construye reglas de extracción por regex/keyword. Adapta automáticamente si cambian los nombres de campos en Zoho.
- **JSON para datos variables**: Campos financieros, secciones de propiedad y filas de Excel se guardan como JSON en columnas `Json` de Prisma para evitar sprawl de schema.
- **Background tasks**: Syncs manuales responden inmediatamente y procesan en background (`.catch()` pattern, no queue formal).
- **SKIP_KEYS**: Metadatos internos de Zoho (`$in_merge`, `$field_states`, etc.) se filtran antes de persistir subforms.

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

### API Routes (`/api`)

| Prefijo | Proyecto | Propósito |
|---|---|---|
| `/opportunities` | Baía Kristal | Lista paginada, detalle, subforms, estado de sync Zoho |
| `/negocios` | Baía Kristal | Negocios, conciliación, Cartera en Gestión, Dashboard Plan vs. Recaudo |
| `/fiducia` | Baía Kristal | Encargos, hojas, movimientos, nomenclaturas, propietarios |
| `/inventario` | Baía Kristal | Inventario de inmuebles (Productos de Zoho) |
| `/fields` | Baía Kristal | Metadatos de campos Zoho |
| `/stats` | Baía Kristal | KPIs de Resumen Gerencial |
| `/configuraciones/frentes` | Baía Kristal | Fechas de entrega por frente/torre/piso |
| `/alegra` | Alegra | En construcción — solo `/status` por ahora |
| `/usuarios` | Compartido | CRUD de usuarios, permisos por módulo y auditoría (solo admins, `requireAdmin`) |
| `/auth`, `/sync`, `/health` | Compartido / Baía Kristal | Login/logout/check, trigger manual de sync Zoho, health check |

### Database (Prisma / PostgreSQL)

Un solo `schema.prisma` para todos los proyectos (Prisma no soporta bien múltiples archivos de schema en esta versión). Modelos de **Baía Kristal**:
- `Opportunity` — deal de Zoho, con `formaPago`/`propuestaPago`/`camposFinancieros` como JSON (no hay modelos `SubformPago`/`SubformPropuesta` separados)
- `InventarioItem` — Producto de Zoho (inmueble físico)
- `Negocio` / `NegocioComprador` / `NegocioMovimiento` — expediente financiero por comprador, desde el Excel de fiducia
- `EncargFiduciario` / `HojaFiduciaria` / `MovimientoFiduciario` — Excel de fiducia crudo, tal como se sube
- `ZohoFieldMetadata` — metadatos de campos Zoho (no `ZohoField`)
- `SyncLog` — historial de sincronizaciones con Zoho
- `ConfiguracionFrente` — fechas de entrega configuradas
- `ResumenCarteraMensual` — foto fija mensual del Consolidado de Cartera

Modelos **compartidos**:
- `Usuario` — cuenta individual (correo/contraseña/`esAdmin`/`modulosPermitidos`), reemplaza la antigua clave única compartida
- `AuditoriaUsuario` — historial de cambios de administración sobre usuarios (quién cambió qué a quién)

Modelos de **Alegra**: ninguno todavía — pendiente definir una vez se tenga una muestra real del Excel y se decida qué propiedades de HubSpot importan.

Al cambiar `schema.prisma`, siempre ejecutar `npm run db:migrate` (dev) o `npm run db:deploy` (prod) + `npm run db:generate`. Si Prisma detecta un drift de schema no relacionado al cambio que estás haciendo, escribe la migración a mano (`prisma/migrations/<timestamp>_<nombre>/migration.sql`) en vez de dejar que `migrate dev` intente resolver todo el drift de una vez (ver migraciones `add_resumen_cartera_mensual`, `add_negocio_flags_tramite_canje`, `add_configuracion_app` como referencia de ese patrón).

### Frontend

Todo el frontend (`zoho-payment-tracker/frontend/`) sigue siendo un solo proyecto React sin separar por carpeta de proyecto (a diferencia del backend) — cuando Alegra tenga UI, decidir ahí si conviene separarla en `frontend/src/alegra/` o dejarla junto a las páginas de Baía Kristal con su propio prefijo de ruta.

React Router con rutas profundas para drill-down (todas son de Baía Kristal hoy):
- `/` → Negocios (vista principal)
- `/oportunidades` → pipeline de oportunidades de Zoho
- `/inventario` → inmuebles
- `/opportunity/:id` → detalle de oportunidad con subforms y movimientos
- `/fiducia` → lista de encargos; `/fiducia/movimientos` → vista global de movimientos
- `/fiducia/:id` → hojas del encargo; `/fiducia/:id/apartamento/:referencia` → detalle por propiedad
- `/resumen` → Resumen Gerencial; `/dashboard` → Plan vs. Recaudo; `/cartera-mora` → Cartera en Gestión
- `/ajustes` → configuración (incluye Usuarios y permisos + Historial de cambios, compartido entre proyectos y visible solo para admins)

Todas las vistas usan Axios (`frontend/src/utils/api.js`) contra `http://localhost:3001/api`. TanStack React Table para grillas con paginación server-side.

## Environment Variables

Ver `backend/.env`. Variables requeridas:
- `DATABASE_URL` — PostgreSQL connection string
- `SESSION_SECRET` — login (compartido)
- `PORT`, `FRONTEND_URL`, `COOKIE_SECURE`, `DISABLE_CRON` — configuración del servidor (compartido)
- `ZOHO_CLIENT_ID`, `ZOHO_CLIENT_SECRET`, `ZOHO_REFRESH_TOKEN`, `ZOHO_API_BASE`, `ZOHO_ACCOUNTS_URL` — OAuth Zoho (Baía Kristal)
- `EXCEL_PASSWORD` — contraseña de Excel protegidos de la fiducia (Baía Kristal, opcional)
- `HUBSPOT_ACCESS_TOKEN` — token de Private App de HubSpot (Alegra); `HUBSPOT_API_BASE` opcional si no es el estándar
- `ADMIN_EMAIL`, `ADMIN_PASSWORD`, `ADMIN_NOMBRE` — solo para el arranque inicial (`npm run db:seed-admin`), crean el primer usuario admin. El resto de usuarios se gestionan desde Ajustes → Usuarios y permisos.

No existen ya variables `AZURE_*`/`OUTLOOK_*` — la vía de correo Outlook que describía este archivo antes nunca llegó a estar en el código.
