// Cliente HubSpot para el proyecto Alegra -- CRM distinto al de Baía Kristal
// (Zoho), lógica y datos separados a propósito (ver baia-kristal/ para el
// otro lado). HubSpot usa "Private App" access tokens: un token estático
// generado a mano en el portal de HubSpot (Settings → Integrations → Private
// Apps), sin flujo OAuth de por medio -- mucho más simple que el
// refresh-token de Zoho (zohoAuth.js), no hay nada que renovar.
const axios = require('axios');

const HUBSPOT_API_BASE = process.env.HUBSPOT_API_BASE || 'https://api.hubapi.com';

function tokenConfigurado() {
  return !!process.env.HUBSPOT_ACCESS_TOKEN;
}

async function hubspotGet(path, params = {}) {
  const token = process.env.HUBSPOT_ACCESS_TOKEN;
  if (!token) throw new Error('HUBSPOT_ACCESS_TOKEN no configurado en .env');
  const { data } = await axios.get(`${HUBSPOT_API_BASE}${path}`, {
    headers: { Authorization: `Bearer ${token}` },
    params,
  });
  return data;
}

// TODO: una vez definamos qué propiedades del Deal de HubSpot necesitamos
// (equivalente al Pago_Separacion/Forma_de_Pago de Zoho), completar la lista
// de `properties` acá -- por defecto HubSpot solo devuelve un puñado de
// propiedades estándar si no se piden explícitamente.
async function listarDeals({ limit = 100, after } = {}) {
  return hubspotGet('/crm/v3/objects/deals', {
    limit,
    after,
    // properties: 'dealname,amount,dealstage,closedate,...' -- pendiente
  });
}

module.exports = { tokenConfigurado, hubspotGet, listarDeals };
