// "Notable people from here": public figures BORN in places within the view,
// from Wikidata, limited to people who have an English Wikipedia article.
// Birthplace only (a public fact in their article); never where anyone lives now.
// People born in the same town are fanned out around it so each can be tapped.
import { ENDPOINTS } from '../config.js';
import { makePointLayer } from './lib/point-layer.js';
import { sparql, sv, spread, httpsOnly, addProbe } from './lib/people.js';

const icon = '<svg viewBox="0 0 24 24"><path d="M12 12a4 4 0 1 0 0-8 4 4 0 0 0 0 8zM4 21c0-4 3.6-7 8-7s8 3 8 7M18 3l1 2 2 .3-1.5 1.4.4 2.1L18 7.8l-1.9 1 .4-2.1L15 5.3l2-.3z" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>';

export function notableQuery(lat, lon, km, limit = 300) {
  return `SELECT ?p ?pLabel ?pDescription ?placeLabel ?born ?died ?img ?article ?lat ?lon WHERE {
 SERVICE wikibase:around { ?place wdt:P625 ?loc. bd:serviceParam wikibase:center "Point(${lon.toFixed(4)} ${lat.toFixed(4)})"^^geo:wktLiteral. bd:serviceParam wikibase:radius "${Math.round(km)}". }
 ?p wdt:P19 ?place; wdt:P31 wd:Q5.
 ?article schema:about ?p; schema:isPartOf <https://en.wikipedia.org/>.
 OPTIONAL { ?p wdt:P569 ?born } OPTIONAL { ?p wdt:P570 ?died } OPTIONAL { ?p wdt:P18 ?img }
 BIND(geof:latitude(?loc) AS ?lat) BIND(geof:longitude(?loc) AS ?lon)
 SERVICE wikibase:label { bd:serviceParam wikibase:language "en". }
} LIMIT ${limit}`;
}

const year = (s) => { const m = /^(-?\d{1,4})-/.exec(s || ''); return m ? (m[1].startsWith('-') ? `${m[1].slice(1)} BC` : String(Number(m[1]))) : ''; };

export function parseNotable(j) {
  const seen = new Set();
  const byPlace = new Map();
  const out = [];
  for (const b of (j && j.results && j.results.bindings) || []) {
    const id = sv(b, 'p').split('/').pop();
    const lat = Number(sv(b, 'lat')); const lon = Number(sv(b, 'lon'));
    if (!id || seen.has(id) || !Number.isFinite(lat)) continue;
    seen.add(id);
    const pk = `${lat.toFixed(3)},${lon.toFixed(3)}`;
    const i = byPlace.get(pk) || 0; byPlace.set(pk, i + 1);
    const d = spread(i, lat, 0.5);
    const born = year(sv(b, 'born')); const died = year(sv(b, 'died'));
    const article = httpsOnly(sv(b, 'article'));
    const img = httpsOnly(sv(b, 'img'));
    out.push({
      key: id, lat: lat + d.dLat, lon: lon + d.dLon,
      title: sv(b, 'pLabel'), subtitle: sv(b, 'pDescription') || 'Public figure',
      rows: [['Born in', sv(b, 'placeLabel') || '—'], ['Lived', born ? `${born}–${died || ''}` : '—']],
      image: img ? `${img}?width=480` : null,
      link: article ? { href: article, text: 'Read on Wikipedia' } : null,
      article: article ? decodeURIComponent(article.split('/wiki/')[1] || '') : '',
    });
  }
  return out;
}

export default makePointLayer({
  id: 'peopleNotable',
  name: 'Notable people born here',
  group: 'people',
  color: '#c8a2ff',
  icon,
  shape: 'point',
  size: 8,
  heightM: 200,
  max: 400,
  view: { maxKm: 800, radiusKm: 60, minGapMs: 10000 },
  attribution: 'Notable people: Wikidata (CC0) and Wikipedia (CC BY-SA 4.0); people with an English Wikipedia article, shown at their birthplace',
  fetch: (ctx, q) => sparql(ctx, notableQuery(q.lat, q.lon, Math.max(5, q.radiusKm))),
  parse: (j) => parseNotable(j),
  note: () => 'Shown around their birthplace',
  async details(it, ctx) {
    if (!it.article) return null;
    const s = await ctx.net.get(ctx.net.fillUrl(ENDPOINTS.wikiSummary, { title: it.article.replace(/ /g, '_') }));
    return { text: s.extract || '', image: (s.thumbnail && s.thumbnail.source) || it.image || null };
  },
});

addProbe('Wikidata (notable people near Macon)', async (ctx) => parseNotable(await sparql(ctx, notableQuery(32.84, -83.63, 20, 20))).length);
