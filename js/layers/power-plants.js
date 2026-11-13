// Power plants in view: every plant of 10 MW and up, coloured by fuel.
// Reads the list that ships with GodView (see lib/plants.js), so it always loads.
import { makePointLayer } from './lib/point-layer.js';
import { ICONS } from './lib/icons.js';
import { loadPlants, plantItems, PLANTS_CREDIT } from './lib/plants.js';

export default makePointLayer({
  id: 'powerPlants',
  name: 'Power plants',
  group: 'ground',
  color: '#ffd34d',
  icon: ICONS.bolt,
  label: 'P',
  max: 700,
  view: { maxKm: 4000, radiusKm: 600 },
  attribution: `Power plants: ${PLANTS_CREDIT}`,
  fetch: (ctx) => loadPlants(ctx),
  parse: (d, ctx, q) => plantItems(d, q, null),
  note: () => 'N nuclear · C coal · G gas · H hydro · W wind · S solar. A 2021 list: newer plants are missing.',
});
