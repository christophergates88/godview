// Quick node checks of pure logic (no browser): flight parsers and unit formatting.
// Run: node test/unit.mjs

import assert from 'node:assert/strict';
import * as F from './fixtures.mjs';
import { PROVIDERS } from '../js/layers/flights.js';
import { fmt } from '../js/core/units.js';
import { fillUrl } from '../js/core/net.js';

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
console.log(`${n} unit checks passed`);
