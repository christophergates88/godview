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

// Census Reporter answer -> the same [header, values] table the Census API gives.
const TABLES = [...new Set(VARS.filter((v) => v !== 'NAME').map((v) => v.split('_')[0]))];
export function fromCensusReporter(j, geoid) {
  const d = j && j.data && j.data[geoid];
  if (!d) return null;
  const vals = VARS.map((v) => {
    if (v === 'NAME') return (j.geography && j.geography[geoid] && j.geography[geoid].name) || geoid;
    const [t, c] = v.split('_');
    const est = d[t] && d[t].estimate && d[t].estimate[`${t}${c.replace(/E$/, '')}`];
    return est == null ? null : String(est);
  });
  return [VARS, vals];
}
const endYear = (j) => parseInt(String((j && j.release && j.release.years) || '').split('-').pop(), 10) || null;

// Census API (backup). Its error pages are HTML ("Missing Key", "Invalid Key"): say so plainly.
async function censusApi(ctx, geo) {
  const key = ctx.key && ctx.key('census');
  if (!key) throw new FeedError('Backup source needs a free Census key (api.census.gov/data/key_signup.html), Settings > API keys', { kind: 'needs-key' });
  let lastErr = null;
  for (const year of ENDPOINTS.peopleAcsYears) {
    const url = ctx.net.fillUrl(ENDPOINTS.peopleAcs, { year, vars: VARS.join(','), for: geo.for, in: geo.in, key });
    try {
      const text = await ctx.net.get(url, { type: 'text', timeoutMs: 20000 });
      return { year, table: parseCensusApi(text) };
    } catch (e) { lastErr = e; if (!(e.status === 404 || e.status === 400 || e.status === 204)) break; }
  }
  throw lastErr || new FeedError('No survey data');
}
export function parseCensusApi(text) {
  const t = String(text || '');
  if (/Missing Key/i.test(t)) throw new FeedError('Census API: key missing');
  if (/Invalid Key/i.test(t)) throw new FeedError('Census API: key not valid (check it in Settings > API keys)');
  if (/^\s*</.test(t)) throw new FeedError('Census API answered with a web page, not data');
  try { return JSON.parse(t); } catch { throw new FeedError('Census API: no data for this area'); }
}

async function loadAreas(ctx, w) {
  const geos = [];
  if (w.tract) geos.push({ kind: 'tract', at: w.tract, geoid: `14000US${w.tract.geoid}`, api: { for: `tract:${w.tract.code}`, in: `state:${w.tract.state} county:${w.tract.county}` } });
  if (w.county) geos.push({ kind: 'county', at: w.county, geoid: `05000US${w.county.fips}`, api: { for: `county:${w.county.code}`, in: `state:${w.county.state}` } });
  if (!geos.length) throw new FeedError('No Census area here');
  let primaryErr = null;
  try {
    const url = ctx.net.fillUrl(ENDPOINTS.peopleCensusReporter, { tables: TABLES.join(','), geos: geos.map((g) => g.geoid).join(',') });
    const j = await memo(url, 86400, () => ctx.net.get(url, { timeoutMs: 25000 }));
    const out = geos.map((g) => ({ ...g, year: endYear(j), table: fromCensusReporter(j, g.geoid), source: 'Census Reporter' })).filter((g) => g.table);
    if (out.length) return out;
    primaryErr = new FeedError('Census Reporter: no data for this area');
  } catch (e) { primaryErr = e; }
  // Backup: the Census API with the user's own key.
  const got = await Promise.allSettled(geos.map((g) => censusApi(ctx, g.api).then((x) => ({ ...g, ...x, source: 'Census API' }))));
  const ok = got.filter((g) => g.status === 'fulfilled').map((g) => g.value);
  if (ok.length) return ok;
  const backupErr = got[0] && got[0].reason;
  throw new FeedError(`${primaryErr.message}; ${backupErr ? backupErr.message : 'no backup'}`, { status: primaryErr.status, kind: primaryErr.kind });
}

const layer = makePointLayer({
  id: 'peopleCensus',
  name: 'The people here (Census)',
  group: 'people',
  color: '#7fd8ff',
  icon,
  label: '#',
  heightM: 300,
  view: { maxKm: 2500, radiusKm: 20, minGapMs: 8000 },
  attribution: 'The people here: U.S. Census Bureau American Community Survey 5-year estimates, via Census Reporter (censusreporter.org) or, with your key, the Census Bureau Data API (not endorsed or certified by the Census Bureau); geography from Census TIGERweb',
  async fetch(ctx, q) {
    const w = await whereIs(ctx, q.lat, q.lon);
    return { w, areas: await loadAreas(ctx, w) };
  },
  parse: (raw) => raw.areas.map((a) => {
    const s = summarise(a.table);
    if (!s) return null;
    return {
      key: a.kind, lat: a.at.lat, lon: a.at.lon, label: a.kind === 'tract' ? '#' : 'C',
      title: a.kind === 'tract' ? 'The people in this neighbourhood' : `The people of ${a.at.name}`,
      subtitle: `${s.name} · survey ${a.year ? `${a.year - 4}–${a.year}` : ''} · ${a.source}`,
      stats: s.stats,
      rows: [...s.rows, ['About these numbers', 'Census survey estimates averaged over five years; small areas have wide error margins']],
      link: { href: `https://data.census.gov/profile?g=${a.kind === 'tract' ? '1400000US' + a.at.geoid : '050XX00US' + a.at.fips}`, text: 'Census profile' },
    };
  }).filter((x) => x && Number.isFinite(x.lat)),
  describe: (it) => ({ title: it.title, subtitle: it.subtitle, rows: it.rows, stats: it.stats, link: it.link }),
});

layer.usesKeys = ['census']; // optional backup source (Settings > API keys)
export default layer;

addProbe('Census Reporter (Bibb County, GA)', async (ctx) => {
  const j = await ctx.net.get(ctx.net.fillUrl(ENDPOINTS.peopleCensusReporter, { tables: 'B01001', geos: '05000US13021' }));
  return fromCensusReporter(j, '05000US13021') ? 1 : 0;
});
