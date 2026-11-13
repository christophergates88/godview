// Today's preliminary storm reports (tornado, wind, hail) from the NOAA Storm
// Prediction Center. "Today" runs 12Z to 12Z; reports are unverified.
import { ENDPOINTS } from '../config.js';
import { makePointLayer } from './lib/point-layer.js';
import { ICONS } from './lib/icons.js';
import { parseCSV } from './lib/geo.js';

const TYPES = {
  F_Scale: { name: 'Tornado', label: 'T', color: '#ff2d55', what: 'F/EF scale' },
  Speed: { name: 'Wind damage', label: 'W', color: '#5ab0ff', what: 'Wind speed (mph)' },
  Size: { name: 'Hail', label: 'H', color: '#3ee67a', what: 'Hail size (1/100 in)' },
};

export default makePointLayer({
  id: 'spcReports',
  name: 'Storm reports (SPC)',
  group: 'weather',
  color: '#ff2d55',
  icon: ICONS.tornado,
  label: 'T',
  attribution: 'Storm reports: NOAA Storm Prediction Center (spc.noaa.gov), preliminary',
  fetch: (ctx) => ctx.net.get(ENDPOINTS.spcReports, { type: 'text' }),
  parse(text, ctx) {
    const out = [];
    let type = null;
    parseCSV(String(text)).forEach((r, i) => {
      if (r[0] === 'Time') { type = TYPES[r[1]] || null; return; }
      if (!type) return;
      const lat = Number(r[5]); const lon = Number(r[6]);
      if (!Number.isFinite(lat) || !Number.isFinite(lon)) return;
      out.push({
        key: `${type.label}${i}`, lat, lon, label: type.label, color: type.color,
        title: `${type.name} report`,
        subtitle: `${r[2]}, ${r[3]} County, ${r[4]}`,
        rows: [['Time (UTC, HHMM)', r[0]], [type.what, r[1] || '—'], ['Place', `${r[2]}, ${r[4]}`]],
        text: r[7] || '',
        link: { href: 'https://www.spc.noaa.gov/climo/reports/today.html', text: 'SPC storm reports' },
      });
    });
    return out;
  },
  note: (list) => (list.length ? 'Preliminary, unverified reports since 12Z' : 'No reports yet today (since 12Z)'),
});
