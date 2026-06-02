import { chromium } from 'playwright';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const BASE      = 'http://localhost:5173';
const OUT       = path.join(__dirname, 'screenshots');

const browser = await chromium.launch({ headless: true });
const page    = await browser.newPage();
await page.setViewportSize({ width: 1440, height: 900 });

async function shot(name, url, waitFor, extraDelay = 1500) {
  console.log(`📸 ${name} → ${url}`);
  await page.goto(`${BASE}${url}`, { waitUntil: 'networkidle', timeout: 20000 });
  if (waitFor) await page.waitForSelector(waitFor, { timeout: 8000 }).catch(() => {});
  await page.waitForTimeout(extraDelay);
  await page.screenshot({ path: path.join(OUT, `${name}.png`), fullPage: false });
  console.log(`   ✓ guardado`);
}

// 1. Oportunidades (dashboard)
await shot('01-oportunidades', '/oportunidades', '.card');

// 2. Detalle de oportunidad (primera disponible)
try {
  await page.goto(`${BASE}/oportunidades`, { waitUntil: 'networkidle', timeout: 15000 });
  await page.waitForTimeout(2000);
  const firstRow = await page.$('table tbody tr:first-child td:first-child');
  if (firstRow) {
    await firstRow.click();
    await page.waitForTimeout(2000);
    await page.screenshot({ path: path.join(OUT, '02-oportunidad-detalle.png'), fullPage: false });
    console.log('📸 02-oportunidad-detalle ✓');
  }
} catch (e) { console.log('02-oportunidad-detalle: omitido -', e.message); }

// 3. Negocios con stats dashboard
await shot('03-negocios-dashboard', '/', '.card', 2500);

// 4. Fiducia — lista de encargos
await shot('04-fiducia-encargos', '/fiducia', '.card');

// 5. Fiducia — movimientos
await shot('05-fiducia-movimientos', '/fiducia/movimientos', 'table, .card');

// 6. Negocios — con un negocio seleccionado (click en el primero)
try {
  await page.goto(`${BASE}/`, { waitUntil: 'networkidle', timeout: 15000 });
  await page.waitForTimeout(2000);
  const firstNeg = await page.$('button[class*="border-b border-aed-border"]');
  if (firstNeg) {
    await firstNeg.click();
    await page.waitForTimeout(2500);
    await page.screenshot({ path: path.join(OUT, '06-negocio-detalle.png'), fullPage: false });
    console.log('📸 06-negocio-detalle ✓');
  }
} catch (e) { console.log('06-negocio-detalle: omitido -', e.message); }

await browser.close();
console.log('\n✅ Capturas completadas en:', OUT);
