// In-app dialogs. The iPhone app's web view silently ignores the browser's own
// confirm() and prompt() boxes (a "Yes" could never be pressed there), so
// GodView never uses them. These look like the rest of the app and work
// everywhere: phone app, Safari, desktop.
//
//   await ask({ title, text, ok: 'Remove', danger: true })   -> true / false
//   await choose({ title, options: [{ label, value }] })     -> value / null

import { escapeHtml } from './core/units.js';

let box = null;
let done = null; // resolves the dialog that is open

function ensure() {
  if (box) return box;
  box = document.createElement('div');
  box.id = 'dlg';
  box.className = 'dlg';
  box.hidden = true;
  box.setAttribute('role', 'dialog');
  box.setAttribute('aria-modal', 'true');
  box.addEventListener('click', (e) => { if (e.target === box) finish(null); });
  document.addEventListener('keydown', (e) => { if (!box.hidden && e.key === 'Escape') finish(null); });
  document.body.appendChild(box);
  return box;
}

function finish(value) {
  if (!box || box.hidden) return;
  box.hidden = true;
  box.innerHTML = '';
  const d = done; done = null;
  if (d) d(value);
}

function show(html, wire) {
  ensure();
  if (done) finish(null); // only one at a time; an older one counts as cancelled
  return new Promise((resolve) => {
    done = resolve;
    box.innerHTML = `<div class="dlg-card">${html}</div>`;
    box.hidden = false;
    wire(box);
    (box.querySelector('[data-focus]') || box.querySelector('button'))?.focus();
  });
}

export function ask({ title, text = '', ok = 'OK', cancel = 'Cancel', danger = false } = {}) {
  return show(`
    <h2>${escapeHtml(title || '')}</h2>
    ${text ? `<p>${escapeHtml(text)}</p>` : ''}
    <div class="dlg-btns">
      <button class="btn" data-v="0">${escapeHtml(cancel)}</button>
      <button class="btn ${danger ? 'danger-fill' : 'primary'}" data-v="1" data-focus>${escapeHtml(ok)}</button>
    </div>`, (b) => {
    b.querySelectorAll('[data-v]').forEach((x) => x.addEventListener('click', () => finish(x.dataset.v === '1')));
  }).then((v) => v === true);
}

export function choose({ title, text = '', options = [], cancel = 'Cancel' } = {}) {
  return show(`
    <h2>${escapeHtml(title || '')}</h2>
    ${text ? `<p>${escapeHtml(text)}</p>` : ''}
    <div class="dlg-list">${options.map((o, i) => `<button class="btn" data-i="${i}" ${i === 0 ? 'data-focus' : ''}>${escapeHtml(o.label)}</button>`).join('')}</div>
    <div class="dlg-btns"><button class="btn" data-cancel>${escapeHtml(cancel)}</button></div>`, (b) => {
    b.querySelectorAll('[data-i]').forEach((x) => x.addEventListener('click', () => finish(options[Number(x.dataset.i)]?.value ?? null)));
    b.querySelector('[data-cancel]').addEventListener('click', () => finish(null));
  });
}

export const dialogOpen = () => !!box && !box.hidden;
