// All on-screen controls: grouped layer sheet, detail card, "What's here"
// briefing, search, my-location, settings and the coordinate read-out (HUD).

import { BASEMAPS, ENDPOINTS, INTERVALS, DEFAULT_START, APP, GROUPS, KEYS } from './config.js';
import { settings, apiKeys } from './core/settings.js';
import { fmt, escapeHtml } from './core/units.js';
import { fetchJSON, fillUrl, cache } from './core/net.js';
import * as globe from './globe.js';
import { buildBrief } from './brief.js';
import * as watch from './watch.js';
import { MODES, GROUP_COLORS, applyMode } from './modes.js';
import { initStatus } from './status.js';
import { initHint } from './hint.js';

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
  initBrief();
  initSettings();
  initHud();
  initStatus({ manager: M, layers: LAYERS, open: (lat, lon, label) => openBrief(lat, lon, label === 'Here' ? 'Where you are' : label) });
  initHint();
  watch.initWatch({ toast });
  globe.onTap(onTap);
  M.onStatus((id) => {
    if (id === 'tick') { refreshAllStatus(); cardTick(); return; }
    updateLayer(id);
    updateGroup(M.get(id)?.group);
    updateChips();
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
function groupOpen(g) { const o = settings.get('groupsOpen') || {}; return o[g] ?? false; }
function setGroupOpen(g, on) { settings.set('groupsOpen', { ...(settings.get('groupsOpen') || {}), [g]: on }); }

function buildSheet() {
  const list = $('layer-list');
  list.innerHTML = '';
  for (const g of GROUPS) {
    const members = LAYERS.filter((l) => l.group === g.id);
    if (!members.length) continue;
    const sec = document.createElement('section');
    sec.className = 'group';
    sec.id = 'group-' + g.id;
    sec.dataset.open = String(groupOpen(g.id));
    sec.innerHTML = `
      <div class="group-head">
        <button class="group-toggle" aria-expanded="${groupOpen(g.id)}">
          <svg class="chev" viewBox="0 0 24 24"><path d="M9 6l6 6-6 6" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"/></svg>
          <span class="g-name">${escapeHtml(g.name)}</span>
          <span class="g-count"></span>
        </button>
        <button class="g-all" data-on="1">All on</button>
        <button class="g-all" data-on="0">Off</button>
      </div>
      <div class="group-body"></div>`;
    sec.querySelector('.group-toggle').addEventListener('click', () => {
      const open = sec.dataset.open !== 'true';
      sec.dataset.open = String(open);
      sec.querySelector('.group-toggle').setAttribute('aria-expanded', String(open));
      setGroupOpen(g.id, open);
    });
    sec.style.setProperty('--group', GROUP_COLORS[g.id] || '#8b97a5');
    sec.querySelectorAll('.g-all').forEach((b) => b.addEventListener('click', () => {
      setTimeout(toCustom, members.length * 260);
      const on = b.dataset.on === '1';
      // Turn on in a staggered way so a whole group does not fetch at once.
      members.forEach((L, i) => {
        if (on && L.needsKey && !apiKeys.get(L.needsKey)) return;
        setTimeout(() => M.enable(L.id, on), on ? i * 250 : 0);
      });
    }));
    const body = sec.querySelector('.group-body');
    for (const L of members) {
      const row = document.createElement('div');
      row.className = 'layer-row';
      row.id = 'row-' + L.id;
      row.dataset.search = `${L.name} ${g.name} ${L.attribution || ''}`.toLowerCase();
      row.style.setProperty('--chip', L.color);
      row.innerHTML = `
        <div class="ico">${L.icon}</div>
        <div class="info">
          <div class="name"><span>${escapeHtml(L.name)}</span><i class="dot"></i><span class="count"></span></div>
          <div class="stat"></div>
        </div>
        <label class="switch" aria-label="${escapeHtml(L.name)}"><input type="checkbox"><span></span></label>`;
      row.querySelector('input').addEventListener('change', (e) => { M.enable(L.id, e.target.checked); toCustom(); });
      body.appendChild(row);
      updateLayer(L.id);
    }
    list.appendChild(sec);
    updateGroup(g.id);
  }

  // Filter box
  $('layer-filter').addEventListener('input', (e) => {
    const q = e.target.value.trim().toLowerCase();
    for (const sec of list.querySelectorAll('.group')) {
      let any = false;
      for (const row of sec.querySelectorAll('.layer-row')) {
        const hit = !q || row.dataset.search.includes(q);
        row.hidden = !hit;
        any = any || hit;
      }
      sec.hidden = !any;
      sec.classList.toggle('filtering', !!q);
    }
  });

  // Open / close the sheet: tap the handle or the "Layers" chip, or swipe.
  const sheet = $('sheet');
  const handle = $('sheet-handle');
  const setState = (s) => { sheet.dataset.state = s; };
  handle.addEventListener('click', () => setState(sheet.dataset.state === 'open' ? 'peek' : 'open'));
  $('chip-all').addEventListener('click', () => setState(sheet.dataset.state === 'open' ? 'peek' : 'open'));
  // Drag the handle: the sheet follows your finger, then snaps open or closed.
  let y0 = null; let t0 = 0;
  handle.addEventListener('touchstart', (e) => { y0 = e.touches[0].clientY; t0 = Date.now(); sheet.classList.add('dragging'); }, { passive: true });
  handle.addEventListener('touchmove', (e) => {
    if (y0 == null) return;
    const dy = e.touches[0].clientY - y0;
    sheet.style.transform = `translateY(${sheet.dataset.state === 'open' ? Math.max(0, dy) : Math.min(0, dy) * 0.25}px)`;
  }, { passive: true });
  handle.addEventListener('touchend', (e) => {
    if (y0 == null) return;
    const dy = e.changedTouches[0].clientY - y0; const v = dy / Math.max(1, Date.now() - t0);
    y0 = null; sheet.classList.remove('dragging'); sheet.style.transform = '';
    if (dy < -25 || v < -0.4) setState('open'); else if (dy > 60 || v > 0.4) setState('peek');
  });
  $('chips').addEventListener('touchstart', (e) => { y0 = e.touches[0].clientY; t0 = Date.now(); }, { passive: true });
  $('chips').addEventListener('touchend', (e) => {
    if (y0 == null) return;
    const dy = e.changedTouches[0].clientY - y0; y0 = null;
    if (dy < -40) setState('open'); else if (dy > 40) setState('peek');
  });
  buildModes();
  updateChips();
}

// ---------------------------------------------------------------- modes
function buildModes() {
  const box = $('chips-on');
  box.innerHTML = '';
  for (const m of MODES) {
    const b = document.createElement('button');
    b.className = 'mode';
    b.id = 'mode-' + m.id;
    b.style.setProperty('--mode', m.color);
    b.innerHTML = `${m.icon}<span>${escapeHtml(m.name)}</span>`;
    b.addEventListener('click', () => {
      const mode = applyMode(M, LAYERS, settings, apiKeys, m.id);
      markMode();
      if (mode.fly) {
        // "Around me": go to where you are (or your first place / start).
        const s = settings.get('start');
        navigator.permissions?.query({ name: 'geolocation' }).then((p) => {
          if (p.state === 'granted') locate((la, lo) => globe.flyTo(la, lo, 220)); else globe.flyTo(Number(s.lat), Number(s.lon), 300);
        }).catch(() => globe.flyTo(Number(s.lat), Number(s.lon), 300));
      }
      toast(`${mode.name}`, 1500);
    });
    box.appendChild(b);
  }
  markMode();
  settings.onChange((k) => { if (k === 'mode' || k === '*') markMode(); });
}
function markMode() {
  const cur = settings.get('mode') || 'custom';
  for (const m of MODES) $('mode-' + m.id)?.classList.toggle('on', m.id === cur);
}
// A hand-made change turns the mode into "My mix" and remembers it.
function toCustom() {
  settings.set('customEnabled', { ...settings.get('enabled') });
  if (settings.get('mode') !== 'custom') { settings.set('mode', 'custom'); markMode(); }
}

// The "All layers" tile shows how many are on and flags problems.
function updateChips() {
  const on = LAYERS.filter((L) => M.state[L.id].enabled);
  const bad = on.some((L) => ['error', 'limited', 'needs-key'].includes(M.state[L.id].status));
  $('chip-all-n').textContent = `${on.length}/${LAYERS.length}`;
  $('chip-all').classList.toggle('bad', bad);
}
const shortName = (n) => n.replace(/^Satellites: /, 'Sats: ').replace(/ \(.*\)$/, '');

function updateGroup(gid) {
  if (!gid) return;
  const sec = $('group-' + gid);
  if (!sec) return;
  const members = LAYERS.filter((l) => l.group === gid);
  const on = members.filter((l) => M.state[l.id].enabled);
  const items = on.reduce((a, l) => a + (M.state[l.id].count || 0), 0);
  const errs = on.filter((l) => M.state[l.id].status === 'error').length;
  sec.querySelector('.g-count').textContent = `${on.length}/${members.length} on${items ? ' · ' + compact(items) : ''}${errs ? ` · ${errs} !` : ''}`;
}

function statusText(L, st) {
  if (!st.enabled) return { text: L.needsKey && !apiKeys.get(L.needsKey) ? `Off · needs a free key (${KEYS[L.needsKey]?.name || L.needsKey})` : 'Off', cls: '' };
  if (st.status === 'needs-key') return { text: st.message, cls: 'warn', key: true };
  if (st.status === 'loading' && !st.updatedAt) return { text: 'Loading…', cls: '' };
  if (st.status === 'error') return { text: st.message + (st.updatedAt ? ` · last good ${fmt.ago(st.updatedAt)}` : ''), cls: 'err', retry: true };
  if (st.status === 'limited') return { text: st.message + ' · will retry', cls: 'warn', retry: true };
  const parts = [st.updatedAt ? `Updated ${fmt.ago(st.updatedAt)}` : 'Loading…'];
  if (st.via === 'relay') parts.push('via relay');
  if (st.note) parts.push(st.note);
  return { text: parts.join(' · '), cls: '' };
}

function updateLayer(id) {
  const L = LAYERS.find((l) => l.id === id);
  const st = M.state[id];
  if (!L || !st) return;
  const row = $('row-' + id);
  if (!row) return;
  const dotCls = 'dot ' + (st.enabled ? (st.busy ? 'loading' : (st.status === 'needs-key' ? 'limited' : st.status)) : '');
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
  if (s.key) {
    const b = document.createElement('button');
    b.className = 'retry';
    b.textContent = 'Add key';
    b.addEventListener('click', openSettings);
    stat.appendChild(b);
  }
}
function refreshAllStatus() {
  for (const L of LAYERS) if (M.state[L.id].enabled && M.state[L.id].status === 'ok') updateLayer(L.id);
}
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
let current = null; // { layer, key } | { point } | { brief }
let audio = null;

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
    const h = c.height / 1000;
    globe.flyTo(Cesium().Math.toDegrees(c.latitude), Cesium().Math.toDegrees(c.longitude), h > 100 ? h + 2500 : Math.max(60, h + 40));
  });
  $('card-play').addEventListener('click', () => {
    if (audio && !audio.paused) { stopAudio(); return; }
    const src = $('card-play').dataset.src;
    if (!src) return;
    stopAudio();
    audio = new Audio(src);
    audio.play().then(() => { $('card-play').textContent = 'Stop'; }).catch(() => toast('This stream could not be played'));
  });
}

function stopAudio() {
  if (audio) { audio.pause(); audio.src = ''; audio = null; }
  $('card-play').textContent = 'Play';
}

function setFollowBtn(on) {
  const b = $('card-follow');
  b.textContent = on ? 'Stop following' : 'Follow';
  b.classList.toggle('primary', !on);
}

function onTap(hit) {
  if (!hit) return;
  if (hit.lat != null && !hit.layer && watch.handleGlobeTap(hit.lat, hit.lon)) return; // adding a place
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
  $('card').classList.remove('brief');
  document.body.classList.remove('card-open');
}

function fillCard({ kicker, title, subtitle, rows, text, link, accent, image, say, credit, links, stats }) {
  const card = $('card');
  card.classList.remove('brief');
  card.style.setProperty('--card-accent', accent || 'var(--gv-accent)');
  $('card-kicker').textContent = kicker || '';
  $('card-title').textContent = title || '';
  setSay(say);
  setCredit(credit);
  $('card-sub').textContent = subtitle || '';
  setRows(rows);
  setText(text);
  setImage(image);
  $('card-brief').innerHTML = '';
  peopleExtras({ links, stats }); // People & records: extra links and big numbers
  const a = $('card-link');
  if (link && /^https?:\/\//.test(link.href)) { a.hidden = false; a.href = link.href; a.textContent = link.text || 'Source'; } else a.hidden = true;
  $('card-fly').hidden = false;
}

function setSay(t) { const e = $('card-say'); e.hidden = !t; e.textContent = t || ''; }
function setCredit(t, href) {
  const e = $('card-credit');
  e.hidden = !t;
  e.innerHTML = !t ? '' : (href && /^https:\/\//.test(href) ? `<a href="${escapeHtml(href)}" target="_blank" rel="noopener">${escapeHtml(t)}</a>` : escapeHtml(t));
}
function setText(text) { const t = $('card-text'); t.hidden = !text; t.textContent = text || ''; }
function setImage(src) {
  const img = $('card-img');
  if (src && /^https:\/\//.test(src)) {
    img.hidden = false;
    img.onerror = () => { img.hidden = true; };
    img.src = src + (src.includes('511ga.org') ? (src.includes('?') ? '&' : '?') + 't=' + Date.now() : '');
  } else { img.hidden = true; img.removeAttribute('src'); }
}
function setRows(rows) {
  $('card-rows').innerHTML = (rows || []).map(([k, v]) => `<dt>${escapeHtml(k)}</dt><dd>${escapeHtml(v)}</dd>`).join('');
}
function addRows(rows) {
  $('card-rows').insertAdjacentHTML('beforeend', (rows || []).map(([k, v]) => `<dt>${escapeHtml(k)}</dt><dd>${escapeHtml(v)}</dd>`).join(''));
}

function openItem(layerId, key, d) {
  if (globe.isFollowing()) globe.unfollow();
  globe.clearMarker('probe');
  stopAudio();
  const L = M.get(layerId);
  current = { layer: layerId, key, live: !!d.live };
  M.select(layerId, key);
  fillCard({ kicker: L.name, accent: L.color, ...d });
  $('card-follow').hidden = !d.followable;
  const play = $('card-play');
  play.hidden = !d.audio;
  play.dataset.src = d.audio || '';
  setFollowBtn(false);
  showCard();
  // Extra details loaded on demand (tide readings, article summary, ...)
  if (M.get(layerId).details) {
    const mine = current;
    addRows([['', 'Loading details…']]);
    M.details(layerId, key).then((x) => {
      if (current !== mine) return;
      setRows(d.rows);
      if (current) current.extraRows = Array.isArray(x) ? x : (x?.rows || []);
      if (Array.isArray(x)) addRows(x);
      else if (x) { if (x.say) setSay(x.say); if (x.rows) addRows(x.rows); if (x.text) setText(x.text); if (x.credit) setCredit(x.credit, x.extraLink); if (x.image) setImage(x.image); }
      if (x && (x.links || x.stats)) peopleExtras(x, true); // People & records
    }).catch((e) => { if (current === mine) { setRows(d.rows); addRows([['Details', `Not available (${e.message})`]]); } });
  }
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
  if (current.extraRows) addRows(current.extraRows);
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
  stopAudio();
  current = { point: { lat, lon } };
  globe.setMarker('probe', lat, lon, '#ffffff');
  fillCard({ kicker: 'Point', title: fmt.latlon(lat, lon), subtitle: 'Weather now · Open-Meteo', rows: [['Weather', 'Loading…']] });
  $('card-follow').hidden = true;
  $('card-play').hidden = true;
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
  peoplePointInfo(lat, lon, mine); // People & records: "Who's in charge here" for the tapped spot
}

// ---------------------------------------------------------------- "What's here" briefing
function initBrief() {
  $('btn-brief').addEventListener('click', () => {
    const v = globe.getView();
    openBrief(v.lat, v.lon, 'View centre');
  });
}

async function openBrief(lat, lon, label) {
  if (globe.isFollowing()) globe.unfollow();
  if (current && current.layer) M.select(null, null);
  stopAudio();
  current = { brief: { lat, lon } };
  globe.setMarker('probe', lat, lon, '#3ee6c4');
  fillCard({ kicker: "What's here", title: label, subtitle: fmt.latlon(lat, lon), rows: [] });
  $('card').classList.add('brief');
  $('card-follow').hidden = true;
  $('card-play').hidden = true;
  $('card-fly').hidden = true;
  const box = $('card-brief');
  box.innerHTML = '<p class="muted">Gathering…</p>';
  const me = document.createElement('button');
  me.className = 'btn';
  me.textContent = 'Use my location instead';
  me.addEventListener('click', () => locate((la, lo) => openBrief(la, lo, 'My location')));
  showCard();
  const mine = current;
  const [sections, server] = await Promise.all([buildBrief(M, LAYERS, { lat, lon }), watch.pointBrief(lat, lon)]);
  if (current !== mine) return;
  if (server) {
    // The watch service checked this point the same way it watches saved places.
    const lines = [];
    for (const e of server.events || []) lines.push(`${e.sev === 'act now' ? 'ACT NOW: ' : e.sev === 'heads-up' ? 'Heads-up: ' : ''}${e.text}${e.todo ? ' ' + e.todo : ''}`);
    if (server.outlook) lines.push(`Storm outlook: ${server.outlook}.`);
    for (const x of server.sky || []) lines.push(x);
    for (const d of server.todo || []) lines.push(`Do: ${d}`);
    if (!lines.length) lines.push('Nothing to flag here right now.');
    sections.unshift({ title: 'Watch check', lines });
  }
  box.innerHTML = sections.map((s) => `<h4>${escapeHtml(s.title)}</h4><ul>${s.lines.map((l) => `<li>${escapeHtml(l)}</li>`).join('')}</ul>`).join('');
  if (label !== 'My location') box.appendChild(me);
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
function locate(onOk) {
  const btn = $('btn-locate');
  if (!('geolocation' in navigator)) { toast('Location is not available in this browser'); return; }
  btn.classList.add('busy');
  navigator.geolocation.getCurrentPosition((pos) => {
    btn.classList.remove('busy');
    onOk(pos.coords.latitude, pos.coords.longitude);
  }, (err) => {
    btn.classList.remove('busy');
    const msg = err.code === 1
      ? 'Location permission denied. On iPhone: Settings > Privacy > Location Services > Safari Websites.'
      : err.code === 3 ? 'Location timed out. Try again.' : 'Could not get your location.';
    toast(msg, 6000);
  }, { enableHighAccuracy: false, timeout: 12000, maximumAge: 60000 });
}

function initLocate() {
  $('btn-locate').addEventListener('click', () => locate((lat, lon) => {
    globe.setMarker('me', lat, lon, '#3ee6c4');
    globe.flyTo(lat, lon, 40);
  }));
}

// ---------------------------------------------------------------- HUD
function initHud() {
  const hud = $('hud');
  const draw = () => {
    const v = globe.getView();
    const utc = new Date().toISOString().slice(11, 19);
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
  let target = body;
  const sec = (title) => { const h = document.createElement('h2'); h.className = 'sec-title'; h.textContent = title; body.appendChild(h); target = body; };
  const field = (labelHtml, control, stack = false) => {
    const d = document.createElement('div');
    d.className = 'field' + (stack ? ' stack' : '');
    const l = document.createElement('label');
    l.innerHTML = labelHtml;
    d.appendChild(l);
    d.appendChild(control);
    target.appendChild(d);
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

  sec('General');
  field('Units', select([['imperial', 'Imperial (ft, mph, °F)'], ['metric', 'Metric (m, km/h, °C)']], S.units, (v) => { change('units', v); cardTick(); }));
  field('Smooth aircraft motion<small>Estimates position between updates</small>', toggle(S.smoothMotion, (v) => change('smoothMotion', v)));

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

  sec('API keys (free, optional)');
  const note = document.createElement('div');
  note.className = 'about';
  note.textContent = 'Stored only in this browser on this device. A key is sent only to its own service (through your data relay when that service needs it).';
  body.appendChild(note);
  for (const [name, k] of Object.entries(KEYS)) {
    const wrap = document.createElement('div');
    wrap.className = 'inline';
    const inp = document.createElement('input');
    inp.type = 'password'; inp.autocomplete = 'off'; inp.placeholder = apiKeys.get(name) ? `Saved (…${apiKeys.get(name).slice(-4)})` : 'Paste key';
    inp.setAttribute('aria-label', k.name);
    wrap.appendChild(inp);
    wrap.appendChild(button('Save', () => {
      if (!inp.value.trim()) { toast('Paste the key first'); return; }
      if (!apiKeys.set(name, inp.value.trim())) { toast('Could not save: browser storage is blocked'); return; }
      toast(`${k.name} saved`);
      M.settingChanged('key:' + name);
      openSettings();
    }));
    if (apiKeys.get(name)) wrap.appendChild(button('Remove', () => { apiKeys.set(name, ''); openSettings(); }, 'danger'));
    const users = LAYERS.filter((l) => l.needsKey === name || (l.usesKeys || []).includes(name)).map((l) => l.name).join(', ');
    field(`${escapeHtml(k.name)}<small>Used by: ${escapeHtml(users)} · <a href="${k.url}" target="_blank" rel="noopener">get a key</a></small>`, wrap, true);
  }
  const others = Object.keys(apiKeys.all()).filter((n) => !KEYS[n]);
  if (others.length) {
    const list = document.createElement('div');
    list.className = 'key-list';
    for (const name of others) {
      const it = document.createElement('div');
      it.className = 'key-item';
      it.innerHTML = `<span>${escapeHtml(name)}: ••••</span>`;
      it.appendChild(button('Remove', () => { apiKeys.set(name, ''); openSettings(); }, 'danger'));
      list.appendChild(it);
    }
    body.appendChild(list);
  }

  sec('Data relay');
  const relay = document.createElement('input');
  relay.type = 'url'; relay.placeholder = 'https://your-relay.example.workers.dev/?url=';
  relay.value = S.dataRelay || '';
  relay.addEventListener('change', () => change('dataRelay', relay.value.trim()));
  field('Relay URL<small>Some public feeds (flights, FAA, buoys, hurricanes, Georgia 511…) do not allow web pages to read them directly. Your own relay forwards only an approved list of hosts. Leave blank to use the built-in one.</small>', relay, true);

  sec('Data options');
  field('Earthquake feed', select([
    ['all_hour', 'All, past hour'], ['all_day', 'All, past day'], ['1.0_day', 'M1+, past day'], ['2.5_day', 'M2.5+, past day'],
    ['2.5_week', 'M2.5+, past week'], ['4.5_week', 'M4.5+, past week'], ['significant_month', 'Significant, past month'],
  ], S.quakeFeed, (v) => change('quakeFeed', v)));
  const days = document.createElement('input');
  days.type = 'number'; days.min = 1; days.max = 365; days.value = S.eventDays;
  days.addEventListener('change', () => { const v = Math.max(1, Math.min(365, Math.round(Number(days.value) || 30))); days.value = v; change('eventDays', v); });
  field('Fires & events: past days', days);

  sec('Refresh every (seconds)');
  const det = document.createElement('details');
  det.innerHTML = '<summary class="btn">Show refresh settings</summary>';
  body.appendChild(det);
  target = det;
  for (const L of LAYERS) {
    const lim = INTERVALS[L.id];
    if (!lim || lim.def === 0) continue;
    const inp = document.createElement('input');
    inp.type = 'number'; inp.inputMode = 'numeric'; inp.min = lim.min; inp.step = 10;
    inp.value = settings.interval(L.id);
    inp.addEventListener('change', () => {
      const v = Math.max(lim.min, Math.round(Number(inp.value) || lim.def));
      inp.value = v;
      settings.setIn('intervals', L.id, v);
    });
    field(`${escapeHtml(L.name)}<small>Minimum ${lim.min}s</small>`, inp);
  }
  target = body;

  sec('Data sources & credits');
  const ul = document.createElement('ul');
  ul.className = 'about';
  const credits = [
    ...LAYERS.map((l) => l.attribution),
    ...Object.values(BASEMAPS).map((b) => b.credit),
    'Point weather: Open-Meteo.com (CC BY 4.0)',
    'Place search: Open-Meteo Geocoding (GeoNames) and OpenStreetMap Nominatim (© OpenStreetMap contributors, ODbL)',
    'Globe: CesiumJS (Apache 2.0); orbits: satellite.js (MIT)',
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
  ver.textContent = `${APP.name} ${APP.version} · ${LAYERS.length} layers`;
  body.appendChild(ver);

  $('settings').hidden = false;
}

// ---------------------------------------------------------------- People & records
// Cards from the people-* layers can carry `links` (several official links) and
// `stats` (a few big numbers). Layers with pointInfo(ctx, lat, lon) add rows to
// the card for a tapped bare spot while they are switched on.
function peopleExtras({ links, stats } = {}, append = false) {
  let box = $('card-extra');
  if (!box) {
    box = document.createElement('div');
    box.id = 'card-extra';
    box.className = 'card-extra';
    $('card-text').before(box);
  }
  if (!append) box.innerHTML = '';
  if (stats && stats.length) {
    box.insertAdjacentHTML('beforeend', `<div class="gv-stats">${stats.map((s) => `<div><b>${escapeHtml(s.value)}</b><span>${escapeHtml(s.label)}</span></div>`).join('')}</div>`);
  }
  const ok = (links || []).filter((l) => l && /^(https:\/\/|mailto:)/.test(l.href || ''));
  if (ok.length) {
    box.insertAdjacentHTML('beforeend', `<div class="gv-links">${ok.map((l) => `<a href="${escapeHtml(l.href)}" target="_blank" rel="noopener">${escapeHtml(l.text || 'Link')}</a>`).join('')}</div>`);
  }
  box.hidden = !box.innerHTML;
}

async function peoplePointInfo(lat, lon, mine) {
  for (const L of LAYERS) {
    if (!L.pointInfo || !M.state[L.id].enabled || !M.ctx[L.id]) continue;
    try {
      const x = await L.pointInfo(M.ctx[L.id], lat, lon);
      if (current !== mine || !x) return;
      addRows([[x.title || L.name, ''], ...(x.rows || [])]);
      peopleExtras({ links: x.links }, true);
    } catch (e) {
      if (current === mine) addRows([[L.name, `Not available (${e.message})`]]);
    }
  }
}
