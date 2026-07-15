import axios from 'axios';

const api = axios.create({
  baseURL: '/api',
  timeout: 30000,
});

// Si la sesión expira a mitad de uso, cualquier llamada a la API devuelve 401
// — recargar para que App.jsx vuelva a mostrar el login en vez de dejar la
// pantalla en un estado de error a medias.
api.interceptors.response.use(
  (res) => res,
  (err) => {
    if (err.response?.status === 401 && !err.config?.url?.includes('/auth/')) {
      window.location.reload();
    }
    return Promise.reject(err);
  }
);

export async function login(password) {
  const { data } = await api.post('/auth/login', { password });
  return data;
}

export async function logout() {
  const { data } = await api.post('/auth/logout');
  return data;
}

export async function checkAuth() {
  const { data } = await api.get('/auth/check');
  return data;
}

export async function getOpportunities(params = {}) {
  const { data } = await api.get('/opportunities', { params });
  return data;
}

export async function getOpportunity(id) {
  const { data } = await api.get(`/opportunities/${id}`);
  return data;
}

export async function getStages() {
  const { data } = await api.get('/opportunities/stages');
  return data;
}

export async function triggerSync() {
  const { data } = await api.post('/sync');
  return data;
}

export async function getSyncStatus() {
  const { data } = await api.get('/sync/status');
  return data;
}

export async function getFieldsMetadata() {
  const { data } = await api.get('/fields/metadata');
  return data;
}

export async function getSubforms(id) {
  const { data } = await api.get(`/opportunities/${id}/subforms`);
  return data;
}

// ── Fiducia ────────────────────────────────────────────────
export async function uploadFiducia(formData) {
  const { data } = await api.post('/fiducia/upload', formData, {
    headers: { 'Content-Type': 'multipart/form-data' },
    timeout: 60000,
  });
  return data;
}

export async function getEncargos(params = {}) {
  const { data } = await api.get('/fiducia/encargos', { params });
  return data;
}

export async function getEncargo(id) {
  const { data } = await api.get(`/fiducia/encargos/${id}`);
  return data;
}

export async function getHoja(encargoId, hojaId, page = 1) {
  const { data } = await api.get(`/fiducia/encargos/${encargoId}/hojas/${hojaId}`, {
    params: { page, limit: 500 },
  });
  return data;
}

export async function deleteEncargo(id) {
  const { data } = await api.delete(`/fiducia/encargos/${id}`);
  return data;
}

export async function updateEncargo(id, body) {
  const { data } = await api.patch(`/fiducia/encargos/${id}`, body);
  return data;
}

export async function getMovimientosFiducia(params = {}) {
  const { data } = await api.get('/fiducia/movimientos', { params });
  return data;
}


export async function getNomenclaturas(encargoId, params = {}) {
  const { data } = await api.get(`/fiducia/encargos/${encargoId}/nomenclaturas`, { params });
  return data;
}

export async function getApartamentoDetail(encargoId, referencia) {
  const { data } = await api.get(`/fiducia/encargos/${encargoId}/negocio/${encodeURIComponent(referencia)}`);
  return data;
}

// ── Negocios ───────────────────────────────────────────────
export async function getNegocios(params = {}) {
  const { data } = await api.get('/negocios', { params });
  return data;
}

export async function getNegocio(referencia) {
  const { data } = await api.get(`/negocios/${encodeURIComponent(referencia)}`);
  return data;
}

export async function getNegocioMovimientos(referencia, params = {}) {
  const { data } = await api.get(`/negocios/${encodeURIComponent(referencia)}/movimientos`, { params });
  return data;
}

export async function getInventario(params = {}) {
  const { data } = await api.get('/inventario', { params });
  return data;
}

export async function getInventarioItem(id) {
  const { data } = await api.get(`/inventario/${id}`);
  return data;
}

export async function triggerInventarioSync() {
  const { data } = await api.post('/inventario/sync');
  return data;
}

export async function getInventarioSyncStatus() {
  const { data } = await api.get('/inventario/sync/status');
  return data;
}

export async function getAllNegocioMovimientos(params = {}) {
  const { data } = await api.get('/negocios/movimientos', { params });
  return data;
}

export async function getNegociosStats() {
  const { data } = await api.get('/negocios/stats');
  return data;
}

export async function triggerNegociosBackfill() {
  const { data } = await api.post('/negocios/backfill');
  return data;
}

export async function getNegociosBackfillStatus() {
  const { data } = await api.get('/negocios/backfill/status');
  return data;
}

// ── Stats ──────────────────────────────────────────────────
export async function getStatsResumen() {
  const { data } = await api.get('/stats/resumen');
  return data;
}

export async function getStatsRecaudoMensual() {
  const { data } = await api.get('/stats/recaudo-mensual');
  return data;
}

export async function getStatsPipeline() {
  const { data } = await api.get('/stats/pipeline');
  return data;
}

export async function getStatsTopDeudores(limit = 10) {
  const { data } = await api.get('/stats/top-deudores', { params: { limit } });
  return data;
}

export async function getStatsSync(limit = 5) {
  const { data } = await api.get('/stats/sync', { params: { limit } });
  return data;
}

export async function getStatsCartera() {
  const { data } = await api.get('/stats/cartera');
  return data;
}
