require('dotenv').config();
const bcrypt = require('bcryptjs');
const { PrismaClient } = require('@prisma/client');

const prisma = new PrismaClient();

async function main() {
  const email = process.env.ADMIN_EMAIL;
  const password = process.env.ADMIN_PASSWORD;
  const nombre = process.env.ADMIN_NOMBRE;

  if (!email || !password || !nombre) {
    console.error('Faltan ADMIN_EMAIL, ADMIN_PASSWORD o ADMIN_NOMBRE en .env');
    process.exit(1);
  }

  const passwordHash = await bcrypt.hash(password, 10);
  const emailNormalizado = email.toLowerCase().trim();

  const usuario = await prisma.usuario.upsert({
    where: { email: emailNormalizado },
    update: { passwordHash, esAdmin: true, activo: true, nombre },
    create: {
      email: emailNormalizado,
      nombre,
      passwordHash,
      esAdmin: true,
      activo: true,
      modulosPermitidos: [],
    },
  });

  console.log(`Usuario admin listo: ${usuario.email} (id ${usuario.id})`);
  await prisma.$disconnect();
}

main().catch((err) => {
  console.error('Error creando el admin inicial:', err);
  process.exit(1);
});
