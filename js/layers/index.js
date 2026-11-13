// THE LAYER LIST.
// To add a layer: create a file in this folder (copy _template.js), then add
// one import and one entry to the list below. Order here = order in the panel.
//
// Every layer is a plain object with these fields:
//
//   id          short unique name, e.g. 'earthquakes' (also the Settings key)
//   name        label shown in the panel
//   icon        a small inline SVG string (24x24 viewBox) for the panel
//   color       accent colour for the panel chip
//   attribution text crediting the data source (shown in Settings > Sources)
//   interval    refresh interval in seconds is read from config.js INTERVALS[id]
//
//   init(ctx)              optional, runs once when first turned on
//   fetch(ctx)             async, returns raw data. Throw on failure (the app shows the error).
//   render(ctx, data)      draws the data on the globe, returns the item count
//   describe(ctx, key)     returns the detail card for one tapped item:
//                          { title, subtitle, rows: [[label, value], ...], link, followable }
//   position(ctx, key)     optional, current Cesium.Cartesian3 of an item (needed for "Follow")
//   followRange            optional, camera distance in metres when following
//   tick(ctx, now)         optional, called every second for moving things
//   show(ctx, visible)     optional, extra work when toggled (primitives/entities hide automatically)
//   onViewChange(ctx, v)   optional, return true to reload after the camera moves
//   onSettingChange(ctx,k) optional, return true to reload after a setting changes
//   onSelect(ctx, key)     optional, highlight the tapped item (key is null when deselected)
//
// ctx gives the layer: Cesium, viewer, scene, primitives (a collection that
// hides with the layer), entities, settings, fmt (unit formatting), net
// (fetchJSON, fillUrl, cache, FeedError), globe (makeIcon, ...), view(),
// requestRender(), setNote(text).

import flights from './flights.js';
import satellites from './satellites.js';
import earthquakes from './earthquakes.js';
import events from './events.js';
import radar from './radar.js';
import alerts from './alerts.js';

export const LAYERS = [
  flights,
  satellites,
  earthquakes,
  events,
  radar,
  alerts,
];
