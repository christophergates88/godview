// Georgia road incidents, closures and roadwork (Georgia 511). No key needed:
// GodView reads the copy the Lookout job rebuilds about every 15 minutes; with
// a 511GA key saved in Settings > Keys the live API is used. See lib/ga511.js.
// Road events older than a few hours are never shown as current.
import { ENDPOINTS } from '../config.js';
import { makePointLayer } from './lib/point-layer.js';
import { ICONS } from './lib/icons.js';
import { loadFeed, eventsFromFeed, eventsFromApi, feedAgeMs, ago, FEED_MAX_AGE_EVENTS_MS } from './lib/ga511.js';

const T = { accidentsAndIncidents: ['Incident', '#ff4d5e', '!'], closures: ['Closure', '#ff8a3d', 'X'], roadwork: ['Roadwork', '#ffd34d', 'W'], specialEvents: ['Special event', '#c8a2ff', 'E'] };

const layer = makePointLayer({
  id: 'ga511Events',
  name: 'Georgia road incidents',
  group: 'ground',
  color: '#ff8a3d',
  icon: ICONS.cone,
  label: '!',
  attribution: 'Georgia road events: Georgia DOT / 511GA (511ga.org)',
  async fetch(ctx) {
    const key = ctx.key('ga511');
    if (key) {
      try {
        const list = await ctx.net.get(ctx.net.fillUrl(ENDPOINTS.ga511Events, { key }), { timeoutMs: 25000 });
        return { live: true, events: eventsFromApi(list) };
      } catch { /* key refused or 511GA unreachable: use the copy below */ }
    }
    const feed = await loadFeed(ctx);
    const age = feedAgeMs(feed);
    if (age > FEED_MAX_AGE_EVENTS_MS) throw new ctx.net.FeedError(`Georgia 511 copy is from ${ago(age)}; road events hidden until it updates`);
    return { live: false, age, events: eventsFromFeed(feed) };
  },
  parse: (d, ctx) => (d.events || []).map((e) => {
    const t = T[e.type] || ['Road event', '#ff8a3d', '!'];
    const where = [e.road, e.dir].filter(Boolean).join(' ');
    return {
      key: e.id, lat: e.lat, lon: e.lon, color: t[1], label: t[2],
      title: `${t[0]}${e.road ? ' · ' + e.road : ''}`,
      say: `${t[0]}${where ? ` on ${where}` : ''}${e.sev ? ` (${String(e.sev).toLowerCase()})` : ''}.`,
      subtitle: e.sub || e.dir || '',
      rows: [['Type', t[0]], ['Lanes', e.lanes || '—'], ['Severity', e.sev || '—'], ['Reported', e.reported ? ctx.fmt.time(e.reported) : '—'], ['Last update', e.updated ? ctx.fmt.time(e.updated) : '—']],
      text: e.desc || '',
      link: { href: 'https://511ga.org/', text: '511GA' },
    };
  }),
  note: (items, d) => (d.live ? 'Live from 511GA' : `Georgia 511 copy from ${ago(d.age)}`),
});
layer.usesKeys = ['ga511']; // optional (Settings > Keys)
export default layer;
