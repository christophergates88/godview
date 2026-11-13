// "The people here": who lives around the view centre, IN AGGREGATE only.
// Census American Community Survey 5-year estimates for the census tract and
// the county at the centre: population, age mix, households, income, housing
// age, commute, languages. A few big numbers; never individuals.
import { ENDPOINTS } from '../config.js';
import { makePointLayer } from './lib/point-layer.js';
import { whereIs, memo, money, addProbe } from './lib/people.js';
import { FeedError } from '../core/net.js';

const icon = '<svg viewBox="0 0 24 24"><path d="M8 11a3 3 0 1 0 0-6 3 3 0 0 0 0 6zM16 11a3 3 0 1 0 0-6 3 3 0 0 0 0 6zM2 20c0-3.3 2.7-6 6-6s6 2.7 6 6M12 20c0-3.3 1.8-6 4-6s6 2.7 6 6" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>';

const r = (a, b) => Array.from({ length: b - a + 1 }, (_, i) => `B01001_${String(a + i).padStart(3, '0')}E`);
const U18 = [...r(3, 6), ...r(27, 30)];
const O65 = [...r(20, 25), ...r(44, 49)];
export const VARS = ['NAME', 'B01001_001E', 'B01002_001E', ...U18, ...O65, 'B11001_001E', 'B19013_001E', 'B25003_001E', 'B25003_002E',
  'B25035_001E', 'B08013_001E', 'B08303_001E', 'C16001_001E', 'C16001_002E'];

// Census uses large negative numbers for "not available".
const num = (v) => { const n = Number(v); return Number.isFinite(n) && n > -100000 ? n : null; };
const pct = (a, b) => (a != null && b ? `${Math.round((100 * a) / b)}%` : '—');

export function summarise(table) {
  if (!Array.isArray(table) || table.length < 2) return null;
  const [head, vals] = table;
  const g = (k) => num(vals[head.indexOf(k)]);
  const sum = (ks) => ks.reduce((s, k) => (g(k) == null ? s : s + g(k)), 0);
  const pop = g('B01001_001E');
  const commute = g('B08013_001E') != null && g('B08303_001E') ? g('B08013_001E') / g('B08303_001E') : null;
  return {
    name: vals[head.indexOf('NAME')],
    pop,
    stats: [
      { label: 'People', value: pop != null ? pop.toLocaleString() : '—' },
      { label: 'Median age', value: g('B01002_001E') != null ? String(g('B01002_001E')) : '—' },
      { label: 'Households', value: g('B11001_001E') != null ? g('B11001_001E').toLocaleString() : '—' },
      { label: 'Median household income', value: g('B19013_001E') != null ? money(g('B19013_001E')) : '—' },
      { label: 'Typical home built', value: g('B25035_001E') ? String(g('B25035_001E')) : '—' },
      { label: 'Average commute', value: commute != null ? `${Math.round(commute)} min` : '—' },
    ],
    rows: [
      ['Children (under 18)', pct(sum(U18), pop)],
      ['Age 65 and over', pct(sum(O65), pop)],
      ['Homes owned by the people living in them', pct(g('B25003_002E'), g('B25003_001E'))],
      ['Speak a language other than English at home', g('C16001_001E') ? pct(g('C16001_001E') - (g('C16001_002E') || 0), g('C16001_001E')) : '—'],
    ],
  };
}

async function acs(ctx, geo) {
  let lastErr = null;
  for (const year of ENDPOINTS.peopleAcsYears) {
    try {
      const url = ctx.net.fillUrl(ENDPOINTS.peopleAcs, { year, vars: VARS.join(','), for: geo.for, in: geo.in });
      const t = await memo(url, 86400, () => ctx.net.get(url, { timeoutMs: 20000 }));
      return { year, table: t };
    } catch (e) { lastErr = e; if (!(e.status === 404 || e.status === 400 || e.status === 204)) break; }
  }
  throw lastErr || new FeedError('No survey data');
}

export default makePointLayer({
  id: 'peopleCensus',
  name: 'The people here (Census)',
  group: 'people',
  color: '#7fd8ff',
  icon,
  label: '#',
  heightM: 300,
  view: { maxKm: 2500, radiusKm: 20, minGapMs: 8000 },
  attribution: 'The people here: U.S. Census Bureau, American Community Survey 5-year estimates (via api.census.gov; this product uses the Census Bureau Data API but is not endorsed or certified by the Census Bureau); geography from Census TIGERweb',
  async fetch(ctx, q) {
    const w = await whereIs(ctx, q.lat, q.lon);
    const jobs = [];
    if (w.tract) jobs.push(acs(ctx, { for: `tract:${w.tract.code}`, in: `state:${w.tract.state} county:${w.tract.county}` }).then((x) => ({ kind: 'tract', at: w.tract, ...x })));
    if (w.county) jobs.push(acs(ctx, { for: `county:${w.county.code}`, in: `state:${w.county.state}` }).then((x) => ({ kind: 'county', at: w.county, ...x })));
    const got = await Promise.allSettled(jobs);
    const ok = got.filter((g) => g.status === 'fulfilled').map((g) => g.value);
    if (!ok.length) throw (got[0] && got[0].reason) || new FeedError('No Census area here');
    return { w, areas: ok };
  },
  parse: (raw) => raw.areas.map((a) => {
    const s = summarise(a.table);
    if (!s) return null;
    return {
      key: a.kind, lat: a.at.lat, lon: a.at.lon, label: a.kind === 'tract' ? '#' : 'C',
      title: a.kind === 'tract' ? 'The people in this neighbourhood' : `The people of ${a.at.name}`,
      subtitle: `${s.name} · survey ${a.year - 4}–${a.year}`,
      stats: s.stats,
      rows: [...s.rows, ['About these numbers', 'Census survey estimates averaged over five years; small areas have wide error margins']],
      link: { href: `https://data.census.gov/profile?g=${a.kind === 'tract' ? '1400000US' + a.at.geoid : '050XX00US' + a.at.fips}`, text: 'Census profile' },
    };
  }).filter((x) => x && Number.isFinite(x.lat)),
  describe: (it) => ({ title: it.title, subtitle: it.subtitle, rows: it.rows, stats: it.stats, link: it.link }),
});

addProbe('Census ACS (Putnam County, GA)', async (ctx) => {
  const url = ctx.net.fillUrl(ENDPOINTS.peopleAcs, { year: ENDPOINTS.peopleAcsYears[0], vars: 'NAME,B01001_001E', for: 'county:237', in: 'state:13' });
  return (await ctx.net.get(url)).length - 1;
});
