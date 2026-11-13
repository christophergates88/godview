// ArcGIS feature-service queries (the format most U.S. government map data uses).
import { bbox } from './geo.js';

// GeoJSON features inside the box around q = { lat, lon, radiusKm }.
export async function arcgisBox(ctx, url, q, { outFields = '*', where = '1=1', max = 2000, f = 'geojson' } = {}) {
  const b = bbox(q.lat, q.lon, q.radiusKm);
  const params = new URLSearchParams({
    where, outFields, f, outSR: '4326', inSR: '4326', returnGeometry: 'true',
    geometry: `${b.w},${b.s},${b.e},${b.n}`, geometryType: 'esriGeometryEnvelope', spatialRel: 'esriSpatialRelIntersects',
    resultRecordCount: String(max),
  });
  const j = await ctx.net.get(`${url}?${params}`, { timeoutMs: 20000 });
  if (j && j.error) throw new ctx.net.FeedError(`Map service error: ${j.error.message || j.error.code}`);
  return j;
}

// Everything in a layer (small layers only), as Esri JSON with WGS84 points.
export async function arcgisAll(ctx, url, { outFields = '*', where = '1=1', max = 2000 } = {}) {
  const params = new URLSearchParams({ where, outFields, f: 'json', outSR: '4326', returnGeometry: 'true', resultRecordCount: String(max) });
  const j = await ctx.net.get(`${url}?${params}`, { timeoutMs: 20000 });
  if (j && j.error) throw new ctx.net.FeedError(`Map service error: ${j.error.message || j.error.code}`);
  return j;
}

// Case-insensitive attribute read: a(props, 'name') finds NAME or name.
export function a(props, ...keys) {
  if (!props) return undefined;
  for (const k of keys) {
    if (props[k] != null && props[k] !== '') return props[k];
    const hit = Object.keys(props).find((x) => x.toLowerCase() === k.toLowerCase());
    if (hit && props[hit] != null && props[hit] !== '') return props[hit];
  }
  return undefined;
}

// Try the main source; if it fails, try the fallback, and say which one answered.
export async function withFallback(ctx, primary, fallback, label) {
  try {
    return { data: await primary(), source: 'primary' };
  } catch (e) {
    if (!fallback) throw e;
    try {
      const data = await Promise.race([fallback(), new Promise((_, rej) => setTimeout(() => rej(new Error('fallback timed out')), 15000))]);
      return { data, source: 'fallback' };
    } catch (e2) {
      throw new ctx.net.FeedError(`${label}: ${e.message}; fallback: ${e2.message}`);
    }
  }
}
