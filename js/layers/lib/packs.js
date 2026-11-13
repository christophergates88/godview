// Data packs: weekly copies of public datasets whose live servers are too slow,
// or too often down, to read from a phone. scripts/build_packs.py builds them in
// GitHub Actions and publishes them to this repo's `data` branch:
//
//   index.json            { v, tile, updated, packs: { <name>: { built, count, tiles,
//                           fields, source, licence, error } } }
//   <name>/<s>_<w>.json   { pack, built, fields, rows: [[lat, lon, ...], ...] }
//
// Tiles are 5 x 5 degrees, named by their south-west corner. A layer asks for the
// rows within its view circle; only the tiles that touch the circle are loaded,
// and each is kept in memory for the session.

import { ENDPOINTS } from '../../config.js';
import { bbox, distKm } from './geo.js';

const INDEX_REUSE_MS = 30 * 60e3;
const MAX_TILES_KEPT = 24;
let index = null;          // { t, promise }
const tiles = new Map();   // `${name}/${key}@${built}` -> promise of rows

export function loadIndex(ctx) {
  if (index && Date.now() - index.t < INDEX_REUSE_MS) return index.promise;
  const bucket = Math.floor(Date.now() / 3600e3); // the list changes once a week; ask at most hourly
  const promise = ctx.net.get(`${ENDPOINTS.packs}index.json?t=${bucket}`, { timeoutMs: 20000 }).then((j) => {
    if (!j || !j.packs) throw new ctx.net.FeedError('The data pack list is not readable');
    return j;
  });
  index = { t: Date.now(), promise };
  promise.catch(() => { index = null; });
  return promise;
}

// Names of the tiles a view circle touches.
export function tileKeys(q, size = 5) {
  const b = bbox(q.lat, q.lon, q.radiusKm);
  const keys = [];
  for (let s = Math.floor(b.s / size) * size; s <= b.n; s += size) {
    for (let w = Math.floor(b.w / size) * size; w <= b.e; w += size) keys.push(`${s}_${w}`);
  }
  return keys;
}

function loadTile(ctx, name, key, built) {
  const id = `${name}/${key}@${built}`;
  if (tiles.has(id)) return tiles.get(id);
  const p = ctx.net.get(`${ENDPOINTS.packs}${name}/${key}.json?v=${encodeURIComponent(built || '')}`, { timeoutMs: 30000 })
    .then((j) => (j && Array.isArray(j.rows) ? j.rows : []));
  tiles.set(id, p);
  p.catch(() => tiles.delete(id));
  while (tiles.size > MAX_TILES_KEPT) tiles.delete(tiles.keys().next().value);
  return p;
}

// Rows of one pack within the view circle, nearest first, as objects named by
// the pack's fields. Throws when the pack is missing so the layer can fall back
// to the live source.
export async function packRows(ctx, name, q) {
  const ix = await loadIndex(ctx);
  const p = ix.packs[name];
  if (!p || !Array.isArray(p.tiles) || !p.tiles.length || !Array.isArray(p.fields)) {
    throw new ctx.net.FeedError(p && p.error ? `The ${name} data pack could not be built (${p.error})` : `There is no ${name} data pack yet`);
  }
  const have = new Set(p.tiles);
  const parts = await Promise.all(tileKeys(q, ix.tile || 5).filter((k) => have.has(k)).map((k) => loadTile(ctx, name, k, p.built)));
  const rows = [];
  for (const part of parts) {
    for (const r of part) {
      const d = distKm(q.lat, q.lon, r[0], r[1]);
      if (d <= q.radiusKm) rows.push({ r, d });
    }
  }
  rows.sort((x, y) => x.d - y.d);
  const f = p.fields;
  return {
    pack: name, built: p.built, source: p.source, licence: p.licence, total: p.count,
    items: rows.map(({ r, d }) => { const o = { distKm: d }; f.forEach((k, i) => { o[k] = r[i]; }); return o; }),
  };
}

// "Nov 16" style date of a pack, for notes.
export function builtOn(built) {
  const t = Date.parse(built || '');
  return Number.isFinite(t) ? new Date(t).toLocaleDateString(undefined, { month: 'short', day: 'numeric' }) : 'an unknown date';
}

export function _resetPacks() { index = null; tiles.clear(); } // tests
