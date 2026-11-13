// Quick node checks of pure logic (no browser): flight parsers and unit formatting.
// Run: node test/unit.mjs

import assert from 'node:assert/strict';
import * as F from './fixtures.mjs';
import { PROVIDERS } from '../js/layers/flights.js';
import { fmt } from '../js/core/units.js';
import { fillUrl } from '../js/core/net.js';
import { inferHere, inferFromManager, isCircling } from '../js/infer.js';

let n = 0;
const t = (name, fn) => { try { fn(); n++; console.log('PASS ', name); } catch (e) { console.log('FAIL ', name, '—', e.message); process.exitCode = 1; } };

const osky = PROVIDERS.find((p) => p.id === 'opensky');
const apl = PROVIDERS.find((p) => p.id === 'airplaneslive');

t('OpenSky parser', () => {
  const list = osky.parse(F.opensky());
  assert.equal(list.length, 3);
  assert.equal(list[0].callsign, 'DAL1234');
  assert.equal(list[0].altM, 10900);           // geometric altitude preferred
  assert.equal(list[2].onGround, true);
});
t('airplanes.live parser converts feet/knots', () => {
  const list = apl.parse(F.airplaneslive());
  assert.equal(list.length, 2);
  assert.ok(Math.abs(list[0].altM - 35600 * 0.3048) < 1);
  assert.ok(Math.abs(list[0].speedMs - 448.1 * 0.514444) < 0.1);
  assert.equal(list[0].type, 'A321');
  assert.equal(list[1].onGround, true);
});
t('OpenSky box stays <= 10x10 degrees', () => {
  const u = new URL(osky.url({ lat: 33, lon: -83, radiusKm: 5000 }));
  const g = (k) => Number(u.searchParams.get(k));
  assert.ok(g('lamax') - g('lamin') <= 10.001);
  assert.ok(g('lomax') - g('lomin') <= 10.001);
});
t('airplanes.live radius capped at 250 nm', () => {
  assert.match(apl.url({ lat: 33, lon: -83, radiusKm: 5000 }), /\/250$/);
});
t('fillUrl encodes', () => {
  assert.equal(fillUrl('x?q={q}', { q: 'a b&c' }), 'x?q=a%20b%26c');
});
t('formatting (default imperial)', () => {
  assert.equal(fmt.altitude(1000), '3,281 ft');
  assert.equal(fmt.tempC(0), '32°F');
  assert.equal(fmt.heading(90), '90° E');
  assert.match(fmt.airspeed(100), /^194 kt/);
});

// Inferences (js/infer.js): heuristics, always labelled with confidence and evidence
const P = { lat: 32.84, lon: -83.63 };
const heli = (key, lat, lon, ft, kt, extra = {}) => ({ key, lat, lon, altM: ft / 3.28084, speedMs: kt / 1.94384, type: 'EC35', cat: 'A7', title: key.toUpperCase(), ...extra });
t('inference: low slow helicopter -> hover (low confidence)', () => {
  const r = inferHere(P, [heli('life1', 32.845, -83.632, 700, 15)]);
  const h = r.find((x) => x.kind === 'hover');
  assert.ok(h); assert.equal(h.confidence, 'low'); assert.ok(h.evidence.length >= 1); assert.match(h.where, /right here|mi /);
});
t('inference: two special aircraft within 5 km -> converge; far apart -> none', () => {
  assert.equal(inferHere(P, [heli('a', 32.845, -83.632, 900, 20), heli('b', 32.86, -83.62, 1200, 35)]).filter((x) => x.kind === 'converge').length, 1);
  assert.equal(inferHere(P, [heli('a', 32.845, -83.632, 900, 20), heli('b', 33.749, -84.388, 1200, 35)]).filter((x) => x.kind === 'converge').length, 0);
});
t('inference: an airliner is never "special"', () => {
  const r = inferHere(P, [{ key: 'x', lat: 32.84, lon: -83.63, altM: 10000, speedMs: 230, type: 'A321', title: 'DAL1' }, { key: 'y', lat: 32.841, lon: -83.631, altM: 10500, speedMs: 230, type: 'B738', title: 'SWA2' }]);
  assert.equal(r.length, 0);
});
t('inference: circling needs >300 degrees of turn', () => {
  const T = Date.now(); const hist = Array.from({ length: 13 }, (_, i) => ({ t: T - (12 - i) * 60000, lat: 32.84 + 0.02 * Math.cos(i * 0.6), lon: -83.63 + 0.02 * Math.sin(i * 0.6), track: (i * 34.4 + 90) % 360 }));
  assert.equal(isCircling(hist), true);
  assert.equal(isCircling(hist.map((h) => ({ ...h, track: 90 }))), false);
});
t('inference: same aircraft in flights and emergency layers counted once', () => {
  const a = heli('a0c001', 32.845, -83.632, 900, 20);
  const M = { state: { flights: { enabled: true, status: 'ok' }, military: { enabled: false }, emergency: { enabled: true, status: 'ok' } }, items: (id) => (id === 'flights' ? [a] : id === 'emergency' ? [{ ...a, key: 'A0C001' }] : []) };
  assert.equal(inferFromManager(M, P).filter((x) => x.kind === 'converge').length, 0);
});
console.log(`${n} unit checks passed`);
