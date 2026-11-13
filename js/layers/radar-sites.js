// Every NEXRAD weather radar in the US and whether it is working right now:
// operating state, alarms and how long ago it last sent data (National Weather Service).
import { ENDPOINTS } from '../config.js';
import { makePointLayer } from './lib/point-layer.js';
import { ICONS } from './lib/icons.js';

export default makePointLayer({
  id: 'radarSites',
  name: 'Weather radar sites and their status',
  group: 'weather',
  color: '#3ee67a',
  icon: ICONS.antenna,
  shape: 'point',
  size: 8,
  attribution: 'Radar site status: US National Weather Service (api.weather.gov)',
  fetch: (ctx) => ctx.net.get(ENDPOINTS.radarSites, { timeoutMs: 20000 }),
  parse(j, ctx) {
    const now = Date.now(); const out = [];
    for (const f of (j && j.features) || []) {
      const p = f.properties || {}; const g = f.geometry; if (!g || !p.id) continue;
      const rda = (p.rda && p.rda.properties) || {}; const lat = p.latency || {};
      const last = Date.parse(lat.levelTwoLastReceivedTime || '');
      const stale = !Number.isFinite(last) || now - last > 20 * 60000;
      const alarms = rda.alarmSummary && rda.alarmSummary !== 'No Alarms';
      const up = rda.status === 'Operate' && !stale;
      const state = stale ? 'down' : !up ? 'limited' : alarms ? 'alarm' : 'ok';
      out.push({
        key: p.id, lat: g.coordinates[1], lon: g.coordinates[0], state,
        color: state === 'ok' ? '#3ee67a' : state === 'down' ? '#ff4d5e' : '#ffb020',
        title: `${p.name || p.id} weather radar (${p.id})`,
        subtitle: state === 'ok' ? 'Working normally' : state === 'down' ? 'Not sending data' : state === 'alarm' ? 'Working, with an alarm showing' : 'Not in normal operation',
        rows: [
          ['State', rda.status || '—'],
          ['Alarms', rda.alarmSummary || '—'],
          ['Last data', Number.isFinite(last) ? ctx.fmt.ago(last) : 'unknown'],
          ...(rda.mode ? [['Mode', rda.mode]] : []),
          ...(rda.generatorState ? [['Power', rda.generatorState]] : []),
        ],
        link: { href: `https://radar.weather.gov/station/${String(p.id).toLowerCase()}/standard`, text: 'This radar\'s live picture' },
      });
    }
    return out;
  },
  note: (list) => { const bad = list.filter((x) => x.state !== 'ok').length; return bad ? `${bad} of ${list.length} radars not working normally` : `All ${list.length} radars working normally`; },
});
