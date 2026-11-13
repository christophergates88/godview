// Railway lines, stations and signals of the world, drawn by the OpenRailwayMap project.
// A picture layer: zoom in to see track detail. Free for personal, low-volume use.
import { ENDPOINTS } from '../config.js';
import { makeImageryLayer } from './lib/imagery-layer.js';
import { ICONS } from './lib/icons.js';

export default makeImageryLayer({
  id: 'rail',
  name: 'Railways of the world',
  group: 'ground',
  color: '#ff8a3d',
  icon: ICONS.train,
  alpha: 0.9,
  attribution: 'Railways: OpenRailwayMap (CC BY-SA 2.0), data © OpenStreetMap contributors',
  tiles: () => ({ url: ENDPOINTS.railTiles, maxLevel: 17, credit: 'Railways: OpenRailwayMap, © OpenStreetMap contributors', key: 'rail', note: 'Main lines show from far out; zoom in for yards, sidings and signals' }),
  testTile: () => ENDPOINTS.railTiles.replace('{z}', '6').replace('{x}', '17').replace('{y}', '25'),
});
