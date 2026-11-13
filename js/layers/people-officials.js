// "Who's in charge here": the people who represent and run the place at the
// view centre (or a tapped spot), in their OFFICIAL role only: US senators and
// representative, governor, state legislators, with official contact links and
// links to their public record (votes, bills, campaign totals at committee level).
//
// Sources: Census TIGERweb (which districts the point is in), the
// @unitedstates congress-legislators file (current members of Congress),
// Open States (state legislators; keyless nightly CSV, or its API with a free
// key), Wikidata (governor, county website), OpenFEC (campaign committee totals,
// on demand when the card opens). No local officials: no open nationwide source.
import { ENDPOINTS } from '../config.js';
import { makePointLayer } from './lib/point-layer.js';
import { parseCSV, distKm } from './lib/geo.js';
import { whereIs, placeLabel, sparql, sv, memo, money, httpsOnly, addProbe } from './lib/people.js';

const svgIcon = '<svg viewBox="0 0 24 24"><path d="M3 21h18M5 21V10M19 21V10M9 21v-6h6v6M2 10l10-6 10 6z" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>';
const PARTY = { Democrat: 'Democrat', Republican: 'Republican', Independent: 'Independent', Democratic: 'Democrat' };

// ---- members of Congress (one ~1 MB file a day, slimmed)
export function slimLegislators(list) {
  return (list || []).map((p) => {
    const t = (p.terms || [])[p.terms.length - 1] || {};
    return {
      name: (p.name && (p.name.official_full || `${p.name.first} ${p.name.last}`)) || '', type: t.type, state: t.state,
      district: t.district ?? null, party: t.party || '', rank: t.state_rank || '', url: t.url || '', contact: t.contact_form || '',
      phone: t.phone || '', office: t.address || t.office || '', end: t.end || '',
      bioguide: p.id && p.id.bioguide, govtrack: p.id && p.id.govtrack, fec: (p.id && p.id.fec) || [],
    };
  });
}
async function legislators(ctx) {
  return memo('legislators', 86400, async () => {
    const hit = ctx.net.cache.get && ctx.net.cache.get('peopleLegislators', 86400);
    if (hit) return hit.data;
    const slim = slimLegislators(await ctx.net.get(ENDPOINTS.peopleLegislators, { timeoutMs: 30000 }));
    if (!ctx.test && ctx.net.cache.set) ctx.net.cache.set('peopleLegislators', slim);
    return slim;
  });
}
export function federalFor(all, w) {
  const st = w.state && w.state.abbr;
  const sen = all.filter((m) => m.type === 'sen' && m.state === st);
  const rep = all.filter((m) => m.type === 'rep' && m.state === st && (w.cd ? Number(m.district) === Number(w.cd.number) : false));
  // At-large states and delegates: the only House member for the state.
  const reps = rep.length ? rep : all.filter((m) => m.type === 'rep' && m.state === st).filter((m, i, a) => a.length === 1);
  return { sen, rep: reps };
}

// ---- state legislators (never the district-office address: it can be a home)
const normD = (s) => String(s ?? '').trim().replace(/^0+(?=\d)/, '').toLowerCase();
export function stateLegFromCsv(text, w) {
  const rows = parseCSV(text);
  const head = rows.shift() || [];
  const ix = (k) => head.indexOf(k);
  const want = { upper: normD(w.sldu && w.sldu.base), lower: normD(w.sldl && w.sldl.base) };
  const out = [];
  for (const r of rows) {
    let ch = r[ix('current_chamber')];
    if (ch === 'legislature') ch = 'upper';
    if (!want[ch] || normD(r[ix('current_district')]) !== want[ch]) continue;
    const links = String(r[ix('links')] || '').split(/[;\s]+/).map(httpsOnly).filter(Boolean);
    out.push({ name: r[ix('name')], party: r[ix('current_party')], chamber: ch, district: r[ix('current_district')], email: r[ix('email')] || '', phone: r[ix('capitol_voice')] || '', link: links[0] || null });
  }
  return out;
}
async function stateLeg(ctx, w, q) {
  const key = ctx.key && ctx.key('openstates');
  if (key) {
    const j = await ctx.net.get(ctx.net.fillUrl(ENDPOINTS.peopleOpenStatesGeo, { lat: q.lat.toFixed(5), lon: q.lon.toFixed(5), key }));
    return (j.results || []).filter((p) => p.jurisdiction && p.jurisdiction.classification === 'state').map((p) => ({
      name: p.name, party: p.party, chamber: p.current_role && p.current_role.org_classification, district: p.current_role && p.current_role.district,
      email: p.email || '', phone: '', link: p.openstates_url || ((p.links || [])[0] || {}).url || null,
    }));
  }
  if (!w.state || (!w.sldu && !w.sldl)) return [];
  const text = await memo('osCsv:' + w.state.abbr, 6 * 3600, () => ctx.net.get(ctx.net.fillUrl(ENDPOINTS.peopleOpenStatesCsv, { st: w.state.abbr.toLowerCase() }), { type: 'text', timeoutMs: 25000 }));
  return stateLegFromCsv(text, w);
}

// ---- governor and county website (Wikidata; check against the state's own site)
function wdQuery(w) {
  const iso = `US-${w.state.abbr}`;
  const county = w.county ? w.county.fips : '00000';
  return `SELECT ?kind ?item ?itemLabel ?article ?site WHERE {
 { ?s wdt:P300 "${iso}". ?s p:P6 ?st. ?st ps:P6 ?item. FILTER NOT EXISTS { ?st pq:P582 ?end } BIND("gov" AS ?kind)
   OPTIONAL { ?s wdt:P856 ?site } OPTIONAL { ?article schema:about ?item; schema:isPartOf <https://en.wikipedia.org/> } }
 UNION { ?item wdt:P882 "${county}". BIND("county" AS ?kind) OPTIONAL { ?item wdt:P856 ?site } }
 SERVICE wikibase:label { bd:serviceParam wikibase:language "en". } } LIMIT 10`;
}
export function parseWd(j) {
  const b = (j && j.results && j.results.bindings) || [];
  const gov = b.find((x) => sv(x, 'kind') === 'gov');
  const county = b.find((x) => sv(x, 'kind') === 'county' && sv(x, 'site'));
  return {
    governor: gov ? { name: sv(gov, 'itemLabel'), article: httpsOnly(sv(gov, 'article')), stateSite: httpsOnly(sv(gov, 'site')) } : null,
    countySite: county ? httpsOnly(sv(county, 'site')) : null,
  };
}

const settle = (p) => p.then((value) => ({ ok: true, value }), (e) => ({ ok: false, error: (e && e.message) || 'failed' }));

export async function lookup(ctx, lat, lon) {
  const where = await whereIs(ctx, lat, lon);
  const [fed, state, wd] = await Promise.all([
    settle(legislators(ctx).then((all) => federalFor(all, where))),
    settle(stateLeg(ctx, where, { lat, lon })),
    settle(sparql(ctx, wdQuery(where)).then(parseWd)),
  ]);
  return { lat, lon, where, fed, state, wd };
}

const partyOf = (p) => PARTY[p] || p || '';
const fedLine = (m, rep) => [m.name, partyOf(m.party), rep ? (Number(m.district) === 0 ? 'At large' : `District ${m.district}`) : (m.rank ? `${m.rank} senator` : '')].filter(Boolean).join(' · ');

// Rows and links for one lookup (used by the pin card and by a tapped point).
export function card(raw) {
  const w = raw.where;
  const rows = [['Place', placeLabel(w) || '—']];
  const links = [];
  if (raw.fed.ok) {
    for (const m of raw.fed.value.sen) rows.push(['US Senator', fedLine(m, false)]);
    for (const m of raw.fed.value.rep) rows.push([w.state.abbr === 'DC' || w.state.fips > '56' ? 'US House delegate' : 'US Representative', fedLine(m, true)]);
    if (!raw.fed.value.sen.length && !raw.fed.value.rep.length) rows.push(['Congress', 'No voting members for this place']);
    for (const m of [...raw.fed.value.sen, ...raw.fed.value.rep]) {
      const last = m.name.split(' ').slice(-1)[0];
      if (httpsOnly(m.url)) links.push({ href: httpsOnly(m.url), text: `${last}: official site` });
      if (httpsOnly(m.contact)) links.push({ href: httpsOnly(m.contact), text: `${last}: contact` });
      if (m.govtrack) links.push({ href: `https://www.govtrack.us/congress/members/${m.govtrack}`, text: `${last}: votes & bills` });
      const fec = pickFec(m);
      if (fec) links.push({ href: `https://www.fec.gov/data/candidate/${fec}/`, text: `${last}: campaign money` });
    }
  } else rows.push(['Congress', `Not available (${raw.fed.error})`]);
  if (raw.wd.ok && raw.wd.value.governor) {
    rows.push(['Governor', raw.wd.value.governor.name]);
    if (raw.wd.value.governor.article) links.push({ href: raw.wd.value.governor.article, text: 'Governor: Wikipedia' });
    if (raw.wd.value.governor.stateSite) links.push({ href: raw.wd.value.governor.stateSite, text: `${w.state.name}: official site` });
  } else rows.push(['Governor', raw.wd.ok ? 'Not found' : `Not available (${raw.wd.error})`]);
  if (raw.state.ok) {
    for (const s of raw.state.value) {
      rows.push([s.chamber === 'upper' ? 'State senator' : 'State representative', [s.name, s.party, s.district ? `District ${s.district}` : ''].filter(Boolean).join(' · ')]);
      const last = String(s.name || '').split(' ').slice(-1)[0];
      if (s.link) links.push({ href: s.link, text: `${last}: legislature page` });
      if (s.email && /^[^@\s]+@[^@\s]+$/.test(s.email)) links.push({ href: `mailto:${s.email}`, text: `${last}: email` });
    }
    if (!raw.state.value.length && (w.sldu || w.sldl)) rows.push(['State legislators', 'Not found for these districts']);
  } else rows.push(['State legislators', `Not available (${raw.state.error})`]);
  if (w.school) rows.push(['School district', w.school.name]);
  if (raw.wd.ok && raw.wd.value.countySite) links.push({ href: raw.wd.value.countySite, text: `${w.county.name}: official site` });
  return { rows, links };
}

export function pickFec(m) {
  const want = m.type === 'sen' ? 'S' : 'H';
  return (m.fec || []).find((id) => id[0] === want) || null;
}

let last = null;
const layer = makePointLayer({
  id: 'peopleOfficials',
  name: "Who's in charge here",
  group: 'people',
  color: '#ffd34d',
  icon: svgIcon,
  label: '★',
  heightM: 300,
  view: { maxKm: 4000, radiusKm: 20, minGapMs: 8000 },
  attribution: "Who's in charge: districts from US Census TIGERweb; Congress from the @unitedstates congress-legislators project (public domain); state legislators from Open States / Plural (CC BY); governor and county sites from Wikidata (CC0); campaign totals from the FEC (OpenFEC)",
  async fetch(ctx, q) { const raw = await lookup(ctx, q.lat, q.lon); if (!ctx.test) last = raw; return raw; },
  parse: (raw) => [{
    key: 'here', lat: raw.lat, lon: raw.lon, title: "Who's in charge here", subtitle: placeLabel(raw.where),
  }],
  describe(it, ctx) {
    const raw = last; if (!raw) return null;
    const c = card(raw);
    return { title: placeLabel(raw.where) || "Who's in charge here", subtitle: 'Officials for this spot, in their public role', rows: c.rows.slice(1), links: c.links };
  },
  note: (items, raw) => [raw.fed.ok ? '' : 'Congress list unavailable', raw.state.ok ? '' : 'state legislators unavailable', raw.wd.ok ? '' : 'governor unavailable'].filter(Boolean).join(' · '),
  // Campaign committee totals (FEC), loaded when the card opens. DEMO_KEY is shared and
  // limited (about 30 calls an hour per address); a free api.data.gov key raises that.
  async details(it, ctx) {
    const raw = last; if (!raw || !raw.fed.ok) return [];
    const key = ctx.key('fec') || 'DEMO_KEY';
    const members = [...raw.fed.value.sen, ...raw.fed.value.rep];
    const rows = await Promise.all(members.map(async (m) => {
      const id = pickFec(m);
      if (!id) return null;
      const lastName = m.name.split(' ').slice(-1)[0];
      try {
        const j = await memo('fec:' + id, 86400, () => ctx.net.get(ctx.net.fillUrl(ENDPOINTS.peopleFecTotals, { id, key })));
        const t = (j.results || [])[0];
        if (!t) return [`${lastName} campaign`, 'No totals filed'];
        return [`${lastName} campaign (${t.cycle})`, `Raised ${money(t.receipts)} · spent ${money(t.disbursements)} · cash ${money(t.cash_on_hand_end_period)}${t.coverage_end_date ? ` (to ${String(t.coverage_end_date).slice(0, 10)})` : ''}`];
      } catch (e) { return [`${lastName} campaign`, `Not available (${e.message})`]; }
    }));
    return { rows: rows.filter(Boolean) };
  },
});

layer.usesKeys = ['openstates', 'fec']; // optional keys (Settings > API keys)

// Briefing lines for the "What's here" card.
layer.brief = (ctx, pt) => {
  if (!last || distKm(pt.lat, pt.lon, last.lat, last.lon) > 25) return [];
  const out = [];
  if (last.fed.ok) {
    const s = last.fed.value.sen.map((m) => m.name).join(' and ');
    const r = last.fed.value.rep.map((m) => m.name).join(', ');
    if (s || r) out.push(`In Congress for ${last.where.state.name}: ${[s && `senators ${s}`, r && `representative ${r}`].filter(Boolean).join('; ')}.`);
  }
  if (last.wd.ok && last.wd.value.governor) out.push(`Governor: ${last.wd.value.governor.name}.`);
  return out;
};

// Tapping bare ground adds these rows to the point card (see ui.js "people" hook).
layer.pointInfo = async (ctx, lat, lon) => { const c = card(await lookup(ctx, lat, lon)); return { title: "Who's in charge here", rows: c.rows.slice(1), links: c.links }; };

addProbe('Census TIGERweb (districts)', async (ctx) => Object.keys(await whereIs(ctx, 33.3, -83.4)).length);
addProbe('Congress list (unitedstates.github.io)', async (ctx) => (await ctx.net.get(ENDPOINTS.peopleLegislators, { timeoutMs: 30000 })).length);
addProbe('Open States CSV (GA)', async (ctx) => parseCSV(await ctx.net.get(ctx.net.fillUrl(ENDPOINTS.peopleOpenStatesCsv, { st: 'ga' }), { type: 'text', timeoutMs: 25000 })).length - 1);
addProbe('Wikidata (governor)', async (ctx) => (parseWd(await sparql(ctx, wdQuery({ state: { abbr: 'GA' }, county: { fips: '13237' } }))).governor ? 1 : 0));
addProbe('OpenFEC (DEMO_KEY)', async (ctx) => {
  const sen = slimLegislators(await ctx.net.get(ENDPOINTS.peopleLegislators, { timeoutMs: 30000 })).find((m) => m.type === 'sen' && pickFec(m));
  return ((await ctx.net.get(ctx.net.fillUrl(ENDPOINTS.peopleFecTotals, { id: pickFec(sen), key: 'DEMO_KEY' }))).results || []).length;
});

export default layer;
