require('dotenv').config();
const express = require('express');
const cors = require('cors');
const path = require('path');
const cron = require('node-cron');
const { PrismaClient } = require('@prisma/client');
// Baía Kristal: CRM Zoho + Excel de fiducia (ver baia-kristal/README si se
// agrega uno). Alegra: CRM HubSpot + su propio Excel, lógica separada.
const { syncOpportunitiesFromZoho } = require('./baia-kristal/services/zohoSync');
const { cerrarMesAnteriorSiFalta } = require('./baia-kristal/services/dashboardRecaudoService');
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

const app = express();
const prisma = new PrismaClient();
const PORT = process.env.PORT || 3001;

app.use(cors({ origin: process.env.FRONTEND_URL || 'http://localhost:5173' }));
app.use(express.json());

// Login y health check quedan fuera del candado de acceso
app.use('/api/auth', authRouter);
app.get('/api/health', (req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// Todo lo demás bajo /api requiere sesión válida
app.use('/api', requireAuth);

// Rutas -- Baía Kristal
app.use('/api/opportunities', opportunitiesRouter);
app.use('/api/fields', fieldsRouter);
app.use('/api/fiducia', fiduciaRouter);
app.use('/api/negocios', negociosRouter);
app.use('/api/stats', statsRouter);
app.use('/api/inventario', inventarioRouter);
app.use('/api/configuraciones', configuracionesFrentesRouter); // Baía Kristal (frentes)

// Rutas -- Alegra
app.use('/api/alegra', alegraRouter);

// Rutas -- Usuarios y permisos (compartido, requiere admin -- ver requireAdmin dentro del router)
app.use('/api/usuarios', usuariosRouter);

// GET /api/sync/status — ruta directa (también está en opportunities router)
app.get('/api/sync/status', requireModulo('oportunidades'), async (req, res) => {
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
app.post('/api/sync', requireModulo('oportunidades'), async (req, res) => {
  const force = req.query.full === 'true';
  res.json({ message: 'Sincronización iniciada' });
  syncOpportunitiesFromZoho(force).catch((err) =>
    console.error('[sync] Error en sync manual:', err.message)
  );
});

// Servir el frontend en producción
const frontendDist = path.join(__dirname, '../../frontend/dist');
app.use(express.static(frontendDist));
app.get('*', (req, res) => {
  res.sendFile(path.join(frontendDist, 'index.html'));
});

// Sincronización Zoho CRM — cada hora. DISABLE_CRON=true la desactiva --
// necesario cuando este proceso apunta a una base de datos que ya tiene
// otro servidor corriendo el mismo cron (evita sync duplicado/concurrente).
if (process.env.DISABLE_CRON === 'true') {
  console.log('[cron] Desactivado (DISABLE_CRON=true)');
} else {
  cron.schedule('0 * * * *', () => {
    console.log('[cron] Ejecutando sincronización horaria Zoho...');
    syncOpportunitiesFromZoho().catch((err) =>
      console.error('[cron] Error Zoho sync:', err.message)
    );
  });

  // Cierre mensual del Consolidado de Cartera (Resumen Gerencial) -- corre
  // todos los días (no solo el día 1) para autocurarse si el servidor
  // estuvo caído justo al cambio de mes; cerrarMesAnteriorSiFalta() no hace
  // nada si el mes anterior ya tiene una foto guardada.
  cron.schedule('15 0 * * *', () => {
    console.log('[cron] Verificando cierre de mes del Consolidado de Cartera...');
    cerrarMesAnteriorSiFalta()
      .then((r) => { if (r) console.log(`[cron] Mes ${r.mes} cerrado en Consolidado de Cartera`); })
      .catch((err) => console.error('[cron] Error cerrando mes del Consolidado de Cartera:', err.message));
  });
}

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
