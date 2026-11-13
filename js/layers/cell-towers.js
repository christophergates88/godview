// Communication towers and masts in view, from OpenStreetMap (small areas only).
import { makePointLayer } from './lib/point-layer.js';
import { ICONS } from './lib/icons.js';
import { overpass, where, tagRows } from './lib/overpass.js';

export default makePointLayer({
  id: 'cellTowers',
  name: 'Comms towers',
  group: 'ground',
  color: '#c8a2ff',
  icon: ICONS.antenna,
  shape: 'point',
  size: 6,
  heightM: 150,
  view: { maxKm: 300, radiusKm: 40 },
  attribution: 'Communication towers: © OpenStreetMap contributors (ODbL), via Overpass API',
  fetch: (ctx, q) => overpass(ctx, q, ['nwr["tower:type"="communication"]', 'nwr["communication:mobile_phone"="yes"]'], 1500),
  parse: (j) => (j.elements || []).map((el) => {
    const t = el.tags || {};
    return {
      key: `${el.type}${el.id}`, ...where(el),
      title: t.name || 'Communication tower', subtitle: t.operator || t['tower:construction'] || 'Mapped in OpenStreetMap',
      rows: tagRows(t, [['operator', 'Operator'], ['height', 'Height'], ['communication:mobile_phone', 'Mobile phone'], ['communication:television', 'TV'], ['communication:radio', 'Radio']]),
      link: { href: `https://www.openstreetmap.org/${el.type}/${el.id}`, text: 'OpenStreetMap' },
    };
  }),
});
