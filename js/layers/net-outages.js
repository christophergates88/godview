// Internet disruption signals by country, from IODA (Georgia Tech). IODA watches
// three kinds of signal for each country: routing announcements, replies to probes,
// and traffic to Google. A drop in one alone is often noise; two or more together
// is a stronger sign that people there have lost their connection.
import { ENDPOINTS } from '../config.js';
import { makePointLayer } from './lib/point-layer.js';
import { ICONS } from './lib/icons.js';

const SIGNAL = { bgp: 'routing', 'ping-slash24': 'probe replies', 'merit-nt': 'background traffic', gtr: 'Google traffic', 'gtr-norm': 'Google traffic' };
let centroids = null;
async function countries(ctx) {
  if (!centroids) centroids = (await ctx.net.get(new URL('../data/countries.json', import.meta.url).href)).c;
  return centroids;
}

export default makePointLayer({
  id: 'netOutages',
  name: 'Internet disruptions by country (IODA)',
  group: 'signals',
  color: '#ffb020',
  icon: ICONS.antenna,
  label: '1',
  attribution: 'Internet disruption signals: IODA, Internet Intelligence Lab, Georgia Tech (ioda.live)',
  async fetch(ctx) {
    const now = Math.floor(Date.now() / 1000);
    const [ev, cc] = await Promise.all([
      ctx.net.get(ctx.net.fillUrl(ENDPOINTS.ioda, { from: now - 86400, until: now }), { timeoutMs: 20000 }),
      countries(ctx),
    ]);
    return { ev, cc, now };
  },
  parse({ ev, cc, now }, ctx) {
    const by = {};
    for (const e of (ev && ev.data) || []) {
      const code = String(e.location || '').split('/')[1];
      if (!code || !cc[code] || !(e.duration >= 1800)) continue;       // ignore blips under half an hour
      const end = e.start + e.duration;
      if (end < now - 86400) continue;
      const c = by[code] || (by[code] = { code, name: e.location_name || cc[code][2], signals: new Set(), start: e.start, end, live: false });
      c.signals.add(SIGNAL[e.datasource] || e.datasource);
      c.start = Math.min(c.start, e.start); c.end = Math.max(c.end, end);
      if (end >= now - 1800) c.live = true;
    }
    return Object.values(by).map((c) => {
      const n = c.signals.size; const hours = Math.max(0.5, (c.end - c.start) / 3600);
      return {
        key: c.code, lat: cc[c.code][0], lon: cc[c.code][1], label: String(n), color: n >= 2 ? '#ff4d5e' : '#ffb020', rank: n,
        title: `Internet disruption signal: ${c.name}`,
        subtitle: `${n} of 3 signals dropped${c.live ? ' · still going' : ''}`,
        rows: [
          ['Signals that dropped', Array.from(c.signals).join(', ')],
          ['How sure', n >= 2 ? 'Fairly: more than one signal agrees' : 'Not very: one signal alone is often noise'],
          ['Began', ctx.fmt.ago(c.start * 1000)],
          ['Lasted', hours >= 48 ? `${Math.round(hours / 24)} days` : `${hours.toFixed(hours < 10 ? 1 : 0)} hours`],
          ['Still going', c.live ? 'Yes' : 'No'],
        ],
        link: { href: `https://ioda.inetintel.cc.gatech.edu/country/${c.code}`, text: 'IODA charts for this country' },
      };
    }).sort((a, b) => a.rank - b.rank);
  },
  note: (list) => `${list.filter((x) => x.rank >= 2).length} countries with two or more signals down in the last day`,
});
