// California traffic cameras (Caltrans CWWP2 open data, keyless). Loads the
// Caltrans districts nearest the view when you are looking at California.
import { ENDPOINTS } from '../config.js';
import { makePointLayer } from './lib/point-layer.js';
import { ICONS } from './lib/icons.js';
import { distKm } from './lib/geo.js';

const DISTRICTS = [[1, 40.8, -124.1], [2, 40.6, -122.4], [3, 38.9, -121.6], [4, 37.8, -122.3], [5, 35.3, -120.7], [6, 36.7, -119.8],
  [7, 34.05, -118.25], [8, 34.1, -117.3], [9, 37.4, -118.4], [10, 37.95, -121.3], [11, 32.7, -117.15], [12, 33.75, -117.85]];

export default makePointLayer({
  id: 'caltrans',
  name: 'California traffic cameras',
  group: 'ground',
  color: '#7fd8ff',
  icon: ICONS.camera,
  label: 'C',
  view: { maxKm: 3000, radiusKm: 400 },
  attribution: 'California traffic cameras: Caltrans CWWP2 open data (cwwp2.dot.ca.gov)',
  async fetch(ctx, q) {
    let near = DISTRICTS.map(([d, lat, lon]) => [d, distKm(q.lat, q.lon, lat, lon)]).sort((a, b) => a[1] - b[1]);
    if (!ctx.test) near = near.filter(([, km]) => km < q.radiusKm + 150);
    const pick = near.slice(0, 3).map(([d]) => d);
    if (!pick.length) { ctx.setNote('California only: move the view to California'); return []; }
    const out = [];
    for (const d of pick) {
      const j = await ctx.net.get(ctx.net.fillUrl(ENDPOINTS.caltransCctv, { d, dd: String(d).padStart(2, '0') }), { timeoutMs: 25000 });
      out.push(...(j.data || []));
    }
    return out;
  },
  parse: (list) => list.map((x) => x.cctv || x).filter((c) => c.location && c.inService !== 'false').map((c) => ({
    key: `${c.location.district}-${c.index || c.location.locationName}`,
    lat: Number(c.location.latitude), lon: Number(c.location.longitude),
    title: c.location.locationName || 'Caltrans camera',
    subtitle: [c.location.route, c.location.nearbyPlace].filter(Boolean).join(' · '),
    rows: [['District', String(c.location.district || '—')], ['Direction', c.location.direction || '—']],
    image: c.imageData?.static?.currentImageURL || null,
    link: c.imageData?.static?.currentImageURL ? { href: c.imageData.static.currentImageURL, text: 'Open image' } : null,
  })),
});
