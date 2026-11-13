// Active tropical cyclones in the Atlantic and Pacific from the NOAA National
// Hurricane Center (needs the data relay). Empty when nothing is active.
import { ENDPOINTS } from '../config.js';
import { makePointLayer } from './lib/point-layer.js';
import { ICONS } from './lib/icons.js';

const CLASS = { HU: 'Hurricane', TS: 'Tropical storm', TD: 'Tropical depression', STS: 'Subtropical storm', STD: 'Subtropical depression', PTC: 'Potential tropical cyclone', PC: 'Post-tropical cyclone', TY: 'Typhoon' };

export default makePointLayer({
  id: 'hurricanes',
  name: 'Hurricanes & tropical storms',
  group: 'weather',
  color: '#ff4dd2',
  icon: ICONS.hurricane,
  label: '@',
  attribution: 'Tropical cyclones: NOAA National Hurricane Center (nhc.noaa.gov)',
  fetch: (ctx) => ctx.net.get(ENDPOINTS.nhc),
  parse: (j, ctx) => (j.activeStorms || []).map((s) => ({
    key: s.id, lat: Number(s.latitudeNumeric), lon: Number(s.longitudeNumeric),
    title: `${CLASS[s.classification] || s.classification || 'Storm'} ${s.name || ''}`.trim(),
    subtitle: `Updated ${s.lastUpdate ? ctx.fmt.time(Date.parse(s.lastUpdate)) : '—'}`,
    rows: [
      ['Max wind', s.intensity ? `${s.intensity} kt` : '—'],
      ['Pressure', s.pressure ? `${s.pressure} mb` : '—'],
      ['Moving', s.movementDir != null ? `${ctx.fmt.heading(Number(s.movementDir))} at ${s.movementSpeed} mph` : '—'],
    ],
    link: s.publicAdvisory?.url ? { href: s.publicAdvisory.url, text: 'NHC public advisory' } : { href: 'https://www.nhc.noaa.gov/', text: 'National Hurricane Center' },
  })),
  note: (list) => (list.length ? '' : 'No active storms (Atlantic/East & Central Pacific)'),
});
