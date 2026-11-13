// Every nuclear power plant in the world (about 195), from the list that ships
// with GodView (see lib/plants.js), so it always loads.
import { makePointLayer } from './lib/point-layer.js';
import { ICONS } from './lib/icons.js';
import { loadPlants, plantItems, PLANTS_CREDIT } from './lib/plants.js';

export default makePointLayer({
  id: 'nuclear',
  name: 'Nuclear plants',
  group: 'ground',
  color: '#b04dff',
  icon: ICONS.atom,
  label: 'N',
  attribution: `Nuclear plants: ${PLANTS_CREDIT}`,
  fetch: (ctx) => loadPlants(ctx),
  parse: (d) => plantItems(d, null, (p, f) => f.fuels[p[4]] === 'Nuclear'),
  note: () => 'Whole world. A 2021 list: it may include plants that have since closed.',
});
