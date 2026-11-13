// Wave height, direction and period on a grid over the sea in view, from the
// Open-Meteo marine model. Grid points that fall on land are left out.
import { ENDPOINTS } from '../config.js';
import { makePointLayer } from './lib/point-layer.js';
import { ICONS } from './lib/icons.js';
import { grid } from './lib/geo.js';

function waveColor(m) {
  if (m < 0.5) return '#4fd1c5'; if (m < 1.25) return '#4da3ff'; if (m < 2.5) return '#ffd34d'; if (m < 4) return '#ff8a3d'; return '#ff3b3b';
}

export default makePointLayer({
  id: 'waves',
  name: 'Wave height at sea',
  group: 'sea',
  color: '#4da3ff',
  icon: ICONS.wave,
  view: { maxKm: 12000, radiusKm: 1500, minGapMs: 20000 },
  attribution: 'Waves: Open-Meteo marine forecast (CC BY 4.0)',
  async fetch(ctx, q) {
    const pts = grid(q.lat, q.lon, q.radiusKm, 6);
    const j = await ctx.net.get(ctx.net.fillUrl(ENDPOINTS.waves, { lats: pts.map((p) => p.lat.toFixed(2)).join(','), lons: pts.map((p) => p.lon.toFixed(2)).join(',') }).replace(/%2C/g, ','));
    return Array.isArray(j) ? j : [j];
  },
  parse(list, ctx) {
    const imp = ctx.settings.get('units') === 'imperial'; const out = [];
    list.forEach((r, i) => {
      const c = (r && r.current) || {}; const h = c.wave_height;
      if (!Number.isFinite(h)) return;                          // on land
      const shown = imp ? h * 3.28084 : h;
      out.push({
        key: `w${i}`, lat: r.latitude, lon: r.longitude, label: shown < 10 ? shown.toFixed(1) : String(Math.round(shown)), color: waveColor(h),
        title: `Waves ${imp ? `${shown.toFixed(1)} ft` : `${h.toFixed(1)} m`} high`,
        rows: [
          ['Wave height', imp ? `${shown.toFixed(1)} ft` : `${h.toFixed(1)} m`],
          ['Coming from', Number.isFinite(c.wave_direction) ? ctx.fmt.heading(c.wave_direction) : '—'],
          ['Time between waves', Number.isFinite(c.wave_period) ? `${c.wave_period.toFixed(0)} seconds` : '—'],
          ['Sea temperature', Number.isFinite(c.sea_surface_temperature) ? ctx.fmt.tempC(c.sea_surface_temperature) : '—'],
        ],
      });
    });
    return out;
  },
  note: (list) => (list.length ? '' : 'No open sea in view'),
  onSettingChange: (ctx, k) => k === 'units',
});
