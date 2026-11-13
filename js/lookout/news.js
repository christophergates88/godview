// "News": local headlines for your place. Google News (through the data relay,
// because it does not let web pages read it directly); Bing News, then GDELT, as backups.

import { $, h, row, section, getData, remember, fillUrl, ago } from './common.js';
import { getPlace, onPlace } from './place.js';
import { newsLinks, placeName } from './links.js';
import { ENDPOINTS } from '../config.js';
import { STATES } from './common.js';

let visible = false; let span = 'local'; let seq = 0;

export function init() { onPlace(() => { if (visible) render(); }); }
export function show() { visible = true; render(); }
export function hide() { visible = false; }

// RSS (Google News) -> [{ title, source, url, t }]
export function parseRss(xml) {
  const doc = new DOMParser().parseFromString(String(xml || ''), 'text/xml');
  return [...doc.querySelectorAll('item')].map((it) => {
    const q = (sel) => (it.querySelector(sel)?.textContent || '').trim();
    const source = q('source') || (it.getElementsByTagName('News:Source')[0]?.textContent || '').trim();
    let title = q('title');
    if (source && title.endsWith(` - ${source}`)) title = title.slice(0, -(source.length + 3));
    return { title, source, url: q('link'), t: Date.parse(q('pubDate')) || 0 };
  }).filter((x) => x.title && /^https?:\/\//.test(x.url));
}

// Google turns the relay away now and then ("unusual traffic"), sometimes for a long while, and answers slowly when
// it does. After a turn-away, go straight to Bing for a while instead of making every screen wait on Google again.
let googleOffUntil = 0;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// Bing ranks by relevance and mixes in old stories: ask for the county and the town, keep the recent ones.
async function bingList(p, town, stateName, which) {
  const qs = [...new Set([p.county ? `${p.county} ${stateName}` : '', `${town} ${stateName}`].filter(Boolean))];
  const parts = await Promise.allSettled(qs.map((x) => getData(fillUrl(ENDPOINTS.bingNews, { q: x }), { type: 'text', timeoutMs: 12000 }).then(parseRss)));
  if (parts.every((r) => r.status === 'rejected')) throw parts[0].reason;
  const since = Date.now() - (which === 'hour' ? 3600e3 : 30 * 86400e3);
  const seen = new Set();
  return parts.flatMap((r) => (r.status === 'fulfilled' ? r.value : [])).filter((a) => {
    const k = a.title.toLowerCase().slice(0, 60);
    if (seen.has(k)) return false;
    seen.add(k);
    return a.t >= since;
  }).sort((a, b) => b.t - a.t);
}

async function headlines(p, which) {
  const place = placeName(p);
  const stateName = STATES[p.state] || p.stateName || '';
  const town = p.city || p.name;
  // The town or its county ("North Twiggs" alone finds little; "Twiggs County" finds the local paper).
  const where = p.county && p.county !== town ? `("${town}" OR "${p.county}")` : `"${town}"`;
  const q = `${where} ${stateName} when:${which === 'hour' ? '1h' : '7d'}`;
  return remember(`news:${which}:${place}`, 10 * 60e3, async () => {
    // Google first; Bing is asked as soon as Google fails or is slow (2.5 s), and used if Google has not answered by 4 s.
    const tryGoogle = Date.now() >= googleOffUntil;
    let gotGoogle = false;
    const g = tryGoogle
      ? getData(fillUrl(ENDPOINTS.googleNews, { q }), { type: 'text', timeoutMs: 12000 }).then((xml) => { gotGoogle = true; return parseRss(xml).sort((a, b) => b.t - a.t); })
      : Promise.reject(new Error('Google News is turning the relay away'));
    g.catch(() => { if (tryGoogle) googleOffUntil = Date.now() + 15 * 60e3; });
    const b = Promise.race([g.catch(() => null), sleep(2500)]).then(() => (gotGoogle ? null : bingList(p, town, stateName, which)));
    b.catch(() => {});
    const first = await Promise.race([g.then((list) => ({ list }), () => ({ failed: true })), sleep(4000).then(() => ({ late: true }))]);
    if (first.list) return { list: first.list, via: 'Google News' };
    let bl = null;
    try { bl = await b; } catch { /* Bing did not answer either */ }
    if (bl && (bl.length || first.failed)) return { list: bl, via: 'Bing News' };
    if (first.late) { try { return { list: await g, via: 'Google News' }; } catch { /* */ } }
    if (bl) return { list: bl, via: 'Bing News' };
    if (which === 'hour') throw new Error('the news services did not answer');
    // Last resort: GDELT's article search (last 3 days)
    const gq = `"${town}"${stateName ? ` "${stateName}"` : ''} sourcecountry:US sourcelang:english`;
    const j = await getData(fillUrl(ENDPOINTS.gdeltNews, { q: gq }), { timeoutMs: 20000 });
    const seen = new Set();
    const list = (j.articles || []).filter((a) => { const k = String(a.title || '').toLowerCase().slice(0, 60); if (!k || seen.has(k)) return false; seen.add(k); return true; })
      .map((a) => { const s = a.seendate || ''; return { title: a.title, source: a.domain || '', url: a.url, t: s ? Date.parse(`${s.slice(0, 4)}-${s.slice(4, 6)}-${s.slice(6, 8)}T${s.slice(9, 11)}:${s.slice(11, 13)}:00Z`) : 0 }; });
    return { list, via: 'GDELT' };
  });
}

async function render() {
  const p = getPlace();
  const box = $('lk-news');
  if (!p) { box.innerHTML = '<div class="lk-empty">Finding where you are…</div>'; return; }
  const n = ++seq;
  box.innerHTML = `<div class="seg lk-seg"><button data-s="local" class="${span === 'local' ? 'on' : ''}">Recent</button><button data-s="hour" class="${span === 'hour' ? 'on' : ''}">Last hour</button></div>
    <div id="nw-list"><div class="lk-empty">Loading headlines for ${h(placeName(p))}…</div></div>
    ${section('More news')}<div class="lk-rows">${newsLinks(p).map(row).join('')}</div>`;
  for (const b of box.querySelectorAll('[data-s]')) b.onclick = () => { span = b.dataset.s; render(); };
  try {
    const r = await headlines(p, span);
    if (n !== seq || !$('nw-list')) return;
    $('nw-list').innerHTML = r.list.length
      ? `${r.list.slice(0, 40).map((a) => `<a class="story" href="${h(a.url)}" target="_blank" rel="noopener"><div><b>${h(a.title)}</b><small>${h([a.source, a.t ? ago(a.t) : ''].filter(Boolean).join(' · '))}</small></div></a>`).join('')}<p class="muted small">Headlines from ${h(r.via)}. Stories open in Safari.</p>`
      : `<div class="lk-empty">${span === 'hour' ? 'Nothing new in the last hour.' : 'No recent local headlines found.'}</div>`;
  } catch (e) {
    if (n === seq && $('nw-list')) $('nw-list').innerHTML = `<div class="lk-empty">Headlines did not load (${h(e.message)}). The links below always work.</div>`;
  }
}
