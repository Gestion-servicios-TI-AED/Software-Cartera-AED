const { PrismaClient } = require('@prisma/client');

const prisma = new PrismaClient();

// Etapa de cada Torre, según la tabla que definió AED (proyecto + número de
// torre → etapa). Lo que no aparezca acá (Isla Laguna, Vela Village, The
// Plaza, Laguna y Ambiental, Urbanismo, o negocios sin inmueble) cae en "0".
const ETAPA_POR_TORRE = {
  'KABO 1': '1', 'KABO 2': '1', 'PRIVE 2': '1', 'PRIVE 3': '1',
  'KABO 3': '2', 'KABO 4': '2', 'PRIVE 1': '2', 'PRIVE 4': '2',
  'KALA 1': '3', 'KALA 2': '3', 'KALIZA 1': '3', 'KALIZA 2': '3',
  'KALA 3': '4', 'KALA 4': '4', 'KALIZA 3': '4',
};

// Parsea el campo Proyecto_Torre del Product de Zoho ("Kabo - Torre 3",
// "Kala Golf - Torre  4") en { proyecto: "Kabo", torre: "3" }.
function parseProyectoTorre(proyectoTorreRaw) {
  const m = String(proyectoTorreRaw ?? '').match(/^(.+?)\s*-\s*Torre\s*(\d+)/i);
  if (!m) return null;
  const proyecto = m[1].trim().replace(/\s*golf$/i, ''); // "Kala Golf" → "Kala"
  return { proyecto, torre: m[2] };
}

// Etiqueta legible para el selector de negocios: "Kabo Torre 3".
function formatearProyectoTorre(info) {
  return `${info.proyecto} Torre ${info.torre}`;
}

function obtenerEtapaTorre(proyectoTorreRaw) {
  const info = parseProyectoTorre(proyectoTorreRaw);
  return (info && ETAPA_POR_TORRE[`${info.proyecto.toUpperCase()} ${info.torre}`]) ?? '0';
}

// Resuelve el inmueble (Product de Zoho) de cada negocio: primero por
// Referencia de Recaudo directa; si no calza (pasa cuando la Referencia
// viene truncada/enmascarada con "****" en el Excel de origen), por
// Nomenclatura → Código de inmueble, igual que el respaldo del detalle de
// negocio. Devuelve un Map de Negocio.referencia → { datos } de InventarioItem.
async function resolverInventarioPorNegocio(negocios) {
  const refs = negocios.map((n) => n.referencia);
  const items = refs.length
    ? await prisma.inventarioItem.findMany({
        where: { referenciaRecaudo: { in: refs } },
        select: { referenciaRecaudo: true, datos: true },
      })
    : [];
  const porReferencia = new Map(items.map((it) => [it.referenciaRecaudo, it]));

  const pendientes = negocios
    .filter((n) => !porReferencia.has(n.referencia))
    .map((n) => ({ referencia: n.referencia, codigo: n.datos?.Nomenclatura }))
    .filter((p) => p.codigo != null && /^\d+$/.test(String(p.codigo)));
  if (pendientes.length) {
    const encontrados = await Promise.all(
      pendientes.map((p) =>
        prisma.inventarioItem.findFirst({
          where: { datos: { path: ['C_digo_inmueble'], equals: Number(p.codigo) } },
          select: { datos: true },
        })
      )
    );
    pendientes.forEach((p, i) => {
      if (encontrados[i]) porReferencia.set(p.referencia, encontrados[i]);
    });
  }
  return porReferencia;
}

module.exports = {
  prisma,
  ETAPA_POR_TORRE,
  parseProyectoTorre,
  formatearProyectoTorre,
  obtenerEtapaTorre,
  resolverInventarioPorNegocio,
};
