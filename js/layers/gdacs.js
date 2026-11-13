// Disaster alerts for the whole world from GDACS (United Nations and European
// Commission): earthquakes, cyclones, floods, volcanoes, droughts and wildfires,
// each graded green, orange or red by how many people it is likely to affect.
import { ENDPOINTS } from '../config.js';
import { makePointLayer } from './lib/point-layer.js';
import { ICONS } from './lib/icons.js';
import { isoDate } from './lib/geo.js';

const TYPE = { EQ: ['Earthquake', 'Q'], TC: ['Tropical cyclone', 'C'], FL: ['Flood', 'F'], VO: ['Volcano', 'V'], DR: ['Drought', 'D'], WF: ['Wildfire', 'W'] };
const LEVEL = { Red: '#ff4d5e', Orange: '#ffb020', Green: '#3ee67a' };
const RANK = { Green: 0, Orange: 1, Red: 2 };

export default makePointLayer({
  id: 'gdacs',
  name: 'World disaster alerts (GDACS)',
  group: 'hazards',
  color: '#ffb020',
  icon: ICONS.warning,
  label: '!',
  attribution: 'Disaster alerts: GDACS, a United Nations and European Commission service (gdacs.org)',
  fetch: (ctx) => ctx.net.get(ctx.net.fillUrl(ENDPOINTS.gdacs, {
    from: isoDate(new Date(Date.now() - 10 * 86400000)), to: isoDate(new Date(Date.now() + 86400000)),
  }), { timeoutMs: 20000 }),
  parse(j, ctx) {
    const out = [];
    for (const f of (j && j.features) || []) {
      const p = f.properties || {};
      if (!f.geometry || f.geometry.type !== 'Point') continue;
      const level = p.alertlevel || 'Green';
      // Green wildfires and droughts are routine and would bury the map; keep the ones that matter.
      if (level === 'Green' && (p.eventtype === 'WF' || p.eventtype === 'DR')) continue;
      const t = TYPE[p.eventtype] || [p.eventtype || 'Event', '!'];
      const when = Date.parse(`${p.fromdate || ''}Z`);
      const sev = p.severitydata && p.severitydata.severitytext;
      out.push({
        key: `${p.eventtype}${p.eventid}`, lat: f.geometry.coordinates[1], lon: f.geometry.coordinates[0],
        color: LEVEL[level] || LEVEL.Green, label: t[1], rank: RANK[level] || 0,
        title: p.name || p.description || t[0],
        subtitle: `${level} alert${p.country ? ` · ${p.country}` : ''}`,
        rows: [
          ['Kind', t[0]],
          ['Alert level', `${level}${level === 'Green' ? ' (limited impact expected)' : level === 'Orange' ? ' (may need outside help)' : ' (severe, likely to need outside help)'}`],
          ['Began', Number.isFinite(when) ? ctx.fmt.ago(when) : '—'],
          ...(sev ? [['Strength', sev]] : []),
          ['Still going', p.iscurrent === 'true' ? 'Yes' : 'No'],
        ],
        link: p.url && p.url.report ? { href: p.url.report, text: 'GDACS report' } : null,
      });
    }
    return out.sort((a, b) => a.rank - b.rank);   // red drawn last, on top
  },
  note(list) {
    const n = (c) => list.filter((x) => x.color === LEVEL[c]).length;
    return `${n('Red')} red, ${n('Orange')} orange, ${n('Green')} green in the last 10 days`;
  },
});
