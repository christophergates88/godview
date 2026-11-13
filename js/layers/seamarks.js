// Sea marks: buoys, lights, beacons and harbour detail from the OpenSeaMap project.
// A picture layer: it only has something to show near coasts, when zoomed in.
import { ENDPOINTS } from '../config.js';
import { makeImageryLayer } from './lib/imagery-layer.js';
import { ICONS } from './lib/icons.js';

export default makeImageryLayer({
  id: 'seamarks',
  name: 'Sea marks: buoys, lights and harbours',
  group: 'sea',
  color: '#62d2ff',
  icon: ICONS.buoy,
  alpha: 1,
  attribution: 'Sea marks: OpenSeaMap (CC BY-SA 2.0), data © OpenStreetMap contributors',
  tiles: () => ({ url: ENDPOINTS.seamarkTiles, maxLevel: 17, credit: 'Sea marks: OpenSeaMap, © OpenStreetMap contributors', key: 'seamarks', note: 'Zoom in on a coast or harbour. Not for navigation.' }),
  testTile: () => ENDPOINTS.seamarkTiles.replace('{z}', '8').replace('{x}', '70').replace('{y}', '103'),
});
