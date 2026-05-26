require('dotenv').config();
const express = require('express');
const cors = require('cors');
const path = require('path');
const cron = require('node-cron');
const { PrismaClient } = require('@prisma/client');
const { syncOpportunitiesFromZoho } = require('./services/zohoSync');
const { syncEmailMovimientos } = require('./services/emailSync');
const opportunitiesRouter = require('./routes/opportunities');
const fieldsRouter = require('./routes/fields');
const pagosRouter = require('./routes/pagos');
const fiduciaRouter = require('./routes/fiducia');

const app = express();
const prisma = new PrismaClient();
const PORT = process.env.PORT || 3001;

app.use(cors({ origin: process.env.FRONTEND_URL || 'http://localhost:5173' }));
app.use(express.json());

// Rutas
app.use('/api/opportunities', opportunitiesRouter);
app.use('/api/fields', fieldsRouter);
app.use('/api/pagos', pagosRouter);
app.use('/api/fiducia', fiduciaRouter);

// GET /api/sync/status — ruta directa (también está en opportunities router)
app.get('/api/sync/status', async (req, res) => {
  try {
    const last = await prisma.syncLog.findFirst({
      orderBy: { startedAt: 'desc' },
    });
    res.json(last || { status: 'never' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/sync — ruta directa
app.post('/api/sync', async (req, res) => {
  res.json({ message: 'Sincronización iniciada' });
  syncOpportunitiesFromZoho().catch((err) =>
    console.error('[sync] Error en sync manual:', err.message)
  );
});

// Health check
app.get('/api/health', (req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// Servir el frontend en producción
const frontendDist = path.join(__dirname, '../../frontend/dist');
app.use(express.static(frontendDist));
app.get('*', (req, res) => {
  res.sendFile(path.join(frontendDist, 'index.html'));
});

// Sincronización Zoho CRM — cada hora
cron.schedule('0 * * * *', () => {
  console.log('[cron] Ejecutando sincronización horaria Zoho...');
  syncOpportunitiesFromZoho().catch((err) =>
    console.error('[cron] Error Zoho sync:', err.message)
  );
});

// Sincronización correos — cada día a las 8 AM
cron.schedule('0 8 * * *', () => {
  console.log('[cron] Ejecutando sincronización de correos...');
  syncEmailMovimientos().catch((err) =>
    console.error('[cron] Error email sync:', err.message)
  );
});

async function startServer() {
  try {
    await prisma.$connect();
    console.log('[db] Conectado a PostgreSQL');

    const excelPwd = process.env.EXCEL_PASSWORD;
    if (excelPwd && excelPwd !== 'COMPLETAR') {
      console.log('[config] EXCEL_PASSWORD cargada ✓');
    } else {
      console.warn('[config] EXCEL_PASSWORD no configurada — los Excel protegidos fallarán');
    }

    app.listen(PORT, () => {
      console.log(`[server] Escuchando en http://localhost:${PORT}`);
    });

    // Sincronización inicial si la base de datos está vacía
    const count = await prisma.opportunity.count();
    if (count === 0) {
      console.log('[init] Base de datos vacía, ejecutando sincronización inicial...');
      syncOpportunitiesFromZoho().catch((err) =>
        console.error('[init] Error en sync inicial:', err.message)
      );
    } else {
      console.log(`[init] ${count} oportunidades en base de datos. Omitiendo sync inicial.`);
    }
  } catch (err) {
    console.error('[server] Error al iniciar:', err.message);
    process.exit(1);
  }
}

startServer();
