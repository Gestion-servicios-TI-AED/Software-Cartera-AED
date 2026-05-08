const express = require('express');
const { PrismaClient } = require('@prisma/client');
const { syncEmailMovimientos } = require('../services/emailSync');

const router = express.Router();
const prisma = new PrismaClient();

// GET /api/pagos/movimientos?opportunityId=&page=&limit=
router.get('/movimientos', async (req, res) => {
  try {
    const { opportunityId, referencia, matched, page = '1', limit = '50' } = req.query;
    const pageNum = Math.max(1, parseInt(page));
    const limitNum = Math.min(200, Math.max(1, parseInt(limit)));
    const skip = (pageNum - 1) * limitNum;

    const where = {};
    if (opportunityId) where.opportunityId = opportunityId;
    if (referencia) where.referencia = { contains: referencia, mode: 'insensitive' };
    if (matched !== undefined) where.matched = matched === 'true';

    const [total, records] = await Promise.all([
      prisma.pagoMovimiento.count({ where }),
      prisma.pagoMovimiento.findMany({
        where,
        skip,
        take: limitNum,
        orderBy: { emailFecha: 'desc' },
        select: {
          id: true,
          emailId: true,
          emailSubject: true,
          emailFecha: true,
          archivoNombre: true,
          referencia: true,
          datos: true,
          matched: true,
          opportunityId: true,
          createdAt: true,
        },
      }),
    ]);

    res.json({
      data: records,
      pagination: { total, page: pageNum, limit: limitNum, totalPages: Math.ceil(total / limitNum) },
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/pagos/movimientos/sin-match — filas que no encontraron oportunidad
router.get('/movimientos/sin-match', async (req, res) => {
  try {
    const { page = '1', limit = '50' } = req.query;
    const pageNum = Math.max(1, parseInt(page));
    const limitNum = Math.min(200, Math.max(1, parseInt(limit)));

    const [total, records] = await Promise.all([
      prisma.pagoMovimiento.count({ where: { matched: false } }),
      prisma.pagoMovimiento.findMany({
        where: { matched: false },
        skip: (pageNum - 1) * limitNum,
        take: limitNum,
        orderBy: { emailFecha: 'desc' },
      }),
    ]);

    res.json({
      data: records,
      pagination: { total, page: pageNum, limit: limitNum, totalPages: Math.ceil(total / limitNum) },
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/pagos/email-sync/status
router.get('/email-sync/status', async (req, res) => {
  try {
    const last = await prisma.emailSyncLog.findFirst({
      orderBy: { startedAt: 'desc' },
    });
    res.json(last || { status: 'never' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/pagos/email-sync — dispara sincronización manual
router.post('/email-sync', async (req, res) => {
  res.json({ message: 'Sincronización de correos iniciada' });
  syncEmailMovimientos().catch((err) =>
    console.error('[emailSync] Error en sync manual:', err.message)
  );
});

module.exports = router;
