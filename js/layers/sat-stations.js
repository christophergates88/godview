// Satellites: space stations (CelesTrak group "stations"). See satellites.js.
import { makeSatelliteLayer } from './satellites.js';

export default makeSatelliteLayer({ id: 'satStations', group: 'stations', name: 'Satellites: space stations', label: 'space stations', color: '#ff7ad9', passes: true });
