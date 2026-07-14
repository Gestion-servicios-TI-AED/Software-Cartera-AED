const { PrismaClient } = require('@prisma/client');
const p = new PrismaClient();

async function main() {
  // 1. Ver último sync
  const lastSync = await p.syncLog.findFirst({ orderBy: { startedAt: 'desc' } });
  console.log('=== Último sync ===');
  console.log(JSON.stringify(lastSync, null, 2));

  // 2. Stats de email/phone
  const withEmail = await p.opportunity.count({ where: { contactEmail: { not: null } } });
  const withPhone = await p.opportunity.count({ where: { contactPhone: { not: null } } });
  const total = await p.opportunity.count();
  const withContactId = await p.opportunity.count({ where: { contactId: { not: null } } });
  console.log(`\n=== Stats ===`);
  console.log(`Total: ${total}`);
  console.log(`Con contactId: ${withContactId}`);
  console.log(`Con email: ${withEmail}`);
  console.log(`Con phone: ${withPhone}`);

  // 3. Muestra de los que tienen contactId pero NO email
  const missing = await p.opportunity.findMany({
    where: { contactId: { not: null }, contactEmail: null },
    select: { dealName: true, contactId: true, contactName: true },
    take: 5,
  });
  console.log(`\n=== Muestra sin email (tienen contactId) ===`);
  console.log(JSON.stringify(missing, null, 2));

  // 4. Muestra de los que SÍ tienen email
  const withEmailSample = await p.opportunity.findMany({
    where: { contactEmail: { not: null } },
    select: { dealName: true, contactName: true, contactEmail: true, contactPhone: true },
    take: 3,
  });
  console.log(`\n=== Muestra CON email ===`);
  console.log(JSON.stringify(withEmailSample, null, 2));

  // 5. Sin contactId
  const noContactId = await p.opportunity.count({ where: { contactId: null } });
  console.log(`\nSin contactId: ${noContactId}`);

  p.$disconnect();
}

main();
