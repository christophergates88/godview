// Node checks for the "People & records" group: the organization-vs-individual
// privacy filter, and each parser against the sample data in fixtures-people.mjs.
// Run: node test/unit-people.mjs

import assert from 'node:assert/strict';
import * as P from './fixtures-people.mjs';
import { classifyName, recordName } from '../js/layers/lib/privacy.js';
import { parseIdentify, congressNow } from '../js/layers/lib/people.js';
import { slimLegislators, federalFor, stateLegFromCsv, parseWd, card, pickFec } from '../js/layers/people-officials.js';
import { summarise } from '../js/layers/people-census.js';
import { parseNotable } from '../js/layers/people-notable.js';
import { recipients } from '../js/layers/people-money.js';
import { parseEcho } from '../js/layers/people-epa.js';
import { parseHome, hospitalPin } from '../js/layers/people-care.js';
import { parseFdic } from '../js/layers/people-banks.js';
import { parseNcmec } from '../js/layers/people-missing.js';
import { parseFema } from '../js/layers/people-fema.js';

let n = 0;
const t = (name, fn) => { try { fn(); n++; console.log('PASS ', name); } catch (e) { console.log('FAIL ', name, '—', e.message); process.exitCode = 1; } };

// ---------------------------------------------------------------- privacy filter
const ORGS = ['PUTNAM COUNTY BOARD OF COMMISSIONERS', 'City of Eatonton', 'GEORGIA POWER COMPANY', 'Lockheed Martin Corporation', 'ACME WIDGETS, INC.',
  'Smith & Sons LLC', 'DELTA AIR LINES INC', 'UNITED STATES DEPARTMENT OF AGRICULTURE', 'Georgia College & State University', 'EATONTON WWTP',
  'WALMART SUPERCENTER #1234', 'Oconee Regional Medical Center', 'First Baptist Church of Eatonton', 'TRI-COUNTY EMC', 'Atlanta Broadcasting Co'];
const PERSONS = ['JOHN A SMITH', 'Smith, John', 'Mary Jones', 'JOHN SMITH JR', 'J. R. EWING', 'ROBERT E LEE III', 'SMITH RESIDENCE', 'The John Smith Revocable Trust',
  'Estate of Jane Doe', 'JANE Q PUBLIC MD', 'Bob Smith Private'];
const WITHHELD = ['', 'REDACTED DUE TO PII', 'MULTIPLE RECIPIENTS', 'PRIVATE INDIVIDUAL', null];

t('privacy: organizations classified as org', () => { for (const s of ORGS) assert.equal(classifyName(s), 'org', s); });
t('privacy: personal names and homes classified as person', () => { for (const s of PERSONS) assert.equal(classifyName(s), 'person', s); });
t('privacy: redacted/aggregated names are withheld', () => { for (const s of WITHHELD) assert.equal(classifyName(s), 'withheld', String(s)); });
t('privacy: strict mode shows only organizations', () => {
  for (const s of ORGS) assert.deepEqual([recordName(s, { mode: 'strict' }).show, recordName(s).name], [true, String(s).trim()], s);
  for (const s of [...PERSONS, ...WITHHELD]) { const r = recordName(s, { mode: 'strict' }); assert.equal(r.show, false, String(s)); assert.equal(r.name, undefined); assert.ok(r.label); }
  // Unclear names (no organization word, not obviously a person) are withheld in strict mode.
  for (const s of ['Blue Sky Holdco Two', 'ZEPHYR AERO']) assert.equal(recordName(s, { mode: 'strict' }).show, false, s);
});
t('privacy: surnames that are also organization words do not unlock a name', () => {
  for (const s of ['John Church', 'Ann Mills', 'Tyrone Power', 'Jin Public', 'Mary Banks']) assert.equal(recordName(s, { mode: 'entity' }).show, false, s);
  for (const s of ['Eatonton Fire Station 2', 'Mount Zion Baptist Church', 'Port of Brunswick']) assert.equal(recordName(s, { mode: 'strict' }).show, true, s);
});
t('privacy: entity mode hides persons, shows organizations and unclear business names', () => {
  for (const s of ORGS) assert.equal(recordName(s, { mode: 'entity' }).show, true, s);
  for (const s of [...PERSONS, ...WITHHELD]) assert.equal(recordName(s, { mode: 'entity' }).show, false, String(s));
  assert.equal(recordName('Kroger #412 Fuel', { mode: 'entity' }).show, true);
});
t('privacy: FAA registrant type codes override the name', () => {
  assert.equal(recordName('JOHN SMITH', { registry: 'faa', typeCode: '3' }).show, true);       // a corporation that happens to look like a name
  assert.equal(recordName('ACME AVIATION LLC', { registry: 'faa', typeCode: '1' }).show, false); // registered as an individual
  assert.equal(recordName('STATE OF GEORGIA', { registry: 'faa', typeCode: 5 }).show, true);
  for (const c of ['1', '2', '4', '9']) assert.equal(recordName('SKY HIGH LLC', { registry: 'faa', typeCode: c }).label, 'Privately registered');
});

// ---------------------------------------------------------------- districts and officials
const where = parseIdentify(P.tigerIdentify());
t('TIGERweb identify -> place, districts', () => {
  assert.equal(where.state.abbr, 'GA');
  assert.equal(where.county.fips, '13237');
  assert.equal(where.tract.code, '960204');
  assert.equal(where.cd.number, 10);
  assert.equal(where.sldu.base, '25');
  assert.equal(where.sldl.base, '144');
  assert.match(where.place.name, /Eatonton/);
});
t('Congress number by date', () => {
  assert.equal(congressNow(new Date('2026-11-12')), 119);
  assert.equal(congressNow(new Date('2027-01-04')), 120);
  assert.equal(congressNow(new Date('2029-02-01')), 121);
});
const all = slimLegislators(P.legislators());
t('legislators slimmed: no birthdays kept', () => { assert.ok(all.length >= 3); assert.ok(all.every((m) => !('birthday' in m) && !('bio' in m))); });
t('federal members for the point', () => {
  const f = federalFor(all, where);
  assert.equal(f.sen.length, 2);
  assert.equal(f.rep.length, 1);
  assert.equal(f.rep[0].district, 10);
  assert.equal(pickFec(f.sen[0])[0], 'S');
});
t('state legislators from Open States CSV (no district-office address)', () => {
  const s = stateLegFromCsv(P.openStatesCsv(), where);
  assert.equal(s.length, 2);
  assert.deepEqual(s.map((x) => x.chamber).sort(), ['lower', 'upper']);
  assert.ok(s.every((x) => !JSON.stringify(x).includes('Home Street')));
});
t('officials card: rows and official links', () => {
  const raw = { where, fed: { ok: true, value: federalFor(all, where) }, state: { ok: true, value: stateLegFromCsv(P.openStatesCsv(), where) }, wd: { ok: true, value: parseWd(P.wikidataGov()) } };
  const c = card(raw);
  const labels = c.rows.map((r) => r[0]);
  for (const l of ['Place', 'US Senator', 'US Representative', 'Governor', 'State senator', 'State representative', 'School district']) assert.ok(labels.includes(l), l);
  assert.ok(c.links.every((l) => /^(https:|mailto:)/.test(l.href)));
  assert.ok(c.links.some((l) => /govtrack/.test(l.href)) && c.links.some((l) => /fec\.gov/.test(l.href)));
});
t('officials card survives failed sources', () => {
  const c = card({ where, fed: { ok: false, error: 'Blocked' }, state: { ok: false, error: 'Timed out' }, wd: { ok: false, error: 'x' } });
  assert.ok(c.rows.some((r) => /Not available \(Blocked\)/.test(r[1])));
});

// ---------------------------------------------------------------- the rest
t('Census ACS summary (big numbers, percentages)', () => {
  const s = summarise(P.acs());
  assert.equal(s.stats[0].value, '1,000');
  assert.equal(s.rows[0][1], '20%');     // under 18
  assert.equal(s.rows[1][1], '25%');     // 65+
  assert.equal(s.stats.find((x) => x.label === 'Average commute').value, '25 min');
});
t('Wikidata notable people (deduped, fanned out, https links)', () => {
  const p = parseNotable(P.wikidataNotable());
  assert.equal(p.length, 3);
  assert.notEqual(p[0].lat, p[1].lat);   // same birthplace, spread apart
  assert.ok(p.every((x) => x.link.href.startsWith('https://en.wikipedia.org/')));
  assert.equal(p[0].rows[1][1], '1902–1990');
});
t('USAspending: persons counted, not named', () => {
  const r = recipients(P.usaspending().results);
  assert.deepEqual(r.shown.map((x) => x.name), ['Putnam County Board Of Education', 'Georgia Power Company']);
  assert.equal(r.hidden, 2);
});
t('EPA ECHO: violation colours; person-named site shown without name or street', () => {
  const f = parseEcho(P.echo());
  assert.equal(f.length, 3);
  assert.equal(f[0].color, '#ff4d5e');
  assert.equal(f[1].color, '#3ee67a');
  assert.equal(f[2].title, 'Private site');
  assert.ok(!JSON.stringify(f[2]).includes('Smith') && !JSON.stringify(f[2]).includes('Elm'));
  assert.equal(f[2].link, null);
});
t('CMS nursing home and hospital pin', () => {
  const h = parseHome(P.cmsNursing().results[0]);
  assert.match(h.rows[0][1], /2 of 5/);
  assert.ok(h.rows.some((r) => r[0] === 'Warnings'));
  const pin = hospitalPin(P.cmsHospitals().results, where.county);
  assert.match(pin.title, /Putnam/);
  assert.match(pin.rows[0][1], /3 of 5.*ER/);
});
t('FDIC branches', () => { const b = parseFdic(P.fdic()); assert.equal(b.length, 2); assert.equal(b[0].color, '#ffd34d'); });
t('NCMEC RSS: poster text kept verbatim, town parsed, https', () => {
  const p = parseNcmec(P.ncmecRss());
  assert.equal(p.length, 2);
  assert.equal(p[0].text, P.NCMEC_TEXT);
  assert.equal(p[0].city, 'EATONTON');
  assert.ok(p[0].image.startsWith('https://') && p[0].link.startsWith('https://'));
});
t('FEMA declarations deduped', () => assert.equal(parseFema(P.fema()).length, 2));

console.log(`${n} people checks passed`);
