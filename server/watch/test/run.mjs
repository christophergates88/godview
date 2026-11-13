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
  check('a failing source is isolated', q && !q.ok && /503/.test(q.error) && r.checks.filter((c) => c.ok).length === r.checks.length - 1, q && q.error);
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

const failed = results.filter((x) => !x).length;
console.log(`\n${results.length - failed}/${results.length} watch checks passed.`);
process.exit(failed ? 1 : 0);
