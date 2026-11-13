// Day 1 convective (severe thunderstorm) outlook areas from the NOAA Storm
// Prediction Center: thunderstorm, marginal, slight, enhanced, moderate, high.
import { ENDPOINTS } from '../config.js';
import { makeShapeLayer } from './lib/shape-layer.js';
import { ICONS } from './lib/icons.js';

export default makeShapeLayer({
  id: 'spcOutlook',
  name: 'Severe storm outlook',
  group: 'weather',
  color: '#ffd34d',
  icon: ICONS.warning,
  attribution: 'Severe weather outlook: NOAA Storm Prediction Center Day 1 Convective Outlook',
  fetch: (ctx) => ctx.net.get(ENDPOINTS.spcOutlook),
  parse: (gj) => (gj.features || []).filter((f) => f.geometry).map((f, i) => {
    const p = f.properties || {};
    const g = f.geometry;
    const polys = g.type === 'Polygon' ? [g.coordinates] : g.type === 'MultiPolygon' ? g.coordinates : [];
    return {
      key: `${p.LABEL || 'x'}${i}`, polygons: polys, color: p.fill || p.stroke || '#ffd34d', alpha: 0.3,
      title: p.LABEL2 || p.LABEL || 'Outlook area',
      subtitle: 'SPC Day 1 convective outlook',
      rows: [['Category', p.LABEL || '—'], ['Valid', p.VALID || '—'], ['Expires', p.EXPIRE || '—'], ['Issued', p.ISSUE || '—']],
      link: { href: 'https://www.spc.noaa.gov/products/outlook/day1otlk.html', text: 'SPC Day 1 outlook' },
    };
  }),
});
