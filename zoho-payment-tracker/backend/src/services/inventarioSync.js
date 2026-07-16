// Sincronización del módulo Products de Zoho CRM → InventarioItem.
// Trae TODO el inventario (apartamentos, locales, parqueaderos, etc.) sin
// filtrar por categoría. Sync manual (sin cron), mismo patrón de estado en
// memoria que el backfill de Negocios (running/result), no el SyncLog
// compartido de Deals — evita mezclar el estado de sincronizaciones de
// distintos módulos.
const axios = require('axios');
const { PrismaClient } = require('@prisma/client');
const { getAccessToken } = require('./zohoAuth');
const config = require('../config/zoho');
const { invalidarCacheDashboard } = require('./dashboardRecaudoService');

const prisma = new PrismaClient();

async function fetchAllProducts() {
  const token = await getAccessToken();
  const headers = { Authorization: `Zoho-oauthtoken ${token}` };
  const all = [];
  let page = 1;
  let moreRecords = true;

  while (moreRecords) {
    console.log(`[inventario] Fetching Products página ${page}...`);
    const res = await axios.get(`${config.apiBase}/Products`, {
      headers,
      params: { per_page: 200, page },
    });
    const data = res.data.data || [];
    all.push(...data);
    moreRecords = res.data.info?.more_records === true;
    page += 1;
  }

  return all;
}

// Filtra los metadatos internos de Zoho ($state, $approval, etc.) y valores
// vacíos — mismo criterio que se usa para los subforms de Deals. El resto de
// los campos se guardan tal cual vienen de Zoho, sin reformatear.
function limpiarDatos(p) {
  const datos = {};
  for (const [k, v] of Object.entries(p)) {
    if (k.startsWith('$')) continue;
    if (v === null || v === undefined || v === '') continue;
    datos[k] = v;
  }
  return datos;
}

function mapProducto(p) {
  const proyecto = p.Proyecto && typeof p.Proyecto === 'object' ? p.Proyecto.name : p.Proyecto || null;
  return {
    zohoId: p.id,
    nombre: p.Product_Name || p.Nombre || null,
    proyecto,
    torre: p.Proyecto_Torre || p.Block_Tower || null,
    piso: p.Piso || null,
    categoria: p.Product_Category || null,
    estado: p.Estado_del_Inmueble || null,
    referenciaRecaudo: p.Referencia_de_Recaudo || null,
    datos: limpiarDatos(p),
    lastSyncedAt: new Date(),
  };
}

let syncRunning = false;
let syncResult = null;

async function syncInventario() {
  if (syncRunning) return;
  syncRunning = true;
  syncResult = null;
  const startedAt = Date.now();

  try {
    const productos = await fetchAllProducts();
    console.log(`[inventario] ${productos.length} productos traídos de Zoho`);

    const BATCH_SIZE = 50;
    let saved = 0;
    for (let i = 0; i < productos.length; i += BATCH_SIZE) {
      const batch = productos.slice(i, i + BATCH_SIZE);
      await Promise.all(
        batch.map((p) => {
          const data = mapProducto(p);
          return prisma.inventarioItem.upsert({
            where: { zohoId: data.zohoId },
            update: data,
            create: data,
          });
        })
      );
      saved += batch.length;
    }

    const elapsed = ((Date.now() - startedAt) / 1000).toFixed(1);
    syncResult = { ok: true, total: productos.length, saved, elapsed: `${elapsed}s` };
    console.log(`[inventario] Listo: ${saved} productos en ${elapsed}s`);
    invalidarCacheDashboard();
  } catch (err) {
    console.error('[inventario] Error:', err.message);
    syncResult = { ok: false, error: err.message };
  } finally {
    syncRunning = false;
  }
}

function getSyncStatus() {
  return { running: syncRunning, result: syncResult };
}

module.exports = { syncInventario, getSyncStatus };
