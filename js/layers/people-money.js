// "Federal money here": the organizations in the county at the view centre that
// received the most federal contract and grant money in the last 12 months
// (USAspending.gov). Organizations only: a recipient whose name looks like a
// private person is counted but never named (see lib/privacy.js, 'entity' mode).
import { ENDPOINTS } from '../config.js';
import { makePointLayer } from './lib/point-layer.js';
import { whereIs, postJSON, memo, money, titleCase, addProbe } from './lib/people.js';
import { recordName } from './lib/privacy.js';
import { isoDate } from './lib/geo.js';

const icon = '<svg viewBox="0 0 24 24"><path d="M3 10l9-6 9 6M5 10v8M9.5 10v8M14.5 10v8M19 10v8M3 21h18" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>';
const TYPES = { contracts: ['A', 'B', 'C', 'D'], grants: ['02', '03', '04', '05'] };

function body(w, codes) {
  const end = new Date();
  const start = new Date(end.getTime() - 365 * 86400e3);
  return {
    category: 'recipient',
    filters: {
      recipient_locations: [{ country: 'USA', state: w.state.abbr, county: w.county.code }],
      time_period: [{ start_date: isoDate(start), end_date: isoDate(end) }],
      award_type_codes: codes,
    },
    limit: 15, page: 1,
  };
}

// Results -> shown organizations + a count of withheld ones.
export function recipients(results) {
  const shown = []; let hidden = 0; let hiddenAmt = 0;
  for (const r of results || []) {
    const v = recordName(r.name, { mode: 'entity' });
    if (v.show) shown.push({ name: titleCase(v.name), amount: r.amount, id: typeof r.recipient_id === 'string' && r.recipient_id.includes('-') ? r.recipient_id : null });
    else { hidden++; hiddenAmt += Number(r.amount) || 0; }
  }
  return { shown, hidden, hiddenAmt };
}

export default makePointLayer({
  id: 'peopleMoney',
  name: 'Federal money here',
  group: 'people',
  color: '#3ee67a',
  icon,
  label: '$',
  heightM: 300,
  view: { maxKm: 2500, radiusKm: 30, minGapMs: 10000 },
  attribution: 'Federal money: USAspending.gov (U.S. Treasury), contracts and grants to recipients located in the county, last 12 months',
  async fetch(ctx, q) {
    const w = await whereIs(ctx, q.lat, q.lon);
    if (!w.county) return { w, kinds: {} };
    const kinds = {};
    await Promise.all(Object.entries(TYPES).map(async ([k, codes]) => {
      const j = await memo(`usa:${w.county.fips}:${k}`, 6 * 3600, () => postJSON(ctx, ENDPOINTS.peopleUsaspending, body(w, codes), { timeoutMs: 25000 }));
      kinds[k] = recipients(j.results);
    }));
    return { w, kinds };
  },
  parse: (raw) => {
    if (!raw.w.county || !raw.kinds.contracts) return [];
    const rows = [];
    for (const [k, label] of [['contracts', 'Contracts'], ['grants', 'Grants']]) {
      const x = raw.kinds[k];
      if (!x.shown.length && !x.hidden) { rows.push([label, 'None in the last 12 months']); continue; }
      x.shown.slice(0, 8).forEach((r, i) => rows.push([i ? '' : label, `${r.name} · ${money(r.amount)}`]));
      if (x.hidden) rows.push(['', `${x.hidden} not named (private individuals or withheld) · ${money(x.hiddenAmt)}`]);
    }
    const links = [];
    for (const r of [...raw.kinds.contracts.shown.slice(0, 3), ...raw.kinds.grants.shown.slice(0, 3)]) {
      if (r.id) links.push({ href: `https://www.usaspending.gov/recipient/${encodeURIComponent(r.id)}/latest`, text: `${r.name.slice(0, 28)}: profile` });
    }
    return [{
      key: raw.w.county.fips, lat: raw.w.county.lat, lon: raw.w.county.lon,
      title: `Federal money in ${raw.w.county.name}`, subtitle: 'Top recipients, last 12 months · USAspending.gov',
      rows, links,
      link: { href: 'https://www.usaspending.gov/search', text: 'Search USAspending' },
    }];
  },
  describe: (it) => ({ title: it.title, subtitle: it.subtitle, rows: it.rows, links: it.links, link: it.link }),
});

addProbe('USAspending (POST, Bibb County GA)', async (ctx) => (await postJSON(ctx, ENDPOINTS.peopleUsaspending, body({ state: { abbr: 'GA' }, county: { code: '021' } }, TYPES.grants))).results.length);
