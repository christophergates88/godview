// Current wildfire perimeters in the US from the National Interagency Fire
// Center (WFIGS), largest first. Shapes are simplified for speed.
import { ENDPOINTS } from '../config.js';
import { makeShapeLayer } from './lib/shape-layer.js';
import { ICONS } from './lib/icons.js';

export default makeShapeLayer({
  id: 'firePerimeters',
  name: 'Wildfire perimeters (US)',
  group: 'hazards',
  color: '#ff4d1a',
  icon: ICONS.perimeter,
  max: 300,
  attribution: 'Wildfire perimeters: National Interagency Fire Center, WFIGS Interagency Perimeters (ArcGIS)',
  fetch: (ctx) => ctx.net.get(ENDPOINTS.firePerimeters, { timeoutMs: 25000 }),
  parse: (gj, ctx) => (gj.features || []).filter((f) => f.geometry).map((f, i) => {
    const p = f.properties || {};
    const g = f.geometry;
    const acres = p.poly_GISAcres ?? p.attr_IncidentSize;
    return {
      key: String(f.id ?? i), color: '#ff4d1a', alpha: 0.35,
      polygons: g.type === 'Polygon' ? [g.coordinates] : g.type === 'MultiPolygon' ? g.coordinates : [],
      title: `${p.poly_IncidentName || 'Wildfire'} fire`,
      subtitle: p.attr_POOState ? `${p.attr_POOState.replace('US-', '')}` : 'Wildfire perimeter',
      rows: [
        ['Mapped area', acres != null ? `${Math.round(acres).toLocaleString()} acres` : '—'],
        ['Contained', p.attr_PercentContained != null ? `${p.attr_PercentContained}%` : '—'],
        ['Discovered', p.attr_FireDiscoveryDateTime ? ctx.fmt.time(p.attr_FireDiscoveryDateTime) : '—'],
      ],
      link: { href: 'https://data-nifc.opendata.arcgis.com/', text: 'NIFC open data' },
    };
  }),
});
