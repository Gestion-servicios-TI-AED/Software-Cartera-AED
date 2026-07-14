const { PrismaClient } = require('@prisma/client');
const p = new PrismaClient();

// Ver todos los campos de tipo email o phone
p.zohoFieldMetadata.findMany({
  where: {
    OR: [
      { dataType: 'email' },
      { dataType: 'phone' },
    ],
  },
  select: { apiName: true, fieldLabel: true, dataType: true },
}).then((r) => {
  console.log('=== Todos los campos email/phone ===');
  console.log(JSON.stringify(r, null, 2));

  // Simular isContactField
  const EXCLUDED_TYPES = ['subform', 'fileupload', 'ownerlookup', 'formula'];
  function isContactField(f) {
    const name = (f.api_name || '').toLowerCase();
    const label = (f.field_label || '').toLowerCase();
    return (
      f.data_type === 'email' || f.data_type === 'phone' ||
      name === 'email' || name === 'phone' || name === 'secondary_email' ||
      name === 'mobile' || name === 'fax' ||
      label === 'email' || label === 'phone' || label === 'mobile' ||
      label.includes('correo') || label.includes('teléfono') || label.includes('telefono')
    ) && !EXCLUDED_TYPES.includes(f.data_type);
  }

  const matched = r.filter(isContactField);
  console.log('\n=== isContactField matchea ===');
  console.log(JSON.stringify(matched.map(f => f.apiName), null, 2));

  p.$disconnect();
});
