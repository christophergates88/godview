// "Cams": every public camera near your place (Georgia 511 traffic cameras and
// public webcams), nearest first, and "Traffic": road events and the live
// Waze map. Tap a camera for the full-screen viewer.

import { $, h, row, section, dist, away, ago, fillUrl } from './common.js';
import { getPlace, onPlace } from './place.js';
import { camerasNear, roadEvents, freshImg, eventIcon, eventSev, eventTitle, inGeorgia } from './feeds.js';
import { openViewer } from './viewer.js';
import { showOnMap } from './nav.js';
import { trafficLinks } from './links.js';
import { ENDPOINTS } from '../config.js';

let visible = false; let seg = 'cams'; let filter = 'all'; let list = []; let seq = 0;

export function camTile(c, i, p) {
  const tag = c.kind === 'road' ? '<span class="tag dot">DOT</span>' : c.live ? '<span class="tag live">LIVE</span>' : '<span class="tag">CAM</span>';
  return `<button class="cam" data-cam="${i}"><div class="img"><img loading="lazy" decoding="async" src="${h(freshImg(c))}" alt="">${tag}${c.ok === false ? '<span class="off">Offline</span>' : ''}</div>
    <div class="cap">${h(c.title)}<small>${h([p ? away(p, c.lat, c.lon) : '', c.kind === 'road' ? c.sub : ''].filter(Boolean).join(' · '))}</small></div></button>`;
}
// A camera whose picture will not load gets a plain "No picture" tile.
export function wireCamImgs(box) {
  for (const img of box.querySelectorAll('.cam img')) {
    img.onerror = () => { const d = img.parentElement; img.remove(); if (d && !d.querySelector('.off')) d.insertAdjacentHTML('beforeend', '<span class="off">No picture</span>'); };
  }
}

export function init() { onPlace(() => { if (visible) render(); }); }
export function show(opts = {}) { visible = true; if (opts.seg) seg = opts.seg; render(); }
export function hide() { visible = false; const f = $('waze'); if (f) f.src = 'about:blank'; }

function render() {
  const p = getPlace();
  const box = $('lk-cams');
  if (!p) { box.innerHTML = '<div class="lk-empty">Finding where you are…</div>'; return; }
  box.innerHTML = `
    <div class="seg lk-seg" role="tablist"><button data-seg="cams" class="${seg === 'cams' ? 'on' : ''}">Cameras</button><button data-seg="traffic" class="${seg === 'traffic' ? 'on' : ''}">Traffic</button></div>
    <div id="cm-body"></div>`;
  for (const b of box.querySelectorAll('[data-seg]')) b.onclick = () => { seg = b.dataset.seg; render(); };
  if (seg === 'cams') cameras(p); else traffic(p);
}

async function cameras(p) {
  const n = ++seq;
  const body = $('cm-body');
  body.innerHTML = '<div class="lk-empty">Finding cameras near you…</div>';
  try {
    const r = await camerasNear(p, 130);
    if (n !== seq || !$('cm-body')) return;
    const all = r.cams;
    const counts = { all: all.length, road: all.filter((c) => c.kind === 'road').length, webcam: all.filter((c) => c.kind === 'webcam').length };
    if (!counts[filter]) filter = 'all';
    list = filter === 'all' ? all : all.filter((c) => c.kind === filter);
    const notes = [];
    if (r.road.error && inGeorgia(p)) notes.push(`Georgia 511 cameras did not load (${r.road.error}).`);
    if (r.webcams.error) notes.push(`Webcams did not load (${r.webcams.error}).`);
    body.innerHTML = `
      <div class="lk-chips">
        <button data-f="all" class="${filter === 'all' ? 'on' : ''}">All ${counts.all}</button>
        ${counts.road ? `<button data-f="road" class="${filter === 'road' ? 'on' : ''}">Traffic ${counts.road}</button>` : ''}
        ${counts.webcam ? `<button data-f="webcam" class="${filter === 'webcam' ? 'on' : ''}">Webcams ${counts.webcam}</button>` : ''}
      </div>
      ${notes.map((t) => `<p class="lk-err">${h(t)}</p>`).join('')}
      ${list.length ? `<div class="lk-grid">${list.slice(0, 120).map((c, i) => camTile(c, i, p)).join('')}</div>`
        : `<div class="lk-empty">No public cameras within about ${h(dist(130))} of here.</div>`}
      ${section('More cameras')}<div class="lk-rows">${trafficLinks(p).filter((l) => l.icon !== 'car').map(row).join('')}</div>`;
    wireCamImgs(body);
    for (const b of body.querySelectorAll('[data-f]')) b.onclick = () => { filter = b.dataset.f; cameras(p); };
    for (const b of body.querySelectorAll('[data-cam]')) b.onclick = () => openViewer(list, Number(b.dataset.cam));
  } catch (e) {
    if (n === seq && $('cm-body')) body.innerHTML = `<div class="lk-empty">Cameras did not load (${h(e.message)}).</div>`;
  }
}

async function traffic(p) {
  const n = ++seq;
  const body = $('cm-body');
  const waze = fillUrl(ENDPOINTS.wazeEmbed, { lat: p.lat.toFixed(5), lon: p.lon.toFixed(5) });
  body.innerHTML = `<div id="tr-events"></div>${section('Live traffic (Waze)')}<iframe id="waze" class="waze" title="Live traffic map" loading="lazy" src="${h(waze)}"></iframe>
    ${section('Traffic sites')}<div class="lk-rows">${trafficLinks(p).map(row).join('')}</div>`;
  const box = $('tr-events');
  if (!inGeorgia(p)) { box.innerHTML = ''; return; }
  box.innerHTML = '<div class="lk-empty">Loading Georgia 511…</div>';
  try {
    const r = await roadEvents(p, 120);
    if (n !== seq || !$('tr-events')) return;
    box.innerHTML = section('Road events', `<small>Georgia 511 · ${h(ago(r.updated))}</small>`) + (r.stale
      ? `<div class="lk-empty">The Georgia 511 copy is from ${h(ago(r.updated))}, so road events are hidden until it updates.</div>`
      : r.list.length
        ? `<div class="lk-rows">${r.list.slice(0, 40).map((e, i) => row({ icon: eventIcon(e), title: eventTitle(e), sub: [e.dir, e.sub, e.desc].filter(Boolean).join(' · ').slice(0, 160), right: away(p, e.lat, e.lon), cls: `sev${eventSev(e)}`, data: { ev: i } })).join('')}</div>`
        : `<div class="lk-empty">No road events within ${h(dist(120))}.</div>`);
    for (const b of box.querySelectorAll('[data-ev]')) { const e = r.list[Number(b.dataset.ev)]; b.onclick = () => showOnMap({ lat: e.lat, lon: e.lon, heightKm: 4, layer: 'ga511Events', key: e.id }); }
  } catch (e) {
    if (n === seq && $('tr-events')) box.innerHTML = `<div class="lk-empty">Georgia 511 did not load (${h(e.message)}).</div>`;
  }
}
