// Live aircraft (ADS-B) for the area you are looking at.
//
// IMPORTANT: when this was built, none of the free keyless flight sources could
// be confirmed to allow direct calls from a web page (browser "CORS" rule).
// The layer tries each source in turn and says plainly if all are blocked.
// Fix: put a small relay in Settings > Flight relay URL (see README).

import { ENDPOINTS, COLORS } from '../config.js';
import { aircraftDetails } from './lib/aircraft.js';

const MAX_VIEW_KM = 2500;   // further out than this, we do not query (too big an area)
const flights = new Map();  // key -> flight
let billboards = null;
let dots = null;
let labels = null;
let lastLod = '';
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
          military: (Number(a.dbFlags) & 1) === 1,
          seenAt: now - (a.seen_pos || a.seen || 0) * 1000,
        };
      });
    },
  },
];

function fill(t, p) { return t.replace(/\{(\w+)\}/g, (_, k) => p[k]); }

export default {
  id: 'flights',
  name: 'Flights',
  color: COLORS.flights,
  icon: '<svg viewBox="0 0 24 24"><path d="M12 2.5c.8 0 1.3.9 1.3 2v5l8 4.6v2l-8-2.4v4.6l2.4 1.8v1.6L12 20.8l-3.7.9v-1.6l2.4-1.8v-4.6l-8 2.4v-2l8-4.6v-5c0-1.1.5-2 1.3-2z" fill="currentColor"/></svg>',
  attribution: 'Flights: adsb.lol (ODbL), OpenSky Network or airplanes.live, community ADS-B receivers',
  group: 'air',
  defaultOn: true,
  followRange: 40000,

  init(ctx) {
    const C = ctx.Cesium;
    dots = ctx.primitives.add(new C.PointPrimitiveCollection());
    billboards = ctx.primitives.add(new C.BillboardCollection());
    labels = ctx.primitives.add(new C.LabelCollection());
  },

  async fetch(ctx) {
    const v = ctx.view();
    if (v.heightKm > MAX_VIEW_KM && !ctx.test) {
      lastQuery = null;
      ctx.setNote('Zoom in closer to load flights');
      return { list: [], skipped: true };
    }
    const order = [...PROVIDERS].sort((a, b) => (a.id === preferred ? -1 : b.id === preferred ? 1 : 0));
    const errors = [];
    for (const p of order) {
      try {
        const j = await ctx.net.get(p.url(v), { timeoutMs: 12000 });
        const list = p.parse(j);
        if (!ctx.test) {
          preferred = p.id;
          blockedNoRelay = false;
          lastQuery = { lat: v.lat, lon: v.lon, radiusKm: v.radiusKm, t: Date.now() };
          ctx.setNote(`${p.name}${ctx.rec.via === 'relay' ? ' via relay' : ''} · area around view centre`);
        }
        return { list, provider: p.name };
      } catch (e) {
        errors.push(`${p.name}: ${e.message}`);
      }
    }
    const allBlocked = errors.every((m) => /Blocked|relay/.test(m));
    const err = new ctx.net.FeedError(allBlocked
      ? 'All flight sources blocked. Check Settings > Data relay.'
      : errors.join(' · '));
    if (!ctx.test) blockedNoRelay = allBlocked;
    err.stop = allBlocked; // no point retrying every minute if the browser blocks it
    throw err;
  },

  count(ctx, data) { return data.list.length; },

  items() {
    return [...flights.values()].map((f) => ({ key: f.key, lat: f.est?.lat ?? f.lat, lon: f.est?.lon ?? f.lon, altM: f.altM, onGround: f.onGround, title: f.callsign || String(f.key).toUpperCase(), type: f.type }));
  },

  render(ctx, data) {
    const seen = new Set();
    for (const f of data.list) {
      if (!f.key) continue;
      seen.add(f.key);
      let item = flights.get(f.key);
      if (!item) {
        item = { ...f };
        item.bb = billboards.add({ id: { layer: 'flights', key: f.key }, show: false, alignedAxis: ctx.Cesium.Cartesian3.UNIT_Z, disableDepthTestDistance: 60000 });
        item.pt = dots.add({ id: { layer: 'flights', key: f.key }, pixelSize: 3, show: false });
        flights.set(f.key, item);
      } else Object.assign(item, f);
      item.special = isSpecial(item);
      item.fetchedAt = Date.now();
      place(ctx, item, Date.now());
    }
    for (const [k, item] of flights) {
      if (!seen.has(k)) { billboards.remove(item.bb); dots.remove(item.pt); flights.delete(k); }
    }
    lastLod = '';
    lod(ctx, true);
    const sp = [...flights.values()].filter((f) => f.special).length;
    ctx.setNote([data.provider ? `${data.provider}${ctx.rec.via === 'relay' ? ' via relay' : ''}` : '', 'colour = height: amber low, teal mid, blue high', sp ? `${sp} emergency/military` : ''].filter(Boolean).join(' · '));
    return flights.size;
  },

  // Every second: estimated motion between updates, and the zoom-dependent look.
  tick(ctx, now) {
    if (!flights.size) return false;
    if (ctx.settings.get('smoothMotion')) { const t = now.getTime(); for (const item of flights.values()) place(ctx, item, t); }
    lod(ctx, false);
    return true;
  },

  describe(ctx, key) {
    const f = flights.get(key);
    if (!f) return null;
    const fm = ctx.fmt;
    // The sentence already says who, height and climbing; rows are the extras.
    const rows = [
      ['Speed', fm.airspeed(f.speedMs)],
      ['Heading', fm.heading(f.track)],
    ];
    if (f.squawk && f.special) rows.push(['Squawk', String(f.squawk)]);
    rows.push(['Last report', fm.ago(f.seenAt)]);
    return {
      title: f.callsign || String(f.key).toUpperCase(),
      say: flightSentence(f, null, ctx),
      subtitle: f.special ? (f.military ? 'Military aircraft' : `Emergency code ${f.squawk}`) : fm.latlon(f.est?.lat ?? f.lat, f.est?.lon ?? f.lon),
      rows,
      link: { href: `https://globe.airplanes.live/?icao=${encodeURIComponent(f.key)}`, text: 'Open in airplanes.live' },
      followable: true,
      live: true,
    };
  },

  position(ctx, key) { const f = flights.get(key); return f && f.bb ? f.bb.position : undefined; },

  // Route, type, operator and a photo, looked up when the card opens.
  async details(ctx, key) {
    const f = flights.get(key);
    if (!f) return null;
    const d = await aircraftDetails(ctx, f.key, f.callsign);
    return { say: flightSentence(f, d, ctx), rows: d.rows, image: d.photo?.src, credit: d.credit, extraLink: d.photo?.link };
  },

  // Reload when the camera moves to a clearly different area.
  onViewChange(ctx, v) {
    if (blockedNoRelay) return false;
    if (v.heightKm > MAX_VIEW_KM) { if (lastQuery) { lastQuery = null; return true; } return false; }
    if (!lastQuery) return true;
    const dKm = Math.hypot((v.lat - lastQuery.lat) * 111, (v.lon - lastQuery.lon) * 111 * Math.cos(v.lat * Math.PI / 180));
    const moved = dKm > lastQuery.radiusKm * 0.5 || v.radiusKm > lastQuery.radiusKm * 1.8;
    return moved && Date.now() - lastQuery.t > 15000; // never more often than every 15 s
  },

  onSettingChange(ctx, k) { if (k === 'dataRelay') { preferred = null; blockedNoRelay = false; return true; } return false; },

  onSelect(ctx, key) {
    selectedKey = key;
    lastLod = '';
    lod(ctx, true);
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
  const pos = ctx.Cesium.Cartesian3.fromDegrees(lon, lat, alt);
  item.bb.position = pos;
  item.pt.position = pos;
  item.bb.rotation = -((item.track || 0) * Math.PI / 180);
}

// ---- Look by zoom ("level of detail") -------------------------------------
// Far out: small quiet dots. Closer: plane icons with heading for the nearest
// ones. Emergency and military aircraft always stand out. Colour = height.
const ALT = { ground: '#8b97a5', low: '#ffb020', mid: '#3ee6c4', high: '#6fb7ff', emergency: '#ff2d55', military: '#c6ff4a' };
const isSpecial = (f) => ['7500', '7600', '7700'].includes(String(f.squawk)) || !!f.military;
function band(f) {
  if (f.squawk && ['7500', '7600', '7700'].includes(String(f.squawk))) return 'emergency';
  if (f.military) return 'military';
  if (f.onGround) return 'ground';
  const ft = (f.altM || 0) * 3.28084;
  return ft < 10000 ? 'low' : ft < 25000 ? 'mid' : 'high';
}
export function lodPlan(heightKm) {
  if (heightKm > 900) return { icons: 0, scale: 0.5, dot: 3, alpha: 0.55 };
  if (heightKm > 250) return { icons: 40, scale: 0.55, dot: 3.5, alpha: 0.7 };
  if (heightKm > 60) return { icons: 150, scale: 0.68, dot: 4, alpha: 0.8 };
  return { icons: 400, scale: 0.85, dot: 4, alpha: 0.9 };
}
function lod(ctx, force) {
  if (!billboards || !flights.size) return;
  const C = ctx.Cesium;
  const v = ctx.view();
  const key = `${Math.round(v.heightKm / 10)}|${v.lat.toFixed(1)}|${v.lon.toFixed(1)}|${selectedKey}|${flights.size}`;
  if (!force && key === lastLod) return;
  lastLod = key;
  const plan = lodPlan(v.heightKm);
  const list = [...flights.values()];
  const cosl = Math.cos(v.lat * Math.PI / 180);
  const d2 = (f) => ((f.est?.lat ?? f.lat) - v.lat) ** 2 + (((f.est?.lon ?? f.lon) - v.lon) * cosl) ** 2;
  const ranked = list.filter((f) => !f.special && !(f.onGround && v.heightKm > 60)).sort((a, b) => d2(a) - d2(b));
  const iconSet = new Set(ranked.slice(0, plan.icons).map((f) => f.key));
  labels.removeAll();
  for (const f of list) {
    const b = band(f);
    const sel = f.key === selectedKey;
    const icon = f.special || sel || iconSet.has(f.key);
    f.bb.show = icon;
    f.pt.show = !icon;
    if (icon) {
      f.bb.image = ctx.globe.makeIcon('plane', ALT[b], 32);
      f.bb.scale = sel ? 1.0 : f.special ? Math.max(0.8, plan.scale + 0.25) : plan.scale;
      f.bb.color = C.Color.WHITE.withAlpha(b === 'ground' ? 0.7 : 1);
    } else {
      f.pt.color = C.Color.fromCssColorString(ALT[b]).withAlpha(plan.alpha);
      f.pt.pixelSize = plan.dot;
      f.pt.outlineWidth = 0;
    }
    if (sel || (f.special && v.heightKm < 1500)) {
      labels.add({
        position: f.bb.position, text: `${f.callsign || f.key.toUpperCase()}${f.onGround ? '' : ' · ' + ctx.fmt.altitude(f.altM)}`,
        font: '700 13px -apple-system, Segoe UI, sans-serif', fillColor: C.Color.WHITE, outlineColor: C.Color.BLACK, outlineWidth: 3,
        style: C.LabelStyle.FILL_AND_OUTLINE, pixelOffset: new C.Cartesian2(14, -14), disableDepthTestDistance: 60000,
        showBackground: false,
      });
    }
  }
}

// ---- Plain sentence ---------------------------------------------------------
const AIRLINE_SHORT = (n) => String(n || '').replace(/\b(Air ?Lines|Airlines|Airways|Air Line|Inc\.?|Corp\.?|Company|Co\.?)\b/gi, '').replace(/\s+/g, ' ').trim();
export function flightSentence(f, d, ctx) {
  const parts = [];
  const num = (f.callsign || '').replace(/^[A-Z]{3}/, '');
  const who = d?.airline ? `${AIRLINE_SHORT(d.airline)} ${num || f.callsign}` : (f.callsign || `Aircraft ${String(f.key).toUpperCase()}`);
  parts.push(who.trim());
  if (d?.from && d?.to) parts.push(`${d.from} to ${d.to}`);
  const type = d?.type || f.desc || f.type;
  if (type) parts.push(type);
  if (f.onGround) parts.push('on the ground');
  else {
    const ft = Math.round(((f.altM || 0) * 3.28084) / 500) * 500;
    parts.push(ctx.settings.get('units') === 'imperial' ? `${ft.toLocaleString()} ft` : `${Math.round((f.altM || 0) / 50) * 50} m`);
    const fpm = (f.vrateMs || 0) * 196.85;
    parts.push(fpm > 300 ? 'climbing' : fpm < -300 ? 'descending' : 'level');
  }
  let s = parts.join(', ') + '.';
  if (f.special) s = (f.military ? 'Military. ' : `Emergency code ${f.squawk}. `) + s;
  return s;
}
