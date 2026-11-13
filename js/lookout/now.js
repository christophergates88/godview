// "Now": the two-second look. Alerts and weather for your place, what is on
// the roads, the nearest cameras, your Watch places, and quick ways out
// (drive mode, the map, the scanner, the news). Loads before the globe; the
// map's own facts (aircraft overhead, quakes, the Watch check) join once the
// globe has started.

import { $, h, row, section, dist, away, ago, clock, compass, ICON } from './common.js';
import { getPlace, onPlace } from './place.js';
import { weather, alerts, roadEvents, camerasNear, WMO, eventIcon, eventSev, eventTitle, inGeorgia } from './feeds.js';
import { fmt } from '../core/units.js';
import { go, nav, whenApp, showOnMap } from './nav.js';
import { openViewer } from './viewer.js';
import { openDrive } from './drive.js';
import { camTile, wireCamImgs } from './cams.js';
import { safetyLinks, trafficLinks } from './links.js';

let visible = false; let timer = null; let seq = 0;
const trim = (s, n) => { const t = String(s || '').replace(/\s+/g, ' ').trim(); return t.length > n ? `${t.slice(0, n - 1)}…` : t; };
// "17:31" (local time at the place, from Open-Meteo) -> "5:31 PM"
const hhmm = (iso) => { const m = String(iso || '').match(/T(\d{2}):(\d{2})/); if (!m) return ''; const hr = Number(m[1]); return `${((hr + 11) % 12) + 1}:${m[2]} ${hr < 12 ? 'AM' : 'PM'}`; };

export function init() {
  onPlace(() => { if (visible) render(); });
  whenApp(() => { if (visible) render(true); });
}
export function show() {
  visible = true;
  render();
  clearInterval(timer);
  timer = setInterval(() => { if (visible && !document.hidden) render(true); }, 3 * 60e3);
}
export function hide() { visible = false; clearInterval(timer); }

function layout() {
  return `
    <div id="nw-hero" class="lk-hero"><div class="h-state"><i></i>Checking…</div><div class="h-head">&nbsp;</div><div class="lk-wx muted">Loading the weather…</div></div>
    <div id="nw-alerts"></div>
    <div class="lk-sec"><h2>Quick</h2></div>
    <div class="lk-actions">
      <button class="lk-act" id="nw-drive">${ICON.car}Drive</button>
      <button class="lk-act" id="nw-map">${ICON.globe}Map here</button>
      <button class="lk-act" data-go="scanner">${ICON.radio}Scanner</button>
      <button class="lk-act" data-go="news">${ICON.news}News</button>
    </div>
    <div id="nw-roads"></div>
    <div id="nw-cams"></div>
    <div id="nw-places"></div>
    <div id="nw-links"></div>`;
}

function render(quiet = false) {
  const p = getPlace();
  const box = $('lk-now');
  if (!p) { box.innerHTML = '<div class="lk-empty">Finding where you are…</div>'; return; }
  const sig = `${p.lat.toFixed(3)},${p.lon.toFixed(3)}`;
  if (box.dataset.sig !== sig || !quiet) {
    box.dataset.sig = sig;
    box.innerHTML = layout();
    $('nw-drive').onclick = () => openDrive();
    $('nw-map').onclick = () => showOnMap({ lat: p.lat, lon: p.lon, heightKm: 40 });
    for (const b of box.querySelectorAll('[data-go]')) b.onclick = () => go(b.dataset.go);
    $('nw-links').innerHTML = section('Safety and help') + `<div class="lk-rows">${safetyLinks(p).map(row).join('')}</div>`;
  }
  const n = ++seq;
  const W = weather(p); const A = alerts(p);
  hero(p, n, W, A);
  alertList(p, n, A);
  roads(p, n);
  cams(p, n);
  places(n);
}

async function hero(p, n, W, A) {
  const [w, a] = await Promise.allSettled([W, A]);
  let st = null;
  if (nav.app) { try { st = await nav.app.status.computeStatus({ lat: p.lat, lon: p.lon, label: p.source === 'gps' ? 'Here' : p.name }); } catch { st = null; } }
  if (n !== seq || !$('nw-hero')) return;
  const al = a.status === 'fulfilled' ? a.value : [];
  let level = al.length ? al[0].level : 0;
  // The state line already says "Act now" / "Heads-up"; the headline is just what it is.
  let head = al.length && al[0].level ? al[0].event : '';
  if (st && st.level > level) { level = st.level; head = String(st.headline || '').replace(/^(Act now|Heads-up):\s*/i, ''); }
  if (!head) head = p.source === 'gps' ? 'All clear here' : `All clear in ${p.name}`;
  const c = w.status === 'fulfilled' && w.value.current;
  const d = w.status === 'fulfilled' && w.value.daily;
  const facts = [];
  if (d && d.sunset && d.sunset[0]) facts.push(`Sunset ${hhmm(d.sunset[0])}`);
  for (const f of (st && st.facts) || []) if (!/°[FC]/.test(f)) facts.push(f);
  const el = $('nw-hero');
  el.className = `lk-hero l${level}`;
  el.innerHTML = `
    <div class="h-state"><i></i>${level === 2 ? 'Act now' : level === 1 ? 'Heads-up' : 'All clear'} · ${h(clock(Date.now()))}</div>
    <div class="h-head">${h(head)}</div>
    ${c ? `<div class="lk-wx"><div class="temp">${h(fmt.tempC(c.temperature_2m))}</div><div><div class="cond">${h(WMO[c.weather_code] || '')}</div>
      <div class="meta">Feels ${h(fmt.tempC(c.apparent_temperature))} · Wind ${h(fmt.windKmh(c.wind_speed_10m))} ${h(compass(c.wind_direction_10m))}${c.wind_gusts_10m >= 35 ? `, gusts ${h(fmt.windKmh(c.wind_gusts_10m))}` : ''}</div>
      ${d ? `<div class="meta">High ${h(fmt.tempC(d.temperature_2m_max[0]))} · Low ${h(fmt.tempC(d.temperature_2m_min[0]))}${d.precipitation_probability_max && d.precipitation_probability_max[0] != null ? ` · Rain ${d.precipitation_probability_max[0]}%` : ''}</div>` : ''}</div></div>`
      : `<div class="lk-wx muted">${w.status === 'rejected' ? 'The weather did not load. It tries again in a few minutes.' : ''}</div>`}
    ${facts.length ? `<div class="lk-facts">${facts.slice(0, 4).map((f) => `<span>${h(f)}</span>`).join('')}</div>` : ''}`;
  // A dot on the Now tab when something needs attention
  const dot = document.querySelector('#tabbar [data-tab="now"] .tb-dot');
  if (dot) { dot.hidden = level === 0; dot.className = `tb-dot${level === 2 ? ' act' : ''}`; }
}

async function alertList(p, n, A) {
  let al;
  try { al = await A; } catch (e) {
    if (n === seq && $('nw-alerts')) $('nw-alerts').innerHTML = p.country && p.country !== 'US' ? '' : `<p class="lk-err">Weather alerts did not load (${h(e.message)}).</p>`;
    return;
  }
  if (n !== seq || !$('nw-alerts')) return;
  const box = $('nw-alerts');
  box.innerHTML = al.length ? section(`Weather alerts (${al.length})`) + al.map((x, i) => `
    <div class="lk-alert s${x.level}" role="button" tabindex="0" data-i="${i}"><b>${h(x.event)}</b><small>${h([x.ends ? `Until ${new Date(x.ends).toLocaleString([], { weekday: 'short', hour: 'numeric', minute: '2-digit' })}` : '', x.sender].filter(Boolean).join(' · '))}</small>
    <div class="body">${h(trim(x.desc, 1200))}${x.instruction ? `\n\n<span class="do">${h(trim(x.instruction, 600))}</span>` : ''}</div></div>`).join('') : '';
  for (const el of box.querySelectorAll('.lk-alert')) el.onclick = () => el.classList.toggle('open');
}

async function roads(p, n) {
  const box = $('nw-roads');
  if (!inGeorgia(p)) { box.innerHTML = section('Roads') + `<div class="lk-rows">${trafficLinks(p).slice(0, 2).map(row).join('')}</div>`; return; }
  try {
    const r = await roadEvents(p, 80);
    if (n !== seq || !$('nw-roads')) return;
    const list = r.list.slice(0, 5);
    const extra = r.list.length ? `<small>${r.list.length} within ${h(dist(80))}</small><button class="more" data-go="cams">All</button>` : '';
    box.innerHTML = section('On the roads', extra) + (r.stale
      ? `<div class="lk-empty">The Georgia 511 copy is from ${h(ago(r.updated))}, so road events are hidden until it updates.</div>`
      : list.length
        ? `<div class="lk-rows">${list.map((e, i) => row({ icon: eventIcon(e), title: eventTitle(e), sub: [e.dir, trim(e.desc, 110)].filter(Boolean).join(' · '), right: away(p, e.lat, e.lon), cls: `sev${eventSev(e)}`, data: { ev: i } })).join('')}</div>`
        : '<div class="lk-empty">No road events reported nearby.</div>');
    for (const b of box.querySelectorAll('[data-ev]')) { const e = list[Number(b.dataset.ev)]; b.onclick = () => showOnMap({ lat: e.lat, lon: e.lon, heightKm: 4, layer: 'ga511Events', key: e.id }); }
    for (const b of box.querySelectorAll('[data-go]')) b.onclick = () => go(b.dataset.go, { seg: 'traffic' });
  } catch (e) {
    if (n === seq && $('nw-roads')) box.innerHTML = section('On the roads') + `<div class="lk-empty">Georgia 511 did not load (${h(e.message)}).</div>`;
  }
}

async function cams(p, n) {
  const box = $('nw-cams');
  try {
    const r = await camerasNear(p, 130);
    if (n !== seq || !$('nw-cams')) return;
    const list = r.cams.slice(0, 10);
    box.innerHTML = section('Nearest cameras', r.cams.length ? '<button class="more" data-go="cams">All</button>' : '') + (list.length
      ? `<div class="lk-strip">${list.map((c, i) => camTile(c, i, p)).join('')}</div>`
      : '<div class="lk-empty">No public cameras within about 80 miles of here.</div>');
    wireCamImgs(box);
    for (const b of box.querySelectorAll('[data-cam]')) b.onclick = () => openViewer(list, Number(b.dataset.cam));
    for (const b of box.querySelectorAll('[data-go]')) b.onclick = () => go(b.dataset.go);
  } catch (e) {
    if (n === seq && $('nw-cams')) box.innerHTML = section('Nearest cameras') + `<div class="lk-empty">Cameras did not load (${h(e.message)}).</div>`;
  }
}

async function places(n) {
  const box = $('nw-places');
  const a = nav.app;
  if (!a || !box) return;
  if (!a.watch.connected()) {
    box.innerHTML = section('Your places') + `<div class="lk-rows">${row({ icon: 'bell', title: 'Set up Watch', sub: 'Alerts for your places, even when GodView is closed', data: { w: 1 } })}</div>`;
    box.querySelector('[data-w]').onclick = () => a.watch.openWatch('places');
    return;
  }
  try {
    const [pl, br] = await Promise.allSettled([a.watch.api('/places', { timeoutMs: 10000 }), a.watch.api('/brief', { timeoutMs: 10000 })]);
    if (n !== seq || !$('nw-places')) return;
    if (pl.status === 'rejected') throw pl.reason;
    const j = pl.value;
    const tiles = (j.places || []).map((x) => {
      const s = (j.status || {})[x.id] || { sev: 0 };
      const cls = s.sev >= 3 ? 'act' : s.sev === 2 ? 'heads' : 'clear';
      return `<button class="tile ${cls}" data-pl="${h(x.id)}"><span class="t-state">${s.sev >= 3 ? 'Act now' : s.sev === 2 ? 'Heads-up' : 'All clear'}</span><span class="t-name">${h(x.name)}</span>${s.open ? `<span class="t-sub">${s.open} new</span>` : ''}</button>`;
    }).join('');
    const b = br.status === 'fulfilled' && br.value.brief;
    const firstLine = b ? String(b.text || '').split('\n').find((l) => l.trim()) : '';
    box.innerHTML = section('Your places', '<button class="more" data-w="places">Watch</button>')
      + (tiles ? `<div class="lk-places">${tiles}</div>` : '<div class="lk-empty">No places yet. Add one in Watch.</div>')
      + (firstLine ? `<div class="lk-card" style="margin-top:10px"><div class="brief-when">Brief · ${h(new Date(b.at).toLocaleString([], { weekday: 'short', hour: 'numeric', minute: '2-digit' }))}</div><div style="font-size:15px;line-height:1.45">${h(trim(firstLine, 260))}</div><button class="linkish" data-w="brief" style="margin-top:8px">Read the brief</button></div>` : '');
    for (const t of box.querySelectorAll('[data-pl]')) t.onclick = () => a.watch.openWatch('places', t.dataset.pl);
    for (const t of box.querySelectorAll('[data-w]')) t.onclick = () => a.watch.openWatch(t.dataset.w);
  } catch (e) {
    if (n === seq && $('nw-places')) box.innerHTML = section('Your places') + `<div class="lk-empty">Watch did not answer (${h(e.message)}).</div>`;
  }
}
