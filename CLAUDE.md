@../SECURITY.md

# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

**Zoho Payment Tracker** — sistema interno de AED que sincroniza oportunidades del CRM Zoho, procesa movimientos de pago desde correos Outlook y gestiona datos de encargos fiduciarios desde archivos Excel.

## Repository Structure

```
zoho-payment-tracker/
  backend/   — Node.js + Express + Prisma (port 3001)
  frontend/  — React + Vite + Tailwind (port 5173)
```

## Commands

### Backend (`zoho-payment-tracker/backend/`)
```bash
npm run dev          # Nodemon auto-reload
npm start            # Production
npm run db:migrate   # Create new migration from schema changes
npm run db:deploy    # Apply migrations to DB (use on deploy)
npm run db:generate  # Regenerate Prisma client after schema edit
npm run db:studio    # Open Prisma Studio GUI
```

### Frontend (`zoho-payment-tracker/frontend/`)
```bash
npm run dev     # Dev server
npm run build   # Production bundle
```

No test suite is configured.

## Architecture

### Data Sources & Sync

Three independent data pipelines feed the system:

1. **Zoho CRM** (`src/services/zohoSync.js`) — Cron horario + endpoint manual `/api/sync`. Usa OAuth 2.0 con refresh token. Sincronización incremental via `If-Modified-Since`. Solo procesa oportunidades con campo `Pago_Separacion` definido.

2. **Outlook Email** (`src/services/emailSync.js`) — Cron diario 8 AM + endpoint manual. MS Graph API con client credentials. Descarga adjuntos Excel, parsea filas, crea `PagoMovimiento` asociando por número de referencia. Idempotente via `emailId` (Graph message ID).

3. **Fiducia Excel** (`src/services/fiduciaService.js`) — Upload manual desde frontend. Soporta Excel protegidos con `EXCEL_PASSWORD`. Detecta nombre de proyecto desde columna "Fideicomiso". Agrupa por nomenclatura para vista de propietario/apartamento.

### Key Patterns

- **Subform Fallback**: Subforms de Zoho se persisten en DB al primer fetch; peticiones siguientes se sirven desde DB a menos que falten, evitando llamadas duplicadas a la API.
- **Dynamic Field Mapping**: `syncFieldMetadata()` descarga todos los campos de Zoho y construye reglas de extracción por regex/keyword. Adapta automáticamente si cambian los nombres de campos en Zoho.
- **JSON para datos variables**: Campos financieros, secciones de propiedad y filas de Excel se guardan como JSON en columnas `Json` de Prisma para evitar sprawl de schema.
- **Background tasks**: Syncs manuales responden inmediatamente y procesan en background (`.catch()` pattern, no queue formal).
- **SKIP_KEYS**: Metadatos internos de Zoho (`$in_merge`, `$field_states`, etc.) se filtran antes de persistir subforms.

### API Routes (`/api`)

| Prefijo | Propósito |
|---|---|
| `/opportunities` | Lista paginada, detalle, subforms, estado de sync |
| `/pagos` | Movimientos de pago, sync de correos |
| `/fiducia` | Encargos, hojas, movimientos, nomenclaturas, propietarios |
| `/fields` | Metadatos de campos Zoho |
| `/sync` | Trigger manual de sync Zoho |
| `/health` | Health check |

### Database (Prisma / PostgreSQL)

Modelos principales:
- `Opportunity` — deal de Zoho con campos financieros y de propiedad
- `SubformPago` / `SubformPropuesta` — subforms de Zoho en JSON
- `PagoMovimiento` — movimientos extraídos de correos
- `EncargFiduciario` / `HojaFiduciaria` / `MovimientoFiduciario` — datos fiduciarios
- `SyncLog` — historial de sincronizaciones
- `ZohoField` — metadatos de campos Zoho

Al cambiar `schema.prisma`, siempre ejecutar `npm run db:migrate` (dev) o `npm run db:deploy` (prod) + `npm run db:generate`.

### Frontend

React Router con rutas profundas para drill-down:
- `/` → dashboard de oportunidades
- `/opportunity/:id` → detalle con subforms y movimientos
- `/fiducia` → lista de encargos
- `/fiducia/:id` → hojas del encargo
- `/fiducia/:id/apartamento/:nomenclatura` → detalle por propiedad

Todas las vistas usan Axios contra `http://localhost:3001/api`. TanStack React Table para grillas con paginación server-side.

## Environment Variables

Ver `backend/.env`. Variables requeridas:
- `DATABASE_URL` — PostgreSQL connection string
- `ZOHO_CLIENT_ID`, `ZOHO_CLIENT_SECRET`, `ZOHO_REFRESH_TOKEN` — OAuth Zoho
- `AZURE_TENANT_ID`, `AZURE_CLIENT_ID`, `AZURE_CLIENT_SECRET` — MS Graph para Outlook
- `OUTLOOK_SHARED_MAILBOX` — buzón compartido de movimientos
- `EXCEL_PASSWORD` — contraseña de Excel protegidos de la fiducia (opcional)
