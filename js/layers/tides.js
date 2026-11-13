// NOAA tide and water-level stations (CO-OPS). Tap a station to load its
// latest reading and today's predicted highs and lows.
import { ENDPOINTS } from '../config.js';
import { makePointLayer } from './lib/point-layer.js';
import { ICONS } from './lib/icons.js';

const m = (ctx, v) => (Number.isFinite(v) ? (ctx.settings.get('units') === 'imperial' ? `${(v * 3.28084).toFixed(2)} ft` : `${v.toFixed(2)} m`) : '—');

export default makePointLayer({
  id: 'tides',
  name: 'Tides & water levels',
  group: 'sea',
  color: '#4fd1c5',
  icon: ICONS.wave,
  label: 'T',
  attribution: 'Tides and water levels: NOAA Center for Operational Oceanographic Products and Services (CO-OPS)',
  async fetch(ctx) {
    const hit = ctx.net.cache.get('tideStations', 86400);
    if (hit) { ctx.rec.via = 'direct'; return hit.data; }
    const j = await ctx.net.get(ENDPOINTS.tideStations, { timeoutMs: 25000 });
    const slim = { stations: (j.stations || []).map((s) => ({ id: s.id, name: s.name, state: s.state, lat: s.lat, lng: s.lng })) };
    if (!ctx.test) ctx.net.cache.set('tideStations', slim);
    return slim;
  },
  parse: (j) => (j.stations || []).map((s) => ({
    key: s.id, lat: Number(s.lat), lon: Number(s.lng),
    title: s.name, subtitle: `NOAA station ${s.id}${s.state ? ' · ' + s.state : ''}`,
    rows: [['Station', s.id]],
    link: { href: `https://tidesandcurrents.noaa.gov/stationhome.html?id=${s.id}`, text: 'NOAA station page' },
  })),
  async details(it, ctx) {
    const rows = [];
    try {
      const wl = await ctx.net.get(ctx.net.fillUrl(ENDPOINTS.tideData, { id: it.key, product: 'water_level', date: 'latest' }));
      const d = wl.data && wl.data[0];
      if (d) rows.push(['Water level now', `${m(ctx, Number(d.v))} above MLLW`], ['Reading time', `${d.t} UTC`]);
    } catch { rows.push(['Water level now', 'Not available']); }
    try {
      const url = ctx.net.fillUrl(ENDPOINTS.tideData, { id: it.key, product: 'predictions', date: 'today' }) + '&interval=hilo';
      const p = await ctx.net.get(url);
      for (const x of (p.predictions || []).slice(0, 4)) rows.push([x.type === 'H' ? 'High tide' : 'Low tide', `${x.t} UTC · ${m(ctx, Number(x.v))}`]);
    } catch { /* some stations have no predictions */ }
    return rows;
  },
});
