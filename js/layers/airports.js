// Major airports from the built-in reference list (no network needed).
import { makePointLayer } from './lib/point-layer.js';
import { ICONS } from './lib/icons.js';
import { AIRPORTS } from './lib/airports.js';

export default makePointLayer({
  id: 'airports',
  name: 'Major airports',
  group: 'air',
  color: '#d6dde6',
  icon: ICONS.tower,
  label: '✈',
  computed: true,
  attribution: 'Major airports: built-in reference list (approximate positions)',
  fetch: async () => AIRPORTS,
  parse: (list) => list.map(([code, name, lat, lon]) => ({
    key: code, lat, lon, title: `${code} · ${name}`, subtitle: 'Major airport',
    rows: [['Code', code]],
    link: { href: `https://www.flightaware.com/live/airport/${code.length === 3 ? 'K' + code : code}`, text: 'Airport on FlightAware' },
  })),
});
