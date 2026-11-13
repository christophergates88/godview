// Data the Lookout screens share: weather, weather alerts, Georgia 511 road
// events and cameras, public webcams. Each loader is remembered for a few
// minutes, so switching tabs never refetches.

import { getData, netCtx, remember, distKm, fillUrl } from './common.js';
import { loadFeed, camsFromFeed, eventsFromFeed, feedAgeMs, FEED_MAX_AGE_EVENTS_MS } from '../layers/lib/ga511.js';
import { ENDPOINTS } from '../config.js';

const key = (p) => `${p.lat.toFixed(2)},${p.lon.toFixed(2)}`;

export const WMO = { 0: 'Clear', 1: 'Mostly clear', 2: 'Partly cloudy', 3: 'Cloudy', 45: 'Fog', 48: 'Freezing fog', 51: 'Light drizzle', 53: 'Drizzle', 55: 'Heavy drizzle', 56: 'Freezing drizzle', 57: 'Freezing drizzle', 61: 'Light rain', 63: 'Rain', 65: 'Heavy rain', 66: 'Freezing rain', 67: 'Freezing rain', 71: 'Light snow', 73: 'Snow', 75: 'Heavy snow', 77: 'Snow grains', 80: 'Showers', 81: 'Showers', 82: 'Heavy showers', 85: 'Snow showers', 86: 'Snow showers', 95: 'Thunderstorms', 96: 'Storms with hail', 99: 'Storms with hail' };

// Open-Meteo: now + today (metric; formatted for your units on screen)
export const weather = (p) => remember(`wx:${key(p)}`, 10 * 60e3,
  () => getData(fillUrl(ENDPOINTS.weatherNow, { lat: p.lat.toFixed(3), lon: p.lon.toFixed(3) }), { timeoutMs: 12000 }));

// National Weather Service alerts covering the point (US only), most serious first.
// Act now (2): what the NWS itself sends to phones as emergency alerts (tornado, flash flood, extreme
// wind, hurricane, storm surge, tsunami, snow squall, dust storm, evacuation, shelter in place, and
// severe thunderstorms tagged "destructive"), plus anything rated Extreme. Heads-up (1): watches,
// advisories, statements and other warnings (severe thunderstorm, freeze, winter storm, heat, wind).
// The Watch service grades its alerts the same way, so the app and its notifications agree.
export const ACT_NOW = /Tornado Warning|Flash Flood Warning|Extreme Wind|Hurricane Warning|Storm Surge Warning|Tsunami Warning|Snow Squall Warning|Evacuation|Shelter in Place|Fire Warning|Dust Storm Warning/i;
export function alertLevel(a) {
  const ev = String(a.event || '');
  const sev = String(a.severity || '').toLowerCase();
  if (/watch/i.test(ev)) return 1;
  if (ACT_NOW.test(ev) || sev === 'extreme' || /destructive/i.test(a.threat || '')) return 2;
  return /warning|emergency|advisory|statement|outlook|alert/i.test(ev) || sev === 'severe' || sev === 'moderate' ? 1 : 0;
}
export const alerts = (p) => remember(`al:${key(p)}`, 3 * 60e3, async () => {
  const j = await getData(fillUrl(ENDPOINTS.nwsPoint, { lat: p.lat.toFixed(4), lon: p.lon.toFixed(4) }), { timeoutMs: 12000 });
  const now = Date.now();
  return (j.features || []).map((f) => f.properties || {}).map((a) => ({
    id: a.id || a['@id'] || a.headline, event: a.event || 'Alert', headline: a.headline || '', severity: a.severity || '', urgency: a.urgency || '', threat: String((a.parameters?.thunderstormDamageThreat || [])[0] || ''),
    desc: a.description || '', instruction: a.instruction || '', area: a.areaDesc || '', sender: a.senderName || '',
    ends: Date.parse(a.ends || a.expires || '') || null,
  })).filter((a) => !a.ends || a.ends > now)
    .map((a) => ({ ...a, level: alertLevel(a) }))
    .sort((x, y) => y.level - x.level);
});

// Georgia 511 (the copy rebuilt by the Lookout repo's feed job; no key)
export const ga511 = () => remember('ga511', 4 * 60e3, async () => {
  const f = await loadFeed(netCtx);
  const age = feedAgeMs(f);
  return { updated: f.updated, ageMs: age, cams: camsFromFeed(f), events: age > FEED_MAX_AGE_EVENTS_MS ? [] : eventsFromFeed(f), eventsStale: age > FEED_MAX_AGE_EVENTS_MS };
});

// Windy public webcams (copy rebuilt by the same job; no key)
export const webcams = () => remember('webcams', 15 * 60e3, async () => {
  const j = await getData(`${ENDPOINTS.webcamsFeed}?t=${Math.floor(Date.now() / 600000)}`, { timeoutMs: 20000 });
  if (!j || !Array.isArray(j.webcams)) throw new Error('The webcam list is not readable');
  return j;
});

// 511GA event types and sub-types in plain words: "Crash · I-16", "Roadwork · SR 22"
const TYPE_WORDS = { accidentsAndIncidents: 'Incident', closures: 'Closure', roadwork: 'Roadwork', specialEvents: 'Special event' };
export function eventWord(e) {
  const sub = String(e.sub || '').trim();
  if (sub && sub.length <= 30 && !/^\d+$/.test(sub)) return sub[0].toUpperCase() + sub.slice(1).replace(/([a-z])([A-Z])/g, '$1 $2').toLowerCase();
  return TYPE_WORDS[e.type] || String(e.type || 'Road event').replace(/([a-z])([A-Z])/g, '$1 $2').replace(/^\w/, (c) => c.toUpperCase());
}
export const eventTitle = (e) => `${eventWord(e)}${e.road ? ` · ${e.road}` : ''}`;

const INCIDENT = /crash|accident|collision|disabled|stall|debris|fire|hazmat|police|wreck/i;
export const eventIcon = (e) => (INCIDENT.test(`${e.type} ${e.sub}`) ? 'crash' : /construction|work|maintenance|closure|lane/i.test(`${e.type} ${e.sub}`) ? 'cone' : 'road');
export const eventSev = (e) => (/major|high|critical|severe/i.test(e.sev) || /closed|closure/i.test(`${e.sub} ${e.desc}`) ? 3 : INCIDENT.test(`${e.type} ${e.sub}`) ? 2 : 1);

// Road events near a place, nearest first.
export async function roadEvents(p, km = 90) {
  const g = await ga511();
  const list = g.events.map((e) => ({ ...e, km: distKm(p.lat, p.lon, e.lat, e.lon) })).filter((e) => e.km <= km).sort((a, b) => a.km - b.km);
  return { list, updated: g.updated, stale: g.eventsStale, ageMs: g.ageMs };
}

// Every camera near a place: Georgia 511 traffic cameras and public webcams, nearest first.
export async function camerasNear(p, km = 130) {
  const [g, w] = await Promise.allSettled([ga511(), webcams()]);
  const cams = [];
  if (g.status === 'fulfilled') {
    for (const c of g.value.cams) {
      const d = distKm(p.lat, p.lon, c.lat, c.lon);
      if (d > km || !c.url) continue;
      cams.push({ id: `g${c.id}`, kind: 'road', title: c.name, sub: [c.road, c.dir].filter(Boolean).join(' · '), lat: c.lat, lon: c.lon, km: d,
        img: c.url, ok: c.ok, src: 'Georgia 511', page: 'https://511ga.org/', layer: 'ga511Cameras', layerKey: c.id, refreshS: 10 });
    }
  }
  if (w.status === 'fulfilled') {
    for (const c of w.value.webcams) {
      if (c.lat == null || c.lon == null) continue;
      const d = distKm(p.lat, p.lon, c.lat, c.lon);
      if (d > km || !c.img) continue;
      cams.push({ id: `w${c.id}`, kind: 'webcam', title: c.title || 'Webcam', sub: c.city || '', lat: c.lat, lon: c.lon, km: d,
        img: c.img, ok: true, live: !!c.live, src: 'Windy webcams', page: c.url || 'https://www.windy.com/-Webcams/webcams', refreshS: 60 });
    }
  }
  cams.sort((a, b) => a.km - b.km);
  return {
    cams,
    road: g.status === 'fulfilled' ? { updated: g.value.updated } : { error: g.reason && g.reason.message },
    webcams: w.status === 'fulfilled' ? { updated: w.value.updated } : { error: w.reason && w.reason.message },
  };
}

// A camera picture URL that does not come from the browser cache.
export const freshImg = (c) => (c.kind === 'road' ? `${c.img}${c.img.includes('?') ? '&' : '?'}t=${Math.floor(Date.now() / 10000)}` : c.img);

// In Georgia? (the 511 copy covers Georgia only)
export const inGeorgia = (p) => p.state === 'GA' || (!p.state && p.lat > 30.3 && p.lat < 35.1 && p.lon > -85.7 && p.lon < -80.7);
