// Rutas del proyecto Alegra -- por ahora solo un estado de arranque mientras
// se define el esquema de datos (falta el Excel de muestra y las propiedades
// de HubSpot que vamos a usar). Se monta bajo /api/alegra en index.js, ya
// protegido por el mismo login compartido (requireAuth).
const express = require('express');
const { tokenConfigurado } = require('../services/hubspotClient');

const router = express.Router();

// GET /api/alegra/status -- confirma que el módulo está montado y si ya hay
// credenciales de HubSpot configuradas, sin exponer el token.
router.get('/status', (req, res) => {
  res.json({
    modulo: 'alegra',
    hubspotConfigurado: tokenConfigurado(),
  });
});

module.exports = router;
