// Cell sites in view: every site on an active FCC Cellular licence (the FCC's
// Universal Licensing System, refreshed weekly by scripts/build_packs.py in
// GitHub Actions). Carriers that share one structure are one site. The old
// source (HIFLD's copy of the same FCC data, on a NASA mirror) no longer answers.
// OpenStreetMap via Overpass is only a fallback.
import { makePointLayer } from './lib/point-layer.js';
import { ICONS } from './lib/icons.js';
import { overpass, where, tagRows } from './lib/overpass.js';
import { withFallback } from './lib/arcgis.js';
import { packRows, builtOn } from './lib/packs.js';

let src = { kind: 'pack', built: null };

// One licensee often holds many sites under slightly different names; shorten the usual ones.
export function carrier(lic) {
  const s = String(lic || '');
  if (/cingular|at&t|new cingular/i.test(s)) return 'AT&T';
  if (/t-?mobile|sprint|omnipoint|powertel|voicestream/i.test(s)) return 'T-Mobile';
  if (/cellco|verizon|alltel|gte/i.test(s)) return 'Verizon';
  if (/us cellular|united states cellular/i.test(s)) return 'UScellular';
  if (/dish|ets wireless|gamma acquisition/i.test(s)) return 'Dish / Boost';
  return '';
}

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
  attribution: 'Cell sites: FCC Universal Licensing System (Cellular service, active licences), weekly copy; fallback © OpenStreetMap contributors via Overpass',
  async fetch(ctx, q) {
    const r = await withFallback(ctx, () => packRows(ctx, 'towers', q),
      () => overpass(ctx, q, ['nwr["tower:type"="communication"]', 'nwr["communication:mobile_phone"="yes"]'], 1500), 'Cell tower copy');
    src = r.source === 'primary' ? { kind: 'pack', built: r.data.built } : { kind: 'live' };
    return r;
  },
  parse(r) {
    if (r.source !== 'primary') {
      return (r.data.elements || []).map((el) => {
        const t = el.tags || {};
        return { key: `${el.type}${el.id}`, ...where(el), title: t.name || 'Communication tower', subtitle: 'OpenStreetMap', rows: tagRows(t, [['operator', 'Operator'], ['height', 'Height']]) };
      });
    }
    return r.data.items.map((t, i) => {
      const names = String(t.licensee || '').split(' · ').filter(Boolean);
      const brands = [...new Set(names.map(carrier).filter(Boolean))];
      const h = Number(t.heightM);
      const tall = Number.isFinite(h) && h > 0;
      const rows = [[names.length > 1 ? 'Licensees' : 'Licensee', names.join(', ') || '—']];
      if (brands.length) rows.push([brands.length > 1 ? 'Carriers' : 'Carrier', brands.join(', ')]);
      rows.push(['Structure height', tall ? `${Math.round(h)} m, about ${Math.round(h * 3.281)} ft (as filed)` : '—']);
      if (t.structure) rows.push(['Structure', t.structure]);
      if (t.asr) rows.push(['FCC tower registration', t.asr]);
      if (t.callsign) rows.push(['FCC call sign', t.callsign]);
      const who = brands.length ? brands.join(' + ') : names[0] || '';
      return {
        key: `t${t.asr || ''}_${t.lat}_${t.lon}_${i}`, lat: t.lat, lon: t.lon,
        title: who || 'Cell site', subtitle: [t.city, t.state].filter(Boolean).join(', ') || 'Cell site',
        say: `Cell site${who ? ` used by ${who}` : ''}${names.length > 1 ? ` (${names.length} licensees share it)` : ''}${tall ? `, on a structure about ${Math.round(h)} m tall` : ''}.`,
        rows,
        link: t.asr
          ? { href: 'https://wireless2.fcc.gov/UlsApp/AsrSearch/asrRegistrationSearch.jsp', text: `FCC tower search (registration ${t.asr})` }
          : { href: 'https://wireless2.fcc.gov/UlsApp/UlsSearch/searchLicense.jsp', text: 'FCC licence search' },
      };
    });
  },
  note: () => (src.kind === 'pack' ? `FCC licences · copy from ${builtOn(src.built)}, refreshed weekly` : 'Weekly copy unavailable: showing OpenStreetMap'),
});
