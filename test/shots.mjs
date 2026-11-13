// Screenshots for comparing versions: dense sky (650 aircraft) at iPhone size.
// Run: node shots.mjs <label>   -> test/out/<label>-iphone-*.png
import { BASE, outDir, browser, setupRoutes, path, server } from './harness.mjs';

const label = process.argv[2] || 'shot';
const iphone = { viewport: { width: 390, height: 844 }, deviceScaleFactor: 3, isMobile: true, hasTouch: true };
for (const [name, opts] of [['portrait', iphone], ['landscape', { ...iphone, viewport: { width: 844, height: 390 } }]]) {
  const context = await browser.newContext(opts);
  await setupRoutes(context, { dense: true });
  await context.addInitScript(() => { try { localStorage.setItem('godview.hint.v1', '1'); } catch { /* */ } });
  const page = await context.newPage();
  await page.goto(BASE, { waitUntil: 'load' });
  await page.waitForFunction(() => window.GodView && document.getElementById('boot') === null, null, { timeout: 60000 }).catch(() => {});
  await page.waitForTimeout(6000);
  await page.screenshot({ path: path.join(outDir, `${label}-iphone-${name}-start.png`) });
  if (name === 'portrait') {
    for (const [h, tag] of [[2500, 'far'], [250, 'mid'], [40, 'near']]) {
      await page.evaluate((h) => window.GodView.globe.jumpTo(33.2, -84.0, h), h);
      await page.waitForTimeout(2500);
      await page.screenshot({ path: path.join(outDir, `${label}-iphone-${tag}.png`) });
    }
  }
  await context.close();
}
await browser.close();
server.close();
console.log('saved', label);
