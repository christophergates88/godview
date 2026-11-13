// gibsLayer: a whole-Earth picture layer from NASA GIBS that always shows the
// newest frame NASA has published. Asking GIBS for the date "default" returns
// the latest time it has for that product, so there is no date arithmetic to
// get wrong. The layer is rebuilt every `every` minutes to pick up new frames.
//
// spec = { id, name, layer (NASA's product name), level (deepest zoom NASA offers),
//          ext ('png' | 'jpg'), every (minutes; 0 = never changes), alpha, color, icon, note, group }
import { ENDPOINTS } from '../../config.js';
import { makeImageryLayer } from './imagery-layer.js';
import { ICONS } from './icons.js';

export function gibsLayer(s) {
  const bucket = () => (s.every ? Math.floor(Date.now() / (s.every * 60000)) : 0);
  const url = () => ENDPOINTS.gibsTile.replace('{layer}', s.layer).replace('{date}', 'default')
    .replace('{matrix}', `GoogleMapsCompatible_Level${s.level}`).replace('{ext}', s.ext || 'png');
  return makeImageryLayer({
    id: s.id, name: s.name, group: s.group || 'orbit', color: s.color || '#7fd8ff', icon: s.icon || ICONS.image,
    alpha: s.alpha ?? 0.85,
    attribution: `${s.name}: NASA EOSDIS GIBS / Worldview (${s.layer})`,
    tiles: () => ({ url: url(), maxLevel: s.level, credit: 'Imagery: NASA EOSDIS GIBS', key: `${s.id}:${bucket()}`, note: s.note }),
    testTile: () => url().replace('{z}', '1').replace('{y}', '0').replace('{x}', '0'),
  });
}
