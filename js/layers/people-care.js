// "Hospitals & nursing homes": where they are. Main source (v5): the HIFLD Open
// hospitals and nursing-homes layers (2025 snapshot, NASA NCCS mirror).
// OpenStreetMap via Overpass is only a fallback. (The CMS Provider Data service
// cannot be read from a web page or through the relay),
// with a link to Medicare Care Compare for each one's official star ratings
// and inspection results. A small care home mapped under a person's name is
// shown as "Care home (private name not shown)" with no address.
import { makePointLayer } from './lib/point-layer.js';
import { overpass, where } from './lib/overpass.js';
import { recordName } from './lib/privacy.js';
import { addProbe } from './lib/people.js';
import { INFRA } from '../config.js';
import { arcgisBox, a, withFallback } from './lib/arcgis.js';

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

// HIFLD hospitals (layer 0) and nursing homes (layer 1).
export function parseHifldCare(hosp, homes) {
  const out = [];
  const add = (gj, hospital) => {
    for (const [i, f] of ((gj && gj.features) || []).entries()) {
      if (!f.geometry || !f.geometry.coordinates) continue;
      const p = f.properties || {};
      const kind = hospital ? 'Hospital' : 'Nursing home';
      const name = a(p, 'name');
      const v = name ? recordName(String(name), { mode: 'entity' }) : { show: false };
      const tc = (x) => String(x || '').toLowerCase().replace(/\b\w/g, (c) => c.toUpperCase());
      const beds = Number(a(p, 'beds'));
      const rows = [['Type', hospital ? (tc(a(p, 'type')) || kind) : kind]];
      if (v.show && a(p, 'address')) rows.push(['Address', `${tc(a(p, 'address'))}, ${tc(a(p, 'city'))}`]);
      if (Number.isFinite(beds) && beds > 0) rows.push(['Beds', String(beds)]);
      rows.push(['Official ratings', 'Medicare star ratings and inspections: see Care Compare']);
      out.push({
        key: `${hospital ? 'h' : 'n'}${a(p, 'objectid', 'id') ?? i}`, lon: f.geometry.coordinates[0], lat: f.geometry.coordinates[1],
        color: hospital ? '#ff7ad9' : '#c8a2ff', label: hospital ? 'H' : 'N',
        title: v.show ? tc(name) : (name ? `${kind} (private name not shown)` : kind),
        subtitle: `${kind} · HIFLD 2025 snapshot`,
        say: `${v.show ? tc(name) : 'This ' + kind.toLowerCase()} is a ${hospital ? (tc(a(p, 'type')) || 'hospital').toLowerCase() : 'nursing home'}${Number.isFinite(beds) && beds > 0 ? ` with ${beds} beds listed` : ''}.`,
        rows, links: [{ href: CARE_COMPARE, text: 'Medicare Care Compare' }],
        link: { href: CARE_COMPARE, text: 'Medicare Care Compare' },
      });
    }
  };
  add(hosp, true); add(homes, false);
  return out;
}
let careSource = 'primary';

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
  attribution: 'Hospitals and nursing homes: HIFLD Open archive (2025 snapshot, NASA NCCS mirror); fallback © OpenStreetMap contributors (ODbL) via Overpass; official ratings at Medicare Care Compare (CMS)',
  async fetch(ctx, q) {
    const r = await withFallback(ctx,
      async () => { const [h, n] = await Promise.all([arcgisBox(ctx, INFRA.hospitals, q, { outFields: 'objectid,name,address,city,state,type,beds' }), arcgisBox(ctx, INFRA.nursingHomes, q, { outFields: 'objectid,name,address,city,state,type,beds' })]); return { h, n }; },
      () => overpass(ctx, q, CARE_SELECTORS, 600), 'HIFLD hospitals');
    careSource = r.source;
    return r;
  },
  parse: (r) => (r.source === 'primary' ? parseHifldCare(r.data.h, r.data.n) : parseCare(r.data)),
  describe: (it) => ({ title: it.title, subtitle: it.subtitle, say: it.say, rows: it.rows, link: it.link, links: it.links }),
  note: () => (careSource === 'primary' ? 'Pink = hospital · violet = nursing home · 2025 snapshot' : 'Main source down: OpenStreetMap, may be incomplete'),
});

addProbe('HIFLD hospitals (Macon)', async (ctx) => ((await arcgisBox(ctx, INFRA.hospitals, { lat: 32.8407, lon: -83.6324, radiusKm: 10 }, { outFields: 'name' })).features || []).length);
