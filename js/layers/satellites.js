// Satellites: orbital elements from CelesTrak (keyless), positions computed in
// the browser with satellite.js (SGP4). CelesTrak only updates every 2 hours and
// blocks repeat downloads, so data is saved in this browser and reused.

import { ENDPOINTS, COLORS, LIBS } from '../config.js';

const MAX_AGE_SEC = 7200;
const FIELDS = ['OBJECT_NAME', 'OBJECT_ID', 'EPOCH', 'MEAN_MOTION', 'ECCENTRICITY', 'INCLINATION', 'RA_OF_ASC_NODE',
  'ARG_OF_PERICENTER', 'MEAN_ANOMALY', 'EPHEMERIS_TYPE', 'CLASSIFICATION_TYPE', 'NORAD_CAT_ID', 'ELEMENT_SET_NO',
  'REV_AT_EPOCH', 'BSTAR', 'MEAN_MOTION_DOT', 'MEAN_MOTION_DDOT'];

export const SAT_GROUPS = {
  visual: 'Brightest (~150)',
  stations: 'Space stations',
  weather: 'Weather',
  'gps-ops': 'GPS',
  galileo: 'Galileo',
  science: 'Science',
  geo: 'Geostationary',
  starlink: 'Starlink (large, slower)',
};

let sat = null;          // satellite.js module, loaded on first use
let points = null;
let orbitLines = null;
const sats = [];         // { key, name, satrec, omm, point, pos, geo }
const byKey = new Map();
let selectedKey = null;

const isStation = (name) => /ISS|ZARYA|TIANGONG|CSS|TIANHE/i.test(name);

// Compact the data so it fits in browser storage.
const pack = (list) => list.map((o) => FIELDS.map((f) => o[f]));
const unpack = (rows) => rows.map((r) => Object.fromEntries(FIELDS.map((f, i) => [f, r[i]])));

export default {
  id: 'satellites',
  name: 'Satellites',
  color: COLORS.satellites,
  icon: '<svg viewBox="0 0 24 24"><g fill="none" stroke="currentColor" stroke-width="2" stroke-linejoin="round"><rect x="9" y="9" width="6" height="6" rx="1"/><path d="M3 5l4 4M17 15l4 4M5 3l2 2M19 17l2 2M3 5l2-2M19 21l2-2"/><path d="M15 9l2-2M7 17l2-2"/></g></svg>',
  attribution: 'Satellites: orbital data from CelesTrak (celestrak.org); positions computed with satellite.js',
  followRange: 2_500_000,

  async init(ctx) {
    points = ctx.primitives.add(new ctx.Cesium.PointPrimitiveCollection());
    orbitLines = ctx.primitives.add(new ctx.Cesium.PolylineCollection());
  },

  async fetch(ctx) {
    if (!sat) {
      try { sat = await import(LIBS.satellite); } catch { throw new ctx.net.FeedError('Could not load orbit library'); }
    }
    const group = ctx.settings.get('satGroup') || 'visual';
    const cacheKey = 'sat.' + group;
    const fresh = ctx.net.cache.get(cacheKey, MAX_AGE_SEC);
    if (fresh) {
      ctx.setNote(`CelesTrak · ${SAT_GROUPS[group] || group} · saved ${ctx.fmt.ago(fresh.t)}`);
      return unpack(fresh.data);
    }
    try {
      const list = await ctx.net.fetchJSON(ctx.net.fillUrl(ENDPOINTS.celestrak, { group }));
      if (!Array.isArray(list)) throw new ctx.net.FeedError('Unexpected data from CelesTrak');
      ctx.net.cache.set(cacheKey, pack(list));
      ctx.setNote(`CelesTrak · ${SAT_GROUPS[group] || group}`);
      return list;
    } catch (e) {
      // Fall back to older saved data rather than hammering CelesTrak.
      const stale = ctx.net.cache.get(cacheKey, 0);
      if (stale) {
        ctx.setNote(`Using saved data from ${ctx.fmt.ago(stale.t)} (CelesTrak: ${e.message})`);
        return unpack(stale.data);
      }
      // CelesTrak says: on 403/404 stop and do not retry automatically.
      if (e.status === 403 || e.status === 404) e.stop = true;
      throw e;
    }
  },

  render(ctx, list) {
    const { Cesium } = ctx;
    points.removeAll();
    sats.length = 0;
    byKey.clear();
    for (const omm of list) {
      let satrec;
      try { satrec = sat.json2satrec(omm); } catch { continue; }
      if (!satrec || satrec.error) continue;
      const key = String(omm.NORAD_CAT_ID);
      const station = isStation(omm.OBJECT_NAME || '');
      const point = points.add({
        id: { layer: 'satellites', key },
        pixelSize: station ? 9 : 5,
        color: Cesium.Color.fromCssColorString(station ? COLORS.stations : COLORS.satellites),
        outlineColor: Cesium.Color.BLACK.withAlpha(0.6),
        outlineWidth: 1,
        show: false,
      });
      const s = { key, name: (omm.OBJECT_NAME || key).trim(), satrec, omm, point, pos: null, geo: null, vel: 0 };
      sats.push(s);
      byKey.set(key, s);
    }
    this.tick(ctx, new Date());
    return sats.length;
  },

  tick(ctx, now) {
    if (!sat || !sats.length) return false;
    const { Cartesian3 } = ctx.Cesium;
    const gmst = sat.gstime(now);
    for (const s of sats) {
      let pv = null;
      try { pv = sat.propagate(s.satrec, now); } catch { pv = null; }
      if (!pv || !pv.position || !Number.isFinite(pv.position.x)) { s.point.show = false; s.pos = null; continue; }
      const ecf = sat.eciToEcf(pv.position, gmst);
      const p = new Cartesian3(ecf.x * 1000, ecf.y * 1000, ecf.z * 1000);
      s.point.position = p;
      s.point.show = true;
      s.pos = p;
      s.eci = pv.position;
      s.gmst = gmst;
      s.vel = pv.velocity ? Math.hypot(pv.velocity.x, pv.velocity.y, pv.velocity.z) : 0;
    }
    return true;
  },

  describe(ctx, key) {
    const s = byKey.get(key);
    if (!s) return null;
    const f = ctx.fmt;
    let geo = null;
    if (s.eci) {
      const g = sat.eciToGeodetic(s.eci, s.gmst);
      geo = { lat: sat.degreesLat(g.latitude), lon: sat.degreesLong(g.longitude), h: g.height };
    }
    const mm = Number(s.omm.MEAN_MOTION);
    const epoch = Date.parse(s.omm.EPOCH + (String(s.omm.EPOCH).endsWith('Z') ? '' : 'Z'));
    return {
      title: s.name,
      subtitle: `NORAD ${s.key}${s.omm.OBJECT_ID ? ' · ' + s.omm.OBJECT_ID : ''}`,
      rows: [
        ['Altitude', geo ? f.distanceKm(geo.h) : 'Not available'],
        ['Speed', f.speedKmS(s.vel)],
        ['Over', geo ? f.latlon(geo.lat, geo.lon) : '—'],
        ['Inclination', `${Number(s.omm.INCLINATION).toFixed(1)}°`],
        ['Orbit period', mm ? `${(1440 / mm).toFixed(0)} min` : '—'],
        ['Data epoch', Number.isFinite(epoch) ? f.ago(epoch) : '—'],
      ],
      link: { href: `https://celestrak.org/satcat/table-satcat.php?CATNR=${encodeURIComponent(s.key)}`, text: 'CelesTrak catalog entry' },
      followable: true,
      live: true,
    };
  },

  position(ctx, key) { const s = byKey.get(key); return s ? s.pos || undefined : undefined; },

  onSettingChange(ctx, k) { return k === 'satGroup'; },

  // Draw the path for the next orbit of the tapped satellite.
  onSelect(ctx, key) {
    selectedKey = key;
    if (!orbitLines) return;
    orbitLines.removeAll();
    const s = key && byKey.get(key);
    if (!s || !sat) return;
    const { Cesium } = ctx;
    const mm = Number(s.omm.MEAN_MOTION) || 15;
    const periodMin = Math.min(1440, 1440 / mm);
    const pts = [];
    const start = Date.now();
    for (let i = 0; i <= 180; i++) {
      const t = new Date(start + (i / 180) * periodMin * 60000);
      let pv = null;
      try { pv = sat.propagate(s.satrec, t); } catch { pv = null; }
      if (!pv || !pv.position) continue;
      const e = sat.eciToEcf(pv.position, sat.gstime(t));
      pts.push(new Cesium.Cartesian3(e.x * 1000, e.y * 1000, e.z * 1000));
    }
    if (pts.length > 1) {
      orbitLines.add({ positions: pts, width: 2, material: Cesium.Material.fromType('Color', { color: Cesium.Color.fromCssColorString(COLORS.satellites).withAlpha(0.7) }) });
    }
  },
};
