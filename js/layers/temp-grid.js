// Current temperature and wind on a 5x5 grid over the area in view (Open-Meteo).
import { ENDPOINTS } from '../config.js';
import { makePointLayer } from './lib/point-layer.js';
import { ICONS } from './lib/icons.js';
import { grid } from './lib/geo.js';

function tempColor(c) {
  if (c == null) return '#888';
  if (c < -10) return '#7f5cff'; if (c < 0) return '#4da3ff'; if (c < 10) return '#4fd1c5';
  if (c < 20) return '#9dff7a'; if (c < 28) return '#ffd34d'; if (c < 35) return '#ff8a3d'; return '#ff3b3b';
}

export default makePointLayer({
  id: 'tempGrid',
  name: 'Temperature & wind grid',
  group: 'weather',
  color: '#ffd34d',
  icon: ICONS.thermo,
  view: { maxKm: 12000, radiusKm: 1500, minGapMs: 20000 },
  attribution: 'Temperature grid: Open-Meteo.com (CC BY 4.0)',
  async fetch(ctx, q) {
    const pts = grid(q.lat, q.lon, q.radiusKm, 5);
    const j = await ctx.net.get(ctx.net.fillUrl(ENDPOINTS.openMeteoGrid, { lats: pts.map((p) => p.lat).join(','), lons: pts.map((p) => p.lon).join(',') }).replace(/%2C/g, ','));
    return Array.isArray(j) ? j : [j];
  },
  parse: (list, ctx) => list.map((r, i) => {
    const c = r.current || {};
    const t = c.temperature_2m;
    const shown = ctx.settings.get('units') === 'imperial' ? Math.round(t * 9 / 5 + 32) : Math.round(t);
    return {
      key: `g${i}`, lat: r.latitude, lon: r.longitude, label: Number.isFinite(t) ? String(shown) : '?', color: tempColor(t),
      title: `${ctx.fmt.tempC(t)} at grid point`,
      rows: [['Temperature', ctx.fmt.tempC(t)], ['Wind', `${ctx.fmt.windKmh(c.wind_speed_10m)} from ${ctx.fmt.heading(c.wind_direction_10m)}`], ['Model time', c.time ? `${c.time} UTC` : '—']],
    };
  }),
  onSettingChange: (ctx, k) => k === 'units',
});
