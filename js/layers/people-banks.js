// "Bank branches": FDIC-insured bank offices near the view, with the bank that
// runs each one (FDIC BankFind). Every record is an FDIC-insured institution (always
// an organization), so no person-name filter is needed here.
import { ENDPOINTS } from '../config.js';
import { makePointLayer } from './lib/point-layer.js';
import { bbox } from './lib/geo.js';
import { titleCase, addProbe } from './lib/people.js';

const icon = '<svg viewBox="0 0 24 24"><path d="M3 9l9-5 9 5M5 9v9M19 9v9M9 9v9M15 9v9M3 21h18M3 18h18" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>';
const SERV = { 11: 'Full-service branch', 12: 'Full-service branch (retail)', 13: 'Full-service cyber office', 15: 'Full-service home office', 16: 'Full-service seasonal', 21: 'Limited service: administrative', 22: 'Limited service: military', 23: 'Limited service: drive-through', 24: 'Limited service: loan office', 25: 'Limited service: consumer credit', 26: 'Limited service: contractual', 27: 'Limited service: messenger', 28: 'Limited service: retail', 29: 'Limited service: mobile', 30: 'Limited service: trust office' };

export const fdicFilter = (b) => `LATITUDE:[${b.s} TO ${b.n}] AND LONGITUDE:[${b.w} TO ${b.e}]`;

export function parseFdic(j) {
  return ((j && j.data) || []).map((x) => x.data || x).map((d) => {
    const est = String(d.ESTYMD || '').slice(0, 10);
    return {
      key: String(d.UNINUMBR || `${d.CERT}-${d.OFFNAME}`), lat: Number(d.LATITUDE), lon: Number(d.LONGITUDE),
      color: String(d.MAINOFF) === '1' ? '#ffd34d' : '#7fd8ff',
      title: titleCase(d.OFFNAME || d.NAME), subtitle: titleCase(d.NAME),
      rows: [['Bank', titleCase(d.NAME)], ['Office', SERV[d.SERVTYPE] || (String(d.MAINOFF) === '1' ? 'Main office' : 'Branch')],
        ['Address', [titleCase(d.ADDRESS), titleCase(d.CITY), d.STALP].filter(Boolean).join(', ')], ['Opened', est || '—'], ['FDIC certificate', String(d.CERT || '—')]],
      link: d.CERT ? { href: `https://banks.data.fdic.gov/bankfind-suite/bankfind/details/${d.CERT}`, text: 'FDIC BankFind' } : null,
    };
  });
}

export default makePointLayer({
  id: 'peopleBanks',
  name: 'Bank branches (FDIC)',
  group: 'people',
  color: '#7fd8ff',
  icon,
  shape: 'point',
  size: 6,
  heightM: 100,
  max: 500,
  view: { maxKm: 400, radiusKm: 30, minGapMs: 10000 },
  attribution: 'Bank branches: Federal Deposit Insurance Corporation (FDIC) BankFind Suite API',
  fetch: (ctx, q) => ctx.net.get(ctx.net.fillUrl(ENDPOINTS.peopleFdic, { f: fdicFilter(bbox(q.lat, q.lon, q.radiusKm)) }), { timeoutMs: 20000 }),
  parse: (j) => parseFdic(j),
  note: () => 'Gold = a bank\'s main office',
});

addProbe('FDIC branches (Milledgeville box)', async (ctx) => parseFdic(await ctx.net.get(ctx.net.fillUrl(ENDPOINTS.peopleFdic, { f: fdicFilter(bbox(33.08, -83.23, 8)) }))).length);
