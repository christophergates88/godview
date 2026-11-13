// Military aircraft worldwide, as tagged by adsb.lol (/v2/mil). Needs the data relay.
import { ENDPOINTS } from '../config.js';
import { makePointLayer } from './lib/point-layer.js';
import { ICONS } from './lib/icons.js';
import { PROVIDERS } from './flights.js';

const readsb = PROVIDERS.find((p) => p.id === 'airplaneslive');

export default makePointLayer({
  id: 'military',
  name: 'Military aircraft',
  group: 'air',
  color: '#ff6b6b',
  icon: ICONS.shield,
  shape: 'plane',
  attribution: 'Military aircraft: adsb.lol (ODbL) /v2/mil, community ADS-B receivers',
  followRange: 40000,
  max: 2000,
  fetch: (ctx) => ctx.net.get(ENDPOINTS.military, { timeoutMs: 15000 }),
  parse: (raw, ctx) => readsb.parse(raw).map((f) => ({
    key: f.key, lat: f.lat, lon: f.lon, alt: f.onGround ? 30 : Math.max(50, f.altM || 0), rotation: f.track || 0,
    title: f.callsign || String(f.key).toUpperCase(),
    subtitle: [f.type, f.desc].filter(Boolean).join(' · ') || 'Military-tagged aircraft',
    rows: [
      ['Altitude', f.onGround ? 'On ground' : ctx.fmt.altitude(f.altM)],
      ['Speed', ctx.fmt.airspeed(f.speedMs)],
      ['Heading', ctx.fmt.heading(f.track)],
      ['Registration', f.reg || '—'],
      ['ICAO hex', String(f.key).toUpperCase()],
      ['Last report', ctx.fmt.ago(f.seenAt)],
    ],
    link: { href: `https://globe.adsb.lol/?icao=${encodeURIComponent(f.key)}`, text: 'Open in adsb.lol' },
  })),
  note: () => 'Worldwide, as tagged by adsb.lol',
});
