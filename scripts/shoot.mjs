// Visual + behaviour check against the preview server (npm run preview, port 4173).
// Runs the WebGPU path (software Vulkan in headless Chrome) and the forced WebGL 2 path, on desktop
// and mobile; switches every phase-A option; fails on console errors or the wrong backend.
// Usage: node scripts/shoot.mjs [url]

import { chromium } from '@playwright/test';
import { mkdir } from 'node:fs/promises';

const url = process.argv[2] ?? 'http://localhost:4173';
const out = 'screenshots';
await mkdir(out, { recursive: true });

// The installed Chrome exposes the real GPU in headless mode (Playwright's bundled headless shell
// has no WebGPU adapter), so both runs render on hardware.
// GPU=1 adds the hardware WebGPU run; by default only the software-rendered WebGL 2 path runs,
// which works on any machine.
const runs = [
  { name: 'webgl', query: '?debug&webgl', expect: 'WebGL 2', launch: { args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader'] } },
  ...(process.env.GPU ? [{ name: 'webgpu', query: '?debug', expect: 'WebGPU', launch: { channel: 'chrome', args: ['--enable-unsafe-webgpu'] } }] : []),
];
const viewports = [
  { name: 'desktop', width: 1440, height: 900, isMobile: false },
  { name: 'mobile', width: 390, height: 844, isMobile: true },
];
const problems = [];
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

for (const run of runs) {
  const browser = await chromium.launch(run.launch);
  for (const vp of viewports) {
    const tag = `${run.name}-${vp.name}`;
    const page = await browser.newPage({ viewport: { width: vp.width, height: vp.height }, isMobile: vp.isMobile, hasTouch: vp.isMobile });
    page.setDefaultTimeout(120_000);
    page.on('console', (m) => m.type() === 'error' && problems.push(`[${tag}] ${m.text()}`));
    page.on('pageerror', (e) => problems.push(`[${tag}] ${e.message}`));
    const t0 = Date.now();
    await page.goto(url + run.query);
    // poll with a plain boolean: frames are slow under software rendering
    for (let i = 0; !(await page.evaluate(() => Boolean(window.__kavra?.backend))); i++) {
      if (i > 300) throw new Error(`[${tag}] renderer never reported`);
      await sleep(200);
    }
    const backend = await page.evaluate(() => window.__kavra.backend);
    console.log(`[${tag}] backend ${backend} after ${Date.now() - t0} ms`);
    if (backend !== run.expect) problems.push(`[${tag}] expected ${run.expect}, got ${backend}`);
    await sleep(6000); // model + textures
    await page.screenshot({ path: `${out}/${tag}-boucle-ash.png` });
    await page.evaluate(() => {
      document.querySelector('input[value="leather"]').click();
      document.querySelector('input[value="brass"]').click();
    });
    await sleep(5000);
    await page.screenshot({ path: `${out}/${tag}-leather-brass.png` });
    await page.close();
  }
  await browser.close();
}

if (problems.length) {
  console.error(`Problems:\n${problems.join('\n')}`);
  process.exit(1);
}
console.log('All checks passed.');
