// US weather radar at full detail: the national NEXRAD mosaic, redrawn every 5 minutes
// by the Iowa Environmental Mesonet. Sharper than the worldwide radar layer, US only.
import { ENDPOINTS } from '../config.js';
import { makeImageryLayer } from './lib/imagery-layer.js';
import { ICONS } from './lib/icons.js';

let valid = null; // time of the picture, from the provider's own index

const base = makeImageryLayer({
  id: 'nexrad',
  name: 'US radar, full detail (NEXRAD)',
  group: 'weather',
  color: '#3ee67a',
  icon: ICONS.cloud,
  alpha: 0.75,
  attribution: 'US radar mosaic: Iowa Environmental Mesonet, Iowa State University, from NWS NEXRAD',
  tiles: (ctx) => ({
    url: ENDPOINTS.nexradTiles, maxLevel: 10, credit: 'Radar: Iowa Environmental Mesonet / NWS',
    key: `nexrad:${valid || Math.floor(Date.now() / 300000)}`,
    note: valid ? `Picture from ${ctx.fmt.ago(valid)}` : 'Newest national picture (a new one every 5 minutes)',
  }),
  testTile: () => ENDPOINTS.nexradTiles.replace('{z}', '4').replace('{x}', '4').replace('{y}', '6'),
});

export default {
  ...base,
  async fetch(ctx) {
    try {
      const m = await ctx.net.get(ENDPOINTS.nexradMeta, { timeoutMs: 8000 });
      const s = (m.services || []).find((x) => x.id === 'ridge_uscomp_n0q');
      valid = s && s.utc_valid ? Date.parse(s.utc_valid) : null;
    } catch { valid = null; }   // the picture still loads without its time stamp
    return base.fetch(ctx);
  },
};
