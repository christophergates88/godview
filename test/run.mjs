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
  check('registry has 25-50 layers', nLayers >= 25 && nLayers <= 50, String(nLayers));

  // Self-test: must resolve, cover every layer, and not change saved settings.
  const before = await page.evaluate(() => localStorage.getItem('godview.settings.v1'));
  const t0 = Date.now();
  const res = await page.evaluate(() => window.GodView.selfTest());
  const after = await page.evaluate(() => localStorage.getItem('godview.settings.v1'));
  fs.writeFileSync(path.join(outDir, 'selftest-sample.json'), JSON.stringify(res, null, 1));
  check('selfTest resolves < 60 s with one row per layer (+3 plane-card sources)', Array.isArray(res) && res.length === nLayers + 3 && Date.now() - t0 < 60000, `${res.length} rows in ${Date.now() - t0} ms`);
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

  check('relay used only for relay hosts', Object.keys(counts).filter((k) => k.startsWith('relay:')).every((k) => ['relay:api.adsb.lol', 'relay:nasstatus.faa.gov', 'relay:www.ndbc.noaa.gov', 'relay:www.nhc.noaa.gov', 'relay:droughtmonitor.unl.edu', 'relay:www.submarinecablemap.com', 'relay:511ga.org'].includes(k)), Object.keys(counts).filter((k) => k.startsWith('relay:')).join(','));
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
  check('add place by search saves it to the watch service', cfg.places?.length === 1 && cfg.places[0].name === 'Test Home' && Math.abs(cfg.places[0].lat - 33.749) < 0.01, JSON.stringify(cfg.places));
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
  await page.click('#watch-close');
  // watchSelfTest and What's here with the server check
  const wst = await page.evaluate(() => window.GodView.watchSelfTest());
  check('GodView.watchSelfTest() returns per-check results', wst.checks.length === 12 && wst.checks.every((c) => c.ok), JSON.stringify(wst.checks.map((c) => c.id + ':' + c.ok)));
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
  check('not set up: plain instructions shown, map still works', /Not set up yet/.test(msg) && /Deploy GodView Watch/.test(msg) && await p2.evaluate(() => window.GodView.manager.state.earthquakes.enabled), msg.slice(0, 120));
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
  await page.evaluate(() => window.GodView.globe.jumpTo(33.2, -84.0, 40));
  await page.waitForTimeout(2500);
  const near = await lodInfo();
  check('zoomed in: every aircraft in view is a full icon', near.icons >= near.dots && near.icons > 0, JSON.stringify(near));
  // Same idea for other busy layers (400 buoys)
  await page.evaluate(() => { window.GodView.globe.jumpTo(32.75, -83.45, 3000); window.GodView.manager.enable('buoys', true); });
  await page.waitForTimeout(3500);
  const busy = () => page.evaluate(() => { const c = window.GodView.manager.ctx.buoys.primitives.get(0); let n = 0; let small = 0; for (let i = 0; i < c.length; i++) { const p = c.get(i); if (p.show) { n++; if (p.pixelSize < 7) small++; } } return { shown: n, small, total: c.length }; });
  const bFar = await busy();
  await page.evaluate(() => window.GodView.globe.jumpTo(31.0, -88.0, 300));
  await page.waitForTimeout(2500);
  const bNear = await busy();
  check('busy point layers: far out, nearest 120 as small dots; close in, all at full size', bFar.total === 400 && bFar.shown <= 121 && bFar.small === bFar.shown && bNear.shown === 400 && bNear.small === 0, JSON.stringify({ bFar, bNear }));
  await page.evaluate(() => { window.GodView.manager.enable('buoys', false); window.GodView.globe.jumpTo(33.2, -84.0, 40); });
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
  await page.evaluate(() => window.GodView.globe.jumpTo(32.75, -83.45, 900));
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

await browser.close();
server.close();
const failed = results.filter((r) => !r.ok);
console.log(`\n${results.length - failed.length}/${results.length} checks passed. Screenshots in test/out/`);
process.exit(failed.length ? 1 : 0);
