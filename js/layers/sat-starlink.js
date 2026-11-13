// Satellites: Starlink (CelesTrak group "starlink"). See satellites.js.
import { makeSatelliteLayer } from './satellites.js';

export default makeSatelliteLayer({ id: 'satStarlink', group: 'starlink', name: 'Satellites: Starlink', label: 'Starlink', color: '#c9d6ff', tickEvery: 3 });
