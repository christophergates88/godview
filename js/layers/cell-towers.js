// Cell towers in view: FCC-licensed cellular sites from the HIFLD Open archive
// (2025 snapshot, NASA NCCS mirror). OpenStreetMap Overpass is only a fallback.
import { INFRA } from '../config.js';
import { makePointLayer } from './lib/point-layer.js';
import { ICONS } from './lib/icons.js';
import { overpass, where, tagRows } from './lib/overpass.js';
import { arcgisBox, a, withFallback } from './lib/arcgis.js';

let lastSource = 'primary';
const titleCase = (s) => String(s || '').toLowerCase().replace(/\b\w/g, (c) => c.toUpperCase());

export default makePointLayer({
  id: 'cellTowers',
  name: 'Cell towers',
  group: 'ground',
  color: '#c8a2ff',
  icon: ICONS.antenna,
  shape: 'point',
  size: 6,
  heightM: 150,
  max: 1500,
  view: { maxKm: 400, radiusKm: 50 },
  attribution: 'Cell towers: FCC licensing data via HIFLD Open archive (2025 snapshot, NASA NCCS mirror); fallback © OpenStreetMap contributors via Overpass',
  async fetch(ctx, q) {
    const r = await withFallback(ctx,
      () => arcgisBox(ctx, INFRA.cellTowers, q, { outFields: 'licensee,loccity,locstate,allstruc,supstruc', max: 3000 }),
      () => overpass(ctx, q, ['nwr["tower:type"="communication"]', 'nwr["communication:mobile_phone"="yes"]'], 1500), 'HIFLD cell towers');
    lastSource = r.source;
    return r;
  },
  parse(r) {
    if (r.source !== 'primary') {
      return (r.data.elements || []).map((el) => {
        const t = el.tags || {};
        return { key: `${el.type}${el.id}`, ...where(el), title: t.name || 'Communication tower', subtitle: 'OpenStreetMap', rows: tagRows(t, [['operator', 'Operator'], ['height', 'Height']]) };
      });
    }
    return ((r.data && r.data.features) || []).filter((f) => f.geometry).map((f, i) => {
      const p = f.properties || {};
      const lic = a(p, 'licensee');
      const h = Number(a(p, 'allstruc'));
      return {
        key: `t${a(p, 'objectid', 'fid') ?? i}`, lon: f.geometry.coordinates[0], lat: f.geometry.coordinates[1],
        title: lic ? titleCase(lic) : 'Cell site', subtitle: [titleCase(a(p, 'loccity')), a(p, 'locstate')].filter(Boolean).join(', '),
        say: `Cell site${lic ? ` licensed to ${titleCase(lic)}` : ''}${Number.isFinite(h) && h > 0 ? `, structure about ${Math.round(h)} m tall` : ''}.`,
        rows: [['Licensee', lic ? titleCase(lic) : '—'], ['Structure height', Number.isFinite(h) && h > 0 ? `${Math.round(h)} m (as filed)` : '—']],
        link: { href: 'https://wireless2.fcc.gov/UlsApp/AsrSearch/asrRegistrationSearch.jsp', text: 'FCC tower search' },
      };
    });
  },
  note: () => (lastSource === 'primary' ? 'HIFLD 2025 snapshot (not live)' : 'Main source down: showing OpenStreetMap'),
});
