const axios = require('axios');
const { getAccessToken } = require('./zohoAuth');
const config = require('../config/zoho');
const { PrismaClient } = require('@prisma/client');

const prisma = new PrismaClient();

async function zohoGet(path, params = {}) {
  const token = await getAccessToken();
  try {
    const response = await axios.get(`${config.apiBase}${path}`, {
      headers: { Authorization: `Zoho-oauthtoken ${token}` },
      params,
    });
    return response.data;
  } catch (err) {
    if (err.response?.status === 401) {
      // Token expirado — limpiar caché y reintentar una vez
      const auth = require('./zohoAuth');
      auth._clearCache && auth._clearCache();
      const freshToken = await getAccessToken();
      const retry = await axios.get(`${config.apiBase}${path}`, {
        headers: { Authorization: `Zoho-oauthtoken ${freshToken}` },
        params,
      });
      return retry.data;
    }
    throw err;
  }
}

async function syncFieldMetadata() {
  console.log('[sync] Fetching field metadata from Zoho...');
  const data = await zohoGet('/settings/fields', { module: 'Deals' });
  const fields = data.fields || [];

  // Guardar en lotes de 50 para no sobrecargar la BD
  const BATCH = 50;
  for (let i = 0; i < fields.length; i += BATCH) {
    await Promise.all(
      fields.slice(i, i + BATCH).map((field) =>
        prisma.zohoFieldMetadata.upsert({
          where: { apiName: field.api_name },
          update: {
            fieldLabel: field.field_label,
            dataType: field.data_type,
            sectionName: field.section_name || null,
            isCustom: field.custom_field || false,
          },
          create: {
            apiName: field.api_name,
            fieldLabel: field.field_label,
            dataType: field.data_type,
            sectionName: field.section_name || null,
            isCustom: field.custom_field || false,
          },
        })
      )
    );
  }

  console.log(`[sync] Saved ${fields.length} field definitions`);
  return fields;
}

// Tipos que NO se pueden traer en el GET masivo
const EXCLUDED_TYPES = ['subform', 'fileupload', 'ownerlookup', 'formula'];

function isInmuebleField(f) {
  const name = (f.api_name || '').toLowerCase();
  const label = (f.field_label || '').toLowerCase();
  return (
    name === 'torre' || name === 'torre_lista' ||
    name === 'piso' || name === 'piso_lista' ||
    name === 'proyecto' || name === 'subproyecto' ||
    name === 'nomenclatura_inmueble' ||
    name === 'destino_principal_inmueble' ||
    name === 'inmueble' ||
    name === 'estado_del_inmueble_asociado_en_la_fiducia' ||
    label.includes('torre') || label.includes(' piso') ||
    label.includes('nomenclatura') || label.includes('subproyecto')
  );
}

function isCotizacionField(f) {
  const name = (f.api_name || '').toLowerCase();
  const label = (f.field_label || '').toLowerCase();
  return (
    label.includes('cotizaci') || label.includes('cuota') ||
    label.includes('descuento') || label.includes('financiaci') ||
    name.includes('cotiz') || name.includes('cuota') ||
    name.includes('descuento') || name.includes('financiaci')
  ) && !EXCLUDED_TYPES.includes(f.data_type);
}

function buildFieldsList(fields) {
  const baseFields = ['Deal_Name', 'Stage', 'Contact_Name', 'Account_Name', 'Amount', 'Fecha_Inicio_Plan_de_Pagos'];

  const currencyFields = fields
    .filter((f) => f.data_type === 'currency')
    .map((f) => f.api_name);

  const inmuebleFields = fields
    .filter((f) => isInmuebleField(f) && !EXCLUDED_TYPES.includes(f.data_type))
    .map((f) => f.api_name);

  const cotizacionFields = fields
    .filter((f) => isCotizacionField(f))
    .map((f) => f.api_name);

  const recaudoFields = fields
    .filter((f) => {
      const label = (f.field_label || '').toLowerCase();
      return label.includes('recaudo') || label.includes('referencia');
    })
    .filter((f) => !EXCLUDED_TYPES.includes(f.data_type))
    .map((f) => f.api_name);

  const pagoSepFields = fields
    .filter((f) => {
      const label = (f.field_label || '').toLowerCase();
      const name = (f.api_name || '').toLowerCase();
      return (
        (label.includes('pago') && label.includes('separac')) ||
        (name.includes('pago') && name.includes('separac'))
      );
    })
    .map((f) => f.api_name);

  // Campos de descripción de pago (textarea, alternativa a subform)
  // Subforms — se incluyen en el GET del deal y Zoho los devuelve inline
  const subformFields = ['Forma_de_Pago', 'Propuesta_de_Pago'];

  const all = [
    ...new Set([
      ...baseFields,
      ...currencyFields,
      ...inmuebleFields,
      ...cotizacionFields,
      ...recaudoFields,
      ...pagoSepFields,
      ...subformFields,
    ]),
  ];

  return all;
}

async function fetchDealsPage(fieldsList, page, modifiedSince = null) {
  const token = await getAccessToken();
  const headers = { Authorization: `Zoho-oauthtoken ${token}` };
  if (modifiedSince) {
    // Header estándar de Zoho para sync incremental — solo trae cambios recientes
    headers['If-Modified-Since'] = modifiedSince;
  }
  const response = await axios.get(`${config.apiBase}/Deals`, {
    headers,
    params: { fields: fieldsList.join(','), per_page: 200, page },
  });
  return response.data;
}

async function fetchAllDeals(fieldsList, modifiedSince = null) {
  const allDeals = [];
  let page = 1;
  let moreRecords = true;

  if (modifiedSince) {
    console.log(`[sync] Incremental sync — modified since: ${modifiedSince}`);
  } else {
    console.log('[sync] Full sync — fetching all deals');
  }

  while (moreRecords) {
    console.log(`[sync] Fetching deals page ${page}...`);
    try {
      const data = await fetchDealsPage(fieldsList, page, modifiedSince);
      if (data.status === 'error' || !data.data) break;
      const deals = data.data || [];
      allDeals.push(...deals);
      moreRecords = data.info?.more_records === true;
      page += 1;
    } catch (err) {
      // 304 Not Modified — nada cambió desde el último sync
      if (err.response?.status === 304) {
        console.log('[sync] No changes since last sync');
        break;
      }
      throw err;
    }
  }

  return allDeals;
}

const SUBFORM_SKIP_KEYS = ['$in_merge', '$field_states', '$layout_id', '$permissions', 'Parent_Id', 'Created_Time', 'Modified_Time'];

function cleanSubformRow(row) {
  const clean = {};
  for (const [k, v] of Object.entries(row)) {
    if (!SUBFORM_SKIP_KEYS.includes(k) && v !== null && v !== undefined && v !== '') {
      clean[k] = v;
    }
  }
  return clean;
}

function mapDeal(deal, {
  currencyApiNames,
  inmuebleApiNames,
  cotizacionApiNames,
  recaudoField,
  pagoSepField,
}) {
  const camposFinancieros = {};
  for (const apiName of currencyApiNames) {
    if (deal[apiName] != null) camposFinancieros[apiName] = deal[apiName];
  }

  const seccionInmueble = {};
  for (const apiName of inmuebleApiNames) {
    if (deal[apiName] !== undefined) seccionInmueble[apiName] = deal[apiName];
  }

  const seccionCotizacion = {};
  for (const apiName of cotizacionApiNames) {
    if (deal[apiName] !== undefined) seccionCotizacion[apiName] = deal[apiName];
  }

  const pagoSepValue = pagoSepField ? deal[pagoSepField.api_name] : null;

  return {
    zohoId: deal.id,
    dealName: deal.Deal_Name || 'Sin nombre',
    stage: deal.Stage || null,
    contactName: typeof deal.Contact_Name === 'object' ? deal.Contact_Name?.name : deal.Contact_Name || null,
    contactEmail: null, // se obtiene solo en vista detalle si se necesita
    contactPhone: null,
    contactId: typeof deal.Contact_Name === 'object' ? deal.Contact_Name?.id : null,
    accountName: typeof deal.Account_Name === 'object' ? deal.Account_Name?.name : deal.Account_Name || null,
    referenciaRecaudo: recaudoField ? deal[recaudoField.api_name] || null : null,
    pagoSeparacion: pagoSepValue ? new Date(pagoSepValue) : null,
    fechaInicioPlanPagos: deal.Fecha_Inicio_Plan_de_Pagos ? new Date(deal.Fecha_Inicio_Plan_de_Pagos) : null,
    camposFinancieros: Object.keys(camposFinancieros).length ? camposFinancieros : null,
    seccionInmueble: Object.keys(seccionInmueble).length ? seccionInmueble : null,
    seccionCotizacion: Object.keys(seccionCotizacion).length ? seccionCotizacion : null,
    formaPago: Array.isArray(deal.Forma_de_Pago) && deal.Forma_de_Pago.length
      ? deal.Forma_de_Pago.map(cleanSubformRow)
      : null,
    propuestaPago: Array.isArray(deal.Propuesta_de_Pago) && deal.Propuesta_de_Pago.length
      ? deal.Propuesta_de_Pago.map(cleanSubformRow)
      : null,
    lastSyncedAt: new Date(),
  };
}

async function syncOpportunitiesFromZoho(force = false) {
  const log = await prisma.syncLog.create({ data: { status: 'running' } });

  try {
    // 1. Sincronizar metadatos de campos
    const fields = await syncFieldMetadata();

    // 2. Identificar campos clave
    const pagoSepField = fields.find((f) => {
      const label = (f.field_label || '').toLowerCase();
      const name = (f.api_name || '').toLowerCase();
      return (label.includes('pago') && label.includes('separac')) ||
             (name.includes('pago') && name.includes('separac'));
    });

    if (!pagoSepField) {
      throw new Error('No se encontró el campo Pago Separación en los metadatos de Zoho');
    }
    console.log(`[sync] Pago Separación field: ${pagoSepField.api_name} (${pagoSepField.field_label})`);

    const currencyApiNames = fields.filter((f) => f.data_type === 'currency').map((f) => f.api_name);
    const inmuebleApiNames = fields.filter((f) => isInmuebleField(f) && !EXCLUDED_TYPES.includes(f.data_type)).map((f) => f.api_name);
    const cotizacionApiNames = fields.filter((f) => isCotizacionField(f)).map((f) => f.api_name);
    const recaudoField = fields.find((f) => (f.field_label || '').toLowerCase().includes('recaudo'));
    // subforms — se guardan en el sync (vienen inline en el deal response)

    // 3. Construir lista de campos y traer deals
    const fieldsList = buildFieldsList(fields);
    console.log(`[sync] Requesting ${fieldsList.length} fields per deal`);

    // Sync incremental: en syncs sucesivos solo traer cambios recientes (salvo que se fuerce un full sync)
    const lastSuccess = force ? null : await prisma.syncLog.findFirst({
      where: { status: 'success' },
      orderBy: { finishedAt: 'desc' },
    });
    const modifiedSince = lastSuccess?.finishedAt
      ? new Date(lastSuccess.finishedAt).toUTCString()
      : null;

    const allDeals = await fetchAllDeals(fieldsList, modifiedSince);

    // Solo procesar deals que tengan Pago Separación — ignorar el resto
    const deals = allDeals.filter((d) => {
      const v = d[pagoSepField.api_name];
      return v !== null && v !== undefined && v !== '';
    });
    console.log(`[sync] Fetched ${allDeals.length} deals total, ${deals.length} con Pago Separación`);

    const fieldMap = { currencyApiNames, inmuebleApiNames, cotizacionApiNames, recaudoField, pagoSepField };

    // 4. Persistir en lotes de 50 upserts en paralelo
    const BATCH_SIZE = 50;
    let saved = 0;

    for (let i = 0; i < deals.length; i += BATCH_SIZE) {
      const batch = deals.slice(i, i + BATCH_SIZE);
      await Promise.all(
        batch.map((deal) => {
          const data = mapDeal(deal, fieldMap);
          return prisma.opportunity.upsert({
            where: { zohoId: deal.id },
            update: { ...data },
            create: { ...data },
          });
        })
      );
      saved += batch.length;
      if (saved % 500 === 0 || saved === deals.length) {
        console.log(`[sync] Saved ${saved}/${deals.length} records...`);
      }
    }

    await prisma.syncLog.update({
      where: { id: log.id },
      data: { finishedAt: new Date(), status: 'success', recordsSync: saved },
    });

    console.log(`[sync] Done. ${saved} records synced.`);
    return { success: true, recordsSync: saved };
  } catch (err) {
    console.error('[sync] Error:', err.message);
    await prisma.syncLog.update({
      where: { id: log.id },
      data: { finishedAt: new Date(), status: 'error', errorMsg: err.message },
    });
    return { success: false, error: err.message };
  }
}

module.exports = { syncOpportunitiesFromZoho, syncFieldMetadata };
