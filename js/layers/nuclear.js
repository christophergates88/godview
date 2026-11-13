// U.S. nuclear power reactors with their latest reported power level (NRC daily
// "Power Reactor Status", published as a FEMA map service). Fallback: OpenStreetMap.
import { INFRA } from '../config.js';
import { makePointLayer } from './lib/point-layer.js';
import { ICONS } from './lib/icons.js';
import { overpass, where, tagRows } from './lib/overpass.js';
import { arcgisAll, withFallback } from './lib/arcgis.js';

let lastSource = 'primary';
// The service's field names are not documented where we could read them, so
// pick fields by meaning.
const pick = (attrs, re, type) => {
  const k = Object.keys(attrs).find((x) => re.test(x) && (type ? typeof attrs[x] === type : attrs[x] != null && attrs[x] !== ''));
  return k ? attrs[k] : undefined;
};

export function parseReactors(j) {
  return ((j && j.features) || []).filter((f) => f.geometry && Number.isFinite(f.geometry.y ?? f.geometry.latitude)).map((f, i) => {
    const at = f.attributes || {};
    const name = pick(at, /unit|reactor|plant|name|facility/i, 'string') || 'Nuclear reactor';
    const power = pick(at, /power|percent|pct/i, 'number');
    const date = pick(at, /date|report/i);
    const when = typeof date === 'number' ? new Date(date).toLocaleDateString() : date;
    const color = power == null ? '#b04dff' : power >= 90 ? '#3ee67a' : power > 0 ? '#ffb020' : '#ff4d5e';
    return {
      key: `r${pick(at, /objectid|fid/i) ?? i}`, lat: f.geometry.y ?? f.geometry.latitude, lon: f.geometry.x ?? f.geometry.longitude, color,
      title: name, subtitle: power != null ? `${power}% power` : 'Nuclear reactor',
      say: `${name}${power != null ? ` was at ${power}% power` : ''}${when ? ` (NRC report ${when})` : ''}.${power === 0 ? ' Zero usually means a refuelling or maintenance outage.' : ''}`,
      rows: Object.entries(at).filter(([k, v]) => v != null && v !== '' && !/objectid|globalid|shape|fid/i.test(k)).slice(0, 8).map(([k, v]) => [k.replace(/_/g, ' '), typeof v === 'number' && v > 1e11 ? new Date(v).toLocaleDateString() : String(v)]),
      link: { href: 'https://www.nrc.gov/reading-rm/doc-collections/event-status/reactor-status/', text: 'NRC power reactor status' },
    };
  });
}

export default makePointLayer({
  id: 'nuclear',
  name: 'Nuclear reactors',
  group: 'ground',
  color: '#b04dff',
  icon: ICONS.atom,
  label: 'N',
  attribution: 'Nuclear reactors: U.S. NRC daily power reactor status (FEMA map service); fallback © OpenStreetMap contributors via Overpass',
  async fetch(ctx) {
    const v = ctx.view();
    const r = await withFallback(ctx,
      () => arcgisAll(ctx, INFRA.reactors, { max: 500 }),
      () => overpass(ctx, { lat: v.lat, lon: v.lon, radiusKm: 1000 }, ['nwr["power"="plant"]["plant:source"="nuclear"]'], 200), 'NRC reactors');
    lastSource = r.source;
    return r;
  },
  parse(r) {
    if (r.source === 'primary') return parseReactors(r.data);
    return (r.data.elements || []).map((el) => ({ key: `${el.type}${el.id}`, ...where(el), title: (el.tags || {}).name || 'Nuclear power plant', subtitle: 'OpenStreetMap', rows: tagRows(el.tags || {}, [['operator', 'Operator'], ['plant:output:electricity', 'Output']]) }));
  },
  note: () => (lastSource === 'primary' ? 'Colour: green near full power, amber reduced, red off' : 'Main source down: showing OpenStreetMap'),
});
