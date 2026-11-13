// Satellites: orbital elements from CelesTrak (keyless), positions computed in
// the browser with satellite.js (SGP4). CelesTrak only updates every 2 hours and
// blocks repeat downloads, so each group is saved in this browser and reused.
//
// makeSatelliteLayer() builds one layer per CelesTrak group; this file's default
// export is the "brightest" group (id 'satellites', as in v1).

import { ENDPOINTS, COLORS, LIBS } from '../config.js';

const MAX_AGE_SEC = 7200;
const FIELDS = ['OBJECT_NAME', 'OBJECT_ID', 'EPOCH', 'MEAN_MOTION', 'ECCENTRICITY', 'INCLINATION', 'RA_OF_ASC_NODE',
  'ARG_OF_PERICENTER', 'MEAN_ANOMALY', 'EPHEMERIS_TYPE', 'CLASSIFICATION_TYPE', 'NORAD_CAT_ID', 'ELEMENT_SET_NO',
  'REV_AT_EPOCH', 'BSTAR', 'MEAN_MOTION_DOT', 'MEAN_MOTION_DDOT'];

const ICON = '<svg viewBox="0 0 24 24"><g fill="none" stroke="currentColor" stroke-width="2" stroke-linejoin="round"><rect x="9" y="9" width="6" height="6" rx="1"/><path d="M3 5l4 4M17 15l4 4M5 3l2 2M19 17l2 2M3 5l2-2M19 21l2-2"/><path d="M15 9l2-2M7 17l2-2"/></g></svg>';

let sat = null; // satellite.js, loaded once on first use
async function lib(ctx) {
  if (!sat) {
    try { sat = await import(LIBS.satellite); } catch { throw new ctx.net.FeedError('Could not load orbit library'); }
  }
  return sat;
}

const isStation = (name) => /ISS|ZARYA|TIANGONG|CSS|TIANHE/i.test(name);
const pack = (list) => list.map((o) => FIELDS.map((f) => o[f]));
const unpack = (rows) => rows.map((r) => Object.fromEntries(FIELDS.map((f, i) => [f, r[i]])));

// Elevation (degrees) of an ECF position (km) seen from an observer.
function elevation(s, obsGd, ecfKm) {
  return s.radiansToDegrees(s.ecfToLookAngles(obsGd, ecfKm).elevation);
}

export function makeSatelliteLayer({ id, group, name, label, color = COLORS.satellites, defaultOn = false, tickEvery = 1, passes = false }) {
  let points = null;
  let orbitLines = null;
  const sats = [];
  const byKey = new Map();
  let tickN = 0;
  let passCache = { key: '', t: 0, v: null };

  const layer = {
    id,
    name,
    group: 'space',
    color,
    icon: ICON,
    defaultOn,
    attribution: `Satellites (${label}): orbital data from CelesTrak (celestrak.org); positions computed with satellite.js`,
    followRange: 2_500_000,

    init(ctx) {
      points = ctx.primitives.add(new ctx.Cesium.PointPrimitiveCollection());
      orbitLines = ctx.primitives.add(new ctx.Cesium.PolylineCollection());
    },

    async fetch(ctx) {
      await lib(ctx);
      const cacheKey = 'sat.' + group;
      const fresh = ctx.net.cache.get(cacheKey, MAX_AGE_SEC);
      if (fresh) {
        ctx.setNote(`CelesTrak · saved ${ctx.fmt.ago(fresh.t)}`);
        ctx.rec.via = 'direct';
        return unpack(fresh.data);
      }
      try {
        const list = await ctx.net.get(ctx.net.fillUrl(ENDPOINTS.celestrak, { group }));
        if (!Array.isArray(list)) throw new ctx.net.FeedError('Unexpected data from CelesTrak');
        ctx.net.cache.set(cacheKey, pack(list));
        ctx.setNote('CelesTrak');
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

    count(ctx, list) { return list.length; },

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
          id: { layer: id, key },
          pixelSize: station ? 9 : (list.length > 2000 ? 3 : 5),
          color: Cesium.Color.fromCssColorString(station ? COLORS.stations : color).withAlpha(list.length > 2000 ? 0.55 : 1),
          outlineColor: Cesium.Color.BLACK.withAlpha(0.6),
          outlineWidth: list.length > 2000 ? 0 : 1,
          show: false,
        });
        const s = { key, name: (omm.OBJECT_NAME || key).trim(), satrec, omm, point, pos: null, vel: 0 };
        sats.push(s);
        byKey.set(key, s);
      }
      tickN = 0;
      this.tick(ctx, new Date(), true);
      return sats.length;
    },

    // Big groups (Starlink) are moved less often to save phone battery.
    tick(ctx, now, force) {
      if (!sat || !sats.length) return false;
      if (!force && (tickN++ % tickEvery) !== 0) return false;
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
        s.ecf = ecf;
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
        say: `${s.name}, ${geo ? f.distanceKm(geo.h) + ' up' : 'in orbit'}, moving ${f.speedKmS(s.vel)}. ${mm ? `Circles Earth every ${(1440 / mm).toFixed(0)} minutes.` : ''}`.trim(),
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

    items() { return sats.filter((s) => s.pos).map((s) => ({ key: s.key, title: s.name })); },

    // For "What's here": satellites above the horizon now, and the next pass of a bright one.
    brief(ctx, pt) {
      if (!sat || !sats.length) return [];
      const obs = { latitude: sat.degreesToRadians(pt.lat), longitude: sat.degreesToRadians(pt.lon), height: 0.1 };
      const up = [];
      for (const s of sats) if (s.ecf) { const el = elevation(sat, obs, s.ecf); if (el > 10) up.push([el, s]); }
      up.sort((a, b) => b[0] - a[0]);
      const lines = [];
      if (up.length) lines.push(`${name}: ${up.length} above 10° now: ${up.slice(0, 3).map(([el, s]) => `${s.name} (${Math.round(el)}°)`).join(', ')}${up.length > 3 ? '…' : ''}`);
      if (passes) {
        const best = this.nextPass(pt, up.map(([, u]) => u));
        if (best) lines.push(`Next pass above 10°: ${best.name} at ${best.time} (not checked for sunlight/visibility)`);
      }
      return lines;
    },

    // Next pass above 10° within 12 h (stations first). Cached 10 minutes per spot.
    nextPass(pt, exclude = []) {
      if (!passes || !sat || !sats.length || sats.length > 400) return null;
      const ck = `${pt.lat.toFixed(1)},${pt.lon.toFixed(1)}`;
      if (passCache.key === ck && Date.now() - passCache.t < 600000) return passCache.v;
      const obs = { latitude: sat.degreesToRadians(pt.lat), longitude: sat.degreesToRadians(pt.lon), height: 0.1 };
      const cands = [...sats].sort((a, b) => Number(isStation(b.name)) - Number(isStation(a.name))).slice(0, 60);
      let best = null;
      const t0 = Date.now();
      for (let t = 60e3; t <= 12 * 3600e3 && !best; t += 60e3) {
        const d = new Date(t0 + t);
        const gmst = sat.gstime(d);
        for (const s of cands) {
          if (exclude.includes(s)) continue;
          let pv;
          try { pv = sat.propagate(s.satrec, d); } catch { pv = null; }
          if (!pv || !pv.position) continue;
          if (elevation(sat, obs, sat.eciToEcf(pv.position, gmst)) > 10) { best = { s, d }; break; }
        }
      }
      const v = best ? { name: best.s.name, short: isStation(best.s.name) ? (/TIANGONG|CSS|TIANHE/i.test(best.s.name) ? 'Tiangong' : 'Space Station') : best.s.name, time: best.d.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' }), at: best.d.getTime() } : null;
      passCache = { key: ck, t: Date.now(), v };
      return v;
    },

    // Draw the path for the next orbit of the tapped satellite.
    onSelect(ctx, key) {
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
        orbitLines.add({ positions: pts, width: 2, material: Cesium.Material.fromType('Color', { color: Cesium.Color.fromCssColorString(color).withAlpha(0.7) }) });
      }
    },
  };
  return layer;
}

export default makeSatelliteLayer({ id: 'satellites', group: 'visual', name: 'Satellites: brightest', label: 'brightest ~150', defaultOn: true, passes: true });
