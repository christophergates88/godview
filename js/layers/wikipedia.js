// Wikipedia articles about places near the view centre (within 10 km, the API's
// limit). Tap one for a summary.
import { ENDPOINTS } from '../config.js';
import { makePointLayer } from './lib/point-layer.js';
import { ICONS } from './lib/icons.js';

export default makePointLayer({
  id: 'wikipedia',
  name: 'Wikipedia nearby',
  group: 'signals',
  color: '#e8edf2',
  icon: ICONS.book,
  label: 'W',
  view: { maxKm: 400, radiusKm: 10, minGapMs: 5000 },
  attribution: 'Articles: Wikipedia (CC BY-SA 4.0), via the MediaWiki API',
  fetch: (ctx, q) => ctx.net.get(ctx.net.fillUrl(ENDPOINTS.wikipedia, { lat: q.lat.toFixed(4), lon: q.lon.toFixed(4) }).replace(/%7C/gi, '%7C')),
  parse: (j) => ((j.query && j.query.geosearch) || []).map((a) => ({
    key: String(a.pageid), lat: a.lat, lon: a.lon, title: a.title, subtitle: 'Wikipedia',
    rows: [['Distance from centre', `${(a.dist / 1000).toFixed(1)} km`]],
    link: { href: `https://en.wikipedia.org/?curid=${a.pageid}`, text: 'Read on Wikipedia' },
  })),
  note: () => 'Within 10 km of the view centre',
  async details(it, ctx) {
    const s = await ctx.net.get(ctx.net.fillUrl(ENDPOINTS.wikiSummary, { title: it.title.replace(/ /g, '_') }));
    return { text: s.extract || '', image: s.thumbnail?.source || null };
  },
});
