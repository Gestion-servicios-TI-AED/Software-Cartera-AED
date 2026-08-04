// Configuraciones GLOBALES de la app, compartidas por Baía Kristal y Alegra
// (y cualquier proyecto que se agregue después) -- por eso vive en la raíz
// de routes/, no dentro de baia-kristal/. Las configuraciones propias de
// Baía Kristal (fechas de entrega por frente/torre/piso) están en
// baia-kristal/routes/configuracionesFrentes.js, montado también bajo
// /api/configuraciones en index.js.
const express = require('express');
const { obtenerMenuOculto, actualizarMenuOculto } = require('../services/configuracionAppService');

const router = express.Router();

// GET /api/configuraciones/menu -- ítems del sidebar ocultos, global para
// todos (no hay usuarios individuales; antes era una preferencia por
// navegador en localStorage).
router.get('/menu', async (req, res) => {
  try {
    const hidden = await obtenerMenuOculto();
    res.json({ hidden });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// PUT /api/configuraciones/menu  { hidden: string[] }
router.put('/menu', async (req, res) => {
  try {
    const hidden = await actualizarMenuOculto(req.body?.hidden);
    res.json({ hidden });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
