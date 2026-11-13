// NOAA National Data Buoy Center: latest observation from every reporting buoy
// and coastal station (text file, needs the data relay).
import { ENDPOINTS } from '../config.js';
import { makePointLayer } from './lib/point-layer.js';
import { ICONS } from './lib/icons.js';

const num = (v) => (v === 'MM' || v == null ? null : Number(v));

export default makePointLayer({
  id: 'buoys',
  name: 'Ocean buoys',
  group: 'sea',
  color: '#62d2ff',
  icon: ICONS.buoy,
  shape: 'point',
  size: 7,
  attribution: 'Buoys: NOAA National Data Buoy Center (ndbc.noaa.gov)',
  fetch: (ctx) => ctx.net.get(ENDPOINTS.buoys, { type: 'text', timeoutMs: 20000 }),
  parse(text, ctx) {
    const lines = String(text).split('\n');
    const head = (lines.find((l) => l.startsWith('#STN')) || '').replace('#', '').trim().split(/\s+/);
    const col = (name) => head.indexOf(name);
    const out = [];
    for (const l of lines) {
      if (!l || l.startsWith('#')) continue;
      const c = l.trim().split(/\s+/);
      const g = (n) => num(c[col(n)]);
      const lat = g('LAT'); const lon = g('LON');
      if (lat == null || lon == null) continue;
      const time = Date.UTC(+c[col('YYYY')], +c[col('MM')] - 1, +c[col('DD')], +c[col('hh')], +c[col('mm')]);
      const f = ctx.fmt;
      out.push({
        key: c[0], lat, lon,
        title: `Buoy / station ${c[0]}`,
        say: [g('WSPD') != null ? `Wind ${f.windKmh(g('WSPD') * 3.6)}${g('WDIR') != null ? ' from the ' + f.heading(g('WDIR')).split(' ')[1] : ''}` : '', g('WVHT') != null ? `waves ${ctx.settings.get('units') === 'imperial' ? (g('WVHT') * 3.28084).toFixed(1) + ' ft' : g('WVHT').toFixed(1) + ' m'}` : '', g('WTMP') != null ? `water ${f.tempC(g('WTMP'))}` : ''].filter(Boolean).join(', ').replace(/^./, (x) => x.toUpperCase()) + '.',
        subtitle: `Observed ${f.ago(time)}`,
        rows: [
          ['Wind', g('WSPD') != null ? `${f.windKmh(g('WSPD') * 3.6)}${g('WDIR') != null ? ' from ' + f.heading(g('WDIR')) : ''}` : '—'],
          ['Gusts', g('GST') != null ? f.windKmh(g('GST') * 3.6) : '—'],
          ['Wave height', g('WVHT') != null ? (ctx.settings.get('units') === 'imperial' ? `${(g('WVHT') * 3.28084).toFixed(1)} ft` : `${g('WVHT').toFixed(1)} m`) : '—'],
          ['Wave period', g('DPD') != null ? `${g('DPD')} s` : '—'],
          ['Air temp', f.tempC(g('ATMP'))],
          ['Water temp', f.tempC(g('WTMP'))],
          ['Pressure', g('PRES') != null ? `${g('PRES')} hPa` : '—'],
        ],
        link: { href: `https://www.ndbc.noaa.gov/station_page.php?station=${encodeURIComponent(c[0])}`, text: 'NDBC station page' },
      });
    }
    return out;
  },
});
