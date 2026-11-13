// River gauges and flood status for the area in view (NOAA National Water
// Prediction Service). Colour shows the observed flood category.
import { ENDPOINTS } from '../config.js';
import { makePointLayer } from './lib/point-layer.js';
import { ICONS } from './lib/icons.js';
import { bbox } from './lib/geo.js';

const CAT = { major: ['Major flooding', '#b04dff'], moderate: ['Moderate flooding', '#ff2d2d'], minor: ['Minor flooding', '#ff8a3d'], action: ['Near flood stage (action)', '#ffd34d'], no_flooding: ['Normal', '#3ee67a'] };

export default makePointLayer({
  id: 'rivers',
  name: 'River gauges & floods',
  group: 'hazards',
  color: '#3d7bff',
  icon: ICONS.river,
  shape: 'point',
  size: 7,
  view: { maxKm: 2500, radiusKm: 300 },
  attribution: 'River gauges: NOAA National Water Prediction Service (water.noaa.gov)',
  fetch(ctx, q) {
    const b = bbox(q.lat, q.lon, q.radiusKm);
    return ctx.net.get(ctx.net.fillUrl(ENDPOINTS.riverGauges, b), { timeoutMs: 25000 });
  },
  parse: (j, ctx) => ((j && (j.gauges || j)) || []).filter((g) => g && g.latitude != null).map((g) => {
    const obs = g.status?.observed || {};
    const fc = g.status?.forecast || {};
    const c = CAT[obs.floodCategory] || ['Unknown / not rated', '#8b97a5'];
    return {
      key: g.lid, lat: Number(g.latitude), lon: Number(g.longitude), color: c[1],
      title: g.name || g.lid,
      subtitle: c[0],
      rows: [
        ['Observed', obs.primary != null && obs.primary > -999 ? `${obs.primary} ${obs.primaryUnit || ''}` : '—'],
        ['Observed at', obs.validTime ? ctx.fmt.time(Date.parse(obs.validTime)) : '—'],
        ['Forecast category', CAT[fc.floodCategory]?.[0] || fc.floodCategory || '—'],
        ['Gauge ID', g.lid],
      ],
      link: { href: `https://water.noaa.gov/gauges/${encodeURIComponent(String(g.lid).toLowerCase())}`, text: 'NWPS gauge page' },
    };
  }),
  note: (list) => { const f = list.filter((g) => /flooding/i.test(g.subtitle)).length; return f ? `${f} gauges in flood` : 'No gauges in flood in view'; },
});
