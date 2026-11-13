// "Care ratings": nursing homes near the view with their official Medicare
// star ratings, inspection results and fines (CMS Provider Data), plus one pin
// for the hospitals of the county at the centre with their overall star rating
// (the CMS hospital file has no map position, so they are listed together).
import { ENDPOINTS } from '../config.js';
import { makePointLayer } from './lib/point-layer.js';
import { distKm } from './lib/geo.js';
import { whereIs, memo, money, titleCase, addProbe } from './lib/people.js';

const icon = '<svg viewBox="0 0 24 24"><path d="M4 21V7l8-4 8 4v14zM12 8v6M9 11h6M9 21v-3h6v3" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>';

// Column names differ between the CSV and the API ("Provider Name" vs provider_name).
const key = (s) => String(s).toLowerCase().replace(/[^a-z0-9]/g, '');
export const pick = (row, ...names) => { const m = {}; for (const k of Object.keys(row)) m[key(k)] = row[k]; for (const n of names) { const v = m[key(n)]; if (v != null && v !== '') return v; } return ''; };
const stars = (v) => { const n = parseInt(v, 10); return n >= 1 && n <= 5 ? `${'★'.repeat(n)}${'☆'.repeat(5 - n)} ${n} of 5` : 'Not rated'; };
const COLORS = ['#888', '#ff4d5e', '#ff8a3d', '#ffd34d', '#9dff7a', '#3ee67a'];

function cmsUrl(id, conds, offset = 0) {
  let u = ctx0fill(ENDPOINTS.peopleCms, { id, offset });
  conds.forEach(([p, v, op], i) => { u += `&conditions[${i}][property]=${encodeURIComponent(p)}&conditions[${i}][value]=${encodeURIComponent(v)}&conditions[${i}][operator]=${encodeURIComponent(op || '=')}`; });
  return u;
}
const ctx0fill = (t, p) => t.replace(/\{(\w+)\}/g, (_, k) => encodeURIComponent(p[k] ?? ''));

async function stateHomes(ctx, st) {
  return memo('cmsNH:' + st, 6 * 3600, async () => {
    const all = [];
    for (let page = 0; page < 4; page++) {
      const j = await ctx.net.get(cmsUrl(ENDPOINTS.peopleCmsNursingHomes, [['state', st]], page * 500), { timeoutMs: 30000 });
      const res = j.results || [];
      all.push(...res);
      if (res.length < 500) break;
    }
    return all;
  });
}

export function parseHome(r) {
  const lat = Number(pick(r, 'latitude')); const lon = Number(pick(r, 'longitude'));
  const overall = pick(r, 'overall_rating');
  const n = parseInt(overall, 10);
  const fines = Number(pick(r, 'total_amount_of_fines_in_dollars')) || 0;
  const ccn = pick(r, 'cms_certification_number_ccn', 'federal_provider_number');
  const flags = [pick(r, 'abuse_icon') === 'Y' ? 'Cited for abuse' : '', /SFF|special focus/i.test(pick(r, 'special_focus_status')) ? 'Special Focus (persistent problems)' : ''].filter(Boolean).join(' · ');
  return {
    key: 'nh' + ccn, lat, lon, color: COLORS[n >= 1 && n <= 5 ? n : 0],
    title: titleCase(pick(r, 'provider_name')), subtitle: 'Nursing home · Medicare star ratings',
    rows: [
      ['Overall', stars(overall)], ['Health inspections', stars(pick(r, 'health_inspection_rating'))],
      ['Staffing', stars(pick(r, 'staffing_rating'))], ['Quality', stars(pick(r, 'qm_rating'))],
      ['Fines (3 years)', `${pick(r, 'number_of_fines') || 0} · ${money(fines)}`],
      ...(flags ? [['Warnings', flags]] : []),
      ['Beds', pick(r, 'number_of_certified_beds') || '—'], ['Ownership', pick(r, 'ownership_type') || '—'],
      ['Town', `${titleCase(pick(r, 'citytown', 'city_town'))}, ${pick(r, 'state')}`],
    ],
    link: ccn ? { href: `https://www.medicare.gov/care-compare/details/nursing-home/${encodeURIComponent(ccn)}`, text: 'Medicare Care Compare' } : null,
  };
}

export function hospitalPin(list, county) {
  if (!list.length || !county) return null;
  const rows = list.slice(0, 15).map((h) => [titleCase(pick(h, 'facility_name')), `${stars(pick(h, 'hospital_overall_rating'))} · ${pick(h, 'hospital_type') || 'Hospital'}${pick(h, 'emergency_services') === 'Yes' ? ' · ER' : ''}`]);
  const links = list.slice(0, 6).map((h) => ({ href: `https://www.medicare.gov/care-compare/details/hospital/${encodeURIComponent(pick(h, 'facility_id'))}`, text: `${titleCase(pick(h, 'facility_name')).slice(0, 30)}` }));
  return { key: 'hosp' + county.fips, lat: county.lat + 0.02, lon: county.lon, label: 'H', color: '#ff7ad9', title: `Hospitals in ${county.name}`, subtitle: 'Medicare overall star ratings', rows, links };
}

export default makePointLayer({
  id: 'peopleCare',
  name: 'Nursing home & hospital ratings',
  group: 'people',
  color: '#ff7ad9',
  icon,
  label: 'N',
  heightM: 200,
  view: { maxKm: 1200, radiusKm: 80, minGapMs: 10000 },
  attribution: 'Care ratings: Centers for Medicare & Medicaid Services (CMS) Provider Data Catalog, Nursing Home Provider Information and Hospital General Information',
  async fetch(ctx, q) {
    const w = await whereIs(ctx, q.lat, q.lon);
    const st = w.state.abbr;
    const [homes, hosp] = await Promise.all([
      stateHomes(ctx, st),
      w.county ? memo(`cmsH:${w.county.fips}`, 6 * 3600, async () => (await ctx.net.get(cmsUrl(ENDPOINTS.peopleCmsHospitals, [['state', st], ['countyparish', w.county.base, 'like']]), { timeoutMs: 25000 })).results || []).catch(() => []) : [],
    ]);
    return { q, county: w.county, homes, hosp };
  },
  parse: (raw) => {
    const out = raw.homes.map(parseHome).filter((h) => Number.isFinite(h.lat) && distKm(raw.q.lat, raw.q.lon, h.lat, h.lon) <= raw.q.radiusKm);
    const pin = hospitalPin(raw.hosp, raw.county);
    if (pin) out.push(pin);
    return out;
  },
  describe: (it) => ({ title: it.title, subtitle: it.subtitle, rows: it.rows, link: it.link, links: it.links }),
  note: () => 'Colour = overall star rating (red 1 … green 5)',
});

addProbe('CMS nursing homes (GA, first page)', async (ctx) => ((await ctx.net.get(cmsUrl(ENDPOINTS.peopleCmsNursingHomes, [['state', 'GA']]), { timeoutMs: 30000 })).results || []).length);
addProbe('CMS hospitals (Baldwin County GA)', async (ctx) => ((await ctx.net.get(cmsUrl(ENDPOINTS.peopleCmsHospitals, [['state', 'GA'], ['countyparish', 'Baldwin', 'like']]))).results || []).length);
