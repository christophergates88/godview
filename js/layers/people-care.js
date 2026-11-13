// "Hospitals & nursing homes": where they are and how Medicare rates them.
// Main source: the weekly data pack (scripts/build_packs.py): CMS Hospital
// General Information (star rating, emergency department, death-rate, safety
// and readmission measures against the national rate; placed on the map by the
// US Census geocoder) and CMS nursing-home Provider Information (star ratings,
// citations, federal fines and penalties, abuse citations, Special Focus status,
// staff turnover, ownership). CMS cannot be read from a web page directly; the
// pack is built in GitHub Actions. OpenStreetMap via Overpass is only a fallback.
// A small care home listed under a person's name is shown as
// "Care home (private name not shown)" with no address.
import { makePointLayer } from './lib/point-layer.js';
import { overpass, where } from './lib/overpass.js';
import { recordName } from './lib/privacy.js';
import { addProbe } from './lib/people.js';
import { withFallback } from './lib/arcgis.js';
import { packRows, builtOn } from './lib/packs.js';

const icon = '<svg viewBox="0 0 24 24"><path d="M4 21V7l8-4 8 4v14zM12 8v6M9 11h6M9 21v-3h6v3" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>';
export const CARE_SELECTORS = ['nwr["amenity"="hospital"]', 'nwr["healthcare"="hospital"]', 'nwr["amenity"="nursing_home"]', 'nwr["social_facility"="nursing_home"]'];
export const CARE_COMPARE = 'https://www.medicare.gov/care-compare/';

export function parseCare(j) {
  const seen = new Set();
  const out = [];
  for (const el of (j && j.elements) || []) {
    const id = `${el.type}${el.id}`;
    if (seen.has(id)) continue;
    seen.add(id);
    const t = el.tags || {};
    const hospital = t.amenity === 'hospital' || t.healthcare === 'hospital';
    const kind = hospital ? 'Hospital' : 'Nursing home';
    const v = t.name ? recordName(t.name, { mode: 'entity' }) : { show: false, label: 'unnamed' };
    const addr = [t['addr:housenumber'], t['addr:street'], t['addr:city']].filter(Boolean).join(' ');
    const rows = [['Type', kind]];
    if (v.show && t.operator) rows.push(['Run by', t.operator]);
    if (v.show && addr) rows.push(['Address', addr]);
    if (hospital && t.emergency) rows.push(['Emergency department', t.emergency === 'yes' ? 'Yes' : t.emergency]);
    if (t.beds) rows.push(['Beds', t.beds]);
    rows.push(['Official ratings', 'Medicare star ratings and inspections: see Care Compare']);
    const links = [{ href: CARE_COMPARE, text: 'Medicare Care Compare' }];
    if (v.show && /^https:\/\//.test(t.website || '')) links.push({ href: t.website, text: 'Official website' });
    out.push({
      key: id, ...where(el), color: hospital ? '#ff7ad9' : '#c8a2ff', label: hospital ? 'H' : 'N',
      title: v.show ? t.name : (t.name ? `${kind} (private name not shown)` : kind),
      subtitle: `${kind} · mapped in OpenStreetMap`,
      rows, links,
      link: { href: `https://www.openstreetmap.org/${el.type}/${el.id}`, text: 'OpenStreetMap' },
    });
  }
  return out;
}

let careSrc = { kind: 'pack', built: null };

const stars = (n) => (Number.isFinite(n) && n >= 1 && n <= 5 ? `${'★'.repeat(n)}${'☆'.repeat(5 - n)} ${n} of 5` : 'Not rated');
const money = (n) => `$${Math.round(n).toLocaleString('en-US')}`;
const plural = (n, one, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;

// Care Compare page of one hospital or nursing home (by its CMS certification number).
export function careCompareUrl(it) {
  if (!it.ccn || !/^[0-9A-Z]{6}$/.test(it.ccn)) return CARE_COMPARE;
  const st = encodeURIComponent(it.state || '');
  return it.kind === 'H'
    ? `https://www.medicare.gov/care-compare/details/hospital/${it.ccn}?state=${st}`
    : `https://www.medicare.gov/care-compare/details/nursing-home/${it.ccn}/view-all?state=${st}`;
}

// A nursing home Medicare flags: cited for abuse, a Special Focus Facility (or
// candidate), or rated 1 star overall.
export const flagged = (it) => it.kind === 'N' && (it.abuse === 1 || !!it.focus || it.overall === 1);

// "1 measure worse than the national rate, 2 better" (null when not reported)
function versus(worse, better) {
  if (!Number.isFinite(worse) && !Number.isFinite(better)) return null;
  const w = Number(worse) || 0; const b = Number(better) || 0;
  if (!w && !b) return 'No different from the national rate';
  return [w ? `${plural(w, 'measure')} worse than the national rate` : '', b ? `${b} better` : ''].filter(Boolean).join(', ');
}

// Rows of the care pack -> map items.
export function parsePackCare(items) {
  return items.map((it, i) => {
    const hospital = it.kind === 'H';
    const kind = hospital ? 'Hospital' : 'Nursing home';
    const v = it.name ? recordName(String(it.name), { mode: 'entity' }) : { show: false };
    const legal = it.legal ? recordName(String(it.legal), { mode: 'entity' }) : { show: false };
    const rated = Number.isFinite(it.overall);
    const rows = [];
    let say;
    if (hospital) {
      const type = it.type || 'Hospital';
      rows.push(['Type', type]);
      rows.push(['Medicare overall', stars(it.overall)]);
      if (it.emergency) rows.push(['Emergency department', it.emergency]);
      const death = versus(it.mortWorse, it.mortBetter); const safe = versus(it.safetyWorse, it.safetyBetter); const back = versus(it.readmWorse, it.readmBetter);
      if (death) rows.push(['Death rates', death]);
      if (safe) rows.push(['Safety of care', safe]);
      if (back) rows.push(['Readmissions', back]);
      if (it.ownership) rows.push(['Ownership', it.ownership]);
      const bits = [];
      if (rated) bits.push(`rated ${it.overall} of 5 stars by Medicare`);
      if (/^yes/i.test(it.emergency || '')) bits.push('with an emergency department');
      if (Number(it.mortWorse) > 0) bits.push(`worse than the national rate on ${plural(it.mortWorse, 'death-rate measure')}`);
      say = `${v.show ? it.name : 'This hospital'} is ${/^[aeiou]/i.test(type) ? 'an' : 'a'} ${type.toLowerCase().replace(/s$/, '')}${bits.length ? ', ' + bits.join(', ').replace(/, ([^,]*)$/, ' and $1') : ''}.`;
    } else {
      rows.push(['Type', kind]);
      if (rated) {
        rows.push(['Medicare overall', stars(it.overall)]);
        rows.push(['Health inspections', stars(it.inspection)]);
        rows.push(['Staffing', stars(it.staffing)]);
        rows.push(['Quality of care', stars(it.quality)]);
      } else rows.push(['Medicare overall', 'Not rated']);
      if (Number.isFinite(it.deficiencies)) rows.push(['Citations, latest inspection cycle', String(it.deficiencies)]);
      if (Number.isFinite(it.fines)) rows.push(['Federal fines (last 3 years)', it.fines ? `${plural(it.fines, 'fine')}, ${money(it.fineDollars || 0)} in total` : 'None']);
      if (Number.isFinite(it.penalties) && it.penalties > (it.fines || 0)) rows.push(['All penalties (last 3 years)', String(it.penalties)]);
      if (it.abuse === 1) rows.push(['Cited for abuse', 'Yes: Medicare marks this home for abuse findings']);
      if (it.focus === 'SFF') rows.push(['Special Focus Facility', 'Yes: on Medicare’s list for a history of serious quality problems']);
      else if (it.focus === 'candidate') rows.push(['Special Focus Facility', 'Candidate: a history of serious quality problems']);
      if (it.topRated === 1) rows.push(['High performing', 'Yes, by Medicare’s measure']);
      if (Number.isFinite(it.turnover)) rows.push(['Nursing staff turnover', `${Math.round(it.turnover)}% a year`]);
      if (Number.isFinite(it.beds) && it.beds > 0) rows.push(['Certified beds', String(it.beds) + (Number.isFinite(it.residents) ? ` (about ${Math.round(it.residents)} residents a day)` : '')]);
      if (it.ownership) rows.push(['Ownership', it.ownership]);
      if (it.ownerChanged === 1) rows.push(['Changed owners', 'In the last 12 months']);
      if (legal.show && it.legal && it.legal.toLowerCase() !== String(it.name || '').toLowerCase()) rows.push(['Legal business name', it.legal]);
      if (it.chain) rows.push(['Part of', it.chain]);
      const bits = [];
      if (rated) bits.push(`rated ${it.overall} of 5 stars overall by Medicare`);
      if (it.fines) bits.push(`fined ${plural(it.fines, 'time')} (${money(it.fineDollars || 0)}) in the last 3 years`);
      if (it.abuse === 1) bits.push('cited for abuse');
      if (it.focus === 'SFF') bits.push('on the Special Focus list for serious quality problems');
      say = `${v.show ? it.name : 'This nursing home'} is a nursing home${bits.length ? ', ' + bits.join(', ').replace(/, ([^,]*)$/, ' and $1') : ''}.`;
    }
    if (v.show && it.address) rows.push(['Address', [it.address, it.city, it.state].filter(Boolean).join(', ')]);
    if (it.approx === 1) rows.push(['On the map', 'At the centre of its ZIP code (the street address could not be placed)']);
    const href = careCompareUrl(it);
    const bad = flagged(it);
    return {
      key: `${hospital ? 'h' : 'n'}${it.ccn || i}_${it.lat}_${it.lon}`, lat: it.lat, lon: it.lon,
      color: hospital ? '#ff7ad9' : bad ? '#ff4d5e' : '#c8a2ff', label: hospital ? 'H' : 'N',
      title: v.show ? it.name : (it.name ? `${hospital ? 'Hospital' : 'Care home'} (private name not shown)` : kind),
      subtitle: `${kind}${rated ? ` · ${it.overall} of 5 stars` : ''}${bad ? ' · flagged by Medicare' : ''}`,
      say, rows,
      links: [{ href, text: href === CARE_COMPARE ? 'Medicare Care Compare' : `This ${hospital ? 'hospital' : 'home'} on Medicare Care Compare` }],
      link: { href, text: 'Medicare Care Compare' },
    };
  });
}

export default makePointLayer({
  id: 'peopleCare',
  name: 'Hospitals & nursing homes',
  group: 'people',
  color: '#ff7ad9',
  icon,
  label: 'H',
  heightM: 200,
  max: 400,
  view: { maxKm: 400, radiusKm: 40, minGapMs: 10000 },
  attribution: 'Hospitals and nursing homes: CMS Care Compare (Hospital General Information, nursing-home Provider Information), hospitals placed by the US Census geocoder; weekly copy. Fallback © OpenStreetMap contributors (ODbL) via Overpass',
  async fetch(ctx, q) {
    const r = await withFallback(ctx, () => packRows(ctx, 'care', q), () => overpass(ctx, q, CARE_SELECTORS, 600), 'Care copy');
    careSrc = r.source === 'primary' ? { kind: 'pack', built: r.data.built } : { kind: 'live' };
    return r;
  },
  parse: (r) => (r.source === 'primary' ? parsePackCare(r.data.items) : parseCare(r.data)),
  describe: (it) => ({ title: it.title, subtitle: it.subtitle, say: it.say, rows: it.rows, link: it.link, links: it.links }),
  note: (list) => (careSrc.kind === 'pack'
    ? `Pink = hospital · violet = nursing home · red = flagged by Medicare${list.some((x) => x.color === '#ff4d5e') ? ` (${list.filter((x) => x.color === '#ff4d5e').length} here)` : ''} · copy from ${builtOn(careSrc.built)}`
    : 'Weekly copy unavailable: OpenStreetMap, may be incomplete'),
});

addProbe('Care data pack', async (ctx) => (await packRows(ctx, 'care', { lat: 32.8407, lon: -83.6324, radiusKm: 10 })).items.length);
