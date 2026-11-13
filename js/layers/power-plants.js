// Power plants in view, from OpenStreetMap (Overpass API).
import { makePointLayer } from './lib/point-layer.js';
import { ICONS } from './lib/icons.js';
import { overpass, where, tagRows } from './lib/overpass.js';

const SRC = { nuclear: '#b04dff', coal: '#8b97a5', gas: '#ff8a3d', oil: '#a0785a', hydro: '#3d7bff', wind: '#7fd8ff', solar: '#ffd34d', biomass: '#3ee67a', geothermal: '#ff4d5e' };

export default makePointLayer({
  id: 'powerPlants',
  name: 'Power plants',
  group: 'ground',
  color: '#ffd34d',
  icon: ICONS.bolt,
  label: 'P',
  view: { maxKm: 1500, radiusKm: 150 },
  attribution: 'Power plants: © OpenStreetMap contributors (ODbL), via Overpass API',
  fetch: (ctx, q) => overpass(ctx, q, ['nwr["power"="plant"]'], 500),
  parse: (j) => (j.elements || []).map((el) => {
    const t = el.tags || {};
    const src = (t['plant:source'] || '').split(';')[0];
    return {
      key: `${el.type}${el.id}`, ...where(el), color: SRC[src] || '#ffd34d', label: (src[0] || 'P').toUpperCase(),
      title: t.name || 'Power plant', subtitle: src ? `${src} power plant` : 'Power plant',
      rows: tagRows(t, [['plant:source', 'Source'], ['plant:output:electricity', 'Output'], ['operator', 'Operator'], ['start_date', 'Opened']]),
      link: { href: `https://www.openstreetmap.org/${el.type}/${el.id}`, text: 'OpenStreetMap' },
    };
  }),
});
