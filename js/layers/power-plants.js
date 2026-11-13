// Power plants in view. Main source: EPA/EIA power plant points from the HIFLD
// Open archive (2025 snapshot, mirrored by NASA NCCS). OpenStreetMap Overpass is
// only a fallback.
import { INFRA } from '../config.js';
import { makePointLayer } from './lib/point-layer.js';
import { ICONS } from './lib/icons.js';
import { overpass, where, tagRows } from './lib/overpass.js';
import { arcgisBox, a, withFallback } from './lib/arcgis.js';

const SRC = { nuclear: '#b04dff', coal: '#8b97a5', gas: '#ff8a3d', oil: '#a0785a', hydro: '#3d7bff', wind: '#7fd8ff', solar: '#ffd34d', biomass: '#3ee67a', geothermal: '#ff4d5e', battery: '#c6ff4a' };
// EIA energy source codes -> plain words
export const FUEL = { NG: 'gas', SUN: 'solar', WND: 'wind', NUC: 'nuclear', BIT: 'coal', SUB: 'coal', LIG: 'coal', RC: 'coal', WC: 'coal', COL: 'coal', WAT: 'hydro', DFO: 'oil', RFO: 'oil', JF: 'oil', KER: 'oil', PC: 'oil', WO: 'oil', WDS: 'biomass', BLQ: 'biomass', OBG: 'biomass', LFG: 'biomass', AB: 'biomass', MSW: 'biomass', GEO: 'geothermal', MWH: 'battery', OG: 'gas', BFG: 'gas', PG: 'gas' };

export function parseHifldPlants(gj) {
  const byPlant = new Map();
  for (const ft of (gj && gj.features) || []) {
    const p = ft.properties || {};
    const g = ft.geometry;
    if (!g || !g.coordinates) continue;
    const code = String(a(p, 'plant_code', 'registry_i', 'objectid') || '');
    const fuelCode = String(a(p, 'energy_src', 'energy_sou') || '').toUpperCase();
    const fuel = FUEL[fuelCode] || '';
    const prev = byPlant.get(code);
    if (prev) { if (fuel && !prev.fuels.includes(fuel)) prev.fuels.push(fuel); prev.units++; continue; }
    byPlant.set(code, { code, lon: g.coordinates[0], lat: g.coordinates[1], name: a(p, 'plant_name', 'primary_na') || 'Power plant', operator: a(p, 'utility_na'), sector: a(p, 'sector_nam'), city: a(p, 'city_name'), state: a(p, 'state_code', 'state'), fuels: fuel ? [fuel] : [], units: 1 });
  }
  return [...byPlant.values()].map((x) => {
    const main = x.fuels[0] || '';
    return {
      key: `p${x.code}`, lat: x.lat, lon: x.lon, color: SRC[main] || '#ffd34d', label: (main[0] || 'P').toUpperCase(),
      title: x.name, subtitle: main ? `${x.fuels.join(' + ')} power plant` : 'Power plant',
      say: `${x.name}${x.city ? ` in ${String(x.city).replace(/\b\w/g, (c) => c.toUpperCase()).replace(/\B\w+/g, (w) => w.toLowerCase())}` : ''} makes electricity from ${x.fuels.join(' and ') || 'an unlisted source'}${x.operator ? `, run by ${x.operator}` : ''}.`,
      rows: [['Fuel', x.fuels.join(', ') || '—'], ['Generating units listed', String(x.units)], ['Operator', x.operator || '—'], ['Sector', x.sector || '—']],
      link: { href: 'https://www.eia.gov/electricity/data/eia860/', text: 'EIA power plant data' },
    };
  });
}

function parseOsm(j) {
  return (j.elements || []).map((el) => {
    const t = el.tags || {};
    const src = (t['plant:source'] || '').split(';')[0];
    return {
      key: `${el.type}${el.id}`, ...where(el), color: SRC[src] || '#ffd34d', label: (src[0] || 'P').toUpperCase(),
      title: t.name || 'Power plant', subtitle: src ? `${src} power plant (OpenStreetMap)` : 'Power plant (OpenStreetMap)',
      rows: tagRows(t, [['plant:source', 'Source'], ['plant:output:electricity', 'Output'], ['operator', 'Operator'], ['start_date', 'Opened']]),
      link: { href: `https://www.openstreetmap.org/${el.type}/${el.id}`, text: 'OpenStreetMap' },
    };
  });
}

let lastSource = 'primary';
export default makePointLayer({
  id: 'powerPlants',
  name: 'Power plants',
  group: 'ground',
  color: '#ffd34d',
  icon: ICONS.bolt,
  label: 'P',
  view: { maxKm: 1500, radiusKm: 200 },
  attribution: 'Power plants: EPA/EIA via HIFLD Open archive (2025 snapshot, NASA NCCS mirror); fallback © OpenStreetMap contributors (ODbL) via Overpass',
  async fetch(ctx, q) {
    const r = await withFallback(ctx,
      () => arcgisBox(ctx, INFRA.powerPlants, q, { outFields: 'plant_code,plant_name,utility_na,energy_src,sector_nam,city_name,state_code' }),
      () => overpass(ctx, q, ['nwr["power"="plant"]'], 500), 'HIFLD power plants');
    lastSource = r.source;
    return r;
  },
  parse: (r) => (r.source === 'primary' ? parseHifldPlants(r.data) : parseOsm(r.data)),
  note: () => (lastSource === 'primary' ? 'HIFLD 2025 snapshot (not live)' : 'Main source down: showing OpenStreetMap'),
});
