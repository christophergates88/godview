// GodView Watch — a Cloudflare Worker that WATCHES saved places, BRIEFS each
// morning and REMEMBERS a compact history. Single file, no dependencies.
//
// Bindings (set by "Deploy GodView Watch.command"):
//   KV               KV namespace "godview-watch" (all state lives here)
//   WATCH_TOKEN      secret: bearer token the app must send
//   NTFY_TOPIC       secret: ntfy.sh topic for phone notifications
//   ANTHROPIC_API_KEY optional secret: lets Claude word the brief
//   BRIEF_MODEL      optional var/secret: model id (default below)
// Cron: "*/5 * * * *".
//
// Privacy: places (names/coordinates) live only in KV, never in source code.

export const VERSION = '3.0.0';
const ALLOWED_ORIGIN = 'https://christophergates88.github.io';
const APP_URL = 'https://christophergates88.github.io/godview/';
const UA = 'GodView-Watch/3.0 (personal weather and hazard watcher; https://christophergates88.github.io/godview/)';
const DEFAULT_MODEL = 'claude-haiku-5-5'; // Claude Haiku 5.5, per platform.claude.com/docs/en/models/overview (Nov 2026)
const MAX_PLACES = 12;
const SUBREQUEST_BUDGET = 45; // Workers free plan allows 50 per invocation; keep 5 for notifications/KV
const LOG_CAP = 300;          // events kept per place
const HIST_CAP = 400;         // daily rollups kept per place
const DEDUPE_DAYS = 8;

// A fixed public test point for /selftest (Georgia State Capitol, Atlanta).
export const TEST_PLACE = { id: 'selftest', name: 'Georgia State Capitol (test)', lat: 33.7490, lon: -84.3880, radiusKm: 40, kind: 'home' };

export const SRC = {
  nwsAlerts: 'https://api.weather.gov/alerts/active?point={lat},{lon}',
  spcReports: 'https://www.spc.noaa.gov/climo/reports/today.csv',
  spcOutlook: 'https://www.spc.noaa.gov/products/outlook/day1otlk_cat.nolyr.geojson',
  quakes: 'https://earthquake.usgs.gov/earthquakes/feed/v1.0/summary/2.5_day.geojson',
  fireIncidents: 'https://services3.arcgis.com/T4QMspbfLg3qTGWY/arcgis/rest/services/WFIGS_Incident_Locations_Current/FeatureServer/0/query' +
    '?where=1%3D1&outFields=IncidentName,IncidentSize,PercentContained,UniqueFireIdentifier&geometry={w},{s},{e},{n}&geometryType=esriGeometryEnvelope&inSR=4326&outSR=4326&spatialRel=esriSpatialRelIntersects&f=geojson',
  firePerimeters: 'https://services3.arcgis.com/T4QMspbfLg3qTGWY/arcgis/rest/services/WFIGS_Interagency_Perimeters_Current/FeatureServer/0/query' +
    '?where=1%3D1&outFields=poly_IncidentName,attr_UniqueFireIdentifier,poly_GISAcres,attr_PercentContained&geometry={w},{s},{e},{n}&geometryType=esriGeometryEnvelope&inSR=4326&outSR=4326&spatialRel=esriSpatialRelIntersects&maxAllowableOffset=0.002&geometryPrecision=4&f=geojson',
  gauges: 'https://api.water.noaa.gov/nwps/v1/gauges?bbox.xmin={w}&bbox.ymin={s}&bbox.xmax={e}&bbox.ymax={n}&srid=EPSG_4326',
  squawk: 'https://api.adsb.lol/v2/sqk/{code}',
  aircraft: 'https://api.adsb.lol/v2/point/{lat}/{lon}/{nm}',
  nhcStorms: 'https://www.nhc.noaa.gov/CurrentStorms.json',
  nhcMap: 'https://mapservices.weather.noaa.gov/tropical/rest/services/tropical/NHC_tropical_weather/MapServer',
  airQuality: 'https://air-quality-api.open-meteo.com/v1/air-quality?latitude={lat}&longitude={lon}&current=us_aqi,pm2_5',
  aurora: 'https://services.swpc.noaa.gov/json/ovation_aurora_latest.json',
  stations: 'https://celestrak.org/NORAD/elements/gp.php?CATNR=25544&FORMAT=JSON',
  launches: 'https://ll.thespacedevs.com/2.3.0/launches/upcoming/?limit=15&mode=normal',
  forecast: 'https://api.open-meteo.com/v1/forecast?latitude={lat}&longitude={lon}&daily=temperature_2m_max,temperature_2m_min,precipitation_probability_max,wind_gusts_10m_max,weather_code,sunrise,sunset,uv_index_max&current=temperature_2m,weather_code&timezone=auto&forecast_days=1&temperature_unit=fahrenheit&wind_speed_unit=mph',
  ntfy: 'https://ntfy.sh/',
  anthropic: 'https://api.anthropic.com/v1/messages',
  // Conditions reports (v5)
  sbwByPoint: 'https://mesonet.agron.iastate.edu/json/sbw_by_point.py',
  lsr: 'https://mesonet.agron.iastate.edu/geojson/lsr.geojson',
  fdsn: 'https://earthquake.usgs.gov/fdsnws/event/1/query',
  mrmsIdentify: 'https://mapservices.weather.noaa.gov/raster/rest/services/obs/mrms_qpe/ImageServer/identify',
  nwsAlertsAll: 'https://api.weather.gov/alerts?point={lat},{lon}&start={start}&end={end}',
};

// Which checks run for each kind of place.
export const KINDS = {
  home: ['alerts', 'storms', 'quakes', 'fires', 'rivers', 'squawk', 'aircraft', 'tropical', 'air', 'aurora', 'iss', 'launch'],
  family: ['alerts', 'storms', 'quakes', 'fires', 'rivers', 'tropical', 'air'],
  property: ['alerts', 'storms', 'quakes', 'fires', 'rivers', 'tropical'],
  waypoint: ['alerts', 'storms', 'fires', 'rivers', 'tropical'],
  client: ['alerts', 'storms', 'fires', 'rivers', 'tropical'],
};
export const DEFAULT_SETTINGS = { briefHour: 6, briefMinute: 15, tz: 'America/New_York', quietStart: 22, quietEnd: 6, units: 'imperial', camCap: 50 };
export const SEV = { info: 1, heads: 2, act: 3 };
const SEV_LABEL = { 1: 'info', 2: 'heads-up', 3: 'act now' };

// ======================================================================= helpers
const R = 6371;
export function distKm(a, b, c, d) {
  const t = Math.PI / 180;
  const x = Math.sin((c - a) * t / 2) ** 2 + Math.cos(a * t) * Math.cos(c * t) * Math.sin((d - b) * t / 2) ** 2;
  return 2 * R * Math.asin(Math.min(1, Math.sqrt(x)));
}
export function bearing(a, b, c, d) {
  const t = Math.PI / 180;
  const y = Math.sin((d - b) * t) * Math.cos(c * t);
  const x = Math.cos(a * t) * Math.sin(c * t) - Math.sin(a * t) * Math.cos(c * t) * Math.cos((d - b) * t);
  return (Math.atan2(y, x) / t + 360) % 360;
}
export const compass = (deg) => ['N', 'NE', 'E', 'SE', 'S', 'SW', 'W', 'NW'][Math.round(deg / 45) % 8];
export function where(place, lat, lon) {
  const km = distKm(place.lat, place.lon, lat, lon);
  const mi = km * 0.621371;
  if (mi < 0.5) return { km, text: 'right at the place' };
  return { km, dir: compass(bearing(place.lat, place.lon, lat, lon)), text: `${mi < 10 ? mi.toFixed(1) : Math.round(mi)} mi ${compass(bearing(place.lat, place.lon, lat, lon))}` };
}
export function bbox(lat, lon, km) {
  const dLat = km / 111; const dLon = km / (111 * Math.max(0.05, Math.cos(lat * Math.PI / 180)));
  const r = (x) => Math.round(x * 1000) / 1000;
  return { s: r(lat - dLat), n: r(lat + dLat), w: r(lon - dLon), e: r(lon + dLon) };
}
export const fill = (t, p) => t.replace(/\{(\w+)\}/g, (_, k) => encodeURIComponent(p[k] ?? '')).replace(/%2C/g, ',');
export function inRing(lat, lon, ring) {
  let inside = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const [xi, yi] = ring[i]; const [xj, yj] = ring[j];
    if ((yi > lat) !== (yj > lat) && lon < ((xj - xi) * (lat - yi)) / (yj - yi) + xi) inside = !inside;
  }
  return inside;
}
export function parseCSV(text) {
  return String(text).split(/\r?\n/).filter(Boolean).map((line) => {
    const out = []; let cur = ''; let q = false;
    for (let i = 0; i < line.length; i++) {
      const c = line[i];
      if (q) { if (c === '"' && line[i + 1] === '"') { cur += '"'; i++; } else if (c === '"') q = false; else cur += c; } else if (c === '"') q = true; else if (c === ',') { out.push(cur); cur = ''; } else cur += c;
    }
    out.push(cur);
    return out;
  });
}
const mi = (km) => km * 0.621371;
const fmtMi = (km) => `${mi(km) < 10 ? mi(km).toFixed(1) : Math.round(mi(km))} mi`;

// Local date/time parts in a time zone (DST handled by Intl).
export function localParts(date, tz) {
  const f = new Intl.DateTimeFormat('en-US', { timeZone: tz, year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hourCycle: 'h23', weekday: 'short' });
  const p = Object.fromEntries(f.formatToParts(date).map((x) => [x.type, x.value]));
  return { date: `${p.year}-${p.month}-${p.day}`, hour: Number(p.hour), minute: Number(p.minute), weekday: p.weekday };
}
export function localTime(ms, tz) {
  return new Date(ms).toLocaleTimeString('en-US', { timeZone: tz, hour: 'numeric', minute: '2-digit' });
}
export function isQuiet(date, s) {
  const h = localParts(date, s.tz).hour;
  return s.quietStart > s.quietEnd ? (h >= s.quietStart || h < s.quietEnd) : (h >= s.quietStart && h < s.quietEnd);
}
export function briefDue(date, s, lastBriefDate) {
  const lp = localParts(date, s.tz);
  const mins = lp.hour * 60 + lp.minute;
  const at = s.briefHour * 60 + s.briefMinute;
  return lastBriefDate !== lp.date && mins >= at && mins < at + 180;
}

// ---- network: per-run memo, timeout, subrequest budget
export async function get(ctx, url, { type = 'json', headers = {}, timeoutMs = 12000, memo = true, method = 'GET', body } = {}) {
  if (memo && ctx.memo.has(url)) return ctx.memo.get(url);
  const p = (async () => {
    if (ctx.sub >= ctx.budget) throw new Error('skipped: subrequest budget for this run used up');
    ctx.sub++;
    const ac = new AbortController();
    const timer = setTimeout(() => ac.abort(), timeoutMs);
    let res;
    try {
      res = await ctx.fetch(url, { method, body, headers: { 'User-Agent': UA, Accept: type === 'json' ? 'application/json, application/geo+json' : '*/*', ...headers }, signal: ac.signal });
    } catch (e) {
      throw new Error(e.name === 'AbortError' ? 'timed out' : `network error (${e.message})`);
    } finally { clearTimeout(timer); }
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return type === 'text' ? res.text() : res.json();
  })();
  if (memo) ctx.memo.set(url, p);
  return p;
}

// ======================================================================= events
function ev(place, check, sev, key, title, text, todo, pos, data) {
  const w = pos ? where(place, pos.lat, pos.lon) : null;
  return {
    id: `${place.id}|${key}`, key, placeId: place.id, check, sev, title, text: text + (w && !/ mi [NSEW]|right at the place/.test(text) ? ` (${w.text})` : ''),
    todo: todo || '', distKm: w ? Math.round(w.km * 10) / 10 : null, dir: w?.dir || null, data: pos && Number.isFinite(pos.lat) ? { ...(data || {}), pos: { lat: Math.round(pos.lat * 1e4) / 1e4, lon: Math.round(pos.lon * 1e4) / 1e4 } } : (data || null), handled: false,
  };
}

// ======================================================================= checks
// Each check: async (ctx, place, ps) -> { events: [], metrics: {}, count }
// ps = this place's saved state (mutated in place; in tests it is a copy).

export const CHECKS = {};

// --- NWS alerts at the point: new, updated, ended
CHECKS.alerts = async (ctx, place, ps) => {
  const j = await get(ctx, fill(SRC.nwsAlerts, { lat: place.lat.toFixed(4), lon: place.lon.toFixed(4) }), { memo: false });
  const feats = j.features || [];
  const prev = ps.alerts || {};
  const now = {};
  const events = [];
  for (const f of feats) {
    const p = f.properties || {};
    const id = p.id || f.id;
    now[id] = p.event;
    if (prev[id]) continue;
    const ev1 = String(p.event || 'Weather alert');
    const act = /Tornado Warning|Flash Flood Warning|Extreme Wind|Hurricane Warning|Storm Surge Warning|Tsunami Warning|Evacuation|Shelter in Place|Fire Warning|Dust Storm Warning/i.test(ev1) || p.severity === 'Extreme';
    const sev = act ? SEV.act : (/Warning/i.test(ev1) || p.severity === 'Severe') ? SEV.heads : SEV.info;
    const updated = p.messageType === 'Update';
    const until = p.ends || p.expires;
    const prm = p.parameters || {};
    const hailIn = Number(String((prm.maxHailSize || [])[0] || '').replace(/[^\d.]/g, '')) || 0;
    const gust = String((prm.maxWindGust || [])[0] || '').trim();
    if (hailIn || gust) (ps.alertTags ||= {})[id] = { hail: hailIn, gust, event: ev1, t: ctx.now.getTime() };
    const todo = (p.instruction || '').split(/(?<=\.)\s/)[0].slice(0, 180) || (act ? 'Follow local official instructions now.' : '');
    events.push(ev(place, 'alerts', sev, `nws:${id}`, `${updated ? 'Updated: ' : ''}${ev1}`,
      `${ev1} for ${place.name}${until ? ` until ${localTime(Date.parse(until), ctx.settings.tz)}` : ''}${hailIn ? `; warned for ${hailIn.toFixed(2)} in hail` : ''}${gust ? `${hailIn ? ',' : ';'} wind ${gust}` : ''}.`, todo, null, { headline: p.headline || '', hailIn, gust }));
  }
  for (const id of Object.keys(prev)) {
    if (!now[id]) events.push(ev(place, 'alerts', SEV.info, `nwsend:${id}`, `${prev[id]} ended`, `${prev[id]} for ${place.name} has ended or expired.`, ''));
  }
  ps.alerts = now;
  for (const id of Object.keys(ps.alertTags || {})) if (!now[id] && ctx.now.getTime() - ps.alertTags[id].t > 6 * 3600e3) delete ps.alertTags[id];
  const newCount = events.filter((e) => e.key.startsWith('nws:')).length;
  return { events, metrics: { alerts: newCount }, count: feats.length };
};

// --- SPC preliminary storm reports within the radius
CHECKS.storms = async (ctx, place) => {
  const text = await get(ctx, SRC.spcReports, { type: 'text' });
  const events = []; let hail = 0; let tor = 0; let wind = 0; let type = null; let n = 0;
  const day = localParts(ctx.now, 'UTC').date;
  for (const r of parseCSV(text)) {
    if (r[0] === 'Time') { type = r[1]; continue; }
    const lat = Number(r[5]); const lon = Number(r[6]);
    if (!type || !Number.isFinite(lat)) continue;
    const km = distKm(place.lat, place.lon, lat, lon);
    if (km > place.radiusKm) continue;
    n++;
    const key = `spc:${day}:${type}:${r[0]}:${lat},${lon}`;
    const pos = { lat, lon };
    if (type === 'F_Scale') {
      tor++;
      events.push(ev(place, 'storms', km <= 15 ? SEV.act : SEV.heads, key, 'Tornado reported nearby', `Tornado reported at ${r[2]}, ${r[4]}.`, km <= 15 ? 'Check the latest warnings and be ready to shelter.' : '', pos));
    } else if (type === 'Size') {
      const inches = Number(r[1]) / 100;
      hail = Math.max(hail, inches || 0);
      events.push(ev(place, 'storms', inches >= 1 ? SEV.heads : SEV.info, key, `${inches ? inches.toFixed(2) + ' in ' : ''}hail reported`, `${inches ? inches.toFixed(2) + '-inch ' : ''}hail reported at ${r[2]}, ${r[4]}.`, inches >= 1 ? 'Cars under cover if storms are still coming.' : '', pos));
    } else if (type === 'Speed') {
      wind++;
      events.push(ev(place, 'storms', km <= 10 ? SEV.heads : SEV.info, key, 'Wind damage reported', `Wind damage reported at ${r[2]}, ${r[4]}${r[1] && r[1] !== 'UNK' ? ` (${r[1]} mph)` : ''}.`, '', pos));
    }
  }
  return { events, metrics: { hail, tornado: tor, wind }, count: n };
};

// --- Earthquakes, scaled by magnitude and distance
export function quakeRule(mag, km) {
  if ((mag >= 6 && km <= 200) || (mag >= 5 && km <= 50)) return SEV.act;
  if ((mag >= 4.5 && km <= 300) || (mag >= 6.5 && km <= 1500)) return SEV.heads;
  if ((mag >= 2.5 && km <= 50) || (mag >= 4 && km <= 300) || (mag >= 5.5 && km <= 1000) || (mag >= 7 && km <= 3000)) return SEV.info;
  return 0;
}
CHECKS.quakes = async (ctx, place) => {
  const j = await get(ctx, SRC.quakes);
  const events = []; let maxMag = 0; let n = 0;
  for (const f of j.features || []) {
    const [lon, lat] = f.geometry?.coordinates || [];
    const mag = Number(f.properties?.mag);
    if (!Number.isFinite(lat) || !Number.isFinite(mag)) continue;
    const km = distKm(place.lat, place.lon, lat, lon);
    if (km <= 300) { n++; maxMag = Math.max(maxMag, mag); }
    const sev = quakeRule(mag, km);
    if (!sev) continue;
    events.push(ev(place, 'quakes', sev, `eq:${f.id}`, `M${mag.toFixed(1)} earthquake`, `M${mag.toFixed(1)} earthquake ${f.properties.place || ''}.`,
      sev === SEV.act ? 'Check for damage; expect aftershocks.' : '', { lat, lon }));
  }
  return { events, metrics: { quakeMax: maxMag, quakes: n }, count: n };
};

// --- Wildfires: new fires within range, and whether the gap is closing
function minDistToPolys(place, geom) {
  const polys = geom.type === 'Polygon' ? [geom.coordinates] : geom.type === 'MultiPolygon' ? geom.coordinates : [];
  let best = Infinity; let bp = null;
  for (const poly of polys) {
    if (poly[0] && inRing(place.lat, place.lon, poly[0])) return { km: 0, lat: place.lat, lon: place.lon };
    for (const [lon, lat] of poly[0] || []) {
      const d = distKm(place.lat, place.lon, lat, lon);
      if (d < best) { best = d; bp = { lat, lon }; }
    }
  }
  return { km: best, ...bp };
}
CHECKS.fires = async (ctx, place, ps) => {
  const rangeKm = Math.max(place.radiusKm, 40);
  const b = bbox(place.lat, place.lon, rangeKm);
  const [inc, per] = await Promise.all([
    get(ctx, fill(SRC.fireIncidents, b), { memo: false, timeoutMs: 15000 }),
    get(ctx, fill(SRC.firePerimeters, b), { memo: false, timeoutMs: 15000 }).catch(() => ({ features: [] })),
  ]);
  const fires = new Map();
  for (const f of inc.features || []) {
    const [lon, lat] = f.geometry?.coordinates || [];
    if (!Number.isFinite(lat)) continue;
    const id = f.properties?.UniqueFireIdentifier || String(f.id);
    fires.set(id, { id, name: f.properties?.IncidentName || 'Wildfire', km: distKm(place.lat, place.lon, lat, lon), lat, lon, acres: f.properties?.IncidentSize, pct: f.properties?.PercentContained });
  }
  for (const f of per.features || []) {
    if (!f.geometry) continue;
    const id = f.properties?.attr_UniqueFireIdentifier || `p${f.id}`;
    const d = minDistToPolys(place, f.geometry);
    const prev = fires.get(id);
    if (!prev || d.km < prev.km) fires.set(id, { ...(prev || {}), id, name: f.properties?.poly_IncidentName || prev?.name || 'Wildfire', km: d.km, lat: d.lat, lon: d.lon, acres: f.properties?.poly_GISAcres ?? prev?.acres, perimeter: true });
  }
  const events = [];
  const prevD = ps.fires || {};
  const nowD = {};
  for (const fz of fires.values()) {
    if (fz.km > rangeKm) continue;
    const km = Math.round(fz.km * 10) / 10;
    nowD[fz.id] = prevD[fz.id] != null && Math.abs(prevD[fz.id] - km) < 0.5 ? prevD[fz.id] : km;
    const name = `${fz.name} fire`;
    const w = where(place, fz.lat, fz.lon);
    if (prevD[fz.id] == null) {
      events.push(ev(place, 'fires', km <= 5 ? SEV.act : SEV.heads, `fire:${fz.id}:new`, `${name} near ${place.name}`,
        `${name} is ${w.text} of ${place.name}${fz.acres ? ` (${Math.round(fz.acres).toLocaleString('en-US')} acres)` : ''}.`, km <= 5 ? 'Be ready to leave; follow local evacuation orders.' : '', fz));
    } else if (prevD[fz.id] - km >= 1) {
      events.push(ev(place, 'fires', km <= 5 ? SEV.act : SEV.heads, `fire:${fz.id}:closer:${Math.floor(km / 2)}`, `${name} is getting closer`,
        `${name} is now ${w.text} of ${place.name} (was ${fmtMi(prevD[fz.id])}).`, km <= 8 ? 'Check evacuation status for the area.' : '', fz));
    }
  }
  ps.fires = nowD;
  const nearest = Math.min(Infinity, ...Object.values(nowD));
  return { events, metrics: { fires: Object.keys(nowD).length, fireNearestKm: Number.isFinite(nearest) ? nearest : null }, count: Object.keys(nowD).length };
};

// --- River gauges: nearest gauge and any gauge in range crossing action/flood stage
const CAT = ['no_flooding', 'action', 'minor', 'moderate', 'major'];
const CAT_NAME = { no_flooding: 'normal', action: 'near flood stage', minor: 'minor flooding', moderate: 'moderate flooding', major: 'major flooding' };
CHECKS.rivers = async (ctx, place, ps) => {
  const b = bbox(place.lat, place.lon, Math.max(place.radiusKm, 25));
  const j = await get(ctx, fill(SRC.gauges, b), { memo: false, timeoutMs: 15000 });
  const gauges = (j.gauges || []).filter((g) => g.latitude != null);
  const prev = ps.gauges || {};
  const now = {};
  const events = [];
  let nearest = null;
  for (const g of gauges) {
    const km = distKm(place.lat, place.lon, g.latitude, g.longitude);
    if (!nearest || km < nearest.km) nearest = { ...g, km };
    const cat = g.status?.observed?.floodCategory;
    if (CAT.indexOf(cat) >= 1) now[g.lid] = cat;
  }
  if (nearest && !now[nearest.lid]) now[nearest.lid] = nearest.status?.observed?.floodCategory || 'no_flooding';
  for (const [lid, cat] of Object.entries(now)) {
    const g = gauges.find((x) => x.lid === lid);
    const was = prev[lid] || 'no_flooding';
    const ci = CAT.indexOf(cat); const wi = CAT.indexOf(was);
    if (ci > wi && ci >= 1) {
      events.push(ev(place, 'rivers', ci >= 3 ? SEV.act : SEV.heads, `river:${lid}:${cat}:${localParts(ctx.now, ctx.settings.tz).date}`, `${g.name}: ${CAT_NAME[cat]}`,
        `${g.name} is at ${CAT_NAME[cat]}${g.status?.observed?.primary != null ? ` (${g.status.observed.primary} ${g.status.observed.primaryUnit || ''})`.replace(' )', ')') : ''}.`, ci >= 3 ? 'Avoid low roads and flooded crossings.' : '', { lat: g.latitude, lon: g.longitude }));
    } else if (ci < wi && wi >= 1) {
      events.push(ev(place, 'rivers', SEV.info, `river:${lid}:down:${cat}:${localParts(ctx.now, ctx.settings.tz).date}`, `${g.name}: back to ${CAT_NAME[cat] || 'normal'}`, `${g.name} has dropped to ${CAT_NAME[cat] || 'normal'}.`, '', { lat: g.latitude, lon: g.longitude }));
    }
  }
  ps.gauges = now;
  return { events, metrics: { riverCat: Math.max(0, ...Object.values(now).map((c) => CAT.indexOf(c))) }, count: gauges.length };
};

// --- Emergency squawks within ~25 miles
const SQK = { 7700: 'general emergency', 7600: 'radio failure', 7500: 'unlawful interference' };
CHECKS.squawk = async (ctx, place) => {
  const events = []; let n = 0;
  for (const code of Object.keys(SQK)) {
    const j = await get(ctx, fill(SRC.squawk, { code }));
    for (const a of j.ac || []) {
      if (a.lat == null) continue;
      const km = distKm(place.lat, place.lon, a.lat, a.lon);
      if (km > 40) continue;
      n++;
      const alt = typeof a.alt_baro === 'number' ? `${a.alt_baro.toLocaleString('en-US')} ft` : 'on the ground';
      events.push(ev(place, 'squawk', SEV.heads, `sqk:${a.hex}:${code}:${localParts(ctx.now, 'UTC').date}`, `Aircraft emergency code ${code}`,
        `${(a.flight || a.hex || '').trim()} is squawking ${code} (${SQK[code]}) at ${alt}.`, '', { lat: a.lat, lon: a.lon }));
    }
  }
  return { events, metrics: {}, count: n };
};

// --- Aircraft over the place: count, military low overhead, and loitering.
// HEURISTIC, clearly a guess: "loitering" = the same aircraft below 3,000 ft
// within 3 nm of the place on 3 checks in a row (about 15 minutes).
CHECKS.aircraft = async (ctx, place, ps) => {
  const j = await get(ctx, fill(SRC.aircraft, { lat: place.lat.toFixed(4), lon: place.lon.toFixed(4), nm: 10 }), { memo: false });
  const list = (j.ac || []).filter((a) => a.lat != null);
  const events = [];
  const low = {};
  const prevLow = ps.low || {};
  for (const a of list) {
    const alt = typeof a.alt_baro === 'number' ? a.alt_baro : null;
    const km = distKm(place.lat, place.lon, a.lat, a.lon);
    const military = (Number(a.dbFlags) & 1) === 1;
    const name = (a.flight || a.r || a.hex || '').trim();
    if (military && alt != null && alt < 5000 && km < 18.5) {
      events.push(ev(place, 'aircraft', SEV.info, `mil:${a.hex}:${localParts(ctx.now, ctx.settings.tz).date}`, 'Military aircraft low nearby',
        `Military-tagged aircraft ${name}${a.t ? ` (${a.t})` : ''} at ${alt.toLocaleString('en-US')} ft.`, '', { lat: a.lat, lon: a.lon }, { guess: true }));
    }
    if (alt != null && alt < 3000 && alt > 0 && km < 5.6) {
      low[a.hex] = Math.min(3, (prevLow[a.hex] || 0) + 1);
      if (low[a.hex] === 3 && prevLow[a.hex] === 2) {
        events.push(ev(place, 'aircraft', SEV.heads, `loiter:${a.hex}:${localParts(ctx.now, ctx.settings.tz).date}`, 'Aircraft staying low overhead',
          `${name}${a.t ? ` (${a.t})` : ''} has stayed low over ${place.name} for about 15 minutes. This is a guess from position only (could be police, news, survey or training).`, '', { lat: a.lat, lon: a.lon }, { guess: true }));
      }
    }
  }
  ps.low = low;
  events.push(...aircraftInferences(ctx, place, ps, list));
  const heli = list.filter(isRotorcraft).length;
  return { events, metrics: { aircraft: list.length, heli }, count: list.length };
};

// ======================================================================= inferences
// Things nobody reported, worked out from several signals. Always labelled
// "Possibly", with a confidence and the evidence, never stated as fact.
export const TANKERS = new Set(['AT8T', 'AT802', 'AT45', 'AT65', 'CL2T', 'CL41', 'CL4G', 'C130', 'C30J', 'DC10', 'MD87', 'B742', 'P3', 'BAE146', 'B463', 'RJ85', 'S2P', 'S2T']);
export const isRotorcraft = (a) => a.category === 'A7' || /^(H\d|EC\d|AS\d|B0?[0-9]{2}|R22|R44|R66|S76|S92|A109|A139|A169|AW|BK17|MD5|MD9|EH10|UH|NH90)/i.test(String(a.t || '')) || /helicopter/i.test(String(a.desc || ''));
export function inference(place, key, title, text, confidence, evidence, pos, sev = SEV.info) {
  return ev(place, 'infer', sev, `inf:${key}`, `Possibly: ${title}`, `Possibly ${text.replace(/^./, (c) => c.toLowerCase())}`, '', pos, { inference: true, confidence, evidence });
}
const hourKey = (ctx) => `${localParts(ctx.now, 'UTC').date}T${localParts(ctx.now, 'UTC').hour}`;

export function aircraftInferences(ctx, place, ps, list) {
  const out = [];
  const near = list.filter((a) => a.lat != null && distKm(place.lat, place.lon, a.lat, a.lon) <= Math.max(place.radiusKm, 20));
  const alt = (a) => (typeof a.alt_baro === 'number' ? a.alt_baro : null);
  // Helicopters low and slow: maybe landing or hovering (medical, police, news...)
  for (const a of near.filter((x) => isRotorcraft(x) && alt(x) != null && alt(x) < 1000 && (x.gs ?? 99) < 40)) {
    out.push(inference(place, `hover:${a.hex}:${hourKey(ctx)}`, 'helicopter landing or hovering',
      `A helicopter${a.flight ? ` (${a.flight.trim()})` : ''} is low (${alt(a)} ft) and slow (${Math.round(a.gs ?? 0)} kt) near ${place.name}: it may be landing or hovering, for example a medical or police flight.`,
      'low', [`Rotorcraft ${a.t || a.hex} at ${alt(a)} ft, ${Math.round(a.gs ?? 0)} kt`, 'Position from adsb.lol'], { lat: a.lat, lon: a.lon }));
  }
  // Several helicopters / military / emergency aircraft converging on one spot
  const special = near.filter((a) => isRotorcraft(a) || (Number(a.dbFlags) & 1) === 1 || ['7700', '7600', '7500'].includes(String(a.squawk)));
  for (const a of special) {
    const group = special.filter((b) => distKm(a.lat, a.lon, b.lat, b.lon) < 5);
    if (group.length >= 2 && group[0] === a) {
      out.push(inference(place, `converge:${Math.round(a.lat * 20)}:${Math.round(a.lon * 20)}:${localParts(ctx.now, ctx.settings.tz).date}`, `${group.length} special aircraft gathered in one spot`,
        `${group.length} helicopters, military or emergency aircraft are within 5 km of each other: something may be happening there.`,
        group.length >= 3 ? 'medium' : 'low', group.map((b) => `${(b.flight || b.hex || '').trim()} ${b.t || ''} at ${alt(b) ?? '?'} ft`), { lat: a.lat, lon: a.lon }));
    }
  }
  // Firefighting aircraft low near a known fire
  const fires = Object.keys(ps.fires || {}).length;
  for (const a of near.filter((x) => TANKERS.has(String(x.t || '').toUpperCase()) && alt(x) != null && alt(x) < 6000)) {
    out.push(inference(place, `tanker:${a.hex}:${localParts(ctx.now, 'UTC').date}`, 'firefighting aircraft working nearby',
      `A ${a.t} (a type used as an air tanker) is flying low near ${place.name}${fires ? ', and a wildfire is listed nearby' : ''}.`,
      fires ? 'medium' : 'low', [`${a.t} ${(a.flight || a.hex || '').trim()} at ${alt(a)} ft`, fires ? `${fires} wildfire(s) within range (NIFC)` : 'No listed fire in range'], { lat: a.lat, lon: a.lon }, fires ? SEV.heads : SEV.info));
  }
  return out;
}

// Cross-signal: independent signals close together in place and time.
export function crossSignal(ctx, place, recent) {
  const pts = recent.filter((e) => e.data?.pos || (e.distKm != null && e.data?.lat != null)).map((e) => ({ e, lat: e.data.pos?.lat ?? e.data.lat, lon: e.data.pos?.lon ?? e.data.lon }));
  const out = [];
  const done = new Set();
  for (const p of pts) {
    const near = pts.filter((q) => distKm(p.lat, p.lon, q.lat, q.lon) <= 8 && Math.abs((q.e.t || ctx.now.getTime()) - (p.e.t || ctx.now.getTime())) <= 3600e3);
    const kinds = [...new Set(near.map((q) => q.e.check))].filter((k) => k !== 'infer');
    if (kinds.length < 2) continue;
    const cell = `${Math.round(p.lat * 10)}:${Math.round(p.lon * 10)}`;
    if (done.has(cell)) continue;
    done.add(cell);
    const w = where(place, p.lat, p.lon);
    out.push(inference(place, `cross:${cell}:${localParts(ctx.now, ctx.settings.tz).date}`, `something is happening ${w.text}`,
      `${kinds.length} separate signals point to the same spot ${w.text} of ${place.name} within the hour.`,
      kinds.length >= 3 ? 'high' : 'medium', near.map((q) => `${q.e.title} (${q.e.check})`).slice(0, 6), { lat: p.lat, lon: p.lon }, kinds.length >= 3 ? SEV.heads : SEV.info));
  }
  return out;
}

// Hail likely at the place: a warning that named a hail size plus hail reports nearby today.
export function hailInference(ctx, place, ps, recent) {
  const tags = Object.values(ps.alertTags || {}).filter((t) => t.hail >= 0.75);
  const reports = recent.filter((e) => e.check === 'storms' && /hail/i.test(e.title) && (e.distKm ?? 99) <= 15);
  if (!tags.length || !reports.length) return [];
  const maxWarn = Math.max(...tags.map((t) => t.hail));
  const conf = reports.length >= 2 && maxWarn >= 1 ? 'high' : 'medium';
  return [inference(place, `hail:${localParts(ctx.now, ctx.settings.tz).date}`, `hail fell at ${place.name}`,
    `Hail likely fell at ${place.name}: the NWS warning named ${maxWarn.toFixed(2)} in hail and ${reports.length} hail report(s) came from within 15 km.`,
    conf, [...tags.map((t) => `${t.event}: warned hail ${t.hail.toFixed(2)} in`), ...reports.map((r) => r.text)].slice(0, 6), null, SEV.heads)];
}

// Pattern of life: aircraft count now vs the same hour of the week.
export function baselineInference(ctx, place, hist, countNow) {
  const lp = localParts(ctx.now, ctx.settings.tz);
  const h = String(lp.hour);
  const sameHour = hist.filter((d) => d.acft?.[h] != null);
  if (sameHour.length < 14) return [];
  const dow = new Date(`${lp.date}T12:00:00Z`).getUTCDay();
  const sameDow = sameHour.filter((d) => new Date(`${d.d}T12:00:00Z`).getUTCDay() === dow);
  const pool = (sameDow.length >= 3 ? sameDow : sameHour).map((d) => d.acft[h]).sort((a, b) => a - b);
  const med = pool[Math.floor(pool.length / 2)];
  const basis = sameDow.length >= 3 ? `the same hour on ${lp.weekday}s (${sameDow.length} weeks)` : `this hour (${sameHour.length} days)`;
  if (med >= 5 && countNow < med * 0.3) {
    return [inference(place, `quietsky:${lp.date}:${h}`, 'unusually empty sky', `There are far fewer aircraft than usual over ${place.name} (${countNow} vs a typical ${med} for ${basis}). Possible flight restriction, airport closure or weather nearby.`, 'low', [`Now: ${countNow}`, `Typical: ${med} (${basis})`])];
  }
  if (countNow > med * 3 + 5) {
    return [inference(place, `busysky:${lp.date}:${h}`, 'unusually busy sky', `There are many more aircraft than usual over ${place.name} (${countNow} vs a typical ${med} for ${basis}).`, 'low', [`Now: ${countNow}`, `Typical: ${med} (${basis})`])];
  }
  return [];
}

// --- Tropical systems: is the place inside an NHC forecast cone?
CHECKS.tropical = async (ctx, place, ps, shared) => {
  const j = await get(ctx, SRC.nhcStorms);
  const storms = j.activeStorms || [];
  if (!storms.length) return { events: [], metrics: {}, count: 0 };
  const events = [];
  let layers = shared.coneLayers;
  if (!layers) {
    try {
      const meta = await get(ctx, `${SRC.nhcMap}?f=json`);
      layers = (meta.layers || []).filter((l) => /cone/i.test(l.name)).map((l) => ({ id: l.id, name: l.name }));
    } catch { layers = []; }
    shared.coneLayers = layers;
  }
  for (const s of storms) {
    const bin = s.binNumber || '';
    const cone = layers.find((l) => l.name.toUpperCase().includes(bin.toUpperCase()));
    let inCone = null;
    if (cone) {
      try {
        const q = await get(ctx, `${SRC.nhcMap}/${cone.id}/query?geometry=${place.lon},${place.lat}&geometryType=esriGeometryPoint&inSR=4326&spatialRel=esriSpatialRelIntersects&returnCountOnly=true&f=json`, { memo: false });
        inCone = (q.count || 0) > 0;
      } catch { inCone = null; }
    }
    const km = distKm(place.lat, place.lon, Number(s.latitudeNumeric), Number(s.longitudeNumeric));
    const name = `${s.classification === 'HU' ? 'Hurricane' : s.classification === 'TS' ? 'Tropical Storm' : 'Tropical system'} ${s.name || ''}`.trim();
    if (inCone) {
      events.push(ev(place, 'tropical', SEV.heads, `trop:${s.id}:cone:${s.publicAdvisory?.advNum || ''}`, `${place.name} is in the cone of ${name}`,
        `${place.name} is inside the NHC forecast cone for ${name}.`, 'Review your storm plan and supplies.', { lat: Number(s.latitudeNumeric), lon: Number(s.longitudeNumeric) }));
    } else if (inCone === null && km < 600) {
      events.push(ev(place, 'tropical', SEV.heads, `trop:${s.id}:near`, `${name} within ${fmtMi(km)}`,
        `${name} is ${fmtMi(km)} away (forecast cone not checked).`, 'Check the NHC forecast.', { lat: Number(s.latitudeNumeric), lon: Number(s.longitudeNumeric) }));
    }
  }
  return { events, metrics: {}, count: storms.length };
};

// --- Air quality crossing unhealthy levels (modelled, Open-Meteo/CAMS)
CHECKS.air = async (ctx, place, ps) => {
  const j = await get(ctx, fill(SRC.airQuality, { lat: place.lat.toFixed(3), lon: place.lon.toFixed(3) }), { memo: false });
  const aqi = Number(j.current?.us_aqi);
  if (!Number.isFinite(aqi)) return { events: [], metrics: {}, count: 0 };
  const band = aqi > 200 ? 3 : aqi > 150 ? 2 : aqi > 100 ? 1 : 0;
  const events = [];
  if (band > (ps.aqiBand || 0)) {
    const label = ['', 'unhealthy for sensitive groups', 'unhealthy', 'very unhealthy'][band];
    events.push(ev(place, 'air', band >= 3 ? SEV.act : SEV.heads, `aqi:${localParts(ctx.now, ctx.settings.tz).date}:${band}`, `Air quality ${label}`,
      `Air quality index ${Math.round(aqi)} (${label}) at ${place.name} (model estimate).`, band >= 2 ? 'Limit time outside; close windows.' : 'Sensitive people should limit time outside.'));
  }
  ps.aqiBand = band;
  return { events, metrics: { aqiMax: aqi }, count: 1 };
};

// --- Aurora: model chance near the place's latitude after dark
export function sunPosition(date) {
  const d = date.getTime() / 86400000 + 2440587.5 - 2451545.0;
  const g = (357.529 + 0.98560028 * d) * Math.PI / 180;
  const L = (280.459 + 0.98564736 * d + 1.915 * Math.sin(g) + 0.020 * Math.sin(2 * g)) * Math.PI / 180;
  const e = (23.439 - 0.0000004 * d) * Math.PI / 180;
  const ra = Math.atan2(Math.cos(e) * Math.sin(L), Math.cos(L));
  const dec = Math.asin(Math.sin(e) * Math.sin(L));
  return { ra, dec, x: Math.cos(dec) * Math.cos(ra), y: Math.cos(dec) * Math.sin(ra), z: Math.sin(dec) };
}
export function gmstRad(date) {
  const d = date.getTime() / 86400000 + 2440587.5 - 2451545.0;
  return (((280.46061837 + 360.98564736629 * d) % 360 + 360) % 360) * Math.PI / 180;
}
export function sunElevation(lat, lon, date) {
  const s = sunPosition(date);
  const lst = gmstRad(date) + lon * Math.PI / 180;
  const ha = lst - s.ra;
  const la = lat * Math.PI / 180;
  return Math.asin(Math.sin(la) * Math.sin(s.dec) + Math.cos(la) * Math.cos(s.dec) * Math.cos(ha)) * 180 / Math.PI;
}
CHECKS.aurora = async (ctx, place) => {
  if (!ctx.test && sunElevation(place.lat, place.lon, ctx.now) > -12) return { events: [], metrics: {}, count: 0, skipped: 'daylight' };
  const j = await get(ctx, SRC.aurora, { timeoutMs: 15000 });
  const lon360 = (Math.round(place.lon) + 360) % 360;
  const pole = place.lat >= 0 ? 1 : -1;
  let best = 0;
  for (const [lo, la, v] of j.coordinates || []) {
    const dl = Math.abs(lo - lon360);
    if (Math.min(dl, 360 - dl) > 3) continue;
    const ahead = (la - place.lat) * pole;
    if (ahead >= -1 && ahead <= 8) best = Math.max(best, v);
  }
  const events = [];
  if (best >= 20) {
    events.push(ev(place, 'aurora', SEV.info, `aurora:${localParts(ctx.now, ctx.settings.tz).date}`, 'Aurora possible tonight',
      `Aurora may be visible low in the ${pole > 0 ? 'northern' : 'southern'} sky from ${place.name} (model chance ${best}% nearby). Best away from city lights.`, ''));
  }
  return { events, metrics: { aurora: best }, count: best };
};

// --- ISS visible passes (approximate orbit model, see propagate())
const MU = 398600.4418; const RE = 6378.137; const J2 = 0.00108263;
export function propagate(omm, date) {
  const epoch = Date.parse(String(omm.EPOCH).endsWith('Z') ? omm.EPOCH : omm.EPOCH + 'Z');
  const tMin = (date.getTime() - epoch) / 60000;
  const n0 = Number(omm.MEAN_MOTION) * 2 * Math.PI / 1440; // rad/min
  const e = Number(omm.ECCENTRICITY); const i = Number(omm.INCLINATION) * Math.PI / 180;
  const nSec = n0 / 60;
  const a = Math.cbrt(MU / (nSec * nSec));
  const p = a * (1 - e * e);
  const k = 1.5 * J2 * (RE / p) ** 2 * n0;
  const raan = Number(omm.RA_OF_ASC_NODE) * Math.PI / 180 - k * Math.cos(i) * tMin;
  const argp = Number(omm.ARG_OF_PERICENTER) * Math.PI / 180 + k * (2 - 2.5 * Math.sin(i) ** 2) * tMin;
  const tDay = tMin / 1440;
  let M = Number(omm.MEAN_ANOMALY) * Math.PI / 180 + (n0 + k * Math.sqrt(1 - e * e) * (1 - 1.5 * Math.sin(i) ** 2)) * tMin + 2 * Math.PI * Number(omm.MEAN_MOTION_DOT || 0) * tDay * tDay;
  M %= 2 * Math.PI;
  let E = M;
  for (let it = 0; it < 8; it++) E -= (E - e * Math.sin(E) - M) / (1 - e * Math.cos(E));
  const nu = 2 * Math.atan2(Math.sqrt(1 + e) * Math.sin(E / 2), Math.sqrt(1 - e) * Math.cos(E / 2));
  const r = a * (1 - e * Math.cos(E));
  const u = argp + nu;
  const xp = r * (Math.cos(raan) * Math.cos(u) - Math.sin(raan) * Math.sin(u) * Math.cos(i));
  const yp = r * (Math.sin(raan) * Math.cos(u) + Math.cos(raan) * Math.sin(u) * Math.cos(i));
  const zp = r * Math.sin(u) * Math.sin(i);
  return { x: xp, y: yp, z: zp }; // ECI (TEME-ish), km
}
function observerEci(lat, lon, date) {
  const f = 1 / 298.257223563; const e2 = f * (2 - f);
  const la = lat * Math.PI / 180; const th = gmstRad(date) + lon * Math.PI / 180;
  const N = RE / Math.sqrt(1 - e2 * Math.sin(la) ** 2);
  return { x: N * Math.cos(la) * Math.cos(th), y: N * Math.cos(la) * Math.sin(th), z: N * (1 - e2) * Math.sin(la), la, th };
}
export function lookAngles(lat, lon, sat, date) {
  const o = observerEci(lat, lon, date);
  const rx = sat.x - o.x; const ry = sat.y - o.y; const rz = sat.z - o.z;
  const sl = Math.sin(o.la); const cl = Math.cos(o.la); const st = Math.sin(o.th); const ct = Math.cos(o.th);
  const S = sl * ct * rx + sl * st * ry - cl * rz;
  const E = -st * rx + ct * ry;
  const Z = cl * ct * rx + cl * st * ry + sl * rz;
  const rng = Math.sqrt(rx * rx + ry * ry + rz * rz);
  return { el: Math.asin(Z / rng) * 180 / Math.PI, az: (Math.atan2(E, -S) * 180 / Math.PI + 360) % 360 };
}
function sunlit(sat, date) {
  const s = sunPosition(date);
  const d = sat.x * s.x + sat.y * s.y + sat.z * s.z;
  if (d > 0) return true;
  const px = sat.x - d * s.x; const py = sat.y - d * s.y; const pz = sat.z - d * s.z;
  return Math.sqrt(px * px + py * py + pz * pz) > RE;
}
// Visible passes (sunlit satellite, sky dark, above 10°) in the next `hours`.
export function visiblePasses(omm, lat, lon, from, hours = 24) {
  const out = []; let cur = null;
  for (let t = 0; t <= hours * 3600; t += 20) {
    const d = new Date(from.getTime() + t * 1000);
    const sat = propagate(omm, d);
    const la = lookAngles(lat, lon, sat, d);
    const vis = la.el > 10 && sunElevation(lat, lon, d) < -6 && sunlit(sat, d);
    if (vis) {
      if (!cur) cur = { start: d.getTime(), startAz: la.az, maxEl: la.el, end: d.getTime(), endAz: la.az };
      cur.maxEl = Math.max(cur.maxEl, la.el); cur.end = d.getTime(); cur.endAz = la.az;
    } else if (cur) { out.push(cur); cur = null; }
  }
  if (cur) out.push(cur);
  return out.filter((p) => p.end - p.start >= 40000);
}
async function issElements(ctx, shared) {
  if (shared.iss) return shared.iss;
  const today = localParts(ctx.now, 'UTC').date;
  if (ctx.state.sky?.iss && ctx.state.sky.issDate === today) return (shared.iss = ctx.state.sky.iss);
  const j = await get(ctx, SRC.stations);
  const omm = Array.isArray(j) ? j.find((o) => Number(o.NORAD_CAT_ID) === 25544) || j[0] : null;
  if (!omm) throw new Error('no ISS elements');
  const slim = Object.fromEntries(['EPOCH', 'MEAN_MOTION', 'ECCENTRICITY', 'INCLINATION', 'RA_OF_ASC_NODE', 'ARG_OF_PERICENTER', 'MEAN_ANOMALY', 'MEAN_MOTION_DOT'].map((k) => [k, omm[k]]));
  if (!ctx.test) ctx.state.sky = { ...(ctx.state.sky || {}), iss: slim, issDate: today };
  return (shared.iss = slim);
}
CHECKS.iss = async (ctx, place, ps, shared) => {
  const omm = await issElements(ctx, shared);
  const passes = visiblePasses(omm, place.lat, place.lon, ctx.now, 24).filter((p) => p.maxEl >= 20);
  const events = passes.slice(0, 2).map((p) => ev(place, 'iss', SEV.info, `iss:${new Date(p.start).toISOString().slice(0, 16)}`, 'Space Station visible tonight',
    `The Space Station passes over ${place.name} at ${localTime(p.start, ctx.settings.tz)}, about ${Math.round(p.maxEl)}° high, from ${compass(p.startAz)} to ${compass(p.endAz)} (approximate, ±2 min).`, '', null, { pass: p }));
  return { events, metrics: {}, count: passes.length, passes };
};

// --- Rocket launches that may be visible from the place (distance-based, honest wording)
CHECKS.launch = async (ctx, place) => {
  const j = await get(ctx, SRC.launches, { timeoutMs: 15000 });
  const events = []; let n = 0;
  for (const l of j.results || []) {
    const net = Date.parse(l.net);
    if (!(net > ctx.now.getTime() && net - ctx.now.getTime() < 20 * 3600e3)) continue;
    const lat = Number(l.pad?.latitude); const lon = Number(l.pad?.longitude);
    if (!Number.isFinite(lat)) continue;
    const km = distKm(place.lat, place.lon, lat, lon);
    if (km > 900) continue;
    n++;
    const w = where(place, lat, lon);
    events.push(ev(place, 'launch', SEV.info, `launch:${l.id}`, 'Rocket launch today',
      `${l.name} launches from ${l.pad?.location?.name || l.pad?.name || 'the pad'} at ${localTime(net, ctx.settings.tz)}, ${w.text}. It may be visible low in the ${w.dir} sky if clear${sunElevation(place.lat, place.lon, new Date(net)) < -6 ? ' (after dark: best chance)' : ''}.`, ''));
  }
  return { events, metrics: {}, count: n };
};

// ======================================================================= camera AI (opt-in)
// Only public DOT cameras from GodView's own layers; never private feeds.
export const CAM_HOSTS = ['511ga.org', 'cwwp2.dot.ca.gov'];
export function camAllowed(u) {
  try { const x = new URL(u); return x.protocol === 'https:' && CAM_HOSTS.includes(x.hostname); } catch { return false; }
}
const CAM_PROMPT = 'You are looking at one frame from a public road traffic camera. Report ONLY what is clearly visible in this image. Do not guess about anything outside the frame or about causes. Reply with JSON only, no other text: {"findings":[{"what":"smoke|fire|flooding|crash|stopped_traffic|snow_ice|nothing_notable","confidence":0.0,"note":"under 15 words"}]}. Use "nothing_notable" if the scene looks normal, dark, blurry or the camera is offline. Confidence 0 to 1.';
const CAM_WORDS = { smoke: 'smoke', fire: 'fire', flooding: 'water over the road', crash: 'a crash', stopped_traffic: 'stopped traffic', snow_ice: 'snow or ice on the road' };
function b64(buf) {
  const bytes = new Uint8Array(buf); let bin = '';
  for (let i = 0; i < bytes.length; i += 0x8000) bin += String.fromCharCode.apply(null, bytes.subarray(i, i + 0x8000));
  return btoa(bin);
}
export async function analyseFrame(ctx, cam) {
  if (ctx.sub >= ctx.budget - 1) throw new Error('skipped: subrequest budget');
  ctx.sub += 2;
  const img = await ctx.fetch(cam.url, { headers: { 'User-Agent': UA } });
  if (!img.ok) throw new Error(`camera HTTP ${img.status}`);
  const type = (img.headers.get('content-type') || 'image/jpeg').split(';')[0];
  if (!/^image\/(jpeg|png|gif|webp)$/.test(type)) throw new Error(`camera returned ${type}`);
  const buf = await img.arrayBuffer();
  if (buf.byteLength > 4.5e6) throw new Error('camera image too large');
  const res = await ctx.fetch(SRC.anthropic, {
    method: 'POST',
    headers: { 'x-api-key': ctx.env.ANTHROPIC_API_KEY, 'anthropic-version': '2023-06-01', 'content-type': 'application/json' },
    body: JSON.stringify({
      model: ctx.env.VISION_MODEL || ctx.env.BRIEF_MODEL || DEFAULT_MODEL, max_tokens: 300,
      messages: [{ role: 'user', content: [{ type: 'image', source: { type: 'base64', media_type: type, data: b64(buf) } }, { type: 'text', text: CAM_PROMPT }] }],
    }),
  });
  if (!res.ok) throw new Error(`vision HTTP ${res.status}`);
  const j = await res.json();
  const text = (j.content || []).filter((c) => c.type === 'text').map((c) => c.text).join('');
  const m = text.match(/\{[\s\S]*\}/);
  const parsed = m ? JSON.parse(m[0]) : { findings: [] };
  return (parsed.findings || []).filter((f) => f && typeof f.confidence === 'number');
}
export const CAM_THRESHOLD = 0.7;
// Hourly per place (spread over the hour), or at once when a heads-up/act-now
// event fired at this place in this run. Hard daily cap kept in state.
export async function cameraChecks(ctx, place, idx, ps, events) {
  if (!place.camAI || !place.cams?.length || !ctx.env.ANTHROPIC_API_KEY || ctx.test) return [];
  const slot = Math.floor(ctx.now.getTime() / 300000);
  const urgent = events.some((e) => e.sev >= SEV.heads && e.check !== 'camera');
  if (!urgent && (slot + idx) % 12 !== 0) return [];
  const day = localParts(ctx.now, ctx.settings.tz).date;
  const st = ctx.state;
  if (!st.camAI || st.camAI.date !== day) st.camAI = { date: day, used: 0 };
  const cap = Number.isInteger(ctx.settings.camCap) ? ctx.settings.camCap : 50;
  const out = [];
  for (const cam of place.cams.slice(0, 3)) {
    if (st.camAI.used >= cap) { st.camAI.capped = true; break; }
    st.camAI.used++;
    try {
      const findings = await analyseFrame(ctx, cam);
      for (const f of findings) {
        if (f.what === 'nothing_notable' || f.confidence < CAM_THRESHOLD || !CAM_WORDS[f.what]) continue;
        const sev = ['smoke', 'fire', 'flooding', 'crash'].includes(f.what) ? SEV.heads : SEV.info;
        out.push(ev(place, 'camera', sev, `cam:${cam.id}:${f.what}:${hourKey(ctx)}`, `Camera shows ${CAM_WORDS[f.what]}`,
          `The ${cam.name} camera appears to show ${CAM_WORDS[f.what]}${f.note ? ` (${String(f.note).slice(0, 80)})` : ''}. AI reading of one frame, ${Math.round(f.confidence * 100)}% confident.`,
          '', null, { inference: true, confidence: f.confidence >= 0.85 ? 'high' : 'medium', evidence: [`Frame from ${cam.name}`, `Model: ${ctx.env.VISION_MODEL || ctx.env.BRIEF_MODEL || DEFAULT_MODEL}`], camera: cam.url }));
      }
    } catch (e) { (ps.camErr ||= {})[cam.id] = String(e.message || e).slice(0, 100); }
  }
  return out;
}

// ======================================================================= conditions reports
// What verifiably happened at a point in a time window, each line with its
// source and time, marked as official / reported / measured / estimated.
// The SHA-256 of the canonical JSON lets the same report be re-verified later.
export function canonical(v) {
  if (Array.isArray(v)) return `[${v.map(canonical).join(',')}]`;
  if (v && typeof v === 'object') return `{${Object.keys(v).sort().filter((k) => v[k] !== undefined).map((k) => `${JSON.stringify(k)}:${canonical(v[k])}`).join(',')}}`;
  return JSON.stringify(v);
}
export async function sha256Hex(text) {
  const d = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text));
  return [...new Uint8Array(d)].map((b) => b.toString(16).padStart(2, '0')).join('');
}
const isoZ = (ms) => new Date(ms).toISOString().replace(/\.\d{3}Z$/, 'Z');
const LSR_KIND = (t) => (/hail/i.test(t) ? 'hail' : /tornado|funnel/i.test(t) ? 'tornado' : /wind|tstm wnd|gust/i.test(t) ? 'wind' : /flood/i.test(t) ? 'flood' : 'other');

export async function buildReport(ctx, { lat, lon, name, start, end, radiusKm = 16 }) {
  const S = Date.parse(start); const E = Date.parse(end);
  if (!Number.isFinite(S) || !Number.isFinite(E) || E <= S) throw new Error('start and end must be valid times, end after start');
  if (E - S > 7 * 86400e3) throw new Error('the window can be at most 7 days');
  const R = Math.min(50, Math.max(2, Number(radiusKm) || 16));
  const place = { id: 'report', name: name || 'This point', lat: Number(lat), lon: Number(lon), radiusKm: R };
  const items = []; const sources = []; const errors = [];
  const add = (x) => items.push(x);
  const fromHere = (la, lo) => { const w = where(place, la, lo); return { distanceKm: Math.round(w.km * 10) / 10, bearing: w.dir || null, place: w.text }; };
  const tz = ctx.settings?.tz || DEFAULT_SETTINGS.tz;
  const fmtT = (ms) => new Date(ms).toLocaleString('en-US', { timeZone: tz, month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit', timeZoneName: 'short' });
  const pending = [];
  const step = (label, fn) => { const i = sources.push({ name: label, ok: false, error: 'not run' }) - 1; pending.push((async () => { try { await fn(); sources[i] = { name: label, ok: true }; } catch (e) { sources[i] = { name: label, ok: false, error: String(e.message || e) }; errors.push(label); } })()); };

  // 1) NWS storm-based warnings that covered this exact point (IEM archive)
  await step('NWS warnings at this point (Iowa Environmental Mesonet archive)', async () => {
    const u = `${SRC.sbwByPoint}?lat=${place.lat.toFixed(4)}&lon=${place.lon.toFixed(4)}&sdate=${isoZ(S - 86400e3).slice(0, 10)}&edate=${isoZ(E + 86400e3).slice(0, 10)}`;
    const j = await get(ctx, u, { memo: false, timeoutMs: 20000 });
    for (const w of j.sbws || []) {
      const iss = Date.parse(w.issue.endsWith('Z') ? w.issue : w.issue + 'Z'); const exp = Date.parse(w.expire.endsWith('Z') ? w.expire : w.expire + 'Z');
      if (!(iss < E && exp > S)) continue;
      const tags = [w.issue_hailtag ? `hail ${w.issue_hailtag} in` : '', w.issue_windtag ? `wind ${w.issue_windtag} mph` : '', w.issue_tornadotag ? `tornado ${String(w.issue_tornadotag).toLowerCase()}` : ''].filter(Boolean).join(', ');
      add({ section: 'warnings', kind: 'official', time: isoZ(iss), until: isoZ(exp),
        text: `${w.ph_name || w.phenomena} ${w.sig_name || ''} (${w.wfo} #${w.eventid}) covered this point from ${fmtT(iss)} to ${fmtT(exp)}${tags ? `; warned for ${tags}` : ''}.`.replace(/\s+\(/, ' ('),
        source: 'National Weather Service, via Iowa Environmental Mesonet', sourceUrl: w.url ? `https://mesonet.agron.iastate.edu${w.url}` : 'https://mesonet.agron.iastate.edu/vtec/',
        data: { phenomena: w.phenomena, significance: w.significance, wfo: w.wfo, eventid: w.eventid, hailIn: w.issue_hailtag ?? null, windMph: w.issue_windtag ?? null } });
    }
  });
  // 2) Local storm reports (hail, wind, tornado, flood) within the radius
  await step('NWS local storm reports (Iowa Environmental Mesonet)', async () => {
    const u = `${SRC.lsr}?sts=${isoZ(S).slice(0, 16)}Z&ets=${isoZ(E).slice(0, 16)}Z`;
    const j = await get(ctx, u, { memo: false, timeoutMs: 25000 });
    for (const f of j.features || []) {
      const p = f.properties || {};
      const [lo, la] = f.geometry?.coordinates || [p.lon, p.lat];
      if (!Number.isFinite(la) || distKm(place.lat, place.lon, la, lo) > R) continue;
      const t = Date.parse(String(p.valid).endsWith('Z') ? p.valid : `${p.valid}Z`);
      const kind = LSR_KIND(p.typetext || p.type || '');
      const mag = p.magnitude != null && p.magnitude !== '' ? `${p.magnitude}${kind === 'hail' ? ' in' : kind === 'wind' ? ' mph' : ''} ` : '';
      const d = fromHere(la, lo);
      add({ section: 'reports', kind: 'reported', time: isoZ(t), ...d,
        text: `${mag}${String(p.typetext || 'Storm report').toLowerCase()} reported ${d.place} at ${fmtT(t)}${p.source ? ` by ${String(p.source).toLowerCase()}` : ''}${p.city ? ` (${p.city})` : ''}.`.replace(/^./, (c) => c.toUpperCase()),
        source: 'NWS Local Storm Report, via Iowa Environmental Mesonet', sourceUrl: 'https://mesonet.agron.iastate.edu/lsr/',
        data: { type: p.typetext || p.type, magnitude: p.magnitude ?? null, remark: p.remark || '', wfo: p.wfo || null } });
    }
  });
  // 3) Radar-estimated rainfall (only available for the last 72 hours)
  if (ctx.now.getTime() - E < 3 * 3600e3) {
    await step('MRMS radar rainfall estimate (NOAA)', async () => {
      const u = `${SRC.mrmsIdentify}?geometry=${encodeURIComponent(JSON.stringify({ x: place.lon, y: place.lat, spatialReference: { wkid: 4326 } }))}&geometryType=esriGeometryPoint&returnGeometry=false&returnCatalogItems=true&f=json`;
      const j = await get(ctx, u, { memo: false, timeoutMs: 20000 });
      const vals = j.properties?.Values || [];
      const names = (j.catalogItems?.features || []).map((f) => f.attributes?.Name || f.attributes?.name || '');
      const pairs = names.map((n, i) => [n, Number(vals[i])]).filter(([n, v]) => n && Number.isFinite(v) && v >= 0);
      const pick = pairs.find(([n]) => /24/.test(n)) || pairs[0] || (Number.isFinite(Number(j.value)) ? ['MRMS QPE', Number(j.value)] : null);
      if (pick) add({ section: 'rain', kind: 'estimated', time: isoZ(ctx.now.getTime()), text: `Radar-estimated rainfall at this point: ${pick[1].toFixed(2)} in (${pick[0]}, estimate at report time, not a gauge reading).`, source: 'NOAA MRMS quantitative precipitation estimate', sourceUrl: 'https://mapservices.weather.noaa.gov/raster/rest/services/obs/mrms_qpe/ImageServer', data: { product: pick[0], inches: pick[1] } });
    });
  }
  // 4) Earthquakes in the window within 300 km
  await step('USGS earthquake catalog', async () => {
    const u = `${SRC.fdsn}?format=geojson&starttime=${isoZ(S)}&endtime=${isoZ(E)}&latitude=${place.lat}&longitude=${place.lon}&maxradiuskm=300&minmagnitude=2`;
    const j = await get(ctx, u, { memo: false, timeoutMs: 20000 });
    for (const f of j.features || []) {
      const [lo, la, depth] = f.geometry.coordinates; const p = f.properties || {};
      const d = fromHere(la, lo);
      add({ section: 'quakes', kind: 'measured', time: isoZ(p.time), ...d, text: `Magnitude ${Number(p.mag).toFixed(1)} earthquake ${d.place} at ${fmtT(p.time)}, ${Math.round(depth)} km deep${p.felt ? `; ${p.felt} "Did You Feel It?" reports` : ''}.`, source: 'U.S. Geological Survey', sourceUrl: p.url || 'https://earthquake.usgs.gov/', data: { mag: p.mag, magType: p.magType, depthKm: depth, felt: p.felt ?? null, mmi: p.mmi ?? null } });
    }
  });
  // 5) Wildfires and river stage: only the current state is available
  if (ctx.now.getTime() - E < 6 * 3600e3) {
    await step('Wildfires (NIFC, current)', async () => {
      const r = await CHECKS.fires(ctx, { ...place, radiusKm: Math.max(R, 40) }, {});
      for (const e of r.events) add({ section: 'fires', kind: 'official', time: isoZ(ctx.now.getTime()), distanceKm: e.distKm, bearing: e.dir, text: `${e.text} (status at report time).`, source: 'National Interagency Fire Center', sourceUrl: 'https://data-nifc.opendata.arcgis.com/' });
    });
    await step('River gauges (NOAA NWPS, current)', async () => {
      const b = bbox(place.lat, place.lon, Math.max(R, 25));
      const j = await get(ctx, fill(SRC.gauges, b), { memo: false, timeoutMs: 15000 });
      const g = (j.gauges || []).filter((x) => x.latitude != null).map((x) => [distKm(place.lat, place.lon, x.latitude, x.longitude), x]).sort((a, b2) => a[0] - b2[0])[0];
      if (g) { const o = g[1].status?.observed || {}; const d = fromHere(g[1].latitude, g[1].longitude); add({ section: 'rivers', kind: 'measured', time: o.validTime || isoZ(ctx.now.getTime()), ...d, text: `Nearest river gauge ${g[1].name} (${d.place}): ${o.primary ?? '?'} ${o.primaryUnit || ''}, ${CAT_NAME[o.floodCategory] || 'not rated'} (reading at report time).`, source: 'NOAA National Water Prediction Service', sourceUrl: `https://water.noaa.gov/gauges/${String(g[1].lid).toLowerCase()}` }); }
    });
  }
  await Promise.all(pending);
  items.sort((x, y) => String(x.time).localeCompare(String(y.time)) || x.text.localeCompare(y.text));
  const summary = {
    warnings: items.filter((i) => i.section === 'warnings').length,
    hailReports: items.filter((i) => i.section === 'reports' && LSR_KIND(i.data?.type || '') === 'hail').length,
    maxReportedHailIn: Math.max(0, ...items.filter((i) => i.section === 'reports' && LSR_KIND(i.data?.type || '') === 'hail').map((i) => Number(i.data.magnitude) || 0)),
    maxWarnedHailIn: Math.max(0, ...items.filter((i) => i.section === 'warnings').map((i) => Number(i.data?.hailIn) || 0)),
    maxReportedWindMph: Math.max(0, ...items.filter((i) => i.section === 'reports' && LSR_KIND(i.data?.type || '') === 'wind').map((i) => Number(i.data.magnitude) || 0)),
  };
  const report = {
    schema: 'godview-conditions-report/1',
    subject: { name: place.name, lat: Math.round(place.lat * 1e5) / 1e5, lon: Math.round(place.lon * 1e5) / 1e5, radiusKm: R },
    window: { start: isoZ(S), end: isoZ(E), timeZone: tz },
    generatedAt: isoZ(ctx.now.getTime()),
    summary, items, sources,
    notes: [
      'Official = issued by a government agency; reported = a storm report from a spotter, the public or officials; measured = an instrument reading; estimated = a model or radar estimate.',
      'Storm reports are preliminary and can be incomplete. Distances are straight-line from the point given.',
      'This report lists public weather and hazard data for a location and time. It does not assess or confirm damage to any property.',
    ],
  };
  const json = canonical(report);
  return { report, json, sha256: await sha256Hex(json), incomplete: errors };
}

// ======================================================================= scheduling
// Which checks are due this run. Heavier per-place checks are spread across runs.
export function dueChecks(place, idx, now, test) {
  const all = (place.checks && place.checks.length ? place.checks : KINDS[place.kind] || KINDS.home);
  if (test) return all;
  const slot = Math.floor(now.getTime() / 300000);
  return all.filter((c) => {
    if (['alerts', 'storms', 'quakes', 'squawk', 'aircraft'].includes(c)) return true;
    if (['fires', 'rivers'].includes(c)) return (slot + idx) % 3 === 0;      // every 15 min
    if (['air', 'tropical', 'aurora', 'launch'].includes(c)) return (slot + idx) % 12 === 0; // hourly
    if (c === 'iss') return (slot + idx) % 72 === 0;                          // every 6 h
    return true;
  });
}

function emptyToday(date) { return { d: date, alerts: 0, hail: 0, tornado: 0, wind: 0, quakeMax: 0, quakes: 0, aqiMax: 0, fires: 0, riverCat: 0, acft: {}, ev: [0, 0, 0] }; }

// Run checks for one place. Returns { events, results }.
export async function runPlace(ctx, place, idx, ps, shared) {
  const checks = dueChecks(place, idx, ctx.now, ctx.test);
  const results = [];
  const events = [];
  await Promise.all(checks.map(async (c) => {
    const t0 = Date.now();
    try {
      const r = await CHECKS[c](ctx, place, ps, shared);
      results.push({ id: c, ok: true, count: r.count ?? null, ms: Date.now() - t0, error: null, skipped: r.skipped || null });
      events.push(...r.events);
      if (!ctx.test) applyMetrics(ctx, ps, r.metrics || {});
    } catch (e) {
      results.push({ id: c, ok: false, count: null, ms: Date.now() - t0, error: String(e.message || e) });
    }
  }));
  return { events, results };
}

function applyMetrics(ctx, ps, m) {
  const date = localParts(ctx.now, ctx.settings.tz).date;
  if (!ps.today || ps.today.d !== date) {
    if (ps.today) ctx.rollover.push({ placeId: ps.id, day: ps.today });
    ps.today = emptyToday(date);
  }
  const t = ps.today;
  if (m.alerts) t.alerts += m.alerts;
  if (m.tornado) t.tornado = Math.max(t.tornado, m.tornado);
  if (m.wind) t.wind = Math.max(t.wind, m.wind);
  if (m.hail) t.hail = Math.max(t.hail, m.hail);
  if (m.quakeMax) t.quakeMax = Math.max(t.quakeMax, m.quakeMax);
  if (m.quakes) t.quakes = Math.max(t.quakes, m.quakes);
  if (m.aqiMax) t.aqiMax = Math.max(t.aqiMax, Math.round(m.aqiMax));
  if (m.fires) t.fires = Math.max(t.fires, m.fires);
  if (m.riverCat) t.riverCat = Math.max(t.riverCat, m.riverCat);
  if (m.aircraft != null) {
    // One sample per local hour (first run of the hour) keeps writes low.
    const h = String(localParts(ctx.now, ctx.settings.tz).hour);
    if (t.acft[h] == null) { t.acft[h] = m.aircraft; (ctx.sampled ||= {})[ps.id] = m.aircraft; }
    t.heli = Math.max(t.heli || 0, m.heli || 0);
  }
}

// ======================================================================= storage
async function kvGet(env, key, fallback) {
  try { const v = await env.KV.get(key, 'json'); return v ?? fallback; } catch { return fallback; }
}
async function kvPut(ctx, key, value) {
  if (ctx.test) return;
  ctx.writes = (ctx.writes || 0) + 1;
  await ctx.env.KV.put(key, JSON.stringify(value));
}
export async function loadCfg(env) {
  const c = await kvGet(env, 'cfg', null);
  return { places: (c && c.places) || [], settings: { ...DEFAULT_SETTINGS, ...((c && c.settings) || {}) } };
}

// ======================================================================= notify
// Notifiers share one interface: { name, send(message) }. Add SMS/email/APNs here later.
export function notifiers(ctx) {
  const list = [];
  if (ctx.env.NTFY_TOPIC) {
    list.push({
      name: 'ntfy',
      async send(m) {
        const body = { topic: ctx.env.NTFY_TOPIC, title: m.title.slice(0, 120), message: m.body.slice(0, 3800), priority: m.priority, tags: m.tags || [], click: m.click };
        const res = await ctx.fetch(SRC.ntfy, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
        if (!res.ok) throw new Error(`ntfy HTTP ${res.status}`);
      },
    });
  }
  return list;
}
export function messageFor(e, place) {
  const pri = e.sev === SEV.act ? 5 : e.sev === SEV.heads ? 4 : 3;
  return {
    title: `${place.name}: ${e.title}`,
    body: [e.text, e.todo].filter(Boolean).join(' '),
    priority: pri,
    tags: [e.sev === SEV.act ? 'rotating_light' : e.sev === SEV.heads ? 'warning' : 'information_source'],
    click: `${APP_URL}#place=${encodeURIComponent(place.id)}`,
  };
}
async function sendAll(ctx, m) {
  if (ctx.test) return [];
  const errs = [];
  for (const n of notifiers(ctx)) {
    try { await n.send(m); ctx.sent = (ctx.sent || 0) + 1; } catch (e) { errs.push(`${n.name}: ${e.message}`); }
  }
  return errs;
}

// ======================================================================= history ("is this normal?")
export function normals(hist, today, now, tz) {
  const days = hist.length;
  const out = { days, note: days === 0 ? 'No history yet: it builds up one day at a time.' : `${days} day${days === 1 ? '' : 's'} of history so far${days < 14 ? ', too little to call anything unusual' : ''}.`, items: [] };
  if (!days) return out;
  const sum = (k) => hist.reduce((a, d) => a + (Number(d[k]) || 0), 0);
  const perMonth = (sum('alerts') / days) * 30;
  out.items.push({ id: 'alerts', label: 'Weather alerts', now: today?.alerts ?? 0, normal: `${perMonth.toFixed(1)} per month`, unusual: days >= 14 && (today?.alerts || 0) > Math.max(2, (sum('alerts') / days) * 3) });
  const hailDays = hist.filter((d) => d.hail > 0).length;
  out.items.push({ id: 'hail', label: 'Hail days', now: today?.hail ? `${today.hail} in today` : 'none today', normal: `${hailDays} in ${days} days` });
  const strongest = hist.reduce((a, d) => Math.max(a, d.quakeMax || 0), 0);
  out.items.push({ id: 'quake', label: 'Strongest quake within 300 km', now: today?.quakeMax ? `M${today.quakeMax.toFixed(1)}` : 'none today', normal: strongest ? `M${strongest.toFixed(1)}` : 'none recorded' });
  const h = String(localParts(now, tz).hour);
  const samples = hist.map((d) => d.acft?.[h]).filter((v) => v != null).sort((a, b) => a - b);
  if (samples.length) {
    const med = samples[Math.floor(samples.length / 2)];
    const cur = today?.acft?.[h];
    out.items.push({ id: 'aircraft', label: `Aircraft within 10 nm at ${h}:00`, now: cur ?? '—', normal: `typically ${med}`, unusual: days >= 14 && cur != null && cur > med * 2 + 3 });
  }
  return out;
}

// ======================================================================= brief
const WMO = { 0: 'clear', 1: 'mostly clear', 2: 'partly cloudy', 3: 'cloudy', 45: 'fog', 48: 'freezing fog', 51: 'light drizzle', 53: 'drizzle', 55: 'heavy drizzle', 61: 'light rain', 63: 'rain', 65: 'heavy rain', 66: 'freezing rain', 67: 'freezing rain', 71: 'light snow', 73: 'snow', 75: 'heavy snow', 80: 'showers', 81: 'showers', 82: 'heavy showers', 95: 'thunderstorms', 96: 'thunderstorms with hail', 99: 'thunderstorms with hail' };
const OUTLOOK = { TSTM: 'general thunderstorms', MRGL: 'marginal severe-storm risk', SLGT: 'slight severe-storm risk', ENH: 'enhanced severe-storm risk', MDT: 'moderate severe-storm risk', HIGH: 'high severe-storm risk' };
const OUT_ORDER = ['TSTM', 'MRGL', 'SLGT', 'ENH', 'MDT', 'HIGH'];

// Gather the facts for one place (no writes).
export async function placeFacts(ctx, place, ps, log, hist, shared, sinceMs) {
  const f = { place: { id: place.id, name: place.name, kind: place.kind }, overnight: [], active: [], today: null, outlook: null, sky: [], unusual: [], todo: [], history: null };
  f.overnight = log.filter((e) => e.t >= sinceMs).slice(0, 8).map((e) => ({ sev: SEV_LABEL[e.sev], title: e.title, text: e.text }));
  f.active = Object.values(ps.alerts || {});
  try {
    const w = await get(ctx, fill(SRC.forecast, { lat: place.lat.toFixed(3), lon: place.lon.toFixed(3) }), { memo: false });
    const d = w.daily || {};
    f.today = { hi: Math.round(d.temperature_2m_max?.[0]), lo: Math.round(d.temperature_2m_min?.[0]), rain: d.precipitation_probability_max?.[0], gust: Math.round(d.wind_gusts_10m_max?.[0]), sky: WMO[d.weather_code?.[0]] || 'mixed', uv: d.uv_index_max?.[0], sunset: d.sunset?.[0]?.slice(11, 16) };
  } catch (e) { f.today = { error: e.message }; }
  try {
    const o = await get(ctx, SRC.spcOutlook);
    let best = -1;
    for (const ft of o.features || []) {
      const g = ft.geometry; if (!g) continue;
      const polys = g.type === 'Polygon' ? [g.coordinates] : g.type === 'MultiPolygon' ? g.coordinates : [];
      if (polys.some((p) => p[0] && inRing(place.lat, place.lon, p[0]))) best = Math.max(best, OUT_ORDER.indexOf(ft.properties?.LABEL));
    }
    if (best >= 0) f.outlook = OUTLOOK[OUT_ORDER[best]];
  } catch { /* outlook optional */ }
  const checks = place.checks?.length ? place.checks : KINDS[place.kind] || KINDS.home;
  if (checks.includes('iss')) {
    try {
      const omm = await issElements(ctx, shared);
      const p = visiblePasses(omm, place.lat, place.lon, ctx.now, 24).filter((x) => x.maxEl >= 20)[0];
      if (p) f.sky.push(`Space Station visible at ${localTime(p.start, ctx.settings.tz)}, ${Math.round(p.maxEl)}° high, ${compass(p.startAz)} to ${compass(p.endAz)} (approximate).`);
    } catch { /* optional */ }
  }
  if (checks.includes('launch')) {
    try { const r = await CHECKS.launch(ctx, place); for (const e of r.events) f.sky.push(e.text); } catch { /* optional */ }
  }
  const n = normals(hist, ps.today, ctx.now, ctx.settings.tz);
  f.history = { days: n.days, note: n.note, items: n.items };
  f.unusual = n.items.filter((i) => i.unusual).map((i) => `${i.label}: ${i.now} (normal ${i.normal})`);
  // Up to three "do this" lines, most important first.
  const todo = [];
  for (const e of log.filter((x) => x.t >= sinceMs && x.sev >= SEV.heads && x.todo && !x.handled)) todo.push(e.todo);
  if (f.today?.gust >= 40) todo.push(`Secure loose things outside: gusts to ${f.today.gust} mph.`);
  if (f.today?.lo <= 32) todo.push(`Freeze tonight (${f.today.lo}°F): cover plants, protect pipes.`);
  if (f.today?.rain >= 60) todo.push(`Take an umbrella: ${f.today.rain}% chance of rain.`);
  if (f.outlook && /slight|enhanced|moderate|high/.test(f.outlook)) todo.push('Severe storms possible: keep alerts on and know your safe place.');
  if (f.today?.uv >= 8) todo.push(`Very high UV (${Math.round(f.today.uv)}): sunscreen.`);
  f.todo = [...new Set(todo)].slice(0, 3);
  return f;
}

export function briefText(facts) {
  const lines = [];
  for (const f of facts) {
    const t = f.today && !f.today.error ? `${f.today.sky}, ${f.today.hi}°/${f.today.lo}°F${f.today.rain != null ? `, ${f.today.rain}% rain` : ''}${f.today.gust >= 25 ? `, gusts ${f.today.gust} mph` : ''}` : 'forecast unavailable';
    const parts = [`${f.place.name}: ${t}.`];
    if (f.active.length) parts.push(`In effect: ${[...new Set(f.active)].join(', ')}.`);
    if (f.outlook) parts.push(`Storm outlook: ${f.outlook}.`);
    const over = f.overnight.filter((e) => e.sev !== 'info');
    parts.push(over.length ? `Overnight: ${over.map((e) => e.title).join('; ')}.` : 'Quiet overnight.');
    if (f.unusual.length) parts.push(`Unusual: ${f.unusual.join('; ')}.`);
    for (const s of f.sky) parts.push(s);
    lines.push(parts.join(' '));
    for (const d of f.todo) lines.push(`Do: ${d}`);
  }
  return lines.join('\n');
}

// Optional: Claude rewrites the brief using ONLY the supplied facts.
export async function claudeWording(ctx, facts, fallback) {
  if (!ctx.env.ANTHROPIC_API_KEY) return { text: fallback, by: 'rules' };
  try {
    const res = await ctx.fetch(SRC.anthropic, {
      method: 'POST',
      headers: { 'x-api-key': ctx.env.ANTHROPIC_API_KEY, 'anthropic-version': '2023-06-01', 'content-type': 'application/json' },
      body: JSON.stringify({
        model: ctx.env.BRIEF_MODEL || DEFAULT_MODEL,
        max_tokens: 700,
        system: 'You write a short morning brief for one person about his saved places. Use ONLY the facts in the JSON the user sends. Do not add any fact, number, place, forecast or advice that is not in it. Plain words, short sentences, no greetings, no markdown headings. One short paragraph per place, then at most three lines starting with "Do:" taken from the todo lists. If history is short, do not call anything unusual.',
        messages: [{ role: 'user', content: JSON.stringify(facts) }],
      }),
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const j = await res.json();
    const text = (j.content || []).filter((c) => c.type === 'text').map((c) => c.text).join('\n').trim();
    if (!text) throw new Error('empty');
    return { text, by: j.model || 'claude' };
  } catch (e) {
    return { text: fallback, by: 'rules', aiError: e.message };
  }
}

export async function buildBrief(ctx, cfg, state, logs, hists, sinceMs, useAi = true) {
  const shared = {};
  const facts = [];
  for (const place of cfg.places) {
    const ps = state.places[place.id] || {};
    facts.push(await placeFacts(ctx, place, ps, logs[place.id] || [], hists[place.id] || [], shared, sinceMs));
  }
  const rules = briefText(facts);
  const worded = useAi ? await claudeWording(ctx, facts, rules) : { text: rules, by: 'rules' };
  return { at: ctx.now.toISOString(), date: localParts(ctx.now, ctx.settings.tz).date, text: worded.text, by: worded.by, aiError: worded.aiError || null, rulesText: rules, facts };
}

// ======================================================================= the cron run
export async function runAll(env, now = new Date(), fetchImpl = fetch) {
  const cfg = await loadCfg(env);
  const state = await kvGet(env, 'state', { places: {}, dedupe: {}, health: {} });
  state.places ||= {}; state.dedupe ||= {}; state.health ||= {};
  const before = JSON.stringify({ ...state, lastRun: null });
  const ctx = { env, now, fetch: fetchImpl, test: false, sub: 0, budget: SUBREQUEST_BUDGET, memo: new Map(), settings: cfg.settings, state, rollover: [], writes: 0, sent: 0 };
  const shared = {};
  const newByPlace = {};
  const quiet = isQuiet(now, cfg.settings);
  for (const [idx, place] of cfg.places.entries()) {
    const ps = (state.places[place.id] ||= { id: place.id });
    ps.id = place.id;
    const { events, results } = await runPlace(ctx, place, idx, ps, shared);
    // Inferences that combine this run's signals with the last hour of the log.
    try {
      const recentLog = (await kvGet(env, `log:${place.id}`, [])).filter((e) => now.getTime() - e.t < 3600e3);
      const recent = [...events.map((e) => ({ ...e, t: now.getTime() })), ...recentLog];
      events.push(...crossSignal(ctx, place, recent), ...hailInference(ctx, place, ps, recent));
      if (ctx.sampled?.[place.id] != null) events.push(...baselineInference(ctx, place, await kvGet(env, `hist:${place.id}`, []), ctx.sampled[place.id]));
      const cam = await cameraChecks(ctx, place, idx, ps, events);
      events.push(...cam);
    } catch (e) { state.health.infer = { ok: false, err: String(e.message || e), t: now.getTime() }; }
    for (const r of results) {
      const h = state.health[r.id];
      const okNow = r.ok || /budget/.test(r.error || '');
      if (!h || h.ok !== okNow) state.health[r.id] = { ok: okNow, err: okNow ? null : r.error, t: now.getTime() };
    }
    const fresh = [];
    for (const e of events) {
      if (state.dedupe[e.id]) continue;
      state.dedupe[e.id] = now.getTime();
      e.t = now.getTime();
      fresh.push(e);
    }
    if (fresh.length) newByPlace[place.id] = fresh;
  }
  // Prune dedupe keys older than DEDUPE_DAYS.
  for (const [k, t] of Object.entries(state.dedupe)) if (now.getTime() - t > DEDUPE_DAYS * 86400e3) delete state.dedupe[k];

  // Notify: act now always; heads-up outside quiet hours; info never (held for the brief).
  for (const place of cfg.places) {
    for (const e of newByPlace[place.id] || []) {
      const go = e.sev === SEV.act || (e.sev === SEV.heads && !quiet);
      e.notified = false;
      if (go) { const errs = await sendAll(ctx, messageFor(e, place)); e.notified = errs.length === 0 && notifiers(ctx).length > 0; }
      const ps = state.places[place.id];
      if (ps.today) ps.today.ev[e.sev - 1]++;
    }
  }
  // Event logs (one write per place that had new events).
  const logs = {};
  for (const place of cfg.places) {
    const fresh = newByPlace[place.id];
    if (!fresh) continue;
    const log = await kvGet(env, `log:${place.id}`, []);
    logs[place.id] = [...fresh, ...log].slice(0, LOG_CAP);
    await kvPut(ctx, `log:${place.id}`, logs[place.id]);
  }
  // Daily rollups move to history at local midnight (one write per place per day).
  for (const r of ctx.rollover) {
    const hist = await kvGet(env, `hist:${r.placeId}`, []);
    hist.push(r.day);
    await kvPut(ctx, `hist:${r.placeId}`, hist.slice(-HIST_CAP));
  }
  // Morning brief.
  let brief = null;
  if (cfg.places.length && briefDue(now, cfg.settings, state.lastBrief)) {
    const allLogs = {}; const hists = {};
    for (const p of cfg.places) { allLogs[p.id] = logs[p.id] || await kvGet(env, `log:${p.id}`, []); hists[p.id] = await kvGet(env, `hist:${p.id}`, []); }
    const since = state.lastBriefAt || now.getTime() - 12 * 3600e3;
    brief = await buildBrief(ctx, cfg, state, allLogs, hists, since, true);
    await kvPut(ctx, 'brief:latest', brief);
    state.lastBrief = brief.date;
    state.lastBriefAt = now.getTime();
    const first = brief.text.split('\n').slice(0, 6).join('\n');
    await sendAll(ctx, { title: 'Morning brief', body: first, priority: 3, tags: ['sunrise'], click: `${APP_URL}#brief` });
  }
  // Write state only if something changed (or hourly, as a heartbeat).
  const changed = JSON.stringify({ ...state, lastRun: null }) !== before;
  if (changed || !state.lastRun || now.getTime() - state.lastRun > 3600e3) {
    state.lastRun = now.getTime();
    await kvPut(ctx, 'state', state);
  }
  return { places: cfg.places.length, newEvents: Object.values(newByPlace).flat().length, subrequests: ctx.sub, writes: ctx.writes, sent: ctx.sent, brief: !!brief };
}

// ======================================================================= HTTP API
function cors(req) {
  const o = req.headers.get('Origin');
  return o === ALLOWED_ORIGIN ? { 'Access-Control-Allow-Origin': ALLOWED_ORIGIN, 'Access-Control-Allow-Methods': 'GET, PUT, POST, OPTIONS', 'Access-Control-Allow-Headers': 'Authorization, Content-Type', 'Access-Control-Max-Age': '600', Vary: 'Origin' } : { Vary: 'Origin' };
}
function json(req, obj, status = 200) {
  return new Response(JSON.stringify(obj), { status, headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store', ...cors(req) } });
}
function safeEqual(a, b) {
  if (typeof a !== 'string' || typeof b !== 'string' || a.length !== b.length) return false;
  let r = 0;
  for (let i = 0; i < a.length; i++) r |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return r === 0;
}
export function validPlaces(list) {
  if (!Array.isArray(list) || list.length > MAX_PLACES) return null;
  const out = [];
  for (const p of list) {
    const lat = Number(p.lat); const lon = Number(p.lon); const r = Number(p.radiusKm);
    if (!Number.isFinite(lat) || Math.abs(lat) > 90 || !Number.isFinite(lon) || Math.abs(lon) > 180) return null;
    if (!KINDS[p.kind]) return null;
    const id = String(p.id || '').replace(/[^a-z0-9-]/gi, '').slice(0, 24);
    if (!id) return null;
    const cams = (Array.isArray(p.cams) ? p.cams : []).filter((c) => c && camAllowed(c.url)).slice(0, 6)
      .map((c) => ({ id: String(c.id || '').slice(0, 40), name: String(c.name || 'Camera').slice(0, 80), url: String(c.url) }));
    out.push({ id, name: String(p.name || 'Place').slice(0, 60), lat: Math.round(lat * 1e5) / 1e5, lon: Math.round(lon * 1e5) / 1e5, radiusKm: Math.min(300, Math.max(1, r || 40)), kind: p.kind, checks: Array.isArray(p.checks) ? p.checks.filter((c) => CHECKS[c]) : undefined, cams, camAI: !!p.camAI });
  }
  if (new Set(out.map((p) => p.id)).size !== out.length) return null;
  return out;
}

export async function handle(req, env, fetchImpl = fetch) {
  const url = new URL(req.url);
  if (req.method === 'OPTIONS') return new Response(null, { status: 204, headers: cors(req) });
  if (!env.WATCH_TOKEN) return json(req, { error: 'Watch service is not set up (no token).' }, 503);
  const auth = req.headers.get('Authorization') || '';
  if (!safeEqual(auth, `Bearer ${env.WATCH_TOKEN}`)) return json(req, { error: 'Not authorised' }, 401);
  const path = url.pathname.replace(/\/+$/, '') || '/';
  const now = new Date();
  const ctxFor = (test) => ({ env, now, fetch: fetchImpl, test, sub: 0, budget: SUBREQUEST_BUDGET, memo: new Map(), settings: DEFAULT_SETTINGS, state: {}, rollover: [] });

  if (req.method === 'GET' && path === '/status') {
    const cfg = await loadCfg(env);
    const state = await kvGet(env, 'state', {});
    const days = {};
    for (const p of cfg.places) days[p.id] = (await kvGet(env, `hist:${p.id}`, [])).length;
    const day = localParts(now, cfg.settings.tz).date;
    const cam = state.camAI && state.camAI.date === day ? state.camAI : { date: day, used: 0 };
    return json(req, { ok: true, version: VERSION, places: cfg.places.length, lastRun: state.lastRun || null, health: state.health || {}, historyDays: days, settings: cfg.settings, notify: env.NTFY_TOPIC ? 'ntfy' : 'none', ai: !!env.ANTHROPIC_API_KEY, cameraAI: { enabled: !!env.ANTHROPIC_API_KEY, used: cam.used, cap: cfg.settings.camCap ?? 50, places: cfg.places.filter((p) => p.camAI && p.cams?.length).length } });
  }
  if (req.method === 'GET' && path === '/places') {
    const cfg = await loadCfg(env);
    const state = await kvGet(env, 'state', { places: {} });
    const status = {};
    for (const p of cfg.places) {
      const log = await kvGet(env, `log:${p.id}`, []);
      const open = log.filter((e) => !e.handled && now.getTime() - e.t < 24 * 3600e3);
      status[p.id] = { sev: open.reduce((a, e) => Math.max(a, e.sev), 0), open: open.length, alerts: Object.values(state.places?.[p.id]?.alerts || {}) };
    }
    return json(req, { places: cfg.places, settings: cfg.settings, status });
  }
  if (req.method === 'PUT' && path === '/places') {
    let body; try { body = await req.json(); } catch { return json(req, { error: 'Bad JSON' }, 400); }
    const places = validPlaces(body.places);
    if (!places) return json(req, { error: `Invalid places (max ${MAX_PLACES}; each needs id, name, lat, lon, radiusKm, kind)` }, 400);
    const cur = await loadCfg(env);
    const s = { ...cur.settings };
    if (body.settings) {
      for (const k of ['briefHour', 'briefMinute', 'quietStart', 'quietEnd']) if (Number.isInteger(body.settings[k])) s[k] = body.settings[k];
      if (Number.isInteger(body.settings.camCap)) s.camCap = Math.max(0, Math.min(200, body.settings.camCap));
      if (typeof body.settings.tz === 'string') { try { new Intl.DateTimeFormat('en-US', { timeZone: body.settings.tz }); s.tz = body.settings.tz; } catch { /* keep */ } }
    }
    await env.KV.put('cfg', JSON.stringify({ places, settings: s }));
    return json(req, { ok: true, places, settings: s });
  }
  if (req.method === 'GET' && path === '/events') {
    const cfg = await loadCfg(env);
    const only = url.searchParams.get('place');
    let all = [];
    for (const p of cfg.places) if (!only || p.id === only) all.push(...(await kvGet(env, `log:${p.id}`, [])));
    all.sort((a, b) => b.t - a.t);
    return json(req, { events: all.slice(0, Math.min(500, Number(url.searchParams.get('limit')) || 200)) });
  }
  if (req.method === 'POST' && path === '/events/handled') {
    let body; try { body = await req.json(); } catch { return json(req, { error: 'Bad JSON' }, 400); }
    const cfg = await loadCfg(env);
    const ids = new Set(body.ids || []);
    let n = 0;
    for (const p of cfg.places) {
      if (body.place && body.place !== p.id) continue;
      const log = await kvGet(env, `log:${p.id}`, []);
      let changed = false;
      for (const e of log) if (!e.handled && (body.all || ids.has(e.id))) { e.handled = true; changed = true; n++; }
      if (changed) await env.KV.put(`log:${p.id}`, JSON.stringify(log));
    }
    return json(req, { ok: true, handled: n });
  }
  if (req.method === 'GET' && path === '/brief') {
    return json(req, { brief: await kvGet(env, 'brief:latest', null) });
  }
  if (req.method === 'GET' && path === '/brief/now') {
    const cfg = await loadCfg(env);
    const state = await kvGet(env, 'state', { places: {} });
    const logs = {}; const hists = {};
    for (const p of cfg.places) { logs[p.id] = await kvGet(env, `log:${p.id}`, []); hists[p.id] = await kvGet(env, `hist:${p.id}`, []); }
    const ctx = { ...ctxFor(true), settings: cfg.settings, state };
    return json(req, { brief: await buildBrief(ctx, cfg, state, logs, hists, now.getTime() - 12 * 3600e3, url.searchParams.get('ai') !== '0') });
  }
  if (req.method === 'GET' && path === '/brief/point') {
    const lat = Number(url.searchParams.get('lat')); const lon = Number(url.searchParams.get('lon'));
    if (!Number.isFinite(lat) || !Number.isFinite(lon) || Math.abs(lat) > 90 || Math.abs(lon) > 180) return json(req, { error: 'lat/lon required' }, 400);
    const place = { id: 'point', name: 'This point', lat, lon, radiusKm: Math.min(300, Number(url.searchParams.get('r')) || 40), kind: 'home' };
    const cfg = await loadCfg(env);
    const ctx = { ...ctxFor(true), settings: cfg.settings };
    const shared = {};
    const ps = {};
    const { events, results } = await runPlace(ctx, place, 0, ps, shared);
    const facts = await placeFacts(ctx, place, ps, [], [], shared, 0);
    events.sort((a, b) => b.sev - a.sev);
    return json(req, { events: events.slice(0, 20).map((e) => ({ sev: SEV_LABEL[e.sev], title: e.title, text: e.text, todo: e.todo })), today: facts.today, outlook: facts.outlook, sky: facts.sky, todo: facts.todo, checks: results });
  }
  if (req.method === 'GET' && path === '/history') {
    const id = url.searchParams.get('place');
    const cfg = await loadCfg(env);
    const place = cfg.places.find((p) => p.id === id);
    if (!place) return json(req, { error: 'Unknown place' }, 404);
    const hist = await kvGet(env, `hist:${id}`, []);
    const state = await kvGet(env, 'state', { places: {} });
    const today = state.places?.[id]?.today || null;
    const log = await kvGet(env, `log:${id}`, []);
    return json(req, { place, days: hist.slice(-120), today, normals: normals(hist, today, now, cfg.settings.tz), timeline: log.slice(0, 300) });
  }
  if (req.method === 'GET' && path === '/selftest') {
    // Every check once for a fixed public point. No notifications, no KV writes.
    const ctx = ctxFor(true);
    const t0 = Date.now();
    const { results } = await runPlace(ctx, TEST_PLACE, 0, {}, {});
    const order = Object.keys(CHECKS);
    results.sort((a, b) => order.indexOf(a.id) - order.indexOf(b.id));
    // Conditions-report sources, one real query each for the last 24 hours.
    const t1 = Date.now();
    try {
      const r = await buildReport({ ...ctx, budget: ctx.sub + 12 }, { lat: TEST_PLACE.lat, lon: TEST_PLACE.lon, name: TEST_PLACE.name, start: new Date(now.getTime() - 86400e3).toISOString(), end: now.toISOString() });
      for (const s2 of r.report.sources) results.push({ id: `report: ${s2.name}`, ok: s2.ok, count: s2.ok ? r.report.items.length : null, ms: Date.now() - t1, error: s2.error || null });
    } catch (e) { results.push({ id: 'report', ok: false, count: null, ms: Date.now() - t1, error: e.message }); }
    results.push({ id: 'camera AI', ok: true, count: null, ms: 0, error: null, note: env.ANTHROPIC_API_KEY ? 'key present (not called by the self-test)' : 'off: no ANTHROPIC_API_KEY' });
    return json(req, { ok: results.every((r) => r.ok), point: TEST_PLACE.name, ms: Date.now() - t0, subrequests: ctx.sub, checks: results, notify: env.NTFY_TOPIC ? 'ntfy configured' : 'no ntfy topic', ai: !!env.ANTHROPIC_API_KEY });
  }
  if (req.method === 'GET' && path === '/report') {
    const q = url.searchParams;
    const cfg = await loadCfg(env);
    let lat = Number(q.get('lat')); let lon = Number(q.get('lon')); let name = q.get('name') || '';
    const p = q.get('place') && cfg.places.find((x) => x.id === q.get('place'));
    if (p) { lat = p.lat; lon = p.lon; name = name || p.name; }
    if (!Number.isFinite(lat) || !Number.isFinite(lon) || Math.abs(lat) > 90 || Math.abs(lon) > 180) return json(req, { error: 'lat/lon or place required' }, 400);
    const ctx = { ...ctxFor(true), settings: cfg.settings, budget: 30 };
    let out;
    try { out = await buildReport(ctx, { lat, lon, name: name.slice(0, 80), start: q.get('start'), end: q.get('end'), radiusKm: q.get('r') }); } catch (e) { return json(req, { error: e.message }, 400); }
    // Store it so it can be verified later (at most 25 a day: 2 KV writes each).
    const idx = await kvGet(env, 'reports', { day: '', n: 0, list: [] });
    const today = localParts(now, cfg.settings.tz).date;
    if (idx.day !== today) { idx.day = today; idx.n = 0; }
    let stored = false;
    if (q.get('store') !== '0' && idx.n < 25) {
      await env.KV.put(`report:${out.sha256}`, out.json);
      idx.n++; idx.list = [{ sha256: out.sha256, name: out.report.subject.name, start: out.report.window.start, end: out.report.window.end, at: out.report.generatedAt }, ...idx.list.filter((r) => r.sha256 !== out.sha256)].slice(0, 200);
      await env.KV.put('reports', JSON.stringify(idx));
      stored = true;
    }
    return json(req, { ...out, stored });
  }
  if (req.method === 'GET' && path === '/reports') {
    return json(req, { reports: (await kvGet(env, 'reports', { list: [] })).list });
  }
  if (req.method === 'GET' && path.startsWith('/report/')) {
    const hash = path.slice(8).toLowerCase();
    if (!/^[0-9a-f]{64}$/.test(hash)) return json(req, { error: 'Bad report id' }, 400);
    const text = await env.KV.get(`report:${hash}`);
    if (!text) return json(req, { error: 'No stored report with that fingerprint' }, 404);
    const check = await sha256Hex(text);
    return json(req, { report: JSON.parse(text), json: text, sha256: check, verified: check === hash });
  }
  if (req.method === 'POST' && path === '/test-notify') {
    const ctx = { ...ctxFor(false), test: false };
    const errs = await sendAll(ctx, { title: 'GodView Watch', body: 'Test notification: your phone is connected.', priority: 3, tags: ['white_check_mark'], click: APP_URL });
    return json(req, { ok: errs.length === 0 && !!env.NTFY_TOPIC, errors: errs });
  }
  return json(req, { error: 'Not found' }, 404);
}

export default {
  async fetch(req, env) {
    try { return await handle(req, env); } catch (e) { return json(req, { error: `Server error: ${e.message}` }, 500); }
  },
  async scheduled(event, env, ctx) {
    ctx.waitUntil(runAll(env, new Date(event.scheduledTime || Date.now())).catch((e) => console.log('run failed', e && e.message)));
  },
};
