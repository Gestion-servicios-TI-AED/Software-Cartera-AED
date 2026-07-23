const { PrismaClient } = require('@prisma/client');
const { valoresProyectoTorre, pisosPorFrenteTorre } = require('./inventarioNegocioService');

const prisma = new PrismaClient();

// Valor especial de "torre"/"piso" que representa "todas" (una sola fecha
// para todo lo que esté debajo de ese nivel), guardado en la misma tabla
// que las torres/pisos individuales -- así el mismo modelo/índice único
// sirve para los tres niveles sin agregar tablas aparte.
const CLAVE_TODAS = '__TODAS__';

class ConflictoConfiguracionError extends Error {
  constructor(message) {
    super(message);
    this.status = 409;
  }
}

function clave(frente, torre, piso) {
  return `${frente}||${torre}||${piso}`;
}

// Lista plana de las tres jerarquías posibles por Frente -- "todo el
// proyecto" (torre: null, piso: null), "toda la torre" (torre, piso: null)
// y cada piso individual (torre, piso) -- con su fecha de entrega
// configurada, si la hay. Se listan TODAS las combinaciones conocidas del
// inventario (no solo las que ya tienen configuración) para que Ajustes
// muestre una fila lista para completar en cada nivel. torre/piso se
// exponen como null (en vez del sentinela interno CLAVE_TODAS) para que
// tanto Ajustes como la resolución en Negocios.jsx puedan tratarlos de
// forma uniforme sin conocer el valor interno.
async function listarConfiguracionesFrente() {
  const [{ torresPorFrente }, pisosPorTorre, configs] = await Promise.all([
    valoresProyectoTorre(),
    pisosPorFrenteTorre(),
    prisma.configuracionFrente.findMany(),
  ]);
  const configPorClave = new Map(configs.map((c) => [clave(c.frente, c.torre, c.piso), c]));

  const filas = [];
  for (const frente of Object.keys(torresPorFrente).sort()) {
    filas.push({
      frente,
      torre: null,
      piso: null,
      fechaEntrega: configPorClave.get(clave(frente, CLAVE_TODAS, CLAVE_TODAS))?.fechaEntrega ?? null,
    });
    for (const torre of torresPorFrente[frente]) {
      filas.push({
        frente,
        torre,
        piso: null,
        fechaEntrega: configPorClave.get(clave(frente, torre, CLAVE_TODAS))?.fechaEntrega ?? null,
      });
      const pisos = pisosPorTorre[frente]?.[torre] ?? [];
      for (const piso of pisos) {
        filas.push({
          frente,
          torre,
          piso,
          fechaEntrega: configPorClave.get(clave(frente, torre, piso))?.fechaEntrega ?? null,
        });
      }
    }
  }
  return filas;
}

// Mapa simple { "Frente||Torre||Piso": fechaEntrega } para consumo interno
// de dashboardRecaudoService -- solo las combinaciones que SÍ tienen fecha
// configurada, con el sentinela CLAVE_TODAS tal cual (no traducido a null,
// a diferencia de listarConfiguracionesFrente) para que el resolver del
// dashboard pueda construir las tres claves de fallback directamente.
async function obtenerFechasEntregaConfiguradas() {
  const configs = await prisma.configuracionFrente.findMany({ where: { fechaEntrega: { not: null } } });
  return new Map(configs.map((c) => [clave(c.frente, c.torre, c.piso), c.fechaEntrega]));
}

// No invalidan el cache del Dashboard acá para evitar una dependencia
// circular (dashboardRecaudoService ya importa este archivo) -- lo hace el
// route handler después de llamar estas funciones.
//
// Los tres niveles son mutuamente excluyentes entre sí: solo uno puede
// tener una fecha activa para una torre/proyecto dado. Si no, quedaría
// ambiguo cuál manda -- hay que borrar el otro nivel antes de configurar.

async function actualizarFechaEntregaProyecto(frente, fechaEntrega) {
  if (fechaEntrega) {
    const conflictos = await prisma.configuracionFrente.findMany({
      where: { frente, fechaEntrega: { not: null }, NOT: { torre: CLAVE_TODAS, piso: CLAVE_TODAS } },
    });
    if (conflictos.length > 0) {
      throw new ConflictoConfiguracionError(
        `"${frente}" ya tiene fechas configuradas por torre o por piso. Bórralas primero para configurar una fecha única para todo el proyecto.`
      );
    }
  }
  const config = await prisma.configuracionFrente.upsert({
    where: { frente_torre_piso: { frente, torre: CLAVE_TODAS, piso: CLAVE_TODAS } },
    update: { fechaEntrega },
    create: { frente, torre: CLAVE_TODAS, piso: CLAVE_TODAS, fechaEntrega },
  });
  return { ...config, torre: null, piso: null };
}

async function actualizarFechaEntregaTorre(frente, torre, fechaEntrega) {
  if (fechaEntrega) {
    const proyecto = await prisma.configuracionFrente.findUnique({
      where: { frente_torre_piso: { frente, torre: CLAVE_TODAS, piso: CLAVE_TODAS } },
    });
    if (proyecto?.fechaEntrega) {
      throw new ConflictoConfiguracionError(
        `"${frente}" ya tiene una fecha configurada para todo el proyecto. Bórrala primero para configurar esta torre por separado.`
      );
    }
    const conPisos = await prisma.configuracionFrente.findMany({
      where: { frente, torre, piso: { not: CLAVE_TODAS }, fechaEntrega: { not: null } },
    });
    if (conPisos.length > 0) {
      throw new ConflictoConfiguracionError(
        `"${frente}" Torre ${torre} ya tiene fechas configuradas por piso. Bórralas primero para configurar una fecha única para toda la torre.`
      );
    }
  }
  const config = await prisma.configuracionFrente.upsert({
    where: { frente_torre_piso: { frente, torre, piso: CLAVE_TODAS } },
    update: { fechaEntrega },
    create: { frente, torre, piso: CLAVE_TODAS, fechaEntrega },
  });
  return { ...config, piso: null };
}

async function actualizarFechaEntregaPiso(frente, torre, piso, fechaEntrega) {
  if (fechaEntrega) {
    const proyecto = await prisma.configuracionFrente.findUnique({
      where: { frente_torre_piso: { frente, torre: CLAVE_TODAS, piso: CLAVE_TODAS } },
    });
    if (proyecto?.fechaEntrega) {
      throw new ConflictoConfiguracionError(
        `"${frente}" ya tiene una fecha configurada para todo el proyecto. Bórrala primero para configurar este piso por separado.`
      );
    }
    const torreConfig = await prisma.configuracionFrente.findUnique({
      where: { frente_torre_piso: { frente, torre, piso: CLAVE_TODAS } },
    });
    if (torreConfig?.fechaEntrega) {
      throw new ConflictoConfiguracionError(
        `"${frente}" Torre ${torre} ya tiene una fecha configurada para toda la torre. Bórrala primero para configurar este piso por separado.`
      );
    }
  }
  return prisma.configuracionFrente.upsert({
    where: { frente_torre_piso: { frente, torre, piso } },
    update: { fechaEntrega },
    create: { frente, torre, piso, fechaEntrega },
  });
}

module.exports = {
  listarConfiguracionesFrente,
  obtenerFechasEntregaConfiguradas,
  actualizarFechaEntregaProyecto,
  actualizarFechaEntregaTorre,
  actualizarFechaEntregaPiso,
  CLAVE_TODAS,
};
