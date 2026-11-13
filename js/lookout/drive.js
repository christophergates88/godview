// Drive mode: a live dashboard for the car, with the screen kept on.
// - Your speed and heading from GPS, the road you're on and its speed limit (OpenStreetMap)
// - Weather where you are now: temperature, rain in the next two hours, fog
// - Weather alerts for where you are now (re-checked as you drive)
// - Georgia 511 road problems ahead of you, nearest first
// - Sunset and deer risk (dawn and dusk; worst in the fall mating season)
// - Animal scan: the rear camera watches the road for deer and other large animals
// - Spoken announcements (on/off), so you don't have to look
// Without location permission it falls back to the place picked at the top of Now.

import { $, h, distKm, bearing, compass, imperial, dist, clock, getData, fillUrl, remember } from './common.js';
import { getPlace } from './place.js';
import { alerts as nwsAlerts, roadEvents, eventTitle, eventWord, eventSev, WMO } from './feeds.js';
import { ENDPOINTS } from '../config.js';
import { fmt } from '../core/units.js';
import { startScan, stopScan, scanState } from './animalscan.js';

const PREF_KEY = 'godview.drive.v1';
const prefs = (() => { try { return JSON.parse(localStorage.getItem(PREF_KEY) || '{}'); } catch { return {}; } })();
const savePrefs = () => { try { localStorage.setItem(PREF_KEY, JSON.stringify(prefs)); } catch { /* */ } };

const S = {
  open: false, gps: 'waiting', fix: null, speed: null, heading: null,
  road: null, roadQ: null, wx: null, wxQ: null, alerts: [], alQ: null, ga: [],
  announced: new Set(), spoken: [], fogSaid: false, flashT: null,
};
let watchId = null; let clockTimer = null; let lock = null; let built = false;

const ICO = {
  speaker: '<svg viewBox="0 0 24 24"><path d="M4 9.5h3.5L12 5.5v13l-4.5-4H4z" fill="currentColor"/><path d="M15.5 9a4 4 0 0 1 0 6M18 6.5a7.5 7.5 0 0 1 0 11" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"/></svg>',
  mute: '<svg viewBox="0 0 24 24"><path d="M4 9.5h3.5L12 5.5v13l-4.5-4H4z" fill="currentColor"/><path d="M16 9.5l5 5M21 9.5l-5 5" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"/></svg>',
  eye: '<svg viewBox="0 0 24 24"><path d="M2.5 12S6 5.5 12 5.5 21.5 12 21.5 12 18 18.5 12 18.5 2.5 12 2.5 12z" fill="none" stroke="currentColor" stroke-width="2" stroke-linejoin="round"/><circle cx="12" cy="12" r="3.2" fill="currentColor"/></svg>',
  arrow: '<svg viewBox="0 0 24 24"><path d="M12 3l6 16-6-3.5L6 19z" fill="currentColor"/></svg>',
  warn: '<svg viewBox="0 0 24 24"><path d="M12 3l10 18H2L12 3z" fill="none" stroke="currentColor" stroke-width="2" stroke-linejoin="round"/><path d="M12 10v5M12 18v.01" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"/></svg>',
};

// ---------------------------------------------------------------- open / close
export async function openDrive() {
  unlockAudio();           // must happen inside the tap that opened Drive mode (iPhone rule)
  const box = $('drive');
  if (!built) build(box);
  box.hidden = false;
  S.open = true;
  keepAwake(true);
  paint();
  startGps();
  clearInterval(clockTimer);
  clockTimer = setInterval(() => { refresh(); paint(); }, 15000);
  refresh(true);
  if (prefs.scan) toggleScan(true);
}

export function closeDrive() {
  $('drive').hidden = true;
  S.open = false;
  clearInterval(clockTimer);
  if (watchId != null) { try { navigator.geolocation.clearWatch(watchId); } catch { /* */ } }
  watchId = null;
  stopScan();
  keepAwake(false);
  try { speechSynthesis.cancel(); } catch { /* */ }
}

function build(box) {
  built = true;
  box.innerHTML = `
    <div class="dv-cam" id="dv-cam" hidden></div>
    <div class="dv-dash">
      <div class="dv-top">
        <button class="dv-btn" id="d-done">Done</button>
        <div class="dv-road" id="dv-road"><b>&nbsp;</b><small>&nbsp;</small></div>
        <button class="dv-btn ic" id="dv-voice" aria-label="Spoken announcements"></button>
      </div>
      <div class="dv-hero">
        <div class="dv-speed"><b id="dv-spd">--</b><span id="dv-unit">mph</span><small id="dv-head"></small></div>
        <div class="dv-limit" id="dv-limit" hidden><small>SPEED<br>LIMIT</small><b id="dv-lim">--</b></div>
      </div>
      <div class="dv-wx" id="dv-wx"></div>
      <div class="dv-chips" id="dv-chips"></div>
      <div id="dv-alert"></div>
      <div class="dv-ahead" id="dv-ahead"></div>
      <button class="dv-scan" id="dv-scan"></button>
      <p class="dv-note" id="dv-note"></p>
    </div>
    <div class="dv-flash" id="dv-flash" hidden></div>`;
  $('d-done').onclick = closeDrive;
  $('dv-voice').onclick = () => { prefs.voice = !voiceOn(); savePrefs(); unlockAudio(); if (voiceOn()) say('Voice on.'); paint(); };
  $('dv-scan').onclick = () => { unlockAudio(); toggleScan(!scanState().on); };
}

const voiceOn = () => prefs.voice !== false;

// ---------------------------------------------------------------- location
function startGps() {
  if (watchId != null) return;
  if (!navigator.geolocation) { S.gps = 'none'; return; }
  S.gps = 'waiting';
  watchId = navigator.geolocation.watchPosition(onFix, (e) => {
    S.gps = e.code === 1 ? 'denied' : 'lost';
    paint();
  }, { enableHighAccuracy: true, maximumAge: 1000, timeout: 20000 });
}

export function onFix(pos) {
  const c = pos.coords; const t = pos.timestamp || Date.now();
  const fix = { lat: c.latitude, lon: c.longitude, acc: c.accuracy ?? 30, t };
  const prev = S.fix;
  let v = Number.isFinite(c.speed) && c.speed >= 0 ? c.speed : null;
  if (v == null && prev && t - prev.t >= 900 && fix.acc < 80) v = (distKm(prev.lat, prev.lon, fix.lat, fix.lon) * 1000) / ((t - prev.t) / 1000);
  if (v != null) S.speed = v < 0.6 ? 0 : S.speed == null ? v : S.speed * 0.55 + v * 0.45;
  let hd = Number.isFinite(c.heading) && c.heading >= 0 && (v ?? 0) > 1.5 ? c.heading : null;
  if (hd == null && prev && distKm(prev.lat, prev.lon, fix.lat, fix.lon) * 1000 > 12) hd = bearing(prev.lat, prev.lon, fix.lat, fix.lon);
  if (hd != null) S.heading = hd;
  S.fix = fix; S.gps = 'ok';
  if (S.open) { refresh(); paint(); }
}

// Where to look things up: live GPS if we have it, else the picked place.
function here() {
  if (S.fix) return { lat: S.fix.lat, lon: S.fix.lon, live: true };
  const p = getPlace();
  return p ? { lat: p.lat, lon: p.lon, live: false, name: p.name } : null;
}
const movedKm = (a, b) => (a && b ? distKm(a.lat, a.lon, b.lat, b.lon) : Infinity);

// ---------------------------------------------------------------- data (throttled)
function refresh(force = false) {
  const p = here();
  if (!p) return;
  const now = Date.now();
  if (force || !S.wxQ || now - S.wxQ.t > 10 * 60e3 || movedKm(S.wxQ, p) > 8) { S.wxQ = { ...p, t: now }; loadWeather(p); }
  if (force || !S.alQ || now - S.alQ.t > 2 * 60e3 || movedKm(S.alQ, p) > 3) { S.alQ = { ...p, t: now }; loadAlerts(p); }
  if (force || !S.gaT || now - S.gaT > 4 * 60e3) { S.gaT = now; loadRoads(p); }
  if (p.live && (!S.roadQ || ((movedKm(S.roadQ, p) > 0.3 || (now - S.roadQ.t > 60e3 && movedKm(S.roadQ, p) > 0.05)) && now - S.roadQ.t > 12e3))) {
    S.roadQ = { ...p, t: now }; loadRoad(p);
  }
}

async function loadWeather(p) {
  try {
    S.wx = await remember(`dwx:${p.lat.toFixed(2)},${p.lon.toFixed(2)}`, 10 * 60e3,
      () => getData(fillUrl(ENDPOINTS.driveWeather, { lat: p.lat.toFixed(3), lon: p.lon.toFixed(3) }), { timeoutMs: 12000 }));
  } catch { /* keep the last reading */ }
  const vis = S.wx?.current?.visibility;
  if (Number.isFinite(vis) && vis < 1609 && !S.fogSaid) { S.fogSaid = true; say(`Fog. Visibility ${vis < 400 ? 'under a quarter mile' : 'under a mile'}.`); }
  if (Number.isFinite(vis) && vis > 3000) S.fogSaid = false;
  paint();
}

async function loadAlerts(p) {
  try { S.alerts = await nwsAlerts(p); } catch { /* outside the US, or the Weather Service is slow */ }
  for (const a of S.alerts) {
    if (S.announced.has(`al:${a.id}`)) continue;
    S.announced.add(`al:${a.id}`);
    if (a.level === 2) { tone('alert'); say(`Warning. ${a.event} for where you are.`, true); }
    else if (a.level === 1) say(`Heads-up. ${a.event} in effect here.`);
  }
  paint();
}

async function loadRoads(p) {
  try { S.ga = (await roadEvents(p, 60)).list; } catch { S.ga = []; }
  paint();
}

// The road you're on: name, number and speed limit from OpenStreetMap. The way
// nearest to you that runs the direction you're heading wins (so a crossing
// road at an intersection doesn't).
async function loadRoad(p) {
  const q = `[out:json][timeout:8];way(around:30,${p.lat.toFixed(5)},${p.lon.toFixed(5)})[highway][highway!~"^(footway|path|cycleway|steps|pedestrian|track|bridleway|corridor|service|platform|construction|proposed|elevator)$"];out tags geom 6;`;
  const urls = [ENDPOINTS.overpass, ...(ENDPOINTS.overpassMirrors || [])].slice(0, 2).map((u) => u.replace('{q}', encodeURIComponent(q)));
  for (const u of urls) {
    try {
      const j = await getData(u, { timeoutMs: 9000 });
      const way = pickWay(j.elements || [], p.lat, p.lon, S.heading);
      if (way) { S.road = way; paint(); return; }
    } catch { /* next server */ }
  }
  // Fallback: just the street name (no limit) from Nominatim
  try {
    const j = await getData(fillUrl(ENDPOINTS.reverseRoad, { lat: p.lat.toFixed(5), lon: p.lon.toFixed(5) }), { timeoutMs: 8000 });
    const name = j?.address?.road || '';
    if (name) { S.road = { name, ref: '', limit: null, from: 'nominatim' }; paint(); }
  } catch { /* keep the last road */ }
}

export function pickWay(els, lat, lon, heading) {
  const kx = 111.32 * Math.cos((lat * Math.PI) / 180); const ky = 110.57;
  let best = null;
  for (const w of els) {
    const g = w.geometry || []; const t = w.tags || {};
    if (g.length < 2) continue;
    let dmin = Infinity; let segBrg = null;
    for (let i = 1; i < g.length; i++) {
      const ax = (g[i - 1].lon - lon) * kx; const ay = (g[i - 1].lat - lat) * ky; const bx = (g[i].lon - lon) * kx; const by = (g[i].lat - lat) * ky;
      const dx = bx - ax; const dy = by - ay; const L = dx * dx + dy * dy || 1e-12;
      const u = Math.max(0, Math.min(1, -(ax * dx + ay * dy) / L));
      const d = Math.hypot(ax + u * dx, ay + u * dy) * 1000;
      if (d < dmin) { dmin = d; segBrg = (Math.atan2(dx, dy) * 180) / Math.PI; }
    }
    let score = dmin;
    if (Number.isFinite(heading) && segBrg != null) {
      const diff = Math.abs(((segBrg - heading + 540) % 360) - 180);
      score += 25 * Math.min(diff, 180 - diff) / 90;     // 0 when aligned either way, +25 m when crossing
    }
    if (!best || score < best.score) best = { score, name: t.name || '', ref: (t.ref || '').split(';')[0].trim(), limit: parseLimit(t.maxspeed), kind: t.highway, from: 'osm' };
  }
  return best;
}

export function parseLimit(s) {
  const m = String(s || '').match(/(\d+)\s*(mph)?/i);
  if (!m) return null;
  const v = Number(m[1]);
  return /mph/i.test(s) ? { mph: v, kmh: Math.round(v * 1.609) } : { kmh: v, mph: Math.round(v / 1.609) };
}

// "I-16", "I 16", "Interstate 16" -> "I16"; "SR 22" / "GA 22" -> "SR22"; "US-441" -> "US441"
export function roadKey(s) {
  const t = String(s || '').toUpperCase().replace(/INTERSTATE/g, 'I').replace(/STATE ROUTE|STATE HIGHWAY|\bGA\b|\bGEORGIA\b/g, 'SR').replace(/U\.?S\.? (HIGHWAY|HWY|ROUTE)/g, 'US');
  const m = t.match(/\b(I|US|SR)[\s-]*(\d+)/);
  return m ? `${m[1]}${m[2]}` : '';
}

// ---------------------------------------------------------------- derived
function ahead() {
  const p = here();
  if (!p || !S.ga.length) return [];
  const moving = p.live && S.speed != null && S.speed > 4.5 && S.heading != null;
  const mine = roadKey(S.road?.ref) || roadKey(S.road?.name);
  return S.ga.map((e) => {
    const km = distKm(p.lat, p.lon, e.lat, e.lon);
    const rel = moving ? Math.abs(((bearing(p.lat, p.lon, e.lat, e.lon) - S.heading + 540) % 360) - 180) : 0;
    const onRoad = !!mine && roadKey(e.road) === mine;
    return { e, km, rel, onRoad };
  }).filter((x) => x.km <= (moving ? 40 : 25) && (!moving || x.rel <= 50 || x.km <= 1.6 || (x.onRoad && x.rel <= 90)))
    .sort((a, b) => a.km - b.km).slice(0, 3);
}

function rainLine() {
  const m = S.wx?.minutely_15; const cur = S.wx?.current;
  if (!m || !Array.isArray(m.precipitation) || !m.time) return null;
  const slots = m.time.map((t, i) => ({ t: wxTime(t), mm: m.precipitation[i] || 0 })).filter((s) => s.t >= Date.now() - 15 * 60e3).slice(0, 8);
  if (!slots.length) return null;
  const wet = (s) => s.mm >= 0.15;
  const nowWet = wet(slots[0]) || (cur?.precipitation || 0) >= 0.15;
  const mins = (s) => Math.max(5, Math.round((s.t - Date.now()) / 60000 / 5) * 5);
  if (nowWet) {
    const dry = slots.find((s, i) => i > 0 && !wet(s) && slots.slice(i).every((x) => !wet(x)));
    return { wet: true, text: dry ? `Rain now · easing in ~${mins(dry)} min` : 'Rain for the next 2 hours' };
  }
  const first = slots.find(wet);
  return first ? { wet: true, text: `Rain in ~${mins(first)} min` } : { wet: false, text: 'Dry for the next 2 hours' };
}

// Open-Meteo gives local times ("2026-11-13T17:33") plus the place's UTC offset.
function wxTime(s) {
  const off = S.wx?.utc_offset_seconds;
  return Number.isFinite(off) ? Date.parse(`${s}Z`) - off * 1000 : Date.parse(s);
}
function sunTimes() {
  const d = S.wx?.daily; if (!d || !d.sunrise) return null;
  const pick = (arr) => (arr || []).map(wxTime).filter(Number.isFinite).sort((a, b) => a - b);
  return { rise: pick(d.sunrise), set: pick(d.sunset) };
}

// Deer move most at dawn and dusk, and most of all in the fall mating season (Oct-Dec).
export function deerRisk(now, sun) {
  const t = now.getTime();
  const near = (arr) => (arr || []).some((x) => Math.abs(t - x) <= 75 * 60e3);
  // Dark if the next sun event is a sunrise
  const nextRise = sun ? Math.min(...sun.rise.filter((x) => x > t), Infinity) : Infinity;
  const nextSet = sun ? Math.min(...sun.set.filter((x) => x > t), Infinity) : Infinity;
  const dark = !!sun && Number.isFinite(nextRise) && nextRise < nextSet;
  let lvl; let why;
  if (sun && (near(sun.rise) || near(sun.set))) { lvl = 2; why = near(sun.set) ? 'dusk' : 'dawn'; } else if (dark) { lvl = 1; why = 'after dark'; } else { lvl = 0; why = 'daytime'; }
  const m = now.getMonth();
  if (m >= 9 && m <= 11) { lvl = Math.min(2, lvl + 1); why += ' · fall rut'; }
  return { lvl, label: ['Low', 'Elevated', 'High'][lvl], why, dark: !!dark };
}

// ---------------------------------------------------------------- drawing
function paint() {
  if (!S.open || !built) return;
  const imp = imperial();
  const p = here();
  // Speed + heading
  const spd = S.speed == null ? null : imp ? S.speed * 2.23694 : S.speed * 3.6;
  $('dv-spd').textContent = spd == null ? '--' : String(Math.round(spd));
  $('dv-unit').textContent = imp ? 'mph' : 'km/h';
  $('dv-head').innerHTML = S.gps === 'ok' && S.heading != null ? `<i style="transform:rotate(${Math.round(S.heading)}deg)">${ICO.arrow}</i>${compass(S.heading)}`
    : S.gps === 'denied' ? 'Location is off' : S.gps === 'none' ? 'No GPS' : S.gps === 'lost' ? 'GPS signal lost' : 'Finding GPS…';
  // Speed limit + over-limit colour
  const lim = S.road?.limit ? (imp ? S.road.limit.mph : S.road.limit.kmh) : null;
  $('dv-limit').hidden = !lim;
  if (lim) $('dv-lim').textContent = String(lim);
  const over = lim && spd != null ? spd - lim : 0;
  $('dv-spd').className = over > (imp ? 15 : 24) ? 'bad' : over > (imp ? 5 : 8) ? 'warn' : '';
  // Road
  const roadName = S.road ? [S.road.ref, S.road.name].filter(Boolean).join(' · ') : '';
  $('dv-road').innerHTML = `<b>${h(roadName || (p && !p.live ? p.name || '' : '') || '&nbsp;')}</b><small>${h(new Date().toLocaleDateString([], { weekday: 'long' }))} · ${h(clock(Date.now()))}</small>`;
  $('dv-voice').innerHTML = voiceOn() ? ICO.speaker : ICO.mute;
  $('dv-voice').classList.toggle('off', !voiceOn());
  // Weather line
  const c = S.wx?.current;
  $('dv-wx').innerHTML = c ? `<b>${h(fmt.tempC(c.temperature_2m))}</b><span>${h(WMO[c.weather_code] || '')}</span><span>Wind ${h(fmt.windKmh(c.wind_speed_10m))}${c.wind_gusts_10m > 35 ? `, gusts ${h(fmt.windKmh(c.wind_gusts_10m))}` : ''}</span>` : '';
  // Chips: rain, fog, deer, sunset
  const chips = [];
  const r = rainLine(); if (r) chips.push(`<span class="${r.wet ? 'warn' : 'ok'}">${h(r.text)}</span>`);
  const vis = c?.visibility;
  if (Number.isFinite(vis) && vis < 1609) chips.push(`<span class="${vis < 400 ? 'bad' : 'warn'}">Fog · visibility ${h(dist(vis / 1000))}</span>`);
  const sun = sunTimes();
  const dr = deerRisk(new Date(), sun);
  $('drive').classList.toggle('dim', dr.dark);
  chips.push(`<span class="${dr.lvl === 2 ? 'warn' : ''}">Deer risk ${h(dr.label)} · ${h(dr.why)}</span>`);
  if (sun) {
    const t = Date.now();
    const nextSet = sun.set.find((x) => x > t); const nextRise = sun.rise.find((x) => x > t);
    if (nextSet && (!nextRise || nextSet < nextRise)) chips.push(`<span>Sunset ${h(clock(nextSet))}</span>`);
    else if (nextRise) chips.push(`<span>Sunrise ${h(clock(nextRise))}</span>`);
  }
  $('dv-chips').innerHTML = chips.join('');
  // Weather alert for where you are
  const top = S.alerts[0];
  $('dv-alert').innerHTML = top
    ? `<div class="dv-al l${top.level}">${ICO.warn}<div><b>${h(top.event)}</b><small>${top.ends ? `Until ${h(clock(top.ends))}` : h(String(top.area || '').split(';')[0])}${S.alerts.length > 1 ? ` · +${S.alerts.length - 1} more` : ''}</small></div></div>`
    : '<div class="dv-al l0"><div><b>No weather alerts here</b><small>Checked for where you are now</small></div></div>';
  // Road problems ahead
  const list = ahead();
  const moving = p?.live && S.speed != null && S.speed > 4.5 && S.heading != null;
  $('dv-ahead').innerHTML = list.length
    ? `<h3>${moving ? 'Ahead of you' : 'Nearby'} · Georgia 511</h3>${list.map((x) => `<div class="dv-ev s${eventSev(x.e)}"><b>${h(eventTitle(x.e))}</b><span>${x.onRoad ? '<i>your road</i>' : ''}<em>${h(dist(x.km))}</em></span></div>`).join('')}`
    : `<h3>${moving ? 'Ahead of you' : 'Nearby'}</h3><div class="dv-ev none"><b>No reported road problems</b></div>`;
  // Announce new problems close ahead (once each)
  if (moving) {
    for (const x of list) {
      const k = `ga:${x.e.id || `${x.e.lat},${x.e.lon}`}`;
      if (x.km <= 8 && !S.announced.has(k)) { S.announced.add(k); say(`${eventWord(x.e)} ahead${x.e.road ? ` on ${spokenRoad(x.e.road)}` : ''}, ${spokenDist(x.km)}.`); }
    }
  }
  paintScan();
}

function paintScan() {
  if (!built) return;
  const st = scanState();
  const cam = $('dv-cam');
  cam.hidden = !st.on;
  $('drive').classList.toggle('scanning', st.on);
  $('drive').classList.toggle('night', !!st.night);
  $('dv-scan').classList.toggle('on', st.on);
  $('dv-scan').innerHTML = st.on
    ? `${ICO.eye}<span><b>Stop animal scan</b><small>${h(st.phase === 'scanning' ? `Watching the road${st.night ? ' · night boost on' : ''}${st.fps ? ` · ${st.fps} checks/s` : ''}` : st.message)}</small></span>`
    : `${ICO.eye}<span><b>Animal scan</b><small>Rear camera watches for deer and other large animals</small></span>`;
  $('dv-note').textContent = st.phase === 'error' ? st.message
    : st.on ? 'Mount the phone facing the road. This is a second pair of eyes, not a safety system: it can miss animals, more so at night, in rain and far away. Do not swerve hard for an animal.'
      : '';
}

// ---------------------------------------------------------------- animal scan
async function toggleScan(on) {
  prefs.scan = on; savePrefs();
  if (!on) { stopScan(); paintScan(); return; }
  paintScan();
  const ok = await startScan($('dv-cam'), (ev) => {
    if (ev.type === 'state') { paintScan(); return; }
    if (ev.type === 'animal') {
      tone('animal');
      say(ev.side === 'ahead' ? 'Animal ahead!' : `Animal ${ev.side}!`, true);
      flash(`Animal ${ev.side === 'ahead' ? 'ahead' : `on the ${ev.side}`}`, 'Possibly a deer · slow down', 'bad');
    } else if (ev.type === 'eyes') {
      tone('eyes');
      flash(`Possible eyes ${ev.side === 'ahead' ? 'ahead' : `on the ${ev.side}`}`, 'Eyeshine in the headlights', 'warn');
    }
  });
  if (!ok) { prefs.scan = false; savePrefs(); }   // don't keep retrying a blocked camera on every open
  paintScan();
}

function flash(title, sub, kind) {
  const f = $('dv-flash');
  f.className = `dv-flash ${kind}`;
  f.innerHTML = `<div class="box"><b>${h(title)}</b><small>${h(sub)}</small></div>`;
  f.hidden = false;
  clearTimeout(S.flashT);
  S.flashT = setTimeout(() => { f.hidden = true; }, kind === 'bad' ? 3500 : 2500);
}

// ---------------------------------------------------------------- voice, sound, screen
const spokenRoad = (r) => String(r).replace(/\bI-?(\d+)/g, 'I $1').replace(/\bSR\s*(\d+)/g, 'State Route $1').replace(/\bUS-?(\d+)/g, 'U.S. $1');
const spokenDist = (km) => { const mi = km * 0.621371; return imperial() ? (mi < 1 ? 'under a mile' : `${Math.round(mi)} mile${Math.round(mi) === 1 ? '' : 's'}`) : `${Math.round(km)} kilometres`; };

export function say(text, urgent = false) {
  S.spoken.push(text); if (S.spoken.length > 40) S.spoken.shift();
  if (!voiceOn() || !('speechSynthesis' in window)) return;
  try {
    if (urgent) speechSynthesis.cancel();
    const u = new SpeechSynthesisUtterance(text);
    u.rate = urgent ? 1.1 : 1; u.volume = 1;
    speechSynthesis.speak(u);
  } catch { /* no speech on this device */ }
}

let ac = null;
function unlockAudio() {
  try {
    const C = window.AudioContext || window.webkitAudioContext;
    if (!ac && C) ac = new C();
    if (ac && ac.state === 'suspended') ac.resume();
  } catch { ac = null; }
  try { if ('speechSynthesis' in window && !S.speechReady) { S.speechReady = true; const u = new SpeechSynthesisUtterance(' '); u.volume = 0; speechSynthesis.speak(u); } } catch { /* */ }
}
function tone(kind) {
  if (!ac) return;
  const seq = kind === 'animal' ? [[1047, 0.13], [0, 0.05], [1047, 0.13], [0, 0.05], [1397, 0.28]]
    : kind === 'alert' ? [[880, 0.2], [0, 0.08], [660, 0.3]] : [[740, 0.09], [0, 0.07], [740, 0.09]];
  let t = ac.currentTime + 0.02;
  for (const [f, d] of seq) {
    if (f) {
      const o = ac.createOscillator(); const g = ac.createGain();
      o.type = 'triangle'; o.frequency.value = f;
      g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(kind === 'animal' ? 0.8 : 0.4, t + 0.012); g.gain.exponentialRampToValueAtTime(0.0001, t + d);
      o.connect(g); g.connect(ac.destination); o.start(t); o.stop(t + d + 0.03);
    }
    t += d;
  }
}

async function keepAwake(on) {
  // The iPhone app keeps the screen on natively; in a browser, use a screen wake lock.
  try { window.webkit?.messageHandlers?.godview?.postMessage({ keepAwake: on }); } catch { /* not in the app */ }
  if (on) { try { lock = navigator.wakeLock ? await navigator.wakeLock.request('screen') : null; } catch { lock = null; } }
  else { try { lock && lock.release(); } catch { /* */ } lock = null; }
}

document.addEventListener('visibilitychange', () => {
  // The screen lock is dropped when the app goes to the background; ask again on return.
  if (!document.hidden && S.open) { keepAwake(true); if (prefs.scan && !scanState().on) toggleScan(true); }
});

// For tests and debugging
window.GodViewDrive = { state: () => ({ ...S, announced: [...S.announced], scan: scanState() }), fix: (lat, lon, opts = {}) => onFix({ coords: { latitude: lat, longitude: lon, accuracy: 10, speed: opts.speed ?? null, heading: opts.heading ?? null }, timestamp: opts.t || Date.now() }) };
