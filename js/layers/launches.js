// Upcoming rocket launches from Launch Library 2 (The Space Devs).
// Free use without a key is limited to 15 requests per hour, so results are
// saved in this browser for 30 minutes and the layer refreshes hourly.
import { ENDPOINTS } from '../config.js';
import { makePointLayer } from './lib/point-layer.js';
import { ICONS } from './lib/icons.js';

export default makePointLayer({
  id: 'launches',
  name: 'Rocket launches',
  group: 'space',
  color: '#ff9f43',
  icon: ICONS.rocket,
  label: 'R',
  defaultOn: true,
  attribution: 'Rocket launches: Launch Library 2 by The Space Devs (thespacedevs.com)',
  async fetch(ctx) {
    const hit = ctx.net.cache.get('launches', 1800);
    if (hit) { ctx.rec.via = 'direct'; return hit.data; }
    const j = await ctx.net.get(ENDPOINTS.launches, { timeoutMs: 20000 });
    if (!ctx.test) ctx.net.cache.set('launches', j);
    return j;
  },
  parse(j, ctx) {
    const seen = new Map();
    const out = [];
    for (const l of (j && j.results) || []) {
      const pad = l.pad || {};
      let lat = Number(pad.latitude); let lon = Number(pad.longitude);
      if (!Number.isFinite(lat) || !Number.isFinite(lon)) continue;
      // Several launches from one pad: fan them out slightly so each can be tapped.
      const k = `${lat},${lon}`;
      const n = seen.get(k) || 0;
      seen.set(k, n + 1);
      if (n) { lat += 0.06 * Math.cos(n * 2.1); lon += 0.06 * Math.sin(n * 2.1); }
      const net = Date.parse(l.net);
      const img = l.image && (l.image.image_url || l.image.thumbnail_url || (typeof l.image === 'string' ? l.image : null));
      out.push({
        key: l.id, lat, lon,
        title: l.name,
        subtitle: `${Number.isFinite(net) ? ctx.fmt.time(net) : 'Date TBD'} · ${l.status?.name || ''}`,
        rows: [
          ['When (NET)', Number.isFinite(net) ? `${ctx.fmt.time(net)}${net > Date.now() ? '' : ' (past)'}` : '—'],
          ['Status', l.status?.name || '—'],
          ['Provider', l.launch_service_provider?.name || '—'],
          ['Rocket', l.rocket?.configuration?.full_name || l.rocket?.configuration?.name || '—'],
          ['Mission', l.mission?.name || '—'],
          ['Orbit', l.mission?.orbit?.name || '—'],
          ['Pad', [pad.name, pad.location?.name].filter(Boolean).join(', ') || '—'],
        ],
        text: l.mission?.description || '',
        image: img || null,
        link: linkFor(l),
        net,
      });
    }
    return out;
  },
  note: (list) => {
    const next = list.filter((l) => l.net > Date.now()).sort((a, b) => a.net - b.net)[0];
    return next ? `Next: ${next.title} ${ctxFree(next.net)}` : '';
  },
});

function ctxFree(ms) {
  const h = (ms - Date.now()) / 3.6e6;
  return h < 48 ? `in ${Math.max(0, Math.round(h))} h` : `in ${Math.round(h / 24)} days`;
}

function linkFor(l) {
  const u = (l.vid_urls || l.vidURLs || [])[0]?.url || (l.info_urls || l.infoURLs || [])[0]?.url;
  return u ? { href: u, text: 'Launch info / stream' } : null;
}
