// makeImageryLayer: a whole-globe picture layer from map tiles (e.g. NASA GIBS).
// spec = { id, name, group, color, icon, attribution, alpha,
//          tiles(ctx) -> { url, maxLevel, credit, key }   (url uses {z}/{x}/{y})
//          testTile(ctx) -> one tile URL to check it loads }

export function makeImageryLayer(spec) {
  let layer = null;
  let currentKey = null;
  let visible = true;
  return {
    id: spec.id, name: spec.name, group: spec.group, color: spec.color, icon: spec.icon,
    attribution: spec.attribution, defaultOn: !!spec.defaultOn,

    async fetch(ctx) {
      const t = spec.tiles(ctx);
      if (ctx.test) {
        // Self-test: really download one tile to prove the server answers.
        const res = await fetch(spec.testTile(ctx), { cache: 'no-store' }).catch(() => null);
        if (!res) throw new ctx.net.FeedError('Blocked by browser or unreachable');
        if (!res.ok) throw new ctx.net.FeedError(`Provider error ${res.status}`);
        ctx.rec.via = 'direct';
      }
      return t;
    },

    count() { return 1; },

    render(ctx, t) {
      const C = ctx.Cesium;
      if (t.key !== currentKey) {
        const next = new C.ImageryLayer(new C.UrlTemplateImageryProvider({
          url: t.url, maximumLevel: t.maxLevel, credit: new C.Credit(t.credit, true),
        }), { alpha: spec.alpha ?? 0.85 });
        next.show = visible;
        ctx.viewer.imageryLayers.add(next);
        if (layer) ctx.viewer.imageryLayers.remove(layer, true);
        layer = next;
        currentKey = t.key;
      }
      ctx.rec.via = 'direct';
      ctx.setNote(t.note || '');
      return null;
    },

    show(ctx, on) { visible = on; if (layer) layer.show = on; },
    describe() { return null; },
  };
}
