// Small geography helpers shared by layers.

const R = 6371; // km

export function distKm(lat1, lon1, lat2, lon2) {
  const toR = Math.PI / 180;
  const dLat = (lat2 - lat1) * toR;
  const dLon = (lon2 - lon1) * toR;
  const a = Math.sin(dLat / 2) ** 2 + Math.cos(lat1 * toR) * Math.cos(lat2 * toR) * Math.sin(dLon / 2) ** 2;
  return 2 * R * Math.asin(Math.min(1, Math.sqrt(a)));
}

export function bearing(lat1, lon1, lat2, lon2) {
  const toR = Math.PI / 180;
  const y = Math.sin((lon2 - lon1) * toR) * Math.cos(lat2 * toR);
  const x = Math.cos(lat1 * toR) * Math.sin(lat2 * toR) - Math.sin(lat1 * toR) * Math.cos(lat2 * toR) * Math.cos((lon2 - lon1) * toR);
  return (Math.atan2(y, x) * 180 / Math.PI + 360) % 360;
}

export function compass(deg) {
  return ['N', 'NE', 'E', 'SE', 'S', 'SW', 'W', 'NW'][Math.round(deg / 45) % 8];
}

// Box around a centre, radius in km. Returns { w, s, e, n } in degrees.
export function bbox(lat, lon, radiusKm) {
  const dLat = radiusKm / 111;
  const dLon = radiusKm / (111 * Math.max(0.05, Math.cos(lat * Math.PI / 180)));
  const r = (x) => Math.round(x * 1000) / 1000;
  return {
    s: r(Math.max(-89.9, lat - dLat)), n: r(Math.min(89.9, lat + dLat)),
    w: r(Math.max(-180, lon - dLon)), e: r(Math.min(180, lon + dLon)),
  };
}

// n x n grid of points covering a box (for weather / air-quality grids).
export function grid(lat, lon, radiusKm, n) {
  const b = bbox(lat, lon, radiusKm);
  const pts = [];
  for (let i = 0; i < n; i++) {
    for (let j = 0; j < n; j++) {
      pts.push({
        lat: +(b.s + (b.n - b.s) * (i + 0.5) / n).toFixed(3),
        lon: +(b.w + (b.e - b.w) * (j + 0.5) / n).toFixed(3),
      });
    }
  }
  return pts;
}

// Ray-casting point-in-polygon. ring = [[lon, lat], ...]
export function inRing(lat, lon, ring) {
  let inside = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const [xi, yi] = ring[i];
    const [xj, yj] = ring[j];
    if ((yi > lat) !== (yj > lat) && lon < ((xj - xi) * (lat - yi)) / (yj - yi) + xi) inside = !inside;
  }
  return inside;
}

export function ringCentroid(ring) {
  let lat = 0; let lon = 0;
  for (const [x, y] of ring) { lon += x; lat += y; }
  return { lat: lat / ring.length, lon: lon / ring.length };
}

// Keep at most max points of a ring/line (simple thinning).
export function thin(coords, max = 400) {
  if (coords.length <= max) return coords;
  const step = coords.length / max;
  const out = [];
  for (let i = 0; i < coords.length; i += step) out.push(coords[Math.floor(i)]);
  out.push(coords[coords.length - 1]);
  return out;
}

// Minimal CSV parser (handles quoted fields).
export function parseCSV(text) {
  const rows = [];
  let row = []; let cur = ''; let q = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (q) {
      if (c === '"' && text[i + 1] === '"') { cur += '"'; i++; } else if (c === '"') q = false; else cur += c;
    } else if (c === '"') q = true;
    else if (c === ',') { row.push(cur); cur = ''; } else if (c === '\n' || c === '\r') {
      if (c === '\r' && text[i + 1] === '\n') i++;
      row.push(cur); rows.push(row); row = []; cur = '';
    } else cur += c;
  }
  if (cur || row.length) { row.push(cur); rows.push(row); }
  return rows.filter((r) => r.length > 1 || r[0]);
}

export const isoDate = (d) => d.toISOString().slice(0, 10);
