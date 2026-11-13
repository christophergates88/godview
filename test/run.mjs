// GodView offline test harness (not part of the app).
//
// Loads the real app in headless Chrome, but answers every network request
// locally: CDN libraries come from node_modules, data feeds come from the small
// sample responses in test/fixtures.mjs (hand-made in each provider's documented
// format, NOT live data). Then it checks layers, tapping, cards and failures.
//
// Run:  cd test && npm install && node run.mjs
// Env:  GV_NODE_MODULES=/path/to/node_modules   CHROME=/path/to/chrome

import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';
import * as F from './fixtures.mjs';

const here = path.dirname(fileURLToPath(import.meta.url));
const appRoot = path.resolve(here, '..');
const NM = process.env.GV_NODE_MODULES || path.join(here, 'node_modules');
const require = createRequire(NM + '/');
const { chromium } = require('playwright-core');
const CHROME = process.env.CHROME || '/usr/bin/google-chrome';
const outDir = path.join(here, 'out');
fs.mkdirSync(outDir, { recursive: true });

const MIME = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.svg': 'image/svg+xml', '.json': 'application/json', '.png': 'image/png', '.wasm': 'application/wasm', '.glb': 'model/gltf-binary', '.jpg': 'image/jpeg' };

// Serve the app under a sub-path, like GitHub Pages does (/godview/).
const server = http.createServer((req, res) => {
  const u = new URL(req.url, 'http://x');
  if (!u.pathname.startsWith('/godview/')) { res.writeHead(404); return res.end(); }
  let p = path.join(appRoot, decodeURIComponent(u.pathname.slice('/godview/'.length)) || 'index.html');
  if (p.endsWith(path.sep) || p === appRoot) p = path.join(appRoot, 'index.html');
  fs.readFile(p, (err, data) => {
    if (err) { res.writeHead(404); return res.end('nf'); }
    res.writeHead(200, { 'Content-Type': MIME[path.extname(p)] || 'application/octet-stream' });
    res.end(data);
  });
});
await new Promise((r) => server.listen(0, '127.0.0.1', r));
const BASE = `http://127.0.0.1:${server.address().port}/godview/`;

// 1x1-ish PNG tile (solid dark blue) for every map tile request.
const TILE = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk4P9fDwAD/AH+fW8VmQAAAABJRU5ErkJggg==', 'base64');

const results = [];
const check = (name, ok, extra = '') => { results.push({ name, ok, extra }); console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${extra ? '  — ' + extra : ''}`); };

async function setupRoutes(context, mode = {}) {
  const counts = {};
  await context.route('**/*', async (route) => {
    const url = route.request().url();
    const u = new URL(url);
    const host = u.hostname;
    const json = (obj, status = 200) => route.fulfill({ status, contentType: 'application/json', headers: { 'Access-Control-Allow-Origin': '*' }, body: JSON.stringify(obj) });
    counts[host] = (counts[host] || 0) + 1;
    if (host === '127.0.0.1') return route.continue();
    if (host === 'cdn.jsdelivr.net') {
      const m = u.pathname.match(/^\/npm\/(cesium|satellite\.js)@[^/]+\/(.*)$/);
      if (!m) return route.fulfill({ status: 404 });
      const file = path.join(NM, m[1], m[2]);
      if (!fs.existsSync(file)) return route.fulfill({ status: 404, body: 'missing ' + file });
      return route.fulfill({ status: 200, headers: { 'Access-Control-Allow-Origin': '*', 'Content-Type': MIME[path.extname(file)] || 'application/octet-stream' }, body: fs.readFileSync(file) });
    }
    if (host === 'earthquake.usgs.gov') return mode.quakesFail ? json({ error: 'x' }, 500) : json(F.usgs());
    if (host === 'celestrak.org') return json(F.celestrak());
    if (host === 'eonet.gsfc.nasa.gov') return json(F.eonet());
    if (host === 'api.weather.gov') return json(F.nws());
    if (host === 'api.rainviewer.com') return json(F.rainviewer());
    if (host === 'api.open-meteo.com') return json(F.openMeteo());
    if (host === 'geocoding-api.open-meteo.com') return json(u.searchParams.get('name') === 'zzzz' ? {} : F.geocode());
    if (host === 'nominatim.openstreetmap.org') return json(F.nominatim());
    if (host === 'opensky-network.org') return mode.flightsBlocked ? route.abort('failed') : json(F.opensky());
    if (host === 'api.airplanes.live') return mode.flightsBlocked ? route.abort('failed') : json(F.airplaneslive());
    if (/arcgisonline|cartocdn|openstreetmap\.org|rainviewer\.com/.test(host)) {
      return route.fulfill({ status: 200, contentType: 'image/png', headers: { 'Access-Control-Allow-Origin': '*' }, body: TILE });
    }
    return route.abort('blockedbyclient');
  });
  return counts;
}

const browser = await chromium.launch({
  executablePath: CHROME,
  args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist', '--enable-webgl'],
});

async function openApp(ctxOpts, mode, label) {
  const context = await browser.newContext({ ...ctxOpts, permissions: [], geolocation: undefined });
  const counts = await setupRoutes(context, mode);
  const page = await context.newPage();
  const errors = [];
  page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
  page.on('pageerror', (e) => errors.push('pageerror: ' + e.message));
  await page.goto(BASE, { waitUntil: 'load' });
  await page.waitForFunction(() => window.GodView && document.getElementById('boot') === null, null, { timeout: 60000 }).catch(() => {});
  const started = await page.evaluate(() => !!window.GodView);
  check(`[${label}] app starts`, started, started ? '' : await page.evaluate(() => document.body.innerText.slice(0, 200)));
  return { context, page, errors, counts };
}

async function waitLayers(page, ids) {
  await page.waitForFunction((ids) => ids.every((id) => {
    const s = window.GodView.manager.state[id];
    return s && !s.busy && (s.status === 'ok' || s.status === 'error' || s.status === 'limited');
  }), ids, { timeout: 30000 }).catch(() => {});
  return page.evaluate((ids) => Object.fromEntries(ids.map((id) => [id, { ...window.GodView.manager.state[id] }])), ids);
}

// Screen position of an item, for real taps.
async function screenPos(page, layer, key) {
  return page.evaluate(({ layer, key }) => {
    const G = window.GodView; const C = window.Cesium;
    const p = G.manager.position(layer, key);
    if (!p) return null;
    const w = C.SceneTransforms.worldToWindowCoordinates(G.viewer.scene, p);
    return w ? { x: w.x, y: w.y } : null;
  }, { layer, key });
}

// ------------------------------------------------------------ scenario 1: iPhone
{
  const iphone = { viewport: { width: 390, height: 844 }, deviceScaleFactor: 3, isMobile: true, hasTouch: true, userAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1' };
  const { context, page, errors, counts } = await openApp(iphone, {}, 'iPhone');
  // Turn on every layer
  await page.evaluate(() => { for (const l of window.GodView.layers) window.GodView.manager.enable(l.id, true); });
  const st = await waitLayers(page, ['flights', 'satellites', 'earthquakes', 'events', 'radar', 'alerts']);
  check('earthquakes count = sample features', st.earthquakes.status === 'ok' && st.earthquakes.count === F.usgs().features.length, JSON.stringify(st.earthquakes.count));
  check('satellites loaded and propagated', st.satellites.status === 'ok' && st.satellites.count === F.celestrak().length, `${st.satellites.status} ${st.satellites.count} ${st.satellites.message}`);
  check('events count', st.events.status === 'ok' && st.events.count === F.eonet().events.length, `${st.events.count}`);
  check('alerts count (incl. unmapped)', st.alerts.status === 'ok' && st.alerts.count === F.nws().features.length, `${st.alerts.count} note="${st.alerts.note}"`);
  check('radar ok', st.radar.status === 'ok', st.radar.message || st.radar.note);
  check('flights ok (sample, OpenSky format)', st.flights.status === 'ok' && st.flights.count === F.opensky().states.length, `${st.flights.status} ${st.flights.count} ${st.flights.message} ${st.flights.note}`);

  await page.waitForTimeout(1500);
  await page.screenshot({ path: path.join(outDir, 'iphone-main.png') });

  // Tap an earthquake
  const qKey = F.usgs().features[0].id;
  await page.evaluate(() => window.GodView.globe.jumpTo(33.5, -83.4, 900));
  await page.waitForTimeout(800);
  let pos = await screenPos(page, 'earthquakes', qKey);
  if (pos) {
    await page.touchscreen.tap(pos.x, pos.y);
    await page.waitForTimeout(400);
    const title = await page.evaluate(() => !document.getElementById('card').hidden && document.getElementById('card-title').textContent);
    check('tap on quake opens its card', /earthquake/i.test(title || ''), String(title));
    await page.screenshot({ path: path.join(outDir, 'iphone-card-quake.png') });
    await page.click('#card-close');
  } else check('tap on quake opens its card', false, 'quake not on screen');

  // Satellite card + follow
  const satKey = String(F.celestrak()[0].NORAD_CAT_ID);
  const sp = await screenPos(page, 'satellites', satKey);
  const satDesc = await page.evaluate((k) => window.GodView.manager.describe('satellites', k), satKey);
  check('satellite describe has altitude & speed', !!satDesc && /km|mi/.test(satDesc.rows[0][1]) && /mph|km\/h/.test(satDesc.rows[1][1]), satDesc ? `${satDesc.rows[0][1]} / ${satDesc.rows[1][1]}` : 'null');
  check('ISS-like altitude plausible (300-500 km)', !!satDesc && (() => { const v = parseFloat(satDesc.rows[0][1].replace(/,/g, '')); return satDesc.rows[0][1].includes('mi') ? v > 180 && v < 320 : v > 300 && v < 500; })(), satDesc && satDesc.rows[0][1]);
  if (sp) {
    await page.evaluate(() => window.GodView.globe.flyTo(0, 0, 20000, 0));
  }
  // Open satellite card through the same path a tap uses, then follow
  await page.evaluate((k) => {
    const G = window.GodView; const p = G.manager.position('satellites', k);
    const C = window.Cesium; const c = C.Cartographic.fromCartesian(p);
    G.globe.jumpTo(C.Math.toDegrees(c.latitude), C.Math.toDegrees(c.longitude), 8000);
  }, satKey);
  await page.waitForTimeout(800);
  pos = await screenPos(page, 'satellites', satKey);
  if (pos) {
    await page.touchscreen.tap(pos.x, pos.y);
    await page.waitForTimeout(400);
  }
  const satTitle = await page.evaluate(() => !document.getElementById('card').hidden && document.getElementById('card-title').textContent);
  check('tap on satellite opens its card', !!satTitle && satTitle.includes('ISS'), String(satTitle));
  if (satTitle) {
    await page.click('#card-follow');
    await page.waitForTimeout(2500);
    const following = await page.evaluate(() => window.GodView.globe.isFollowing() && !!window.GodView.viewer.trackedEntity);
    check('follow tracks the satellite', following);
    await page.screenshot({ path: path.join(outDir, 'iphone-follow-sat.png') });
    await page.click('#card-close');
    check('closing card stops follow', !(await page.evaluate(() => window.GodView.globe.isFollowing())));
  }

  // Tap bare globe -> weather card
  await page.evaluate(() => window.GodView.globe.jumpTo(32.75, -83.45, 900));
  await page.waitForTimeout(600);
  await page.evaluate(() => { for (const id of ['satellites', 'flights', 'events', 'alerts', 'earthquakes']) window.GodView.manager.enable(id, false); });
  await page.waitForTimeout(300);
  await page.touchscreen.tap(195, 330);
  await page.waitForTimeout(800);
  const wx = await page.evaluate(() => document.getElementById('card-rows').innerText);
  check('tap on globe shows Open-Meteo weather', /Temperature[\s\S]*°F/.test(wx), wx.replace(/\s+/g, ' ').slice(0, 80));
  await page.screenshot({ path: path.join(outDir, 'iphone-card-weather.png') });
  await page.click('#card-close');

  // Search
  await page.fill('#search-input', 'Atlanta');
  await page.press('#search-input', 'Enter');
  await page.waitForTimeout(500);
  const res = await page.evaluate(() => document.getElementById('search-results').innerText);
  check('search shows results', /Atlanta/.test(res), res.replace(/\s+/g, ' ').slice(0, 60));
  await page.click('#search-results button');
  await page.fill('#search-input', 'zzzz');
  await page.press('#search-input', 'Enter');
  await page.waitForTimeout(1800);
  const res2 = await page.evaluate(() => document.getElementById('search-results').innerText);
  check('search falls back to Nominatim', /OSM/.test(res2), res2.replace(/\s+/g, ' ').slice(0, 60));

  // My location with permission denied (no grant in this context)
  await page.click('#btn-locate');
  await page.waitForTimeout(1500);
  const t = await page.evaluate(() => !document.getElementById('toast').hidden && document.getElementById('toast').textContent);
  check('location denied shows a message', !!t, String(t));

  // View styles
  for (const s of ['night', 'thermal', 'crt', 'normal']) {
    await page.evaluate((s) => window.GodView.globe.setViewStyle(s), s);
    await page.waitForTimeout(300);
    if (s !== 'normal') await page.screenshot({ path: path.join(outDir, `iphone-style-${s}.png`) });
  }
  check('view styles apply without errors', !errors.some((e) => /shader|GLSL|PostProcess/i.test(e)), errors.filter((e) => /shader|GLSL/i.test(e)).join(' | ').slice(0, 200));

  // Sheet open + settings
  await page.evaluate(() => { for (const id of ['satellites', 'earthquakes']) window.GodView.manager.enable(id, true); });
  await page.click('#sheet-handle');
  await page.waitForTimeout(400);
  await page.screenshot({ path: path.join(outDir, 'iphone-sheet-open.png') });
  await page.click('#sheet-handle');
  await page.click('#btn-settings');
  await page.waitForTimeout(300);
  await page.screenshot({ path: path.join(outDir, 'iphone-settings.png') });
  await page.selectOption('#settings-body select >> nth=0', 'metric');
  const units = await page.evaluate(() => window.GodView.settings.get('units'));
  check('settings: units change saved', units === 'metric');
  await page.click('#settings-close');

  check('CelesTrak downloaded once (cache honoured)', (counts['celestrak.org'] || 0) === 1, `requests: ${counts['celestrak.org']}`);
  const realErrors = errors.filter((e) => !/favicon/.test(e));
  check('[iPhone] no console errors', realErrors.length === 0, realErrors.slice(0, 5).join(' | '));
  await context.close();
}

// ------------------------------------------------------------ scenario 2: failures
{
  const { context, page, errors } = await openApp({ viewport: { width: 1280, height: 800 } }, { quakesFail: true, flightsBlocked: true }, 'desktop/failures');
  await page.evaluate(() => { for (const l of window.GodView.layers) window.GodView.manager.enable(l.id, true); });
  const st = await waitLayers(page, ['flights', 'earthquakes', 'satellites', 'events']);
  check('USGS 500 -> earthquake layer shows error', st.earthquakes.status === 'error' && /500/.test(st.earthquakes.message), st.earthquakes.message);
  check('flights blocked -> clear message', st.flights.status === 'error' && /blocked/i.test(st.flights.message), st.flights.message);
  check('other layers keep working', st.satellites.status === 'ok' && st.events.status === 'ok');
  const rowText = await page.evaluate(() => document.getElementById('row-earthquakes').innerText);
  check('error visible in layer panel with Retry', /500/.test(rowText) && /Retry/.test(rowText), rowText.replace(/\s+/g, ' '));
  await page.waitForTimeout(800);
  await page.screenshot({ path: path.join(outDir, 'desktop-failures.png') });
  // Desktop card
  await page.evaluate(() => window.GodView.globe.jumpTo(33.5, -83.4, 900));
  await page.waitForTimeout(600);
  const ev = F.eonet().events[0].id;
  const pos = await screenPos(page, 'events', ev);
  if (pos) { await page.mouse.click(pos.x, pos.y); await page.waitForTimeout(400); }
  const title = await page.evaluate(() => !document.getElementById('card').hidden && document.getElementById('card-title').textContent);
  check('click on event opens card (desktop)', !!title && /fire/i.test(title), String(title));
  await page.screenshot({ path: path.join(outDir, 'desktop-card.png') });
  const realErrors = errors.filter((e) => !/favicon|net::ERR_FAILED|Failed to load resource/.test(e));
  check('[desktop] no unexpected console errors', realErrors.length === 0, realErrors.slice(0, 5).join(' | '));
  await context.close();
}

await browser.close();
server.close();
const failed = results.filter((r) => !r.ok);
console.log(`\n${results.length - failed.length}/${results.length} checks passed. Screenshots in test/out/`);
process.exit(failed.length ? 1 : 0);
