// City lights at night (NASA Black Marble composite), via NASA GIBS map tiles.
import { ENDPOINTS } from '../config.js';
import { makeImageryLayer } from './lib/imagery-layer.js';
import { ICONS } from './lib/icons.js';

const url = ENDPOINTS.gibsTile.replace('{layer}', 'VIIRS_Black_Marble').replace('{date}', '2016-01-01')
  .replace('{matrix}', 'GoogleMapsCompatible_Level8').replace('{ext}', 'png');

export default makeImageryLayer({
  id: 'gibsNight',
  name: 'Night lights (Black Marble)',
  group: 'weather',
  color: '#ffd34d',
  icon: ICONS.moon,
  alpha: 0.85,
  attribution: 'Night lights: NASA Black Marble 2016 via NASA EOSDIS GIBS',
  tiles: () => ({ url, maxLevel: 8, credit: 'Night lights: NASA Black Marble', key: 'bm2016', note: '2016 composite (not live)' }),
  testTile: () => url.replace('{z}', '1').replace('{y}', '0').replace('{x}', '0'),
});
