// First-run hint: three taps to learn GodView. Shown once, then never again.
const KEY = 'godview.hint.v1';

export function initHint() {
  let seen = false;
  try { seen = localStorage.getItem(KEY) === '1'; } catch { seen = true; }
  if (seen) return;
  const el = document.getElementById('hint');
  el.hidden = false;
  el.querySelector('#hint-ok').addEventListener('click', () => {
    el.hidden = true;
    try { localStorage.setItem(KEY, '1'); } catch { /* storage blocked: it may show again */ }
  });
}
