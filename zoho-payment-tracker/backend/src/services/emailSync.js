const axios = require('axios');
const XLSX = require('xlsx');
const { PrismaClient } = require('@prisma/client');

const prisma = new PrismaClient();

let tokenCache = null;

async function getGraphToken() {
  if (tokenCache && tokenCache.expiresAt > Date.now() + 60000) {
    return tokenCache.token;
  }

  const tenantId = process.env.AZURE_TENANT_ID;
  const clientId = process.env.AZURE_CLIENT_ID;
  const clientSecret = process.env.AZURE_CLIENT_SECRET;

  if (!tenantId || !clientId || !clientSecret) {
    throw new Error('Faltan credenciales de Azure AD (AZURE_TENANT_ID, AZURE_CLIENT_ID, AZURE_CLIENT_SECRET)');
  }

  const response = await axios.post(
    `https://login.microsoftonline.com/${tenantId}/oauth2/v2.0/token`,
    new URLSearchParams({
      grant_type: 'client_credentials',
      client_id: clientId,
      client_secret: clientSecret,
      scope: 'https://graph.microsoft.com/.default',
    }),
    { headers: { 'Content-Type': 'application/x-www-form-urlencoded' } }
  );

  tokenCache = {
    token: response.data.access_token,
    expiresAt: Date.now() + response.data.expires_in * 1000,
  };

  return tokenCache.token;
}

async function graphGet(path, params = {}) {
  const token = await getGraphToken();
  const response = await axios.get(`https://graph.microsoft.com/v1.0${path}`, {
    headers: { Authorization: `Bearer ${token}` },
    params,
  });
  return response.data;
}

// Retorna IDs de correos ya procesados para evitar duplicados
async function getProcessedEmailIds() {
  const rows = await prisma.pagoMovimiento.findMany({
    select: { emailId: true },
    distinct: ['emailId'],
  });
  return new Set(rows.map((r) => r.emailId));
}

// Trae los últimos correos con adjuntos del buzón compartido
async function fetchEmailsWithAttachments(mailbox) {
  const data = await graphGet(`/users/${mailbox}/messages`, {
    $filter: 'hasAttachments eq true',
    $orderby: 'receivedDateTime desc',
    $top: 100,
    $select: 'id,subject,receivedDateTime,hasAttachments',
  });
  return data.value || [];
}

// Descarga los adjuntos Excel de un correo
async function fetchExcelAttachments(mailbox, messageId) {
  const data = await graphGet(`/users/${mailbox}/messages/${messageId}/attachments`, {
    $select: 'id,name,contentType,size,contentBytes',
  });
  return (data.value || []).filter((a) => /\.(xlsx?|xls)$/i.test(a.name || ''));
}

// Convierte buffer de Excel a array de filas (objeto plano por fila)
function parseExcelBuffer(buffer) {
  const workbook = XLSX.read(buffer, { type: 'buffer', cellDates: true });
  const allRows = [];

  for (const sheetName of workbook.SheetNames) {
    const sheet = workbook.Sheets[sheetName];
    const rows = XLSX.utils.sheet_to_json(sheet, { defval: null, raw: false });
    if (rows.length > 0) {
      allRows.push(...rows.map((row) => ({ ...row, _hoja: sheetName })));
    }
  }

  return allRows;
}

// Intenta extraer la referencia recaudo de una fila del Excel
function extractReferencia(row) {
  const matchKey = Object.keys(row).find((k) => {
    const kl = k.toLowerCase();
    return (
      kl.includes('referencia') ||
      kl.includes('recaudo') ||
      kl === 'ref' ||
      kl === 'referencia_recaudo' ||
      kl === 'nro_referencia'
    );
  });
  if (!matchKey) return null;
  const val = row[matchKey];
  return val != null ? String(val).trim() : null;
}

// Procesa un correo: descarga adjuntos, parsea filas y guarda movimientos
async function processEmail(mailbox, email) {
  const attachments = await fetchExcelAttachments(mailbox, email.id);
  if (attachments.length === 0) return 0;

  let totalRows = 0;

  for (const attachment of attachments) {
    if (!attachment.contentBytes) continue;

    const buffer = Buffer.from(attachment.contentBytes, 'base64');
    const rows = parseExcelBuffer(buffer);

    for (const row of rows) {
      const referencia = extractReferencia(row);

      let opportunityId = null;
      if (referencia) {
        const opp = await prisma.opportunity.findFirst({
          where: { referenciaRecaudo: { equals: referencia, mode: 'insensitive' } },
          select: { id: true },
        });
        opportunityId = opp?.id || null;
      }

      await prisma.pagoMovimiento.create({
        data: {
          emailId: email.id,
          emailSubject: email.subject || null,
          emailFecha: email.receivedDateTime ? new Date(email.receivedDateTime) : null,
          archivoNombre: attachment.name || null,
          referencia,
          datos: row,
          opportunityId,
          matched: !!opportunityId,
        },
      });
      totalRows++;
    }
  }

  return totalRows;
}

async function syncEmailMovimientos() {
  const mailbox = process.env.OUTLOOK_SHARED_MAILBOX;
  if (!mailbox) {
    throw new Error('OUTLOOK_SHARED_MAILBOX no está configurado en .env');
  }

  const log = await prisma.emailSyncLog.create({ data: { status: 'running' } });

  try {
    const processedIds = await getProcessedEmailIds();
    const allEmails = await fetchEmailsWithAttachments(mailbox);
    const pending = allEmails.filter((e) => !processedIds.has(e.id));

    console.log(`[emailSync] ${allEmails.length} correos con adjuntos, ${pending.length} sin procesar`);

    let totalMovimientos = 0;

    for (const email of pending) {
      try {
        const count = await processEmail(mailbox, email);
        totalMovimientos += count;
        console.log(`[emailSync] "${email.subject}" — ${count} filas guardadas`);
      } catch (err) {
        console.error(`[emailSync] Error en correo ${email.id}: ${err.message}`);
      }
    }

    await prisma.emailSyncLog.update({
      where: { id: log.id },
      data: {
        finishedAt: new Date(),
        status: 'success',
        emailsProcessed: pending.length,
        movimientosCreados: totalMovimientos,
      },
    });

    console.log(`[emailSync] Listo. ${pending.length} correos, ${totalMovimientos} movimientos.`);
    return { success: true, emailsProcessed: pending.length, movimientosCreados: totalMovimientos };
  } catch (err) {
    console.error('[emailSync] Error:', err.message);
    await prisma.emailSyncLog.update({
      where: { id: log.id },
      data: { finishedAt: new Date(), status: 'error', errorMsg: err.message },
    });
    return { success: false, error: err.message };
  }
}

module.exports = { syncEmailMovimientos };
