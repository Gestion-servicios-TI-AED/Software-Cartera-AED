const { PrismaClient } = require('@prisma/client');

const prisma = new PrismaClient();

async function registrarAuditoria({ actorId, usuarioId, accion, detalle = null }) {
  await prisma.auditoriaUsuario.create({
    data: { actorId, usuarioId, accion, detalle },
  });
}

async function obtenerAuditoria(limit = 100) {
  return prisma.auditoriaUsuario.findMany({
    orderBy: { createdAt: 'desc' },
    take: limit,
    include: {
      actor: { select: { nombre: true, email: true } },
      usuario: { select: { nombre: true, email: true } },
    },
  });
}

module.exports = { registrarAuditoria, obtenerAuditoria };
