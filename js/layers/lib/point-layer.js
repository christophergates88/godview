// makePointLayer: builds a complete layer from a short description.
// Most layers are "points on the globe with a detail card", so they only need
// to say where the data comes from and how to read it.
//
// spec = {
//   id, name, group, color, icon, attribution, defaultOn, needsKey, computed,
//   label: 'F',              badge letter (shape 'badge'); or shape: 'point' | 'plane'
//   size: 8,                 point size in pixels (shape 'point')
//   heightM: 1500,           drawing height above ground
//   max: 1500,               cap: keep the nearest N to the view centre
//   view: { maxKm, radiusKm } area layer: only loads within maxKm camera height,
//                            queries radiusKm (capped) around the view centre,
//                            and reloads when the view moves
//   fetch(ctx, q)            q = { lat, lon, radiusKm } -> raw data (use ctx.net.get)
//   parse(raw, ctx, q)       -> [{ key, lat, lon, alt?, title, subtitle?, rows?, link?,
//                                 text?, image?, audio?, color?, label?, rotation? }]
//   describe(item, ctx)      optional custom card
//   details(item, ctx)       optional async: extra rows loaded when the card opens
//   note(items, raw, ctx)    optional status note
// }

import { distKm } from './geo.js';

export function makePointLayer(spec) {
  let coll = null;
  const items = new Map();
  let lastQuery = null;
  let selected = null;
  const shape = spec.shape || (spec.label ? 'badge' : 'point');

  function query(ctx) {
    const v = ctx.view();
    if (!spec.view) return { lat: v.lat, lon: v.lon, radiusKm: v.radiusKm };
    if (!ctx.test && v.heightKm > spec.view.maxKm) return { skip: true };
    return { lat: v.lat, lon: v.lon, radiusKm: Math.min(v.radiusKm, spec.view.radiusKm || 250) };
  }

  const layer = {
    id: spec.id,
    name: spec.name,
    group: spec.group,
    color: spec.color,
    icon: spec.icon,
    attribution: spec.attribution,
    defaultOn: !!spec.defaultOn,
    needsKey: spec.needsKey,
    computed: !!spec.computed,
    followRange: spec.followRange,

    init(ctx) {
      const C = ctx.Cesium;
      coll = ctx.primitives.add(shape === 'point' ? new C.PointPrimitiveCollection() : new C.BillboardCollection());
    },

    async fetch(ctx) {
      const q = query(ctx);
      if (q.skip) return { skip: true };
      const raw = await spec.fetch(ctx, q);
      return { raw, q };
    },

    count(ctx, data) {
      if (!data || data.skip) return 0;
      return spec.parse(data.raw, ctx, data.q).length;
    },

    render(ctx, data) {
      const C = ctx.Cesium;
      coll.removeAll();
      items.clear();
      if (data.skip) {
        lastQuery = null;
        ctx.setNote(`Zoom in closer to load (under ${Math.round(spec.view.maxKm)} km up)`);
        return 0;
      }
      lastQuery = { ...data.q, t: Date.now() };
      let list = spec.parse(data.raw, ctx, data.q).filter((it) => Number.isFinite(it.lat) && Number.isFinite(it.lon));
      const total = list.length;
      const max = spec.max || 1500;
      if (list.length > max) {
        const { lat, lon } = data.q;
        list = list.map((it) => [distKm(lat, lon, it.lat, it.lon), it]).sort((a, b) => a[0] - b[0]).slice(0, max).map((x) => x[1]);
      }
      for (const it of list) {
        const key = String(it.key);
        items.set(key, it);
        const color = it.color || spec.color;
        const pos = C.Cartesian3.fromDegrees(it.lon, it.lat, it.alt ?? spec.heightM ?? 1500);
        const common = { id: { layer: spec.id, key }, position: pos };
        if (shape === 'point') {
          coll.add({
            ...common,
            pixelSize: it.size || spec.size || 8,
            color: C.Color.fromCssColorString(color),
            outlineColor: C.Color.BLACK.withAlpha(0.7),
            outlineWidth: 1.5,
            scaleByDistance: new C.NearFarScalar(2e5, 1.3, 2e7, 0.6),
          });
        } else {
          coll.add({
            ...common,
            image: ctx.globe.makeIcon(shape === 'plane' ? 'plane' : 'badge', color, shape === 'plane' ? 32 : 28, it.label ?? spec.label ?? ''),
            scale: shape === 'plane' ? 0.75 : 0.8,
            rotation: it.rotation != null ? -it.rotation * Math.PI / 180 : 0,
            alignedAxis: it.rotation != null ? C.Cartesian3.UNIT_Z : C.Cartesian3.ZERO,
            scaleByDistance: new C.NearFarScalar(2e5, 1.15, 2e7, 0.5),
          });
        }
      }
      let note = spec.note ? spec.note(list, data.raw, ctx) : '';
      if (total > list.length) note = [`Nearest ${list.length} of ${total.toLocaleString()} shown`, note].filter(Boolean).join(' · ');
      ctx.setNote(note);
      return items.size;
    },

    describe(ctx, key) {
      const it = items.get(key);
      if (!it) return null;
      if (spec.describe) return spec.describe(it, ctx);
      return {
        title: it.title, subtitle: it.subtitle || ctx.fmt.latlon(it.lat, it.lon), rows: it.rows || [],
        say: it.say, link: it.link, text: it.text, image: it.image, audio: it.audio, followable: !!spec.followRange, live: !!spec.tick,
      };
    },

    details: spec.details ? (ctx, key) => { const it = items.get(key); return it ? spec.details(it, ctx) : null; } : undefined,

    position(ctx, key) {
      const it = items.get(key);
      if (!it) return undefined;
      return it._pos || ctx.Cesium.Cartesian3.fromDegrees(it.lon, it.lat, it.alt ?? spec.heightM ?? 1500);
    },

    items() { return [...items.values()]; },

    onViewChange(ctx, v) {
      if (!spec.view) return false;
      if (v.heightKm > spec.view.maxKm) { if (lastQuery) { lastQuery = null; return true; } return false; }
      if (!lastQuery) return true;
      const r = Math.min(v.radiusKm, spec.view.radiusKm || 250);
      const moved = distKm(v.lat, v.lon, lastQuery.lat, lastQuery.lon) > lastQuery.radiusKm * 0.5 || r > lastQuery.radiusKm * 1.6;
      return moved && Date.now() - lastQuery.t > (spec.view.minGapMs || 10000);
    },

    onSelect(ctx, key) {
      selected = key;
      if (!coll) return;
      for (let i = 0; i < coll.length; i++) {
        const p = coll.get(i);
        const on = p.id.key === selected;
        if (shape === 'point') { p.outlineColor = on ? ctx.Cesium.Color.WHITE : ctx.Cesium.Color.BLACK.withAlpha(0.7); p.outlineWidth = on ? 3 : 1.5; } else p.scale = on ? 1.15 : (shape === 'plane' ? 0.75 : 0.8);
      }
    },
  };
  if (spec.onSettingChange) layer.onSettingChange = spec.onSettingChange;

  // Zoom-dependent look for busy layers: far out, fewer and smaller marks
  // (nearest to the view centre first); close in, everything at full size.
  let lodKey = '';
  const lodTick = (ctx) => {
    if (!coll || items.size < 60) return false;
    const v = ctx.view();
    const far = v.heightKm > (spec.lodKm || 700);
    const key = `${far}|${v.lat.toFixed(1)}|${v.lon.toFixed(1)}|${items.size}|${selected}`;
    if (key === lodKey) return false;
    lodKey = key;
    const cap = spec.lodCap || 120;
    let keep = null;
    if (far && items.size > cap) {
      const cosl = Math.cos(v.lat * Math.PI / 180);
      keep = new Set([...items.values()].map((it) => [((it.lat - v.lat) ** 2 + ((it.lon - v.lon) * cosl) ** 2), String(it.key)])
        .sort((a, b) => a[0] - b[0]).slice(0, cap).map((x) => x[1]));
    }
    for (let i = 0; i < coll.length; i++) {
      const p = coll.get(i);
      const on = p.id.key === selected;
      if (shape === 'point') {
        p.show = on || !keep || keep.has(p.id.key);
        p.pixelSize = on ? 12 : far ? Math.max(3, (spec.size || 8) * 0.55) : (spec.size || 8);
      } else {
        p.show = on || !keep || keep.has(p.id.key);
        p.scale = on ? 1.15 : far ? 0.5 : (shape === 'plane' ? 0.75 : 0.8);
      }
    }
    return true;
  };
  layer.tick = (ctx, now) => { const a = spec.tick ? spec.tick(ctx, now, items, coll) : false; const b = lodTick(ctx); return a || b; };
  const baseRender = layer.render;
  layer.render = (ctx, data) => { lodKey = ''; const n = baseRender.call(layer, ctx, data); lodTick(ctx); return n; };
  return layer;
}
