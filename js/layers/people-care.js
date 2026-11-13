// "Hospitals & nursing homes": where they are, from OpenStreetMap (the CMS
// Provider Data service cannot be read from a web page or through the relay),
// with a link to Medicare Care Compare for each one's official star ratings
// and inspection results. A small care home mapped under a person's name is
// shown as "Care home (private name not shown)" with no address.
import { makePointLayer } from './lib/point-layer.js';
import { overpass, where } from './lib/overpass.js';
import { recordName } from './lib/privacy.js';
import { addProbe } from './lib/people.js';

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
  attribution: 'Hospitals and nursing homes: © OpenStreetMap contributors (ODbL), via Overpass API; official ratings at Medicare Care Compare (CMS)',
  fetch: (ctx, q) => overpass(ctx, q, CARE_SELECTORS, 600),
  parse: (j) => parseCare(j),
  describe: (it) => ({ title: it.title, subtitle: it.subtitle, rows: it.rows, link: it.link, links: it.links }),
  note: () => 'Pink = hospital · violet = nursing home · volunteer-mapped, may be incomplete',
});

addProbe('OpenStreetMap care homes (Macon)', async (ctx) => parseCare(await overpass(ctx, { lat: 32.8407, lon: -83.6324, radiusKm: 6 }, CARE_SELECTORS, 200)).length);
