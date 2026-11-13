// "Answer first": a short live status for where you are, built only from data
// that is actually loaded (plus live weather and, if set up, the watch check).
// Shows a headline and up to three facts, then shrinks to a small pill.
// Tap it for the full "What's here".

import { ENDPOINTS } from './config.js';
import { fetchJSON, fillUrl, cache } from './core/net.js';
import { settings } from './core/settings.js';
import { fmt, escapeHtml } from './core/units.js';
import { distKm, inRing } from './layers/lib/geo.js';
import * as watch from './watch.js';
import { inferFromManager } from './infer.js';
import { alertLevel } from './lookout/feeds.js';

const $ = (id) => document.getElementById(id);
const WMO = { 0: 'clear', 1: 'mostly clear', 2: 'partly cloudy', 3: 'cloudy', 45: 'fog', 48: 'fog', 51: 'drizzle', 53: 'drizzle', 55: 'drizzle', 61: 'light rain', 63: 'rain', 65: 'heavy rain', 71: 'light snow', 73: 'snow', 75: 'heavy snow', 80: 'showers', 81: 'showers', 82: 'heavy showers', 95: 'thunderstorms', 96: 'storms with hail', 99: 'storms with hail' };

let M = null; let LAYERS = []; let onOpen = () => {};
let point = null;       // { lat, lon, label }
let collapseTimer = null;
let busy = false;
let last = null;

export function initStatus({ manager, layers, open }) {
  M = manager; LAYERS = layers; onOpen = open;
  const el = $('status');
  el.addEventListener('click', () => { if (point) onOpen(point.lat, point.lon, point.label); });
  // Any touch on the map shrinks it to the pill.
  document.getElementById('globe').addEventListener('pointerdown', () => collapse(), { passive: true });
  let t = null;
  M.onStatus((id) => { if (id === 'tick') return; clearTimeout(t); t = setTimeout(update, 2500); });
  setTimeout(update, 1500);
  setInterval(update, 5 * 60000);
}

function collapse() { $('status').classList.add('pill'); }
function expand() {
  const el = $('status');
  el.classList.remove('pill');
  clearTimeout(collapseTimer);
  collapseTimer = setTimeout(collapse, 12000);
}

async function pickPoint() {
  // 1) your location, but only if permission was already given (never prompts here)
  try {
    const p = navigator.permissions && await navigator.permissions.query({ name: 'geolocation' });
    if (p && p.state === 'granted') {
      const pos = await new Promise((res, rej) => navigator.geolocation.getCurrentPosition(res, rej, { timeout: 8000, maximumAge: 600000 }));
      return { lat: pos.coords.latitude, lon: pos.coords.longitude, label: 'Here' };
    }
  } catch { /* fall through */ }
  // 2) first saved Watch place
  if (watch.connected()) {
    try { const j = await watch.api('/places', { timeoutMs: 8000 }); const p = j.places?.[0]; if (p) return { lat: p.lat, lon: p.lon, label: p.name }; } catch { /* fall through */ }
  }
  // 3) the start location
  const s = settings.get('start');
  return { lat: Number(s.lat), lon: Number(s.lon), label: s.name || 'Start' };
}

const itemsOf = (id) => (M.state[id]?.enabled && M.state[id].status === 'ok' ? M.items(id) : []);

export async function computeStatus(pt) {
  const facts = [];
  let level = 0; // 0 clear, 1 heads-up, 2 act now
  let headline = '';
  // Watch service check for this point (if connected)
  const server = await watch.pointBrief(pt.lat, pt.lon);
  if (server && server.events?.length) {
    const top = server.events[0];
    level = top.sev === 'act now' ? 2 : top.sev === 'heads-up' ? 1 : 0;
    if (level) headline = `${level === 2 ? 'Act now' : 'Heads-up'}: ${top.title}`;
  }
  // Weather alerts loaded in the app that cover the point
  if (!headline) {
    // Graded by NWS severity: a tornado or severe thunderstorm warning is "act now", a freeze warning a heads-up.
    const lv = (a) => alertLevel({ event: a.title, severity: a.severity }) || 1;
    const hits = itemsOf('alerts').filter((a) => (a.rings || []).some((r) => inRing(pt.lat, pt.lon, r))).sort((x, y) => lv(y) - lv(x));
    if (hits.length) { const l = lv(hits[0]); level = Math.max(level, l); headline = `${l === 2 ? 'Act now' : 'Heads-up'}: ${hits[0].title}`; }
  }
  if (!headline) headline = pt.label === 'Here' ? 'All clear here' : `All clear near ${pt.label}`;
  // An inference nearby (medium or high confidence), clearly marked
  try {
    const inf = inferFromManager(M, pt, 30).filter((x) => x.confidence !== 'low');
    if (inf.length) facts.push(`Possibly: ${inf[0].title} ${inf[0].where}`);
  } catch { /* skip */ }
  // Weather now
  try {
    const k = `wx.${pt.lat.toFixed(2)},${pt.lon.toFixed(2)}`;
    let rec = cache.get(k, 600);
    if (!rec) rec = cache.set(k, await fetchJSON(fillUrl(ENDPOINTS.openMeteo, { lat: pt.lat.toFixed(3), lon: pt.lon.toFixed(3) }), { timeoutMs: 8000 }));
    const c = rec.data.current || {};
    if (c.temperature_2m != null) facts.push(`${fmt.tempC(c.temperature_2m)}, ${WMO[c.weather_code] || 'mixed'}`);
  } catch { /* skip */ }
  // Aircraft overhead (only if the loaded flight area covers the point)
  const fl = itemsOf('flights');
  if (fl.length) {
    const over = fl.filter((f) => !f.onGround && distKm(pt.lat, pt.lon, f.lat, f.lon) <= 15).length;
    const near = fl.filter((f) => !f.onGround && distKm(pt.lat, pt.lon, f.lat, f.lon) <= 50).length;
    const covered = fl.some((f) => distKm(pt.lat, pt.lon, f.lat, f.lon) < 150);
    if (covered) facts.push(over ? `${over} aircraft overhead` : near ? `${near} aircraft nearby` : 'No aircraft nearby');
  }
  // Space Station tonight
  for (const id of ['satStations', 'satellites']) {
    const L = M.get(id);
    if (L?.nextPass && M.state[id].enabled && M.state[id].status === 'ok') {
      try { const p = L.nextPass(pt); if (p) { facts.push(`${p.short} passes ${p.time}`); break; } } catch { /* skip */ }
    }
  }
  // Nearest earthquake today
  const q = itemsOf('earthquakes').filter((e) => Date.now() - (e.time || 0) < 86400e3)
    .map((e) => [distKm(pt.lat, pt.lon, e.lat, e.lon), e]).filter(([d]) => d < 300).sort((a, b) => a[0] - b[0])[0];
  if (q) facts.push(`M${(q[1].mag || 0).toFixed(1)} quake ${settings.get('units') === 'imperial' ? Math.round(q[0] * 0.621) + ' mi' : Math.round(q[0]) + ' km'} away`);
  return { level, headline, facts: facts.slice(0, 3) };
}

export async function update() {
  if (busy) return;
  busy = true;
  try {
    point = await pickPoint();
    const s = await computeStatus(point);
    const changed = !last || last.headline !== s.headline || last.level !== s.level;
    last = s;
    const el = $('status');
    el.dataset.level = String(s.level);
    el.innerHTML = `<i class="s-dot"></i><span class="s-head">${escapeHtml(s.headline)}</span>${s.facts.length ? `<span class="s-facts">${s.facts.map((f) => `<span>${escapeHtml(f)}</span>`).join('')}</span>` : ''}`;
    el.hidden = false;
    el.setAttribute('aria-label', `${s.headline}. ${s.facts.join('. ')}. Tap for details.`);
    if (changed || s.level > 0) expand();
  } finally { busy = false; }
}
