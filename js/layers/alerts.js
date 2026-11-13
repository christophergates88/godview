// Active US weather alerts from the National Weather Service (api.weather.gov, keyless).
// Many alerts have a drawn area; others only list counties/zones and are counted
// but not drawn (drawing those would need one extra request per zone).

import { ENDPOINTS } from '../config.js';

const SEVERITY = {
  Extreme: '#ff2d55',
  Severe: '#ff7a1a',
  Moderate: '#ffd34d',
  Minor: '#62d2ff',
  Unknown: '#b0b0b0',
};

const alerts = new Map();

function rings(geom) {
  if (!geom) return [];
  if (geom.type === 'Polygon') return [geom.coordinates];
  if (geom.type === 'MultiPolygon') return geom.coordinates;
  return [];
}

export default {
  id: 'alerts',
  name: 'US weather alerts',
  color: '#ff7a1a',
  icon: '<svg viewBox="0 0 24 24"><path d="M12 3l10 18H2L12 3z" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linejoin="round"/><path d="M12 10v5M12 18v.01" stroke="currentColor" stroke-width="2.4" stroke-linecap="round"/></svg>',
  attribution: 'US weather alerts: NOAA National Weather Service (api.weather.gov)',

  async fetch(ctx) {
    return ctx.net.fetchJSON(ENDPOINTS.nwsAlerts, { timeoutMs: 25000 });
  },

  render(ctx, data) {
    const { Cesium } = ctx;
    if (!data || !Array.isArray(data.features)) throw new ctx.net.FeedError('Unexpected data from NWS');
    const ents = ctx.entities;
    ents.suspendEvents();
    ents.removeAll();
    alerts.clear();
    let unmapped = 0;
    for (const f of data.features) {
      const p = f.properties || {};
      const key = String(p.id || f.id);
      alerts.set(key, p);
      const polys = rings(f.geometry);
      if (!polys.length) { unmapped++; continue; }
      const col = Cesium.Color.fromCssColorString(SEVERITY[p.severity] || SEVERITY.Unknown);
      polys.forEach((poly, i) => {
        const outer = poly[0];
        if (!outer || outer.length < 3) return;
        const e = ents.add({
          id: `${key}#${i}`,
          polygon: {
            hierarchy: new Cesium.PolygonHierarchy(
              Cesium.Cartesian3.fromDegreesArray(outer.flat()),
              (poly.slice(1) || []).map((h) => new Cesium.PolygonHierarchy(Cesium.Cartesian3.fromDegreesArray(h.flat()))),
            ),
            height: 0,
            material: col.withAlpha(0.28),
            outline: true,
            outlineColor: col.withAlpha(0.95),
          },
        });
        e.gv = { layer: 'alerts', key };
      });
    }
    ents.resumeEvents();
    ctx.setNote(unmapped ? `${unmapped} more alerts cover counties/zones only (not drawn)` : '');
    return alerts.size;
  },

  describe(ctx, key) {
    const a = alerts.get(key);
    if (!a) return null;
    const f = ctx.fmt;
    const rows = [
      ['Severity', a.severity || '—'],
      ['Urgency', a.urgency || '—'],
      ['Certainty', a.certainty || '—'],
      ['Starts', a.onset || a.effective ? f.time(Date.parse(a.onset || a.effective)) : '—'],
      ['Ends', a.ends || a.expires ? f.time(Date.parse(a.ends || a.expires)) : '—'],
      ['Area', a.areaDesc || '—'],
      ['Issued by', a.senderName || '—'],
    ];
    return {
      title: a.event || 'Weather alert',
      subtitle: a.headline || '',
      rows,
      text: a.description ? a.description.slice(0, 1200) : '',
      link: { href: 'https://alerts.weather.gov/', text: 'NWS alerts' },
    };
  },
};
