// The app itself: builds the globe, starts the layers and the controls.

import { LAYERS } from './layers/index.js';
import { LayerManager } from './core/layer-manager.js';
import { settings } from './core/settings.js';
import * as globe from './globe.js';
import { initUI } from './ui.js';

export async function start() {
  const viewer = globe.createGlobe('globe', 'credits');
  globe.setBasemap(settings.get('basemap'));
  globe.setViewStyle(settings.get('viewStyle'));

  const s = settings.get('start');
  globe.jumpTo(Number(s.lat), Number(s.lon), Number(s.heightKm) || 900);

  const manager = new LayerManager(viewer, LAYERS);
  initUI({ viewer, manager, layers: LAYERS });

  // Turn on the layers that were on last time.
  const enabled = settings.get('enabled');
  for (const layer of LAYERS) if (enabled[layer.id]) manager.enable(layer.id, true);

  // Layers that depend on where you are looking (flights) reload when the camera stops.
  let t = null;
  globe.onCameraIdle(() => { clearTimeout(t); t = setTimeout(() => manager.viewChanged(), 600); });

  // Handy for debugging in the browser console: GodView.manager.state
  window.GodView = { viewer, manager, settings, layers: LAYERS, globe };
}
