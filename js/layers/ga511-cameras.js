// Georgia DOT traffic cameras (Georgia 511). No key needed: GodView reads the
// copy of the official feed that the Lookout job rebuilds about every 15
// minutes. With a 511GA key saved in Settings > Keys, the live API is used
// instead (through the data relay). See lib/ga511.js.
import { ENDPOINTS } from '../config.js';
import { makePointLayer } from './lib/point-layer.js';
import { ICONS } from './lib/icons.js';
import { loadFeed, camsFromFeed, camsFromApi, feedAgeMs, ago } from './lib/ga511.js';

const layer = makePointLayer({
  id: 'ga511Cameras',
  name: 'Georgia traffic cameras',
  group: 'ground',
  color: '#7fd8ff',
  icon: ICONS.camera,
  label: 'C',
  max: 1200,
  attribution: 'Georgia traffic cameras: Georgia DOT / 511GA (511ga.org)',
  async fetch(ctx) {
    const key = ctx.key('ga511');
    if (key) {
      try {
        const list = await ctx.net.get(ctx.net.fillUrl(ENDPOINTS.ga511Cameras, { key }), { timeoutMs: 25000 });
        return { live: true, cams: camsFromApi(list) };
      } catch { /* key refused or 511GA unreachable: use the copy below */ }
    }
    const feed = await loadFeed(ctx);
    return { live: false, age: feedAgeMs(feed), cams: camsFromFeed(feed) };
  },
  parse: (d) => (d.cams || []).map((c) => ({
    key: c.id, lat: c.lat, lon: c.lon,
    title: c.name,
    say: `Live traffic camera on ${c.road || 'the road'}${c.dir && /bound$/.test(c.dir) ? `, ${c.dir}` : ''}.`,
    subtitle: [c.road, c.dir].filter(Boolean).join(' · '),
    rows: [['Source', 'Georgia DOT (511GA)'], ['Camera', c.code || c.id], ['Status', c.ok ? 'Working' : 'Offline']],
    image: c.url || null,
    link: c.url ? { href: c.url, text: 'Open camera' } : { href: 'https://511ga.org/', text: '511GA' },
  })),
  note: (items, d) => (d.live ? 'Live list from 511GA' : `Camera list from ${ago(d.age)} · pictures are live`),
});
layer.usesKeys = ['ga511']; // optional (Settings > Keys)
export default layer;
