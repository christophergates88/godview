// NASA satellite picture of the whole Earth from yesterday (VIIRS true colour),
// via NASA GIBS map tiles. Lays over the base map; turn down other layers to see it.
import { ENDPOINTS } from '../config.js';
import { makeImageryLayer } from './lib/imagery-layer.js';
import { ICONS } from './lib/icons.js';

const yesterday = () => new Date(Date.now() - 86400000).toISOString().slice(0, 10);
const url = (date) => ENDPOINTS.gibsTile.replace('{layer}', 'VIIRS_SNPP_CorrectedReflectance_TrueColor').replace('{date}', date)
  .replace('{matrix}', 'GoogleMapsCompatible_Level9').replace('{ext}', 'jpg');

export default makeImageryLayer({
  id: 'gibsTrue',
  name: 'NASA satellite view (daily)',
  group: 'weather',
  color: '#7fd8ff',
  icon: ICONS.image,
  alpha: 0.9,
  attribution: 'Daily satellite imagery: NASA EOSDIS GIBS / Worldview (VIIRS SNPP Corrected Reflectance)',
  tiles: () => { const d = yesterday(); return { url: url(d), maxLevel: 9, credit: 'Imagery: NASA EOSDIS GIBS', key: d, note: `VIIRS true colour, ${d} (gaps between passes are normal)` }; },
  testTile: () => url(yesterday()).replace('{z}', '1').replace('{y}', '0').replace('{x}', '0'),
});
