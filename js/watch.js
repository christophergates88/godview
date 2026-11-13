// GodView Watch in the app: connection, Places, Alerts inbox, Brief, timeline.
// Talks to the godview-watch Cloudflare Worker. If it is not set up, the map
// keeps working and this screen says exactly what to do.

import { ENDPOINTS } from './config.js';
import { fetchJSON, fillUrl } from './core/net.js';
import { escapeHtml, fmt } from './core/units.js';
import { settings } from './core/settings.js';
import * as globe from './globe.js';
import { renderReportsTab, presetPoint } from './reports.js';

const KEY = 'godview.watch.v1';
const $ = (id) => document.getElementById(id);
const SEV = { 1: ['info', 'Info'], 2: ['heads', 'Heads-up'], 3: ['act', 'Act now'] };
const KINDS = [['home', 'Home'], ['family', 'Family'], ['property', 'Property'], ['waypoint', 'Route'], ['client', 'Client']];

let conn = null;          // { token, host }
let data = { places: [], status: {}, settings: {} };
let tab = 'places';
let detailId = null;
let addMode = null;       // set while waiting for a globe tap
let toastFn = () => {};
let lastStatus = null;

// ---------------------------------------------------------------- connection
function load() { try { conn = JSON.parse(localStorage.getItem(KEY) || 'null'); } catch { conn = null; } }
function save(c) { conn = c; try { if (c) localStorage.setItem(KEY, JSON.stringify(c)); else localStorage.removeItem(KEY); } catch { /* storage blocked */ } }
export const connected = () => !!(conn && conn.token && conn.host);

// One-time setup link: #watch=<token>@<host>. Stored, then removed from the address bar.
export function consumeHash() {
  // main.js already read (and removed) the hash before the globe loaded.
  const h = window.__gvHash || location.hash || '';
  window.__gvHash = '';
  let route = null;
  const m = h.match(/^#watch=([^@]+)@([a-z0-9.-]+\.workers\.dev)$/i);
  if (m) {
    save({ token: decodeURIComponent(m[1]), host: m[2].toLowerCase() });
    route = { open: 'places', toast: 'Watch connected on this device.' };
  } else if (/^#place=/.test(h)) route = { open: 'places', place: decodeURIComponent(h.slice(7)) };
  else if (h === '#brief') route = { open: 'brief' };
  if (h) history.replaceState(null, '', location.pathname + location.search);
  return route;
}

export async function api(path, { method = 'GET', body, timeoutMs = 20000 } = {}) {
  if (!connected()) throw new Error('not set up');
  const ac = new AbortController();
  const t = setTimeout(() => ac.abort(), timeoutMs);
  try {
    const res = await fetch(`https://${conn.host}${path}`, {
      method, signal: ac.signal, cache: 'no-store',
      headers: { Authorization: `Bearer ${conn.token}`, ...(body ? { 'Content-Type': 'application/json' } : {}) },
      body: body ? JSON.stringify(body) : undefined,
    });
    const j = await res.json().catch(() => ({}));
    if (res.status === 401) throw new Error('the saved key was refused');
    if (!res.ok) throw new Error(j.error || `HTTP ${res.status}`);
    return j;
  } catch (e) {
    if (e.name === 'AbortError') throw new Error('timed out');
    if (e instanceof TypeError) throw new Error('cannot reach it');
    throw e;
  } finally { clearTimeout(t); }
}

export const watchSelfTest = () => api('/selftest', { timeoutMs: 60000 });
export async function pointBrief(lat, lon) {
  if (!connected()) return null;
  try { return await api(`/brief/point?lat=${lat.toFixed(4)}&lon=${lon.toFixed(4)}`, { timeoutMs: 30000 }); } catch { return null; }
}

// ---------------------------------------------------------------- screen
export function initWatch({ toast }) {
  toastFn = toast;
  load();
  $('btn-watch').addEventListener('click', () => open('places'));
  $('watch-close').addEventListener('click', close);
  for (const b of document.querySelectorAll('#watch-tabs button')) b.addEventListener('click', () => { detailId = null; open(b.dataset.tab); });
  const route = consumeHash();
  if (route) {
    if (route.toast) toast(route.toast);
    open(route.open);
    if (route.place) { detailId = route.place; refresh().then(() => { const p = data.places.find((x) => x.id === route.place); if (p) globe.flyTo(p.lat, p.lon, 60); }); }
  }
  window.addEventListener('hashchange', () => { const r = consumeHash(); if (r) open(r.open); });
  // Keep the badge fresh in the background (every 5 min while visible).
  pollBadge();
  setInterval(() => { if (!document.hidden) pollBadge(); }, 300000);
}

async function pollBadge() {
  const b = $('watch-badge');
  if (!connected()) { b.hidden = true; return; }
  try {
    const j = await api('/places');
    data = j;
    const worst = Math.max(0, ...Object.values(j.status || {}).map((s) => s.sev));
    b.hidden = worst < 2;
    b.className = 'badge ' + (worst >= 3 ? 'act' : 'heads');
  } catch { b.hidden = true; }
}

function open(which) {
  tab = which || tab;
  $('watch').hidden = false;
  for (const b of document.querySelectorAll('#watch-tabs button')) b.classList.toggle('on', b.dataset.tab === tab);
  render();
  refresh().then(render);
}
function close() { $('watch').hidden = true; detailId = null; }

async function refresh() {
  if (!connected()) return;
  try {
    const [p, s] = await Promise.all([api('/places'), api('/status')]);
    data = p; lastStatus = { ok: true, s };
  } catch (e) { lastStatus = { ok: false, error: e.message }; }
}

function connLine() {
  if (!connected()) {
    return `<div class="w-conn off"><b>Not set up yet.</b> On the Mac, double-click <b>Deploy GodView Watch</b> in Documents › GodView. Then open the link it prints on this device.<div class="w-paste"><input id="w-link" placeholder="…or paste the setup link here"><button class="btn" id="w-link-go">Connect</button></div></div>`;
  }
  if (!lastStatus) return '<div class="w-conn">Checking…</div>';
  if (!lastStatus.ok) return `<div class="w-conn bad"><b>Can't reach the watch service</b> (${escapeHtml(lastStatus.error)}). The map still works. <button class="linkish" id="w-forget">Forget this device's key</button></div>`;
  const s = lastStatus.s;
  const ago = s.lastRun ? fmt.ago(s.lastRun) : 'not yet';
  const broken = Object.entries(s.health || {}).filter(([, h]) => !h.ok).map(([k]) => k);
  return `<div class="w-conn ok"><b>Watching.</b> Last check ${escapeHtml(ago)}.${broken.length ? ` <span class="warn">Not working: ${escapeHtml(broken.join(', '))}.</span>` : ''}</div>`;
}

function render() {
  const body = $('watch-body');
  let html = connLine();
  if (connected()) {
    if (tab === 'places') html += detailId ? '<div id="w-detail"><p class="muted">Loading…</p></div>' : placesHtml();
    if (tab === 'alerts') html += '<div id="w-alerts"><p class="muted">Loading…</p></div>';
    if (tab === 'brief') html += '<div id="w-brief"><p class="muted">Loading…</p></div>';
  }
  if (tab === 'reports') html += '<div id="w-reports"></div>';
  body.innerHTML = html;
  wireCommon();
  if (tab === 'reports') renderReportsTab($('w-reports'), { connected: connected() && lastStatus?.ok !== false, api, places: data.places, toast: toastFn });
  if (!connected()) return;
  if (tab === 'places' && !detailId) wirePlaces();
  if (tab === 'places' && detailId) renderDetail();
  if (tab === 'alerts') renderAlerts();
  if (tab === 'brief') renderBrief(false);
}

function wireCommon() {
  $('w-link-go')?.addEventListener('click', () => {
    const v = $('w-link').value.trim();
    const m = v.match(/#watch=([^@]+)@([a-z0-9.-]+\.workers\.dev)/i);
    if (!m) { toastFn('That is not a GodView setup link.'); return; }
    save({ token: decodeURIComponent(m[1]), host: m[2].toLowerCase() });
    toastFn('Watch connected on this device.');
    open('places');
  });
  $('w-forget')?.addEventListener('click', () => { if (confirm('Remove the watch key from this device?')) { save(null); render(); } });
}

// ---------------------------------------------------------------- places (tiles)
const statusOf = (id) => data.status?.[id] || { sev: 0, open: 0 };
function placesHtml() {
  const tiles = (data.places || []).map((p) => {
    const s = statusOf(p.id);
    const cls = s.sev >= 3 ? 'act' : s.sev === 2 ? 'heads' : 'clear';
    const label = s.sev >= 3 ? 'Act now' : s.sev === 2 ? 'Heads-up' : 'All clear';
    return `<button class="tile ${cls}" data-id="${escapeHtml(p.id)}"><span class="t-state">${label}</span><span class="t-name">${escapeHtml(p.name)}</span><span class="t-sub">${escapeHtml(kindName(p.kind))}${s.open ? ` · ${s.open} new` : ''}</span></button>`;
  }).join('');
  return `<div class="tiles">${tiles}<button class="tile add" id="w-add"><span class="t-plus">+</span><span class="t-name">Add place</span></button></div>`;
}
const kindName = (k) => (KINDS.find((x) => x[0] === k) || [k, k])[1];

function wirePlaces() {
  for (const t of document.querySelectorAll('.tile[data-id]')) t.addEventListener('click', () => { detailId = t.dataset.id; render(); });
  $('w-add')?.addEventListener('click', () => addForm());
}

// Add or edit form. p = existing place or a draft.
function addForm(draft = {}) {
  const imp = settings.get('units') === 'imperial';
  const p = { name: '', kind: 'home', radiusKm: 40, ...draft };
  const body = $('watch-body');
  body.innerHTML = connLine() + `
    <div class="w-form">
      <h3>${p.id ? 'Edit place' : 'Add a place'}</h3>
      <input id="wf-name" placeholder="Name (e.g. Home, Mom's)" value="${escapeHtml(p.name)}" maxlength="60">
      <div class="seg" id="wf-kind">${KINDS.map(([k, n]) => `<button data-k="${k}" class="${k === p.kind ? 'on' : ''}">${n}</button>`).join('')}</div>
      <label class="w-range">Watch radius <b id="wf-rv"></b><input id="wf-r" type="range" min="2" max="160" step="1" value="${Math.round(p.radiusKm)}"></label>
      <div class="w-where">${p.lat != null ? `<b>Location set</b> ${escapeHtml(fmt.latlon(p.lat, p.lon))}` : '<b>Where is it?</b>'}</div>
      ${p.lat == null || p.id ? `<div class="inline">
        <button class="btn" id="wf-me">Use my location</button>
        <button class="btn" id="wf-tap">Tap the globe</button>
      </div>
      <div class="inline"><input id="wf-q" placeholder="Search an address or town"><button class="btn" id="wf-go">Find</button></div>
      <div id="wf-res" class="w-res"></div>` : ''}
      <div class="inline"><button class="btn primary" id="wf-save" ${p.lat == null ? 'disabled' : ''}>Save</button><button class="btn" id="wf-cancel">Cancel</button></div>
      <p class="muted small">Places are stored only in your own watch service, never in the app's code.</p>
    </div>`;
  const rv = () => { const km = Number($('wf-r').value); $('wf-rv').textContent = imp ? `${Math.round(km * 0.621)} mi` : `${km} km`; };
  rv();
  $('wf-r').addEventListener('input', rv);
  let kind = p.kind;
  for (const b of document.querySelectorAll('#wf-kind button')) b.addEventListener('click', () => { kind = b.dataset.k; document.querySelectorAll('#wf-kind button').forEach((x) => x.classList.toggle('on', x === b)); });
  const current = () => ({ ...p, name: $('wf-name').value.trim() || 'Place', kind, radiusKm: Number($('wf-r').value) });
  $('wf-cancel').addEventListener('click', () => { if (p.id) { detailId = p.id; } render(); });
  $('wf-me')?.addEventListener('click', () => {
    navigator.geolocation?.getCurrentPosition((pos) => addForm({ ...current(), lat: pos.coords.latitude, lon: pos.coords.longitude }),
      () => toastFn('Location permission denied.'), { timeout: 12000 });
  });
  $('wf-tap')?.addEventListener('click', () => {
    addMode = current();
    $('watch').hidden = true;
    toastFn('Tap the globe where the place is.', 6000);
  });
  const search = async () => {
    const q = $('wf-q').value.trim(); if (!q) return;
    const box = $('wf-res');
    box.innerHTML = '<p class="muted">Searching…</p>';
    try {
      let list = ((await fetchJSON(fillUrl(ENDPOINTS.geocodeOpenMeteo, { q }))).results || []).map((r) => ({ name: [r.name, r.admin1].filter(Boolean).join(', '), lat: r.latitude, lon: r.longitude }));
      if (!list.length) list = ((await fetchJSON(fillUrl(ENDPOINTS.geocodeNominatim, { q }))) || []).map((r) => ({ name: r.display_name, lat: Number(r.lat), lon: Number(r.lon) }));
      box.innerHTML = list.length ? list.slice(0, 5).map((r, i) => `<button class="w-pick" data-i="${i}">${escapeHtml(r.name)}</button>`).join('') : '<p class="muted">Nothing found.</p>';
      for (const b of box.querySelectorAll('.w-pick')) b.addEventListener('click', () => { const r = list[b.dataset.i]; addForm({ ...current(), lat: r.lat, lon: r.lon }); });
    } catch (e) { box.innerHTML = `<p class="muted">Search failed (${escapeHtml(e.message)}).</p>`; }
  };
  $('wf-go')?.addEventListener('click', search);
  $('wf-save').addEventListener('click', async () => {
    const np = current();
    if (np.lat == null) return;
    if (!np.id) np.id = (np.name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 14) || 'place') + '-' + Math.random().toString(36).slice(2, 6);
    const list = (data.places || []).filter((x) => x.id !== np.id).concat([{ id: np.id, name: np.name, lat: np.lat, lon: np.lon, radiusKm: np.radiusKm, kind: np.kind }]);
    try {
      const j = await api('/places', { method: 'PUT', body: { places: list } });
      data.places = j.places;
      toastFn('Saved. Watching it from the next check (within 5 minutes).');
      detailId = np.id;
      render();
    } catch (e) { toastFn(`Could not save: ${e.message}`); }
  });
}

// Called by the globe tap handler. Returns true if the tap was used here.
export function handleGlobeTap(lat, lon) {
  if (!addMode) return false;
  const d = { ...addMode, lat, lon };
  addMode = null;
  $('watch').hidden = false;
  tab = 'places';
  addForm(d);
  return true;
}

// ---------------------------------------------------------------- place detail: timeline + normal vs now
async function renderDetail() {
  const box = $('w-detail');
  const p = (data.places || []).find((x) => x.id === detailId);
  if (!p) { box.innerHTML = '<p class="muted">This place is no longer saved.</p>'; return; }
  let h;
  try { h = await api(`/history?place=${encodeURIComponent(p.id)}`); } catch (e) { box.innerHTML = `<p class="muted">Could not load (${escapeHtml(e.message)}).</p>`; return; }
  const s = statusOf(p.id);
  const cls = s.sev >= 3 ? 'act' : s.sev === 2 ? 'heads' : 'clear';
  // Timeline: last 30 days, one bar per day coloured by the worst event.
  const days = [];
  for (let i = 29; i >= 0; i--) days.push(new Date(Date.now() - i * 86400000).toLocaleDateString('en-CA'));
  const byDay = {};
  for (const e of h.timeline || []) { const d = new Date(e.t).toLocaleDateString('en-CA'); (byDay[d] ||= []).push(e); }
  const bars = days.map((d, i) => { const ev = byDay[d] || []; const w = Math.max(0, ...ev.map((e) => e.sev)); return `<i class="bar s${w}" style="height:${ev.length ? 10 + Math.min(30, ev.length * 6) : 4}px" data-i="${i}"></i>`; }).join('');
  const n = h.normals || { items: [], note: '' };
  box.innerHTML = `
    <div class="w-head ${cls}">
      <button class="linkish" id="wd-back">‹ Places</button>
      <h3>${escapeHtml(p.name)}</h3>
      <div class="t-state">${s.sev >= 3 ? 'Act now' : s.sev === 2 ? 'Heads-up' : 'All clear'}${(s.alerts || []).length ? ' · ' + escapeHtml(s.alerts.join(', ')) : ''}</div>
    </div>
    <div class="nvn">${n.items.map((it) => `<div class="nv ${it.unusual ? 'odd' : ''}"><span>${escapeHtml(it.label)}</span><b>${escapeHtml(String(it.now))}</b><small>normal: ${escapeHtml(it.normal)}</small></div>`).join('')}</div>
    <p class="muted small">${escapeHtml(n.note)}</p>
    <div class="timeline"><div class="bars">${bars}</div><input type="range" id="wd-scrub" min="0" max="29" value="29" aria-label="Pick a day"><div class="t-day" id="wd-day"></div></div>
    <div id="wd-events" class="events"></div>
    ${camsHtml(p)}
    <div class="inline">
      <button class="btn" id="wd-report">Conditions report</button>
      <button class="btn" id="wd-fly">Show on map</button>
      <button class="btn" id="wd-edit">Edit</button>
      <button class="btn danger" id="wd-del">Remove</button>
    </div>`;
  const show = (i) => {
    const d = days[i];
    $('wd-day').textContent = new Date(d + 'T12:00').toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric' });
    $('wd-events').innerHTML = eventsHtml(byDay[d] || [], 'Nothing happened this day.');
    wireDone($('wd-events'));
  };
  show(29);
  $('wd-scrub').addEventListener('input', (e) => show(Number(e.target.value)));
  $('wd-back').addEventListener('click', () => { detailId = null; render(); });
  $('wd-report').addEventListener('click', () => { presetPoint({ lat: p.lat, lon: p.lon, name: p.name }); open('reports'); });
  wireCams(p);
  $('wd-fly').addEventListener('click', () => { close(); globe.flyTo(p.lat, p.lon, Math.max(30, p.radiusKm * 3)); globe.setMarker('place', p.lat, p.lon, '#3ee6c4'); });
  $('wd-edit').addEventListener('click', () => addForm(p));
  $('wd-del').addEventListener('click', async () => {
    if (!confirm(`Stop watching ${p.name}?`)) return;
    try { const j = await api('/places', { method: 'PUT', body: { places: data.places.filter((x) => x.id !== p.id) } }); data.places = j.places; detailId = null; render(); } catch (e) { toastFn(`Could not remove: ${e.message}`); }
  });
}

function eventsHtml(list, empty) {
  if (!list.length) return `<p class="muted">${empty}</p>`;
  return list.map((e) => `
    <div class="evt s${e.sev} ${e.handled ? 'done' : ''}">
      <div class="e-top"><span class="e-sev">${SEV[e.sev]?.[1] || ''}</span><span class="e-time">${escapeHtml(fmt.ago(e.t))}</span></div>
      <div class="e-title">${escapeHtml(e.title)}</div>
      ${e.data?.inference ? `<div class="e-inf">Inference · ${escapeHtml(String(e.data.confidence))} confidence · not confirmed</div>` : ''}
      <div class="e-text">${escapeHtml(e.text)}</div>
      ${e.data?.inference && e.data.evidence?.length ? `<ul class="e-evid">${e.data.evidence.slice(0, 5).map((x) => `<li>${escapeHtml(x)}</li>`).join('')}</ul>` : ''}
      ${e.todo ? `<div class="e-todo">${escapeHtml(e.todo)}</div>` : ''}
      ${e.handled ? '' : `<button class="btn small-btn" data-done="${escapeHtml(e.id)}">Done</button>`}
    </div>`).join('');
}
function wireDone(root) {
  for (const b of root.querySelectorAll('[data-done]')) {
    b.addEventListener('click', async () => {
      try { await api('/events/handled', { method: 'POST', body: { ids: [b.dataset.done] } }); b.closest('.evt').classList.add('done'); b.remove(); pollBadge(); } catch (e) { toastFn(`Could not update: ${e.message}`); }
    });
  }
}

// ---------------------------------------------------------------- alerts inbox
async function renderAlerts() {
  const box = $('w-alerts');
  let j;
  try { j = await api('/events?limit=150'); } catch (e) { box.innerHTML = `<p class="muted">Could not load (${escapeHtml(e.message)}).</p>`; return; }
  const names = Object.fromEntries((data.places || []).map((p) => [p.id, p.name]));
  const list = (j.events || []).map((e) => ({ ...e, title: `${names[e.placeId] || ''}: ${e.title}` }));
  const open = list.filter((e) => !e.handled);
  box.innerHTML = `<div class="inline"><button class="btn" id="wa-all" ${open.length ? '' : 'disabled'}>Clear all (${open.length})</button></div>` +
    eventsHtml(open, 'Nothing new. All clear.') + (list.length > open.length ? `<h4 class="sec-title">Handled</h4>${eventsHtml(list.filter((e) => e.handled).slice(0, 30), '')}` : '');
  wireDone(box);
  $('wa-all')?.addEventListener('click', async () => {
    try { await api('/events/handled', { method: 'POST', body: { all: true } }); pollBadge(); renderAlerts(); } catch (e) { toastFn(`Could not update: ${e.message}`); }
  });
}

// ---------------------------------------------------------------- brief
async function renderBrief(fresh) {
  const box = $('w-brief');
  box.innerHTML = '<p class="muted">Loading…</p>';
  let b;
  try { b = fresh ? (await api('/brief/now', { timeoutMs: 45000 })).brief : (await api('/brief')).brief; } catch (e) { box.innerHTML = `<p class="muted">Could not load (${escapeHtml(e.message)}).</p>`; return; }
  if (!b) { box.innerHTML = '<p class="muted">No morning brief yet. It arrives at 6:15 each morning.</p><button class="btn primary" id="wb-now">Brief me now</button>'; $('wb-now').addEventListener('click', () => renderBrief(true)); return; }
  const lines = String(b.text || '').split('\n').filter(Boolean);
  const nv = (b.facts || []).map((f) => `<div class="nvn">${(f.history?.items || []).slice(0, 4).map((it) => `<div class="nv ${it.unusual ? 'odd' : ''}"><span>${escapeHtml(f.place.name)} · ${escapeHtml(it.label)}</span><b>${escapeHtml(String(it.now))}</b><small>normal: ${escapeHtml(it.normal)}</small></div>`).join('')}</div><p class="muted small">${escapeHtml(f.history?.note || '')}</p>`).join('');
  box.innerHTML = `<div class="brief-when">${escapeHtml(new Date(b.at).toLocaleString(undefined, { weekday: 'long', hour: 'numeric', minute: '2-digit' }))}${b.by && b.by !== 'rules' ? ' · worded by Claude' : ''}</div>
    <div class="brief-text">${lines.map((l) => l.startsWith('Do:') ? `<p class="do">${escapeHtml(l.slice(3).trim())}</p>` : `<p>${escapeHtml(l)}</p>`).join('')}</div>
    ${nv}
    <button class="btn" id="wb-now">Brief me now</button>`;
  $('wb-now').addEventListener('click', () => renderBrief(true));
}

// ---------------------------------------------------------------- cameras on a place (camera AI is opt-in)
function camsHtml(p) {
  const cams = p.cams || [];
  const cam = lastStatus?.s?.cameraAI;
  if (!cams.length) return '<p class="muted small">No cameras on this place. Tap a Georgia 511 or Caltrans camera on the map and choose "Watch this camera".</p>';
  return `<div class="w-cams"><h4 class="sec-title">Cameras</h4>${cams.map((c) => `<div class="key-item"><span>${escapeHtml(c.name)}</span><button class="btn small-btn danger" data-rmcam="${escapeHtml(c.id)}">Remove</button></div>`).join('')}
    <label class="field"><span>Camera AI<small>Claude looks at a frame every hour and when something happens nearby; reports only what is visible. ${cam ? `${cam.used} of ${cam.cap} looks used today.` : ''}${cam && !cam.enabled ? ' Needs the Anthropic key in the Watch service.' : ''}</small></span>
    <span class="switch"><input type="checkbox" id="wd-camai" ${p.camAI ? 'checked' : ''}><span></span></span></label></div>`;
}
async function savePlace(np) {
  const list = (data.places || []).map((x) => (x.id === np.id ? np : x));
  const j = await api('/places', { method: 'PUT', body: { places: list } });
  data.places = j.places;
}
function wireCams(p) {
  document.querySelectorAll('[data-rmcam]').forEach((b) => b.addEventListener('click', async () => {
    try { await savePlace({ ...p, cams: (p.cams || []).filter((c) => c.id !== b.dataset.rmcam) }); render(); } catch (e) { toastFn(`Could not save: ${e.message}`); }
  }));
  $('wd-camai')?.addEventListener('change', async (e) => {
    try { await savePlace({ ...p, camAI: e.target.checked }); toastFn(e.target.checked ? 'Camera AI on for this place.' : 'Camera AI off.'); } catch (err) { toastFn(`Could not save: ${err.message}`); }
  });
}

// Called from a camera's card: add it to a saved place (public DOT cameras only).
export async function addCamera(cam, placeId) {
  if (!connected()) throw new Error('Set up the Watch service first');
  if (!data.places?.length) { const j = await api('/places'); data = j; }
  const p = data.places.find((x) => x.id === placeId) || data.places[0];
  if (!p) throw new Error('Add a place first');
  const cams = [...(p.cams || []).filter((c) => c.id !== cam.id), cam].slice(-6);
  await savePlace({ ...p, cams });
  return p.name;
}
export const placesList = () => data.places || [];

// Open the Reports tab for a point (from What's here).
export function openReportsFor(pt) { presetPoint(pt); open('reports'); }
