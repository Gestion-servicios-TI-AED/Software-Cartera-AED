// Unidades que NO deben contarse en ningún reporte ni listado del portafolio
// (Resumen Gerencial/Consolidado, Dashboard Plan vs. Recaudo, Cartera en
// Gestión, Negocios). Dos criterios independientes:

// 1) Torres excluidas a pedido explícito del usuario (ej. Vela Village Torre
// 2 -- llegó de Zoho pero aún no debe sumarse a la cartera activa).
// Reversible a pedido: para volver a incluir una torre, basta con quitarla
// de este Set.
const PROYECTO_TORRE_EXCLUIDOS = new Set([
  'Vela Village - Torre 2',
]);

// Recibe el valor crudo de InventarioItem.datos.Proyecto_Torre (ej. "Vela
// Village - Torre 2") tal cual viene de Zoho.
function estaExcluidoDelPortafolio(proyectoTorreRaw) {
  return PROYECTO_TORRE_EXCLUIDOS.has(String(proyectoTorreRaw ?? '').trim());
}

// 2) Unidades marcadas manualmente con un "*" al inicio del nombre (ej.
// "*6-E", "*3-B (Des)") -- convención ya usada por el equipo en Zoho para
// señalar un registro de Producto retirado/duplicado que ya no representa un
// inmueble real. Confirmado: los 12 casos existentes hoy en el sistema no
// tienen ningún Negocio real vinculado (ninguna Referencia de Recaudo suya
// aparece en Fiducia), y coinciden EXACTO con la diferencia encontrada entre
// nuestro conteo por Etapa y el reporte oficial de inventario de Zoho
// ("TRABAJAR CONSOLIDADO... JULIO 2026", generado por Fabio Rhenals el
// 30/07/2026): Etapa 1 a 4 tenían 1/3/3/5 unidades de más = 12, exactamente
// las marcadas con "*". Se detecta por patrón (no una lista fija de ids) para
// que cubra automáticamente cualquier caso nuevo marcado igual en el futuro.
function esNombreMarcadoInvalido(nombreRaw) {
  return /^\*/.test(String(nombreRaw ?? '').trim());
}

module.exports = {
  PROYECTO_TORRE_EXCLUIDOS,
  estaExcluidoDelPortafolio,
  esNombreMarcadoInvalido,
};
