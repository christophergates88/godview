// 3D terrain: real mountains and valleys instead of a smooth ball.
// Uses Esri's World Elevation service, which needs no key. It is a switch more
// than a data feed: on swaps in the globe's ground model, off puts the smooth one back.
import { ENDPOINTS } from '../config.js';
import { ICONS } from './lib/icons.js';

let provider = null;   // the elevation source, created once
let flat = null;       // the smooth globe to go back to
let wanted = true;

export default {
  id: 'terrain3d',
  name: '3D terrain (mountains and valleys)',
  group: 'ground',
  color: '#c9a36b',
  icon: ICONS.perimeter,
  attribution: 'Terrain: Esri World Elevation (Terrain3D); sources include USGS, NGA, NASA and Airbus',

  async fetch(ctx) {
    if (ctx.test) {   // self-test: only prove the service answers, change nothing
      const j = await ctx.net.get(`${ENDPOINTS.terrain}?f=json`);
      if (!j || !j.currentVersion) throw new ctx.net.FeedError('The terrain service did not answer as expected');
      return { test: true };
    }
    if (!provider) provider = await ctx.Cesium.ArcGISTiledElevationTerrainProvider.fromUrl(ENDPOINTS.terrain);
    return { provider };
  },

  count() { return 1; },

  render(ctx, data) {
    if (!flat) flat = new ctx.Cesium.EllipsoidTerrainProvider();
    if (data && data.provider && wanted) ctx.viewer.terrainProvider = data.provider;
    ctx.rec.via = 'direct';
    ctx.setNote('Zoom in on mountains and tilt the view to see the relief');
    if (ctx.requestRender) ctx.requestRender();
    return null;
  },

  show(ctx, on) {
    wanted = on;
    if (!flat) flat = new ctx.Cesium.EllipsoidTerrainProvider();
    ctx.viewer.terrainProvider = on && provider ? provider : flat;
    if (ctx.requestRender) ctx.requestRender();
  },

  describe() { return null; },
};
