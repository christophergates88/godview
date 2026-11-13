// Satellites: GPS (CelesTrak group "gps-ops"). See satellites.js.
import { makeSatelliteLayer } from './satellites.js';

export default makeSatelliteLayer({ id: 'satGps', group: 'gps-ops', name: 'Satellites: GPS', label: 'GPS', color: '#9dff7a' });
