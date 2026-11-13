// makeShapeLayer: areas (polygons) and lines (routes, cables) with a detail card.
//
// spec = { id, name, group, color, icon, attribution, defaultOn, needsKey,
//   max: 400,                 cap on shapes drawn
//   view: { maxKm, radiusKm } optional, as in point-layer
//   fetch(ctx, q) -> raw
//   parse(raw, ctx, q) -> [{ key, polygons?: [[ring, hole...], ...], lines?: [[[lon,lat],...]],
//                            color, alpha?, title, subtitle?, rows?, link?, text?, lat?, lon? }]
//   note(list, raw, ctx) }
// Rings and lines are arrays of [lon, lat].

import { ringCentroid, thin, distKm } from './geo.js';

export function makeShapeLayer(spec) {
  let lines = null;
  const shapes = new Map();
  let lastQuery = null;

  function query(ctx) {
    const v = ctx.view();
    if (!spec.view) return { lat: v.lat, lon: v.lon, radiusKm: v.radiusKm };
    if (!ctx.test && v.heightKm > spec.view.maxKm) return { skip: true };
    return { lat: v.lat, lon: v.lon, radiusKm: Math.min(v.radiusKm, spec.view.radiusKm || 250) };
  }

  return {
    id: spec.id, name: spec.name, group: spec.group, color: spec.color, icon: spec.icon,
    attribution: spec.attribution, defaultOn: !!spec.defaultOn, needsKey: spec.needsKey,

    init(ctx) { lines = ctx.primitives.add(new ctx.Cesium.PolylineCollection()); },

    async fetch(ctx) {
      const q = query(ctx);
      if (q.skip) return { skip: true };
      return { raw: await spec.fetch(ctx, q), q };
    },

    count(ctx, data) { return data && !data.skip ? spec.parse(data.raw, ctx, data.q).length : 0; },

    render(ctx, data) {
      const C = ctx.Cesium;
      const ents = ctx.entities;
      ents.suspendEvents();
      ents.removeAll();
      lines.removeAll();
      shapes.clear();
      if (data.skip) {
        ents.resumeEvents();
        lastQuery = null;
        ctx.setNote(`Zoom in closer to load (under ${Math.round(spec.view.maxKm)} km up)`);
        return 0;
      }
      lastQuery = { ...data.q, t: Date.now() };
      let list = spec.parse(data.raw, ctx, data.q);
      const total = list.length;
      const max = spec.max || 400;
      for (const s of list) {
        if (s.lat == null) {
          const ring = s.polygons?.[0]?.[0] || s.lines?.[0];
          if (ring && ring.length) Object.assign(s, ringCentroid(ring));
        }
      }
      if (list.length > max) {
        list = list.filter((s) => s.lat != null)
          .sort((a, b) => distKm(data.q.lat, data.q.lon, a.lat, a.lon) - distKm(data.q.lat, data.q.lon, b.lat, b.lon)).slice(0, max);
      }
      for (const s of list) {
        const key = String(s.key);
        shapes.set(key, s);
        const col = C.Color.fromCssColorString(s.color || spec.color);
        const parts = (s.polygons || []).filter((pp) => pp && pp[0]).sort((a, b) => b[0].length - a[0].length).slice(0, spec.maxParts || 150);
        parts.forEach((poly, i) => {
          const outer = poly[0];
          if (!outer || outer.length < 3) return;
          const e = ents.add({
            id: `${spec.id}:${key}#${i}`,
            polygon: {
              hierarchy: new C.PolygonHierarchy(
                C.Cartesian3.fromDegreesArray(thin(outer).flat()),
                poly.slice(1).filter((h) => h.length > 2).map((h) => new C.PolygonHierarchy(C.Cartesian3.fromDegreesArray(thin(h, 150).flat()))),
              ),
              height: 0,
              material: col.withAlpha(s.alpha ?? 0.28),
              outline: true,
              outlineColor: col.withAlpha(0.95),
            },
          });
          e.gv = { layer: spec.id, key };
        });
        for (const ln of s.lines || []) {
          if (!ln || ln.length < 2) continue;
          lines.add({
            id: { layer: spec.id, key },
            positions: C.Cartesian3.fromDegreesArray(thin(ln, 600).flat()),
            width: s.width || 2,
            material: C.Material.fromType('Color', { color: col.withAlpha(0.9) }),
          });
        }
      }
      ents.resumeEvents();
      let note = spec.note ? spec.note(list, data.raw, ctx) : '';
      if (total > list.length) note = [`Nearest ${list.length} of ${total} shown`, note].filter(Boolean).join(' · ');
      ctx.setNote(note);
      return shapes.size;
    },

    describe(ctx, key) {
      const s = shapes.get(key);
      if (!s) return null;
      return { title: s.title, subtitle: s.subtitle || '', rows: s.rows || [], link: s.link, text: s.text };
    },

    position(ctx, key) {
      const s = shapes.get(key);
      return s && s.lat != null ? ctx.Cesium.Cartesian3.fromDegrees(s.lon, s.lat, 0) : undefined;
    },

    items() { return [...shapes.values()].map((s) => ({ ...s, rings: (s.polygons || []).map((p) => p[0]).filter(Boolean) })); },

    onViewChange(ctx, v) {
      if (!spec.view) return false;
      if (v.heightKm > spec.view.maxKm) { if (lastQuery) { lastQuery = null; return true; } return false; }
      if (!lastQuery) return true;
      return distKm(v.lat, v.lon, lastQuery.lat, lastQuery.lon) > lastQuery.radiusKm * 0.5 && Date.now() - lastQuery.t > 10000;
    },
  };
}
