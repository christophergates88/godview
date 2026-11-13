// TEMPLATE for a new layer. Copy this file, rename it, fill it in, then add it
// to the list in layers/index.js. Also add an interval for it in config.js
// INTERVALS (e.g. myLayer: { def: 300, min: 60 }) and its URL in ENDPOINTS.
//
// This example would show points from a GeoJSON feed of Point features.

const URL = 'https://example.com/feed.geojson'; // better: put it in config.js ENDPOINTS

const items = new Map();   // key -> the item's data (used by describe)
let points = null;

export default {
  id: 'example',
  name: 'Example points',
  color: '#7fd8ff',
  icon: '<svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="6"/></svg>',
  attribution: 'Example data source',

  init(ctx) {
    points = ctx.primitives.add(new ctx.Cesium.PointPrimitiveCollection());
  },

  async fetch(ctx) {
    return ctx.net.fetchJSON(URL); // throws a readable error if it fails
  },

  render(ctx, data) {
    const { Cesium } = ctx;
    points.removeAll();
    items.clear();
    for (const f of data.features || []) {
      if (!f.geometry || f.geometry.type !== 'Point') continue;
      const [lon, lat] = f.geometry.coordinates;
      const key = String(f.id);
      items.set(key, { lat, lon, props: f.properties || {} });
      points.add({
        id: { layer: 'example', key },          // this is what makes it tappable
        position: Cesium.Cartesian3.fromDegrees(lon, lat, 1000),
        pixelSize: 10,
        color: Cesium.Color.fromCssColorString('#7fd8ff'),
      });
    }
    return items.size;
  },

  describe(ctx, key) {
    const it = items.get(key);
    if (!it) return null;
    return {
      title: it.props.name || 'Point',
      subtitle: ctx.fmt.latlon(it.lat, it.lon),
      rows: [['Example', 'value']],
      link: null,
    };
  },
};
