// Power plants of the world, from a file that ships with GodView (js/data/power-plants.json):
// the World Resources Institute's Global Power Plant Database, plants of 10 MW and up.
// It replaced a live OpenStreetMap lookup that was failing because the public servers
// are overloaded. The list is a 2021 snapshot: plants built since then are missing.
import { distKm } from './geo.js';

export const FUEL = {
  Nuclear: ['#b04dff', 'N'], Coal: ['#8b97a5', 'C'], Gas: ['#ff8a3d', 'G'], Oil: ['#a0785a', 'O'], Hydro: ['#3d7bff', 'H'], Wind: ['#7fd8ff', 'W'],
  Solar: ['#ffd34d', 'S'], Biomass: ['#3ee67a', 'B'], Geothermal: ['#ff4d5e', 'T'], Waste: ['#6fbf73', 'R'], Storage: ['#e8edf2', 'E'],
};
let data = null;
export async function loadPlants(ctx) {
  if (!data) data = await ctx.net.get(new URL('../../data/power-plants.json', import.meta.url).href, { timeoutMs: 30000 });
  return data;
}
const size = (mw) => (mw >= 1000 ? `${(mw / 1000).toFixed(1)} GW` : `${mw} MW`);

// d = the loaded file; keep(row) picks rows; q = the view (or null for everywhere)
export function plantItems(d, q, keep) {
  const out = []; if (!d || !d.plants) return out;
  const dLat = q ? q.radiusKm / 111 : 0;
  d.plants.forEach((p, i) => {
    if (keep && !keep(p, d)) return;
    if (q && (Math.abs(p[0] - q.lat) > dLat || distKm(q.lat, q.lon, p[0], p[1]) > q.radiusKm)) return;
    const fuel = d.fuels[p[4]]; const f = FUEL[fuel] || ['#ffd34d', 'P'];
    out.push({
      key: `p${i}`, lat: p[0], lon: p[1], color: f[0], label: f[1],
      title: p[2] || 'Power plant',
      subtitle: `${fuel} power plant · ${size(p[3])}`,
      rows: [
        ['Fuel', fuel], ['Full power', `${size(p[3])}${p[3] >= 1000 ? ' (enough for roughly ' + Math.round(p[3] * 0.75 / 1000) + ' million homes)' : ''}`],
        ['Country', d.countries[p[5]]],
        ...(p[6] ? [['Started up', String(p[6])]] : []), ...(p[7] ? [['Owner', p[7]]] : []),
      ],
      link: { href: `https://www.google.com/search?q=${encodeURIComponent(`${p[2]} power plant ${d.countries[p[5]]}`)}`, text: 'Search for this plant' },
    });
  });
  return out;
}
export const PLANTS_CREDIT = 'World Resources Institute, Global Power Plant Database v1.3.0 (2021), CC BY 4.0';
