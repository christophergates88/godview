// NASA's Deep Space Network, live: which spacecraft each giant dish in California,
// Spain and Australia is talking to this minute, how far away it is and how fast
// the data is coming down. The same feed that drives NASA's "DSN Now" page.
import { ENDPOINTS } from '../config.js';
import { makePointLayer } from './lib/point-layer.js';
import { ICONS } from './lib/icons.js';

const SITES = {
  gdscc: ['Goldstone, California', 35.4267, -116.89],
  mdscc: ['Madrid, Spain', 40.4314, -4.2481],
  cdscc: ['Canberra, Australia', -35.4014, 148.9817],
};
// The feed uses short codes. Unknown codes are shown as they come.
const CRAFT = {
  VGR1: 'Voyager 1', VGR2: 'Voyager 2', JWST: 'James Webb Space Telescope', MRO: 'Mars Reconnaissance Orbiter', M01O: 'Mars Odyssey',
  MVN: 'MAVEN (Mars)', M20: 'Perseverance rover (Mars)', MSL: 'Curiosity rover (Mars)', JNO: 'Juno (Jupiter)', NHPC: 'New Horizons',
  SPP: 'Parker Solar Probe', LRO: 'Lunar Reconnaissance Orbiter', EURC: 'Europa Clipper', PSYC: 'Psyche', LUCY: 'Lucy', ORX: 'OSIRIS-APEX',
  STA: 'STEREO-A (Sun)', SOHO: 'SOHO (Sun)', ACE: 'ACE (solar wind)', DSCO: 'DSCOVR', TESS: 'TESS (planet hunter)', CHDR: 'Chandra X-ray Observatory',
  KPLO: 'Danuri (Korea, Moon)', EMM: 'Hope (UAE, Mars)', BEPI: 'BepiColombo (Mercury)', SOLO: 'Solar Orbiter', JUICE: 'JUICE (Jupiter)',
  HYB2: 'Hayabusa2', GAIA: 'Gaia', EUCL: 'Euclid', WIND: 'Wind', TGO: 'ExoMars Trace Gas Orbiter', MEX: 'Mars Express', XMM: 'XMM-Newton',
  IMAP: 'IMAP', CAPS: 'CAPSTONE (Moon)', BIOS: 'BioSentinel', THB: 'THEMIS-B (Moon)', THC: 'THEMIS-C (Moon)', GTL: 'Geotail',
  MMS1: 'MMS 1', MMS2: 'MMS 2', MMS3: 'MMS 3', MMS4: 'MMS 4', NEOS: 'NEO Surveyor', ESCB: 'ESCAPADE Blue (Mars)', ESCG: 'ESCAPADE Gold (Mars)',
};
const IDLE = new Set(['DSN', 'TEST', 'DSS', 'RFC', 'GBRA', 'VLBI']);

function far(km, ctx) {
  if (!(km > 0)) return '';
  const imp = ctx.settings.get('units') === 'imperial'; const v = imp ? km * 0.621371 : km; const u = imp ? 'miles' : 'km';
  if (v >= 1e9) return `${(v / 1e9).toFixed(1)} billion ${u}`;
  if (v >= 1e6) return `${(v / 1e6).toFixed(1)} million ${u}`;
  return `${Math.round(v).toLocaleString()} ${u}`;
}
function light(sec) {
  if (!(sec > 0)) return '';
  if (sec < 90) return `${sec.toFixed(1)} light-seconds`;
  if (sec < 5400) return `${Math.round(sec / 60)} light-minutes`;
  return `${(sec / 3600).toFixed(1)} light-hours`;
}
function rate(bps) {
  if (!(bps > 0)) return '';
  if (bps >= 1e6) return `${(bps / 1e6).toFixed(1)} million bits a second`;
  if (bps >= 1e3) return `${Math.round(bps / 1e3)} thousand bits a second`;
  return `${Math.round(bps)} bits a second`;
}

export default makePointLayer({
  id: 'dsn',
  name: 'Deep Space Network: who NASA is talking to',
  group: 'space',
  color: '#ff7ad9',
  icon: ICONS.antenna,
  label: 'D',
  heightM: 3000,
  attribution: 'Deep Space Network status: NASA/JPL-Caltech (DSN Now)',
  fetch: (ctx) => ctx.net.get(ctx.net.fillUrl(ENDPOINTS.dsn, { r: Math.floor(Date.now() / 5000) }), { type: 'text' }),
  parse(xml, ctx) {
    const doc = new DOMParser().parseFromString(String(xml), 'text/xml');
    const root = doc.documentElement;
    if (!root || root.nodeName !== 'dsn') return [];
    const by = {}; let cur = null;
    for (const el of Array.from(root.children)) {
      if (el.nodeName === 'station') { cur = el.getAttribute('name'); by[cur] = by[cur] || []; }
      else if (el.nodeName === 'dish' && cur) by[cur].push(el);
    }
    const out = [];
    for (const [code, dishes] of Object.entries(by)) {
      const site = SITES[code]; if (!site) continue;
      const rows = []; const craft = new Set();
      for (const d of dishes) {
        const targets = Array.from(d.getElementsByTagName('target')).filter((t) => !IDLE.has(t.getAttribute('name')));
        const down = Array.from(d.getElementsByTagName('downSignal')).filter((s) => s.getAttribute('active') === 'true');
        const dish = (d.getAttribute('name') || '').replace(/^DSS/, 'Dish ');
        if (!targets.length) { rows.push([dish, d.getAttribute('activity') || 'Idle']); continue; }
        for (const t of targets) {
          const name = t.getAttribute('name'); craft.add(name);
          const sig = down.find((s) => s.getAttribute('spacecraft') === name);
          const parts = [CRAFT[name] || name, far(Number(t.getAttribute('downlegRange')), ctx), light(Number(t.getAttribute('rtlt')) / 2),
            sig ? rate(Number(sig.getAttribute('dataRate'))) : ''].filter(Boolean);
          rows.push([dish, parts.join(' · ')]);
        }
      }
      out.push({
        key: code, lat: site[1], lon: site[2], label: String(craft.size),
        title: `Deep space dishes at ${site[0]}`,
        subtitle: craft.size ? `In contact with ${craft.size} spacecraft right now` : 'No spacecraft in contact right now',
        rows,
        link: { href: 'https://eyes.nasa.gov/apps/dsn-now/', text: 'NASA DSN Now' },
      });
    }
    return out;
  },
  note: (list) => `${list.reduce((n, x) => n + Number(x.label || 0), 0)} spacecraft links across ${list.length} sites`,
});
