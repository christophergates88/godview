// Georgia 511 (Georgia DOT) cameras and road events, with no key needed.
//
// Where the data comes from:
//  1. A key saved on this device (Settings > Keys): the live 511GA API, through
//     the data relay (511ga.org does not let web pages read it directly).
//  2. Otherwise: the copy the Lookout repo's GitHub Action rebuilds about every
//     15 minutes from the official API with the owner's key (kept in that repo's
//     secrets) and publishes as ga511.json. Both layers share one download.
//
// Everything is turned into one shape, so the layers do not care which source
// answered:
//   camera: { id, name, road, dir, lat, lon, url, ok }
//   event:  { id, type, sub, sev, desc, road, dir, lanes, lat, lon, reported, updated }

import { ENDPOINTS } from '../../config.js';

export const FEED_MAX_AGE_EVENTS_MS = 3 * 3600e3; // older road events are not shown as current
const FEED_REUSE_MS = 4 * 60e3;                   // both layers share one download for 4 minutes

let memo = null; // { t, feed } or { t, promise }

export async function loadFeed(ctx) {
  if (memo && Date.now() - memo.t < FEED_REUSE_MS) return memo.promise || memo.feed;
  const bucket = Math.floor(Date.now() / 300000); // the copy is cached for 5 minutes upstream anyway
  const promise = ctx.net.get(`${ENDPOINTS.ga511Feed}?t=${bucket}`, { timeoutMs: 25000 }).then((feed) => {
    if (!feed || !Array.isArray(feed.cameras) || !Array.isArray(feed.events)) throw new ctx.net.FeedError('Georgia 511 copy is not readable');
    memo = { t: Date.now(), feed };
    return feed;
  });
  memo = { t: Date.now(), promise };
  promise.catch(() => { memo = null; });
  return promise;
}
export function _resetFeedMemo() { memo = null; } // tests

export const feedAgeMs = (feed, now = Date.now()) => (feed && feed.updated ? now - Date.parse(feed.updated) : Infinity);

export function ago(ms) {
  if (!Number.isFinite(ms)) return 'an unknown time ago';
  const m = Math.max(0, Math.round(ms / 60000));
  if (m < 2) return 'just now';
  if (m < 60) return `${m} min ago`;
  const h = Math.round(m / 60);
  if (h < 36) return `${h} h ago`;
  return `${Math.round(h / 24)} days ago`;
}

const num = (v) => (v == null || v === '' ? NaN : Number(v));
const ts = (v) => {
  if (v == null || v === '') return null;
  if (typeof v === 'number' || /^\d+$/.test(String(v))) { const n = Number(v); return n < 1e12 ? n * 1000 : n; }
  const t = Date.parse(v);
  return Number.isFinite(t) ? t : null;
};
const hash = (s) => { let h = 0; for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) | 0; return (h >>> 0).toString(36); };

// 511GA direction codes in plain words ("ew" = both ways on an east-west road).
const DIRS = { n: 'northbound', s: 'southbound', e: 'eastbound', w: 'westbound', ns: 'both ways', sn: 'both ways', ew: 'both ways', we: 'both ways', b: 'both ways', both: 'both ways', 'both directions': 'both ways', all: 'all directions', 'all directions': 'all directions', none: '', unknown: '' };
export function dirWords(d) {
  const k = String(d || '').trim().toLowerCase();
  if (k in DIRS) return DIRS[k];
  return /bound$/.test(k) ? k : String(d || '').trim();
}
// Many camera names are ids ("GDOT-CCTV-1058") or "id: place"; show the place.
export function camTitle(name, road, dir) {
  const n = String(name || '').trim();
  const m = n.match(/^[A-Z0-9-]{4,}:\s*(.+)$/);
  if (m) return m[1];
  if (!n || /^[A-Z0-9]+(-[A-Z0-9]+)+$/.test(n)) return [road || 'Traffic camera', dirWords(dir)].filter(Boolean).join(' ');
  return n;
}

// ---- cameras
export function camsFromFeed(feed) {
  return (feed.cameras || []).map((c) => ({
    id: String(c.id), name: camTitle(c.name, c.road, c.dir), code: c.name || '', road: c.road || '', dir: dirWords(c.dir),
    lat: num(c.lat), lon: num(c.lon), url: c.url || null, ok: c.ok !== false,
  })).filter((c) => c.lat && c.lon);
}
export function camsFromApi(list) {
  return (Array.isArray(list) ? list : []).map((c) => {
    const view = (c.Views || []).find((v) => v.Status !== 'Disabled') || (c.Views || [])[0] || {};
    return {
      id: String(c.Id), name: c.Location || camTitle(c.Name, c.Roadway, c.Direction), code: c.Name || '', road: c.Roadway || '', dir: dirWords(c.Direction),
      lat: num(c.Latitude), lon: num(c.Longitude), url: view.Url || null, ok: !/disabled/i.test(view.Status || ''),
    };
  }).filter((c) => c.lat && c.lon);
}

// ---- road events
export function eventsFromFeed(feed) {
  const seen = {};
  const unique = (id) => { seen[id] = (seen[id] || 0) + 1; return seen[id] > 1 ? `${id}#${seen[id]}` : id; };
  return (feed.events || []).map((e) => {
    const lat = num(e.lat); const lon = num(e.lon);
    return {
      id: unique(`${e.type || 'ev'}:${lat.toFixed(4)},${lon.toFixed(4)}:${hash(String(e.desc || ''))}`),
      type: e.type || '', sub: e.sub || '', sev: e.sev || '', desc: e.desc || '', road: e.road || '',
      dir: dirWords(e.dir), lanes: '', lat, lon, reported: null, updated: ts(e.updated),
    };
  }).filter((e) => e.lat && e.lon);
}
export function eventsFromApi(list) {
  return (Array.isArray(list) ? list : []).map((e) => ({
    id: String(e.ID ?? e.Id), type: e.EventType || '', sub: e.Subtype || '', sev: e.Severity || '', desc: e.Description || '', road: e.RoadwayName || '',
    dir: dirWords(e.DirectionOfTravel), lanes: e.LanesAffected || '', lat: num(e.Latitude), lon: num(e.Longitude), reported: ts(e.Reported), updated: ts(e.LastUpdated),
  })).filter((e) => e.lat && e.lon);
}
