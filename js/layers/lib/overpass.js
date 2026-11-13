// OpenStreetMap features via the public Overpass API, for the area in view.
// Overpass is a shared, free service: one query at a time, small areas only,
// results cached for 10 minutes per area.

import { ENDPOINTS } from '../../config.js';
import { bbox } from './geo.js';

let chain = Promise.resolve();
const memo = new Map();

// selectors: e.g. ['nwr["power"="plant"]'] (nwr = nodes, ways and relations)
export function overpass(ctx, q, selectors, limit = 400) {
  const b = bbox(q.lat, q.lon, q.radiusKm);
  const area = `(${b.s},${b.w},${b.n},${b.e})`;
  const body = `[out:json][timeout:25];(${selectors.map((s) => `${s}${area};`).join('')});out center ${limit};`;
  const key = body;
  const hit = memo.get(key);
  if (hit && Date.now() - hit.t < 600000) return Promise.resolve(hit.data);
  // The public Overpass servers are often busy; try each mirror in turn.
  const urls = [ENDPOINTS.overpass, ...(ENDPOINTS.overpassMirrors || [])].map((u) => u.replace('{q}', encodeURIComponent(body)));
  const run = async () => {
    let lastErr;
    for (const u of urls) {
      try {
        const data = await ctx.net.get(u, { timeoutMs: 20000 });
        memo.set(key, { t: Date.now(), data });
        if (memo.size > 30) memo.delete(memo.keys().next().value);
        return data;
      } catch (e) { lastErr = e; }
    }
    // Every server failed. Since 2026 the free public servers are often full; say so plainly.
    if (lastErr && /Timed out|502|503|504|429|capacity/i.test(String(lastErr.message || lastErr))) {
      throw new ctx.net.FeedError("OpenStreetMap's free lookup servers are full right now. Try again in a few minutes.", { kind: 'busy' });
    }
    throw lastErr;
  };
  const p = chain.then(run, run);
  chain = p.catch(() => {});
  return p;
}

// Overpass element -> { lat, lon }
export function where(el) {
  if (el.lat != null) return { lat: el.lat, lon: el.lon };
  if (el.center) return { lat: el.center.lat, lon: el.center.lon };
  return { lat: NaN, lon: NaN };
}

export const tagRows = (tags, keys) => keys.filter(([k]) => tags[k]).map(([k, label]) => [label, String(tags[k])]);
