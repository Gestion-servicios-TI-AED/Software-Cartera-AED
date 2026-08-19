// Etapas (Stage) de Zoho que significan que el negocio se cayó -- desistido,
// backout, o en trámite de desistimiento. Una Oportunidad en cualquiera de
// estas etapas NUNCA debe proveer el plan de pagos vigente de un negocio,
// aunque su Referencia de Recaudo coincida con la de un negocio real (ver
// findOportunidadByReferencia en inventarioNegocioService.js y
// resolverNegociosYOportunidades en dashboardRecaudoService.js) -- confirmado
// con el usuario: "no debe existir ningún negocio desistido con plan de pagos
// vigente". La Referencia de Recaudo duplicada entre una Oportunidad desistida
// y una activa es en sí un error de datos en Zoho (esa referencia debería
// anularse en la desistida), pero mientras eso no se corrija ahí, el
// aplicativo no debe dejar que la desistida opaque a la activa.
const ESTADOS_DESISTIDOS = new Set([
  'DESISTIDO',
  'BACKOUT',
  'PREPARACION CARTA DESISTIMIENTO',
  'NO INTERESADO',
  'DESISTIDO EN APROBACION GERENCIA',
  'CARTA DESISTIMIENTO FIRMADA POR CLIENTE',
  'CARTA DESISTIMIENTO RADICADA',
]);

function esEtapaDesistida(stage) {
  return ESTADOS_DESISTIDOS.has(stage);
}

// Dado un grupo de Opportunity que comparten la misma Referencia de Recaudo
// (debería ser 0 o 1, pero a veces hay más por el error de datos descrito
// arriba), elige cuál es "la" vigente: nunca una desistida si hay al menos
// una que no lo esté; si todas son desistidas (o todas vigentes), gana la de
// menor id -- determinista, no depende del orden en que Postgres las
// devuelva. Recibe objetos con al menos `{ id, stage }`.
function elegirOportunidadVigente(candidatas) {
  if (!candidatas || candidatas.length === 0) return null;
  const vigentes = candidatas.filter((o) => !esEtapaDesistida(o.stage));
  const pool = vigentes.length > 0 ? vigentes : candidatas;
  return [...pool].sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0))[0];
}

module.exports = { ESTADOS_DESISTIDOS, esEtapaDesistida, elegirOportunidadVigente };
