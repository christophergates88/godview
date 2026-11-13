// "Missing children (NCMEC)": official public appeals only. The National Center
// for Missing & Exploited Children publishes an RSS feed per state of the
// children on its posters. GodView shows exactly what the feed carries (the
// poster's own words and photo) and links to the official poster; it adds
// nothing. Each poster is placed at the town it names ("Missing From ...").
// These are not AMBER Alerts (NCMEC has no open AMBER feed).
import { ENDPOINTS } from '../config.js';
import { makePointLayer } from './lib/point-layer.js';
import { whereIs, geocodeCity, spread, httpsOnly, STATES, addProbe } from './lib/people.js';

const icon = '<svg viewBox="0 0 24 24"><path d="M12 12a4 4 0 1 0 0-8 4 4 0 0 0 0 8zM5 21c0-4 3-7 7-7s7 3 7 7M18 2v5M20.5 4.5h-5" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>';

const ENT = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ' };
const decode = (s) => String(s || '').replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, '$1')
  .replace(/&(#x[0-9a-f]+|#\d+|\w+);/gi, (m, e) => (e[0] === '#' ? String.fromCodePoint(e[1] === 'x' || e[1] === 'X' ? parseInt(e.slice(2), 16) : parseInt(e.slice(1), 10)) : ENT[e.toLowerCase()] ?? m))
  .replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
const tag = (x, t) => { const m = new RegExp(`<${t}[^>]*>([\\s\\S]*?)</${t}>`, 'i').exec(x); return m ? decode(m[1]) : ''; };

// RSS text -> [{ title, link, text, image, pubDate, city, st }]
export function parseNcmec(xml) {
  const out = [];
  for (const m of String(xml || '').matchAll(/<item[\s>]([\s\S]*?)<\/item>/gi)) {
    const x = m[1];
    const text = tag(x, 'description');
    const enc = /<enclosure[^>]*url="([^"]+)"/i.exec(x);
    const from = /Missing From\s+(.+?),\s*([A-Z]{2})\b/i.exec(text);
    out.push({
      title: tag(x, 'title'), link: httpsOnly(tag(x, 'link') || tag(x, 'guid')), text,
      image: enc ? httpsOnly(decode(enc[1])) : null, pubDate: tag(x, 'pubDate'),
      city: from ? from[1].trim() : null, st: from ? from[2].toUpperCase() : null,
    });
  }
  return out;
}

async function placeAll(ctx, list, stateName) {
  const cities = [...new Set(list.map((p) => p.city).filter(Boolean))].slice(0, 40);
  const at = new Map();
  for (let i = 0; i < cities.length; i += 5) {
    await Promise.all(cities.slice(i, i + 5).map(async (c) => { try { at.set(c, await geocodeCity(ctx, titleWords(c), stateName)); } catch { at.set(c, null); } }));
  }
  return at;
}
const titleWords = (s) => s.toLowerCase().replace(/\b[a-z]/g, (m) => m.toUpperCase());

export default makePointLayer({
  id: 'peopleMissing',
  name: 'Missing children (NCMEC)',
  group: 'people',
  color: '#ff4d5e',
  icon,
  label: '!',
  heightM: 300,
  view: { maxKm: 3000, radiusKm: 400, minGapMs: 30000 },
  attribution: 'Missing children: National Center for Missing & Exploited Children (NCMEC) official state RSS feeds and posters, shown as published',
  async fetch(ctx, q) {
    const w = await whereIs(ctx, q.lat, q.lon);
    const xml = await ctx.net.get(ctx.net.fillUrl(ENDPOINTS.peopleNcmec, { st: w.state.abbr }), { type: 'text', timeoutMs: 25000 });
    const list = parseNcmec(xml);
    const at = await placeAll(ctx, list, w.state.name);
    return { st: w.state.abbr, list, at: Object.fromEntries(at) };
  },
  parse: (raw) => {
    const n = new Map();
    return raw.list.map((p, idx) => {
      const c = p.city && raw.at[p.city];
      if (!c) return null;
      const i = n.get(p.city) || 0; n.set(p.city, i + 1);
      const d = spread(i, c.lat, 0.8);
      return {
        key: p.link || `${raw.st}${idx}`, lat: c.lat + d.dLat, lon: c.lon + d.dLon,
        title: p.title, subtitle: 'Official NCMEC poster', text: p.text, image: p.image,
        rows: [['Source', 'National Center for Missing & Exploited Children']],
        link: p.link ? { href: p.link, text: 'Official poster' } : null,
      };
    }).filter(Boolean);
  },
  note: (items, raw) => {
    const off = raw.list.length - items.length;
    return `${STATES[Object.keys(STATES).find((k) => STATES[k][0] === raw.st)]?.[1] || raw.st} feed${off > 0 ? ` · ${off} not placed on the map` : ''}`;
  },
});

addProbe('NCMEC RSS (GA)', async (ctx) => parseNcmec(await ctx.net.get(ctx.net.fillUrl(ENDPOINTS.peopleNcmec, { st: 'GA' }), { type: 'text', timeoutMs: 25000 })).length);
