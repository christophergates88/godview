// "Show me": choose the place the Lookout screens show.
// Your location, a search, one of your Watch places, or where the map is looking.

import { $, h, fillUrl } from './common.js';
import { fetchJSON } from '../core/net.js';
import { ENDPOINTS } from '../config.js';
import { useMyLocation, pick, getPlace } from './place.js';
import { nav } from './nav.js';

export function initPicker() {
  $('placepick-close').addEventListener('click', closePicker);
  $('placepick').addEventListener('click', (e) => { if (e.target.id === 'placepick') closePicker(); });
}

export function closePicker() { $('placepick').hidden = true; }

export async function openPicker() {
  const p = getPlace();
  const body = $('placepick-body');
  body.innerHTML = `
    ${p ? `<p class="muted small" style="margin:0 0 10px">Showing <b>${h([p.name, p.state].filter(Boolean).join(', '))}</b>${p.source === 'gps' ? ' (your location)' : p.source === 'picked' ? ' (picked)' : ''}.</p>` : ''}
    <button class="btn primary pp-now" id="pp-gps">Use my location</button>
    <form id="pp-form" class="w-paste" style="margin-top:4px">
      <input id="pp-q" type="search" placeholder="Town, address or ZIP" enterkeyhint="search" autocomplete="off">
      <button class="btn" type="submit">Search</button>
    </form>
    <div id="pp-res" class="pp-list"></div>
    <div id="pp-more" class="pp-list"></div>`;
  $('placepick').hidden = false;
  $('pp-gps').onclick = async () => {
    $('pp-gps').textContent = 'Finding you…';
    try { await useMyLocation({ prompt: true }); closePicker(); } catch (e) { $('pp-gps').textContent = 'Use my location'; $('pp-res').innerHTML = `<p class="lk-err">${h(e.message)}</p>`; }
  };
  $('pp-form').onsubmit = async (e) => {
    e.preventDefault();
    const q = $('pp-q').value.trim();
    if (!q) return;
    $('pp-res').innerHTML = '<p class="muted small">Searching…</p>';
    try {
      const results = await search(q);
      $('pp-res').innerHTML = results.length ? results.map((r, i) => `<button class="w-pick" data-i="${i}"><b>${h(r.name)}</b><br><small class="muted">${h(r.sub)}</small></button>`).join('') : '<p class="muted small">No places found.</p>';
      for (const b of $('pp-res').querySelectorAll('[data-i]')) b.onclick = () => choose(results[Number(b.dataset.i)]);
    } catch (err) { $('pp-res').innerHTML = `<p class="lk-err">Search failed: ${h(err.message)}</p>`; }
  };
  // Your Watch places and the map's spot (once the globe has started)
  const more = [];
  const a = nav.app;
  if (a && a.watch.connected()) {
    try { const j = await a.watch.api('/places', { timeoutMs: 8000 }); for (const wp of j.places || []) more.push({ name: wp.name, sub: 'Watch place', lat: wp.lat, lon: wp.lon }); } catch { /* not reachable */ }
  }
  if (a) { const v = a.globe.getView(); more.push({ name: 'Where the map is looking', sub: `${v.lat.toFixed(3)}, ${v.lon.toFixed(3)}`, lat: v.lat, lon: v.lon, map: true }); }
  if (more.length && !$('placepick').hidden) {
    $('pp-more').innerHTML = `<div class="lk-sec"><h2>Or</h2></div>${more.map((r, i) => `<button class="w-pick" data-m="${i}"><b>${h(r.name)}</b><br><small class="muted">${h(r.sub)}</small></button>`).join('')}`;
    for (const b of $('pp-more').querySelectorAll('[data-m]')) b.onclick = () => choose(more[Number(b.dataset.m)]);
  }
}

async function choose(r) {
  closePicker();
  await pick({ lat: r.lat, lon: r.lon, name: r.map ? '' : r.name });
  // Keep the map in step, so the Map tab shows the same place.
  if (nav.app && !r.map) nav.app.globe.flyTo(r.lat, r.lon, 60);
}

async function search(q) {
  const ll = q.match(/^\s*(-?\d+(?:\.\d+)?)\s*[,\s]\s*(-?\d+(?:\.\d+)?)\s*$/);
  if (ll) return [{ name: `${Number(ll[1]).toFixed(4)}, ${Number(ll[2]).toFixed(4)}`, sub: 'Coordinates', lat: Number(ll[1]), lon: Number(ll[2]) }];
  const j = await fetchJSON(fillUrl(ENDPOINTS.geocodeOpenMeteo, { q }));
  let out = (j.results || []).map((r) => ({ name: r.name, sub: [r.admin1, r.country].filter(Boolean).join(', '), lat: r.latitude, lon: r.longitude }));
  if (!out.length) {
    const n = await fetchJSON(fillUrl(ENDPOINTS.geocodeNominatim, { q }));
    out = (Array.isArray(n) ? n : []).map((r) => { const parts = (r.display_name || '').split(', '); return { name: parts[0] || r.name, sub: parts.slice(1, 4).join(', '), lat: Number(r.lat), lon: Number(r.lon) }; });
  }
  return out;
}
