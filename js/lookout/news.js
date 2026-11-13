// "News": local headlines for your place. Google News (through the data relay,
// because it does not let web pages read it directly); GDELT as a backup.

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
    const source = q('source');
    let title = q('title');
    if (source && title.endsWith(` - ${source}`)) title = title.slice(0, -(source.length + 3));
    return { title, source, url: q('link'), t: Date.parse(q('pubDate')) || 0 };
  }).filter((x) => x.title && /^https?:\/\//.test(x.url));
}

async function headlines(p, which) {
  const place = placeName(p);
  const stateName = STATES[p.state] || p.stateName || '';
  const q = which === 'hour' ? `"${p.city || p.name}" ${stateName} when:1h` : `"${p.city || p.name}" ${stateName} when:7d`;
  return remember(`news:${which}:${place}`, 10 * 60e3, async () => {
    // Google sometimes turns the relay away for a moment ("unusual traffic"); one retry usually gets through.
    const google = () => getData(fillUrl(ENDPOINTS.googleNews, { q }), { type: 'text', timeoutMs: 15000 });
    try {
      let xml;
      try { xml = await google(); } catch { await new Promise((r) => setTimeout(r, 1500)); xml = await google(); }
      const list = parseRss(xml);
      return { list: list.sort((a, b) => b.t - a.t), via: 'Google News' };
    } catch (e) {
      if (which === 'hour') throw e;
      // Backup: GDELT's article search (last 3 days)
      const gq = `"${p.city || p.name}"${stateName ? ` "${stateName}"` : ''} sourcecountry:US sourcelang:english`;
      const j = await getData(fillUrl(ENDPOINTS.gdeltNews, { q: gq }), { timeoutMs: 20000 });
      const seen = new Set();
      const list = (j.articles || []).filter((a) => { const k = String(a.title || '').toLowerCase().slice(0, 60); if (!k || seen.has(k)) return false; seen.add(k); return true; })
        .map((a) => { const s = a.seendate || ''; return { title: a.title, source: a.domain || '', url: a.url, t: s ? Date.parse(`${s.slice(0, 4)}-${s.slice(4, 6)}-${s.slice(6, 8)}T${s.slice(9, 11)}:${s.slice(11, 13)}:00Z`) : 0 }; });
      return { list, via: 'GDELT' };
    }
  });
}

async function render() {
  const p = getPlace();
  const box = $('lk-news');
  if (!p) { box.innerHTML = '<div class="lk-empty">Finding where you are…</div>'; return; }
  const n = ++seq;
  box.innerHTML = `<div class="seg lk-seg"><button data-s="local" class="${span === 'local' ? 'on' : ''}">This week</button><button data-s="hour" class="${span === 'hour' ? 'on' : ''}">Last hour</button></div>
    <div id="nw-list"><div class="lk-empty">Loading headlines for ${h(placeName(p))}…</div></div>
    ${section('More news')}<div class="lk-rows">${newsLinks(p).map(row).join('')}</div>`;
  for (const b of box.querySelectorAll('[data-s]')) b.onclick = () => { span = b.dataset.s; render(); };
  try {
    const r = await headlines(p, span);
    if (n !== seq || !$('nw-list')) return;
    $('nw-list').innerHTML = r.list.length
      ? `${r.list.slice(0, 40).map((a) => `<a class="story" href="${h(a.url)}" target="_blank" rel="noopener"><div><b>${h(a.title)}</b><small>${h([a.source, a.t ? ago(a.t) : ''].filter(Boolean).join(' · '))}</small></div></a>`).join('')}<p class="muted small">Headlines from ${h(r.via)}. Stories open in Safari.</p>`
      : `<div class="lk-empty">${span === 'hour' ? 'Nothing new in the last hour.' : 'No local headlines found this week.'}</div>`;
  } catch (e) {
    if (n === seq && $('nw-list')) $('nw-list').innerHTML = `<div class="lk-empty">Headlines did not load (${h(e.message)}). The links below always work.</div>`;
  }
}
