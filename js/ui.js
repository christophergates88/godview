// All on-screen controls: layer sheet, detail card, search, my-location,
// settings and the small coordinate read-out (HUD).

import { BASEMAPS, ENDPOINTS, INTERVALS, DEFAULT_START, APP } from './config.js';
import { settings, apiKeys } from './core/settings.js';
import { fmt, escapeHtml } from './core/units.js';
import { fetchJSON, fillUrl, cache } from './core/net.js';
import * as globe from './globe.js';
import { SAT_GROUPS } from './layers/satellites.js';

const $ = (id) => document.getElementById(id);
const Cesium = () => window.Cesium;

let M = null;        // LayerManager
let LAYERS = [];
let viewer = null;

export function initUI(opts) {
  M = opts.manager;
  LAYERS = opts.layers;
  viewer = opts.viewer;
  buildSheet();
  buildSegments();
  initCard();
  initSearch();
  initLocate();
  initSettings();
  initHud();
  globe.onTap(onTap);
  M.onStatus((id) => {
    if (id === 'tick') { refreshAllStatus(); cardTick(); return; }
    updateLayer(id);
    if (current && current.layer === id && !M.state[id].enabled) closeCard();
  });
}

// ---------------------------------------------------------------- toast
let toastTimer = null;
export function toast(msg, ms = 3500) {
  const t = $('toast');
  t.textContent = msg;
  t.hidden = false;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => { t.hidden = true; }, ms);
}

// ---------------------------------------------------------------- layer sheet
function buildSheet() {
  const chips = $('chips');
  const list = $('layer-list');
  for (const L of LAYERS) {
    const chip = document.createElement('button');
    chip.className = 'chip';
    chip.id = 'chip-' + L.id;
    chip.style.setProperty('--chip', L.color);
    chip.setAttribute('aria-pressed', 'false');
    chip.innerHTML = `${L.icon}<span>${escapeHtml(L.name)}</span><span class="n"></span><i class="dot"></i>`;
    chip.addEventListener('click', () => M.enable(L.id, !M.state[L.id].enabled));
    chips.appendChild(chip);

    const row = document.createElement('div');
    row.className = 'layer-row';
    row.id = 'row-' + L.id;
    row.style.setProperty('--chip', L.color);
    row.innerHTML = `
      <div class="ico">${L.icon}</div>
      <div class="info">
        <div class="name"><span>${escapeHtml(L.name)}</span><i class="dot"></i><span class="count"></span></div>
        <div class="stat"></div>
      </div>
      <label class="switch" aria-label="${escapeHtml(L.name)}"><input type="checkbox"><span></span></label>`;
    row.querySelector('input').addEventListener('change', (e) => M.enable(L.id, e.target.checked));
    list.appendChild(row);
    updateLayer(L.id);
  }

  // Open / close the sheet: tap the handle, or swipe it.
  const sheet = $('sheet');
  const handle = $('sheet-handle');
  const setState = (s) => { sheet.dataset.state = s; };
  handle.addEventListener('click', () => setState(sheet.dataset.state === 'open' ? 'peek' : 'open'));
  let y0 = null;
  const start = (y) => { y0 = y; };
  const end = (y) => {
    if (y0 == null) return;
    const dy = y - y0; y0 = null;
    if (dy < -25) setState('open'); else if (dy > 25) setState('peek');
  };
  for (const elx of [handle, $('chips')]) {
    elx.addEventListener('touchstart', (e) => start(e.touches[0].clientY), { passive: true });
    elx.addEventListener('touchend', (e) => end(e.changedTouches[0].clientY));
  }
}

function statusText(L, st) {
  if (!st.enabled) return { text: 'Off', cls: '' };
  if (st.status === 'loading' && !st.updatedAt) return { text: 'Loading…', cls: '' };
  if (st.status === 'error') return { text: st.message + (st.updatedAt ? ` · last good ${fmt.ago(st.updatedAt)}` : ''), cls: 'err', retry: true };
  if (st.status === 'limited') return { text: st.message + ' · will retry', cls: 'warn', retry: true };
  const parts = [`Updated ${fmt.ago(st.updatedAt)}`];
  if (st.note) parts.push(st.note);
  return { text: parts.join(' · '), cls: '' };
}

function updateLayer(id) {
  const L = LAYERS.find((l) => l.id === id);
  const st = M.state[id];
  if (!L || !st) return;
  const chip = $('chip-' + id);
  const row = $('row-' + id);
  const dotCls = 'dot ' + (st.enabled ? (st.busy ? 'loading' : st.status) : '');
  if (chip) {
    chip.classList.toggle('on', st.enabled);
    chip.setAttribute('aria-pressed', String(st.enabled));
    chip.querySelector('.n').textContent = st.enabled ? (st.status === 'error' ? '!' : (st.count != null ? compact(st.count) : '')) : '';
    const warn = st.enabled && (st.status === 'error' || st.status === 'limited');
    const cdot = chip.querySelector('.dot');
    cdot.className = dotCls;
    cdot.style.display = warn ? '' : 'none';
  }
  if (row) {
    row.querySelector('input').checked = st.enabled;
    row.querySelector('.dot').className = dotCls;
    row.querySelector('.count').textContent = st.enabled && st.count != null ? st.count.toLocaleString() : '';
    const s = statusText(L, st);
    const stat = row.querySelector('.stat');
    stat.className = 'stat ' + s.cls;
    stat.textContent = s.text;
    if (s.retry) {
      const b = document.createElement('button');
      b.className = 'retry';
      b.textContent = 'Retry';
      b.addEventListener('click', () => { M.state[id].failures = 0; M.refresh(id); });
      stat.appendChild(b);
    }
  }
}
function refreshAllStatus() { for (const L of LAYERS) if (M.state[L.id].enabled && M.state[L.id].status !== 'error') updateLayer(L.id); }
const compact = (n) => (n >= 10000 ? Math.round(n / 1000) + 'k' : n >= 1000 ? (n / 1000).toFixed(1) + 'k' : String(n));

// ---------------------------------------------------------------- view style + base map
function buildSegments() {
  const mk = (container, items, current, onPick) => {
    container.innerHTML = '';
    for (const it of items) {
      const b = document.createElement('button');
      b.textContent = it.name;
      b.className = it.id === current ? 'on' : '';
      b.addEventListener('click', () => {
        container.querySelectorAll('button').forEach((x) => x.classList.remove('on'));
        b.classList.add('on');
        onPick(it.id);
      });
      container.appendChild(b);
    }
  };
  mk($('style-seg'), globe.VIEW_STYLES, settings.get('viewStyle'), (id) => { settings.set('viewStyle', id); globe.setViewStyle(id); });
  const bm = Object.entries(BASEMAPS).map(([id, b]) => ({ id, name: b.name.split(' (')[0] }));
  mk($('basemap-seg'), bm, settings.get('basemap'), (id) => { settings.set('basemap', id); globe.setBasemap(id); });
}

// ---------------------------------------------------------------- detail card
let current = null; // { layer, key } or { point: {lat, lon} }

function initCard() {
  $('card-close').addEventListener('click', closeCard);
  $('card-follow').addEventListener('click', () => {
    if (!current || !current.layer) return;
    if (globe.isFollowing()) { globe.unfollow(); setFollowBtn(false); return; }
    const L = M.get(current.layer);
    const key = current.key;
    if (!M.position(current.layer, key)) { toast('Position not available yet'); return; }
    globe.follow(() => M.position(L.id, key), L.followRange || 50000);
    setFollowBtn(true);
  });
  $('card-fly').addEventListener('click', () => {
    if (!current) return;
    if (current.point) { globe.flyTo(current.point.lat, current.point.lon, 80); return; }
    const p = M.position(current.layer, current.key);
    if (!p) { toast('Position not available'); return; }
    const c = Cesium().Cartographic.fromCartesian(p);
    const lat = Cesium().Math.toDegrees(c.latitude);
    const lon = Cesium().Math.toDegrees(c.longitude);
    const h = c.height / 1000;
    globe.flyTo(lat, lon, h > 100 ? h + 2500 : Math.max(60, h + 40));
  });
}

function setFollowBtn(on) {
  const b = $('card-follow');
  b.textContent = on ? 'Stop following' : 'Follow';
  b.classList.toggle('primary', !on);
}

function onTap(hit) {
  if (!hit) return;
  if (hit.layer) {
    const d = M.describe(hit.layer, hit.key);
    if (d) { openItem(hit.layer, hit.key, d); return; }
  }
  if (hit.lat != null) openPoint(hit.lat, hit.lon);
}

function showCard() {
  $('card').hidden = false;
  document.body.classList.add('card-open');
  $('search-results').hidden = true;
}

export function closeCard() {
  globe.unfollow();
  setFollowBtn(false);
  globe.clearMarker('probe');
  if (current && current.layer) M.select(null, null);
  current = null;
  $('card').hidden = true;
  document.body.classList.remove('card-open');
}

function fillCard({ kicker, title, subtitle, rows, text, link, accent }) {
  const card = $('card');
  card.style.setProperty('--card-accent', accent || 'var(--gv-accent)');
  $('card-kicker').textContent = kicker || '';
  $('card-title').textContent = title || '';
  $('card-sub').textContent = subtitle || '';
  setRows(rows);
  const t = $('card-text');
  t.hidden = !text;
  t.textContent = text || '';
  const a = $('card-link');
  if (link && /^https?:\/\//.test(link.href)) { a.hidden = false; a.href = link.href; a.textContent = link.text || 'Source'; } else a.hidden = true;
}

function setRows(rows) {
  const dl = $('card-rows');
  dl.innerHTML = (rows || []).map(([k, v]) => `<dt>${escapeHtml(k)}</dt><dd>${escapeHtml(v)}</dd>`).join('');
}

function openItem(layerId, key, d) {
  if (globe.isFollowing()) { globe.unfollow(); }
  globe.clearMarker('probe');
  const L = M.get(layerId);
  current = { layer: layerId, key, live: !!d.live };
  M.select(layerId, key);
  fillCard({ kicker: L.name, accent: L.color, ...d });
  $('card-follow').hidden = !d.followable;
  setFollowBtn(false);
  showCard();
}

function cardTick() {
  if (!current || !current.layer || !current.live || $('card').hidden) return;
  const d = M.describe(current.layer, current.key);
  if (!d) {
    $('card-sub').textContent = 'No longer in the live feed';
    if (globe.isFollowing()) { globe.unfollow(); setFollowBtn(false); toast('Lost track of this object'); }
    current.live = false;
    return;
  }
  $('card-sub').textContent = d.subtitle || '';
  setRows(d.rows);
}

// Tapping bare globe: show the spot and the weather there (Open-Meteo).
const WMO = {
  0: 'Clear', 1: 'Mostly clear', 2: 'Partly cloudy', 3: 'Overcast', 45: 'Fog', 48: 'Freezing fog',
  51: 'Light drizzle', 53: 'Drizzle', 55: 'Heavy drizzle', 56: 'Freezing drizzle', 57: 'Freezing drizzle',
  61: 'Light rain', 63: 'Rain', 65: 'Heavy rain', 66: 'Freezing rain', 67: 'Freezing rain',
  71: 'Light snow', 73: 'Snow', 75: 'Heavy snow', 77: 'Snow grains', 80: 'Rain showers', 81: 'Rain showers',
  82: 'Violent rain showers', 85: 'Snow showers', 86: 'Heavy snow showers', 95: 'Thunderstorm',
  96: 'Thunderstorm with hail', 99: 'Thunderstorm with hail',
};

async function openPoint(lat, lon) {
  if (globe.isFollowing()) globe.unfollow();
  if (current && current.layer) M.select(null, null);
  current = { point: { lat, lon } };
  globe.setMarker('probe', lat, lon, '#ffffff');
  fillCard({ kicker: 'Point', title: fmt.latlon(lat, lon), subtitle: 'Weather now · Open-Meteo', rows: [['Weather', 'Loading…']] });
  $('card-follow').hidden = true;
  showCard();
  const mine = current;
  const k = `wx.${lat.toFixed(2)},${lon.toFixed(2)}`;
  try {
    let rec = cache.get(k, 600);
    if (!rec) rec = cache.set(k, await fetchJSON(fillUrl(ENDPOINTS.openMeteo, { lat: lat.toFixed(3), lon: lon.toFixed(3) })));
    if (current !== mine) return;
    const c = rec.data.current || {};
    setRows([
      ['Conditions', WMO[c.weather_code] || (c.weather_code != null ? `Code ${c.weather_code}` : '—')],
      ['Temperature', fmt.tempC(c.temperature_2m)],
      ['Feels like', fmt.tempC(c.apparent_temperature)],
      ['Humidity', c.relative_humidity_2m != null ? `${c.relative_humidity_2m}%` : '—'],
      ['Wind', `${fmt.windKmh(c.wind_speed_10m)} ${c.wind_direction_10m != null ? 'from ' + fmt.heading(c.wind_direction_10m) : ''}`.trim()],
      ['Gusts', fmt.windKmh(c.wind_gusts_10m)],
      ['Cloud cover', c.cloud_cover != null ? `${c.cloud_cover}%` : '—'],
      ['Precipitation', fmt.precipMm(c.precipitation)],
      ['Model time', c.time ? `${c.time.replace('T', ' ')} local` : '—'],
    ]);
  } catch (e) {
    if (current !== mine) return;
    setRows([['Weather', `Unavailable (${e.message})`]]);
  }
}

// ---------------------------------------------------------------- search
let lastNominatim = 0;

function initSearch() {
  const form = $('search');
  const input = $('search-input');
  const box = $('search-results');
  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    const q = input.value.trim();
    if (!q) return;
    const ll = q.match(/^\s*(-?\d+(?:\.\d+)?)\s*[,\s]\s*(-?\d+(?:\.\d+)?)\s*$/);
    if (ll) {
      const lat = Number(ll[1]); const lon = Number(ll[2]);
      if (Math.abs(lat) <= 90 && Math.abs(lon) <= 180) { input.blur(); box.hidden = true; globe.flyTo(lat, lon, 60); return; }
    }
    box.hidden = false;
    box.innerHTML = '<div class="r-empty">Searching…</div>';
    try {
      let results = await searchOpenMeteo(q);
      if (!results.length) results = await searchNominatim(q);
      renderResults(results);
    } catch (err) {
      box.innerHTML = `<div class="r-empty">Search failed: ${escapeHtml(err.message)}</div>`;
    }
  });
  input.addEventListener('focus', () => { if (box.innerHTML && input.value) box.hidden = false; });
  document.addEventListener('pointerdown', (e) => { if (!$('topbar').contains(e.target)) box.hidden = true; });
  input.addEventListener('keydown', (e) => { if (e.key === 'Escape') { box.hidden = true; input.blur(); } });
}

async function searchOpenMeteo(q) {
  const j = await fetchJSON(fillUrl(ENDPOINTS.geocodeOpenMeteo, { q }));
  return (j.results || []).map((r) => {
    const fc = r.feature_code || '';
    const h = /^PCL/.test(fc) ? 2500 : fc === 'ADM1' ? 700 : fc === 'ADM2' ? 150 : (r.population || 0) > 1e6 ? 60 : 30;
    return { name: r.name, sub: [r.admin1, r.country].filter(Boolean).join(', '), lat: r.latitude, lon: r.longitude, h };
  });
}

// Nominatim (OpenStreetMap) as a fallback for addresses. Its rules: max 1
// request per second, no search-as-you-type, so we only call it on submit.
async function searchNominatim(q) {
  const wait = 1100 - (Date.now() - lastNominatim);
  if (wait > 0) await new Promise((r) => setTimeout(r, wait));
  lastNominatim = Date.now();
  const j = await fetchJSON(fillUrl(ENDPOINTS.geocodeNominatim, { q }));
  return (Array.isArray(j) ? j : []).map((r) => {
    const bb = (r.boundingbox || []).map(Number);
    const span = bb.length === 4 ? Math.max(Math.abs(bb[1] - bb[0]), Math.abs(bb[3] - bb[2])) : 0.1;
    const h = Math.min(8000, Math.max(2, span * 111 * 1.6));
    const parts = (r.display_name || '').split(', ');
    return { name: parts[0] || r.name, sub: parts.slice(1, 4).join(', ') + ' · OSM', lat: Number(r.lat), lon: Number(r.lon), h };
  });
}

function renderResults(results) {
  const box = $('search-results');
  if (!results.length) { box.innerHTML = '<div class="r-empty">No places found</div>'; return; }
  box.innerHTML = '';
  for (const r of results) {
    const b = document.createElement('button');
    b.innerHTML = `<div class="r-name">${escapeHtml(r.name)}</div><div class="r-sub">${escapeHtml(r.sub)}</div>`;
    b.addEventListener('click', () => {
      box.hidden = true;
      $('search-input').blur();
      globe.flyTo(r.lat, r.lon, r.h);
    });
    box.appendChild(b);
  }
}

// ---------------------------------------------------------------- my location
function initLocate() {
  const btn = $('btn-locate');
  btn.addEventListener('click', () => {
    if (!('geolocation' in navigator)) { toast('Location is not available in this browser'); return; }
    btn.classList.add('busy');
    navigator.geolocation.getCurrentPosition((pos) => {
      btn.classList.remove('busy');
      const { latitude: lat, longitude: lon } = pos.coords;
      globe.setMarker('me', lat, lon, '#3ee6c4');
      globe.flyTo(lat, lon, 40);
    }, (err) => {
      btn.classList.remove('busy');
      const msg = err.code === 1
        ? 'Location permission denied. On iPhone: Settings > Privacy > Location Services > Safari Websites.'
        : err.code === 3 ? 'Location timed out. Try again.' : 'Could not get your location.';
      toast(msg, 6000);
    }, { enableHighAccuracy: false, timeout: 12000, maximumAge: 60000 });
  });
}

// ---------------------------------------------------------------- HUD
function initHud() {
  const hud = $('hud');
  const draw = () => {
    const v = globe.getView();
    const now = new Date();
    const utc = now.toISOString().slice(11, 19);
    const alt = settings.get('units') === 'imperial' ? `${Math.round(v.heightKm * 0.621371).toLocaleString()} mi` : `${Math.round(v.heightKm).toLocaleString()} km`;
    hud.innerHTML = `UTC <b>${utc}</b> · <b>${fmt.latlon(v.lat, v.lon)}</b> · ALT <b>${alt}</b>${globe.isFollowing() ? ' · <b style="color:var(--gv-accent)">FOLLOWING</b>' : ''}`;
  };
  viewer.camera.percentageChanged = 0.02;
  viewer.camera.changed.addEventListener(draw);
  setInterval(draw, 1000);
  draw();
}

// ---------------------------------------------------------------- settings
function initSettings() {
  $('btn-settings').addEventListener('click', openSettings);
  $('settings-close').addEventListener('click', closeSettings);
  $('settings').addEventListener('click', (e) => { if (e.target.id === 'settings') closeSettings(); });
}
function closeSettings() { $('settings').hidden = true; }

function openSettings() {
  const body = $('settings-body');
  body.innerHTML = '';
  const S = settings.all();
  const sec = (title) => { const h = document.createElement('h2'); h.className = 'sec-title'; h.textContent = title; body.appendChild(h); };
  const field = (labelHtml, control, stack = false) => {
    const d = document.createElement('div');
    d.className = 'field' + (stack ? ' stack' : '');
    const l = document.createElement('label');
    l.innerHTML = labelHtml;
    d.appendChild(l);
    d.appendChild(control);
    body.appendChild(d);
    return d;
  };
  const select = (opts, value, onChange) => {
    const s = document.createElement('select');
    for (const [v, t] of opts) { const o = document.createElement('option'); o.value = v; o.textContent = t; if (String(v) === String(value)) o.selected = true; s.appendChild(o); }
    s.addEventListener('change', () => onChange(s.value));
    return s;
  };
  const toggle = (checked, onChange) => {
    const l = document.createElement('label');
    l.className = 'switch';
    l.innerHTML = `<input type="checkbox" ${checked ? 'checked' : ''}><span></span>`;
    l.querySelector('input').addEventListener('change', (e) => onChange(e.target.checked));
    return l;
  };
  const button = (text, onClick, cls = '') => { const b = document.createElement('button'); b.className = 'btn ' + cls; b.textContent = text; b.addEventListener('click', onClick); return b; };
  const change = (key, value) => {
    if (!settings.set(key, value)) toast('Could not save (browser storage blocked). Works until you reload.');
    M.settingChanged(key);
  };

  // General
  sec('General');
  field('Units', select([['imperial', 'Imperial (ft, mph, °F)'], ['metric', 'Metric (m, km/h, °C)']], S.units, (v) => { change('units', v); cardTick(); }));
  field('Smooth aircraft motion<small>Estimates position between updates</small>', toggle(S.smoothMotion, (v) => change('smoothMotion', v)));

  // Start location
  sec('Start location');
  const st = S.start;
  const info = document.createElement('div');
  info.className = 'about';
  info.textContent = `${st.name || 'Custom'} · ${fmt.latlon(Number(st.lat), Number(st.lon))} · ${Math.round(st.heightKm)} km up`;
  field('Opens at', info, true);
  const row = document.createElement('div');
  row.className = 'inline';
  row.appendChild(button('Use current view', () => {
    const v = globe.getView();
    change('start', { name: 'My view', lat: +v.lat.toFixed(4), lon: +v.lon.toFixed(4), heightKm: Math.round(v.heightKm) });
    toast('Start location saved');
    openSettings();
  }));
  row.appendChild(button('Reset to Georgia', () => { change('start', { ...DEFAULT_START }); openSettings(); }));
  field('', row, true);

  // Refresh intervals
  sec('Refresh every (seconds)');
  for (const L of LAYERS) {
    const lim = INTERVALS[L.id];
    if (!lim) continue;
    const inp = document.createElement('input');
    inp.type = 'number'; inp.inputMode = 'numeric'; inp.min = lim.min; inp.step = 10;
    inp.value = settings.interval(L.id);
    inp.addEventListener('change', () => {
      const v = Math.max(lim.min, Math.round(Number(inp.value) || lim.def));
      inp.value = v;
      settings.setIn('intervals', L.id, v);
    });
    field(`${escapeHtml(L.name)}<small>Minimum ${lim.min}s${L.id === 'satellites' ? ' (CelesTrak rule)' : ''}</small>`, inp);
  }

  // Data options
  sec('Data options');
  field('Satellite group', select(Object.entries(SAT_GROUPS), S.satGroup, (v) => change('satGroup', v)));
  field('Earthquake feed', select([
    ['all_hour', 'All, past hour'], ['all_day', 'All, past day'], ['1.0_day', 'M1+, past day'], ['2.5_day', 'M2.5+, past day'],
    ['2.5_week', 'M2.5+, past week'], ['4.5_week', 'M4.5+, past week'], ['significant_month', 'Significant, past month'],
  ], S.quakeFeed, (v) => change('quakeFeed', v)));
  const days = document.createElement('input');
  days.type = 'number'; days.min = 1; days.max = 365; days.value = S.eventDays;
  days.addEventListener('change', () => { const v = Math.max(1, Math.min(365, Math.round(Number(days.value) || 30))); days.value = v; change('eventDays', v); });
  field('Fires & events: past days', days);

  // Flight relay
  sec('Flight data relay (optional)');
  const relay = document.createElement('input');
  relay.type = 'url'; relay.placeholder = 'https://your-relay.example.workers.dev/?url=';
  relay.value = S.flightRelay || '';
  relay.addEventListener('change', () => change('flightRelay', relay.value.trim()));
  field('Relay URL<small>Free flight sources may block direct browser access. A relay you control fixes that. See README.</small>', relay, true);

  // API keys
  sec('API keys (for future layers)');
  const note = document.createElement('div');
  note.className = 'about';
  note.textContent = 'Stored only in this browser on this device. No current layer needs a key.';
  body.appendChild(note);
  const list = document.createElement('div');
  list.className = 'key-list';
  const keys = apiKeys.all();
  for (const name of Object.keys(keys)) {
    const it = document.createElement('div');
    it.className = 'key-item';
    it.innerHTML = `<span>${escapeHtml(name)}: ••••${escapeHtml(String(keys[name]).slice(-4))}</span>`;
    it.appendChild(button('Remove', () => { apiKeys.set(name, ''); openSettings(); }, 'danger'));
    list.appendChild(it);
  }
  body.appendChild(list);
  const add = document.createElement('div');
  add.className = 'inline';
  add.innerHTML = '<input type="text" placeholder="Name, e.g. opensky" aria-label="Key name"><input type="password" placeholder="Key" aria-label="Key value" autocomplete="off">';
  add.appendChild(button('Save key', () => {
    const [n, v] = add.querySelectorAll('input');
    if (!n.value.trim() || !v.value) { toast('Enter a name and a key'); return; }
    if (!apiKeys.set(n.value.trim(), v.value)) toast('Could not save: browser storage is blocked');
    openSettings();
  }));
  field('', add, true);

  // Sources
  sec('Data sources & credits');
  const ul = document.createElement('ul');
  ul.className = 'about';
  const credits = [
    ...LAYERS.map((l) => l.attribution),
    ...Object.values(BASEMAPS).map((b) => b.credit),
    'Point weather: Open-Meteo.com (CC BY 4.0)',
    'Place search: Open-Meteo Geocoding (GeoNames) and OpenStreetMap Nominatim (© OpenStreetMap contributors, ODbL)',
    'Globe: CesiumJS (Apache 2.0)',
  ];
  ul.innerHTML = credits.map((c) => `<li>${escapeHtml(c)}</li>`).join('');
  body.appendChild(ul);
  const disclaim = document.createElement('p');
  disclaim.className = 'about';
  disclaim.textContent = 'Public feeds can be late, incomplete or wrong. Not for navigation or safety decisions.';
  body.appendChild(disclaim);

  sec('Reset');
  const r = document.createElement('div');
  r.className = 'inline';
  r.appendChild(button('Reset all settings', () => {
    if (!confirm('Reset all GodView settings on this device?')) return;
    settings.reset();
    location.reload();
  }, 'danger'));
  field('', r, true);
  const ver = document.createElement('p');
  ver.className = 'about';
  ver.textContent = `${APP.name} ${APP.version}`;
  body.appendChild(ver);

  $('settings').hidden = false;
}
