// Weather radar tiles from RainViewer (keyless).
// Free tier since 2026: past 2 hours only, one colour scheme (Universal Blue),
// zoom up to 7, 100 requests per minute per IP.

import { ENDPOINTS } from '../config.js';

const COLOR_SCHEME = 2;    // Universal Blue (the only one still free)
const OPTIONS = '1_1';     // smoothed, snow shown in its own colours
let layer = null;
let currentPath = null;
let frameTime = 0;
let visible = true;

export default {
  id: 'radar',
  name: 'Weather radar',
  color: '#4da3ff',
  icon: '<svg viewBox="0 0 24 24"><g fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"><path d="M7 15a5 5 0 1 1 9.6-2A3.5 3.5 0 1 1 17 20H8a4 4 0 0 1-1-5z"/></g></svg>',
  attribution: 'Weather radar: RainViewer (rainviewer.com)',
  group: 'weather',

  async fetch(ctx) {
    return ctx.net.get(ENDPOINTS.rainviewer);
  },

  count(ctx, data) { return data?.radar?.past?.length || 0;
  },

  render(ctx, data) {
    const { Cesium, viewer } = ctx;
    const past = data && data.radar && data.radar.past;
    if (!data || !data.host || !Array.isArray(past) || !past.length) throw new ctx.net.FeedError('No radar frames available');
    const frame = past[past.length - 1];
    frameTime = frame.time * 1000;
    if (frame.path !== currentPath) {
      const provider = new Cesium.UrlTemplateImageryProvider({
        url: `${data.host}${frame.path}/256/{z}/{x}/{y}/${COLOR_SCHEME}/${OPTIONS}.png`,
        maximumLevel: 7,
        credit: new Cesium.Credit('Radar: RainViewer', true),
      });
      const next = new Cesium.ImageryLayer(provider, { alpha: 0.7 });
      next.show = visible;
      viewer.imageryLayers.add(next);   // added on top of the base map
      if (layer) viewer.imageryLayers.remove(layer, true);
      layer = next;
      currentPath = frame.path;
    }
    ctx.setNote(`Radar frame from ${ctx.fmt.time(frameTime)} · coverage varies by country`);
    return null; // a map layer: no item count
  },

  show(ctx, on) {
    visible = on;
    if (layer) layer.show = on;
  },

  describe() { return null; },
};
