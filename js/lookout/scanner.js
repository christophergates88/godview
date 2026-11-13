// "Scanner": police, fire and EMS radio. Systems that publish their dispatch
// calls on OpenMHz play right here, newest calls first, then live as they come
// in. Everything else (Broadcastify and the rest) is one tap away.

import { $, h, row, section, getData, remember, fillUrl, clock, ago } from './common.js';
import { getPlace, onPlace } from './place.js';
import { scannerLinks, safetyLinks } from './links.js';
import { ENDPOINTS } from '../config.js';

let visible = false; let systems = null;
const P = { sys: null, queue: [], played: new Set(), last: 0, poll: null, audio: null, tg: {}, playing: null, history: [] };

const SILENCE = 'data:audio/wav;base64,UklGRiQAAABXQVZFZm10IBAAAAABAAEAESsAACJWAAACABAAZGF0YQAAAAA=';
const norm = (s) => String(s || '').toLowerCase().replace(/\b(county|parish|borough|city of)\b/g, '').replace(/[^a-z]/g, '');

export function init() { onPlace(() => { if (visible) render(); }); }
export function show() { visible = true; render(); }
export function hide() { visible = false; }

const loadSystems = () => remember('omhz:systems', 6 * 3600e3, async () => {
  const j = await getData(ENDPOINTS.openmhzSystems, { timeoutMs: 15000 });
  return (j.systems || []).filter((s) => s && s.shortName);
});

// Systems in your state, your county or city first, then the busiest.
export function rankSystems(all, p) {
  const st = p.state || '';
  const c = norm(p.county); const town = norm(p.city || p.name);
  const base = String(p.county || '').replace(/\s+(county|parish|borough)$/i, '').trim();
  const named = base ? new RegExp(`\\b${base.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\s+(county|parish)\\b`, 'i') : null;
  return all.filter((s) => s.state === st)
    .map((s) => ({ ...s, near: !!((c && norm(s.county) === c) || (town && norm(s.city) === town) || (named && named.test(s.name || ''))) }))
    .sort((a, b) => (b.near - a.near) || ((b.active ? 1 : 0) - (a.active ? 1 : 0)) || ((b.callAvg || 0) - (a.callAvg || 0)));
}

async function render() {
  const p = getPlace();
  const box = $('lk-scanner');
  if (!p) { box.innerHTML = '<div class="lk-empty">Finding where you are…</div>'; return; }
  box.innerHTML = `<div id="sc-player"></div>${section('Dispatch audio you can play here', '<small>OpenMHz</small>')}<div id="sc-list"><div class="lk-empty">Looking for radio systems…</div></div>
    ${section('More scanner feeds')}<div class="lk-rows">${scannerLinks(p).map(row).join('')}</div>
    ${section('Safety and help')}<div class="lk-rows">${safetyLinks(p).map(row).join('')}</div>`;
  drawPlayer();
  try {
    systems = await loadSystems();
    if (!visible || !$('sc-list')) return;
    const mine = rankSystems(systems, p).slice(0, 25);
    $('sc-list').innerHTML = mine.length
      ? `<div class="lk-rows">${mine.map((s, i) => row({ icon: 'radio', title: s.name, sub: [s.near ? 'Your area' : '', s.city || (s.county ? `${s.county} County` : ''), s.lastActive ? `last call ${ago(s.lastActive)}` : ''].filter(Boolean).join(' · '), right: P.sys && P.sys.shortName === s.shortName ? 'Playing' : '', data: { sys: i } })).join('')}</div>`
      : `<div class="lk-empty">No radio system in ${h(p.stateName || p.state || 'this state')} publishes its calls on OpenMHz. The feeds below cover more places.</div>`;
    for (const b of $('sc-list').querySelectorAll('[data-sys]')) b.onclick = () => start(mine[Number(b.dataset.sys)]);
  } catch (e) {
    if ($('sc-list')) $('sc-list').innerHTML = `<div class="lk-empty">OpenMHz did not answer (${h(e.message)}). The feeds below still work.</div>`;
  }
}

function audio() {
  if (!P.audio) {
    P.audio = new Audio();
    P.audio.preload = 'auto';
    P.audio.addEventListener('ended', next);
    P.audio.addEventListener('error', next);
  }
  return P.audio;
}

async function start(s) {
  stop();
  P.sys = s; P.queue = []; P.played = new Set(); P.last = 0; P.history = [];
  // Unlock audio inside the tap (iPhone plays only after a tap).
  const a = audio(); a.src = SILENCE; a.play().catch(() => {});
  drawPlayer('Loading the latest calls…');
  try {
    const tg = await remember(`omhz:tg:${s.shortName}`, 24 * 3600e3, () => getData(fillUrl(ENDPOINTS.openmhzTalkgroups, { system: s.shortName }), { timeoutMs: 15000 }));
    P.tg = (tg && tg.talkgroups) || {};
  } catch { P.tg = {}; }
  await fetchCalls(true);
  P.poll = setInterval(() => { if (P.sys) fetchCalls(false); }, 10000);
  if (visible) render();
}

async function fetchCalls(first) {
  const s = P.sys;
  try {
    const j = await getData(fillUrl(ENDPOINTS.openmhzCalls, { system: s.shortName }), { timeoutMs: 15000 });
    if (P.sys !== s) return;
    const calls = (j.calls || []).filter((c) => c && c.url).map((c) => ({ id: c._id || c.url, url: c.url, t: Date.parse(c.time) || 0, len: c.len || 0, tg: c.talkgroupNum, emergency: !!c.emergency }))
      .sort((a, b) => a.t - b.t);
    // First time: the last few calls, oldest first. Then only new ones.
    const fresh = calls.filter((c) => !P.played.has(c.id) && c.t > P.last);
    const add = first ? fresh.slice(-6) : fresh;
    for (const c of add) { P.queue.push(c); P.played.add(c.id); P.last = Math.max(P.last, c.t); }
    if (!P.playing) next();
    else drawPlayer();
  } catch (e) {
    if (first) drawPlayer(`The calls did not load (${e.message}). Trying again…`);
  }
}

function tgName(num) {
  const t = P.tg[String(num)];
  return t ? (t.description || t.alpha || `Talkgroup ${num}`) : `Talkgroup ${num}`;
}

function next() {
  const c = P.queue.shift();
  P.playing = c || null;
  if (c) {
    P.history.unshift(c); P.history = P.history.slice(0, 30);
    const a = audio(); a.src = c.url; a.play().catch(() => { P.playing = null; drawPlayer('Tap Play to start the sound.'); });
  }
  drawPlayer();
}

export function stop() {
  clearInterval(P.poll); P.poll = null;
  if (P.audio) { P.audio.pause(); P.audio.removeAttribute('src'); }
  P.sys = null; P.playing = null; P.queue = [];
  drawPlayer();
}

function drawPlayer(msg = '') {
  const live = document.querySelector('#tabbar [data-tab="scanner"] .tb-live');
  if (live) live.hidden = !P.sys;
  const box = $('sc-player');
  if (!box) return;
  if (!P.sys) { box.innerHTML = ''; return; }
  const c = P.playing;
  box.innerHTML = `<div class="sc-player">
      <div class="now"><i></i>${c ? 'Playing' : 'Listening for new calls'}</div>
      <div class="sys">${h(P.sys.name)}</div>
      <div class="tg">${c ? `${h(tgName(c.tg))}${c.emergency ? ' · <b style="color:var(--gv-bad)">EMERGENCY</b>' : ''} <small>· ${h(clock(c.t))}</small>` : `<small>${h(msg || 'New calls play as they come in.')}</small>`}</div>
      <div class="btns"><button class="btn" id="sc-skip">Skip</button><button class="btn primary" id="sc-stop">Stop</button></div>
      ${P.history.length ? `<div class="sc-calls">${P.history.map((x) => `<div class="${x === c ? 'on' : ''}"><span>${h(clock(x.t))}</span><span>${h(tgName(x.tg))}</span></div>`).join('')}</div>` : ''}
    </div>`;
  $('sc-skip').onclick = () => { if (P.audio) P.audio.pause(); next(); };
  $('sc-stop').onclick = () => { stop(); if (visible) render(); };
}
