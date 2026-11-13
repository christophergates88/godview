// Amtrak trains in service (Amtraker API, an unofficial keyless wrapper around
// Amtrak's public train map data).
import { ENDPOINTS } from '../config.js';
import { makePointLayer } from './lib/point-layer.js';
import { ICONS } from './lib/icons.js';

const HEAD = { N: 0, NE: 45, E: 90, SE: 135, S: 180, SW: 225, W: 270, NW: 315 };

export default makePointLayer({
  id: 'amtrak',
  name: 'Amtrak trains',
  group: 'ground',
  color: '#4da3ff',
  icon: ICONS.train,
  label: 'A',
  heightM: 300,
  followRange: 30000,
  attribution: 'Amtrak trains: Amtraker API (amtraker.com), from Amtrak public data',
  fetch: (ctx) => ctx.net.get(ENDPOINTS.amtrak, { timeoutMs: 20000 }),
  parse: (j, ctx) => Object.values(j || {}).flat().filter((t) => t && t.lat != null).map((t) => {
    const next = (t.stations || []).find((s) => s.status === 'Enroute') || null;
    return {
      key: String(t.trainID || t.trainNum), lat: Number(t.lat), lon: Number(t.lon),
      title: `${t.routeName || 'Amtrak'} ${t.trainNum || ''}`.trim(),
      subtitle: `${t.origName || ''} → ${t.destName || ''}`,
      rows: [
        ['Speed', t.velocity != null ? (ctx.settings.get('units') === 'imperial' ? `${Math.round(t.velocity)} mph` : `${Math.round(t.velocity * 1.609)} km/h`) : '—'],
        ['Heading', HEAD[t.heading] != null ? ctx.fmt.heading(HEAD[t.heading]) : (t.heading || '—')],
        ['Status', t.trainTimely || t.trainState || '—'],
        ['Next stop', next ? next.name : (t.eventName || '—')],
        ['Last update', t.lastValTS ? ctx.fmt.ago(Date.parse(t.lastValTS)) : '—'],
      ],
      link: { href: 'https://www.amtrak.com/track-your-train.html', text: 'Amtrak Track Your Train' },
    };
  }),
});
