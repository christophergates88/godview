// Georgia road incidents, closures and roadwork via Georgia 511 (owner's free key).
import { ENDPOINTS } from '../config.js';
import { makePointLayer } from './lib/point-layer.js';
import { ICONS } from './lib/icons.js';

const T = { accidentsAndIncidents: ['Incident', '#ff4d5e', '!'], closures: ['Closure', '#ff8a3d', 'X'], roadwork: ['Roadwork', '#ffd34d', 'W'], specialEvents: ['Special event', '#c8a2ff', 'E'] };

export default makePointLayer({
  id: 'ga511Events',
  name: 'Georgia road incidents',
  group: 'ground',
  color: '#ff8a3d',
  icon: ICONS.cone,
  label: '!',
  needsKey: 'ga511',
  attribution: 'Georgia road events: Georgia DOT / 511GA (511ga.org)',
  fetch: (ctx) => ctx.net.get(ctx.net.fillUrl(ENDPOINTS.ga511Events, { key: ctx.key('ga511') }), { timeoutMs: 25000 }),
  parse: (list, ctx) => (Array.isArray(list) ? list : []).map((e) => {
    const t = T[e.EventType] || ['Road event', '#ff8a3d', '!'];
    const ts = (v) => (typeof v === 'number' ? v * (v < 1e12 ? 1000 : 1) : Date.parse(v));
    return {
      key: String(e.ID ?? e.Id), lat: Number(e.Latitude), lon: Number(e.Longitude), color: t[1], label: t[2],
      title: `${t[0]}${e.RoadwayName ? ' · ' + e.RoadwayName : ''}`,
      subtitle: e.Subtype || e.DirectionOfTravel || '',
      rows: [['Type', t[0]], ['Lanes', e.LanesAffected || '—'], ['Severity', e.Severity || '—'], ['Reported', e.Reported ? ctx.fmt.time(ts(e.Reported)) : '—'], ['Last update', e.LastUpdated ? ctx.fmt.time(ts(e.LastUpdated)) : '—']],
      text: e.Description || '',
      link: { href: 'https://511ga.org/', text: '511GA' },
    };
  }),
});
