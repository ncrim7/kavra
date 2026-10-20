// AR pipeline check (software rendering only; real AR is verified on a phone).
// 1. exports the AR model for every option in the page and validates it: true size, feet on the
//    floor, the expected parts, textures embedded, UVs carrying the weave's real-world scale
// 2. as an Android phone: model-viewer loads that model without errors (headless has no AR, so
//    the expected end state is "AR is not available")
// 3. desktop: the QR code dialog opens
// Usage: node scripts/archeck.mjs [url]   (default http://localhost:4173)

import { chromium, devices } from '@playwright/test';
import { NodeIO, getBounds } from '@gltf-transform/core';
import { ALL_EXTENSIONS } from '@gltf-transform/extensions';
import { mkdir, writeFile } from 'node:fs/promises';

const url = process.argv[2] ?? 'http://localhost:4173';
const out = 'screenshots/ar';
await mkdir(out, { recursive: true });
const problems = [];
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const soft = { args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader'] };
const io = new NodeIO().registerExtensions(ALL_EXTENSIONS);
const manifest = (await import('../public/textures/manifest.json', { with: { type: 'json' } })).default;

// the shell's horizontal UV span in metres, read from the model the app loads
async function shellUSpan(file) {
  const { MeshoptDecoder } = await import('meshoptimizer');
  await MeshoptDecoder.ready;
  const d = await new NodeIO().registerExtensions(ALL_EXTENSIONS).registerDependencies({ 'meshopt.decoder': MeshoptDecoder }).read(file);
  const prim = d.getRoot().listNodes().find((n) => n.getName() === 'Shell').getMesh().listPrimitives()[0];
  const uv = prim.getAttribute('TEXCOORD_0');
  let lo = Infinity, hi = -Infinity;
  const e = [0, 0];
  for (let i = 0; i < uv.getCount(); i++) { uv.getElement(i, e); lo = Math.min(lo, e[0]); hi = Math.max(hi, e[0]); }
  return hi - lo;
}
const shellMetres = await shellUSpan('public/models/chair.glb');

async function waitReady(page) {
  await page.waitForSelector('.loading[data-done="true"]', { state: 'attached', timeout: 90_000 });
}

// ---------- 1. export + validate ----------
const browser = await chromium.launch(soft);
for (const [u, l] of [['boucle', 'ash'], ['leather', 'brass']]) {
  const page = await browser.newPage();
  page.on('pageerror', (e) => problems.push(`[export ${u}/${l}] ${e.message}`));
  await page.goto(`${url}/?debug&u=${u}&l=${l}`);
  await waitReady(page);
  await sleep(1500);
  const bytes = await page.evaluate(() => window.__kavraExportAR());
  const file = `${out}/export-${u}-${l}.glb`;
  await writeFile(file, Uint8Array.from(bytes));
  const doc = await io.read(file);
  const root = doc.getRoot();
  const b = getBounds(root.listScenes()[0]);
  const size = b.max.map((v, i) => v - b.min[i]);
  const names = root.listNodes().filter((n) => n.getMesh()).map((n) => n.getName()).sort();
  console.log(`[export ${u}/${l}] ${(bytes.length / 1024).toFixed(0)} KB, size ${size.map((v) => v.toFixed(3)).join(' x ')} m, floor y=${b.min[1].toFixed(4)}, parts ${names.join(',')}, textures ${root.listTextures().length}`);
  if (Math.abs(size[1] - 0.82) > 0.02) problems.push(`[export ${u}/${l}] height ${size[1].toFixed(3)} m, expected 0.82`);
  if (Math.abs(b.min[1]) > 0.002) problems.push(`[export ${u}/${l}] not on the floor (min y ${b.min[1]})`);
  if (names.join() !== 'Legs,Seat,Shell') problems.push(`[export ${u}/${l}] parts ${names.join()}`);
  if (bytes.length > 6 * 1024 * 1024) problems.push(`[export ${u}/${l}] ${bytes.length} bytes is too large for AR`);
  // the shell's UV span divided by the texture's metres = how many times the weave repeats
  const shell = root.listNodes().find((n) => n.getName() === 'Shell').getMesh().listPrimitives()[0];
  const mat = shell.getMaterial();
  if (!mat.getBaseColorTexture()) problems.push(`[export ${u}/${l}] shell has no colour texture`);
  const uv = shell.getAttribute('TEXCOORD_0');
  let lo = Infinity, hi = -Infinity;
  const e = [0, 0];
  for (let i = 0; i < uv.getCount(); i++) { uv.getElement(i, e); lo = Math.min(lo, e[0]); hi = Math.max(hi, e[0]); }
  const set = u === 'boucle' ? 'boucle-ivory' : 'leather-cognac';
  const expected = shellMetres / manifest[set].size[0]; // metres of fabric across / metres per tile
  console.log(`   shell weave repeats ${(hi - lo).toFixed(2)} times (expected ${expected.toFixed(2)}), texture transform ${mat.getBaseColorTextureInfo()?.getExtension('KHR_texture_transform') ? 'PRESENT' : 'none'}`);
  if (Math.abs(hi - lo - expected) > 0.1) problems.push(`[export ${u}/${l}] UV scale off: ${(hi - lo).toFixed(2)} vs ${expected.toFixed(2)}`);
  await page.close();
}

// ---------- 2. Android: model-viewer loads the model ----------
{
  const context = await browser.newContext({ ...devices['Pixel 7'] });
  const page = await context.newPage();
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  page.on('console', (m) => m.type() === 'error' && errors.push(m.text()));
  await page.goto(`${url}/?debug`);
  await waitReady(page);
  const t0 = Date.now();
  let status = '';
  for (let i = 0; i < 150; i++) {
    status = await page.locator('.ar-cta').getAttribute('data-status');
    if (['ready', 'unsupported', 'error'].includes(status)) break;
    await sleep(200);
  }
  const src = await page.evaluate(() => document.querySelector('model-viewer')?.src ?? null);
  console.log(`[android] AR status "${status}" after ${Date.now() - t0} ms, model-viewer src ${src ? src.slice(0, 20) + '…' : 'none'}`);
  if (!['ready', 'unsupported'].includes(status)) problems.push(`[android] AR preparation ended in "${status}"`);
  if (!src?.startsWith('blob:')) problems.push('[android] model-viewer has no model');
  errors.forEach((e) => problems.push(`[android] ${e}`));
  // changing an option rebuilds the AR model
  await page.evaluate(() => document.querySelector('input[value="leather"]').click());
  await sleep(300);
  const during = await page.locator('.ar-cta').getAttribute('data-status');
  for (let i = 0; i < 150 && !['ready', 'unsupported', 'error'].includes(await page.locator('.ar-cta').getAttribute('data-status')); i++) await sleep(200);
  const src2 = await page.evaluate(() => document.querySelector('model-viewer')?.src ?? null);
  console.log(`[android] after switching to leather: "${during}" then new model ${src2 !== src ? 'yes' : 'NO'}; URL ${page.url().split('?')[1]}`);
  if (src2 === src) problems.push('[android] AR model was not rebuilt after a change');
  if (!page.url().includes('u=leather')) problems.push('[android] URL did not follow the configuration');
  await page.screenshot({ path: `${out}/android.png` });
  await context.close();
}

// ---------- 3. desktop QR ----------
{
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
  await page.goto(`${url}/?u=leather&l=brass`);
  await waitReady(page);
  const upholstery = await page.locator('input[value="leather"]').isChecked();
  await page.locator('.ar-cta').click();
  const t0 = Date.now();
  const shown = await page
    .waitForSelector('.qr img', { timeout: 30_000 })
    .then(() => true)
    .catch(() => false);
  if (!shown) problems.push('[desktop] QR dialog did not open');
  const qrUrl = shown ? await page.evaluate(() => window.location.href) : '';
  console.log(`[desktop] opened with ?u=leather: leather selected ${upholstery}; QR ${shown ? `shown after ${Date.now() - t0} ms for ${qrUrl}` : 'NOT shown'}`);
  if (!upholstery) problems.push('[desktop] configuration from the URL was not applied');
  await page.screenshot({ path: `${out}/desktop-qr.png` });
  await page.close();
}

await browser.close();
if (problems.length) {
  console.error(`Problems:\n${problems.join('\n')}`);
  process.exit(1);
}
console.log('AR pipeline checks passed.');
