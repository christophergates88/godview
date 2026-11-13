// Aurora forecast (NOAA SWPC OVATION model, ~30-90 minute outlook) plus the
// latest planetary Kp index. Each dot is a 1°x1° cell with aurora probability.
import { ENDPOINTS } from '../config.js';
import { makePointLayer } from './lib/point-layer.js';
import { ICONS } from './lib/icons.js';

const MIN = 10; // percent; lower values are not drawn

export default makePointLayer({
  id: 'aurora',
  name: 'Aurora forecast',
  group: 'space',
  color: '#3ee67a',
  icon: ICONS.aurora,
  shape: 'point',
  size: 4,
  heightM: 100000,
  max: 6000,
  attribution: 'Aurora and Kp: NOAA Space Weather Prediction Center (SWPC), OVATION model',
  async fetch(ctx) {
    const ov = await ctx.net.get(ENDPOINTS.aurora, { timeoutMs: 20000 });
    let kp = null;
    try { kp = await ctx.net.get(ENDPOINTS.kp); } catch { kp = null; }
    return { ov, kp };
  },
  parse({ ov }) {
    const out = [];
    for (const c of (ov && ov.coordinates) || []) {
      const [lon360, lat, v] = c;
      if (v < MIN) continue;
      const lon = lon360 > 180 ? lon360 - 360 : lon360;
      const a = Math.min(1, 0.25 + v / 60);
      out.push({
        key: `${lon360},${lat}`, lat, lon, size: v > 50 ? 6 : 4,
        color: `rgba(${v > 50 ? '255,80,160' : '62,230,122'},${a.toFixed(2)})`,
        title: `Aurora probability ${v}%`,
        subtitle: `Forecast for ${ov['Forecast Time'] || 'the next hour'}`,
        rows: [['Probability', `${v}%`], ['Model', 'OVATION Prime (SWPC)']],
        link: { href: 'https://www.swpc.noaa.gov/products/aurora-30-minute-forecast', text: 'SWPC aurora forecast' },
      });
    }
    return out;
  },
  note(list, raw) {
    const kp = latestKp(raw.kp);
    return kp != null ? `Kp now ${kp}${kp >= 5 ? ' (geomagnetic storm)' : ''}` : '';
  },
});

export function latestKp(kp) {
  if (!Array.isArray(kp) || !kp.length) return null;
  const last = kp[kp.length - 1];
  const v = Array.isArray(last) ? Number(last[1]) : Number(last.Kp ?? last.kp ?? last.kp_index);
  return Number.isFinite(v) ? Math.round(v * 10) / 10 : null;
}
