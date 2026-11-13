// Satellites: geostationary (CelesTrak group "geo"). See satellites.js.
import { makeSatelliteLayer } from './satellites.js';

export default makeSatelliteLayer({ id: 'satGeo', group: 'geo', name: 'Satellites: geostationary', label: 'geostationary', color: '#ffa07a', tickEvery: 5 });
