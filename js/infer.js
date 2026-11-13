// Inferences for what is on screen: "things nobody reported", worked out from
// the loaded layers. Each one says "Possibly", has a confidence and lists its
// evidence. Nothing here is drawn on the map; it shows up in the status line
// and in What's here. Pure functions (no browser APIs) so they can be tested.

import { distKm, bearing, compass } from './layers/lib/geo.js';

export const TANKERS = new Set(['AT8T', 'AT802', 'AT45', 'AT65', 'CL2T', 'CL41', 'CL4G', 'C130', 'C30J', 'DC10', 'MD87', 'B742', 'P3', 'B463', 'RJ85', 'S2P', 'S2T']);
export const isHeli = (f) => f.cat === 'A7' || /^(H\d|EC\d|AS\d|B0?[0-9]{2}|R22|R44|R66|S76|S92|A109|A139|A169|AW|BK17|MD5|MD9|EH10|UH|NH90)/i.test(String(f.type || ''));
const ftOf = (f) => (f.altM || 0) * 3.28084;
const ktOf = (f) => (f.speedMs || 0) * 1.943844;

// Heading change over the recent track history: big total turn in a small area = circling.
export function isCircling(hist) {
  if (!hist || hist.length < 4) return false;
  let turn = 0;
  for (let i = 1; i < hist.length; i++) {
    let d = Math.abs((hist[i].track ?? 0) - (hist[i - 1].track ?? 0)) % 360;
    if (d > 180) d = 360 - d;
    turn += d;
  }
  const span = Math.max(...hist.map((h) => distKm(hist[0].lat, hist[0].lon, h.lat, h.lon)));
  return turn >= 300 && span < 8 && hist[hist.length - 1].t - hist[0].t <= 15 * 60000;
}

function rel(pt, lat, lon) {
  const km = distKm(pt.lat, pt.lon, lat, lon);
  const mi = km * 0.621371;
  return mi < 0.5 ? 'right here' : `${mi < 10 ? mi.toFixed(1) : Math.round(mi)} mi ${compass(bearing(pt.lat, pt.lon, lat, lon))}`;
}

// flights: [{ key, lat, lon, altM, speedMs, type, cat, special, military, onGround, hist, title }]
// signals: { reports, fires, incidents, emergencies, quakes } each [{ lat, lon, title, t? }]
export function inferHere(pt, flights, signals = {}, radiusKm = 40) {
  const out = [];
  const near = flights.filter((f) => Number.isFinite(f.lat) && distKm(pt.lat, pt.lon, f.lat, f.lon) <= radiusKm && !f.onGround);
  const add = (x) => out.push({ ...x, where: rel(pt, x.lat, x.lon) });

  for (const f of near) {
    if (isCircling(f.hist)) {
      add({ kind: 'circling', lat: f.lat, lon: f.lon, confidence: ftOf(f) < 3000 ? 'medium' : 'low', title: 'an aircraft circling',
        text: `${f.title} is circling ${rel(pt, f.lat, f.lon)}${ftOf(f) < 3000 ? ' at low height' : ''}: it could be police, news, survey, training or holding for an airport.`,
        evidence: [`Turned more than 300° in the last ${Math.round((f.hist[f.hist.length - 1].t - f.hist[0].t) / 60000)} min within 8 km`, `${Math.round(ftOf(f)).toLocaleString()} ft`] });
    }
    if (isHeli(f) && ftOf(f) < 1000 && ktOf(f) < 40) {
      add({ kind: 'hover', lat: f.lat, lon: f.lon, confidence: 'low', title: 'a helicopter landing or hovering',
        text: `A helicopter (${f.title}) is low and slow ${rel(pt, f.lat, f.lon)}: it may be landing or hovering, for example a medical or police flight.`,
        evidence: [`${Math.round(ftOf(f))} ft, ${Math.round(ktOf(f))} kt`] });
    }
  }
  // Special aircraft gathered in one spot
  const special = near.filter((f) => isHeli(f) || f.special || f.military);
  const used = new Set();
  for (const f of special) {
    if (used.has(f.key)) continue;
    const g = special.filter((x) => distKm(f.lat, f.lon, x.lat, x.lon) < 5);
    if (g.length >= 2) {
      g.forEach((x) => used.add(x.key));
      add({ kind: 'converge', lat: f.lat, lon: f.lon, confidence: g.length >= 3 ? 'medium' : 'low', title: `${g.length} special aircraft in one spot`,
        text: `${g.length} helicopters, military or emergency aircraft are within 5 km of each other ${rel(pt, f.lat, f.lon)}: something may be happening there.`,
        evidence: g.map((x) => `${x.title}${x.type ? ` (${x.type})` : ''}, ${Math.round(ftOf(x)).toLocaleString()} ft`) });
    }
  }
  // Air tankers low near a known fire
  const fireish = [...(signals.fires || []), ...(signals.incidents || [])];
  for (const f of near.filter((x) => TANKERS.has(String(x.type || '').toUpperCase()) && ftOf(x) < 6000)) {
    const fire = fireish.find((s) => distKm(f.lat, f.lon, s.lat, s.lon) < 30);
    add({ kind: 'tanker', lat: f.lat, lon: f.lon, confidence: fire ? 'medium' : 'low', title: 'firefighting aircraft at work',
      text: `A ${f.type} (a type used as an air tanker) is flying low ${rel(pt, f.lat, f.lon)}${fire ? `, near ${fire.title}` : ''}.`,
      evidence: [`${f.title} ${f.type} at ${Math.round(ftOf(f)).toLocaleString()} ft`, fire ? `Fire within 30 km: ${fire.title}` : 'No listed fire within 30 km'] });
  }
  // Cross-signal: different kinds of signal close together
  const sig = [
    ...(signals.reports || []).map((s) => ({ ...s, kind: 'storm report' })),
    ...(signals.fires || []).map((s) => ({ ...s, kind: 'fire detection' })),
    ...(signals.incidents || []).map((s) => ({ ...s, kind: 'road incident' })),
    ...(signals.emergencies || []).map((s) => ({ ...s, kind: 'aircraft emergency' })),
    ...(signals.quakes || []).map((s) => ({ ...s, kind: 'earthquake' })),
    ...out.filter((o) => ['circling', 'converge', 'hover'].includes(o.kind)).map((o) => ({ lat: o.lat, lon: o.lon, title: o.title, kind: 'aircraft behaviour' })),
  ].filter((s) => Number.isFinite(s.lat) && distKm(pt.lat, pt.lon, s.lat, s.lon) <= radiusKm);
  const seen = new Set();
  for (const s of sig) {
    const g = sig.filter((x) => distKm(s.lat, s.lon, x.lat, x.lon) <= 8);
    const kinds = [...new Set(g.map((x) => x.kind))];
    const cell = `${Math.round(s.lat * 10)}:${Math.round(s.lon * 10)}`;
    if (kinds.length < 2 || seen.has(cell)) continue;
    seen.add(cell);
    add({ kind: 'cross', lat: s.lat, lon: s.lon, confidence: kinds.length >= 3 ? 'high' : 'medium', title: 'something is happening in one spot',
      text: `${kinds.length} separate kinds of signal point to the same spot ${rel(pt, s.lat, s.lon)}: ${kinds.join(', ')}.`,
      evidence: g.slice(0, 6).map((x) => `${x.kind}: ${x.title}`) });
  }
  const rank = { high: 3, medium: 2, low: 1 };
  return out.sort((a, b) => rank[b.confidence] - rank[a.confidence]);
}

// Gather inputs from the app's loaded layers.
export function inferFromManager(manager, pt, radiusKm = 40) {
  const items = (id) => (manager.state[id]?.enabled && manager.state[id].status === 'ok' ? manager.items(id) : []);
  // The same aircraft can be in several layers (same hex): merge into one, keeping any special flag.
  const byKey = new Map();
  for (const f of [...items('flights'), ...items('military').map((m) => ({ ...m, military: true, special: true })), ...items('emergency').map((m) => ({ ...m, special: true }))]) {
    const k = String(f.key || '').toLowerCase() || Symbol();
    const prev = byKey.get(k);
    byKey.set(k, prev ? { ...prev, ...Object.fromEntries(Object.entries(f).filter(([, v]) => v != null && v !== false)), hist: prev.hist || f.hist } : f);
  }
  const flights = [...byKey.values()];
  const signals = {
    reports: items('spcReports'),
    fires: [...items('firms'), ...items('fireIncidents')],
    incidents: items('ga511Events'),
    emergencies: items('emergency'),
    quakes: items('earthquakes').filter((q) => Date.now() - (q.time || 0) < 3 * 3600e3),
  };
  return inferHere(pt, flights, signals, radiusKm);
}
