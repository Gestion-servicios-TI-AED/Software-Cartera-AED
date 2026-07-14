// Mapa de códigos de proyecto (extraídos del nombre del archivo Excel)
// a sus nombres descriptivos.
const CODIGO_PROYECTO = {
  '99203': 'Etapa 2 : KABO 3 Y 4 , PRIVE 1 Y 4',
  '14607': 'Etapa 1 : KABO 1 Y 2 , PRIVE 2 Y 3',
  '16037': 'Etapa 3 : KALA 1 Y 2 , KALIZA 1 Y 2',
  '99289': 'Etapa 4 : KALA 3 Y 4',
  '99306': 'Etapa 4 : KALIZA 3',
  '16013': 'Vela Village',
  '99331': 'Vela Village',
  '99332': 'Vela Village',
  '16994': 'The Plaza',
  '17664': 'Isla Laguna',
};

// Dado un código (string o number), devuelve la descripción del proyecto o null.
export function descripcionProyecto(codigo) {
  if (codigo == null) return null;
  const key = String(codigo).trim();
  return CODIGO_PROYECTO[key] ?? null;
}
