// Submarine internet cables (TeleGeography Submarine Cable Map, CC BY-NC-SA).
// Routes are approximate. Needs the data relay.
import { ENDPOINTS } from '../config.js';
import { makeShapeLayer } from './lib/shape-layer.js';
import { ICONS } from './lib/icons.js';

export default makeShapeLayer({
  id: 'cables',
  name: 'Submarine cables',
  group: 'ground',
  color: '#3ee6c4',
  icon: ICONS.cable,
  max: 700,
  attribution: 'Submarine cables: TeleGeography Submarine Cable Map (CC BY-NC-SA 3.0)',
  async fetch(ctx) {
    const hit = ctx.net.cache.get('cables', 86400 * 7);
    if (hit) return hit.data;
    const j = await ctx.net.get(ENDPOINTS.cables, { timeoutMs: 30000 });
    return j;
  },
  parse: (gj) => (gj.features || []).filter((f) => f.geometry).map((f, i) => {
    const p = f.properties || {};
    const g = f.geometry;
    return {
      key: String(p.id || p.feature_id || i), color: p.color || '#3ee6c4', width: 1.5,
      lines: g.type === 'LineString' ? [g.coordinates] : g.type === 'MultiLineString' ? g.coordinates : [],
      title: p.name || 'Submarine cable', subtitle: 'Approximate route',
      link: p.id ? { href: `https://www.submarinecablemap.com/submarine-cable/${encodeURIComponent(p.id)}`, text: 'Submarine Cable Map' } : null,
    };
  }),
});
