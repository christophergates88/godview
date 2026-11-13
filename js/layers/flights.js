// Live aircraft (ADS-B) for the area you are looking at.
//
// IMPORTANT: when this was built, none of the free keyless flight sources could
// be confirmed to allow direct calls from a web page (browser "CORS" rule).
// The layer tries each source in turn and says plainly if all are blocked.
// Fix: put a small relay in Settings > Flight relay URL (see README).

import { ENDPOINTS, COLORS } from '../config.js';

const MAX_VIEW_KM = 2500;   // further out than this, we do not query (too big an area)
const flights = new Map();  // key -> flight
let billboards = null;
let lastQuery = null;       // { lat, lon, radiusKm, t }
let preferred = null;       // id of the provider that last worked
let selectedKey = null;
let blockedNoRelay = false; // all sources blocked and no relay: stop retrying on every camera move

const readsbParse = (j) => PROVIDERS.find((p) => p.id === 'airplaneslive').parse(j);

export const PROVIDERS = [
  {
    id: 'adsblol',
    name: 'adsb.lol',
    url(v) {
      return fill(ENDPOINTS.flights.adsblol, {
        lat: v.lat.toFixed(3), lon: v.lon.toFixed(3), radiusNm: Math.round(Math.min(250, v.radiusKm / 1.852)),
      });
    },
    parse(j) { return readsbParse(j); },
  },
  {
    id: 'opensky',
    name: 'OpenSky Network',
    url(v) {
      // Keep the box at or under 10°×10° (costs at most 2 of the 400 free daily credits).
      const dLat = Math.min(5, v.radiusKm / 111);
      const dLon = Math.min(5, v.radiusKm / (111 * Math.max(0.2, Math.cos(v.lat * Math.PI / 180))));
      return fill(ENDPOINTS.flights.opensky, {
        lamin: (v.lat - dLat).toFixed(3), lamax: (v.lat + dLat).toFixed(3),
        lomin: (v.lon - dLon).toFixed(3), lomax: (v.lon + dLon).toFixed(3),
      });
    },
    parse(j) {
      if (!j || !('states' in j)) throw new Error('Unexpected data');
      const t = (j.time || Date.now() / 1000) * 1000;
      return (j.states || []).filter((s) => s[5] != null && s[6] != null).map((s) => ({
        key: s[0],
        callsign: (s[1] || '').trim(),
        country: s[2],
        lon: s[5], lat: s[6],
        altM: s[13] ?? s[7],
        onGround: !!s[8],
        speedMs: s[9],
        track: s[10],
        vrateMs: s[11],
        squawk: s[14],
        seenAt: (s[3] || s[4]) ? (s[3] || s[4]) * 1000 : t,
      }));
    },
  },
  {
    id: 'airplaneslive',
    name: 'airplanes.live',
    url(v) {
      return fill(ENDPOINTS.flights.airplaneslive, {
        lat: v.lat.toFixed(3), lon: v.lon.toFixed(3), radiusNm: Math.round(Math.min(250, v.radiusKm / 1.852)),
      });
    },
    parse(j) {
      const list = j && (j.ac || j.aircraft);
      if (!Array.isArray(list)) throw new Error('Unexpected data');
      const now = (j.now || Date.now()) > 1e11 ? (j.now || Date.now()) : j.now * 1000;
      return list.filter((a) => a.lat != null && a.lon != null).map((a) => {
        const ground = a.alt_baro === 'ground';
        const altFt = typeof a.alt_geom === 'number' ? a.alt_geom : (typeof a.alt_baro === 'number' ? a.alt_baro : 0);
        return {
          key: a.hex,
          callsign: (a.flight || '').trim(),
          reg: a.r, type: a.t, desc: a.desc,
          lon: a.lon, lat: a.lat,
          altM: altFt * 0.3048,
          onGround: ground,
          speedMs: a.gs != null ? a.gs * 0.514444 : null,
          track: a.track ?? a.true_heading,
          vrateMs: (a.baro_rate ?? a.geom_rate) != null ? (a.baro_rate ?? a.geom_rate) * 0.00508 : null,
          squawk: a.squawk,
          seenAt: now - (a.seen_pos || a.seen || 0) * 1000,
        };
      });
    },
  },
];

function fill(t, p) { return t.replace(/\{(\w+)\}/g, (_, k) => p[k]); }

function withRelay(relay, url) {
  if (!relay) return url;
  return relay.includes('{url}') ? relay.replace('{url}', encodeURIComponent(url)) : relay + encodeURIComponent(url);
}

export default {
  id: 'flights',
  name: 'Flights',
  color: COLORS.flights,
  icon: '<svg viewBox="0 0 24 24"><path d="M12 2.5c.8 0 1.3.9 1.3 2v5l8 4.6v2l-8-2.4v4.6l2.4 1.8v1.6L12 20.8l-3.7.9v-1.6l2.4-1.8v-4.6l-8 2.4v-2l8-4.6v-5c0-1.1.5-2 1.3-2z" fill="currentColor"/></svg>',
  attribution: 'Flights: adsb.lol (ODbL), OpenSky Network or airplanes.live, community ADS-B receivers',
  followRange: 40000,

  init(ctx) {
    billboards = ctx.primitives.add(new ctx.Cesium.BillboardCollection());
  },

  async fetch(ctx) {
    const v = ctx.view();
    if (v.heightKm > MAX_VIEW_KM) {
      lastQuery = null;
      ctx.setNote('Zoom in closer to load flights');
      return { list: [], skipped: true };
    }
    const relay = (ctx.settings.get('flightRelay') || '').trim();
    const order = [...PROVIDERS].sort((a, b) => (a.id === preferred ? -1 : b.id === preferred ? 1 : 0));
    const errors = [];
    for (const p of order) {
      try {
        const j = await ctx.net.fetchJSON(withRelay(relay, p.url(v)), { timeoutMs: 12000 });
        const list = p.parse(j);
        preferred = p.id;
        blockedNoRelay = false;
        lastQuery = { lat: v.lat, lon: v.lon, radiusKm: v.radiusKm, t: Date.now() };
        ctx.setNote(`${p.name}${relay ? ' via relay' : ''} · area around view centre`);
        return { list, provider: p.name };
      } catch (e) {
        errors.push(`${p.name}: ${e.message}`);
        if (e.kind === 'ratelimit') continue;
      }
    }
    const allBlocked = errors.every((m) => /Blocked/.test(m));
    const err = new ctx.net.FeedError(allBlocked
      ? 'All flight sources blocked by the browser. Add a relay in Settings.'
      : errors.join(' · '));
    blockedNoRelay = allBlocked && !relay;
    err.stop = blockedNoRelay; // no point retrying every minute if the browser blocks it
    throw err;
  },

  render(ctx, data) {
    const { Cesium } = ctx;
    const seen = new Set();
    for (const f of data.list) {
      if (!f.key) continue;
      seen.add(f.key);
      let item = flights.get(f.key);
      if (!item) {
        item = { ...f };
        item.bb = billboards.add({
          id: { layer: 'flights', key: f.key },
          image: ctx.globe.makeIcon('plane', COLORS.flights, 32),
          scale: 0.75,
          alignedAxis: Cesium.Cartesian3.UNIT_Z,
          scaleByDistance: new Cesium.NearFarScalar(2e4, 1.1, 3e6, 0.45),
          disableDepthTestDistance: 60000,
        });
        flights.set(f.key, item);
      } else Object.assign(item, f);
      item.fetchedAt = Date.now();
      place(ctx, item, Date.now());
    }
    for (const [k, item] of flights) {
      if (!seen.has(k)) { billboards.remove(item.bb); flights.delete(k); }
    }
    return flights.size;
  },

  // Smooth motion between updates: estimate position from last speed and heading.
  tick(ctx, now) {
    if (!ctx.settings.get('smoothMotion') || !flights.size) return false;
    const t = now.getTime();
    for (const item of flights.values()) place(ctx, item, t);
    return true;
  },

  describe(ctx, key) {
    const f = flights.get(key);
    if (!f) return null;
    const fm = ctx.fmt;
    const rows = [
      ['Altitude', f.onGround ? 'On ground' : fm.altitude(f.altM)],
      ['Speed', fm.airspeed(f.speedMs)],
      ['Heading', fm.heading(f.track)],
      ['Climb', fm.verticalRate(f.vrateMs)],
    ];
    if (f.type || f.desc) rows.push(['Type', [f.type, f.desc].filter(Boolean).join(' · ')]);
    if (f.reg) rows.push(['Registration', f.reg]);
    if (f.country) rows.push(['Registered in', f.country]);
    if (f.squawk) rows.push(['Squawk', String(f.squawk)]);
    rows.push(['ICAO hex', String(f.key).toUpperCase()]);
    rows.push(['Last report', fm.ago(f.seenAt) + (ctx.settings.get('smoothMotion') ? ' (position estimated since)' : '')]);
    return {
      title: f.callsign || String(f.key).toUpperCase(),
      subtitle: fm.latlon(f.est?.lat ?? f.lat, f.est?.lon ?? f.lon),
      rows,
      link: { href: `https://globe.airplanes.live/?icao=${encodeURIComponent(f.key)}`, text: 'Open in airplanes.live' },
      followable: true,
      live: true,
    };
  },

  position(ctx, key) { const f = flights.get(key); return f && f.bb ? f.bb.position : undefined; },

  // Reload when the camera moves to a clearly different area.
  onViewChange(ctx, v) {
    if (blockedNoRelay) return false;
    if (v.heightKm > MAX_VIEW_KM) { if (lastQuery) { lastQuery = null; return true; } return false; }
    if (!lastQuery) return true;
    const dKm = Math.hypot((v.lat - lastQuery.lat) * 111, (v.lon - lastQuery.lon) * 111 * Math.cos(v.lat * Math.PI / 180));
    const moved = dKm > lastQuery.radiusKm * 0.5 || v.radiusKm > lastQuery.radiusKm * 1.8;
    return moved && Date.now() - lastQuery.t > 15000; // never more often than every 15 s
  },

  onSettingChange(ctx, k) { if (k === 'flightRelay') { preferred = null; blockedNoRelay = false; return true; } return false; },

  onSelect(ctx, key) {
    selectedKey = key;
    for (const f of flights.values()) f.bb.color = f.key === selectedKey ? ctx.Cesium.Color.WHITE : ctx.Cesium.Color.WHITE.withAlpha(f.onGround ? 0.55 : 1);
  },
};

function place(ctx, item, t) {
  let { lat, lon } = item;
  const alt = item.onGround ? 30 : Math.max(50, item.altM || 0);
  if (ctx.settings.get('smoothMotion') && !item.onGround && item.speedMs && item.track != null) {
    const dt = Math.min(120, Math.max(0, (t - item.seenAt) / 1000));
    const d = item.speedMs * dt;
    const brg = item.track * Math.PI / 180;
    lat += (d * Math.cos(brg)) / 111320;
    lon += (d * Math.sin(brg)) / (111320 * Math.max(0.01, Math.cos(lat * Math.PI / 180)));
  }
  item.est = { lat, lon };
  item.bb.position = ctx.Cesium.Cartesian3.fromDegrees(lon, lat, alt);
  item.bb.rotation = -((item.track || 0) * Math.PI / 180);
  if (item.onGround) item.bb.color = ctx.Cesium.Color.WHITE.withAlpha(0.55);
}
