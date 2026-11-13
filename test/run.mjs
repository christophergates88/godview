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
import { answerPeople } from './fixtures-people.mjs'; // People & records sample data

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

// What each data host answers in the tests (sample data, see fixtures.mjs).
const RELAY_ONLY = new Set(['api.adsb.lol', 'opensky-network.org', 'api.airplanes.live', 'opendata.adsb.fi', 'nasstatus.faa.gov', 'www.ndbc.noaa.gov', 'www.nhc.noaa.gov', 'droughtmonitor.unl.edu', 'www.submarinecablemap.com', '511ga.org', 'www.missingkids.org']);
function answer(u, mode) {
  const host = u.hostname; const p = u.pathname;
  const J = (obj, status = 200) => ({ status, type: 'application/json', body: JSON.stringify(obj) });
  const T = (text, type = 'text/plain') => ({ status: 200, type, body: text });
  const people = answerPeople(u); if (people) return people; // People & records hosts
  switch (host) {
    case 'earthquake.usgs.gov': return mode.quakesFail ? J({ error: 'x' }, 500) : J(F.usgs());
    case 'celestrak.org': return J(F.celestrak());
    case 'eonet.gsfc.nasa.gov': return J(F.eonet());
    case 'api.weather.gov': return J(F.nws());
    case 'api.rainviewer.com': return J(F.rainviewer());
    case 'api.open-meteo.com': {
      const n = (u.searchParams.get('latitude') || '').split(',').length;
      return J(n > 1 ? F.openMeteoGrid(n) : F.openMeteo());
    }
    case 'air-quality-api.open-meteo.com': return J(F.openMeteoGrid((u.searchParams.get('latitude') || '').split(',').length));
    case 'geocoding-api.open-meteo.com': return J(u.searchParams.get('name') === 'zzzz' ? {} : F.geocode());
    case 'nominatim.openstreetmap.org': return J(F.nominatim());
    case 'api.adsb.lol':
      if (mode.flightsBlocked) return 'abort';
      if (p === '/v2/mil') return J(F.adsbMil());
      if (p.startsWith('/v2/sqk/')) return J(F.adsbSqk(p.split('/').pop()));
      return J(F.airplaneslive());
    case 'opensky-network.org': return mode.flightsBlocked ? 'abort' : J(F.opensky());
    case 'api.airplanes.live': return mode.flightsBlocked ? 'abort' : J(F.airplaneslive());
    case 'nasstatus.faa.gov': return T(F.faa(), 'application/xml');
    case 'll.thespacedevs.com': return J(F.launches());
    case 'services.swpc.noaa.gov': return J(/ovation/.test(p) ? F.ovation() : F.kp());
    case 'api.tidesandcurrents.noaa.gov':
      if (/mdapi/.test(p)) return J(F.tideStations());
      return J(u.searchParams.get('product') === 'predictions' ? F.tidePred() : F.tideWL());
    case 'www.ndbc.noaa.gov': return T(F.ndbc());
    case 'www.spc.noaa.gov': return /csv$/.test(p) ? T(F.spcCsv(), 'text/csv') : J(F.spcOutlook());
    case 'www.nhc.noaa.gov': return J(F.nhc());
    case 'services3.arcgis.com': return J(/Perimeters/.test(p) ? F.perimeters() : F.incidents());
    case 'firms.modaps.eosdis.nasa.gov': return T(F.firmsCsv(), 'text/csv');
    case 'volcanoes.usgs.gov': return J(F.volcanoes());
    case 'api.water.noaa.gov': return J(F.gauges());
    case 'droughtmonitor.unl.edu': return J(F.drought());
    case '511ga.org':
      if (/cameras/.test(p)) return u.searchParams.get('key') ? J(F.ga511Cams()) : J({ error: 'key' }, 401);
      if (/event/.test(p)) return J(F.ga511Events());
      return { status: 200, type: 'image/png', body: TILE };
    case 'cwwp2.dot.ca.gov': return J(F.caltrans());
    case 'api-v3.amtraker.com': return J(F.amtrak());
    case 'overpass-api.de': return J(F.overpass(u.searchParams.get('data') || ''));
    case 'www.submarinecablemap.com': return J(F.cables());
    case 'de1.api.radio-browser.info': return J(F.radio());
    case 'en.wikipedia.org': return J(/summary/.test(p) ? F.wikiSummary() : F.wikiGeo());
    case 'api.inaturalist.org': return J(F.inat());
    default:
      if (/^gbfs\./.test(host)) return J(/status/.test(p) ? F.gbfsStatus() : F.gbfsInfo());
      if (/arcgisonline|cartocdn|openstreetmap\.org|rainviewer\.com|gibs\.earthdata\.nasa\.gov/.test(host)) return { status: 200, type: 'image/png', body: TILE };
      return null;
  }
}

async function setupRoutes(context, mode = {}) {
  const counts = {};
  await context.route('**/*', async (route) => {
    const url = route.request().url();
    const u = new URL(url);
    const host = u.hostname;
    counts[host] = (counts[host] || 0) + 1;
    if (host === '127.0.0.1') return route.continue();
    if (host === 'cdn.jsdelivr.net') {
      const m = u.pathname.match(/^\/npm\/(cesium|satellite\.js)@[^/]+\/(.*)$/);
      if (!m) return route.fulfill({ status: 404 });
      const file = path.join(NM, m[1], m[2]);
      if (!fs.existsSync(file)) return route.fulfill({ status: 404, body: 'missing ' + file });
      return route.fulfill({ status: 200, headers: { 'Access-Control-Allow-Origin': '*', 'Content-Type': MIME[path.extname(file)] || 'application/octet-stream' }, body: fs.readFileSync(file) });
    }
    let target = u;
    if (/workers\.dev$/.test(host)) {           // the data relay
      if (mode.relayDown) return route.abort('failed');
      target = new URL(u.searchParams.get('url'));
      counts['relay:' + target.hostname] = (counts['relay:' + target.hostname] || 0) + 1;
    } else if (RELAY_ONLY.has(host)) {
      return route.abort('failed');               // like the real browser: CORS-blocked
    }
    const a = answer(target, mode);
    if (a === 'abort' || !a) return route.abort(a ? 'failed' : 'blockedbyclient');
    return route.fulfill({ status: a.status, contentType: a.type, headers: { 'Access-Control-Allow-Origin': '*' }, body: a.body });
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
  // Turn on the v1 layers (several are on by default anyway)
  await page.waitForTimeout(3000);
  await page.evaluate((ids) => { for (const id of ids) window.GodView.manager.enable(id, true); }, ['flights', 'satellites', 'earthquakes', 'events', 'radar', 'alerts']);
  const st = await waitLayers(page, ['flights', 'satellites', 'earthquakes', 'events', 'radar', 'alerts']);
  check('earthquakes count = sample features', st.earthquakes.status === 'ok' && st.earthquakes.count === F.usgs().features.length, JSON.stringify(st.earthquakes.count));
  check('satellites loaded and propagated', st.satellites.status === 'ok' && st.satellites.count === F.celestrak().length, `${st.satellites.status} ${st.satellites.count} ${st.satellites.message}`);
  check('events count', st.events.status === 'ok' && st.events.count === F.eonet().events.length, `${st.events.count}`);
  check('alerts count (incl. unmapped)', st.alerts.status === 'ok' && st.alerts.count === F.nws().features.length, `${st.alerts.count} note="${st.alerts.note}"`);
  check('radar ok', st.radar.status === 'ok', st.radar.message || st.radar.note);
  check('flights ok via relay (adsb.lol sample)', st.flights.status === 'ok' && st.flights.count === F.airplaneslive().ac.length && st.flights.via === 'relay', `${st.flights.status} ${st.flights.count} via=${st.flights.via} ${st.flights.message} ${st.flights.note}`);

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
  await page.evaluate(() => { for (const l of window.GodView.layers) window.GodView.manager.enable(l.id, false); });
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
  await page.waitForTimeout(3000);
  await page.evaluate(() => { for (const l of window.GodView.layers) window.GodView.manager.enable(l.id, false); });
  await page.evaluate((ids) => { for (const id of ids) window.GodView.manager.enable(id, true); }, ['flights', 'satellites', 'earthquakes', 'events', 'radar', 'alerts']);
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

// ------------------------------------------------------------ scenario 3: every layer, keys set, self-test, groups, briefing
{
  const context = await browser.newContext({ viewport: { width: 1280, height: 900 } });
  const counts = await setupRoutes(context, {});
  await context.addInitScript(() => {
    if (!sessionStorage.getItem('seeded')) {
      localStorage.setItem('godview.apikeys.v1', JSON.stringify({ ga511: 'TESTKEY511', firms: 'TESTFIRMS' }));
      sessionStorage.setItem('seeded', '1');
    }
  });
  const page = await context.newPage();
  const errors = [];
  page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
  page.on('pageerror', (e) => errors.push('pageerror: ' + e.message));
  await page.goto(BASE, { waitUntil: 'load' });
  await page.waitForFunction(() => window.GodView && document.getElementById('boot') === null, null, { timeout: 60000 }).catch(() => {});
  await page.evaluate(() => window.GodView.globe.jumpTo(33.3, -83.4, 330));
  await page.waitForTimeout(2500);
  const nLayers = await page.evaluate(() => window.GodView.layers.length);
  check('registry has 25-60 layers', nLayers >= 25 && nLayers <= 60, String(nLayers));

  // Self-test: must resolve, cover every layer, and not change saved settings.
  const before = await page.evaluate(() => localStorage.getItem('godview.settings.v1'));
  const t0 = Date.now();
  const res = await page.evaluate(() => window.GodView.selfTest());
  const after = await page.evaluate(() => localStorage.getItem('godview.settings.v1'));
  fs.writeFileSync(path.join(outDir, 'selftest-sample.json'), JSON.stringify(res, null, 1));
  check('selfTest resolves < 60 s with one row per layer', Array.isArray(res) && res.length === nLayers && Date.now() - t0 < 60000, `${res.length} rows in ${Date.now() - t0} ms`);
  const bad = res.filter((r) => !r.ok);
  check('selfTest: every layer ok against sample data', bad.length === 0, bad.map((r) => `${r.id}: ${r.error}`).join(' | '));
  check('selfTest rows have the agreed fields', res.every((r) => ['id', 'name', 'ok', 'count', 'ms', 'via', 'error'].every((k) => k in r)));
  check('selfTest via values sensible', res.every((r) => ['direct', 'relay', 'computed', 'needs-key', null].includes(r.via)) && res.find((r) => r.id === 'buoys').via === 'relay' && res.find((r) => r.id === 'daynight').via === 'computed', res.map((r) => `${r.id}=${r.via}`).join(' '));
  check('selfTest does not change saved settings', before === after);

  // Turn on everything (staggered, like "All on")
  await page.evaluate(() => window.GodView.layers.forEach((l, i) => setTimeout(() => window.GodView.manager.enable(l.id, true), i * 60)));
  await page.waitForTimeout(9000);
  console.log('   overpass requests:', counts['overpass-api.de'], 'relay overpass:', counts['relay:overpass-api.de']);
  const st = await page.evaluate(() => Object.fromEntries(window.GodView.layers.map((l) => [l.id, { status: window.GodView.manager.state[l.id].status, count: window.GodView.manager.state[l.id].count, msg: window.GodView.manager.state[l.id].message, via: window.GodView.manager.state[l.id].via }])));
  const notOk = Object.entries(st).filter(([, v]) => v.status !== 'ok');
  check('all layers on: every one loads', notOk.length === 0, notOk.map(([k, v]) => `${k}:${v.status} ${v.msg}`).join(' | '));
  // caltrans/bikeshare: no system near Georgia; cellTowers: only loads when zoomed in under 300 km.
  const empty = Object.entries(st).filter(([k, v]) => v.count === 0 && !['caltrans', 'bikeshare', 'cellTowers'].includes(k));
  check('all layers on: sample items drawn', empty.length === 0, empty.map(([k]) => k).join(', '));
  await page.screenshot({ path: path.join(outDir, 'desktop-all-layers.png') });

  // People & records: cards with official links and big numbers; tapped-point officials; privacy.
  {
    const ppl = await page.evaluate(() => {
      const M = window.GodView.manager;
      const d = M.describe('peopleOfficials', 'here');
      const c = M.describe('peopleCensus', 'tract');
      const epa = M.layers.find((l) => l.id === 'peopleEpa').items().map((i) => i.title);
      const money = M.describe('peopleMoney', '13237');
      return { rows: d && d.rows.map((r) => r[0]), links: d && d.links.length, stats: c && c.stats.length, epa, money: money && money.rows.map((r) => r[1]).join(' | ') };
    });
    check('[people] officials card: senators, representative, governor, state legislators + links', !!ppl.rows && ['US Senator', 'US Representative', 'Governor', 'State senator', 'State representative'].every((k) => ppl.rows.includes(k)) && ppl.links >= 6, JSON.stringify(ppl.rows));
    check('[people] census card has big numbers', ppl.stats === 6, String(ppl.stats));
    check('[people] person-named EPA site shown without its name', ppl.epa.includes('Private site') && !ppl.epa.some((x) => /Smith/i.test(x)), ppl.epa.join(', '));
    check('[people] federal money card names organizations only', /Board Of Education/.test(ppl.money || '') && !/SAMPLEFARMER/i.test(ppl.money || '') && /not named/.test(ppl.money || ''), ppl.money);
    // Open the officials card the way a tap does, and check links + FEC details render
    const opened = await page.evaluate(async () => {
      const G = window.GodView; const p = G.manager.position('peopleOfficials', 'here');
      const C = window.Cesium; const c = C.Cartographic.fromCartesian(p);
      G.globe.jumpTo(C.Math.toDegrees(c.latitude), C.Math.toDegrees(c.longitude), 20);
      return true;
    });
    await page.waitForTimeout(1200);
    const pp = await screenPos(page, 'peopleOfficials', 'here');
    if (opened && pp) { await page.mouse.click(pp.x, pp.y); await page.waitForTimeout(1500); }
    const cardInfo = await page.evaluate(() => ({ title: document.getElementById('card-title').textContent, links: document.querySelectorAll('#card-extra .gv-links a').length, rows: document.getElementById('card-rows').innerText }));
    check('[people] tap opens officials card with link buttons and campaign totals', /Putnam County/.test(cardInfo.title) && cardInfo.links >= 6 && /Raised \$12\.3M/.test(cardInfo.rows), `${cardInfo.title} links=${cardInfo.links} ${cardInfo.rows.replace(/\s+/g, ' ').slice(0, 160)}`);
    await page.screenshot({ path: path.join(outDir, 'desktop-people-officials.png') });
    await page.click('#card-close');
  }

  // Group panel: filter, collapse, all-off
  await page.fill('#layer-filter', 'camera');
  const visible = await page.evaluate(() => [...document.querySelectorAll('.layer-row')].filter((r) => !r.hidden).map((r) => r.id));
  check('layer filter narrows the list', visible.length >= 2 && visible.length <= 4 && visible.every((id) => /ga511Cameras|caltrans|alpr/.test(id)), visible.join(','));
  await page.fill('#layer-filter', '');
  await page.click('#group-sea .g-all[data-on="0"]');
  await page.waitForTimeout(300);
  const seaOff = await page.evaluate(() => ['tides', 'buoys'].every((id) => !window.GodView.manager.state[id].enabled));
  check('group "Off" turns the whole group off', seaOff);
  const gcount = await page.evaluate(() => document.querySelector('#group-air .g-count').textContent);
  check('group header shows counts', /\d+\/\d+ on/.test(gcount), gcount);

  // Card with image (GA 511 camera) and on-demand details (tides)
  await page.evaluate(() => { window.GodView.manager.enable('tides', true); });
  await page.waitForTimeout(1500);
  const camCard = await page.evaluate(() => { const d = window.GodView.manager.describe('ga511Cameras', '186'); return d && d.image; });
  check('GA 511 camera card has an image', /511ga\.org\/map\/Cctv\/186/.test(camCard || ''), String(camCard));
  const det = await page.evaluate(() => window.GodView.manager.details('tides', '8670870'));
  check('tide station details load (level + predictions)', Array.isArray(det) && det.some((r) => /Water level/.test(r[0])) && det.some((r) => /tide/.test(r[0])), JSON.stringify(det).slice(0, 120));

  // Briefing
  await page.click('#btn-brief');
  await page.waitForTimeout(2500);
  const brief = await page.evaluate(() => document.getElementById('card-brief').innerText);
  check("What's here briefing builds from loaded layers", /Weather now/i.test(brief) && /aircraft within/.test(brief) && /In effect here: Severe/.test(brief) && /inside .*Slight Risk/.test(brief) && (brief.match(/Next pass/g) || []).length <= 2, brief.replace(/\s+/g, ' ').slice(0, 300));
  fs.writeFileSync(path.join(outDir, 'brief-sample.txt'), brief);
  await page.screenshot({ path: path.join(outDir, 'desktop-brief.png') });

  check('relay used only for relay hosts', Object.keys(counts).filter((k) => k.startsWith('relay:')).every((k) => ['relay:api.adsb.lol', 'relay:nasstatus.faa.gov', 'relay:www.ndbc.noaa.gov', 'relay:www.nhc.noaa.gov', 'relay:droughtmonitor.unl.edu', 'relay:www.submarinecablemap.com', 'relay:511ga.org', 'relay:www.missingkids.org'].includes(k)), Object.keys(counts).filter((k) => k.startsWith('relay:')).join(','));
  const realErrors = errors.filter((e) => !/favicon|net::ERR_FAILED|Failed to load resource/.test(e));
  check('[all layers] no unexpected console errors', realErrors.length === 0, realErrors.slice(0, 5).join(' | '));
  await context.close();
}

// ------------------------------------------------------------ scenario 4: v1 settings migrate; narrow desktop pane
{
  const context = await browser.newContext({ viewport: { width: 700, height: 800 } });
  await setupRoutes(context, {});
  await context.addInitScript(() => {
    if (!sessionStorage.getItem('seeded')) {
      localStorage.setItem('godview.settings.v1', JSON.stringify({ units: 'metric', flightRelay: 'https://my-old-relay.workers.dev/?url=', satGroup: 'stations', enabled: { flights: false, radar: true } }));
      sessionStorage.setItem('seeded', '1');
    }
  });
  const page = await context.newPage();
  await page.goto(BASE, { waitUntil: 'load' });
  await page.waitForFunction(() => window.GodView && document.getElementById('boot') === null, null, { timeout: 60000 }).catch(() => {});
  await page.waitForTimeout(2500);
  const m = await page.evaluate(() => ({ relay: window.GodView.settings.get('dataRelay'), units: window.GodView.settings.get('units'), flights: window.GodView.manager.state.flights.enabled, radar: window.GodView.manager.state.radar.enabled, launches: window.GodView.manager.state.launches.enabled }));
  check('v1 settings migrate (old relay kept, choices kept, new defaults on)', m.relay === 'https://my-old-relay.workers.dev/?url=' && m.units === 'metric' && !m.flights && m.radar && m.launches, JSON.stringify(m));
  await page.click('#chip-all');
  await page.waitForTimeout(400);
  const open = await page.evaluate(() => document.getElementById('sheet').dataset.state === 'open' && !!document.querySelector('#group-air .group-toggle').offsetParent);
  check('narrow pane: full layer panel is one tap away (Layers chip)', open);
  await page.screenshot({ path: path.join(outDir, 'narrow-panel-open.png') });
  await context.close();
}

await browser.close();
server.close();
const failed = results.filter((r) => !r.ok);
console.log(`\n${results.length - failed.length}/${results.length} checks passed. Screenshots in test/out/`);
process.exit(failed.length ? 1 : 0);
