# Fecha Inicio Plan de Pagos — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Change the base date used to calculate the "Fecha estimada" column (Forma de Pago table, opportunity detail) from `pagoSeparacion` to a newly-synced Zoho field, `Fecha_Inicio_Plan_de_Pagos`.

**Architecture:** Add the field to the Zoho fetch/mapping pipeline (`zohoSync.js`) and persist it as a new `Opportunity.fechaInicioPlanPagos` column. Add an optional `force` flag to the sync function so a one-time full resync can backfill the field on existing records (the normal sync is incremental and won't touch unchanged deals). Update the frontend to read the new field instead of `pagoSeparacion` for this one calculation only.

**Tech Stack:** Node.js/Express, Prisma/PostgreSQL, React (Vite), Zoho CRM REST API.

## Global Constraints

- No test suite is configured in this repo (see `CLAUDE.md`) — verification in this plan uses manual scripts (`node -e`) and manual browser checks, not a test runner.
- Whenever `schema.prisma` changes: run `npm run db:migrate` (dev) then `npm run db:generate` (per `CLAUDE.md`).
- `pagoSeparacion` must NOT change anywhere else in the app (dashboard columns, filters, `stats.js`, `PaymentPlanTable.jsx`, `informe/generar-informe.mjs`) — this plan only changes the base date used inside `SubformsAccordion.addDates()` in `OpportunityDetail.jsx`.
- Running a full (non-incremental) sync hits the real Zoho CRM API for every deal and overwrites existing `Opportunity` rows. Before executing Task 5 against any shared/production environment, confirm with the user first.

---

### Task 1: Add `fechaInicioPlanPagos` column to the database

**Files:**
- Modify: `zoho-payment-tracker/backend/prisma/schema.prisma`

**Interfaces:**
- Produces: `Opportunity.fechaInicioPlanPagos` (`DateTime?`), consumed by Task 2 (write path) and Task 4 (read path via the `/api/opportunities/:id` response, which already returns all columns).

- [ ] **Step 1: Add the column to the `Opportunity` model**

In `zoho-payment-tracker/backend/prisma/schema.prisma`, find:

```prisma
  referenciaRecaudo  String?
  pagoSeparacion     DateTime?

  // Campos financieros dinámicos (todos los currency fields de Zoho)
```

Replace with:

```prisma
  referenciaRecaudo  String?
  pagoSeparacion     DateTime?
  fechaInicioPlanPagos DateTime?

  // Campos financieros dinámicos (todos los currency fields de Zoho)
```

- [ ] **Step 2: Validate the schema**

Run from `zoho-payment-tracker/backend`:

```bash
npx prisma validate
```

Expected: `The schema at prisma\schema.prisma is valid 🚀`

- [ ] **Step 3: Create and apply the migration**

Run from `zoho-payment-tracker/backend`:

```bash
npm run db:migrate -- --name add_fecha_inicio_plan_pagos
```

Expected: prompts complete automatically (non-interactive since `--name` is passed), ends with `Your database is now in sync with your schema.` and a new folder under `prisma/migrations/` named `<timestamp>_add_fecha_inicio_plan_pagos` containing an `ALTER TABLE "Opportunity" ADD COLUMN "fechaInicioPlanPagos" TIMESTAMP(3);` migration.sql.

- [ ] **Step 4: Regenerate the Prisma client**

```bash
npm run db:generate
```

Expected: `✔ Generated Prisma Client`

- [ ] **Step 5: Verify the column is queryable**

```bash
node -e "const { PrismaClient } = require('@prisma/client'); const p = new PrismaClient(); p.opportunity.findFirst({ select: { id: true, fechaInicioPlanPagos: true } }).then((r) => { console.log(r); return p.$disconnect(); }).catch((e) => { console.error(e.message); process.exit(1); });"
```

Expected: prints an object like `{ id: '...', fechaInicioPlanPagos: null }` with no error (value will be `null` for all rows until Task 5 backfills it).

- [ ] **Step 6: Commit**

```bash
git add zoho-payment-tracker/backend/prisma/schema.prisma zoho-payment-tracker/backend/prisma/migrations
git commit -m "Add fechaInicioPlanPagos column to Opportunity"
```

---

### Task 2: Fetch and map `Fecha_Inicio_Plan_de_Pagos` from Zoho

**Files:**
- Modify: `zoho-payment-tracker/backend/src/services/zohoSync.js:97` (`buildFieldsList`)
- Modify: `zoho-payment-tracker/backend/src/services/zohoSync.js:230-253` (`mapDeal`)

**Interfaces:**
- Consumes: `Opportunity.fechaInicioPlanPagos` column from Task 1.
- Produces: `mapDeal()` return object now includes `fechaInicioPlanPagos: Date | null`, persisted by the existing `prisma.opportunity.upsert()` call in `syncOpportunitiesFromZoho()` (no change needed there — it spreads `...data` from `mapDeal()`).

- [ ] **Step 1: Request the field from the Zoho API**

In `zoho-payment-tracker/backend/src/services/zohoSync.js`, find (line 97):

```js
  const baseFields = ['Deal_Name', 'Stage', 'Contact_Name', 'Account_Name', 'Amount'];
```

Replace with:

```js
  const baseFields = ['Deal_Name', 'Stage', 'Contact_Name', 'Account_Name', 'Amount', 'Fecha_Inicio_Plan_de_Pagos'];
```

- [ ] **Step 2: Map the field onto the persisted record**

In the same file, find (around line 242):

```js
    referenciaRecaudo: recaudoField ? deal[recaudoField.api_name] || null : null,
    pagoSeparacion: pagoSepValue ? new Date(pagoSepValue) : null,
    camposFinancieros: Object.keys(camposFinancieros).length ? camposFinancieros : null,
```

Replace with:

```js
    referenciaRecaudo: recaudoField ? deal[recaudoField.api_name] || null : null,
    pagoSeparacion: pagoSepValue ? new Date(pagoSepValue) : null,
    fechaInicioPlanPagos: deal.Fecha_Inicio_Plan_de_Pagos ? new Date(deal.Fecha_Inicio_Plan_de_Pagos) : null,
    camposFinancieros: Object.keys(camposFinancieros).length ? camposFinancieros : null,
```

- [ ] **Step 3: Sanity-check the file loads without errors**

```bash
cd zoho-payment-tracker/backend
node -e "require('./src/services/zohoSync.js'); console.log('loaded ok');"
```

Expected: `loaded ok` with no errors.

Note: full end-to-end verification (real Zoho data flowing into `fechaInicioPlanPagos`) happens in Task 5, once the `force` full-sync flag exists — there is no test runner in this repo to unit-test `buildFieldsList`/`mapDeal` in isolation, and adding one would be scope beyond this change.

- [ ] **Step 4: Commit**

```bash
git add zoho-payment-tracker/backend/src/services/zohoSync.js
git commit -m "Sync Fecha_Inicio_Plan_de_Pagos from Zoho into Opportunity"
```

---

### Task 3: Add a `force` flag to trigger a full (non-incremental) sync

**Files:**
- Modify: `zoho-payment-tracker/backend/src/services/zohoSync.js:256` (`syncOpportunitiesFromZoho`)
- Modify: `zoho-payment-tracker/backend/src/routes/opportunities.js:163` (`router.post('/sync')`)
- Modify: `zoho-payment-tracker/backend/src/index.js:41` (`app.post('/api/sync')`)

**Interfaces:**
- Produces: `syncOpportunitiesFromZoho(force = false)` — when `force` is `true`, ignores the last successful `SyncLog` and re-fetches every deal (no `If-Modified-Since` header). Both `POST /api/sync` (index.js) and `POST /api/opportunities/sync` now accept `?full=true` to set `force`.
- Consumed by: Task 5 (backfill).

- [ ] **Step 1: Accept and apply the `force` parameter**

In `zoho-payment-tracker/backend/src/services/zohoSync.js`, find (line 256):

```js
async function syncOpportunitiesFromZoho() {
```

Replace with:

```js
async function syncOpportunitiesFromZoho(force = false) {
```

Then find (around line 286-293):

```js
    // Sync incremental: en syncs sucesivos solo traer cambios recientes
    const lastSuccess = await prisma.syncLog.findFirst({
      where: { status: 'success' },
      orderBy: { finishedAt: 'desc' },
    });
    const modifiedSince = lastSuccess?.finishedAt
      ? new Date(lastSuccess.finishedAt).toUTCString()
      : null;
```

Replace with:

```js
    // Sync incremental: en syncs sucesivos solo traer cambios recientes (salvo que se fuerce un full sync)
    const lastSuccess = force ? null : await prisma.syncLog.findFirst({
      where: { status: 'success' },
      orderBy: { finishedAt: 'desc' },
    });
    const modifiedSince = lastSuccess?.finishedAt
      ? new Date(lastSuccess.finishedAt).toUTCString()
      : null;
```

- [ ] **Step 2: Wire the flag through `POST /api/opportunities/sync`**

In `zoho-payment-tracker/backend/src/routes/opportunities.js`, find (line 163):

```js
router.post('/sync', async (req, res) => {
  // Responder inmediatamente y sincronizar en background
  res.json({ message: 'Sincronización iniciada' });
  syncOpportunitiesFromZoho().catch((err) =>
    console.error('[sync] Error en sync manual:', err.message)
  );
});
```

Replace with:

```js
router.post('/sync', async (req, res) => {
  // Responder inmediatamente y sincronizar en background
  const force = req.query.full === 'true';
  res.json({ message: 'Sincronización iniciada' });
  syncOpportunitiesFromZoho(force).catch((err) =>
    console.error('[sync] Error en sync manual:', err.message)
  );
});
```

- [ ] **Step 3: Wire the flag through `POST /api/sync`**

In `zoho-payment-tracker/backend/src/index.js`, find (line 41):

```js
app.post('/api/sync', async (req, res) => {
  res.json({ message: 'Sincronización iniciada' });
  syncOpportunitiesFromZoho().catch((err) =>
    console.error('[sync] Error en sync manual:', err.message)
  );
});
```

Replace with:

```js
app.post('/api/sync', async (req, res) => {
  const force = req.query.full === 'true';
  res.json({ message: 'Sincronización iniciada' });
  syncOpportunitiesFromZoho(force).catch((err) =>
    console.error('[sync] Error en sync manual:', err.message)
  );
});
```

- [ ] **Step 4: Sanity-check both files load without errors**

```bash
cd zoho-payment-tracker/backend
node -e "require('./src/services/zohoSync.js'); require('./src/routes/opportunities.js'); console.log('loaded ok');"
```

Expected: `loaded ok` with no errors.

- [ ] **Step 5: Commit**

```bash
git add zoho-payment-tracker/backend/src/services/zohoSync.js zoho-payment-tracker/backend/src/routes/opportunities.js zoho-payment-tracker/backend/src/index.js
git commit -m "Add force flag to allow a full (non-incremental) Zoho sync"
```

---

### Task 4: Use `fechaInicioPlanPagos` as the base date in the frontend

**Files:**
- Modify: `zoho-payment-tracker/frontend/src/pages/OpportunityDetail.jsx:115-148` (`SubformsAccordion`, `addDates`)
- Modify: `zoho-payment-tracker/frontend/src/pages/OpportunityDetail.jsx:359` (usage)

**Interfaces:**
- Consumes: `opportunity.fechaInicioPlanPagos` (ISO date string or `null`) from `GET /api/opportunities/:id`, produced by Task 1+2.

- [ ] **Step 1: Change the prop the component reads**

In `zoho-payment-tracker/frontend/src/pages/OpportunityDetail.jsx`, find (line 115):

```jsx
function SubformsAccordion({ opportunityId, pagoSeparacion }) {
```

Replace with:

```jsx
function SubformsAccordion({ opportunityId, fechaInicioPlanPagos }) {
```

- [ ] **Step 2: Update `addDates` to use the new base date**

Find (lines 120-124):

```jsx
  // Enriquece las filas de Forma de Pago con una columna "Fecha estimada"
  // calculada a partir de pagoSeparacion + N meses según el número de cuota.
  function addDates(rows) {
    if (!pagoSeparacion || !rows?.length) return rows;
    const base = new Date(pagoSeparacion);
```

Replace with:

```jsx
  // Enriquece las filas de Forma de Pago con una columna "Fecha estimada"
  // calculada a partir de fechaInicioPlanPagos + N meses según el número de cuota.
  function addDates(rows) {
    if (!fechaInicioPlanPagos || !rows?.length) return rows;
    const base = new Date(fechaInicioPlanPagos);
```

- [ ] **Step 3: Update the disclaimer condition**

Find (line 193):

```jsx
                {pagoSeparacion && subforms.formaPago?.length > 0 && (
```

Replace with:

```jsx
                {fechaInicioPlanPagos && subforms.formaPago?.length > 0 && (
```

- [ ] **Step 4: Pass the new prop where the component is used**

Find (line 359):

```jsx
          <SubformsAccordion opportunityId={id} pagoSeparacion={opportunity.pagoSeparacion} />
```

Replace with:

```jsx
          <SubformsAccordion opportunityId={id} fechaInicioPlanPagos={opportunity.fechaInicioPlanPagos} />
```

- [ ] **Step 5: Manual verification in the browser**

Start both dev servers:

```bash
cd zoho-payment-tracker/backend && npm run dev
```
```bash
cd zoho-payment-tracker/frontend && npm run dev
```

Open the app (default `http://localhost:5173`), navigate to an opportunity's detail page, expand "Forma y Propuesta de Pago":

- If the opportunity's `fechaInicioPlanPagos` is `null` (expected for all records until Task 5 runs): the "Forma de Pago" table renders with no "Fecha estimada" column and no disclaimer text — confirms the code path degrades safely, matching current behavior when the base date is missing.
- After Task 5 backfills real data, re-check the same opportunity (if it has a non-null `fechaInicioPlanPagos`): the "Fecha estimada" column appears, first row (Separación) equals the base date, each subsequent cuota is +1 month from the previous.

- [ ] **Step 6: Commit**

```bash
git add zoho-payment-tracker/frontend/src/pages/OpportunityDetail.jsx
git commit -m "Base Fecha estimada calculation on fechaInicioPlanPagos instead of pagoSeparacion"
```

---

### Task 5: Backfill existing opportunities with a forced full sync

**Files:** none (operational step using the endpoint built in Task 3)

**Interfaces:**
- Consumes: `POST /api/sync?full=true` (Task 3), `GET /api/sync/status` (existing).

- [ ] **Step 1: Confirm before running against any shared/production environment**

This step calls the real Zoho CRM API for every deal and overwrites existing `Opportunity` rows. If the backend in this session points at a shared or production database/Zoho account (check `zoho-payment-tracker/backend/.env`), pause and confirm with the user before proceeding. If it's a local/dev-only environment, proceed.

- [ ] **Step 2: Trigger the forced full sync**

With the backend running (`npm run dev` from Task 4, Step 5):

```bash
curl -X POST "http://localhost:3001/api/sync?full=true"
```

Expected: `{"message":"Sincronización iniciada"}` — the sync runs in the background.

- [ ] **Step 3: Poll until the sync finishes**

```bash
curl -s http://localhost:3001/api/sync/status
```

Repeat every ~10s until `status` is `"success"` (or `"error"` — if so, check backend logs for the message thrown in `syncOpportunitiesFromZoho`). Expected final response shape: `{"id":"...","status":"success","recordsSync":<n>,...}`.

- [ ] **Step 4: Verify the field was populated**

```bash
cd zoho-payment-tracker/backend
node -e "const { PrismaClient } = require('@prisma/client'); const p = new PrismaClient(); Promise.all([p.opportunity.count(), p.opportunity.count({ where: { fechaInicioPlanPagos: { not: null } } })]).then(([total, withDate]) => { console.log({ total, withDate }); return p.$disconnect(); });"
```

Expected: `withDate` is greater than 0 (exact count depends on how many deals have `Fecha Inicio Plan de Pagos` set in Zoho — it's fine if it's less than `total`, since not every deal will have this field filled in the CRM).

- [ ] **Step 5: Re-check the frontend**

Repeat Task 4 Step 5's browser check on an opportunity now confirmed (via Step 4 above) to have a non-null `fechaInicioPlanPagos`, confirming the "Fecha estimada" column now renders with correct monthly increments.

No commit — this task runs existing code against live data and does not change any files.
