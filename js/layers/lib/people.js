// Shared helpers for the "People & records" group (layers named people-*.js).
// Privacy rules: see ./privacy.js. Nothing here looks up a private person.

import { ENDPOINTS, NET } from '../../config.js';
import { FeedError, fillUrl, get as netGet } from '../../core/net.js';
import { bbox } from './geo.js';

// ---- US states (FIPS <-> postal code <-> name)
export const STATES = {
  '01': ['AL', 'Alabama'], '02': ['AK', 'Alaska'], '04': ['AZ', 'Arizona'], '05': ['AR', 'Arkansas'], '06': ['CA', 'California'],
  '08': ['CO', 'Colorado'], '09': ['CT', 'Connecticut'], '10': ['DE', 'Delaware'], '11': ['DC', 'District of Columbia'], '12': ['FL', 'Florida'],
  '13': ['GA', 'Georgia'], '15': ['HI', 'Hawaii'], '16': ['ID', 'Idaho'], '17': ['IL', 'Illinois'], '18': ['IN', 'Indiana'], '19': ['IA', 'Iowa'],
  '20': ['KS', 'Kansas'], '21': ['KY', 'Kentucky'], '22': ['LA', 'Louisiana'], '23': ['ME', 'Maine'], '24': ['MD', 'Maryland'],
  '25': ['MA', 'Massachusetts'], '26': ['MI', 'Michigan'], '27': ['MN', 'Minnesota'], '28': ['MS', 'Mississippi'], '29': ['MO', 'Missouri'],
  '30': ['MT', 'Montana'], '31': ['NE', 'Nebraska'], '32': ['NV', 'Nevada'], '33': ['NH', 'New Hampshire'], '34': ['NJ', 'New Jersey'],
  '35': ['NM', 'New Mexico'], '36': ['NY', 'New York'], '37': ['NC', 'North Carolina'], '38': ['ND', 'North Dakota'], '39': ['OH', 'Ohio'],
  '40': ['OK', 'Oklahoma'], '41': ['OR', 'Oregon'], '42': ['PA', 'Pennsylvania'], '44': ['RI', 'Rhode Island'], '45': ['SC', 'South Carolina'],
  '46': ['SD', 'South Dakota'], '47': ['TN', 'Tennessee'], '48': ['TX', 'Texas'], '49': ['UT', 'Utah'], '50': ['VT', 'Vermont'],
  '51': ['VA', 'Virginia'], '53': ['WA', 'Washington'], '54': ['WV', 'West Virginia'], '55': ['WI', 'Wisconsin'], '56': ['WY', 'Wyoming'],
  '60': ['AS', 'American Samoa'], '66': ['GU', 'Guam'], '69': ['MP', 'Northern Mariana Islands'], '72': ['PR', 'Puerto Rico'], '78': ['VI', 'U.S. Virgin Islands'],
};
export const stateByAbbr = (abbr) => Object.entries(STATES).find(([, v]) => v[0] === abbr);

// ---- Congress in session: the 119th until 3 Jan 2027, then the 120th.
export function congressNow(date = new Date()) {
  const y = date.getUTCFullYear();
  let c = 119 + Math.floor((y - 2025) / 2);
  if ((((y - 2025) % 2) + 2) % 2 === 0 && date.getTime() < Date.UTC(y, 0, 3, 17)) c -= 1; // new Congress at noon ET on 3 January
  return c;
}

// ---- tiny memory cache (not saved; selfTest-safe)
const mem = new Map();
export function memo(key, maxAgeSec, fn) {
  const hit = mem.get(key);
  if (hit && Date.now() - hit.t < maxAgeSec * 1000) return hit.p;
  const p = Promise.resolve().then(fn);
  mem.set(key, { t: Date.now(), p });
  p.catch(() => mem.delete(key));
  return p;
}

// ---- POST JSON (USAspending only accepts POST; the relay is GET-only, so direct)
export async function postJSON(ctx, url, body, { timeoutMs = NET.timeoutMs } = {}) {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), timeoutMs);
  let res;
  try {
    res = await fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body), signal: ctrl.signal, cache: 'no-store' });
  } catch (e) {
    clearTimeout(timer);
    if (e.name === 'AbortError') throw new FeedError('Timed out', { kind: 'timeout' });
    throw new FeedError('Blocked by browser or unreachable', { kind: 'blocked' });
  }
  clearTimeout(timer);
  if (ctx && ctx.rec && ctx.rec.via !== 'relay') ctx.rec.via = 'direct';
  if (res.status === 429) throw new FeedError('Rate limited by provider', { status: 429, kind: 'ratelimit' });
  if (!res.ok) throw new FeedError(`Provider error ${res.status}`, { status: res.status });
  try { return await res.json(); } catch { throw new FeedError('Bad data from provider'); }
}

// ---- "Where is this point?" Census TIGERweb: state, county, tract, place,
// districts. One identify call (plus one for the current congressional
// districts while they differ from TIGERweb's newest set). Cached ~1 km.
export function whereIs(ctx, lat, lon) {
  const k = `${lat.toFixed(2)},${lon.toFixed(2)}`;
  return memo('where:' + k, 6 * 3600, async () => {
    const b = bbox(lat, lon, 1);
    const url = fillUrl(ENDPOINTS.peopleTigerIdentify, { lon: lon.toFixed(5), lat: lat.toFixed(5), w: b.w, s: b.s, e: b.e, n: b.n });
    const j = await ctx.net.get(url, { timeoutMs: 20000 });
    if (j && j.error) throw new FeedError(`Census TIGERweb: ${j.error.message || 'error'}`);
    const out = parseIdentify(j);
    if (!out.state) throw new FeedError('Outside the United States (no Census geography here)', { kind: 'empty' });
    // Districts of the Congress now in session (TIGERweb may already show the next one).
    const want = congressNow();
    if (!out.cd || out.cd.congress !== want) {
      try {
        const u2 = fillUrl(ENDPOINTS.peopleTigerCd, { layer: ENDPOINTS.peopleTigerCdLayers[want] ?? '', lon: lon.toFixed(5), lat: lat.toFixed(5) });
        if (ENDPOINTS.peopleTigerCdLayers[want] != null) {
          const j2 = await ctx.net.get(u2, { timeoutMs: 15000 });
          const a = j2 && j2.features && j2.features[0] && j2.features[0].attributes;
          if (a) out.cd = { congress: want, geoid: a.GEOID, number: cdNumber(a[`CD${want}`] ?? a.BASENAME), name: a.NAME };
        }
      } catch { /* keep what identify gave */ }
    }
    return out;
  });
}

const cdNumber = (v) => { const n = parseInt(String(v ?? '').replace(/\D/g, ''), 10); return Number.isFinite(n) ? (n === 98 || n === 99 ? 0 : n) : null; };

export function parseIdentify(j) {
  const out = {};
  for (const r of (j && j.results) || []) {
    const a = r.attributes || {};
    const name = String(r.layerName || '');
    const pt = { lat: parseFloat(a.INTPTLAT ?? a.CENTLAT), lon: parseFloat(a.INTPTLON ?? a.CENTLON) };
    if (name === 'States') { const s = STATES[a.STATE]; if (s) out.state = { fips: a.STATE, abbr: s[0], name: s[1] }; }
    else if (name === 'Counties') out.county = { fips: a.STATE + a.COUNTY, state: a.STATE, code: a.COUNTY, name: a.NAME, base: a.BASENAME, ...pt };
    else if (name === 'Census Tracts') out.tract = { geoid: a.GEOID, state: a.STATE, county: a.COUNTY, code: a.TRACT, name: a.NAME, ...pt };
    else if (name === 'Incorporated Places' || (name === 'Census Designated Places' && !out.place)) out.place = { geoid: a.GEOID, name: a.NAME, base: a.BASENAME, ...pt };
    else if (name === 'Unified School Districts' || name === 'Elementary School Districts') out.school = out.school || { geoid: a.GEOID, name: a.NAME };
    else if (/^(\d+)(st|nd|rd|th) Congressional Districts$/.test(name)) {
      const c = parseInt(name, 10);
      out.cd = { congress: c, geoid: a.GEOID, number: cdNumber(a[`CD${c}`] ?? a.BASENAME), name: a.NAME };
    } else if (/State Legislative Districts - Upper$/.test(name)) out.sldu = { geoid: a.GEOID, code: a.SLDU, base: a.BASENAME, name: a.NAME };
    else if (/State Legislative Districts - Lower$/.test(name)) out.sldl = { geoid: a.GEOID, code: a.SLDL, base: a.BASENAME, name: a.NAME };
  }
  return out;
}

export function placeLabel(w) {
  return [w.place && w.place.name, w.county && w.county.name, w.state && w.state.name].filter(Boolean).join(', ');
}

// ---- SPARQL (Wikidata Query Service)
export function sparql(ctx, query, opts) {
  return ctx.net.get(fillUrl(ENDPOINTS.peopleSparql, { q: query }), { timeoutMs: 25000, ...opts });
}
export const sv = (b, k) => (b && b[k] ? b[k].value : '');

// ---- City -> coordinates (Open-Meteo geocoding; same service the search box uses)
export function geocodeCity(ctx, city, stateName) {
  return memo(`city:${city}|${stateName}`, 86400, async () => {
    const j = await ctx.net.get(fillUrl(ENDPOINTS.geocodeOpenMeteo, { q: city }), { timeoutMs: 10000 });
    const r = (j.results || []).find((x) => x.country_code === 'US' && (!stateName || x.admin1 === stateName));
    return r ? { lat: r.latitude, lon: r.longitude } : null;
  });
}

// ---- formatting
export const money = (v) => {
  const n = Number(v);
  if (!Number.isFinite(n)) return '—';
  const a = Math.abs(n);
  if (a >= 1e9) return `$${(n / 1e9).toFixed(1)}B`;
  if (a >= 1e6) return `$${(n / 1e6).toFixed(1)}M`;
  if (a >= 1e3) return `$${Math.round(n / 1e3)}K`;
  return `$${Math.round(n)}`;
};
export const titleCase = (s) => String(s || '').toLowerCase().replace(/\b([a-z])/g, (m) => m.toUpperCase()).replace(/\b(Llc|Inc|Lp|Llp|Na|Usa|Us|Ii|Iii|Wwtp|Emc|Fsb)\b/g, (m) => m.toUpperCase());
export const httpsOnly = (u) => (u && /^https?:\/\//i.test(u) ? u.replace(/^http:\/\//i, 'https://') : null);

// A small seeded spread so items sharing one spot (people born in the same
// town, a city-level poster) can each be tapped. Returns lat/lon offsets.
export function spread(i, baseLat, stepKm = 0.6) {
  if (i === 0) return { dLat: 0, dLon: 0 };
  const ang = i * 2.399963; // golden angle
  const km = stepKm * Math.sqrt(i);
  return { dLat: (km * Math.cos(ang)) / 111, dLon: (km * Math.sin(ang)) / (111 * Math.max(0.2, Math.cos(baseLat * Math.PI / 180))) };
}

// ---- Per-source check: await GodViewPeople.check() in the console runs each
// sub-source of this group once (selfTest only sees each layer's main fetch).
export const PROBES = [];
export function addProbe(name, run) { PROBES.push({ name, run }); }
if (typeof window !== 'undefined') {
  window.GodViewPeople = {
    async check() {
      const out = [];
      await Promise.all(PROBES.map(async (p) => {
        const t0 = Date.now();
        const rec = { via: '' };
        const ctx = { rec, test: true, net: { get: async (u, o) => { const r = await netGet(u, o); rec.via = rec.via === 'relay' ? 'relay' : r.via; return r.data; }, fillUrl } };
        try { const n = await p.run(ctx); out.push({ source: p.name, ok: true, count: n, via: rec.via || 'direct', ms: Date.now() - t0 }); } catch (e) { out.push({ source: p.name, ok: false, error: e.message, via: rec.via || null, ms: Date.now() - t0 }); }
      }));
      return out.sort((a, b) => a.source.localeCompare(b.source));
    },
  };
}
