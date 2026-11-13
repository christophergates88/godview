// Satellite fire detections from the last 48 hours for the area in view: NASA
// FIRMS VIIRS hot spots, served without a key by Esri's Living Atlas map
// service (updated as new satellite passes arrive). No key needed.
import { ENDPOINTS } from '../config.js';
import { makePointLayer } from './lib/point-layer.js';
import { ICONS } from './lib/icons.js';
import { arcgisBox } from './lib/arcgis.js';

const HOURS = 48;
const SAT = { N20: 'NOAA-20', N21: 'NOAA-21', N: 'Suomi NPP', NPP: 'Suomi NPP' };
const CONF = { low: 'Low', nominal: 'Nominal', high: 'High', l: 'Low', n: 'Nominal', h: 'High' };

export default makePointLayer({
  id: 'firms',
  name: 'Satellite fire detections',
  group: 'hazards',
  color: '#ff3b3b',
  icon: ICONS.fire,
  shape: 'point',
  size: 6,
  view: { maxKm: 4000, radiusKm: 600 },
  max: 3000,
  attribution: 'Fire detections: NASA FIRMS VIIRS (near real time), served by Esri Living Atlas',
  fetch: (ctx, q) => arcgisBox(ctx, ENDPOINTS.viirsHotspots, q, {
    where: `hours_old <= ${HOURS}`, outFields: 'latitude,longitude,acq_time,satellite,confidence,frp,daynight,hours_old', max: 3000,
  }),
  parse: (j, ctx) => ((j && j.features) || []).map((f, i) => {
    const p = f.properties || {};
    const lon = f.geometry?.coordinates?.[0] ?? p.longitude;
    const lat = f.geometry?.coordinates?.[1] ?? p.latitude;
    const conf = CONF[String(p.confidence || '').toLowerCase()] || p.confidence || '—';
    const hrs = Number(p.hours_old);
    return {
      key: `v${f.id ?? i}`, lat: Number(lat), lon: Number(lon),
      color: conf === 'High' ? '#ff2d2d' : conf === 'Low' ? '#ffb020' : '#ff8a3d',
      title: 'Satellite fire detection',
      say: `A satellite saw a hot spot here${Number.isFinite(hrs) ? ` about ${hrs} hours ago` : ''}${conf !== '—' ? ` (${conf.toLowerCase()} confidence)` : ''}.`,
      subtitle: [p.acq_time ? ctx.fmt.time(p.acq_time) : '', SAT[p.satellite] || p.satellite].filter(Boolean).join(' · '),
      rows: [['Confidence', conf], ['Fire power', p.frp != null ? `${p.frp} MW` : '—'], ['Day/night', p.daynight === 'D' ? 'Day' : p.daynight === 'N' ? 'Night' : '—']],
      text: 'A hot spot seen by satellite. It can also be a factory, a flare or a controlled burn.',
    };
  }),
  note: () => `Last ${HOURS} hours`,
});
