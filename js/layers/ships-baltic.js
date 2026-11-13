// Ships, live, in the Baltic Sea and the waters around Finland, from Finland's
// open AIS feed (Fintraffic Digitraffic). Ship tracking for the whole world is not
// free to use in a web page, so this layer is honest about where it reaches.
import { ENDPOINTS } from '../config.js';
import { makePointLayer } from './lib/point-layer.js';
import { ICONS } from './lib/icons.js';

let names = null; let namesAt = 0;
function kind(t) {
  if (t >= 60 && t <= 69) return ['Passenger ship or ferry', '#7fd8ff'];
  if (t >= 70 && t <= 79) return ['Cargo ship', '#ffd34d'];
  if (t >= 80 && t <= 89) return ['Tanker', '#ff8a3d'];
  if (t === 30) return ['Fishing boat', '#3ee67a'];
  if (t === 31 || t === 32 || t === 52) return ['Tug', '#c8a2ff'];
  if (t === 36 || t === 37) return ['Sailing or pleasure boat', '#ff7ad9'];
  if (t === 50) return ['Pilot boat', '#e8edf2'];
  if (t === 51) return ['Search and rescue', '#ff4d5e'];
  if (t === 35) return ['Military', '#8b97a5'];
  return ['Vessel', '#b8c2cc'];
}

export default makePointLayer({
  id: 'shipsBaltic',
  name: 'Ships, live: Baltic Sea (Finland AIS)',
  group: 'sea',
  color: '#ffd34d',
  icon: ICONS.wave,
  shape: 'point',
  size: 6,
  heightM: 50,
  max: 1500,
  attribution: 'Ship positions: Fintraffic / Digitraffic marine AIS (CC BY 4.0)',
  async fetch(ctx) {
    const loc = await ctx.net.get(ENDPOINTS.aisBaltic, { timeoutMs: 20000 });
    if (!ctx.test && (!names || Date.now() - namesAt > 3600000)) {
      try {
        const list = await ctx.net.get(ENDPOINTS.aisBalticNames, { timeoutMs: 20000 });
        names = new Map((Array.isArray(list) ? list : []).map((v) => [v.mmsi, v])); namesAt = Date.now();
      } catch { names = names || new Map(); }   // positions still show without names
    }
    return loc;
  },
  parse(j, ctx) {
    const now = Date.now(); const out = [];
    for (const f of (j && j.features) || []) {
      const p = f.properties || {}; const g = f.geometry;
      if (!g || g.type !== 'Point' || now - p.timestampExternal > 3600000) continue;   // drop positions over an hour old
      const m = (names && names.get(p.mmsi)) || {}; const [what, color] = kind(m.shipType);
      const moving = p.sog > 0.5 && p.sog < 102;
      out.push({
        key: String(p.mmsi), lat: g.coordinates[1], lon: g.coordinates[0], color: moving ? color : '#5f6b78', size: moving ? 7 : 5,
        title: m.name ? String(m.name).trim() : `Vessel ${p.mmsi}`,
        subtitle: `${what}${moving ? ` · ${p.sog.toFixed(1)} knots` : ' · not moving'}`,
        rows: [
          ['Speed', moving ? `${p.sog.toFixed(1)} knots` : 'Stopped'],
          ...(moving && p.cog < 360 ? [['Heading toward', ctx.fmt.heading(p.cog)]] : []),
          ...(m.destination && m.destination !== 'N/A' ? [['Says it is going to', String(m.destination).trim()]] : []),
          ...(m.callSign ? [['Call sign', m.callSign]] : []),
          ['Radio ID (MMSI)', String(p.mmsi)],
          ['Last heard', ctx.fmt.ago(p.timestampExternal)],
        ],
        link: { href: `https://www.marinetraffic.com/en/ais/details/ships/mmsi:${p.mmsi}`, text: 'Look this ship up' },
      });
    }
    return out;
  },
  note: (list) => `${list.filter((x) => x.size === 7).length} under way, ${list.filter((x) => x.size === 5).length} stopped. Covers the Baltic near Finland only.`,
});
