// Satellite fire detections from the last 24 h (NASA FIRMS, VIIRS) for the area
// in view. Needs a free NASA FIRMS "map key" (Settings > API keys, name: firms).
import { ENDPOINTS } from '../config.js';
import { makePointLayer } from './lib/point-layer.js';
import { ICONS } from './lib/icons.js';
import { bbox, parseCSV } from './lib/geo.js';

export default makePointLayer({
  id: 'firms',
  name: 'Satellite fire detections',
  group: 'hazards',
  color: '#ff3b3b',
  icon: ICONS.fire,
  shape: 'point',
  size: 6,
  needsKey: 'firms',
  view: { maxKm: 4000, radiusKm: 600 },
  max: 3000,
  attribution: 'Fire detections: NASA FIRMS (VIIRS S-NPP NRT), requires a free map key',
  fetch(ctx, q) {
    const b = bbox(q.lat, q.lon, q.radiusKm);
    return ctx.net.get(ctx.net.fillUrl(ENDPOINTS.firms, { key: ctx.key('firms'), ...b }).replace(/%2C/g, ','), { type: 'text', timeoutMs: 25000 });
  },
  parse(text, ctx) {
    const rows = parseCSV(String(text));
    if (!rows.length || !rows[0].includes('latitude')) {
      if (/invalid|key/i.test(String(text).slice(0, 200))) throw new ctx.net.FeedError('FIRMS rejected the key');
      return [];
    }
    const h = rows[0];
    const ix = (k) => h.indexOf(k);
    return rows.slice(1).map((r, i) => ({
      key: `f${i}`, lat: Number(r[ix('latitude')]), lon: Number(r[ix('longitude')]),
      color: r[ix('confidence')] === 'h' ? '#ff2d2d' : '#ff8a3d',
      title: 'Satellite fire detection',
      subtitle: `${r[ix('acq_date')]} ${String(r[ix('acq_time')]).padStart(4, '0')} UTC · ${r[ix('satellite')]}`,
      rows: [['Confidence', { l: 'Low', n: 'Nominal', h: 'High' }[r[ix('confidence')]] || r[ix('confidence')]], ['Fire power', `${r[ix('frp')]} MW`], ['Day/night', r[ix('daynight')] === 'D' ? 'Day' : 'Night']],
      text: 'A hot spot seen by satellite. Can also be industrial heat sources or flares.',
    }));
  },
});
