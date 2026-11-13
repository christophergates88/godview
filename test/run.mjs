// GodView offline test harness (not part of the app).
//
// Loads the real app in headless Chrome, but answers every network request
// locally: CDN libraries come from node_modules, data feeds come from the small
// sample responses in test/fixtures.mjs (hand-made in each provider's documented
// format, NOT live data). Then it checks layers, tapping, cards and failures.
//
// Run:  cd test && npm install && node run.mjs
// Env:  GV_NODE_MODULES=/path/to/node_modules   CHROME=/path/to/chrome

import { results, check, BASE, outDir, browser, openApp, waitLayers, screenPos, setupRoutes, WATCH_HOST, F, W, WatchKV, watchFetch, fs, path, server } from './harness.mjs';

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
  await page.evaluate(() => window.GodView.globe.jumpTo(33.04, -83.63, 900));
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
  await page.evaluate(() => window.GodView.globe.jumpTo(32.75, -83.68, 900));
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
  await page.locator('#settings-body .field', { hasText: 'Units' }).locator('select').selectOption('metric');
  const units = await page.evaluate(() => window.GodView.settings.get('units'));
  check('settings: units change saved', units === 'metric');
  await page.click('#settings-close');

  check('CelesTrak: one download per satellite group (cache honoured)', (counts['celestrak.org'] || 0) === 2, `requests: ${counts['celestrak.org']} for 2 groups`);
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
  await page.evaluate(() => window.GodView.globe.jumpTo(33.04, -83.63, 900));
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
  await page.evaluate(() => window.GodView.globe.jumpTo(32.84, -83.63, 330));
  await page.waitForTimeout(2500);
  const nLayers = await page.evaluate(() => window.GodView.layers.length);
  check('registry has 25-100 layers', nLayers >= 25 && nLayers <= 100, String(nLayers));

  // Self-test: must resolve, cover every layer, and not change saved settings.
  const before = await page.evaluate(() => localStorage.getItem('godview.settings.v1'));
  const t0 = Date.now();
  const res = await page.evaluate(() => window.GodView.selfTest());
  const after = await page.evaluate(() => localStorage.getItem('godview.settings.v1'));
  fs.writeFileSync(path.join(outDir, 'selftest-sample.json'), JSON.stringify(res, null, 1));
  check('selfTest resolves < 60 s with one row per layer (+3 plane-card, +6 report sources)', Array.isArray(res) && res.length === nLayers + 3 + 6 && Date.now() - t0 < 60000, `${res.length} rows in ${Date.now() - t0} ms`);
  const bad = res.filter((r) => !r.ok);
  check('selfTest: every layer ok against sample data', bad.length === 0, bad.map((r) => `${r.id}: ${r.error}`).join(' | '));
  check('selfTest rows have the agreed fields', res.every((r) => ['id', 'name', 'ok', 'count', 'ms', 'via', 'error'].every((k) => k in r)));
  check('selfTest via values sensible', res.every((r) => ['direct', 'relay', 'computed', 'needs-key', null].includes(r.via)) && res.find((r) => r.id === 'buoys').via === 'relay' && res.find((r) => r.id === 'daynight').via === 'computed', res.map((r) => `${r.id}=${r.via}`).join(' '));
  check('selfTest does not change saved settings', before === after);

  // Turn on everything (staggered, like "All on")
  await page.evaluate(() => window.GodView.layers.forEach((l, i) => setTimeout(() => window.GodView.manager.enable(l.id, true), i * 60)));
  await page.waitForTimeout(9000);
  console.log('   overpass requests:', counts['overpass-api.de'], 'relay overpass:', counts['relay:overpass-api.de']);
  await waitLayers(page, ['peopleCare']); // People & records: OpenStreetMap queries queue one at a time behind the other Overpass layers
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
      const money = M.describe('peopleMoney', '13021');
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
    await page.evaluate(() => { for (const id of ['flights', 'military', 'emergency']) window.GodView.manager.enable(id, false); }); // keep sample aircraft out from under the tap
    await page.waitForTimeout(400);
    const pp = await screenPos(page, 'peopleOfficials', 'here');
    if (opened && pp) { await page.mouse.click(pp.x, pp.y); await page.waitForTimeout(1500); }
    await page.waitForFunction(() => /Raised/.test(document.getElementById('card-rows').innerText), null, { timeout: 8000 }).catch(() => {});
    const cardInfo = await page.evaluate(() => ({ title: document.getElementById('card-title').textContent, links: document.querySelectorAll('#card-extra .gv-links a').length, rows: document.getElementById('card-rows').innerText }));
    check('[people] tap opens officials card with link buttons and campaign totals', /Bibb County/.test(cardInfo.title) && cardInfo.links >= 6 && /Raised \$12\.3M/.test(cardInfo.rows), `${cardInfo.title} links=${cardInfo.links} ${cardInfo.rows.replace(/\s+/g, ' ').slice(0, 160)}`);
    await page.evaluate(() => window.GodView.manager.enable('flights', true)); // back on for the briefing checks below
    await waitLayers(page, ['flights']);
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

// ------------------------------------------------------------ scenario 5: watch service (setup link, places, alerts, brief, timeline)
{
  const watchEnv = { KV: new WatchKV(), WATCH_TOKEN: 'k'.repeat(48), NTFY_TOPIC: 'gv-test' };
  const iphone = { viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true };
  const context = await browser.newContext(iphone);
  await setupRoutes(context, { watchEnv });
  const page = await context.newPage();
  const errors = [];
  page.on('pageerror', (e) => errors.push('pageerror: ' + e.message));
  page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
  await page.goto(BASE + '#watch=' + 'k'.repeat(48) + '@' + WATCH_HOST, { waitUntil: 'load' });
  await page.waitForFunction(() => window.GodView && document.getElementById('boot') === null, null, { timeout: 60000 }).catch(() => {});
  await page.waitForTimeout(1500);
  const st = await page.evaluate(() => ({ hash: location.hash, saved: localStorage.getItem('godview.watch.v1'), open: !document.getElementById('watch').hidden, conn: document.querySelector('.w-conn')?.innerText || '' }));
  check('setup link: key saved, hash removed, Watch opens connected', st.hash === '' && /testsub/.test(st.saved || '') && st.open && /Watching/.test(st.conn), JSON.stringify(st).slice(0, 200));
  // Add a place by search
  await page.click('#w-add');
  await page.fill('#wf-name', 'Test Home');
  await page.fill('#wf-q', 'Atlanta');
  await page.click('#wf-go');
  await page.waitForTimeout(600);
  await page.click('.w-pick');
  await page.waitForTimeout(200);
  await page.click('#wf-save');
  await page.waitForTimeout(800);
  const cfg = JSON.parse(watchEnv.KV.m.get('cfg') || '{}');
  check('add place by search saves it to the watch service', cfg.places?.length === 1 && cfg.places[0].name === 'Test Home' && Math.abs(cfg.places[0].lat - 33.289) < 0.01, JSON.stringify(cfg.places));
  // Add a second place by tapping the globe
  await page.click('#wd-back');
  await page.click('#w-add');
  await page.fill('#wf-name', 'Test Tap');
  await page.click('#wf-tap');
  await page.waitForTimeout(300);
  await page.evaluate(() => window.GodView.layers.forEach((l) => window.GodView.manager.enable(l.id, false)));
  await page.waitForTimeout(300);
  await page.touchscreen.tap(195, 420);
  await page.waitForTimeout(500);
  await page.click('#wf-save');
  await page.waitForTimeout(800);
  const cfg2 = JSON.parse(watchEnv.KV.m.get('cfg') || '{}');
  check('add place by tapping the globe', cfg2.places?.length === 2 && cfg2.places.some((p) => p.name === 'Test Tap'), JSON.stringify(cfg2.places?.map((p) => p.name)));
  // A cron run produces events; tiles show status
  await W.runAll(watchEnv, new Date(), watchFetch({ now: Date.now() }));
  await page.click('#wd-back');
  await page.click('#watch-tabs button[data-tab="places"]');
  await page.waitForTimeout(800);
  const tiles = await page.evaluate(() => [...document.querySelectorAll('.tile[data-id]')].map((t) => t.className + ' ' + t.innerText.replace(/\s+/g, ' ')));
  check('place tiles show status at a glance', tiles.length === 2 && tiles.some((t) => /act/.test(t) && /act now/i.test(t)), tiles.join(' | '));
  await page.screenshot({ path: path.join(outDir, 'watch-places.png') });
  // Detail with timeline
  await page.click('.tile[data-id]');
  await page.waitForTimeout(800);
  const det = await page.evaluate(() => ({ bars: document.querySelectorAll('.bar').length, events: document.querySelectorAll('#wd-events .evt').length, note: document.querySelector('.w-detail, #w-detail')?.innerText.includes('history') }));
  check('place detail: 30-day timeline with today\'s events and history note', det.bars === 30 && det.events > 0 && det.note, JSON.stringify(det));
  await page.screenshot({ path: path.join(outDir, 'watch-detail.png') });
  await page.evaluate(() => { const r = document.getElementById('wd-scrub'); r.value = '10'; r.dispatchEvent(new Event('input')); });
  const empty = await page.evaluate(() => document.getElementById('wd-events').innerText);
  check('timeline scrubber switches days', /Nothing happened/.test(empty));
  // Alerts inbox
  await page.click('#watch-tabs button[data-tab="alerts"]');
  await page.waitForTimeout(800);
  const nOpen = await page.evaluate(() => document.querySelectorAll('#w-alerts .evt:not(.done)').length);
  await page.click('#w-alerts [data-done]');
  await page.waitForTimeout(500);
  const handled = Object.keys(JSON.parse(watchEnv.KV.m.get('cfg')).places).length && JSON.parse(watchEnv.KV.m.get('log:' + cfg.places[0].id) || '[]').concat(JSON.parse(watchEnv.KV.m.get('log:' + cfg2.places[1].id) || '[]')).filter((e) => e.handled).length;
  check('alerts inbox lists events and "Done" clears one', nOpen > 3 && handled === 1, `open=${nOpen} handled=${handled}`);
  await page.screenshot({ path: path.join(outDir, 'watch-alerts.png') });
  await page.click('#wa-all');
  await page.waitForTimeout(700);
  const left = await page.evaluate(() => document.querySelectorAll('#w-alerts .evt:not(.done)').length);
  check('"Clear all" marks everything handled', left === 0);
  // Brief
  await page.click('#watch-tabs button[data-tab="brief"]');
  await page.waitForTimeout(600);
  await page.click('#wb-now');
  await page.waitForTimeout(1500);
  const brief = await page.evaluate(() => document.getElementById('w-brief').innerText);
  check('Brief tab: "Brief me now" shows the brief with do-lines and history', /Test Home/.test(brief) && /history|No history/.test(brief), brief.replace(/\s+/g, ' ').slice(0, 200));
  await page.screenshot({ path: path.join(outDir, 'watch-brief.png') });
  // AI wording that adds a number is replaced by the plain version, and the app says why
  watchEnv.AI = { run: async () => ({ response: 'Test Home: a 97% chance of a tornado.' }) };
  await page.click('#wb-now');
  await page.waitForTimeout(1500);
  const why = await page.evaluate(() => ({ why: document.getElementById('wb-why')?.innerText || '', head: document.querySelector('#w-brief .brief-when')?.innerText || '', text: document.getElementById('w-brief').innerText }));
  check('Brief: AI text with a made-up number is dropped and the reason is shown', /isn’t in the data/.test(why.why) && !/worded by/.test(why.head) && !/97%/.test(why.text), JSON.stringify(why).slice(0, 240));
  watchEnv.AI = { run: async () => ({ response: 'Test Home: a quiet day.\nDo: nothing needed.' }) };
  await page.click('#wb-now');
  await page.waitForTimeout(1500);
  const head2 = await page.evaluate(() => ({ head: document.querySelector('#w-brief .brief-when')?.innerText || '', why: !!document.getElementById('wb-why') }));
  check('Brief: AI text with only known facts shows "worded by AI"', /worded by AI/i.test(head2.head) && !head2.why, JSON.stringify(head2));
  delete watchEnv.AI;
  await page.click('#watch-close');
  // watchSelfTest and What's here with the server check
  const wst = await page.evaluate(() => window.GodView.watchSelfTest());
  check('GodView.watchSelfTest() returns per-check results (12 checks + report sources + camera AI)', wst.checks.length >= 19 && wst.checks.every((c) => c.ok), JSON.stringify(wst.checks.map((c) => c.id + ':' + c.ok)));
  await page.click('#btn-brief');
  await page.waitForTimeout(2500);
  const wh = await page.evaluate(() => document.getElementById('card-brief').innerText);
  check("What's here includes the watch service's check for the point", /Watch check/i.test(wh), wh.slice(0, 200).replace(/\s+/g, ' '));
  const bad = errors.filter((e) => !/favicon|net::ERR_FAILED|Failed to load resource/.test(e));
  check('[watch] no unexpected console errors', bad.length === 0, bad.slice(0, 4).join(' | '));
  await context.close();

  // Not set up: the viewer works and the screen says what to do
  const c2 = await browser.newContext(iphone);
  await setupRoutes(c2, {});
  const p2 = await c2.newPage();
  await p2.goto(BASE, { waitUntil: 'load' });
  await p2.waitForFunction(() => window.GodView && document.getElementById('boot') === null, null, { timeout: 60000 }).catch(() => {});
  await p2.click('#btn-watch');
  await p2.waitForTimeout(300);
  const msg = await p2.evaluate(() => document.getElementById('watch-body').innerText);
  check('not set up: plain instructions shown, map still works', /Not connected on this device/.test(msg) && /paste it here/.test(msg) && /Deploy GodView Watch/.test(msg) && await p2.evaluate(() => window.GodView.manager.state.earthquakes.enabled), msg.slice(0, 120));
  await p2.screenshot({ path: path.join(outDir, 'watch-not-set-up.png') });
  await c2.close();
}

// ------------------------------------------------------------ scenario 6 (v4): answer first, calm map, modes, plain cards, hint
{
  const iphone = { viewport: { width: 390, height: 844 }, deviceScaleFactor: 3, isMobile: true, hasTouch: true };
  const context = await browser.newContext(iphone);
  const counts = await setupRoutes(context, { dense: true });
  const page = await context.newPage();
  const errors = [];
  page.on('pageerror', (e) => errors.push('pageerror: ' + e.message));
  page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
  await page.goto(BASE, { waitUntil: 'load' });
  await page.waitForFunction(() => window.GodView && document.getElementById('boot') === null, null, { timeout: 60000 }).catch(() => {});
  await page.waitForTimeout(6000);
  const first = await page.evaluate(() => ({ mode: window.GodView.settings.get('mode'), on: window.GodView.layers.filter((l) => window.GodView.manager.state[l.id].enabled).map((l) => l.id) }));
  check('first visit starts in "Around me"', first.mode === 'around' && first.on.includes('flights') && first.on.includes('alerts') && !first.on.includes('cables'), JSON.stringify(first));
  const st = await page.evaluate(() => { const el = document.getElementById('status'); return { hidden: el.hidden, head: el.querySelector('.s-head')?.textContent, facts: [...el.querySelectorAll('.s-facts span')].map((x) => x.textContent), level: el.dataset.level }; });
  check('answer first: status shows a headline and up to three facts', !st.hidden && /All clear|Heads-up|Act now/.test(st.head) && st.facts.length >= 2 && st.facts.length <= 3, JSON.stringify(st));
  check('status facts come from loaded data (weather, aircraft)', st.facts.some((f) => /°F/.test(f)) && st.facts.some((f) => /aircraft/.test(f)), st.facts.join(' | '));
  // The calm map: at the start view most aircraft are quiet dots; specials stand out.
  const lodInfo = () => page.evaluate(() => {
    const prims = window.GodView.manager.ctx.flights.primitives;
    let icons = 0; let dots = 0; let labels = 0;
    for (let i = 0; i < prims.length; i++) {
      const c = prims.get(i);
      for (let j = 0; j < c.length; j++) { const p = c.get(j); if (!p.show) continue; if (c instanceof window.Cesium.BillboardCollection) icons++; else if (c instanceof window.Cesium.PointPrimitiveCollection) dots++; else labels++; }
    }
    return { icons, dots, labels, h: Math.round(window.GodView.globe.getView().heightKm) };
  });
  const far = await lodInfo();
  check('dense sky, zoomed out: few icons, quiet dots for the rest', far.icons <= 45 && far.dots >= 500 && far.labels <= 3, JSON.stringify(far));
  const sp = await page.evaluate(() => ['a0000a', 'a00014', 'a00015'].map((k) => { const f = window.GodView.manager.ctx.flights.primitives; return window.GodView.manager.describe('flights', k)?.subtitle; }));
  check('emergency and military aircraft are flagged', /Emergency code 7700/.test(sp[0]) && /Military/.test(sp[1]) && /Military/.test(sp[2]), sp.join(' | '));
  await page.screenshot({ path: path.join(outDir, 'after-iphone-status.png') });
  await page.evaluate(() => window.GodView.globe.jumpTo(32.74, -84.23, 40));
  await page.waitForTimeout(2500);
  const near = await lodInfo();
  check('zoomed in: every aircraft in view is a full icon', near.icons >= near.dots && near.icons > 0, JSON.stringify(near));
  // Same idea for other busy layers (400 buoys)
  await page.evaluate(() => { window.GodView.globe.jumpTo(32.75, -83.68, 3000); window.GodView.manager.enable('buoys', true); });
  await page.waitForTimeout(3500);
  const busy = () => page.evaluate(() => { const c = window.GodView.manager.ctx.buoys.primitives.get(0); let n = 0; let small = 0; for (let i = 0; i < c.length; i++) { const p = c.get(i); if (p.show) { n++; if (p.pixelSize < 7) small++; } } return { shown: n, small, total: c.length }; });
  const bFar = await busy();
  await page.evaluate(() => window.GodView.globe.jumpTo(31.0, -88.0, 300));
  await page.waitForTimeout(2500);
  const bNear = await busy();
  check('busy point layers: far out, nearest 120 as small dots; close in, all at full size', bFar.total === 400 && bFar.shown <= 121 && bFar.small === bFar.shown && bNear.shown === 400 && bNear.small === 0, JSON.stringify({ bFar, bNear }));
  await page.evaluate(() => { window.GodView.manager.enable('buoys', false); window.GodView.globe.jumpTo(32.74, -84.23, 40); });
  await page.waitForTimeout(1500);
  // Plain-sentence flight card with route, type, photo credit
  const key = 'a00064';
  const say0 = await page.evaluate((k) => window.GodView.manager.describe('flights', k).say, key);
  const det = await page.evaluate((k) => window.GodView.manager.details('flights', k), key);
  check('flight card starts with a plain sentence', /ft, (climbing|descending|level)\.$|on the ground\.$/.test(say0), say0);
  check('details: "Delta 1234-style, Atlanta to New York, Boeing 737, … ft"', /^Delta \d+, Atlanta to New York, Boeing 737, [\d,]+ ft, (climbing|descending|level)\.$|on the ground\.$/.test(det.say) && /planespotters/.test(det.credit), `${det.say} | ${det.credit}`);
  const priv = await page.evaluate(() => window.GodView.manager.details('flights', 'a00001'));
  check('privacy: a private owner name is never shown', !JSON.stringify(priv).includes('John Q Sample') && !priv.rows.some((r) => r[0] === 'Operator'), JSON.stringify(priv.rows));
  const del = await page.evaluate(() => window.GodView.manager.details('flights', 'a00064'));
  check('airline operator is shown', del.rows.some((r) => r[0] === 'Operator' && /Delta/.test(r[1])));
  // Open the card through a real tap: centre the camera on the aircraft first.
  await page.evaluate((k) => { const f = window.GodView.manager.items('flights').find((x) => x.key === k); window.GodView.settings.set('smoothMotion', false); window.GodView.globe.jumpTo(f.lat, f.lon, 25); }, key);
  await page.waitForTimeout(2500);
  const pos = await screenPos(page, 'flights', key);
  if (pos) { await page.touchscreen.tap(pos.x, pos.y); await page.waitForTimeout(1800); }
  const card = await page.evaluate(() => ({ open: !document.getElementById('card').hidden, title: document.getElementById('card-title').textContent, say: document.getElementById('card-say').textContent, credit: document.getElementById('card-credit').textContent }));
  await page.screenshot({ path: path.join(outDir, 'after-iphone-card-flight.png') });
  check('tap a plane: card leads with the plain sentence and photo credit', card.open && /^Delta \d+, Atlanta to New York, Boeing 737/.test(card.say) && /planespotters/.test(card.credit), JSON.stringify(card));
  if (card.open) await page.click('#card-close');
  await page.evaluate(() => window.GodView.settings.set('smoothMotion', true));
  // Status: tap opens What's here; touching the map shrinks it
  await page.evaluate(() => window.GodView.globe.jumpTo(32.75, -83.68, 900));
  await page.waitForTimeout(1500);
  await page.touchscreen.tap(195, 500);
  await page.waitForTimeout(400);
  await page.click('#card-close').catch(() => {});
  const pill = await page.evaluate(() => document.getElementById('status').classList.contains('pill'));
  check('status shrinks to a pill when you touch the map', pill);
  await page.click('#status');
  await page.waitForTimeout(2500);
  const wh = await page.evaluate(() => !document.getElementById('card').hidden && document.getElementById('card-kicker').textContent);
  check('tapping the status opens What\'s here', /What's here/.test(wh || ''), String(wh));
  await page.click('#card-close');
  // Modes
  await page.click('#mode-storm');
  await page.waitForTimeout(3000);
  const storm = await page.evaluate(() => window.GodView.layers.filter((l) => window.GodView.manager.state[l.id].enabled).map((l) => l.id).sort());
  check('Storm mode switches the whole layer set in one tap', JSON.stringify(storm) === JSON.stringify(['alerts', 'hurricanes', 'radar', 'rivers', 'spcOutlook', 'spcReports', 'tempGrid']), storm.join(','));
  await page.screenshot({ path: path.join(outDir, 'after-iphone-mode-storm.png') });
  await page.click('#mode-sky');
  await page.waitForTimeout(3500);
  for (const k of Object.keys(counts)) delete counts[k];
  await page.waitForTimeout(8000);
  const offHosts = ['earthquake.usgs.gov', 'api.weather.gov', 'eonet.gsfc.nasa.gov', 'api.rainviewer.com', 'api.water.noaa.gov', 'www.spc.noaa.gov', 'overpass-api.de', 'api.tidesandcurrents.noaa.gov'];
  const leaked = offHosts.filter((h) => counts[h]);
  check('layers that are off fetch nothing', leaked.length === 0, leaked.map((h) => `${h}:${counts[h]}`).join(', ') || 'none');
  await page.reload({ waitUntil: 'load' });
  await page.waitForFunction(() => window.GodView && document.getElementById('boot') === null, null, { timeout: 60000 }).catch(() => {});
  await page.waitForTimeout(4000);
  const remembered = await page.evaluate(() => ({ mode: window.GodView.settings.get('mode'), on: window.GodView.layers.filter((l) => window.GodView.manager.state[l.id].enabled).map((l) => l.id), tile: document.getElementById('mode-sky').classList.contains('on') }));
  check('last mode is remembered after reload', remembered.mode === 'sky' && remembered.tile && remembered.on.includes('military') && !remembered.on.includes('radar'), JSON.stringify(remembered));
  await page.click('#chip-all');
  await page.waitForTimeout(400);
  await page.click('#group-weather .group-toggle');
  await page.click('#row-radar .switch');
  await page.waitForTimeout(500);
  const custom = await page.evaluate(() => window.GodView.settings.get('mode'));
  check('a hand-made change becomes "My mix"', custom === 'custom');
  await page.screenshot({ path: path.join(outDir, 'after-iphone-all-layers.png') });
  const rs = await page.evaluate(() => ({ rs: window.GodView.viewer.resolutionScale, dpr: devicePixelRatio }));
  check('adaptive render scale: sharp (2x) when idle', Math.abs(rs.rs * rs.dpr - Math.min(rs.dpr, 2)) < 0.01, JSON.stringify(rs));
  const bad = errors.filter((e) => !/favicon|net::ERR_FAILED|Failed to load resource/.test(e));
  check('[v4] no unexpected console errors', bad.length === 0, bad.slice(0, 4).join(' | '));
  await context.close();

  // First-run hint: shown once, dismissed forever
  const c2 = await browser.newContext(iphone);
  await setupRoutes(c2, { showHint: true });
  const p2 = await c2.newPage();
  await p2.goto(BASE, { waitUntil: 'load' });
  await p2.waitForFunction(() => window.GodView && document.getElementById('boot') === null, null, { timeout: 60000 }).catch(() => {});
  await p2.waitForTimeout(1500);
  const shown = await p2.evaluate(() => !document.getElementById('hint').hidden);
  await p2.screenshot({ path: path.join(outDir, 'after-iphone-hint.png') });
  await p2.click('#hint-ok');
  await p2.reload({ waitUntil: 'load' });
  await p2.waitForFunction(() => window.GodView && document.getElementById('boot') === null, null, { timeout: 60000 }).catch(() => {});
  const again = await p2.evaluate(() => !document.getElementById('hint').hidden);
  check('first-run hint shows once and stays dismissed', shown && !again);
  await c2.close();
}

// ------------------------------------------------------------ scenario 7 (v5): dependable infrastructure, inferences, reports, camera watch
{
  const iphone = { viewport: { width: 390, height: 844 }, deviceScaleFactor: 3, isMobile: true, hasTouch: true };
  const watchEnv = { KV: new WatchKV(), WATCH_TOKEN: 'k'.repeat(48), NTFY_TOPIC: 'gv-test' };
  await watchEnv.KV.put('cfg', JSON.stringify({ places: [{ id: 'macon', name: 'Macon test place', lat: 32.84, lon: -83.63, radiusKm: 30, kind: 'home' }], settings: {} }));
  const context = await browser.newContext(iphone);
  const counts = await setupRoutes(context, { watchEnv });
  await context.addInitScript(() => { try { localStorage.setItem('godview.apikeys.v1', JSON.stringify({ ga511: 'TESTKEY511' })); } catch { /* */ } });
  const page = await context.newPage();
  const errors = [];
  page.on('pageerror', (e) => errors.push('pageerror: ' + e.message));
  page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
  await page.goto(BASE + '#watch=' + 'k'.repeat(48) + '@' + WATCH_HOST, { waitUntil: 'load' });
  await page.waitForFunction(() => window.GodView && document.getElementById('boot') === null, null, { timeout: 60000 }).catch(() => {});
  await page.click('#watch-close').catch(() => {});
  await page.evaluate(() => { window.GodView.globe.jumpTo(32.84, -83.63, 150); for (const id of ['powerPlants', 'cellTowers', 'nuclear', 'peopleCare']) window.GodView.manager.enable(id, true); });
  const st = await waitLayers(page, ['powerPlants', 'cellTowers', 'nuclear', 'peopleCare']);
  check('power plants load from the bundled list', st.powerPlants.status === 'ok' && st.powerPlants.count >= 1, `${st.powerPlants.status} ${st.powerPlants.count}`);
  check('cell towers from the weekly data pack', st.cellTowers.status === 'ok' && st.cellTowers.count === 2 && /copy from/.test(st.cellTowers.note), `${st.cellTowers.status} ${st.cellTowers.count} ${st.cellTowers.message} ${st.cellTowers.note}`);
  check('nuclear plants load from the bundled list', st.nuclear.status === 'ok' && st.nuclear.count >= 1, `${st.nuclear.status} ${st.nuclear.count}`);
  check('hospitals and nursing homes from the weekly data pack', st.peopleCare.status === 'ok' && st.peopleCare.count === 3 && /flagged by Medicare \(1 here\)/.test(st.peopleCare.note), `${st.peopleCare.status} ${st.peopleCare.count} ${st.peopleCare.message} ${st.peopleCare.note}`);
  const home = await page.evaluate(() => { const M = window.GodView.manager; const it = M.items('peopleCare').find((x) => /Sample Oaks/.test(x.title)); return it ? M.describe('peopleCare', it.key) : null; });
  const homeRows = home ? Object.fromEntries(home.rows) : {};
  check('nursing home card: Medicare stars, citations, federal fines, abuse citation, Special Focus candidate, turnover, its own Care Compare page',
    home && homeRows['Medicare overall'] === '★☆☆☆☆ 1 of 5' && /2 fines, \$25,351 in total/.test(homeRows['Federal fines (last 3 years)'] || '') && /^Yes/.test(homeRows['Cited for abuse'] || '')
      && /^Candidate/.test(homeRows['Special Focus Facility'] || '') && homeRows['Citations, latest inspection cycle'] === '14' && homeRows['Nursing staff turnover'] === '61% a year'
      && /care-compare\/details\/nursing-home\/115999\//.test(home.link.href) && /rated 1 of 5 stars/.test(home.say),
    JSON.stringify(home).slice(0, 400));
  const tower = await page.evaluate(() => { const M = window.GodView.manager; const it = M.items('cellTowers').find((x) => /AT&T/.test(x.title)); return it ? M.describe('cellTowers', it.key) : null; });
  check('cell site card: carriers sharing one structure, height in m and ft, FCC registration', tower && tower.title === 'AT&T + Verizon' && tower.rows.some(([k, v]) => k === 'Structure height' && /91 m, about 300 ft/.test(v))
    && tower.rows.some(([k, v]) => k === 'FCC tower registration' && v === '1000001'), JSON.stringify(tower).slice(0, 300));
  await page.evaluate(() => window.GodView.manager.enable('alpr', true));
  const sa = await waitLayers(page, ['alpr']);
  const cam = await page.evaluate(() => { const M = window.GodView.manager; const it = M.items('alpr').find((x) => x.key === 'n7002'); return it ? M.describe('alpr', it.key) : null; });
  check('plate-reader cameras from the weekly data pack ("facing" in words)', sa.alpr.status === 'ok' && sa.alpr.count >= 2 && /copy from/.test(sa.alpr.note) && cam && cam.rows.some(([k, v]) => k === 'Facing' && v === 'east and west'),
    `${sa.alpr.status} ${sa.alpr.count} ${sa.alpr.note} ${JSON.stringify(cam && cam.rows)}`);
  // (plant card wording is covered by the Earth pack's own checks)

  const careNames = await page.evaluate(() => window.GodView.manager.items('peopleCare').map((x) => x.title).join(' | '));
  check('care homes: a person-like name is not shown', !/Mary Smith/i.test(careNames) && /private name not shown/.test(careNames), careNames);


  check('Overpass not called when the main sources answer', !(counts['overpass-api.de'] > 0) && !(counts['overpass.private.coffee'] > 0), JSON.stringify({ o: counts['overpass-api.de'] }));

  // Inferences from what is loaded (two helicopters low over Macon)
  await page.evaluate(() => { window.GodView.manager.enable('flights', true); window.GodView.globe.jumpTo(32.84, -83.63, 300); });
  await waitLayers(page, ['flights']);
  const inf = await page.evaluate(() => window.GodView.inferences(32.84, -83.63));
  check('app inference: helicopter low and slow -> "landing or hovering" (low confidence)', inf.some((x) => x.kind === 'hover' && x.confidence === 'low' && /LIFE1/.test(x.text)), JSON.stringify(inf.map((x) => x.kind)));
  check('app inference: two helicopters within 5 km -> "special aircraft in one spot"', inf.some((x) => x.kind === 'converge' && x.evidence.length === 2), JSON.stringify(inf.map((x) => [x.kind, x.evidence])));
  await page.click('#btn-brief');
  await page.waitForTimeout(3000);
  const wh = await page.evaluate(() => document.getElementById('card-brief').innerText);
  check("What's here shows inferences, labelled not confirmed, with confidence", /Possibly happening \(not confirmed\)/i.test(wh) && /low confidence/.test(wh), wh.slice(0, 300).replace(/\s+/g, ' '));
  await page.screenshot({ path: path.join(outDir, 'after-iphone-inference.png') });

  // Conditions report from What's here (watch connected: built and stored by the service)
  await page.click('#card-brief button:last-child');
  await page.waitForTimeout(600);
  const tab = await page.evaluate(() => document.querySelector('#watch-tabs button.on')?.dataset.tab);
  check('"Conditions report for this spot" opens the Reports tab', tab === 'reports');
  await page.click('#rp-go');
  await page.waitForFunction(() => !document.getElementById('report').hidden, null, { timeout: 30000 }).catch(() => {});
  const rp = await page.evaluate(() => ({ text: document.getElementById('report').innerText, hash: document.querySelector('#report .hash')?.textContent }));
  check('report shows the warning, storm reports with distance, sources and a verified SHA-256', /Severe Thunderstorm Warning \(FFC #123\) covered this point/.test(rp.text) && /reported .* mi [NSEW]/i.test(rp.text) && /Sources checked/.test(rp.text) && /SHA-256 [0-9a-f]{64} \(fingerprint checks out\) · stored for verification/.test(rp.hash), rp.hash);
  check('report marks lines Official / Reported / Estimated and says it does not assess damage', /OFFICIAL/i.test(rp.text) && /REPORTED/i.test(rp.text) && /ESTIMATED/i.test(rp.text) && /does not assess or confirm damage/.test(rp.text));
  await page.screenshot({ path: path.join(outDir, 'after-iphone-report.png'), fullPage: false });
  await page.emulateMedia({ media: 'print' });
  const printOnly = await page.evaluate(() => getComputedStyle(document.getElementById('topbar')).display === 'none' && getComputedStyle(document.querySelector('.rp-bar')).display === 'none' && getComputedStyle(document.querySelector('.paper')).display !== 'none');
  check('print view shows only the report page', printOnly);
  await page.pdf?.({ path: path.join(outDir, 'after-report.pdf'), format: 'Letter' }).catch(() => {});
  await page.emulateMedia({ media: 'screen' });
  const stored = await watchEnv.KV.get('reports');
  check('the service stored the report for later verification', stored && JSON.parse(stored).list.length === 1);
  await page.click('#rp-close');

  // Camera watch: add a Georgia 511 camera to the watched place from its card
  await page.click('#watch-close').catch(() => {});
  await page.evaluate(() => { window.GodView.manager.enable('flights', false); window.GodView.manager.enable('ga511Cameras', true); });
  await waitLayers(page, ['ga511Cameras']);
  const camKey = '186';
  await page.evaluate((k) => { const it = window.GodView.manager.items('ga511Cameras').find((x) => x.key === k); window.GodView.globe.jumpTo(it.lat, it.lon, 15); }, camKey);
  await page.waitForTimeout(1500);
  const cp = await screenPos(page, 'ga511Cameras', camKey);
  if (cp) { await page.touchscreen.tap(cp.x, cp.y); await page.waitForTimeout(800); }
  const camBtn = await page.evaluate(() => !document.getElementById('card-cam').hidden);
  check('camera card offers "Watch this camera" when the service is connected', camBtn);
  if (camBtn) { await page.click('#card-cam'); await page.waitForTimeout(1000); }
  const cfg = JSON.parse(await watchEnv.KV.get('cfg'));
  check('camera saved on the place (public 511GA URL only)', cfg.places[0].cams?.length === 1 && /^https:\/\/511ga\.org\//.test(cfg.places[0].cams[0].url), JSON.stringify(cfg.places[0].cams));
  const bad = errors.filter((e) => !/favicon|net::ERR_FAILED|Failed to load resource/.test(e));
  check('[v5] no unexpected console errors', bad.length === 0, bad.slice(0, 4).join(' | '));
  await context.close();

  // Main infrastructure source down -> OpenStreetMap fallback, said plainly
  const c2 = await browser.newContext(iphone);
  await setupRoutes(c2, { infraDown: true, packsDown: true });
  const p2 = await c2.newPage();
  await p2.goto(BASE, { waitUntil: 'load' });
  await p2.waitForFunction(() => window.GodView && document.getElementById('boot') === null, null, { timeout: 60000 }).catch(() => {});
  await p2.evaluate(() => { window.GodView.globe.jumpTo(32.84, -83.63, 150); window.GodView.manager.enable('powerPlants', true); });
  const s2 = await waitLayers(p2, ['powerPlants']);
  check('power plants still load when the infrastructure servers are down', s2.powerPlants.status === 'ok' && s2.powerPlants.count >= 1, `${s2.powerPlants.status} ${s2.powerPlants.message}`);
  await p2.evaluate(() => window.GodView.manager.enable('cellTowers', true));
  const s3 = await waitLayers(p2, ['cellTowers']);
  check('cell towers fall back to OpenStreetMap when the weekly copy cannot be read, and say so', s3.cellTowers.status === 'ok' && /Weekly copy unavailable/.test(s3.cellTowers.note), `${s3.cellTowers.status} ${s3.cellTowers.message} ${s3.cellTowers.note}`);
  // Reports without the Watch service: built in the browser, same fingerprint scheme, not stored
  await p2.click('#btn-watch');
  await p2.click('#watch-tabs button[data-tab="reports"]');
  await p2.waitForTimeout(300);
  await p2.click('#rp-go');
  await p2.waitForFunction(() => !document.getElementById('report').hidden, null, { timeout: 30000 }).catch(() => {});
  const local = await p2.evaluate(() => document.querySelector('#report .hash')?.textContent || '');
  check('report works without the Watch service (built in the app, fingerprint checks out, not stored)', /fingerprint checks out/.test(local) && !/stored/.test(local), local);
  // Connecting a device by pasting the setup link (the iPhone app keeps its own storage, apart from Safari)
  const p3 = await c2.newPage();
  await p3.goto(BASE, { waitUntil: 'load' });
  await p3.waitForFunction(() => window.GodView && document.getElementById('boot') === null, null, { timeout: 60000 }).catch(() => {});
  await p3.click('#btn-watch');
  await p3.click('#watch-tabs button[data-tab="places"]');
  await p3.waitForTimeout(300);
  const offText = await p3.evaluate(() => document.querySelector('.w-conn.off')?.innerText || '');
  await p3.fill('#w-link', 'hello');
  await p3.click('#w-link-go');
  await p3.waitForTimeout(300);
  const refused = await p3.evaluate(() => !localStorage.getItem('godview.watch.v1'));
  await p3.fill('#w-link', 'Setup link: ' + 'k'.repeat(48) + '@' + WATCH_HOST);
  await p3.click('#w-link-go');
  await p3.waitForTimeout(500);
  const saved = await p3.evaluate(() => JSON.parse(localStorage.getItem('godview.watch.v1') || 'null'));
  check('connect a device by pasting the setup link (or just its key@host part); other text is refused',
    /paste it here/.test(offText) && refused && saved && saved.token === 'k'.repeat(48) && saved.host === WATCH_HOST, JSON.stringify({ offText: offText.slice(0, 90), refused, saved: !!saved }));
  await c2.close();
}

// ------------------------------------------------------------ scenario 8 (v6): one-tap Reset + Undo, All off, no keys needed, in-app dialogs
{
  const iphone = { viewport: { width: 390, height: 844 }, deviceScaleFactor: 3, isMobile: true, hasTouch: true };
  const context = await browser.newContext(iphone);
  const counts = await setupRoutes(context, {});
  const page = await context.newPage();
  const errors = []; const dialogs = [];
  page.on('pageerror', (e) => errors.push('pageerror: ' + e.message));
  page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
  page.on('dialog', (d) => { dialogs.push(d.type() + ': ' + d.message()); d.dismiss().catch(() => {}); });
  const onIds = () => page.evaluate(() => window.GodView.layers.filter((l) => window.GodView.manager.state[l.id].enabled).map((l) => l.id).sort());
  const ready = () => page.waitForFunction(() => window.GodView && document.getElementById('boot') === null, null, { timeout: 60000 }).catch(() => {});
  await page.goto(BASE, { waitUntil: 'load' });
  await ready();
  await page.waitForTimeout(4000);
  const start = await onIds();
  // Dark map: Esri's keyless dark canvas plus a place-name layer (CARTO's now asks for a key); switching back removes the names
  const maps = await page.evaluate(() => {
    const G = window.GodView; const urls = () => Array.from({ length: G.viewer.imageryLayers.length }, (_, i) => G.viewer.imageryLayers.get(i).imageryProvider.url || '');
    G.globe.setBasemap('dark'); const dark = urls(); G.globe.setBasemap('satellite'); const sat = urls();
    return { dark: dark.slice(0, 2), satCount: sat.filter((u) => /arcgisonline/.test(u)).length, anyCarto: [...dark, ...sat].some((u) => /cartocdn/.test(u)) };
  });
  check('dark map is Esri\'s keyless dark canvas with place names; switching back leaves one base map', /World_Dark_Gray_Base/.test(maps.dark[0]) && /World_Dark_Gray_Reference/.test(maps.dark[1]) && maps.satCount === 1 && !maps.anyCarto, JSON.stringify(maps));
  // No keys anywhere: Georgia 511 and satellite fire detections work from keyless sources.
  const st = await waitLayers(page, ['ga511Events']);
  check('no key: Georgia road events load from the keyless copy', st.ga511Events.status === 'ok' && st.ga511Events.count === 2 && /copy from/.test(st.ga511Events.note), `${st.ga511Events.status} ${st.ga511Events.count} ${st.ga511Events.message || st.ga511Events.note}`);
  await page.evaluate(() => { window.GodView.manager.enable('ga511Cameras', true); window.GodView.manager.enable('firms', true); });
  const st2 = await waitLayers(page, ['ga511Cameras', 'firms']);
  check('no key: Georgia cameras load from the copy (pictures from 511GA)', st2.ga511Cameras.status === 'ok' && st2.ga511Cameras.count === 2 && /pictures are live/.test(st2.ga511Cameras.note), `${st2.ga511Cameras.status} ${st2.ga511Cameras.count} ${st2.ga511Cameras.note}`);
  check('no key: satellite fire detections load (VIIRS via Esri)', st2.firms.status === 'ok' && st2.firms.count === 2 && (counts['services9.arcgis.com'] || 0) >= 1 && !(counts['firms.modaps.eosdis.nasa.gov'] > 0), `${st2.firms.status} ${st2.firms.count} ${st2.firms.message || ''}`);
  const cam = await page.evaluate(() => window.GodView.manager.describe('ga511Cameras', '186'));
  check('camera card from the copy keeps the live 511GA picture', /511ga\.org\/map\/Cctv\/186/.test(cam?.image || ''), String(cam?.image));
  const ga511Fetches = counts['raw.githubusercontent.com'] || 0;
  check('cameras and road events share one download of the copy', ga511Fetches === 1, `downloads: ${ga511Fetches}`);
  const needKey = await page.evaluate(() => window.GodView.layers.filter((l) => l.needsKey || window.GodView.manager.state[l.id].status === 'needs-key').map((l) => l.id));
  check('no layer needs a key', needKey.length === 0, needKey.join(','));
  // Reset from the bottom row: Everything (part way through switching on), then Reset.
  await page.click('#mode-everything');
  await page.waitForTimeout(1800);
  // Read what is on and press Reset in one step, so the comparison below uses
  // exactly what the app saw at the moment of the tap (layers keep switching on).
  const midway = await page.evaluate(() => { const on = window.GodView.layers.filter((l) => window.GodView.manager.state[l.id].enabled).map((l) => l.id).sort(); document.getElementById('mode-reset').click(); return on; });
  await page.waitForTimeout(3500);
  const afterReset = await onIds();
  const toastTxt = await page.evaluate(() => ({ text: document.getElementById('toast').innerText, hidden: document.getElementById('toast').hidden, undo: !!document.querySelector('#toast .t-act') }));
  check('Reset tile: back to exactly the starting layers (pending switch-ons cancelled)', JSON.stringify(afterReset) === JSON.stringify(start) && midway.length > start.length, `start=${start.length} midway=${midway.length} after=${afterReset.length}`);
  check('Reset says what happened and offers Undo', !toastTxt.hidden && /reset/i.test(toastTxt.text) && toastTxt.undo, JSON.stringify(toastTxt));
  const modeAfter = await page.evaluate(() => ({ mode: window.GodView.settings.get('mode'), lit: [...document.querySelectorAll('#chips-on .mode.on')].map((b) => b.id) }));
  check('after Reset the "Around me" tile is lit', modeAfter.mode === 'around' && JSON.stringify(modeAfter.lit) === '["mode-around"]', JSON.stringify(modeAfter));
  await page.screenshot({ path: path.join(outDir, 'v6-iphone-reset-undo.png') });
  await page.click('#toast .t-act');
  await page.waitForTimeout(midway.length * 250 + 2500);
  const undone = await onIds();
  const undoneMode = await page.evaluate(() => window.GodView.settings.get('mode'));
  check('Undo brings back what was on before Reset', JSON.stringify(undone) === JSON.stringify(midway) && undoneMode === 'everything', `before=${midway.length} undone=${undone.length} mode=${undoneMode}`);
  // All off from the layer list, with Undo
  await page.click('#chip-all');
  await page.waitForTimeout(400);
  const head = await page.evaluate(() => ({ count: document.getElementById('st-count').textContent, reset: !!document.getElementById('btn-reset-layers'), off: !!document.getElementById('btn-all-off') }));
  check('layer list header: count + Reset + All off', /\d+ of \d+ layers on/.test(head.count) && head.reset && head.off, JSON.stringify(head));
  await page.screenshot({ path: path.join(outDir, 'v6-iphone-list-tools.png') });
  await page.click('#btn-all-off');
  await page.waitForTimeout(600);
  const none = await onIds();
  const noneState = await page.evaluate(() => ({ mode: window.GodView.settings.get('mode'), lit: document.querySelectorAll('#chips-on .mode.on').length, count: document.getElementById('st-count').textContent }));
  check('All off: nothing on, no mode tile lit, header says so', none.length === 0 && noneState.mode === 'none' && noneState.lit === 0 && /All \d+ layers off/.test(noneState.count), JSON.stringify(noneState));
  await page.click('#toast .t-act');
  await page.waitForTimeout(undone.length * 250 + 2500);
  check('Undo after All off restores the layers', JSON.stringify(await onIds()) === JSON.stringify(undone));
  // Reset from the list header
  await page.click('#btn-reset-layers');
  await page.waitForTimeout(3500);
  check('list "Reset" button resets too', JSON.stringify(await onIds()) === JSON.stringify(start));
  // Settings: Reset at the top, keys optional and tucked away, "Reset all settings" uses an in-app dialog
  await page.click('#sheet-handle').catch(() => {});
  await page.click('#btn-settings');
  await page.waitForTimeout(300);
  const set = await page.evaluate(() => {
    const b = document.getElementById('settings-body');
    const titles = [...b.querySelectorAll('.sec-title')].map((h) => h.textContent);
    return { first: titles[0], keysNote: b.innerText.includes('None needed'), keysClosed: b.querySelector('.keys-more') ? !b.querySelector('.keys-more').open : false, titles };
  });
  check('Settings: "Layers" (Reset) comes first; keys say "None needed" and are tucked away', set.first === 'Layers' && set.keysNote && set.keysClosed, JSON.stringify(set));
  await page.evaluate(() => window.GodView.settings.set('units', 'metric'));
  await page.evaluate(() => [...document.querySelectorAll('#settings-body button')].find((b) => b.textContent === 'Reset all settings').click());
  await page.waitForTimeout(300);
  const dlg = await page.evaluate(() => ({ shown: !document.getElementById('dlg')?.hidden, title: document.querySelector('#dlg h2')?.textContent }));
  check('"Reset all settings" asks in an in-app dialog (works in the iPhone app)', dlg.shown && /Reset all settings/.test(dlg.title || ''), JSON.stringify(dlg));
  await page.screenshot({ path: path.join(outDir, 'v6-iphone-dialog.png') });
  await page.click('#dlg [data-v="0"]');
  await page.waitForTimeout(300);
  check('Cancel keeps the settings', (await page.evaluate(() => window.GodView.settings.get('units'))) === 'metric' && (await page.evaluate(() => document.getElementById('dlg').hidden)));
  await page.evaluate(() => [...document.querySelectorAll('#settings-body button')].find((b) => b.textContent === 'Reset all settings').click());
  await page.waitForTimeout(300);
  await Promise.all([page.waitForNavigation({ waitUntil: 'load' }).catch(() => {}), page.click('#dlg [data-v="1"]')]);
  await ready();
  await page.waitForTimeout(3000);
  const fresh = await page.evaluate(() => ({ units: window.GodView.settings.get('units'), mode: window.GodView.settings.get('mode') }));
  check('confirming resets everything on this device', fresh.units === 'imperial' && fresh.mode === 'around', JSON.stringify(fresh));
  check('no browser pop-up dialogs were used', dialogs.length === 0, dialogs.join(' | '));
  const bad = errors.filter((e) => !/favicon|net::ERR_FAILED|Failed to load resource/.test(e));
  check('[v6] no unexpected console errors', bad.length === 0, bad.slice(0, 4).join(' | '));
  await context.close();

  // The copy is old: road events are not shown as current; cameras still work (pictures are live)
  const c2 = await browser.newContext(iphone);
  await setupRoutes(c2, { ga511FeedAgeMs: 2 * 86400e3 });
  const p2 = await c2.newPage();
  await p2.goto(BASE, { waitUntil: 'load' });
  await p2.waitForFunction(() => window.GodView && document.getElementById('boot') === null, null, { timeout: 60000 }).catch(() => {});
  await p2.evaluate(() => { window.GodView.manager.enable('ga511Events', true); window.GodView.manager.enable('ga511Cameras', true); });
  const s3 = await waitLayers(p2, ['ga511Events', 'ga511Cameras']);
  check('old copy: road events hidden with a plain reason', s3.ga511Events.status === 'error' && /2 days ago/.test(s3.ga511Events.message) && /hidden/.test(s3.ga511Events.message), s3.ga511Events.message);
  check('old copy: cameras still shown, with the list\'s age', s3.ga511Cameras.status === 'ok' && /2 days ago/.test(s3.ga511Cameras.note), s3.ga511Cameras.note);
  await c2.close();
}

// ------------------------------------------------------------ scenario 9 (v7): GodView + Lookout in one app (tabs)
{
  const iphone = { viewport: { width: 390, height: 844 }, deviceScaleFactor: 3, isMobile: true, hasTouch: true };
  const watchEnv = { KV: new WatchKV(), WATCH_TOKEN: 'k'.repeat(48), NTFY_TOPIC: 'gv-test' };
  await watchEnv.KV.put('cfg', JSON.stringify({ places: [{ id: 'home', name: 'Sample Home', lat: 32.84, lon: -83.63, radiusKm: 30, kind: 'home' }], settings: {} }));
  const place = { lat: 32.84, lon: -83.63, name: 'Sampleville', state: 'GA', county: 'Sample County', country: 'US', source: 'picked' };
  const context = await browser.newContext(iphone);
  const counts = await setupRoutes(context, { watchEnv, lookout: { openTo: 'now', place } });
  await context.addInitScript(() => { try { localStorage.setItem('godview.watch.v1', JSON.stringify({ token: 'k'.repeat(48), host: 'godview-watch.testsub.workers.dev' })); } catch { /* */ } });
  const page = await context.newPage();
  const errors = [];
  page.on('pageerror', (e) => errors.push('pageerror: ' + e.message));
  page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
  await page.goto(BASE, { waitUntil: 'load' });
  // Now shows before the globe has finished starting
  await page.waitForFunction(() => /Sampleville/.test(document.getElementById('lk-place-name')?.textContent || '') && document.querySelector('#nw-hero .temp'), null, { timeout: 30000 }).catch(() => {});
  const early = await page.evaluate(() => ({ tab: document.body.className, now: !document.getElementById('lk-now').hidden, booting: !!document.getElementById('boot'), hero: document.getElementById('nw-hero')?.innerText || '' }));
  check('opens on Now (place, weather and alert) without waiting for the globe', /tab-lk/.test(early.tab) && early.now && /Heads-up/i.test(early.hero) && /Severe Thunderstorm Warning/.test(early.hero) && /°F/.test(early.hero), JSON.stringify(early).slice(0, 300));
  const lv = await page.evaluate(async () => {
    const m = await import('./js/lookout/feeds.js');
    const L = (event, severity, urgency, threat = '') => m.alertLevel({ event, severity, urgency, threat });
    return { tor: L('Tornado Warning', 'Extreme', 'Immediate'), ffw: L('Flash Flood Warning', 'Severe', 'Immediate'), hur: L('Hurricane Warning', 'Extreme', 'Expected'), squall: L('Snow Squall Warning', 'Severe', 'Immediate'), svrDestructive: L('Severe Thunderstorm Warning', 'Severe', 'Immediate', 'DESTRUCTIVE'),
      svr: L('Severe Thunderstorm Warning', 'Severe', 'Immediate'), freeze: L('Freeze Warning', 'Severe', 'Expected'), winter: L('Winter Storm Warning', 'Severe', 'Expected'), torWatch: L('Tornado Watch', 'Extreme', 'Future'), frost: L('Frost Advisory', 'Minor', 'Expected'), sps: L('Special Weather Statement', 'Moderate', 'Expected') };
  });
  check('alerts graded like phone emergency alerts: tornado, flash flood, hurricane, snow squall, destructive storms "act now"; other storms, freeze, watches a heads-up',
    [lv.tor, lv.ffw, lv.hur, lv.squall, lv.svrDestructive].every((x) => x === 2) && [lv.svr, lv.freeze, lv.winter, lv.torWatch, lv.frost, lv.sps].every((x) => x === 1), JSON.stringify(lv));
  await page.waitForFunction(() => window.GodView && document.getElementById('boot') === null, null, { timeout: 60000 }).catch(() => {});
  await page.waitForTimeout(2500);
  const now = await page.evaluate(() => ({
    alerts: document.querySelectorAll('#nw-alerts .lk-alert').length,
    roads: [...document.querySelectorAll('#nw-roads .lk-row b')].map((b) => b.textContent),
    cams: document.querySelectorAll('#nw-cams .cam').length,
    places: [...document.querySelectorAll('#nw-places .tile .t-name')].map((b) => b.textContent),
    links: document.querySelectorAll('#nw-links a.lk-row').length,
    paused: window.GodView.viewer.useDefaultRenderLoop === false,
    sheetHidden: getComputedStyle(document.getElementById('sheet')).display === 'none',
    dot: !document.querySelector('#tabbar [data-tab="now"] .tb-dot').hidden,
  }));
  check('Now: alerts, Georgia 511 road events in words, nearest cameras, Watch places, safety links', now.alerts === 2 && now.roads.includes('Crash · I-16') && now.cams >= 2 && now.places.includes('Sample Home') && now.links >= 4, JSON.stringify(now));
  check('Now: the globe pauses and the map controls step aside; the Now tab shows a dot for the warning', now.paused && now.sheetHidden && now.dot, JSON.stringify(now));
  await page.screenshot({ path: path.join(outDir, 'lookout-now.png') });
  // Camera viewer from the strip
  await page.click('#nw-cams .cam');
  await page.waitForTimeout(400);
  const v = await page.evaluate(() => ({ open: !document.getElementById('viewer').hidden, title: document.querySelector('#viewer .v-title b')?.textContent, src: document.getElementById('v-pic')?.src || '' }));
  check('camera viewer opens on the nearest camera with a fresh picture', v.open && /SR 44 at Sample Rd/.test(v.title) && /511ga\.org\/map\/Cctv\/186\?t=\d+/.test(v.src), JSON.stringify(v));
  await page.click('#v-next');
  const v2 = await page.evaluate(() => document.querySelector('#viewer .v-title b')?.textContent);
  check('viewer: next camera', v2 && v2 !== v.title, v2);
  await page.click('#v-close');
  // Cams tab: grid with filters, then Traffic
  await page.click('#tabbar [data-tab="cams"]');
  await page.waitForFunction(() => document.querySelectorAll('#lk-cams .lk-grid .cam').length > 0, null, { timeout: 15000 }).catch(() => {});
  const cg = await page.evaluate(() => ({ chips: [...document.querySelectorAll('#lk-cams .lk-chips button')].map((b) => b.textContent.trim()), n: document.querySelectorAll('#lk-cams .lk-grid .cam').length, far: /far away/.test(document.getElementById('lk-cams').innerText) }));
  check('Cams: traffic cameras and webcams near the place (far ones left out), with filters', cg.n === 3 && cg.chips.includes('Traffic 2') && cg.chips.includes('Webcams 1') && !cg.far, JSON.stringify(cg));
  await page.click('#lk-cams [data-seg="traffic"]');
  await page.waitForTimeout(800);
  const tr = await page.evaluate(() => ({ ev: [...document.querySelectorAll('#tr-events .lk-row b')].map((b) => b.textContent), waze: document.getElementById('waze')?.src || '' }));
  check('Traffic: Georgia 511 events nearest first and the live Waze map', tr.ev[0] === 'Crash · I-16' && tr.ev.includes('Roadwork · SR 22') && /embed\.waze\.com/.test(tr.waze), JSON.stringify(tr));
  // Show on map from a road event: Map tab, globe drawing again, the event's card open
  await page.click('#tr-events .lk-row');
  await page.waitForFunction(() => !document.getElementById('card').hidden, null, { timeout: 20000 }).catch(() => {});
  const sm = await page.evaluate(() => ({ tab: document.body.className, loop: window.GodView.viewer.useDefaultRenderLoop, card: document.getElementById('card').hidden ? '' : document.getElementById('card-title').textContent, layer: window.GodView.manager.state.ga511Events.enabled }));
  check('"Show on map" switches to the globe (drawing again), turns the layer on and opens the event', /tab-map/.test(sm.tab) && sm.loop === true && sm.layer && /Incident · I-16/.test(sm.card), JSON.stringify(sm));
  await page.screenshot({ path: path.join(outDir, 'lookout-show-on-map.png') });
  await page.click('#card-close').catch(() => {});
  // Scanner: systems in your state, your county first; tap plays the latest calls
  await page.click('#tabbar [data-tab="scanner"]');
  await page.waitForFunction(() => document.querySelectorAll('#sc-list .lk-row').length > 0, null, { timeout: 15000 }).catch(() => {});
  const sc = await page.evaluate(() => [...document.querySelectorAll('#sc-list .lk-row')].map((r) => r.innerText.replace(/\s+/g, ' ')));
  check('Scanner: OpenMHz systems in Georgia, your county first, other states left out', sc.length === 2 && /Sample County Public Safety/.test(sc[0]) && /Your area/.test(sc[0]) && !sc.some((x) => /Out of State/.test(x)), JSON.stringify(sc));
  await page.click('#sc-list .lk-row');
  await page.waitForFunction(() => document.querySelector('#sc-player .sys'), null, { timeout: 15000 }).catch(() => {});
  await page.waitForTimeout(1500);
  const pl = await page.evaluate(() => ({ sys: document.querySelector('#sc-player .sys')?.textContent, text: document.getElementById('sc-player')?.innerText || '', live: !document.querySelector('#tabbar [data-tab="scanner"] .tb-live').hidden }));
  check('Scanner: plays the latest calls with talkgroup names; the tab shows it is live', /Sample County Public Safety/.test(pl.sys || '') && /(Fire|Police) Dispatch|EMS Ops/.test(pl.text) && pl.live, JSON.stringify(pl).slice(0, 300));
  await page.click('#sc-stop');
  const stopped = await page.evaluate(() => document.querySelector('#tabbar [data-tab="scanner"] .tb-live').hidden && !document.querySelector('#sc-player .sys'));
  check('Scanner: Stop ends it', stopped);
  // News: local headlines through the relay
  await page.click('#tabbar [data-tab="news"]');
  await page.waitForFunction(() => document.querySelectorAll('#nw-list .story').length > 0, null, { timeout: 15000 }).catch(() => {});
  const nw = await page.evaluate(() => [...document.querySelectorAll('#nw-list .story b')].map((b) => b.textContent));
  check('News: local headlines (source trimmed from the title), newest first', nw[0] === 'Sample County opens new bridge' && nw.length === 2 && (counts['relay:news.google.com'] || 0) >= 1, JSON.stringify(nw) + ' relay=' + counts['relay:news.google.com']);
  // Place picker: search a place; Now follows it
  await page.click('#tabbar [data-tab="now"]');
  await page.click('#lk-place');
  await page.fill('#pp-q', 'Atlanta');
  await page.click('#pp-form button[type="submit"]');
  await page.waitForSelector('#pp-res [data-i]', { timeout: 10000 }).catch(() => {});
  await page.click('#pp-res [data-i]');
  await page.waitForTimeout(1500);
  const moved = await page.evaluate(() => ({ name: document.getElementById('lk-place-name').textContent, saved: JSON.parse(localStorage.getItem('godview.lookout.v1')).place }));
  check('place picker: a searched place becomes the place every screen shows (and is remembered)', /Atlanta/.test(moved.name) && moved.saved.source === 'picked' && Math.abs(moved.saved.lat - 33.289) < 0.01, JSON.stringify(moved));
  // Drive mode
  await page.click('#nw-drive');
  await page.waitForTimeout(800);
  const dv = await page.evaluate(() => ({ open: !document.getElementById('drive').hidden, text: document.getElementById('drive').innerText }));
  check('drive mode: the time, weather and the most serious alert in big type', dv.open && /Severe Thunderstorm Warning/.test(dv.text) && /°F/.test(dv.text), dv.text.replace(/\s+/g, ' ').slice(0, 160));
  await page.screenshot({ path: path.join(outDir, 'lookout-drive.png') });
  await page.click('#d-done');
  // Settings: where GodView opens
  await page.click('#btn-settings');
  const opt = await page.evaluate(() => { const f = [...document.querySelectorAll('#settings-body .field')].find((x) => /Opens to/.test(x.innerText)); const s = f && f.querySelector('select'); if (!s) return null; s.value = 'map'; s.dispatchEvent(new Event('change')); return JSON.parse(localStorage.getItem('godview.lookout.v1')).openTo; });
  check('Settings: choose whether GodView opens on Now, Map or where you left off', opt === 'map', String(opt));
  await page.click('#settings-close');
  const bad = errors.filter((e) => !/favicon|net::ERR_FAILED|Failed to load resource|play\(\) request|NotAllowedError|NotSupportedError/.test(e));
  check('[v7] no unexpected console errors', bad.length === 0, bad.slice(0, 4).join(' | '));
  await context.close();

  // A ?tab= link opens that tab (the old Lookout address forwards to ?tab=now)
  const c2 = await browser.newContext(iphone);
  const counts2 = await setupRoutes(c2, { lookout: { openTo: 'map', place }, googleNewsDown: true });
  const p2 = await c2.newPage();
  await p2.goto(BASE + '?tab=cams', { waitUntil: 'load' });
  await p2.waitForTimeout(1500);
  const t2 = await p2.evaluate(() => ({ cams: !document.getElementById('lk-cams').hidden, current: document.querySelector('#tabbar [aria-current="page"]')?.dataset.tab }));
  check('?tab=cams opens the Cams tab', t2.cams && t2.current === 'cams', JSON.stringify(t2));
  // Google News turns the relay away: Bing News right away, and Google is left alone for a while after that
  const tn = Date.now();
  await p2.click('#tabbar [data-tab="news"]');
  await p2.waitForFunction(() => document.querySelectorAll('#nw-list .story').length > 0, null, { timeout: 20000 }).catch(() => {});
  const bn = await p2.evaluate(() => ({ first: document.querySelector('#nw-list .story b')?.textContent, src: document.querySelector('#nw-list .story small')?.textContent, via: document.getElementById('nw-list')?.innerText || '' }));
  bn.ms = Date.now() - tn;
  check('News: when Google turns the relay away, Bing News fills in at once (source shown)', bn.first === 'Bing sample: county fair opens' && /Sample Paper/.test(bn.src || '') && /Bing News/.test(bn.via) && bn.ms < 4000, JSON.stringify(bn).slice(0, 220));
  const asked = counts2['relay:news.google.com'] || 0;
  await p2.click('#lk-news [data-s="hour"]');
  await p2.waitForFunction(() => /Nothing new in the last hour|story/.test(document.getElementById('nw-list')?.innerHTML || ''), null, { timeout: 8000 }).catch(() => {});
  const hr = await p2.evaluate(() => document.getElementById('nw-list')?.innerText || '');
  check('News: after a turn-away, "Last hour" goes straight to Bing (Google not asked again)', (counts2['relay:news.google.com'] || 0) === asked && asked >= 1 && /Nothing new in the last hour/.test(hr), `google asks ${asked} -> ${counts2['relay:news.google.com']} | ${hr.slice(0, 60)}`);
  // The map pill tells the same story as Now about alerts, even with the map's alerts layer switched off
  await p2.click('#tabbar [data-tab="map"]');
  await p2.waitForFunction(() => window.GodView && window.GodView.manager && document.getElementById('boot') === null, null, { timeout: 60000 }).catch(() => {});
  await p2.evaluate(() => window.GodView.manager.enable('alerts', false));
  await p2.waitForFunction(() => /Severe Thunderstorm Warning/.test(document.querySelector('#status .s-head')?.textContent || ''), null, { timeout: 20000 }).catch(() => {});
  const pillHead = await p2.evaluate(() => ({ head: document.querySelector('#status .s-head')?.textContent || '', alertsOn: window.GodView.manager.state.alerts.enabled }));
  check('map pill: same alert as Now, even with the alerts layer off', pillHead.head === 'Heads-up: Severe Thunderstorm Warning' && pillHead.alertsOn === false, JSON.stringify(pillHead));
  await c2.close();
}


// ------------------------------------------------------------ scenario 10 (v8): new look, Drive mode dashboard, animal scan
{
  const iphone = { viewport: { width: 390, height: 844 }, deviceScaleFactor: 3, isMobile: true, hasTouch: true };
  const place = { lat: 32.84, lon: -83.63, name: 'Sampleville', state: 'GA', county: 'Sample County', country: 'US', source: 'picked' };
  const context = await browser.newContext({ ...iphone, permissions: ['camera'] });
  await setupRoutes(context, { lookout: { openTo: 'now', place } });
  const page = await context.newPage();
  const errors = [];
  page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
  page.on('pageerror', (e) => errors.push(String(e)));
  await page.goto(BASE + '?tab=now', { waitUntil: 'load' });
  await page.waitForFunction(() => document.querySelector('#lk-now .lk-hero'), null, { timeout: 30000 }).catch(() => {});
  await page.waitForTimeout(1500);
  const look = await page.evaluate(async () => {
    const cs = getComputedStyle(document.documentElement);
    const hero = getComputedStyle(document.querySelector('#lk-now .lk-hero'));
    const pill = getComputedStyle(document.querySelector('#tabbar [aria-current="page"]'), '::before');
    const files = await Promise.all(['icons/apple-touch-icon.png', 'icons/favicon.svg', 'icons/icon-512.png', 'manifest.webmanifest'].map((f) => fetch(f).then((r) => `${r.status} ${r.headers.get('content-type')}`)));
    return { accent: cs.getPropertyValue('--gv-accent').trim(), grad: cs.getPropertyValue('--gv-grad').trim().slice(0, 40), heroBg: hero.backgroundImage.slice(0, 160), pill: pill.backgroundImage.slice(0, 50), icon: document.querySelector('link[rel="apple-touch-icon"]').getAttribute('href'), files, boot: !!document.querySelector('.brand .gv-mark') };
  });
  check('new look: blue/violet brand instead of green, lit tab pill, new logo files served', look.accent === '#7aa5ff' && /gradient/.test(look.grad) && !/rgb\(18, 61, 51\)|rgba?\(62, 230, 196/.test(look.heroBg) && /gradient/.test(look.pill) && /apple-touch-icon\.png/.test(look.icon) && look.files.every((f) => /^200/.test(f)) && look.boot, JSON.stringify(look));
  await page.screenshot({ path: path.join(outDir, 'v8-now.png') });

  // Unit checks that run in the page: road numbers, limits, the road you're on, deer risk, eyeshine
  const unit = await page.evaluate(async () => {
    const d = await import('./js/lookout/drive.js');
    const m = await import('./js/lookout/eyeshine.js');
    const W = 320; const H = 180;
    const frame = (dots, bg = 12) => {
      const a = new Uint8ClampedArray(W * H * 4);
      for (let i = 0; i < W * H; i++) { a[i * 4] = bg; a[i * 4 + 1] = bg; a[i * 4 + 2] = bg; a[i * 4 + 3] = 255; }
      for (const [x, y, r, c] of dots) for (let dy = -r; dy <= r; dy++) for (let dx = -r; dx <= r; dx++) { if (dx * dx + dy * dy > r * r) continue; const i = ((y + dy) * W + (x + dx)) * 4; a[i] = c[0]; a[i + 1] = c[1]; a[i + 2] = c[2]; }
      return a;
    };
    const white = [235, 245, 225];
    const t = new m.EyeTracker(3, 4); const pp = [{ x: 0.5, y: 0.6, dx: 0.02, d: 0.006, score: 1 }];
    const cross = [{ tags: { ref: 'I 16', name: 'Sample Parkway', maxspeed: '70 mph' }, geometry: [{ lat: 32.8001, lon: -83.75 }, { lat: 32.8001, lon: -83.5 }] },
      { tags: { ref: 'SR 87', name: 'Crossing Road', maxspeed: '45 mph' }, geometry: [{ lat: 32.75, lon: -83.6302 }, { lat: 32.85, lon: -83.6302 }] }];
    const june = { rise: [Date.parse('2026-06-15T10:30:00Z')], set: [Date.parse('2026-06-16T00:40:00Z')] };
    const nov = { rise: [Date.parse('2026-11-13T11:55:00Z')], set: [Date.parse('2026-11-13T22:33:00Z')] };
    return {
      keys: ['I 16', 'I-16', 'Interstate 16', 'GA 22', 'SR 22', 'US-441', 'US 441', 'Sample Parkway'].map(d.roadKey).join(','),
      limits: [d.parseLimit('55 mph'), d.parseLimit('90'), d.parseLimit('none')].map((x) => (x ? x.mph : null)).join(','),
      northAtCrossing: d.pickWay(cross, 32.8001, -83.6302, 0)?.ref,
      eastAtCrossing: d.pickWay(cross, 32.8001, -83.6302, 90)?.ref,
      deer: [d.deerRisk(new Date('2026-06-15T17:00:00Z'), june).label, d.deerRisk(new Date('2026-06-16T00:10:00Z'), june).label, d.deerRisk(new Date('2026-11-13T17:00:00Z'), nov).label, d.deerRisk(new Date('2026-11-13T03:00:00Z'), nov).why].join(','),
      eyes: {
        pair: m.findEyePairs(frame([[150, 110, 1, white], [156, 110, 1, white]]), W, H).length,
        single: m.findEyePairs(frame([[150, 110, 1, white]]), W, H).length,
        headlights: m.findEyePairs(frame([[120, 100, 9, [255, 255, 255]], [200, 100, 9, [255, 255, 255]]]), W, H).length,
        red: m.findEyePairs(frame([[150, 110, 1, [250, 40, 40]], [156, 110, 1, [250, 40, 40]]]), W, H).length,
        sky: m.findEyePairs(frame([[150, 15, 1, white], [156, 15, 1, white]]), W, H).length,
        daylight: m.findEyePairs(frame([[150, 110, 1, white], [156, 110, 1, white]], 140), W, H).length,
        confirm: [t.update(pp), t.update(pp), !!t.update(pp)].join(','),
      },
    };
  });
  check('drive: road numbers match across sources (I 16 = I-16, GA 22 = SR 22, US-441 = US 441)', unit.keys === 'I16,I16,I16,SR22,SR22,US441,US441,', unit.keys);
  check('drive: speed limits read from OpenStreetMap (mph, km/h, none)', unit.limits === '55,56,', unit.limits);
  check('drive: at an intersection the road you are heading along wins', unit.northAtCrossing === 'SR 87' && unit.eastAtCrossing === 'I 16', `${unit.northAtCrossing} / ${unit.eastAtCrossing}`);
  check('drive: deer risk: June midday low, dusk high, November midday elevated (rut), night', unit.deer === 'Low,High,Elevated,after dark · fall rut', unit.deer);
  check('eyeshine: a small matched pair is found; one dot, headlights, red lights, sky and daylight are not; 3 of 4 checks confirm',
    unit.eyes.pair >= 1 && unit.eyes.single === 0 && unit.eyes.headlights === 0 && unit.eyes.red === 0 && unit.eyes.sky === 0 && unit.eyes.daylight === 0 && unit.eyes.confirm === ',,true', JSON.stringify(unit.eyes));

  // Drive mode: driving east on I-16 toward the sample crash (GPS fixes fed in directly)
  await page.evaluate(() => { navigator.geolocation.watchPosition = () => 1; navigator.geolocation.clearWatch = () => {}; });
  await page.click('#nw-drive');
  await page.waitForTimeout(800);
  const T0 = Date.now();
  await page.evaluate((t) => { GodViewDrive.fix(32.80, -83.660, { t }); GodViewDrive.fix(32.80, -83.6597, { t: t + 1000 }); }, T0);
  await page.waitForFunction(() => /I 16/.test(document.getElementById('dv-road').textContent) && !document.getElementById('dv-limit').hidden, null, { timeout: 8000 }).catch(() => {});
  await page.evaluate((t) => { GodViewDrive.fix(32.80, -83.630, { t: t + 101000 }); }, T0);
  await page.waitForTimeout(1200);
  const dv = await page.evaluate(() => ({
    spd: Number(document.getElementById('dv-spd').textContent), head: document.getElementById('dv-head').textContent, road: document.getElementById('dv-road').textContent,
    limit: document.getElementById('dv-lim').textContent, ahead: document.getElementById('dv-ahead').innerText, chips: document.getElementById('dv-chips').innerText,
    alert: document.getElementById('dv-alert').innerText, spoken: GodViewDrive.state().spoken,
  }));
  check('drive: speed and heading from GPS', dv.spd >= 58 && dv.spd <= 66 && /E/.test(dv.head), `${dv.spd} ${dv.head}`);
  check('drive: the road you are on and its speed limit', /I 16 · Sample Parkway/.test(dv.road) && dv.limit === '70', `${dv.road} | ${dv.limit}`);
  check('drive: Georgia 511 problems ahead of you, with distance, marked on your road', /Ahead of you/i.test(dv.ahead) && /Crash · I-16/.test(dv.ahead) && /your road/.test(dv.ahead) && /mi/.test(dv.ahead), dv.ahead.replace(/\s+/g, ' '));
  check('drive: weather where you are: fog, rain timing, deer risk at dusk, sunset', /Fog · visibility 0\.\d mi/.test(dv.chips) && /Rain in ~\d+ min/.test(dv.chips) && /Deer risk High · dusk · fall rut/.test(dv.chips) && /Sunset/.test(dv.chips), dv.chips.replace(/\s+/g, ' '));
  check('drive: the weather alert for where you are', /Severe Thunderstorm Warning/.test(dv.alert), dv.alert.replace(/\s+/g, ' '));
  check('drive: spoken: the alert, the fog and the crash ahead (once each)', dv.spoken.some((t) => /Heads-up\. Severe Thunderstorm Warning/.test(t)) && dv.spoken.some((t) => /^Fog\. Visibility under a mile/.test(t)) && dv.spoken.filter((t) => /Crash ahead on I 16, 5 miles/.test(t)).length === 1, JSON.stringify(dv.spoken));
  await page.evaluate((t) => { GodViewDrive.fix(32.80, -83.62573, { t: t + 111000 }); GodViewDrive.fix(32.80, -83.62146, { t: t + 121000 }); }, T0);
  await page.waitForTimeout(300);
  const over = await page.evaluate(() => ({ spd: document.getElementById('dv-spd').textContent, cls: document.getElementById('dv-spd').className }));
  check('drive: over the limit turns the speed amber or red', /warn|bad/.test(over.cls), JSON.stringify(over));
  await page.screenshot({ path: path.join(outDir, 'v8-drive.png') });
  // Voice off and on
  await page.click('#dv-voice');
  const voiceOff = await page.evaluate(() => document.getElementById('dv-voice').classList.contains('off'));
  await page.click('#dv-voice');
  const voiceOn = await page.evaluate(() => !document.getElementById('dv-voice').classList.contains('off'));
  check('drive: voice can be switched off and on', voiceOff && voiceOn, `${voiceOff} ${voiceOn}`);

  // Animal scan with the fake camera and a stand-in detector
  await page.evaluate(() => { window.__fakeDetections = []; window.GV_TEST_DETECTOR = { detectForVideo: () => ({ detections: window.__fakeDetections }) }; });
  await page.click('#dv-scan');
  await page.waitForFunction(() => GodViewDrive.state().scan.phase === 'scanning', null, { timeout: 15000 }).catch(() => {});
  const s1 = await page.evaluate(() => ({ phase: GodViewDrive.state().scan.phase, msg: GodViewDrive.state().scan.message, video: !!document.querySelector('#dv-cam video')?.srcObject, cam: !document.getElementById('dv-cam').hidden, btn: document.getElementById('dv-scan').innerText, note: document.getElementById('dv-note').textContent }));
  check('animal scan: the rear camera starts, the road shows, and it says what it is (and is not)', s1.phase === 'scanning' && s1.video && s1.cam && /Stop animal scan/.test(s1.btn) && /not a safety system/.test(s1.note), JSON.stringify(s1).slice(0, 300));
  await page.evaluate(() => { window.__fakeDetections = [{ categories: [{ categoryName: 'horse', score: 0.81 }], boundingBox: { originX: 270, originY: 170, width: 110, height: 80 } }]; });
  await page.waitForFunction(() => !document.getElementById('dv-flash').hidden, null, { timeout: 6000 }).catch(() => {});
  const s2 = await page.evaluate(() => ({ flash: document.getElementById('dv-flash').hidden ? '' : document.getElementById('dv-flash').innerText, spoken: GodViewDrive.state().spoken.slice(-3), boxes: GodViewDrive.state().scan.boxes.length }));
  check('animal scan: a large animal sounds the alarm, says "Animal ahead" and is framed on screen', /animal ahead/i.test(s2.flash) && s2.spoken.some((t) => /Animal ahead/.test(t)) && s2.boxes >= 1, JSON.stringify(s2));
  await page.screenshot({ path: path.join(outDir, 'v8-drive-scan.png') });
  await page.evaluate(() => { window.__fakeDetections = [{ categories: [{ categoryName: 'cat', score: 0.9 }], boundingBox: { originX: 270, originY: 170, width: 60, height: 50 } }, { categories: [{ categoryName: 'bird', score: 0.95 }], boundingBox: { originX: 100, originY: 150, width: 40, height: 30 } }]; });
  await page.waitForTimeout(800);
  const small = await page.evaluate(() => GodViewDrive.state().scan.boxes.length);
  check('animal scan: cats and birds are ignored (swerving for small animals is the bigger danger)', small === 0, String(small));
  await page.evaluate(() => { window.__tracks = document.querySelector('#dv-cam video').srcObject.getTracks(); });
  await page.click('#dv-scan');
  await page.waitForTimeout(300);
  const s4 = await page.evaluate(() => ({ on: GodViewDrive.state().scan.on, hidden: document.getElementById('dv-cam').hidden, ended: window.__tracks.every((t) => t.readyState === 'ended') }));
  check('animal scan: Stop turns the camera off', !s4.on && s4.hidden && s4.ended, JSON.stringify(s4));
  await page.evaluate(() => { navigator.mediaDevices.getUserMedia = () => Promise.reject(Object.assign(new Error('blocked'), { name: 'NotAllowedError' })); });
  await page.click('#dv-scan');
  await page.waitForTimeout(400);
  const den = await page.evaluate(() => ({ note: document.getElementById('dv-note').textContent, pref: JSON.parse(localStorage.getItem('godview.drive.v1')).scan }));
  check('animal scan: if the camera is blocked it says how to fix it, and does not keep retrying', /Install GodView on iPhone/.test(den.note) && den.pref === false, JSON.stringify(den).slice(0, 200));
  await page.click('#d-done');
  const closed = await page.evaluate(() => document.getElementById('drive').hidden);
  check('drive: Done closes it', closed);
  const bad = errors.filter((e) => !/favicon|net::ERR_FAILED|Failed to load resource|play\(\) request|NotAllowedError|NotSupportedError/.test(e));
  check('[v8] no unexpected console errors', bad.length === 0, bad.slice(0, 4).join(' | '));
  await context.close();
}

await browser.close();
server.close();
const failed = results.filter((r) => !r.ok);
console.log(`\n${results.length - failed.length}/${results.length} checks passed. Screenshots in test/out/`);
process.exit(failed.length ? 1 : 0);
