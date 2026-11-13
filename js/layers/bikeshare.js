// Bike-share docks with live bike/dock counts (GBFS open standard, keyless).
// Shows the supported system nearest the view (list below; add more by URL).
import { makePointLayer } from './lib/point-layer.js';
import { ICONS } from './lib/icons.js';
import { distKm } from './lib/geo.js';

// [name, centre lat, centre lon, GBFS base URL ending in /gbfs/en/]
export const SYSTEMS = [
  ['Citi Bike (New York)', 40.73, -73.99, 'https://gbfs.citibikenyc.com/gbfs/en/'],
  ['Divvy (Chicago)', 41.88, -87.63, 'https://gbfs.divvybikes.com/gbfs/en/'],
  ['Capital Bikeshare (Washington DC)', 38.90, -77.03, 'https://gbfs.capitalbikeshare.com/gbfs/en/'],
  ['Bay Wheels (San Francisco Bay)', 37.78, -122.41, 'https://gbfs.baywheels.com/gbfs/en/'],
  ['Bluebikes (Boston)', 42.36, -71.06, 'https://gbfs.bluebikes.com/gbfs/en/'],
  ['Biketown (Portland)', 45.52, -122.68, 'https://gbfs.biketownpdx.com/gbfs/en/'],
];

export default makePointLayer({
  id: 'bikeshare',
  name: 'Bike share docks',
  group: 'ground',
  color: '#3ee67a',
  icon: ICONS.bike,
  shape: 'point',
  size: 6,
  heightM: 200,
  view: { maxKm: 2500, radiusKm: 150 },
  attribution: 'Bike share: operators\' public GBFS feeds (Lyft: Citi Bike, Divvy, Capital Bikeshare, Bay Wheels, Bluebikes, Biketown)',
  async fetch(ctx, q) {
    const near = SYSTEMS.map((s) => [distKm(q.lat, q.lon, s[1], s[2]), s]).sort((a, b) => a[0] - b[0])[0];
    if (!ctx.test && near[0] > 150) { ctx.setNote(`No supported system in view (nearest: ${near[1][0]})`); return null; }
    const base = near[1][3];
    const [info, status] = await Promise.all([ctx.net.get(base + 'station_information.json'), ctx.net.get(base + 'station_status.json')]);
    return { system: near[1][0], info, status };
  },
  parse(raw) {
    if (!raw) return [];
    const st = new Map(((raw.status.data || {}).stations || []).map((s) => [s.station_id, s]));
    return ((raw.info.data || {}).stations || []).map((s) => {
      const x = st.get(s.station_id) || {};
      const bikes = x.num_bikes_available; const docks = x.num_docks_available;
      return {
        key: s.station_id, lat: s.lat, lon: s.lon,
        color: bikes === 0 ? '#ff4d5e' : bikes < 3 ? '#ffd34d' : '#3ee67a',
        title: s.name, subtitle: raw.system,
        rows: [['Bikes available', bikes != null ? String(bikes) : '—'], ['E-bikes', x.num_ebikes_available != null ? String(x.num_ebikes_available) : '—'], ['Open docks', docks != null ? String(docks) : '—'], ['Capacity', s.capacity != null ? String(s.capacity) : '—']],
      };
    });
  },
  note: (list) => (list[0] ? list[0].subtitle : ''),
});
