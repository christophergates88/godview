// Mock KV and mock fetch for the watch worker (shared by the worker tests and the app harness).
import * as F from './fixtures.mjs';

// ---------------------------------------------------------------- mocks
export class KV {
  constructor() { this.m = new Map(); this.writes = 0; }
  async get(k, type) { const v = this.m.get(k); return v == null ? null : type === 'json' ? JSON.parse(v) : v; }
  async put(k, v) { this.writes++; this.m.set(k, v); }
}
export function makeFetch(opts = {}) {
  const calls = [];
  const sent = [];
  const o = { tornado: true, fireKm: 20, gauge: 'minor', aqi: 160, anthropic: 'ok', ...opts };
  const res = (body, status = 200, type = 'application/json') => new Response(typeof body === 'string' ? body : JSON.stringify(body), { status, headers: { 'Content-Type': type } });
  const f = async (url, init = {}) => {
    const u = new URL(url);
    calls.push({ url: String(url), init });
    const h = u.hostname; const p = u.pathname;
    if (opts.fail && opts.fail.test(String(url))) return res({ error: 'down' }, 503);
    if (h === 'api.weather.gov') {
      if (!init.headers || !/GodView/.test(init.headers['User-Agent'])) return res({ error: 'UA required' }, 403);
      return res(F.nws(o.now, { tornado: o.tornado }));
    }
    if (h === 'www.spc.noaa.gov') return /csv/.test(p) ? res(F.spcCsv, 200, 'text/csv') : res(F.spcOutlook);
    if (h === 'earthquake.usgs.gov' && /fdsnws/.test(p)) return res(F.fdsn(o.now, 33.749, -84.388));
    if (h === 'earthquake.usgs.gov') return res(F.usgs);
    if (h === 'services3.arcgis.com') return res(/Incident_Locations/.test(p) ? F.fireIncidents(o.fireKm) : F.firePerimeters);
    if (h === 'api.water.noaa.gov') return res(F.gauges(o.gauge));
    if (h === 'api.adsb.lol') return res(p.startsWith('/v2/sqk/') ? F.sqk(p.split('/').pop()) : F.aircraft);
    if (h === 'www.nhc.noaa.gov') return res(F.nhcStorms);
    if (h === 'mapservices.weather.noaa.gov') return /mrms_qpe/.test(p) ? res(F.mrms) : res(/query/.test(p) ? F.coneHit : F.nhcMap);
    if (h === 'mesonet.agron.iastate.edu') {
      const lat = Number(u.searchParams.get('lat')) || 33.75; const lon = Number(u.searchParams.get('lon')) || -84.39;
      return /sbw_by_point/.test(p) ? res(F.sbw(o.now)) : res(F.lsr(o.now, o.lsrLat ?? 33.749, o.lsrLon ?? -84.388));
    }
    if (h === 'earthquake.usgs.gov' && /fdsnws/.test(p)) return res(F.fdsn(o.now, 33.749, -84.388));
    if (h === '511ga.org' || h === 'cwwp2.dot.ca.gov') { calls.cam = (calls.cam || 0) + 1; return new Response(F.camJpeg, { status: 200, headers: { 'Content-Type': 'image/jpeg' } }); }
    if (h === 'air-quality-api.open-meteo.com') return res(F.air(o.aqi));
    if (h === 'services.swpc.noaa.gov') return res(F.ovation);
    if (h === 'celestrak.org') return res(F.issOmm(o.now - 3 * 3600e3));
    if (h === 'll.thespacedevs.com') return res(F.launches(o.now));
    if (h === 'api.open-meteo.com') return res(F.forecast);
    if (h === 'ntfy.sh') { sent.push(JSON.parse(init.body)); return res({ id: 'x' }); }
    if (h === 'api.anthropic.com') {
      const b = JSON.parse(init.body);
      const vision = Array.isArray(b.messages?.[0]?.content) && b.messages[0].content.some((c) => c.type === 'image');
      if (vision) {
        sent.vision = (sent.vision || []).concat([b]);
        return res({ model: b.model, content: [{ type: 'text', text: o.visionText || '{"findings":[{"what":"flooding","confidence":0.86,"note":"water across both lanes"}]}' }] });
      }
      sent.ai = b;
      if (o.anthropic === 'fail') return res({ error: { message: 'overloaded' } }, 529);
      return res({ model: b.model, content: [{ type: 'text', text: 'Test Home: rain and wind today. Do: take an umbrella.' }] });
    }
    return res({ error: 'unexpected host ' + h }, 404);
  };
  f.calls = calls; f.sent = sent; f.o = o;
  return f;
}
