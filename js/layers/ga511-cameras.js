// Georgia DOT traffic cameras via Georgia 511. Uses the owner's free 511GA
// developer key (Settings > API keys, name: ga511). Requests go through the data
// relay. 511GA allows 10 calls per minute, so the list is refreshed every 30 min.
import { ENDPOINTS } from '../config.js';
import { makePointLayer } from './lib/point-layer.js';
import { ICONS } from './lib/icons.js';

export default makePointLayer({
  id: 'ga511Cameras',
  name: 'Georgia traffic cameras',
  group: 'ground',
  color: '#7fd8ff',
  icon: ICONS.camera,
  label: 'C',
  needsKey: 'ga511',
  max: 1200,
  attribution: 'Georgia traffic cameras: Georgia DOT / 511GA (511ga.org)',
  fetch: (ctx) => ctx.net.get(ctx.net.fillUrl(ENDPOINTS.ga511Cameras, { key: ctx.key('ga511') }), { timeoutMs: 25000 }),
  parse: (list) => (Array.isArray(list) ? list : []).map((c) => {
    const view = (c.Views || []).find((v) => v.Status !== 'Disabled') || (c.Views || [])[0] || {};
    return {
      key: String(c.Id), lat: Number(c.Latitude), lon: Number(c.Longitude),
      title: c.Location || c.Name || 'Traffic camera',
      say: `Live traffic camera on ${c.Roadway || 'the road'}${c.Direction && c.Direction !== 'None' ? `, facing ${c.Direction.toLowerCase()}` : ''}.`,
      subtitle: [c.Roadway, c.Direction && c.Direction !== 'None' ? c.Direction : ''].filter(Boolean).join(' · '),
      rows: [['Source', c.Source || 'GDOT'], ['Status', view.Status || '—']],
      image: view.Url || null,
      link: view.Url ? { href: view.Url, text: 'Open camera' } : { href: 'https://511ga.org/', text: '511GA' },
    };
  }),
});
