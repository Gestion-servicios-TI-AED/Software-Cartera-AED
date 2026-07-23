// Las etapas ya no son siempre numéricas: Kabo/Prive/Kala/Kaliza reparten
// sus torres entre etapas 1-4, pero Isla Laguna, The Plaza y Vela Village
// no tienen ese reparto -- cada uno de esos frentes ES su propia etapa (ya
// no existe una "Etapa 0" genérica que los agrupara). "Sin proyecto" son
// negocios sin ningún inmueble vinculado en Zoho (solo aparece en Negocios).
// Mismo criterio que compararEtapas() en el backend
// (inventarioNegocioService.js) -- no cambiar uno sin el otro.
const SIN_PROYECTO = 'Sin proyecto';

export function esEtapaNumerica(etapa) {
  return /^\d+$/.test(etapa);
}

// "1" -> "Etapa 1"; "Isla Laguna" -> "Isla Laguna" (el frente ya es
// suficientemente descriptivo, no hace falta el prefijo "Etapa").
export function etiquetaEtapa(etapa) {
  return esEtapaNumerica(etapa) ? `Etapa ${etapa}` : etapa;
}

export function compararEtapas(a, b) {
  if (a === SIN_PROYECTO) return b === SIN_PROYECTO ? 0 : 1;
  if (b === SIN_PROYECTO) return -1;
  const aNum = esEtapaNumerica(a);
  const bNum = esEtapaNumerica(b);
  if (aNum && bNum) return Number(a) - Number(b);
  if (aNum) return -1;
  if (bNum) return 1;
  return a.localeCompare(b);
}
