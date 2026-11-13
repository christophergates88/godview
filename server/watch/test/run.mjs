// Local tests for the GodView Watch worker: runs the real worker code under
// Node with a mocked fetch and a mocked KV. Nothing touches the internet.
// Run: node server/watch/test/run.mjs   (optional: SATJS=/path/to/node_modules/satellite.js)

import * as W from '../worker.js';
import * as F from './fixtures.mjs';

const results = [];
const check = (name, ok, extra = '') => { results.push(ok); console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${extra ? '  — ' + extra : ''}`); };

import { KV, makeFetch } from './mocks.mjs';

const TOKEN = 't'.repeat(48);
function env(extra = {}) { return { KV: new KV(), WATCH_TOKEN: TOKEN, NTFY_TOPIC: 'gv-test-topic', ...extra }; }
async function seed(e, places = F.PLACES, settings = {}) { await e.KV.put('cfg', JSON.stringify({ places, settings })); e.KV.writes = 0; }
function req(path, { method = 'GET', token = TOKEN, origin = 'https://christophergates88.github.io', body } = {}) {
  const h = { };
  if (token) h.Authorization = `Bearer ${token}`;
  if (origin) h.Origin = origin;
  if (body) h['Content-Type'] = 'application/json';
  return new Request(`https://godview-watch.example.workers.dev${path}`, { method, headers: h, body: body ? JSON.stringify(body) : undefined });
}

// A night-time moment in Georgia (EST): 2026-11-13 02:00 UTC = 21:00 local
const NIGHT = new Date('2026-11-13T02:00:00Z');

// ---------------------------------------------------------------- auth & CORS on every route
{
  const e = env(); await seed(e);
  const routes = [['GET', '/status'], ['GET', '/places'], ['PUT', '/places'], ['GET', '/events'], ['POST', '/events/handled'], ['GET', '/brief'], ['GET', '/brief/now'], ['GET', '/brief/point?lat=33&lon=-84'], ['GET', '/history?place=home'], ['GET', '/selftest'], ['POST', '/test-notify']];
  let allDenied = true; let allCors = true;
  for (const [m, p] of routes) {
    const r1 = await W.handle(req(p, { method: m, token: null, body: m !== 'GET' ? {} : undefined }), e, makeFetch({ now: Date.now() }));
    const r2 = await W.handle(req(p, { method: m, token: 'wrong'.padEnd(48, 'x'), body: m !== 'GET' ? {} : undefined }), e, makeFetch({ now: Date.now() }));
    if (r1.status !== 401 || r2.status !== 401) allDenied = false;
    if (r1.headers.get('Access-Control-Allow-Origin') !== 'https://christophergates88.github.io') allCors = false;
  }
  check('every route rejects missing/wrong token (401)', allDenied);
  check('allowed origin gets CORS header even on errors', allCors);
  const evil = await W.handle(req('/status', { origin: 'https://evil.example' }), e, makeFetch({ now: Date.now() }));
  check('other origins get no CORS header', !evil.headers.get('Access-Control-Allow-Origin'));
  const pre = await W.handle(new Request('https://x/places', { method: 'OPTIONS', headers: { Origin: 'https://christophergates88.github.io', 'Access-Control-Request-Headers': 'authorization' } }), e);
  check('preflight allows Authorization header', pre.status === 204 && /Authorization/.test(pre.headers.get('Access-Control-Allow-Headers') || ''));
  const noTok = await W.handle(req('/status'), { KV: new KV() });
  check('no WATCH_TOKEN configured -> 503 not set up', noTok.status === 503);
  const ok = await W.handle(req('/status'), e, makeFetch({ now: Date.now() }));
  check('correct token -> 200 /status', ok.status === 200);
  const nf = await W.handle(req('/nope'), e);
  check('unknown route -> 404', nf.status === 404);
}

// ---------------------------------------------------------------- places validation
{
  const e = env();
  const bad = await W.handle(req('/places', { method: 'PUT', body: { places: [{ id: 'x', name: 'X', lat: 999, lon: 0, radiusKm: 10, kind: 'home' }] } }), e);
  check('PUT /places rejects bad coordinates', bad.status === 400);
  const many = await W.handle(req('/places', { method: 'PUT', body: { places: Array.from({ length: 13 }, (_, i) => ({ id: 'p' + i, name: 'P', lat: 1, lon: 1, radiusKm: 5, kind: 'home' })) } }), e);
  check('PUT /places rejects more than 12 places', many.status === 400);
  const good = await W.handle(req('/places', { method: 'PUT', body: { places: F.PLACES, settings: { briefHour: 7, tz: 'America/New_York' } } }), e);
  const gj = await good.json();
  check('PUT /places stores valid places and settings', good.status === 200 && gj.places.length === 2 && gj.settings.briefHour === 7);
}

// ---------------------------------------------------------------- selftest: all checks, no writes, no notifications
{
  const e = env(); await seed(e);
  const f = makeFetch({ now: Date.now() });
  const r = await W.handle(req('/selftest'), e, f);
  const j = await r.json();
  const ids = j.checks.map((c) => c.id);
  check('selftest runs every check', Object.keys(W.CHECKS).every((c) => ids.includes(c)), ids.join(','));
  check('selftest: all checks ok on sample data', j.checks.every((c) => c.ok), j.checks.filter((c) => !c.ok).map((c) => `${c.id}: ${c.error}`).join(' | '));
  check('selftest writes nothing and notifies nothing', e.KV.writes === 0 && f.sent.length === 0);
  check('selftest stays within the subrequest budget', j.subrequests <= 45, String(j.subrequests));
  check('api.weather.gov is called with a User-Agent', f.calls.some((c) => /api\.weather\.gov/.test(c.url) && /GodView/.test(c.init.headers['User-Agent'])));
}

// ---------------------------------------------------------------- one source failing does not block others
{
  const e = env(); await seed(e);
  const f = makeFetch({ now: Date.now(), fail: /earthquake\.usgs\.gov/ });
  const r = await (await W.handle(req('/selftest'), e, f)).json();
  const q = r.checks.find((c) => c.id === 'quakes');
  const failed = r.checks.filter((c) => !c.ok).map((c) => c.id);
  check('a failing source is isolated (only the USGS-based rows fail)', q && !q.ok && /503/.test(q.error) && failed.every((id) => /quakes|USGS/.test(id)), failed.join(', '));
}

// ---------------------------------------------------------------- cron runs: events, severity, notify, dedupe, quiet hours
let afterFirst;
{
  const e = env(); await seed(e);
  // Run at a quiet hour (21:00 local is NOT quiet by default 22-06); use 23:00 local = 04:00 UTC
  const quietNow = new Date('2026-11-13T04:00:00Z');
  const f = makeFetch({ now: quietNow.getTime() });
  // Force every check due by running the slot where (slot + idx) % 72 === 0 for place 0
  let t = quietNow.getTime();
  while (Math.floor(t / 300000) % 72 !== 0) t += 300000;
  const at = new Date(t); // a run where all rotating checks are due for place 0
  const lp = W.localParts(at, 'America/New_York');
  const r1 = await W.runAll(e, at, makeFetch({ now: at.getTime() }));
  const log = JSON.parse(e.KV.m.get('log:home'));
  const sevOf = (re) => log.find((x) => re.test(x.title))?.sev;
  check('first run creates events', r1.newEvents >= 8, `${r1.newEvents} events at local ${lp.hour}:${String(lp.minute).padStart(2, '0')}`);
  check('tornado warning = act now, with what to do', sevOf(/Tornado Warning/) === W.SEV.act && /TAKE COVER/.test(log.find((x) => /Tornado Warning/.test(x.title)).todo));
  check('golf-ball hail within radius = heads-up', sevOf(/hail/) === W.SEV.heads);
  check('far-away hail ignored', !log.some((x) => /Far Away/.test(x.text)));
  check('M3.1 quake 4 km away = info; Japan M5.2 ignored', sevOf(/M3\.1/) === W.SEV.info && !log.some((x) => /M5\.2/.test(x.title)));
  check('wildfire 12 mi away = heads-up with distance', sevOf(/Sample Ridge fire near/) === W.SEV.heads && /12 mi E of Test Home/.test(log.find((x) => /Sample Ridge/.test(x.title)).text), log.find((x) => /Sample Ridge/.test(x.title))?.text);
  check('river at minor flooding = heads-up', sevOf(/Sample Creek near Sample: minor flooding/) === W.SEV.heads);
  check('7700 squawk within 25 mi = heads-up', sevOf(/emergency code 7700/) === W.SEV.heads);
  check('military aircraft low = info, labelled a guess', log.some((x) => /Military aircraft low/.test(x.title) && x.sev === W.SEV.info && x.data?.guess));
  check('place in hurricane cone = heads-up', sevOf(/in the cone/) === W.SEV.heads);
  check('AQI 160 = heads-up (unhealthy)', sevOf(/Air quality unhealthy/) === W.SEV.heads);
  check('launch from the Cape within 20 h = info "may be visible"', log.some((x) => x.check === 'launch' && /may be visible/.test(x.text)));
  const sentTitles = (f) => f.sent.map((s) => s.title);
  void sentTitles;
  afterFirst = { e, at };
}
{
  // Quiet hours: 23:00 local -> only act-now goes out
  const e = env(); await seed(e);
  const at = new Date('2026-11-13T04:00:00Z');
  const f = makeFetch({ now: at.getTime() });
  await W.runAll(e, at, f);
  const pris = f.sent.map((s) => s.priority);
  check('quiet hours: only act-now notifications are sent', pris.length > 0 && pris.every((p) => p === 5), JSON.stringify(f.sent.map((s) => s.title)));
  const log = JSON.parse(e.KV.m.get('log:home'));
  check('held events still logged for the brief', log.some((x) => x.sev === W.SEV.heads && !x.notified));
  const n = f.sent[0];
  check('notification: short title, plain body, click opens the place', /^Test Home: /.test(n.title) && n.click.endsWith('#place=home') && n.topic === 'gv-test-topic');
  // Daytime: heads-up goes out too
  const e2 = env(); await seed(e2);
  const day = new Date('2026-11-13T17:00:00Z');
  const f2 = makeFetch({ now: day.getTime() });
  await W.runAll(e2, day, f2);
  check('daytime: heads-up also notified (priority 4)', f2.sent.some((s) => s.priority === 4) && !f2.sent.some((s) => s.priority === 3 && !/brief/i.test(s.title)));
  // Dedupe: same data again -> nothing new, nothing sent
  const f3 = makeFetch({ now: day.getTime() + 300000 });
  const w0 = e2.KV.writes;
  const r3 = await W.runAll(e2, new Date(day.getTime() + 300000), f3);
  check('dedupe: identical second run sends nothing new', r3.newEvents === 0 && f3.sent.length === 0, `new=${r3.newEvents} sent=${f3.sent.length}`);
  check('dedupe: second run writes at most 1 key', e2.KV.writes - w0 <= 1, String(e2.KV.writes - w0));
  // Alert ended
  const f4 = makeFetch({ now: day.getTime() + 600000, tornado: false });
  await W.runAll(e2, new Date(day.getTime() + 600000), f4);
  const log2 = JSON.parse(e2.KV.m.get('log:home'));
  check('alert that disappears produces an "ended" info event', log2.some((x) => /Tornado Warning ended/.test(x.title) && x.sev === W.SEV.info));
}
{
  // Fire getting closer
  const e = env(); await seed(e, [F.PLACES[0]]);
  const base = new Date('2026-11-13T17:00:00Z');
  let t = base.getTime(); while ((Math.floor(t / 300000) + 0) % 3 !== 0) t += 300000;
  await W.runAll(e, new Date(t), makeFetch({ now: t, fireKm: 20 }));
  const t2 = t + 900000;
  await W.runAll(e, new Date(t2), makeFetch({ now: t2, fireKm: 12 }));
  const log = JSON.parse(e.KV.m.get('log:home'));
  check('fire gap closing -> "getting closer" event', log.some((x) => /getting closer/.test(x.title) && /now 7\.5 mi E of Test Home \(was 12 mi\)/.test(x.text)), log.filter((x) => x.check === 'fires').map((x) => x.text).join(' | '));
}
{
  // Loitering heuristic: same low aircraft on 3 runs in a row
  const e = env(); await seed(e, [F.PLACES[0]]);
  let t = new Date('2026-11-13T17:00:00Z').getTime();
  for (let i = 0; i < 3; i++) { await W.runAll(e, new Date(t), makeFetch({ now: t })); t += 300000; }
  const log = JSON.parse(e.KV.m.get('log:home'));
  check('aircraft low over the place for 3 runs -> loitering heads-up (guess)', log.some((x) => /staying low/.test(x.title) && x.data?.guess && /guess/.test(x.text)));
}

// ---------------------------------------------------------------- morning brief + DST
{
  const s = W.DEFAULT_SETTINGS;
  // Winter (EST, UTC-5): 6:15 local = 11:15 UTC. Summer (EDT, UTC-4): 6:15 local = 10:15 UTC.
  check('DST winter: brief not due at 6:10 local', !W.briefDue(new Date('2026-12-15T11:10:00Z'), s, null));
  check('DST winter: brief due at 6:15 local (11:15 UTC)', W.briefDue(new Date('2026-12-15T11:15:00Z'), s, null));
  check('DST summer: brief due at 6:15 local (10:15 UTC)', W.briefDue(new Date('2026-07-15T10:15:00Z'), s, null) && !W.briefDue(new Date('2026-07-15T10:10:00Z'), s, null));
  check('DST spring-forward day (Mar 8 2026): due at 10:15 UTC', W.briefDue(new Date('2026-03-08T10:15:00Z'), s, null) && !W.briefDue(new Date('2026-03-08T10:10:00Z'), s, null));
  check('DST fall-back day (Nov 1 2026): due at 11:15 UTC', W.briefDue(new Date('2026-11-01T11:15:00Z'), s, null) && !W.briefDue(new Date('2026-11-01T10:15:00Z'), s, null));
  check('brief not sent twice the same day', !W.briefDue(new Date('2026-12-15T11:20:00Z'), s, '2026-12-15'));
  check('brief not sent late in the evening if missed', !W.briefDue(new Date('2026-12-15T23:00:00Z'), s, null));

  const e = env(); await seed(e);
  const at = new Date('2026-12-15T11:15:00Z');
  const f = makeFetch({ now: at.getTime() });
  const r = await W.runAll(e, at, f);
  const brief = JSON.parse(e.KV.m.get('brief:latest') || 'null');
  check('morning brief built, stored and sent', r.brief && brief && f.sent.some((m) => m.title === 'Morning brief' && m.click.endsWith('#brief')));
  check('brief (rules) covers weather, active alerts, outlook and do-lines', /Test Home: rain, 61°\/30°F, 70% rain, gusts 44 mph\./.test(brief.text) && /In effect: Tornado Warning/.test(brief.text) && /slight severe-storm risk/.test(brief.text) && (brief.text.match(/^Do: /gm) || []).length <= 6, brief.text.split('\n').slice(0, 4).join(' / '));
  check('at most three "do this" lines per place', brief.facts.every((x) => x.todo.length <= 3));
  check('brief is honest about short history', brief.facts.every((x) => /history/.test(x.history.note) || /No history/.test(x.history.note)), brief.facts[0].history.note);
  check('no AI key -> rule-based wording', brief.by === 'rules');

  const e2 = env({ ANTHROPIC_API_KEY: 'sk-test' }); await seed(e2);
  const f2 = makeFetch({ now: at.getTime() });
  await W.runAll(e2, at, f2);
  const b2 = JSON.parse(e2.KV.m.get('brief:latest'));
  check('AI key -> Claude wording with the configured small model', b2.by === 'claude-haiku-5-5' && f2.sent.ai.model === 'claude-haiku-5-5' && /ONLY the facts/.test(f2.sent.ai.system));
  const e3 = env({ ANTHROPIC_API_KEY: 'sk-test' }); await seed(e3);
  await W.runAll(e3, at, makeFetch({ now: at.getTime(), anthropic: 'fail' }));
  const b3 = JSON.parse(e3.KV.m.get('brief:latest'));
  check('Claude failure -> falls back to rule-based text', b3.by === 'rules' && /529/.test(b3.aiError) && b3.text === b3.rulesText);
  const e4 = env({ ANTHROPIC_API_KEY: 'sk-test', BRIEF_MODEL: 'claude-sonnet-5-5' }); await seed(e4);
  const f4 = makeFetch({ now: at.getTime() });
  await W.runAll(e4, at, f4);
  check('model can be changed with BRIEF_MODEL', f4.sent.ai.model === 'claude-sonnet-5-5');
}

// ---------------------------------------------------------------- history / "is this normal?"
{
  const now = new Date('2026-11-13T17:00:00Z');
  const n0 = W.normals([], null, now, 'America/New_York');
  check('no history: says so plainly', n0.days === 0 && /No history yet/.test(n0.note));
  const three = [1, 2, 3].map((i) => ({ d: `2026-11-1${i}`, alerts: 1, hail: 0, quakeMax: 2.6, acft: { 12: 10 } }));
  const n3 = W.normals(three, { alerts: 5, acft: { 12: 40 } }, now, 'America/New_York');
  check('3 days: "3 days of history so far" and no "unusual" claims', /3 days of history so far, too little/.test(n3.note) && n3.items.every((i) => !i.unusual), n3.note);
  const many = Array.from({ length: 30 }, (_, i) => ({ d: `d${i}`, alerts: i % 10 === 0 ? 1 : 0, hail: i === 5 ? 1.25 : 0, quakeMax: i === 7 ? 3.4 : 0, acft: { 12: 8 + (i % 3) } }));
  const n30 = W.normals(many, { alerts: 0, acft: { 12: 40 } }, now, 'America/New_York');
  const ac = n30.items.find((i) => i.id === 'aircraft');
  check('30 days: aircraft now vs typical by hour, flagged unusual', ac && ac.normal === 'typically 9' && ac.unusual === true, JSON.stringify(ac));
  check('30 days: hail days and strongest quake reported', n30.items.find((i) => i.id === 'hail').normal === '1 in 30 days' && n30.items.find((i) => i.id === 'quake').normal === 'M3.4');
}

// ---------------------------------------------------------------- KV writes over a quiet day
{
  const e = env(); await seed(e);
  let t = new Date('2026-11-13T05:00:00Z').getTime();
  for (let i = 0; i < 289; i++) { await W.runAll(e, new Date(t), makeFetch({ now: t, tornado: false, gauge: 'no_flooding', aqi: 30, fireKm: 500 })); t += 300000; }
  check('KV writes over 24 h (2 places, a few events) stay far under 1,000', e.KV.writes < 150, `${e.KV.writes} writes in 289 runs`);
  console.log('   estimated daily KV writes (2 places, quiet day):', e.KV.writes);
  const hist = JSON.parse(e.KV.m.get('hist:home') || '[]');
  check('daily rollup moved to history at local midnight', hist.length === 1 && hist[0].acft && Object.keys(hist[0].acft).length >= 10, JSON.stringify(hist[0]).slice(0, 160));
}

// ---------------------------------------------------------------- worst-case subrequests with 12 places
{
  const e = env();
  const places = Array.from({ length: 12 }, (_, i) => ({ id: 'p' + i, name: 'P' + i, lat: 33 + i * 0.1, lon: -84, radiusKm: 30, kind: 'home' }));
  await seed(e, places);
  let maxSub = 0; let skipped = 0;
  let t = new Date('2026-11-13T17:00:00Z').getTime();
  for (let i = 0; i < 12; i++) {
    const r = await W.runAll(e, new Date(t), makeFetch({ now: t }));
    maxSub = Math.max(maxSub, r.subrequests);
    t += 300000;
  }
  const health = JSON.parse(e.KV.m.get('state')).health;
  skipped = Object.values(health).filter((h) => !h.ok).length;
  check('12 places: never exceeds the subrequest budget', maxSub <= 45, `max ${maxSub}`);
  check('budget skips are not reported as source failures', skipped === 0, JSON.stringify(health));
}

// ---------------------------------------------------------------- orbit model vs satellite.js (SGP4)
{
  let sat = null;
  try { sat = await import(process.env.SATJS || '/tmp/gvtest/node_modules/satellite.js/dist/index.js'); } catch { sat = null; }
  if (!sat) console.log('SKIP  orbit model vs satellite.js (set SATJS to satellite.js dist/index.js)');
  else {
    const epoch = Date.parse('2026-11-13T00:00:00Z');
    const omm = F.issOmm(epoch)[0];
    const rec = sat.json2satrec(omm);
    let worst = 0; let worstEl = 0;
    for (let h = 0; h <= 24; h += 1) {
      const d = new Date(epoch + h * 3600e3);
      const a = W.propagate(omm, d);
      const b = sat.propagate(rec, d).position;
      worst = Math.max(worst, Math.hypot(a.x - b.x, a.y - b.y, a.z - b.z));
      const la = W.lookAngles(33.8053, -84.1455, a, d).el;
      const gd = { latitude: sat.degreesToRadians(33.8053), longitude: sat.degreesToRadians(-84.1455), height: 0.3 };
      const lb = sat.radiansToDegrees(sat.ecfToLookAngles(gd, sat.eciToEcf(b, sat.gstime(d))).elevation);
      worstEl = Math.max(worstEl, Math.abs(la - lb));
    }
    check('ISS position within 100 km of SGP4 over 24 h (~13 s of track)', worst < 100, `worst ${worst.toFixed(1)} km`);
    check('elevation angle within 3° of SGP4 over 24 h', worstEl < 3, `worst ${worstEl.toFixed(2)}°`);
    const passes = W.visiblePasses(omm, 33.8053, -84.1455, new Date(epoch), 72);
    check('visible-pass finder returns sane passes', passes.every((p) => p.maxEl <= 90 && p.end - p.start < 12 * 60000), `${passes.length} visible passes in 72 h`);
  }
}

// ---------------------------------------------------------------- v5: inferences
{
  const place = { id: 'home', name: 'Test Home', lat: 33.8053, lon: -84.1455, radiusKm: 40, kind: 'home' };
  const ctx = { now: new Date('2026-11-13T17:00:00Z'), settings: W.DEFAULT_SETTINGS, test: true };
  const ac = (o) => ({ hex: Math.random().toString(16).slice(2, 8), lat: 33.80, lon: -84.14, alt_baro: 800, gs: 20, ...o });
  const hov = W.aircraftInferences(ctx, place, {}, [ac({ t: 'EC35', flight: 'LIFE1 ' })]);
  check('helicopter low and slow -> "Possibly: … landing or hovering" (low confidence, with evidence)', hov.some((e) => /^Possibly: helicopter landing/.test(e.title) && e.data.inference && e.data.confidence === 'low' && e.data.evidence.length));
  const conv = W.aircraftInferences(ctx, place, {}, [ac({ t: 'H60', alt_baro: 3000, gs: 100 }), ac({ t: 'AS50', alt_baro: 2000, gs: 90, lat: 33.81 }), ac({ dbFlags: 1, t: 'C130', alt_baro: 9000, gs: 250, lon: -84.13 })]);
  check('three special aircraft within 5 km -> convergence inference (medium)', conv.some((e) => /gathered in one spot/.test(e.title) && e.data.confidence === 'medium'));
  const tank = W.aircraftInferences(ctx, place, { fires: { f1: 12 } }, [ac({ t: 'AT8T', alt_baro: 1500, gs: 140 })]);
  check('air tanker low near a listed fire -> heads-up inference (medium)', tank.some((e) => /firefighting/.test(e.title) && e.sev === W.SEV.heads && e.data.confidence === 'medium'));
  const none = W.aircraftInferences(ctx, place, {}, [ac({ t: 'B738', alt_baro: 35000, gs: 450 })]);
  check('an ordinary airliner produces no inference', none.length === 0);
  const t = ctx.now.getTime();
  const recent = [
    { check: 'storms', title: 'Tornado reported nearby', t, data: { pos: { lat: 33.70, lon: -84.10 } } },
    { check: 'squawk', title: 'Aircraft emergency code 7700', t: t - 600e3, data: { pos: { lat: 33.72, lon: -84.12 } } },
    { check: 'fires', title: 'Sample fire near Test Home', t: t - 900e3, data: { pos: { lat: 33.71, lon: -84.09 } } },
    { check: 'storms', title: 'Hail far away', t, data: { pos: { lat: 35.5, lon: -80 } } },
  ];
  const cross = W.crossSignal(ctx, place, recent);
  check('cross-signal: 3 different signals within 8 km and an hour -> one high-confidence card', cross.length === 1 && cross[0].data.confidence === 'high' && cross[0].data.evidence.length === 3 && /Possibly/.test(cross[0].text), JSON.stringify(cross.map((c) => c.text)));
  const hail = W.hailInference(ctx, place, { alertTags: { a: { hail: 1.25, event: 'Severe Thunderstorm Warning' } } }, [{ check: 'storms', title: '1.75 in hail reported', distKm: 6, text: '1.75-inch hail reported at Sample.' }, { check: 'storms', title: '1.00 in hail reported', distKm: 9, text: '1-inch hail.' }]);
  check('hail likely: warned hail size + nearby hail reports -> high-confidence inference', hail.length === 1 && hail[0].data.confidence === 'high' && /warning named 1.25 in hail/.test(hail[0].text));
  const short = W.baselineInference(ctx, place, Array.from({ length: 5 }, (_, i) => ({ d: `2026-11-0${i + 1}`, acft: { 12: 20 } })), 1);
  check('pattern of life: under 14 days of history -> no claim', short.length === 0);
  const hist = Array.from({ length: 28 }, (_, i) => ({ d: new Date(Date.UTC(2026, 9, 10 + i)).toISOString().slice(0, 10), acft: { 12: 20 + (i % 3) } }));
  const quiet = W.baselineInference(ctx, place, hist, 2);
  check('pattern of life: far fewer aircraft than the same hour of the week -> low-confidence inference', quiet.length === 1 && /fewer aircraft than usual/.test(quiet[0].text) && quiet[0].data.confidence === 'low', quiet[0]?.text);
}

// ---------------------------------------------------------------- v5: warned hail/wind in alert text
{
  const e = env(); await seed(e, [F.PLACES[0]]);
  const at = new Date('2026-11-13T17:00:00Z');
  await W.runAll(e, at, makeFetch({ now: at.getTime() }));
  const log = JSON.parse(e.KV.m.get('log:home'));
  check('alert text carries the warning\'s hail size and wind gust', log.some((x) => /Tornado Warning/.test(x.title) && /warned for 1\.00 in hail, wind 60 MPH/.test(x.text)), log.find((x) => /Tornado Warning/.test(x.title))?.text);
}

// ---------------------------------------------------------------- v5: camera AI
{
  const cam = { id: 'ga-186', name: 'SR 44 at Sample Rd', url: 'https://511ga.org/map/Cctv/186' };
  const bad = W.validPlaces([{ ...F.PLACES[0], cams: [cam, { id: 'x', name: 'Private', url: 'https://my-home-camera.example/snap.jpg' }], camAI: true }]);
  check('only public DOT camera hosts are accepted', bad[0].cams.length === 1 && bad[0].cams[0].url === cam.url && bad[0].camAI === true);
  const e = env({ ANTHROPIC_API_KEY: 'sk-test' });
  await seed(e, [{ ...F.PLACES[0], cams: [cam, { ...cam, id: 'ga-187', url: 'https://511ga.org/map/Cctv/187' }], camAI: true }], { camCap: 1 });
  let t = new Date('2026-11-13T17:00:00Z').getTime();
  while (Math.floor(t / 300000) % 12 !== 0) t += 300000;
  const f = makeFetch({ now: t, tornado: false });
  await W.runAll(e, new Date(t), f);
  const log = JSON.parse(e.KV.m.get('log:home') || '[]');
  const ce = log.find((x) => x.check === 'camera');
  check('camera AI: flooding seen with 86% confidence -> heads-up "Camera shows water over the road"', ce && ce.sev === W.SEV.heads && /appears to show water over the road/.test(ce.text) && /86% confident/.test(ce.text), ce?.text);
  const v = f.sent.vision?.[0];
  check('vision request: image block (base64 JPEG) before a strict "only what is visible" instruction', v && v.messages[0].content[0].type === 'image' && v.messages[0].content[0].source.type === 'base64' && v.messages[0].content[0].source.media_type === 'image/jpeg' && /ONLY what is clearly visible/.test(v.messages[0].content[1].text) && v.model === 'claude-haiku-5-5');
  const st = JSON.parse(e.KV.m.get('state'));
  check('daily cap enforced in KV (cap 1 -> 1 call, second camera skipped)', st.camAI.used === 1 && st.camAI.capped === true && f.sent.vision.length === 1, JSON.stringify(st.camAI));
  const r = await (await W.handle(req('/status'), e, makeFetch({ now: t }))).json();
  check('/status shows camera AI use and cap', typeof r.cameraAI.used === 'number' && r.cameraAI.cap === 1 && r.cameraAI.enabled && r.cameraAI.places === 1);
  const e2 = env(); await seed(e2, [{ ...F.PLACES[0], cams: [cam], camAI: true }]);
  const f2 = makeFetch({ now: t });
  await W.runAll(e2, new Date(t), f2);
  check('no ANTHROPIC_API_KEY -> no camera calls at all', !f2.sent.vision && !f2.calls.cam);
  const e3 = env({ ANTHROPIC_API_KEY: 'sk-test' }); await seed(e3, [{ ...F.PLACES[0], cams: [cam], camAI: true }]);
  const f3 = makeFetch({ now: t, tornado: false, visionText: '{"findings":[{"what":"nothing_notable","confidence":0.95}]}' });
  await W.runAll(e3, new Date(t), f3);
  check('nothing notable -> no event', !JSON.parse(e3.KV.m.get('log:home') || '[]').some((x) => x.check === 'camera'));
}

// ---------------------------------------------------------------- v6: Cloudflare Workers AI (no key needed)
{
  // A stand-in for the Workers AI binding: records calls, answers like Workers AI does ({ response }).
  const fakeAI = (answers) => { const calls = []; return { calls, run: async (model, input) => { calls.push({ model, input }); const a = answers(input, calls.length); if (a instanceof Error) throw a; return a; } }; };
  const at = new Date('2026-11-13T11:15:00Z'); // 6:15 New York: morning brief time
  check('aiKind: Claude when a key is set, else Workers AI, else none', W.aiKind({ ANTHROPIC_API_KEY: 'k', AI: fakeAI(() => ({})) }) === 'claude' && W.aiKind({ AI: fakeAI(() => ({})) }) === 'workers-ai' && W.aiKind({}) === null);
  check('numbers check: only numbers already in the facts are allowed', W.numbersGrounded('61° and 30 mph', 'high 61 gusts 30') && !W.numbersGrounded('a 90% chance', 'chance 70'));
  check('numbers check: rounding a decimal and 12-hour times are fine, new numbers are not', W.numbersGrounded('UV 5, sunset 5:42', '{"uv":5.35,"sunset":"17:42"}') && W.numbersGrounded('UV 5.4', '{"uv":5.35}') && !W.numbersGrounded('UV 9', '{"uv":5.35}') && !W.numbersGrounded('sunset 6:42', '{"sunset":"17:42"}') && !W.numbersGrounded('10 degrees warmer than normal', '{"now":61,"normal":"55-58"}'));
  // Brief worded by Workers AI
  const ai = fakeAI((input) => ({ response: `Test Home: rain today. ${JSON.parse(input.messages[1].content)[0].place.name} stays under watch.` }));
  const e = env({ AI: ai }); await seed(e);
  await W.runAll(e, at, makeFetch({ now: at.getTime() }));
  const b = JSON.parse(e.KV.m.get('brief:latest'));
  check('no key + Workers AI -> brief worded by Workers AI (Llama 4 Scout), facts-only instruction', b.by === '@cf/meta/llama-4-scout-17b-16e-instruct' && ai.calls[0].model === '@cf/meta/llama-4-scout-17b-16e-instruct' && /ONLY the facts/.test(ai.calls[0].input.messages[0].content), `${b.by} ${ai.calls.length}`);
  // A made-up number sends it back to the rule-based text
  const ai2 = fakeAI(() => ({ response: 'Test Home: a 97% chance of a tornado.' }));
  const e2 = env({ AI: ai2 }); await seed(e2);
  await W.runAll(e2, at, makeFetch({ now: at.getTime() }));
  const b2 = JSON.parse(e2.KV.m.get('brief:latest'));
  check('Workers AI adds a number not in the facts -> rule-based text instead', b2.by === 'rules' && /number/.test(b2.aiError || '') && b2.text === b2.rulesText, b2.aiError);
  const ai3 = fakeAI(() => new Error('Workers AI: daily free allocation used up'));
  const e3 = env({ AI: ai3 }); await seed(e3);
  await W.runAll(e3, at, makeFetch({ now: at.getTime() }));
  const b3 = JSON.parse(e3.KV.m.get('brief:latest'));
  check('Workers AI error (e.g. daily allowance used up) -> rule-based text', b3.by === 'rules' && /allocation/.test(b3.aiError || ''));
  // Camera frames read by Workers AI: the picture goes as a data: URL
  const cam = { id: 'ga-186', name: 'SR 44 at Sample Rd', url: 'https://511ga.org/map/Cctv/186' };
  const vis = fakeAI(() => ({ response: 'Here you go: {"findings":[{"what":"crash","confidence":0.9,"note":"two cars stopped in the right lane"}]}' }));
  const e4 = env({ AI: vis }); await seed(e4, [{ ...F.PLACES[0], cams: [cam], camAI: true }]);
  let t = new Date('2026-11-13T17:00:00Z').getTime();
  while (Math.floor(t / 300000) % 12 !== 0) t += 300000;
  const f4 = makeFetch({ now: t, tornado: false });
  await W.runAll(e4, new Date(t), f4);
  const call = vis.calls.find((c) => Array.isArray(c.input.messages?.[0]?.content));
  const parts = call?.input.messages[0].content || [];
  check('camera AI without a key: Workers AI gets the frame as a data: URL plus the strict instruction', !!call && parts.some((x) => x.type === 'image_url' && /^data:image\/jpeg;base64,/.test(x.image_url.url)) && parts.some((x) => x.type === 'text' && /ONLY what is clearly visible/.test(x.text)) && !f4.sent.vision, JSON.stringify(parts.map((x) => x.type)));
  const ce = JSON.parse(e4.KV.m.get('log:home') || '[]').find((x) => x.check === 'camera');
  check('camera AI without a key: "Camera shows a crash" heads-up, model named in the evidence', ce && ce.sev === W.SEV.heads && /appears to show a crash/.test(ce.text) && ce.data.evidence.some((x) => /llama-4-scout/.test(x)), ce?.text);
  const s4 = await (await W.handle(req('/status'), e4, makeFetch({ now: t }))).json();
  check('/status: AI = workers-ai, camera AI enabled with its model', s4.ai === 'workers-ai' && s4.cameraAI.enabled === true && /llama-4-scout/.test(s4.cameraAI.model), JSON.stringify({ ai: s4.ai, cam: s4.cameraAI }));
  const s5 = await (await W.handle(req('/status'), env(), makeFetch({ now: t }))).json();
  check('/status with no AI at all: camera AI off', s5.ai === null && s5.cameraAI.enabled === false);
}

// ---------------------------------------------------------------- v5: conditions reports
{
  const e = env(); await seed(e);
  const now = Date.now();
  const start = new Date(now - 6 * 3600e3).toISOString(); const end = new Date(now).toISOString();
  const f = makeFetch({ now, lsrLat: 33.8053, lsrLon: -84.1455 });
  const r = await W.handle(req(`/report?place=home&start=${start}&end=${end}`), e, f);
  const j = await r.json();
  const sec = (s) => j.report.items.filter((i) => i.section === s);
  check('report: warning that covered the point, with warned hail and wind', sec('warnings').length === 1 && /Severe Thunderstorm Warning \(FFC #123\) covered this point/.test(sec('warnings')[0].text) && /hail 1\.00 in, wind 60 mph/.test(sec('warnings')[0].text), sec('warnings')[0]?.text);
  check('report: old warnings outside the window are left out', !j.report.items.some((i) => /#9\b/.test(i.text)));
  check('report: storm reports within the radius with distance/bearing; far ones left out', sec('reports').length === 2 && sec('reports').every((i) => i.distanceKm < 16 && i.bearing) && !j.report.items.some((i) => /KS/.test(i.text)), sec('reports').map((i) => i.text).join(' | '));
  check('report: every line marked official / reported / measured / estimated, with source and time', j.report.items.every((i) => ['official', 'reported', 'measured', 'estimated'].includes(i.kind) && i.source && i.time));
  check('report: radar rainfall is marked as an estimate', sec('rain').length === 1 && sec('rain')[0].kind === 'estimated' && /1\.42 in/.test(sec('rain')[0].text));
  check('report: summary of max reported/warned hail and wind', j.report.summary.maxReportedHailIn === 1.75 && j.report.summary.maxWarnedHailIn === 1 && j.report.summary.maxReportedWindMph === 62, JSON.stringify(j.report.summary));
  check('report: no claim about damage to a property', j.report.notes.some((n) => /does not assess or confirm damage/.test(n)) && !JSON.stringify(j.report.items).match(/damaged|destroyed/i));
  const re = await W.sha256Hex(W.canonical(j.report));
  check('report: SHA-256 of the canonical JSON matches', re === j.sha256 && j.json === W.canonical(j.report));
  check('report stored in KV (2 writes) for later verification', j.stored === true && e.KV.m.has(`report:${j.sha256}`));
  const v = await (await W.handle(req(`/report/${j.sha256}`), e, f)).json();
  check('verify route: stored report re-hashes to the same fingerprint', v.verified === true && v.sha256 === j.sha256);
  e.KV.m.set(`report:${j.sha256}`, j.json.replace('1.75', '2.75'));
  const v2 = await (await W.handle(req(`/report/${j.sha256}`), e, f)).json();
  check('verify route: a tampered report fails verification', v2.verified === false);
  const long = await W.handle(req(`/report?place=home&start=2026-01-01T00:00:00Z&end=2026-02-01T00:00:00Z`), e, f);
  check('report window over 7 days is refused plainly', long.status === 400);
  const list = await (await W.handle(req('/reports'), e, f)).json();
  check('reports index lists the stored report', list.reports[0]?.sha256 === j.sha256);
}

const failed = results.filter((x) => !x).length;
console.log(`\n${results.length - failed}/${results.length} watch checks passed.`);
process.exit(failed ? 1 : 0);
