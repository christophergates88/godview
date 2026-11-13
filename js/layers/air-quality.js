// US Air Quality Index and particulates on a 5x5 grid over the area in view
// (Open-Meteo air-quality model, CAMS data). Modelled, not station readings.
import { ENDPOINTS } from '../config.js';
import { makePointLayer } from './lib/point-layer.js';
import { ICONS } from './lib/icons.js';
import { grid } from './lib/geo.js';

const CAT = [[50, 'Good', '#3ee67a'], [100, 'Moderate', '#ffd34d'], [150, 'Unhealthy for sensitive groups', '#ff8a3d'],
  [200, 'Unhealthy', '#ff3b3b'], [300, 'Very unhealthy', '#b04dff'], [9999, 'Hazardous', '#8b1a1a']];
const cat = (v) => CAT.find(([max]) => v <= max) || CAT[CAT.length - 1];

export default makePointLayer({
  id: 'airQuality',
  name: 'Air quality (AQI)',
  group: 'weather',
  color: '#3ee67a',
  icon: ICONS.air,
  view: { maxKm: 12000, radiusKm: 1500, minGapMs: 20000 },
  attribution: 'Air quality: Open-Meteo.com air-quality API (CAMS), CC BY 4.0',
  async fetch(ctx, q) {
    const pts = grid(q.lat, q.lon, q.radiusKm, 5);
    const j = await ctx.net.get(ctx.net.fillUrl(ENDPOINTS.airQualityGrid, { lats: pts.map((p) => p.lat).join(','), lons: pts.map((p) => p.lon).join(',') }).replace(/%2C/g, ','));
    return Array.isArray(j) ? j : [j];
  },
  parse: (list) => list.map((r, i) => {
    const c = r.current || {};
    const v = c.us_aqi;
    const [, name, color] = Number.isFinite(v) ? cat(v) : [0, 'No data', '#888'];
    return {
      key: `a${i}`, lat: r.latitude, lon: r.longitude, label: Number.isFinite(v) ? String(Math.round(v)) : '?', color,
      title: `AQI ${Number.isFinite(v) ? Math.round(v) : '—'} · ${name}`,
      rows: [['US AQI', Number.isFinite(v) ? String(Math.round(v)) : '—'], ['PM2.5', c.pm2_5 != null ? `${c.pm2_5} µg/m³` : '—'], ['PM10', c.pm10 != null ? `${c.pm10} µg/m³` : '—'], ['Ozone', c.ozone != null ? `${c.ozone} µg/m³` : '—']],
      text: 'Model estimate (CAMS via Open-Meteo), not a monitoring-station reading.',
    };
  }),
});
