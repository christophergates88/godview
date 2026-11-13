// High-voltage power lines in view (US), coloured by voltage, from the federal
// HIFLD transmission-line map. Tap a line for its voltage, owner and the
// substations it runs between.
import { ENDPOINTS } from '../config.js';
import { makeShapeLayer } from './lib/shape-layer.js';
import { ICONS } from './lib/icons.js';
import { bbox } from './lib/geo.js';

function volts(v) {
  if (!(v > 0)) return ['#8b97a5', 'Voltage not listed'];
  if (v >= 500) return ['#ff4d5e', `${v} kV (extra high)`];
  if (v >= 300) return ['#ff8a3d', `${v} kV (very high)`];
  if (v >= 200) return ['#ffd34d', `${v} kV (high)`];
  if (v >= 100) return ['#7fd8ff', `${v} kV`];
  return ['#b8c2cc', `${v} kV (sub-transmission)`];
}
const tidy = (s) => (!s || /^(NOT AVAILABLE|UNKNOWN\d*|TAP\d+)$/i.test(s) ? null : String(s).toLowerCase().replace(/\b[a-z]/g, (c) => c.toUpperCase()));

export default makeShapeLayer({
  id: 'powerLines',
  name: 'High-voltage power lines (US)',
  group: 'ground',
  color: '#ffd34d',
  icon: ICONS.bolt,
  max: 500,
  view: { maxKm: 500, radiusKm: 60 },   // the federal server is slow: a smaller area answers in a few seconds
  attribution: 'Power lines: Homeland Infrastructure Foundation-Level Data (HIFLD), Electric Power Transmission Lines',
  fetch(ctx, q) {
    const b = bbox(q.lat, q.lon, q.radiusKm); const r = (v) => Number(v).toFixed(3);
    return ctx.net.get(ctx.net.fillUrl(ENDPOINTS.powerLines, { w: r(b.w), s: r(b.s), e: r(b.e), n: r(b.n) }), { timeoutMs: 25000 });
  },
  parse(j) {
    const out = [];
    for (const f of (j && j.features) || []) {
      const g = f.geometry; const p = f.properties || {}; if (!g) continue;
      const lines = g.type === 'LineString' ? [g.coordinates] : g.type === 'MultiLineString' ? g.coordinates : null;
      if (!lines || !lines.length || !lines[0].length) continue;
      const [color, vtext] = volts(Number(p.VOLTAGE)); const mid = lines[0][Math.floor(lines[0].length / 2)];
      const a = tidy(p.SUB_1); const b = tidy(p.SUB_2); const owner = tidy(p.OWNER);
      out.push({
        key: String(f.id ?? `${mid[0]},${mid[1]}`), lines, color, alpha: 0.9, lat: mid[1], lon: mid[0],
        title: `${Number(p.VOLTAGE) > 0 ? `${p.VOLTAGE} kV ` : ''}power line`,
        subtitle: owner || 'Owner not listed',
        rows: [
          ['Voltage', vtext],
          ...(a || b ? [['Runs between', [a, b].filter(Boolean).join(' and ')]] : []),
          ...(p.TYPE ? [['Kind', String(p.TYPE).toLowerCase().replace('ac;', 'AC,').replace('dc;', 'DC,')]] : []),
          ...(p.STATUS ? [['Status', String(p.STATUS).toLowerCase()]] : []),
        ],
      });
    }
    return out;
  },
  note: (list, raw) => (raw && raw.properties && raw.properties.exceededTransferLimit ? 'Showing the first 500 lines in view. Zoom in to see all of them.' : 'Red 500 kV and up · orange 300s · yellow 200s · blue 100s'),
});
