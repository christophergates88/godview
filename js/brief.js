// "What's here": a plain-language summary for one point, built only from the
// data the layers have actually loaded (plus live weather for the point).

import { GROUPS, ENDPOINTS } from './config.js';
import { fmt } from './core/units.js';
import { fetchJSON, fillUrl } from './core/net.js';
import { distKm, bearing, compass, inRing } from './layers/lib/geo.js';

// How far to look for each layer (km). Others use DEFAULT_KM.
const RADIUS = {
  flights: 40, military: 150, emergency: 500, airports: 150, airportDelays: 300, launches: 1500,
  earthquakes: 500, events: 300, fireIncidents: 150, firePerimeters: 150, firms: 50, volcanoes: 800,
  hurricanes: 2000, spcReports: 150, rivers: 60, tides: 150, buoys: 300, ga511Cameras: 15, caltrans: 15,
  ga511Events: 40, amtrak: 100, bikeshare: 3, powerPlants: 60, nuclear: 300, alpr: 15, cellTowers: 10,
  radio: 50, wikipedia: 10, inaturalist: 25, aurora: 300, tempGrid: 400, airQuality: 400,
};
const DEFAULT_KM = 100;
const SKIP_GENERIC = new Set(['airports', 'aurora']);

function where(pt, it) {
  const d = distKm(pt.lat, pt.lon, it.lat, it.lon);
  return d < 1 ? 'right here' : `${d < 10 ? d.toFixed(1) : Math.round(d)} km ${compass(bearing(pt.lat, pt.lon, it.lat, it.lon))}`;
}

const WMO = { 0: 'clear', 1: 'mostly clear', 2: 'partly cloudy', 3: 'overcast', 45: 'fog', 48: 'freezing fog', 51: 'light drizzle', 53: 'drizzle', 55: 'heavy drizzle', 61: 'light rain', 63: 'rain', 65: 'heavy rain', 71: 'light snow', 73: 'snow', 75: 'heavy snow', 80: 'rain showers', 81: 'rain showers', 82: 'violent showers', 95: 'thunderstorms', 96: 'thunderstorms with hail', 99: 'thunderstorms with hail' };

export async function buildBrief(manager, layers, pt) {
  const sections = [];
  let used = 0;

  // Weather at the point (always fetched; small request).
  try {
    const j = await fetchJSON(fillUrl(ENDPOINTS.openMeteo, { lat: pt.lat.toFixed(3), lon: pt.lon.toFixed(3) }), { timeoutMs: 10000 });
    const c = j.current || {};
    sections.push({ title: 'Weather now', lines: [`${fmt.tempC(c.temperature_2m)} and ${WMO[c.weather_code] || 'conditions unknown'}, wind ${fmt.windKmh(c.wind_speed_10m)} from ${fmt.heading(c.wind_direction_10m)}. (Open-Meteo)`] });
  } catch (e) {
    sections.push({ title: 'Weather now', lines: [`Not available (${e.message}).`] });
  }

  for (const g of GROUPS) {
    const lines = [];
    for (const layer of layers.filter((l) => l.group === g.id)) {
      const st = manager.state[layer.id];
      if (!st.enabled || st.status !== 'ok') continue;
      used++;
      // A layer can give its own briefing lines (satellites, day/night).
      if (layer.brief) {
        try { lines.push(...(layer.brief(manager.ctx[layer.id], pt) || [])); } catch { /* ignore */ }
        continue;
      }
      const items = manager.items(layer.id);
      if (!items.length) continue;
      // Areas that contain the point (weather alerts, outlooks, fire perimeters, drought).
      if (items.some((it) => it.rings && it.rings.length)) {
        const hits = items.filter((it) => (it.rings || []).some((r) => inRing(pt.lat, pt.lon, r)));
        const names = [...new Set(hits.map((h) => h.title))].join(', ');
        if (hits.length) { lines.push(layer.id === 'alerts' ? `In effect here: ${names}.` : `${layer.name}: this point is inside ${names}.`); continue; }
        if (layer.id === 'alerts') { lines.push('No active NWS alert covers this point (of those with a mapped area).'); continue; }
      }
      if (SKIP_GENERIC.has(layer.id)) continue;
      const R = RADIUS[layer.id] || DEFAULT_KM;
      const near = items.filter((it) => Number.isFinite(it.lat))
        .map((it) => [distKm(pt.lat, pt.lon, it.lat, it.lon), it]).filter(([d]) => d <= R).sort((a, b) => a[0] - b[0]);
      if (!near.length) continue;
      const [, first] = near[0];
      const label = layer.name.toLowerCase();
      if (layer.id === 'flights') {
        const air = near.filter(([, it]) => !it.onGround);
        if (air.length) lines.push(`${air.length} aircraft within ${R} km; closest ${air[0][1].title}${air[0][1].altM ? ' at ' + fmt.altitude(air[0][1].altM) : ''}, ${where(pt, air[0][1])}.`);
        continue;
      }
      lines.push(`${layer.name}: ${near.length} within ${R} km; nearest ${first.title || label}, ${where(pt, first)}.`);
    }
    if (lines.length) sections.push({ title: g.name, lines });
  }

  sections.push({ title: 'About this briefing', lines: [`Built from the ${used} layers that are on and loaded, plus live weather. Turn on more layers for a fuller picture.`] });
  return sections;
}
