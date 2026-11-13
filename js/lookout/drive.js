// Drive mode: the time, the weather, the most serious alert and the nearest road
// problem in big type, with the screen kept on. Tap Done to leave.

import { $, h, away } from './common.js';
import { getPlace } from './place.js';
import { weather, alerts, roadEvents, WMO, eventTitle } from './feeds.js';
import { fmt } from '../core/units.js';

let tick = null; let data = null; let lock = null;

export async function openDrive() {
  $('drive').hidden = false;
  draw();
  try { lock = navigator.wakeLock ? await navigator.wakeLock.request('screen') : null; } catch { lock = null; }
  await load();
  clearInterval(tick);
  tick = setInterval(() => { draw(); }, 15000);
  setTimeout(function again() { if (!$('drive').hidden) { load(); setTimeout(again, 120000); } }, 120000);
}

export function closeDrive() {
  $('drive').hidden = true;
  clearInterval(tick);
  try { lock && lock.release(); } catch { /* */ }
  lock = null;
}

async function load() {
  const p = getPlace();
  if (!p) return;
  const [w, a, r] = await Promise.allSettled([weather(p), alerts(p), roadEvents(p, 40)]);
  data = { p, w: w.value, a: a.value || [], r: (r.value && r.value.list) || [] };
  draw();
}

function draw() {
  const box = $('drive');
  if (box.hidden) return;
  const now = new Date();
  const d = data || {};
  const c = d.w && d.w.current;
  const top = (d.a || [])[0];
  const road = (d.r || [])[0];
  box.innerHTML = `
    <div class="d-top"><span>${h(d.p ? d.p.name || '' : '')}</span><span>${now.toLocaleDateString([], { weekday: 'long' })}</span></div>
    <div class="d-clock">${now.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })}</div>
    <div class="d-wx">${c ? `${h(fmt.tempC(c.temperature_2m))} · ${h(WMO[c.weather_code] || '')}<small>Wind ${h(fmt.windKmh(c.wind_speed_10m))}${c.wind_gusts_10m > 30 ? `, gusts ${h(fmt.windKmh(c.wind_gusts_10m))}` : ''}</small>` : '&nbsp;'}</div>
    <div class="d-alert ${top ? 'l' + top.level : ''}">${top ? `${h(top.event)}<small>${top.ends ? `Until ${h(new Date(top.ends).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' }))}` : h(top.area.split(';')[0] || '')}</small>` : 'No weather alerts<small>All clear for now</small>'}</div>
    <div class="d-road">${road ? `${h(eventTitle(road))} · ${h(away(d.p, road.lat, road.lon))}` : ''}</div>
    <button class="d-done" id="d-done">Done</button>`;
  $('d-done').onclick = closeDrive;
}

document.addEventListener('visibilitychange', async () => {
  // The screen lock is dropped when the app goes to the background; ask again on return.
  if (!document.hidden && $('drive') && !$('drive').hidden && navigator.wakeLock) { try { lock = await navigator.wakeLock.request('screen'); } catch { /* */ } }
});
