// Configuración global de la app (ver modelo ConfiguracionApp en schema.prisma
// -- clave/valor genérico, compartido por todos porque no hay usuarios
// individuales). Hoy solo se usa para `menuOculto`.
const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

const CLAVE_MENU_OCULTO = 'menuOculto';

async function obtenerMenuOculto() {
  const fila = await prisma.configuracionApp.findUnique({ where: { clave: CLAVE_MENU_OCULTO } });
  return Array.isArray(fila?.valor) ? fila.valor : [];
}

async function actualizarMenuOculto(hidden) {
  const valor = Array.isArray(hidden) ? hidden.filter((k) => typeof k === 'string') : [];
  await prisma.configuracionApp.upsert({
    where: { clave: CLAVE_MENU_OCULTO },
    create: { clave: CLAVE_MENU_OCULTO, valor },
    update: { valor },
  });
  return valor;
}

module.exports = { obtenerMenuOculto, actualizarMenuOculto };
