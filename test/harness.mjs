// Shared plumbing for the browser tests: local server, CDN mirror, sample-data
// routes (including the data relay and the watch service) and helpers.
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';
import * as F from './fixtures.mjs';
import * as WF from '../server/watch/test/fixtures.mjs';
import { answerPeople } from './fixtures-people.mjs'; // People & records sample data
import { answerEarth } from './fixtures-earth.mjs';    // Earth pack sample data
import * as W from '../server/watch/worker.js';
import { KV as WatchKV, makeFetch as watchFetch } from '../server/watch/test/mocks.mjs';

const here = path.dirname(fileURLToPath(import.meta.url));
const appRoot = path.resolve(here, '..');
const NM = process.env.GV_NODE_MODULES || path.join(here, 'node_modules');
const require = createRequire(NM + '/');
const { chromium } = require('playwright-core');
const CHROME = process.env.CHROME || '/usr/bin/google-chrome';
export const outDir = path.join(here, 'out');
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
export const BASE = `http://127.0.0.1:${server.address().port}/godview/`;

// 1x1-ish PNG tile (solid dark blue) for every map tile request.
const SILENT_WAV = Buffer.from('UklGRiQAAABXQVZFZm10IBAAAAABAAEAESsAACJWAAACABAAZGF0YQAAAAA=', 'base64');
const TILE = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk4P9fDwAD/AH+fW8VmQAAAABJRU5ErkJggg==', 'base64');

export const results = [];
export const check = (name, ok, extra = '') => { results.push({ name, ok, extra }); console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${extra ? '  — ' + extra : ''}`); };

// What each data host answers in the tests (sample data, see fixtures.mjs).
export const WATCH_HOST = 'godview-watch.testsub.workers.dev';
const RELAY_ONLY = new Set(['api.adsb.lol', 'opensky-network.org', 'api.airplanes.live', 'opendata.adsb.fi', 'nasstatus.faa.gov', 'www.ndbc.noaa.gov', 'www.nhc.noaa.gov', 'droughtmonitor.unl.edu', 'www.submarinecablemap.com', '511ga.org', 'www.missingkids.org', 'api.census.gov']);
export function answer(u, mode) {
  const host = u.hostname; const p = u.pathname;
  const J = (obj, status = 200) => ({ status, type: 'application/json', body: JSON.stringify(obj) });
  const T = (text, type = 'text/plain') => ({ status: 200, type, body: text });
  const people = answerPeople(u); if (people) return people; // People & records hosts
  const earth = answerEarth(u); if (earth) return earth;       // Earth pack hosts
  switch (host) {
    case 'earthquake.usgs.gov': if (/fdsnws/.test(p)) return J(WF.fdsn(Date.now(), 32.84, -83.63)); return mode.quakesFail ? J({ error: 'x' }, 500) : J(F.usgs());
    case 'celestrak.org': return J(F.celestrak());
    case 'eonet.gsfc.nasa.gov': return J(F.eonet());
    case 'api.weather.gov': return J(F.nws());
    case 'api.rainviewer.com': return J(F.rainviewer());
    case 'api.open-meteo.com': {
      const n = (u.searchParams.get('latitude') || '').split(',').length;
      if (u.searchParams.get('minutely_15')) return J(F.driveWeather());
      return J(n > 1 ? F.openMeteoGrid(n) : F.openMeteo());
    }
    case 'air-quality-api.open-meteo.com': return J(F.openMeteoGrid((u.searchParams.get('latitude') || '').split(',').length));
    case 'geocoding-api.open-meteo.com': return J(u.searchParams.get('name') === 'zzzz' ? {} : F.geocode());
    case 'nominatim.openstreetmap.org': return J(u.pathname.startsWith('/reverse') ? { address: { road: 'Sample Road' } } : F.nominatim());
    case 'api.adsb.lol':
      if (mode.flightsBlocked) return 'abort';
      if (p === '/v2/mil') return J(F.adsbMil());
      if (p.startsWith('/v2/sqk/')) return J(F.adsbSqk(p.split('/').pop()));
      return J(mode.dense ? F.denseFlights() : F.airplaneslive());
    case 'opensky-network.org': return mode.flightsBlocked ? 'abort' : J(F.opensky());
    case 'api.airplanes.live': return mode.flightsBlocked ? 'abort' : J(F.airplaneslive());
    case 'nasstatus.faa.gov': return T(F.faa(), 'application/xml');
    case 'll.thespacedevs.com': return J(F.launches());
    case 'services.swpc.noaa.gov': return J(/ovation/.test(p) ? F.ovation() : F.kp());
    case 'api.tidesandcurrents.noaa.gov':
      if (/mdapi/.test(p)) return J(F.tideStations());
      return J(u.searchParams.get('product') === 'predictions' ? F.tidePred() : F.tideWL());
    case 'www.ndbc.noaa.gov': return T(mode.dense ? F.denseBuoys() : F.ndbc());
    case 'www.spc.noaa.gov': return /csv$/.test(p) ? T(F.spcCsv(), 'text/csv') : J(F.spcOutlook());
    case 'www.nhc.noaa.gov': return J(F.nhc());
    case 'services3.arcgis.com': return J(/Perimeters/.test(p) ? F.perimeters() : F.incidents());
    case 'firms.modaps.eosdis.nasa.gov': return T(F.firmsCsv(), 'text/csv');
    case 'services9.arcgis.com': return mode.viirsDown ? J({ error: { code: 500, message: 'down' } }) : J(F.viirs());
    case 'raw.githubusercontent.com':
      if (/lookout\/feeds\/ga511\.json/.test(p)) return mode.ga511FeedDown ? { status: 404, type: 'text/plain', body: 'nf' } : J(F.ga511Feed(mode.ga511FeedAgeMs));
      if (/lookout\/feeds\/webcams\.json/.test(p)) return J(F.webcamsFeed());
      if (/\/godview\/data\//.test(p)) {
        if (mode.packsDown) return { status: 404, type: 'text/plain', body: '404: Not Found' };
        if (/\/index\.json$/.test(p)) return J(F.packIndex());
        const m = p.match(/\/godview\/data\/(\w+)\/(-?\d+_-?\d+)\.json$/);
        return m ? J(F.packTile(m[1], m[2])) : { status: 404, type: 'text/plain', body: '404: Not Found' };
      }
      return null;
    case 'volcanoes.usgs.gov': return J(F.volcanoes());
    case 'api.water.noaa.gov': return J(F.gauges());
    case 'droughtmonitor.unl.edu': return J(F.drought());
    case '511ga.org':
      if (/cameras/.test(p)) return u.searchParams.get('key') ? J(F.ga511Cams()) : J({ error: 'key' }, 401);
      if (/event/.test(p)) return J(F.ga511Events());
      return { status: 200, type: 'image/png', body: TILE };
    case 'cwwp2.dot.ca.gov': return J(F.caltrans());
    // Lookout screens (Now, Cams, Scanner, News)
    case 'api.bigdatacloud.net': return J(F.reverseGeo(Number(u.searchParams.get('latitude')), Number(u.searchParams.get('longitude'))));
    case 'api.openmhz.com':
      if (mode.omhzDown) return 'abort';
      if (p === '/systems') return J(F.omhzSystems());
      if (/\/calls/.test(p)) return J(F.omhzCalls(p.split('/')[1]));
      if (/\/talkgroups/.test(p)) return J(F.omhzTalkgroups());
      return J({}, 404);
    case 'media2.openmhz.com': return { status: 200, type: 'audio/wav', body: SILENT_WAV };
    case 'news.google.com': return mode.googleNewsDown ? { status: 503, type: 'text/html', body: '<html><title>Sorry...</title></html>' } : T(F.newsRss(u.searchParams.get('q') || ''), 'application/rss+xml');
    case 'www.bing.com': return T(F.bingRss(), 'application/rss+xml');
    case 'api.gdeltproject.org': return J({ articles: [] });
    case 'embed.waze.com': return T('<!doctype html><title>Waze</title><body style="background:#123">Waze live map (sample)</body>', 'text/html');
    case 'imgproxy.windy.com': return { status: 200, type: 'image/png', body: TILE };
    case 'api-v3.amtraker.com': return J(F.amtrak());
    case 'overpass-api.de': return J(F.overpass(u.searchParams.get('data') || ''));
    case 'www.submarinecablemap.com': return J(F.cables());
    case 'de1.api.radio-browser.info': return J(F.radio());
    case 'en.wikipedia.org': return J(/summary/.test(p) ? F.wikiSummary() : F.wikiGeo());
    case 'api.inaturalist.org': return J(F.inat());
    case 'api.adsbdb.com': {
      if (p === '/v0/aircraft/random') return J(F.adsbdb('a0f1bb'));
      if (p === '/v0/callsign/random') return J({ response: { flightroute: F.adsbdb('a0f1bb', 'DAL1234').response.flightroute } });
      if (p.startsWith('/v0/callsign/')) return J({ response: { flightroute: F.adsbdb('a0f1bb', p.split('/').pop()).response.flightroute } });
      const hex = p.split('/').pop(); const cs = u.searchParams.get('callsign');
      if (/^a0000[0-9]$/.test(hex) || hex === 'abcdef') return J(F.adsbdbPrivate(hex));
      return J(F.adsbdb(hex, cs));
    }
    case 'api.planespotters.net': return J(F.planespotters());
    case 'maps.nccs.nasa.gov':
      if (mode.infraDown) return { status: 500, type: 'application/json', body: '{"error":{"code":500,"message":"down"}}' };
      if (/energy/.test(p)) return J(F.hifldPlants());
      if (/communications/.test(p)) return J(F.hifldTowers());
      if (/public_health\/FeatureServer\/0/.test(p)) return J(F.hifldHospitals());
      if (/public_health\/FeatureServer\/1/.test(p)) return J(F.hifldNursing());
      return J({ features: [] });
    case 'mesonet.agron.iastate.edu': return J(/sbw_by_point/.test(p) ? WF.sbw(Date.now()) : WF.lsr(Date.now(), 32.84, -83.63));
    case 'mapservices.weather.noaa.gov': return J(WF.mrms);
    case 'gis.fema.gov': return mode.infraDown ? { status: 500, type: 'application/json', body: '{}' } : J(F.reactors());
    default:
      if (/^gbfs\./.test(host)) return J(/status/.test(p) ? F.gbfsStatus() : F.gbfsInfo());
      if (/arcgisonline|cartocdn|openstreetmap\.org|rainviewer\.com|gibs\.earthdata\.nasa\.gov/.test(host)) return { status: 200, type: 'image/png', body: TILE };
      return null;
  }
}

export async function setupRoutes(context, mode = {}) {
  const counts = {};
  if (!mode.showHint) await context.addInitScript(() => { try { localStorage.setItem('godview.hint.v1', '1'); } catch { /* */ } });
  // GodView v7 opens on the Now tab; the older scenarios test the globe, so they open on Map.
  await context.addInitScript((lk) => { try { if (!localStorage.getItem('godview.lookout.v1')) localStorage.setItem('godview.lookout.v1', JSON.stringify(lk)); } catch { /* */ } }, mode.lookout || { openTo: 'map' });
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
    if (host === WATCH_HOST && mode.watchEnv) {  // the watch service: real worker code, mocked sources
      const r = route.request();
      const req = new Request(url, { method: r.method(), headers: { ...r.headers(), origin: 'https://christophergates88.github.io' }, body: ['POST', 'PUT'].includes(r.method()) ? r.postData() : undefined });
      const resp = await W.handle(req, mode.watchEnv, watchFetch({ now: Date.now(), lsrLat: 32.84, lsrLon: -83.63 }));
      const hdr = Object.fromEntries(resp.headers.entries());
      hdr['access-control-allow-origin'] = '*'; // test page runs on 127.0.0.1; real CORS rules are unit-tested in server/watch/test
      return route.fulfill({ status: resp.status, headers: hdr, body: await resp.text() });
    }
    if (host === WATCH_HOST) return route.abort('failed'); // a watch service this test doesn't run
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

export const browser = await chromium.launch({
  executablePath: CHROME,
  args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist', '--enable-webgl',
    // Drive mode's animal scan: a fake camera (moving test picture) and no permission prompt
    '--use-fake-device-for-media-stream', '--use-fake-ui-for-media-stream', '--autoplay-policy=no-user-gesture-required'],
});

export async function openApp(ctxOpts, mode, label) {
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

export async function waitLayers(page, ids) {
  await page.waitForFunction((ids) => ids.every((id) => {
    const s = window.GodView.manager.state[id];
    return s && !s.busy && (s.status === 'ok' || s.status === 'error' || s.status === 'limited');
  }), ids, { timeout: 30000 }).catch(() => {});
  return page.evaluate((ids) => Object.fromEntries(ids.map((id) => [id, { ...window.GodView.manager.state[id] }])), ids);
}

// Screen position of an item, for real taps.
export async function screenPos(page, layer, key) {
  return page.evaluate(({ layer, key }) => {
    const G = window.GodView; const C = window.Cesium;
    const p = G.manager.position(layer, key);
    if (!p) return null;
    const w = C.SceneTransforms.worldToWindowCoordinates(G.viewer.scene, p);
    return w ? { x: w.x, y: w.y } : null;
  }, { layer, key });
}

export { F, W, WatchKV, watchFetch, fs, path, server };
