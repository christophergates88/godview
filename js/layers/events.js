// Natural events (wildfires, storms, volcanoes, ...) from NASA EONET v3 (keyless).
// NASA notes EONET is for general reference, not an official source.

import { ENDPOINTS, COLORS } from '../config.js';

const CATS = {
  wildfires: { label: 'F', color: COLORS.fire, name: 'Wildfire' },
  severeStorms: { label: 'S', color: '#5ab0ff', name: 'Severe storm' },
  volcanoes: { label: 'V', color: '#ff3b3b', name: 'Volcano' },
  seaLakeIce: { label: 'I', color: '#bfefff', name: 'Sea / lake ice' },
  floods: { label: 'W', color: '#3d7bff', name: 'Flood' },
  drought: { label: 'D', color: '#d9a441', name: 'Drought' },
  dustHaze: { label: 'H', color: '#c9b28a', name: 'Dust / haze' },
  earthquakes: { label: 'Q', color: COLORS.quakes, name: 'Earthquake' },
  landslides: { label: 'L', color: '#a0785a', name: 'Landslide' },
  manmade: { label: 'M', color: '#b0b0b0', name: 'Manmade' },
  snow: { label: '*', color: '#ffffff', name: 'Snow' },
  tempExtremes: { label: 'T', color: '#ff8fb1', name: 'Temperature extreme' },
  waterColor: { label: 'C', color: '#4fd1c5', name: 'Water colour' },
};
const DEFAULT_CAT = { label: '•', color: COLORS.event, name: 'Event' };

const events = new Map();
let billboards = null;

function lastPoint(geoms) {
  // Use the most recent geometry. Polygons are reduced to their centre.
  for (let i = geoms.length - 1; i >= 0; i--) {
    const g = geoms[i];
    if (!g || !g.coordinates) continue;
    if (g.type === 'Point') return { lon: g.coordinates[0], lat: g.coordinates[1], g };
    if (g.type === 'Polygon' && g.coordinates[0] && g.coordinates[0].length) {
      const ring = g.coordinates[0];
      const lon = ring.reduce((a, c) => a + c[0], 0) / ring.length;
      const lat = ring.reduce((a, c) => a + c[1], 0) / ring.length;
      return { lon, lat, g };
    }
  }
  return null;
}

export default {
  id: 'events',
  name: 'Fires & events',
  color: COLORS.fire,
  icon: '<svg viewBox="0 0 24 24"><path d="M12 2c1 4 5 5.5 5 11a5 5 0 0 1-10 0c0-2.4 1.2-4 2.5-5 0 2 .8 3 2 3.5C11 9 11 5 12 2z" fill="currentColor"/></svg>',
  attribution: 'Natural events: NASA Earth Observatory Natural Event Tracker (EONET)',
  group: 'hazards',
  defaultOn: true,

  init(ctx) {
    billboards = ctx.primitives.add(new ctx.Cesium.BillboardCollection());
  },

  async fetch(ctx) {
    const days = Math.max(1, Math.min(365, Number(ctx.settings.get('eventDays')) || 30));
    return ctx.net.get(ctx.net.fillUrl(ENDPOINTS.eonet, { days }), { timeoutMs: 25000 });
  },

  count(ctx, data) { return (data.events || []).length; },

  items() {
    return [...events.entries()].map(([key, e]) => ({ key, lat: e.lat, lon: e.lon, title: e.title, kind: e.cat.name }));
  },

  render(ctx, data) {
    const { Cesium } = ctx;
    if (!data || !Array.isArray(data.events)) throw new ctx.net.FeedError('Unexpected data from EONET');
    billboards.removeAll();
    events.clear();
    for (const ev of data.events) {
      const p = lastPoint(ev.geometry || []);
      if (!p) continue;
      const catId = ev.categories && ev.categories[0] && ev.categories[0].id;
      const cat = CATS[catId] || DEFAULT_CAT;
      const key = String(ev.id);
      events.set(key, { ...ev, lat: p.lat, lon: p.lon, last: p.g, cat });
      billboards.add({
        id: { layer: 'events', key },
        position: Cesium.Cartesian3.fromDegrees(p.lon, p.lat, 1500),
        image: ctx.globe.makeIcon('badge', cat.color, 28, cat.label),
        scale: 0.8,
        scaleByDistance: new Cesium.NearFarScalar(2e5, 1.2, 2e7, 0.55),
      });
    }
    return events.size;
  },

  describe(ctx, key) {
    const e = events.get(key);
    if (!e) return null;
    const f = ctx.fmt;
    const first = (e.geometry || [])[0];
    const rows = [
      ['Type', (e.categories || []).map((c) => c.title).join(', ') || e.cat.name],
      ['Latest report', e.last && e.last.date ? `${f.time(Date.parse(e.last.date))} (${f.ago(Date.parse(e.last.date))})` : '—'],
      ['First seen', first && first.date ? f.time(Date.parse(first.date)) : '—'],
      ['Location', f.latlon(e.lat, e.lon)],
    ];
    if (e.last && e.last.magnitudeValue != null) rows.push(['Size', `${e.last.magnitudeValue} ${e.last.magnitudeUnit || ''}`.trim()]);
    if (e.sources && e.sources.length) rows.push(['Sources', e.sources.map((s) => s.id).join(', ')]);
    const src = e.sources && e.sources.find((s) => s.url);
    return {
      title: e.title,
      subtitle: 'NASA EONET · open event',
      rows,
      link: src ? { href: src.url, text: `Source: ${src.id}` } : (e.link ? { href: e.link, text: 'EONET record' } : null),
    };
  },

  position(ctx, key) {
    const e = events.get(key);
    return e ? ctx.Cesium.Cartesian3.fromDegrees(e.lon, e.lat, 0) : undefined;
  },

  onSettingChange(ctx, k) { return k === 'eventDays'; },
};
