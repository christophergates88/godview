// Active wildfire incidents (points) in the US from NIFC (WFIGS incident locations).
import { ENDPOINTS } from '../config.js';
import { makePointLayer } from './lib/point-layer.js';
import { ICONS } from './lib/icons.js';

export default makePointLayer({
  id: 'fireIncidents',
  name: 'Wildfire incidents (US)',
  group: 'hazards',
  color: '#ff7a1a',
  icon: ICONS.fire,
  label: 'F',
  max: 1500,
  attribution: 'Wildfire incidents: National Interagency Fire Center, WFIGS Incident Locations (ArcGIS)',
  fetch: (ctx) => ctx.net.get(ENDPOINTS.fireIncidents, { timeoutMs: 25000 }),
  parse: (gj, ctx) => (gj.features || []).filter((f) => f.geometry && f.geometry.coordinates).map((f, i) => {
    const p = f.properties || {};
    const [lon, lat] = f.geometry.coordinates;
    return {
      key: String(p.UniqueFireIdentifier || f.id || i), lat, lon,
      title: `${p.IncidentName || 'Wildfire'} fire`,
      subtitle: [p.POOCounty, (p.POOState || '').replace('US-', '')].filter(Boolean).join(', '),
      rows: [
        ['Size', p.IncidentSize != null ? `${Number(p.IncidentSize).toLocaleString()} acres` : '—'],
        ['Contained', p.PercentContained != null ? `${p.PercentContained}%` : '—'],
        ['Discovered', p.FireDiscoveryDateTime ? `${ctx.fmt.time(p.FireDiscoveryDateTime)} (${ctx.fmt.ago(p.FireDiscoveryDateTime)})` : '—'],
      ],
      link: { href: 'https://data-nifc.opendata.arcgis.com/', text: 'NIFC open data' },
    };
  }),
});
