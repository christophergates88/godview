// Nuclear power plants in a wide area around the view, from OpenStreetMap.
import { makePointLayer } from './lib/point-layer.js';
import { ICONS } from './lib/icons.js';
import { overpass, where, tagRows } from './lib/overpass.js';

export default makePointLayer({
  id: 'nuclear',
  name: 'Nuclear plants',
  group: 'ground',
  color: '#b04dff',
  icon: ICONS.atom,
  label: 'N',
  view: { maxKm: 8000, radiusKm: 1000 },
  attribution: 'Nuclear plants: © OpenStreetMap contributors (ODbL), via Overpass API',
  fetch: (ctx, q) => overpass(ctx, q, ['nwr["power"="plant"]["plant:source"="nuclear"]'], 200),
  parse: (j) => (j.elements || []).map((el) => {
    const t = el.tags || {};
    return {
      key: `${el.type}${el.id}`, ...where(el),
      title: t.name || 'Nuclear power plant', subtitle: t.operator || 'Nuclear power plant',
      rows: tagRows(t, [['plant:output:electricity', 'Output'], ['operator', 'Operator'], ['start_date', 'Opened']]),
      link: { href: `https://www.openstreetmap.org/${el.type}/${el.id}`, text: 'OpenStreetMap' },
    };
  }),
});
