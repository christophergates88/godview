// FAA airport status: ground stops, ground delay programs, arrival/departure
// delays and closures at US airports (nasstatus.faa.gov). Needs the data relay.
// Only airports in the built-in list can be placed on the map.
import { ENDPOINTS } from '../config.js';
import { makePointLayer } from './lib/point-layer.js';
import { ICONS } from './lib/icons.js';
import { AIRPORT_BY_CODE } from './lib/airports.js';

let unplaced = 0;

function parseXml(xml) {
  const doc = new DOMParser().parseFromString(xml, 'application/xml');
  const out = [];
  for (const arpt of doc.getElementsByTagName('ARPT')) {
    const rec = arpt.parentElement;
    const type = rec.closest('Delay_type')?.getElementsByTagName('Name')[0]?.textContent?.trim() || rec.tagName;
    const fields = [];
    for (const el of rec.getElementsByTagName('*')) {
      if (el.children.length || el.tagName === 'ARPT') continue;
      const v = el.textContent.trim();
      if (v) fields.push([el.tagName.replace(/_/g, ' '), v + (el.getAttribute('Type') ? ` (${el.getAttribute('Type')})` : '')]);
      const t = el.parentElement?.getAttribute?.('Type');
      if (t && fields.length && !fields[fields.length - 1][1].includes(t)) fields[fields.length - 1][1] += ` (${t})`;
    }
    out.push({ code: arpt.textContent.trim(), type, fields });
  }
  return out;
}

export default makePointLayer({
  id: 'airportDelays',
  name: 'FAA airport delays',
  group: 'air',
  color: '#ffb020',
  icon: ICONS.clock,
  label: '!',
  attribution: 'Airport delays: FAA National Airspace System Status (nasstatus.faa.gov)',
  fetch: (ctx) => ctx.net.get(ENDPOINTS.faaStatus, { type: 'text' }),
  parse(xml) {
    const recs = parseXml(xml);
    unplaced = 0;
    const byCode = new Map();
    for (const r of recs) {
      const a = AIRPORT_BY_CODE.get(r.code);
      if (!a) { unplaced++; continue; }
      const prev = byCode.get(r.code);
      if (prev) { prev.rows.push(['—', r.type], ...r.fields); prev.subtitle += ` · ${r.type}`; continue; }
      byCode.set(r.code, {
        key: r.code, lat: a.lat, lon: a.lon, title: `${r.code} · ${a.name}`, subtitle: r.type,
        color: /stop|closure/i.test(r.type) ? '#ff4d5e' : '#ffb020',
        rows: [['Status', r.type], ...r.fields],
        link: { href: 'https://nasstatus.faa.gov/', text: 'FAA NAS Status' },
      });
    }
    return [...byCode.values()];
  },
  note: (list) => [list.length ? '' : 'No delays reported', unplaced ? `${unplaced} at airports not in the built-in list` : ''].filter(Boolean).join(' · '),
});
