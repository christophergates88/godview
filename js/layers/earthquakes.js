// Earthquakes from the USGS real-time GeoJSON feeds (keyless, updated every minute).

import { ENDPOINTS, COLORS } from '../config.js';

const quakes = new Map();
let points = null;
let selectedKey = null;

function ageColor(Cesium, ageH) {
  if (ageH < 1) return Cesium.Color.fromCssColorString('#ff2d2d');
  if (ageH < 24) return Cesium.Color.fromCssColorString(COLORS.quakes);
  return Cesium.Color.fromCssColorString('#ffb347').withAlpha(0.85);
}

export default {
  id: 'earthquakes',
  name: 'Earthquakes',
  color: COLORS.quakes,
  icon: '<svg viewBox="0 0 24 24"><path d="M2 12h4l2-6 4 12 3-9 2 3h5" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"/></svg>',
  attribution: 'Earthquakes: U.S. Geological Survey (USGS) Earthquake Hazards Program',
  group: 'hazards',
  defaultOn: true,

  init(ctx) {
    points = ctx.primitives.add(new ctx.Cesium.PointPrimitiveCollection());
  },

  async fetch(ctx) {
    const feed = ctx.settings.get('quakeFeed') || '2.5_day';
    return ctx.net.get(ctx.net.fillUrl(ENDPOINTS.earthquakes, { feed }));
  },

  count(ctx, data) { return (data.features || []).length; },

  items() {
    return [...quakes.entries()].map(([key, q]) => ({ key, lat: q.lat, lon: q.lon, title: `M${q.mag != null ? q.mag.toFixed(1) : '?'} ${q.place || ''}`.trim(), mag: q.mag, time: q.time }));
  },

  render(ctx, data) {
    const { Cesium } = ctx;
    if (!data || !Array.isArray(data.features)) throw new ctx.net.FeedError('Unexpected data from USGS');
    points.removeAll();
    quakes.clear();
    const now = Date.now();
    for (const f of data.features) {
      const g = f.geometry;
      if (!g || !Array.isArray(g.coordinates)) continue;
      const [lon, lat, depth] = g.coordinates;
      const p = f.properties || {};
      const mag = Number(p.mag) || 0;
      const key = String(f.id);
      quakes.set(key, { lon, lat, depth, ...p });
      const ageH = (now - (p.time || now)) / 3.6e6;
      points.add({
        id: { layer: 'earthquakes', key },
        position: Cesium.Cartesian3.fromDegrees(lon, lat, 2000),
        pixelSize: Math.max(5, 4 + mag * 2.6),
        color: ageColor(Cesium, ageH),
        outlineColor: Cesium.Color.BLACK.withAlpha(0.7),
        outlineWidth: 1.5,
        scaleByDistance: new Cesium.NearFarScalar(2e5, 1.4, 2e7, 0.7),
      });
    }
    ctx.setNote(data.metadata && data.metadata.title ? data.metadata.title.replace('USGS ', '') : '');
    return quakes.size;
  },

  describe(ctx, key) {
    const q = quakes.get(key);
    if (!q) return null;
    const f = ctx.fmt;
    const rows = [
      ['Magnitude', `${q.mag != null ? q.mag.toFixed(1) : '—'} ${q.magType || ''}`.trim()],
      ['Depth', f.depthKm(q.depth)],
      ['Time', `${f.time(q.time)} (${f.ago(q.time)})`],
      ['Location', f.latlon(q.lat, q.lon)],
    ];
    if (q.felt) rows.push(['Felt reports', String(q.felt)]);
    if (q.alert) rows.push(['PAGER alert', q.alert]);
    if (q.tsunami) rows.push(['Tsunami', 'Flag set (check official sources)']);
    rows.push(['Status', q.status || '—']);
    return {
      title: `M${q.mag != null ? q.mag.toFixed(1) : '?'} earthquake`,
      subtitle: q.place || '',
      rows,
      link: q.url ? { href: q.url, text: 'USGS event page' } : null,
    };
  },

  position(ctx, key) {
    const q = quakes.get(key);
    return q ? ctx.Cesium.Cartesian3.fromDegrees(q.lon, q.lat, 0) : undefined;
  },

  onSettingChange(ctx, k) { return k === 'quakeFeed'; },

  onSelect(ctx, key) {
    selectedKey = key;
    if (!points) return;
    for (let i = 0; i < points.length; i++) {
      const p = points.get(i);
      p.outlineColor = p.id.key === selectedKey ? ctx.Cesium.Color.WHITE : ctx.Cesium.Color.BLACK.withAlpha(0.7);
      p.outlineWidth = p.id.key === selectedKey ? 3 : 1.5;
    }
  },
};
