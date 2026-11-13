// Internet radio stations near the view (radio-browser.info community
// directory). Tap a station and press Play (secure https streams only).
import { ENDPOINTS } from '../config.js';
import { makePointLayer } from './lib/point-layer.js';
import { ICONS } from './lib/icons.js';

export default makePointLayer({
  id: 'radio',
  name: 'Radio stations',
  group: 'signals',
  color: '#ff7ad9',
  icon: ICONS.radio,
  shape: 'point',
  size: 7,
  view: { maxKm: 3000, radiusKm: 200 },
  attribution: 'Radio stations: radio-browser.info community directory (public domain data); streams belong to the stations',
  fetch: (ctx, q) => ctx.net.get(ctx.net.fillUrl(ENDPOINTS.radio, { lat: q.lat.toFixed(3), lon: q.lon.toFixed(3), m: Math.round(q.radiusKm * 1000) }), { timeoutMs: 20000 }),
  parse(list) {
    const seen = new Map();
    return (Array.isArray(list) ? list : []).filter((s) => s.geo_lat != null).map((s) => {
      // Stations in the same city share coordinates: spread them a little.
      let lat = Number(s.geo_lat); let lon = Number(s.geo_long);
      const k = `${lat.toFixed(2)},${lon.toFixed(2)}`;
      const n = seen.get(k) || 0; seen.set(k, n + 1);
      if (n) { lat += 0.01 * Math.sqrt(n) * Math.cos(n * 2.4); lon += 0.01 * Math.sqrt(n) * Math.sin(n * 2.4); }
      const url = String(s.url_resolved || s.url || '');
      return {
        key: s.stationuuid, lat, lon,
        title: (s.name || 'Radio station').trim(),
        subtitle: [s.state, s.country].filter(Boolean).join(', '),
        rows: [['Tags', (s.tags || '').split(',').slice(0, 4).join(', ') || '—'], ['Language', s.language || '—'], ['Format', [s.codec, s.bitrate ? `${s.bitrate} kbps` : ''].filter(Boolean).join(' · ') || '—']],
        audio: url.startsWith('https://') ? url : null,
        text: url.startsWith('https://') ? '' : 'This station only streams over insecure http, which browsers block on a secure page.',
        link: s.homepage && /^https?:/.test(s.homepage) ? { href: s.homepage, text: 'Station website' } : null,
      };
    });
  },
});
