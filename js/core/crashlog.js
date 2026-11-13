// Crash notes. On an iPhone, when a page uses more memory than iOS allows, iOS
// stops it without warning and the GodView app starts it again. The page can't
// see that happen, so it keeps a short trail of what you were doing; if the last
// session never closed normally, that trail is kept as "the last problem" and
// shown once on start and in Settings › About. Everything stays in this browser.

const ALIVE = 'godview.alive.v1';
const TRAIL = 'godview.trail.v1';
const LAST = 'godview.lastproblem.v1';
const read = (k) => { try { return JSON.parse(localStorage.getItem(k) || 'null'); } catch { return null; } };
const write = (k, v) => { try { localStorage.setItem(k, JSON.stringify(v)); } catch { /* storage full or blocked */ } };

let fresh = null;   // a problem found at this start (shown once)

function alive() { write(ALIVE, { t: Date.now() }); }
function closedNormally() { try { localStorage.removeItem(ALIVE); } catch { /* */ } }

export function initCrashLog() {
  const a = read(ALIVE);
  // Still marked as running from less than 30 minutes ago: that session was stopped, not closed.
  if (a && Date.now() - a.t < 30 * 60e3) {
    fresh = { t: a.t, trail: (read(TRAIL) || []).slice(-8) };
    write(LAST, fresh);
  }
  write(TRAIL, []);
  alive();
  setInterval(() => { if (!document.hidden) alive(); }, 20000);
  document.addEventListener('visibilitychange', () => (document.hidden ? closedNormally() : alive()));
  addEventListener('pagehide', closedNormally);
}

// A step to remember ("tab map", "report: making"...). Short, no personal data.
export function crumb(what) {
  const trail = read(TRAIL) || [];
  trail.push({ t: Date.now(), what: String(what).slice(0, 60) });
  write(TRAIL, trail.slice(-12));
  if (!document.hidden) alive();
}

export const problemAtStart = () => fresh;
export const lastProblem = () => read(LAST);

// "2:51 PM: tab map → report: making → report: shown"
export function describeProblem(p) {
  if (!p) return '';
  const when = new Date(p.t).toLocaleString([], { weekday: 'short', hour: 'numeric', minute: '2-digit' });
  const steps = (p.trail || []).map((x) => x.what).join(' → ');
  return `${when}${steps ? ` · last steps: ${steps}` : ''}`;
}
