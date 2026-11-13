// Automatic licence plate reader (ALPR) cameras mapped by volunteers in
// OpenStreetMap (for example through DeFlock). Coverage is incomplete and varies
// by area.
// Main source: the weekly data pack (a copy of every ALPR camera in
// OpenStreetMap, built in GitHub Actions; see scripts/build_packs.py), because
// the public Overpass servers are too often full to ask from a phone. Overpass
// is only the fallback when the copy cannot be read.
import { makePointLayer } from './lib/point-layer.js';
import { ICONS } from './lib/icons.js';
import { overpass, where, tagRows } from './lib/overpass.js';
import { withFallback } from './lib/arcgis.js';
import { packRows, builtOn } from './lib/packs.js';

const DIRS = { N: 'north', NE: 'north-east', E: 'east', SE: 'south-east', S: 'south', SW: 'south-west', W: 'west', NW: 'north-west' };
// "N", "45", "90;270" -> plain words
export function facing(v) {
  const parts = String(v || '').split(/[;,]/).map((s) => s.trim()).filter(Boolean);
  const word = (p) => {
    if (DIRS[p.toUpperCase()]) return DIRS[p.toUpperCase()];
    const deg = Number(p);
    if (!Number.isFinite(deg)) return p;
    const names = ['north', 'north-east', 'east', 'south-east', 'south', 'south-west', 'west', 'north-west'];
    return names[Math.round((((deg % 360) + 360) % 360) / 45) % 8];
  };
  return parts.map(word).join(' and ');
}

let src = { kind: 'pack', built: null };

export default makePointLayer({
  id: 'alpr',
  name: 'Plate-reader cameras (ALPR)',
  group: 'ground',
  color: '#ff4d5e',
  icon: ICONS.eye,
  shape: 'point',
  size: 7,
  heightM: 100,
  max: 2000,
  view: { maxKm: 800, radiusKm: 120 },
  attribution: 'ALPR cameras: © OpenStreetMap contributors (ODbL), volunteer-mapped; weekly copy built from the Overpass API',
  async fetch(ctx, q) {
    const r = await withFallback(ctx, () => packRows(ctx, 'alpr', q),
      () => overpass(ctx, q, ['node["surveillance:type"="ALPR"]'], 2000), 'Plate-reader copy');
    src = r.source === 'primary' ? { kind: 'pack', built: r.data.built } : { kind: 'live' };
    return r;
  },
  parse(r) {
    if (r.source === 'primary') {
      return r.data.items.map((c) => {
        const face = facing(c.facing);
        const rows = [];
        if (c.operator) rows.push(['Operator', c.operator]);
        if (c.maker) rows.push(['Maker', c.maker]);
        if (face) rows.push(['Facing', face]);
        if (c.zone) rows.push(['Zone', c.zone]);
        rows.push(['Mapped', 'By volunteers in OpenStreetMap']);
        return {
          key: `n${c.osm}`, lat: c.lat, lon: c.lon,
          title: 'Plate-reader camera (ALPR)', subtitle: [c.operator, c.maker].filter(Boolean).join(' · ') || 'Mapped in OpenStreetMap',
          say: `A licence plate reader${c.maker ? ` made by ${c.maker}` : ''}${c.operator ? `, run by ${c.operator}` : ''}${face ? `, facing ${face}` : ''}. It photographs passing plates.`,
          rows,
          link: { href: `https://www.openstreetmap.org/node/${c.osm}`, text: 'OpenStreetMap' },
        };
      });
    }
    return (r.data.elements || []).map((el) => {
      const t = el.tags || {};
      return {
        key: `n${el.id}`, ...where(el),
        title: 'Plate-reader camera (ALPR)', subtitle: [t.operator, t.manufacturer || t.brand].filter(Boolean).join(' · ') || 'Mapped in OpenStreetMap',
        rows: tagRows(t, [['operator', 'Operator'], ['manufacturer', 'Maker'], ['brand', 'Brand'], ['direction', 'Facing'], ['surveillance:zone', 'Zone']]),
        link: { href: `https://www.openstreetmap.org/node/${el.id}`, text: 'OpenStreetMap' },
      };
    });
  },
  note: () => (src.kind === 'pack' ? `Volunteer-mapped · copy from ${builtOn(src.built)}, refreshed weekly` : 'Weekly copy unavailable: asked OpenStreetMap live'),
});
