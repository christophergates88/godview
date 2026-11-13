// Full-screen camera viewer: swipe or tap the arrows for the next camera.
// Traffic cameras refresh every 10 seconds, webcams every minute.

import { $, h, away, clock } from './common.js';
import { getPlace } from './place.js';
import { freshImg } from './feeds.js';
import { showOnMap } from './nav.js';

let list = []; let idx = 0; let timer = null; let touchX = null;

export function openViewer(cams, i = 0) {
  list = cams.filter((c) => c.img);
  if (!list.length) return;
  idx = ((i % list.length) + list.length) % list.length;
  $('viewer').hidden = false;
  draw();
}

export function closeViewer() {
  $('viewer').hidden = true;
  clearInterval(timer);
  $('viewer').innerHTML = '';
}

function draw() {
  const c = list[idx];
  const p = getPlace();
  const v = $('viewer');
  v.innerHTML = `
    <div class="v-top">
      <div class="v-title"><b>${h(c.title)}</b><small>${h([p ? away(p, c.lat, c.lon) : '', c.sub, c.src].filter(Boolean).join(' · '))}</small></div>
      <button class="icon-btn small" id="v-close" aria-label="Close camera"><svg viewBox="0 0 24 24"><path d="M6 6l12 12M18 6L6 18" stroke="currentColor" stroke-width="2.4" stroke-linecap="round"/></svg></button>
    </div>
    <div class="v-img" id="v-img">
      <img id="v-pic" alt="${h(c.title)}">
      ${list.length > 1 ? '<button class="v-nav prev" id="v-prev" aria-label="Previous camera">‹</button><button class="v-nav next" id="v-next" aria-label="Next camera">›</button>' : ''}
      <span class="v-age" id="v-age"></span>
    </div>
    <div class="v-bar">
      <button class="btn" id="v-map">Show on map</button>
      <a class="btn" href="${h(c.page)}" target="_blank" rel="noopener">Open on ${h(c.src)}</a>
    </div>`;
  const img = $('v-pic');
  const load = () => {
    img.onerror = () => { $('v-age').textContent = 'Picture not available right now'; };
    img.onload = () => { $('v-age').textContent = `${c.kind === 'road' ? 'Updated' : 'Snapshot'} ${clock(Date.now())} · ${idx + 1} of ${list.length}`; };
    img.src = freshImg(c) + (c.kind === 'webcam' ? `${c.img.includes('?') ? '&' : '?'}t=${Math.floor(Date.now() / 60000)}` : '');
  };
  load();
  clearInterval(timer);
  timer = setInterval(() => { if (!$('viewer').hidden && !document.hidden) load(); }, (c.refreshS || 30) * 1000);
  $('v-close').onclick = closeViewer;
  if ($('v-prev')) { $('v-prev').onclick = () => step(-1); $('v-next').onclick = () => step(1); }
  $('v-map').onclick = () => { closeViewer(); showOnMap({ lat: c.lat, lon: c.lon, heightKm: 3, layer: c.layer || null, key: c.layerKey ?? null }); };
  const area = $('v-img');
  area.ontouchstart = (e) => { touchX = e.touches[0].clientX; };
  area.ontouchend = (e) => {
    if (touchX == null) return;
    const dx = e.changedTouches[0].clientX - touchX; touchX = null;
    if (Math.abs(dx) > 50) step(dx < 0 ? 1 : -1);
  };
}

function step(d) { idx = (idx + d + list.length) % list.length; draw(); }

document.addEventListener('keydown', (e) => {
  if ($('viewer')?.hidden !== false) return;
  if (e.key === 'Escape') closeViewer();
  if (e.key === 'ArrowLeft') step(-1);
  if (e.key === 'ArrowRight') step(1);
});
