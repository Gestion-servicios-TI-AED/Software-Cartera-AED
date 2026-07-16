const axios = require('axios');
const { PrismaClient, Prisma } = require('@prisma/client');
const { getAccessToken } = require('./zohoAuth');
const zohoConfig = require('../config/zoho');
const { invalidarCacheDashboard } = require('./dashboardRecaudoService');

const prisma = new PrismaClient();

// ── Backfill de subforms (plan de pagos) ────────────────────────────────────
// Los subforms (Forma_de_Pago / Propuesta_de_Pago) no vienen en el sync
// masivo de Zoho (la API de Deals en bloque no los devuelve, pese a pedirlos
// en el `fields` — solo se obtienen pidiendo el deal individual, como ya hace
// GET /:id/subforms en opportunities.js). Este backfill recorre las
// oportunidades que tienen fecha de inicio de plan de pagos pero ningún
// subform cacheado aún, y los trae uno por uno desde Zoho (mismo fetch +
// limpieza que /:id/subforms). Se llama tanto manualmente (botón en Ajustes)
// como automáticamente después de cada sync de Zoho (ver zohoSync.js), ya
// que ese sync masivo deja formaPago/propuestaPago sin tocar (nunca los
// sobrescribe con null, pero tampoco los completa).

let subformsBackfillRunning = false;
let subformsBackfillResult = null;

const SKIP_SUBFORM_KEYS = ['$in_merge', '$field_states', '$layout_id', '$permissions', 'Parent_Id', 'Created_Time', 'Modified_Time'];
function limpiarFilasSubform(arr) {
  return (arr || []).map((row) =>
    Object.fromEntries(Object.entries(row).filter(([k, v]) => !SKIP_SUBFORM_KEYS.includes(k) && v != null && v !== ''))
  );
}

async function runSubformsBackfill() {
  if (subformsBackfillRunning) return;
  subformsBackfillRunning = true;
  subformsBackfillResult = null;
  const startedAt = Date.now();
  let procesadas = 0;
  let actualizadas = 0;
  let errores = 0;

  // Progreso + tiempo restante estimado, a partir del promedio real de
  // ms/oportunidad hasta ahora (no un estimado fijo) -- se recalcula en
  // cada oportunidad procesada, así que se ajusta solo si Zoho responde
  // más lento o más rápido de lo esperado.
  function reportarProgreso(total) {
    const elapsedMs = Date.now() - startedAt;
    const porcentaje = total > 0 ? Math.round((procesadas / total) * 100) : 100;
    const promedioMsPorItem = procesadas > 0 ? elapsedMs / procesadas : null;
    const restantes = total - procesadas;
    const segundosRestantesEstimados = promedioMsPorItem != null
      ? Math.round((promedioMsPorItem * restantes) / 1000)
      : null;
    subformsBackfillResult = {
      running: true,
      total,
      procesadas,
      porcentaje,
      actualizadas,
      errores,
      segundosTranscurridos: Math.round(elapsedMs / 1000),
      segundosRestantesEstimados,
    };
  }

  try {
    const pendientes = await prisma.opportunity.findMany({
      where: {
        fechaInicioPlanPagos: { not: null },
        formaPago: { equals: Prisma.JsonNull },
        propuestaPago: { equals: Prisma.JsonNull },
      },
      select: { id: true, zohoId: true },
    });

    reportarProgreso(pendientes.length);

    for (const opp of pendientes) {
      try {
        const token = await getAccessToken();
        const response = await axios.get(
          `${zohoConfig.apiBase}/Deals/${opp.zohoId}`,
          {
            headers: { Authorization: `Zoho-oauthtoken ${token}` },
            params: { fields: 'Forma_de_Pago,Propuesta_de_Pago' },
          }
        );
        const deal = response.data?.data?.[0] || {};
        const formaPago = limpiarFilasSubform(deal.Forma_de_Pago);
        const propuestaPago = limpiarFilasSubform(deal.Propuesta_de_Pago);

        await prisma.opportunity.update({
          where: { id: opp.id },
          data: {
            formaPago: formaPago.length ? formaPago : null,
            propuestaPago: propuestaPago.length ? propuestaPago : null,
          },
        });
        actualizadas++;
      } catch (err) {
        errores++;
        console.error(`[subformsBackfill] Error en ${opp.zohoId}:`, err.message);
      }

      procesadas++;
      reportarProgreso(pendientes.length);
      if (procesadas % 50 === 0 || procesadas === pendientes.length) {
        console.log(`[subformsBackfill] Progreso: ${procesadas}/${pendientes.length} (${actualizadas} ok, ${errores} errores)`);
      }
    }

    const elapsed = ((Date.now() - startedAt) / 1000).toFixed(1);
    subformsBackfillResult = { ok: true, total: pendientes.length, actualizadas, errores, elapsed: `${elapsed}s` };
    console.log(`[subformsBackfill] Listo: ${actualizadas}/${pendientes.length} en ${elapsed}s (${errores} errores)`);
    if (actualizadas > 0) invalidarCacheDashboard();
  } catch (err) {
    subformsBackfillResult = { ok: false, error: err.message };
    console.error('[subformsBackfill] Error fatal:', err.message);
  } finally {
    subformsBackfillRunning = false;
  }
}

function isSubformsBackfillRunning() {
  return subformsBackfillRunning;
}

function getSubformsBackfillResult() {
  return subformsBackfillResult;
}

module.exports = { runSubformsBackfill, isSubformsBackfillRunning, getSubformsBackfillResult };
