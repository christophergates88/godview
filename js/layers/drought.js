// US Drought Monitor: this week's drought areas (D0 abnormally dry to D4
// exceptional). Large file; needs the data relay.
import { ENDPOINTS } from '../config.js';
import { makeShapeLayer } from './lib/shape-layer.js';
import { ICONS } from './lib/icons.js';

const DM = [['D0 Abnormally dry', '#ffff00'], ['D1 Moderate drought', '#fcd37f'], ['D2 Severe drought', '#ffaa00'], ['D3 Extreme drought', '#e60000'], ['D4 Exceptional drought', '#730000']];

export default makeShapeLayer({
  id: 'drought',
  name: 'Drought (US)',
  group: 'hazards',
  color: '#ffaa00',
  icon: ICONS.drought,
  max: 60,
  attribution: 'Drought: U.S. Drought Monitor (NDMC, USDA, NOAA), droughtmonitor.unl.edu',
  fetch: (ctx) => ctx.net.get(ENDPOINTS.drought, { timeoutMs: 30000 }),
  parse: (gj) => (gj.features || []).filter((f) => f.geometry).map((f, i) => {
    const p = f.properties || {};
    const d = Number(p.DM ?? p.dm);
    const [name, color] = DM[d] || ['Drought area', '#ffaa00'];
    const g = f.geometry;
    return {
      key: `dm${d}_${i}`, color, alpha: 0.3,
      polygons: g.type === 'Polygon' ? [g.coordinates] : g.type === 'MultiPolygon' ? g.coordinates : [],
      title: name, subtitle: 'U.S. Drought Monitor, this week',
      rows: [['Category', name]],
      link: { href: 'https://droughtmonitor.unl.edu/', text: 'U.S. Drought Monitor' },
    };
  }),
});
