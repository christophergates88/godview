// Day/night line (terminator) plus the points on Earth directly under the Sun
// and the Moon. Computed in the browser from the clock; no network.
// Accuracy: roughly 0.1-0.5° (simplified astronomical formulas), fine for a map.
import { ICONS } from './lib/icons.js';

const D2R = Math.PI / 180;
const R2D = 180 / Math.PI;

function jd(date) { return date.getTime() / 86400000 + 2440587.5; }
function gmstDeg(date) {
  const d = jd(date) - 2451545.0;
  return ((280.46061837 + 360.98564736629 * d) % 360 + 360) % 360;
}
function subPoint(raDeg, decDeg, date) {
  let lon = raDeg - gmstDeg(date);
  lon = ((lon + 540) % 360) - 180;
  return { lat: decDeg, lon };
}
function eqFromEcl(lonDeg, latDeg, d) {
  const e = (23.439 - 0.0000004 * d) * D2R;
  const l = lonDeg * D2R; const b = latDeg * D2R;
  const ra = Math.atan2(Math.sin(l) * Math.cos(e) - Math.tan(b) * Math.sin(e), Math.cos(l));
  const dec = Math.asin(Math.sin(b) * Math.cos(e) + Math.cos(b) * Math.sin(e) * Math.sin(l));
  return { ra: (ra * R2D + 360) % 360, dec: dec * R2D };
}
export function sunPosition(date) {
  const d = jd(date) - 2451545.0;
  const g = (357.529 + 0.98560028 * d) * D2R;
  const q = 280.459 + 0.98564736 * d;
  const L = q + 1.915 * Math.sin(g) + 0.020 * Math.sin(2 * g);
  const { ra, dec } = eqFromEcl(L, 0, d);
  return { ...subPoint(ra, dec, date), eclLon: ((L % 360) + 360) % 360 };
}
export function moonPosition(date) {
  const d = jd(date) - 2451545.0;
  const L = 218.316 + 13.176396 * d;
  const M = (134.963 + 13.064993 * d) * D2R;
  const F = (93.272 + 13.229350 * d) * D2R;
  const lon = L + 6.289 * Math.sin(M);
  const lat = 5.128 * Math.sin(F);
  const { ra, dec } = eqFromEcl(lon, lat, d);
  return { ...subPoint(ra, dec, date), eclLon: ((lon % 360) + 360) % 360 };
}
// Point at angular distance (deg) and bearing (deg) from a start point.
function dest(lat, lon, distDeg, brgDeg) {
  const p1 = lat * D2R; const l1 = lon * D2R; const d = distDeg * D2R; const b = brgDeg * D2R;
  const p2 = Math.asin(Math.sin(p1) * Math.cos(d) + Math.cos(p1) * Math.sin(d) * Math.cos(b));
  const l2 = l1 + Math.atan2(Math.sin(b) * Math.sin(d) * Math.cos(p1), Math.cos(d) - Math.sin(p1) * Math.sin(p2));
  return [((l2 * R2D + 540) % 360) - 180, p2 * R2D];
}
// Sun elevation (deg) at a place.
export function sunElevation(lat, lon, date = new Date()) {
  const s = sunPosition(date);
  const c = Math.sin(lat * D2R) * Math.sin(s.lat * D2R) + Math.cos(lat * D2R) * Math.cos(s.lat * D2R) * Math.cos((lon - s.lon) * D2R);
  return 90 - Math.acos(Math.max(-1, Math.min(1, c))) * R2D;
}

let lines = null; let marks = null;
let last = null;

export default {
  id: 'daynight',
  name: 'Day/night, Sun & Moon',
  group: 'space',
  color: '#ffd34d',
  icon: ICONS.sun,
  defaultOn: true,
  computed: true,
  attribution: 'Day/night line and Sun/Moon positions: computed in the app from standard formulas',

  init(ctx) {
    lines = ctx.primitives.add(new ctx.Cesium.PolylineCollection());
    marks = ctx.primitives.add(new ctx.Cesium.BillboardCollection());
  },
  async fetch() { return new Date(); },
  count() { return 2; },
  render(ctx, date) {
    const C = ctx.Cesium;
    const sun = sunPosition(date);
    const moon = moonPosition(date);
    const elong = ((moon.eclLon - sun.eclLon) + 360) % 360;
    const illum = (1 - Math.cos(elong * D2R)) / 2;
    last = { date, sun, moon, illum, waxing: elong < 180 };
    lines.removeAll(); marks.removeAll();
    const ring = (deg, alpha, width) => {
      const pts = [];
      for (let b = 0; b <= 360; b += 3) pts.push(...dest(sun.lat, sun.lon, deg, b));
      lines.add({ positions: C.Cartesian3.fromDegreesArray(pts), width, material: C.Material.fromType('Color', { color: C.Color.fromCssColorString('#ffd34d').withAlpha(alpha) }) });
    };
    ring(90, 0.9, 2);      // sunrise/sunset line
    ring(108, 0.35, 1.5);  // end of astronomical twilight
    marks.add({ id: { layer: 'daynight', key: 'sun' }, position: C.Cartesian3.fromDegrees(sun.lon, sun.lat, 2000), image: ctx.globe.makeIcon('badge', '#ffd34d', 30, '☀') });
    marks.add({ id: { layer: 'daynight', key: 'moon' }, position: C.Cartesian3.fromDegrees(moon.lon, moon.lat, 2000), image: ctx.globe.makeIcon('badge', '#d6dde6', 30, '☾') });
    ctx.setNote(`Moon ${Math.round(illum * 100)}% lit, ${last.waxing ? 'waxing' : 'waning'}`);
    return 2;
  },
  describe(ctx, key) {
    if (!last) return null;
    const p = key === 'sun' ? last.sun : last.moon;
    const rows = [['Directly overhead at', ctx.fmt.latlon(p.lat, p.lon)], ['Computed at', ctx.fmt.time(last.date.getTime())]];
    if (key === 'moon') rows.push(['Illuminated', `${Math.round(last.illum * 100)}% (${last.waxing ? 'waxing' : 'waning'})`]);
    return { title: key === 'sun' ? 'Sun (subsolar point)' : 'Moon (sublunar point)', subtitle: 'The spot where it is straight overhead', rows };
  },
  position(ctx, key) {
    if (!last) return undefined;
    const p = key === 'sun' ? last.sun : last.moon;
    return ctx.Cesium.Cartesian3.fromDegrees(p.lon, p.lat, 0);
  },
  brief(ctx, pt) {
    const el = sunElevation(pt.lat, pt.lon);
    const state = el > 0 ? `daylight (sun ${Math.round(el)}° up)` : el > -6 ? 'civil twilight' : el > -18 ? 'twilight' : 'night';
    return [`It is ${state} here.${last ? ` Moon ${Math.round(last.illum * 100)}% lit.` : ''}`];
  },
};
