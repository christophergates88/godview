// TEMPLATE for a new layer. Copy this file, rename it, fill it in, then:
//   1. add one import + one entry in layers/index.js
//   2. add its refresh interval in config.js INTERVALS (e.g. myLayer: { def: 300, min: 60 })
//   3. put its URL in config.js ENDPOINTS
//   4. if the browser blocks the host (CORS), add the host to config.js RELAY_HOSTS
//      AND to ALLOWED_HOSTS in extras/flight-relay-worker.js, then redeploy the worker.
//
// This example shows points from a GeoJSON feed of Point features.

import { makePointLayer } from './lib/point-layer.js';
import { ICONS } from './lib/icons.js';

const URL = 'https://example.com/feed.geojson'; // better: put it in config.js ENDPOINTS

export default makePointLayer({
  id: 'example',
  name: 'Example points',
  group: 'signals',          // which panel group it appears in
  color: '#7fd8ff',
  icon: ICONS.pin,
  label: 'E',                // badge letter; or shape: 'point'
  attribution: 'Example data source',
  // view: { maxKm: 1500, radiusKm: 200 },   // uncomment for "only the area in view"
  // needsKey: 'myservice',                    // uncomment if it needs a free key (config KEYS)

  fetch: (ctx, q) => ctx.net.get(URL),       // q = { lat, lon, radiusKm } of the view

  parse: (data, ctx) => (data.features || []).map((f) => ({
    key: String(f.id),
    lat: f.geometry.coordinates[1],
    lon: f.geometry.coordinates[0],
    title: f.properties.name || 'Point',
    rows: [['Example', 'value']],
    link: null,
  })),
});
