import axios from 'axios';

const api = axios.create({
  baseURL: '/api',
  timeout: 30000,
});

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

export async function getMovimientos(opportunityId, page = 1) {
  const { data } = await api.get('/pagos/movimientos', { params: { opportunityId, page, limit: 100 } });
  return data;
}

export async function getEmailSyncStatus() {
  const { data } = await api.get('/pagos/email-sync/status');
  return data;
}

export async function triggerEmailSync() {
  const { data } = await api.post('/pagos/email-sync');
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

export async function getPropietarios(params = {}) {
  const { data } = await api.get('/fiducia/propietarios', { params });
  return data;
}

export async function getNomenclaturas(encargoId, params = {}) {
  const { data } = await api.get(`/fiducia/encargos/${encargoId}/nomenclaturas`, { params });
  return data;
}

export async function getNomenclaturaDetail(encargoId, nomenclatura) {
  const { data } = await api.get(`/fiducia/encargos/${encargoId}/nomenclaturas/${encodeURIComponent(nomenclatura)}`);
  return data;
}
