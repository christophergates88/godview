// Moving between the tabs, and reaching the globe app once it has started.
// (Its own module so the screens and the tab bar do not import each other.)

let showFn = () => {};
export const nav = { app: null };
const waiting = [];

export function setShow(fn) { showFn = fn; }
export const go = (tab, opts) => showFn(tab, opts);

// The globe app: { viewer, manager, globe, watch, status, ui } once it has started.
export function whenApp(fn) { if (nav.app) fn(nav.app); else waiting.push(fn); }
export function setApp(a) {
  nav.app = a;
  for (const fn of waiting.splice(0)) { try { fn(a); } catch (e) { console.error(e); } }
}

// Open the Map tab at a point; optionally switch on a layer and open one of its items.
export function showOnMap({ lat, lon, heightKm = 6, layer = null, key = null }) {
  go('map');
  whenApp(async (a) => {
    a.globe.flyTo(lat, lon, heightKm);
    if (!layer) return;
    if (!a.manager.state[layer]?.enabled) a.manager.enable(layer, true);
    if (key == null) return;
    for (let i = 0; i < 40; i++) { // wait up to ~20 s for the layer to load around the new view
      const s = a.manager.state[layer];
      if (s && s.status === 'ok' && a.ui.openLayerItem(layer, String(key))) return;
      await new Promise((r) => setTimeout(r, 500));
    }
  });
}
