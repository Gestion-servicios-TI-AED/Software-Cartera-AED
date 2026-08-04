const axios = require('axios');
const config = require('../config/zoho');

let cachedToken = null;
let tokenExpiresAt = null;

async function fetchNewAccessToken() {
  const params = new URLSearchParams({
    grant_type: 'refresh_token',
    client_id: config.clientId,
    client_secret: config.clientSecret,
    refresh_token: config.refreshToken,
  });

  const response = await axios.post(
    `${config.accountsUrl}/oauth/v2/token`,
    params.toString(),
    { headers: { 'Content-Type': 'application/x-www-form-urlencoded' } }
  );

  if (response.data.error) {
    throw new Error(`Zoho OAuth error: ${response.data.error}`);
  }

  return {
    token: response.data.access_token,
    expiresIn: response.data.expires_in || 3600,
  };
}

async function getAccessToken() {
  const now = Date.now();
  const bufferMs = 5 * 60 * 1000; // renovar 5 min antes de expirar

  if (cachedToken && tokenExpiresAt && now < tokenExpiresAt - bufferMs) {
    return cachedToken;
  }

  const { token, expiresIn } = await fetchNewAccessToken();
  cachedToken = token;
  tokenExpiresAt = now + expiresIn * 1000;

  return cachedToken;
}

function _clearCache() {
  cachedToken = null;
  tokenExpiresAt = null;
}

module.exports = { getAccessToken, _clearCache };
