// "Disaster declarations": every federal disaster or emergency declared for the
// county at the view centre (and statewide ones), newest first (OpenFEMA).
import { ENDPOINTS } from '../config.js';
import { makePointLayer } from './lib/point-layer.js';
import { whereIs, titleCase, addProbe } from './lib/people.js';

const icon = '<svg viewBox="0 0 24 24"><path d="M12 3l9 16H3zM12 10v4M12 17v.01M7 21h10" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>';
const TYPE = { DR: 'Major disaster', EM: 'Emergency', FM: 'Fire management' };

export const femaFilter = (st, co) => `fipsStateCode eq '${st}' and (fipsCountyCode eq '${co}' or fipsCountyCode eq '000')`;

export function parseFema(j) {
  const seen = new Set();
  const out = [];
  for (const d of (j && j.DisasterDeclarationsSummaries) || []) {
    if (seen.has(d.femaDeclarationString || d.disasterNumber)) continue;
    seen.add(d.femaDeclarationString || d.disasterNumber);
    out.push(d);
  }
  return out;
}

export default makePointLayer({
  id: 'peopleFema',
  name: 'Disaster declarations (FEMA)',
  group: 'people',
  color: '#ff8a3d',
  icon,
  label: 'F',
  heightM: 300,
  view: { maxKm: 2500, radiusKm: 30, minGapMs: 10000 },
  attribution: 'Disaster declarations: FEMA OpenFEMA Disaster Declarations Summaries (v2). This product uses the FEMA OpenFEMA API but is not endorsed by FEMA',
  async fetch(ctx, q) {
    const w = await whereIs(ctx, q.lat, q.lon);
    if (!w.county) return { w, list: [] };
    const j = await ctx.net.get(ctx.net.fillUrl(ENDPOINTS.peopleFema, { f: femaFilter(w.county.state, w.county.code) }), { timeoutMs: 20000 });
    return { w, list: parseFema(j) };
  },
  parse: (raw) => {
    if (!raw.w.county) return [];
    const L = raw.list;
    const rows = L.slice(0, 14).map((d) => [String(d.declarationDate || '').slice(0, 10), `${d.incidentType || ''}: ${titleCase(d.declarationTitle)} (${d.femaDeclarationString || d.disasterNumber}${d.fipsCountyCode === '000' ? ', statewide' : ''})`]);
    if (!rows.length) rows.push(['Declarations', 'None on record']);
    const links = L.slice(0, 4).map((d) => ({ href: `https://www.fema.gov/disaster/${d.disasterNumber}`, text: `${TYPE[d.declarationType] || 'Declaration'} ${d.disasterNumber}` }));
    return [{
      key: raw.w.county.fips, lat: raw.w.county.lat - 0.02, lon: raw.w.county.lon + 0.02,
      title: `Disasters declared for ${raw.w.county.name}`, subtitle: `${L.length} federal declaration${L.length === 1 ? '' : 's'} on record (newest 40 checked)`,
      rows, links,
    }];
  },
  describe: (it) => ({ title: it.title, subtitle: it.subtitle, rows: it.rows, links: it.links }),
});

addProbe('OpenFEMA (Putnam County GA)', async (ctx) => parseFema(await ctx.net.get(ctx.net.fillUrl(ENDPOINTS.peopleFema, { f: femaFilter('13', '237') }))).length);
