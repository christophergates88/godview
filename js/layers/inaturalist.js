// Wildlife and plant sightings from the last 7 days in view (iNaturalist).
// Photos belong to the observers under their chosen licences.
import { ENDPOINTS } from '../config.js';
import { makePointLayer } from './lib/point-layer.js';
import { ICONS } from './lib/icons.js';
import { bbox, isoDate } from './lib/geo.js';

const KIND = { Aves: ['Bird', '#7fd8ff'], Mammalia: ['Mammal', '#ff8a3d'], Reptilia: ['Reptile', '#9dff7a'], Amphibia: ['Amphibian', '#3ee6c4'], Insecta: ['Insect', '#ffd34d'], Plantae: ['Plant', '#3ee67a'], Fungi: ['Fungus', '#c9b28a'], Arachnida: ['Spider kin', '#c8a2ff'], Actinopterygii: ['Fish', '#3d7bff'], Mollusca: ['Mollusc', '#ff7ad9'] };

export default makePointLayer({
  id: 'inaturalist',
  name: 'Wildlife sightings',
  group: 'signals',
  color: '#3ee67a',
  icon: ICONS.leaf,
  shape: 'point',
  size: 7,
  heightM: 100,
  view: { maxKm: 1500, radiusKm: 100 },
  attribution: 'Wildlife sightings: iNaturalist (inaturalist.org); photos © their observers',
  fetch(ctx, q) {
    const b = bbox(q.lat, q.lon, q.radiusKm);
    return ctx.net.get(ctx.net.fillUrl(ENDPOINTS.inaturalist, { ...b, d1: isoDate(new Date(Date.now() - 7 * 86400000)) }), { timeoutMs: 20000 });
  },
  parse: (j, ctx) => (j.results || []).filter((o) => o.geojson && o.geojson.coordinates).map((o) => {
    const k = KIND[o.taxon?.iconic_taxon_name] || ['Organism', '#e8edf2'];
    const photo = o.photos && o.photos[0] && o.photos[0].url ? o.photos[0].url.replace('square', 'medium') : null;
    return {
      key: String(o.id), lat: o.geojson.coordinates[1], lon: o.geojson.coordinates[0], color: k[1],
      title: o.taxon?.preferred_common_name || o.species_guess || o.taxon?.name || 'Sighting',
      subtitle: `${k[0]}${o.taxon?.name ? ' · ' + o.taxon.name : ''}`,
      rows: [['Seen', o.observed_on || '—'], ['By', o.user?.login || '—'], ['Quality', o.quality_grade || '—']],
      image: photo,
      link: { href: o.uri || `https://www.inaturalist.org/observations/${o.id}`, text: 'iNaturalist record' },
    };
  }),
});
