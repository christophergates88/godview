// US volcanoes currently at an elevated alert level (USGS Volcano Hazards Program).
import { ENDPOINTS } from '../config.js';
import { makePointLayer } from './lib/point-layer.js';
import { ICONS } from './lib/icons.js';

const COLOR = { RED: '#ff2d2d', ORANGE: '#ff8a3d', YELLOW: '#ffd34d', GREEN: '#3ee67a' };
const num = (...v) => { for (const x of v) { const n = Number(x); if (x != null && x !== '' && Number.isFinite(n)) return n; } return NaN; };
let missing = 0;

export default makePointLayer({
  id: 'volcanoes',
  name: 'Volcano alerts (US)',
  group: 'hazards',
  color: '#ff3b3b',
  icon: ICONS.volcano,
  label: 'V',
  attribution: 'Volcano alerts: USGS Volcano Hazards Program (HANS)',
  fetch: (ctx) => ctx.net.get(ENDPOINTS.volcanoes),
  parse(list, ctx) {
    const arr = Array.isArray(list) ? list : (list && (list.volcanoes || list.data)) || [];
    missing = 0;
    const out = [];
    for (const v of arr) {
      const lat = num(v.latitude, v.lat, v.Latitude);
      const lon = num(v.longitude, v.long, v.lon, v.Longitude);
      if (!Number.isFinite(lat) || !Number.isFinite(lon)) { missing++; continue; }
      const code = String(v.color_code || v.colorCode || '').toUpperCase();
      out.push({
        key: String(v.vnum || v.volcano_name), lat, lon, color: COLOR[code] || '#ff8a3d',
        title: v.volcano_name || v.volcanoName || 'Volcano',
        subtitle: `${v.alert_level || ''} / aviation ${code || '—'}`,
        rows: [['Alert level', v.alert_level || '—'], ['Aviation colour code', code || '—'], ['Observatory', v.obs_fullname || v.obs_abbr || '—'], ['Last notice', v.sent_utc ? ctx.fmt.time(Date.parse(v.sent_utc + (String(v.sent_utc).endsWith('Z') ? '' : 'Z'))) : '—']],
        link: v.notice_url || v.volcano_url ? { href: v.notice_url || v.volcano_url, text: 'USGS notice' } : { href: 'https://volcanoes.usgs.gov/', text: 'USGS volcanoes' },
      });
    }
    return out;
  },
  note: (list) => [list.length ? '' : 'No US volcanoes above normal', missing ? `${missing} listed without coordinates` : ''].filter(Boolean).join(' · '),
});
