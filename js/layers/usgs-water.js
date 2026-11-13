// Stream and lake gauges in view, live from the US Geological Survey: water level,
// flow, lake height and water temperature, usually updated every 15 minutes.
import { ENDPOINTS } from '../config.js';
import { makePointLayer } from './lib/point-layer.js';
import { ICONS } from './lib/icons.js';
import { bbox } from './lib/geo.js';

const nice = (s) => String(s || '').toLowerCase().replace(/(^|[\s(/-])([a-z])/g, (m, a, b) => a + b.toUpperCase())
  .replace(/, ([a-z]{2})\.?$/i, (m, st) => `, ${st.toUpperCase()}`).replace(/\b(Near|At|Below|Above|Of|And|The)\b/g, (w) => w.toLowerCase());

export default makePointLayer({
  id: 'usgsWater',
  name: 'Stream and lake gauges, live (USGS)',
  group: 'hazards',
  color: '#3ee6c4',
  icon: ICONS.river,
  shape: 'point',
  size: 7,
  view: { maxKm: 500, radiusKm: 70 },
  attribution: 'Water gauges: US Geological Survey, National Water Information System',
  fetch(ctx, q) {
    const b = bbox(q.lat, q.lon, q.radiusKm); const r = (v) => Number(v).toFixed(4);
    return ctx.net.get(ctx.net.fillUrl(ENDPOINTS.usgsWater, { w: r(b.w), s: r(b.s), e: r(b.e), n: r(b.n) }), { timeoutMs: 30000 });
  },
  parse(j, ctx) {
    const metric = ctx.settings.get('units') !== 'imperial'; const sites = new Map();
    for (const ts of (j && j.value && j.value.timeSeries) || []) {
      const src = ts.sourceInfo || {}; const code = src.siteCode && src.siteCode[0] && src.siteCode[0].value;
      const geo = src.geoLocation && src.geoLocation.geogLocation; const vc = ts.variable && ts.variable.variableCode && ts.variable.variableCode[0] && ts.variable.variableCode[0].value;
      const vals = ts.values && ts.values[0] && ts.values[0].value; const last = vals && vals[vals.length - 1];
      if (!code || !geo || !last) continue;
      const v = Number(last.value); if (!Number.isFinite(v) || v === ts.variable.noDataValue) continue;
      const s = sites.get(code) || { code, name: nice(src.siteName), lat: geo.latitude, lon: geo.longitude, rows: [], lake: false, at: 0 };
      const t = Date.parse(last.dateTime); if (t > s.at) s.at = t;
      if (vc === '00065') s.rows.push(['Water level on the gauge', metric ? `${(v * 0.3048).toFixed(2)} m` : `${v.toFixed(2)} ft`]);
      else if (vc === '00060') s.rows.push(['Flow', metric ? `${(v * 0.0283168).toFixed(v < 100 ? 2 : 0)} cubic m/s` : `${v.toLocaleString()} cubic ft/s`]);
      else if (vc === '62614' || vc === '62615') { s.lake = true; s.rows.push(['Lake surface height', metric ? `${(v * 0.3048).toFixed(2)} m above sea level` : `${v.toFixed(2)} ft above sea level`]); }
      else if (vc === '00010') s.rows.push(['Water temperature', ctx.fmt.tempC(v)]);
      sites.set(code, s);
    }
    return Array.from(sites.values()).filter((s) => s.rows.length).map((s) => ({
      key: s.code, lat: s.lat, lon: s.lon, color: s.lake ? '#4da3ff' : '#3ee6c4',
      title: s.name, subtitle: `${s.lake ? 'Lake gauge' : 'Stream gauge'} · read ${ctx.fmt.ago(s.at)}`,
      rows: s.rows,
      link: { href: `https://waterdata.usgs.gov/monitoring-location/${encodeURIComponent(s.code)}/`, text: 'USGS page with charts' },
    }));
  },
  onSettingChange: (ctx, k) => k === 'units',
});
