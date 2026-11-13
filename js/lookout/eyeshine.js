// Eyeshine: at night a deer's eyes throw your headlights back as two small,
// similar bright dots side by side. Lamps, reflectors and other cars look
// different: bigger and blown out, red, high in the picture, or a single dot.
// This is only ever a guess ("possible eyes"); it never raises the loud alarm.
//
// findEyePairs(rgba, w, h) -> [{ x, y, dx, d, score }] in 0..1 frame units
// EyeTracker: confirms a pair only when it shows up in 3 of the last 4 checks.

export function findEyePairs(rgba, w, h, opt = {}) {
  const n = w * h;
  const gray = new Uint8Array(n);
  let sum = 0; let sum2 = 0;
  for (let i = 0, j = 0; i < n; i++, j += 4) {
    const v = (rgba[j] * 77 + rgba[j + 1] * 150 + rgba[j + 2] * 29) >> 8;
    gray[i] = v; sum += v; sum2 += v * v;
  }
  const mean = sum / n;
  const sd = Math.sqrt(Math.max(0, sum2 / n - mean * mean));
  if (mean > (opt.maxMean ?? 70)) return [];                 // daylight or a lit street: not an eyeshine scene
  const thr = Math.max(opt.minLevel ?? 105, mean + 4 * sd);
  const top = Math.floor(h * 0.18); const bottom = Math.floor(h * 0.97);   // skip sky and street lamps; skip the bonnet
  const maxArea = Math.max(6, Math.round(n * 0.0007));
  const seen = new Uint8Array(n);
  const blobs = [];
  const stack = [];
  for (let y = top; y < bottom; y++) {
    for (let x = 0; x < w; x++) {
      const i0 = y * w + x;
      if (seen[i0] || gray[i0] < thr) continue;
      // flood fill this bright spot
      let area = 0; let sx = 0; let sy = 0; let peak = 0; let r = 0; let g = 0; let b = 0;
      let minX = x; let maxX = x; let minY = y; let maxY = y; let big = false;
      stack.length = 0; stack.push(i0); seen[i0] = 1;
      while (stack.length) {
        const i = stack.pop();
        const px = i % w; const py = (i - px) / w;
        area++; sx += px; sy += py;
        const v = gray[i]; if (v > peak) peak = v;
        r += rgba[i * 4]; g += rgba[i * 4 + 1]; b += rgba[i * 4 + 2];
        if (px < minX) minX = px; if (px > maxX) maxX = px; if (py < minY) minY = py; if (py > maxY) maxY = py;
        if (area > maxArea * 3) { big = true; }
        for (const k of [i - 1, i + 1, i - w, i + w]) {
          if (k < 0 || k >= n || seen[k]) continue;
          const kx = k % w;
          if (Math.abs(kx - px) > 1) continue;
          if (gray[k] >= thr) { seen[k] = 1; stack.push(k); }
        }
      }
      if (big || area > maxArea) continue;                     // headlight bloom, a lit sign, a window
      const bw = maxX - minX + 1; const bh = maxY - minY + 1;
      if (bw > 3 * bh + 2 || bh > 3 * bw + 2) continue;          // streaks (lane lines, wipers), not dots
      if (r > 1.45 * g && r > 1.45 * b) continue;                 // red: tail lights, red reflectors
      blobs.push({ x: sx / area, y: sy / area, area, d: Math.sqrt(area), peak, saturated: peak >= 250 && area > 10 });
    }
  }
  if (blobs.length > 40) return [];                             // a busy, lit scene (town): eyeshine is meaningless here
  const pairs = [];
  for (let i = 0; i < blobs.length; i++) {
    for (let j = i + 1; j < blobs.length; j++) {
      const a = blobs[i]; const c = blobs[j];
      if (a.saturated || c.saturated) continue;
      const d = (a.d + c.d) / 2;
      const dx = Math.abs(a.x - c.x); const dy = Math.abs(a.y - c.y);
      if (dy > Math.max(1.2, 0.6 * d)) continue;                // level with each other
      if (dx < Math.max(2.5, 2.2 * d) || dx > 9 * d + 2) continue; // eye spacing for their size
      const sizeRatio = Math.max(a.area, c.area) / Math.min(a.area, c.area);
      const peakRatio = Math.max(a.peak, c.peak) / Math.max(1, Math.min(a.peak, c.peak));
      if (sizeRatio > 2.5 || peakRatio > 1.6) continue;          // a matched pair looks alike
      // Nothing else bright on the line between them (two separate lamps usually have a lit area between)
      let between = false;
      const y0 = Math.round((a.y + c.y) / 2); const x0 = Math.round(Math.min(a.x, c.x) + d); const x1 = Math.round(Math.max(a.x, c.x) - d);
      for (let x = x0; x <= x1 && !between; x++) if (gray[y0 * w + x] >= thr) between = true;
      if (between) continue;
      const score = 1 / sizeRatio / peakRatio;
      pairs.push({ x: (a.x + c.x) / 2 / w, y: (a.y + c.y) / 2 / h, dx: dx / w, d: d / w, score });
    }
  }
  return pairs.sort((p, q) => q.score - p.score).slice(0, 4);
}

// Confirms a pair only if it keeps showing up near the same spot.
export class EyeTracker {
  constructor(need = 3, of = 4) { this.need = need; this.of = of; this.hist = []; }
  update(pairs) {
    this.hist.push(pairs);
    if (this.hist.length > this.of) this.hist.shift();
    if (this.hist.length < this.need) return null;
    for (const p of pairs) {
      let hits = 0;
      for (const frame of this.hist) {
        if (frame.some((q) => Math.abs(q.x - p.x) < 0.06 && Math.abs(q.y - p.y) < 0.06)) hits++;
      }
      if (hits >= this.need) return p;
    }
    return null;
  }
  reset() { this.hist = []; }
}
