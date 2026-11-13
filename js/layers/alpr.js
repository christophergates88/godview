// Automatic licence plate reader (ALPR) cameras mapped by volunteers in
// OpenStreetMap (e.g. via DeFlock). Coverage is incomplete and varies by area.
// RELIABILITY: no dependable alternative source was found (DeFlock publishes no
// open dataset; it reads OpenStreetMap too), so this layer depends on the public
// Overpass servers, which are often down. It is kept out of every mode.
import { makePointLayer } from './lib/point-layer.js';
import { ICONS } from './lib/icons.js';
import { overpass, where, tagRows } from './lib/overpass.js';

export default makePointLayer({
  id: 'alpr',
  name: 'Plate-reader cameras (ALPR)',
  group: 'ground',
  color: '#ff4d5e',
  icon: ICONS.eye,
  shape: 'point',
  size: 7,
  heightM: 100,
  view: { maxKm: 800, radiusKm: 120 },
  attribution: 'ALPR cameras: © OpenStreetMap contributors (ODbL), via Overpass API; volunteer-mapped',
  fetch: (ctx, q) => overpass(ctx, q, ['node["surveillance:type"="ALPR"]'], 2000),
  parse: (j) => (j.elements || []).map((el) => {
    const t = el.tags || {};
    return {
      key: `n${el.id}`, ...where(el),
      title: 'Plate-reader camera (ALPR)', subtitle: [t.operator, t.manufacturer || t.brand].filter(Boolean).join(' · ') || 'Mapped in OpenStreetMap',
      rows: tagRows(t, [['operator', 'Operator'], ['manufacturer', 'Maker'], ['brand', 'Brand'], ['direction', 'Facing'], ['surveillance:zone', 'Zone']]),
      link: { href: `https://www.openstreetmap.org/node/${el.id}`, text: 'OpenStreetMap' },
    };
  }),
  note: () => 'Volunteer-mapped; source (OpenStreetMap Overpass) is often unavailable: not in any mode',
});
