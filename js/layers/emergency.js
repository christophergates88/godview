// Aircraft squawking emergency codes: 7500 (unlawful interference), 7600 (radio
// failure), 7700 (general emergency). From adsb.lol via the data relay.
// Transponder codes are sometimes set by mistake; treat as "reported", not confirmed.
import { ENDPOINTS } from '../config.js';
import { makePointLayer } from './lib/point-layer.js';
import { ICONS } from './lib/icons.js';
import { PROVIDERS, flightSentence } from './flights.js';
import { aircraftDetails } from './lib/aircraft.js';

const readsb = PROVIDERS.find((p) => p.id === 'airplaneslive');
const CODES = { 7500: 'Unlawful interference (hijack)', 7600: 'Radio failure', 7700: 'General emergency' };

export default makePointLayer({
  id: 'emergency',
  name: 'Emergency squawks',
  group: 'air',
  color: '#ff2d55',
  icon: ICONS.siren,
  shape: 'plane',
  attribution: 'Emergency squawks: adsb.lol (ODbL) /v2/sqk',
  followRange: 40000,
  async fetch(ctx) {
    const out = [];
    for (const code of Object.keys(CODES)) {
      const j = await ctx.net.get(ctx.net.fillUrl(ENDPOINTS.squawk, { code }), { timeoutMs: 12000 });
      out.push(...readsb.parse(j).map((f) => ({ ...f, squawk: f.squawk || code })));
    }
    return out;
  },
  parse: (list, ctx) => list.map((f) => ({
    key: f.key, lat: f.lat, lon: f.lon, alt: f.onGround ? 30 : Math.max(50, f.altM || 0), rotation: f.track || 0,
    altM: f.altM, speedMs: f.speedMs, type: f.type, cat: f.cat, onGround: f.onGround,
    title: `${f.callsign || String(f.key).toUpperCase()} · squawk ${f.squawk}`,
    say: flightSentence({ ...f, special: true }, null, ctx),
    _f: { ...f, special: true },
    subtitle: CODES[f.squawk] || 'Emergency code',
    rows: [
      ['Code meaning', CODES[f.squawk] || '—'],
      ['Altitude', f.onGround ? 'On ground' : ctx.fmt.altitude(f.altM)],
      ['Speed', ctx.fmt.airspeed(f.speedMs)],
      ['Type', [f.type, f.desc].filter(Boolean).join(' · ') || '—'],
      ['Last report', ctx.fmt.ago(f.seenAt)],
    ],
    text: 'Codes are occasionally entered by mistake or during tests. This is what the transponder reports, not a confirmed emergency.',
    link: { href: `https://globe.adsb.lol/?icao=${encodeURIComponent(f.key)}`, text: 'Open in adsb.lol' },
  })),
  note: (list) => (list.length ? '' : 'None right now (worldwide)'),
  async details(it, ctx) {
    const d = await aircraftDetails(ctx, it.key, it._f.callsign);
    return { say: flightSentence(it._f, d, ctx), rows: d.rows, image: d.photo?.src, credit: d.credit };
  },
});
