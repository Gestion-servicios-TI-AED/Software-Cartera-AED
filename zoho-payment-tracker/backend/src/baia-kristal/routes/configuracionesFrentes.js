// Configuración de fechas de entrega por Frente/Torre/Piso -- específica de
// Baía Kristal. Se monta bajo la misma base que el router global de
// configuraciones (/api/configuraciones), ver index.js.
const express = require('express');
const {
  listarConfiguracionesFrente,
  actualizarFechaEntregaProyecto,
  actualizarFechaEntregaTorre,
  actualizarFechaEntregaPiso,
} = require('../services/configuracionFrenteService');
const { invalidarCacheDashboard } = require('../services/dashboardRecaudoService');
const { requireModulo, requireAdmin } = require('../../middleware/auth');

const router = express.Router();

// GET /api/configuraciones/frentes
router.get('/frentes', requireModulo('negocios'), async (req, res) => {
  try {
    const data = await listarConfiguracionesFrente();
    res.json({ data });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// PUT /api/configuraciones/frentes/:frente  { fechaEntrega: "2027-03-15" | null }
// Fecha única para TODAS las torres del frente -- rechaza si ya hay fechas
// configuradas por torre o por piso (hay que borrarlas primero).
router.put('/frentes/:frente', requireAdmin, async (req, res) => {
  try {
    const frente = decodeURIComponent(req.params.frente);
    const { fechaEntrega } = req.body || {};
    const config = await actualizarFechaEntregaProyecto(frente, fechaEntrega ? new Date(fechaEntrega) : null);
    // Afecta el cálculo de conciliación de todo el portafolio (Dashboard /
    // Cartera en Gestión) -- invalidar el cache para que se recalcule.
    invalidarCacheDashboard();
    res.json(config);
  } catch (err) {
    res.status(err.status || 500).json({ error: err.message });
  }
});

// PUT /api/configuraciones/frentes/:frente/torres/:torre  { fechaEntrega: "2027-03-15" | null }
// Fecha única para TODOS los pisos de la torre -- rechaza si ya hay una
// fecha para todo el proyecto, o fechas configuradas por piso.
router.put('/frentes/:frente/torres/:torre', requireAdmin, async (req, res) => {
  try {
    const frente = decodeURIComponent(req.params.frente);
    const torre = decodeURIComponent(req.params.torre);
    const { fechaEntrega } = req.body || {};
    const config = await actualizarFechaEntregaTorre(frente, torre, fechaEntrega ? new Date(fechaEntrega) : null);
    invalidarCacheDashboard();
    res.json(config);
  } catch (err) {
    res.status(err.status || 500).json({ error: err.message });
  }
});

// PUT /api/configuraciones/frentes/:frente/torres/:torre/pisos/:piso  { fechaEntrega: "2027-03-15" | null }
// Fecha para un piso específico -- rechaza si ya hay una fecha para todo
// el proyecto, o para toda la torre.
router.put('/frentes/:frente/torres/:torre/pisos/:piso', requireAdmin, async (req, res) => {
  try {
    const frente = decodeURIComponent(req.params.frente);
    const torre = decodeURIComponent(req.params.torre);
    const piso = decodeURIComponent(req.params.piso);
    const { fechaEntrega } = req.body || {};
    const config = await actualizarFechaEntregaPiso(frente, torre, piso, fechaEntrega ? new Date(fechaEntrega) : null);
    invalidarCacheDashboard();
    res.json(config);
  } catch (err) {
    res.status(err.status || 500).json({ error: err.message });
  }
});

module.exports = router;
