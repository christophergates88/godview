# GodView

A personal, lightweight "live Earth" viewer: a 3D globe you can spin and zoom,
with live public data on top — aircraft, satellites, earthquakes, wildfires and
other natural events, weather radar and US weather alerts. Tap anything to see
details; follow a moving aircraft or satellite. Tap empty ground to see the
weather there.

It is a plain static website (no server, no build step, no API keys), made for
iPhone first and also comfortable on a Mac.

## Putting it online (GitHub Pages)

1. Put this whole folder in a GitHub repository (e.g. `godview`).
2. Repository > Settings > Pages > "Deploy from a branch" > `main` / root > Save.
3. Open `https://YOUR-USERNAME.github.io/godview/` on your phone. In Safari:
   Share > Add to Home Screen for an app-like icon.

All paths are relative, so it works under the `/godview/` sub-path.
To try it on a computer first: in this folder run `python3 -m http.server 8000`
and open `http://localhost:8000/` (opening `index.html` directly from disk will not work).

## What each file does

| File | Purpose |
|---|---|
| `index.html` | The page skeleton: top bar, layer sheet, detail card, settings. |
| `css/app.css` | All styling. Phone layout first; desktop layout at the bottom (`@media (min-width: 900px)`). |
| `js/config.js` | **The one place to change things**: library versions, data URLs, refresh intervals, start location, base maps, colours (theme). |
| `js/main.js` | Start-up: applies the theme, loads the globe library, starts the app, shows an error if that fails. |
| `js/app.js` | Wires everything together. |
| `js/globe.js` | The 3D globe (CesiumJS, no Cesium ion account): base maps, view styles (night vision / thermal / CRT shaders), camera, tapping, follow, icons. |
| `js/ui.js` | Everything you touch: layer sheet, detail card, search, my location, settings, coordinate read-out. |
| `js/core/layer-manager.js` | Runs the layers: timers, error back-off, pause in background, status for the panel. |
| `js/core/settings.js` | Settings and optional API keys, saved in this browser only (localStorage). |
| `js/core/net.js` | Fetch with timeout, readable errors, small cache. |
| `js/core/units.js` | Imperial/metric formatting. |
| `js/layers/index.js` | **The layer list** (and a description of the layer interface). |
| `js/layers/*.js` | One file per layer. `_template.js` is a starting point for new ones. |
| `extras/flight-relay-worker.js` | Optional: a tiny relay so live flights can work (see below). Not loaded by the app. |
| `test/` | Offline test harness (not part of the app). |

## How to add a layer

1. Copy `js/layers/_template.js` to e.g. `js/layers/volcanoes.js` and fill in
   `id`, `name`, `icon`, `fetch`, `render`, `describe`.
2. Add one import and one entry in `js/layers/index.js`.
3. Add a refresh interval for it in `js/config.js` → `INTERVALS` (and its URL in `ENDPOINTS`).

That's it: the panel row, chip, toggle, status, error handling, refresh timer,
tap-for-details card and settings entry all appear automatically.
The data source must be keyless and allow browser access (CORS), or need a
key the user enters in Settings → API keys (read it with `apiKeys.get('name')`
from `js/core/settings.js`).

Instructions you can give an AI assistant: *"Add a GodView layer for X. Follow
js/layers/_template.js and the interface described in js/layers/index.js; put
the URL and interval in js/config.js; register it in js/layers/index.js."*

## Data sources, limits and credits

Checked November 2026. "CORS ok" means a test from another website's address
got the `Access-Control-Allow-Origin: *` header that lets a web page read it.

| Layer | Source | Browser access | Limits / rules |
|---|---|---|---|
| Earthquakes | USGS real-time GeoJSON feeds | CORS ok | Feeds update every minute. App default: M2.5+ past day, every 2 min. |
| Satellites | CelesTrak GP data (JSON) + satellite.js | CORS ok | Data changes every 2 h; repeat downloads of the same group before then get HTTP 403, and >50 errors in 2 h can block your IP. The app saves the download in the browser and reuses it for 2 h, and stops retrying on 403/404. |
| Fires & events | NASA EONET v3 | CORS ok | No published limit. NASA says it is for general reference, not official. |
| Weather radar | RainViewer Weather Maps API | CORS ok (JSON and tiles) | Free tier since Jan 2026: past 2 hours only, one colour scheme (Universal Blue), zoom 7 max, 100 requests/min per IP. |
| US weather alerts | NWS api.weather.gov | CORS ok | Limit not published ("generous"). Alerts with only county/zone areas are counted but not drawn. |
| Flights | OpenSky Network, then airplanes.live | **Not confirmed — see below** | OpenSky anonymous: 400 credits/day (the app uses ≤2 per request, every 60 s minimum 30 s). airplanes.live: 1 request/s, non-commercial. |
| Point weather | Open-Meteo forecast API | CORS ok | Free for non-commercial use: 10,000 calls/day. CC BY 4.0. |
| Place search | Open-Meteo Geocoding, then OpenStreetMap Nominatim | CORS ok | Nominatim: max 1 request/s, no search-as-you-type (the app only searches when you press Search). |
| Base maps | Esri World Imagery, CARTO Dark, OpenStreetMap | CORS ok | Attribution shown on screen. Esri and CARTO free use is intended for light, non-commercial use; OSM tiles must not be bulk-downloaded. |

### About live flights (important)
When this was built, every free, keyless aircraft source tested (OpenSky,
airplanes.live, adsb.lol, adsb.fi, ADSB One) either did not send the CORS
header or refused automated test requests, so **a web page probably cannot
read them directly**. The Flights layer still tries OpenSky then airplanes.live,
and if the browser blocks both, it says so in the panel and stops retrying.
Nothing fake is shown.

To get flights working, deploy the tiny relay in `extras/flight-relay-worker.js`
to a free Cloudflare Worker (instructions inside the file), then paste its
address in Settings → Flight data relay. Note: OpenSky is known to block some
cloud-provider addresses, so via a relay airplanes.live is the more likely to work.

## Settings (all stored only in this browser)
Units, refresh intervals (with safe minimums), start location (default:
Georgia, USA), satellite group, earthquake feed, event window, flight relay,
optional API keys for future layers, reset.

Note: every site under `YOUR-USERNAME.github.io` shares one browser storage
area (about 5 MB). GodView keeps its use small (the Starlink satellite group is
the largest at ~2 MB).

## Testing (for developers / AI assistants)
`cd test && npm install && npm test` — runs logic checks in Node, then loads the
real app in headless Chrome with every network request answered from local
sample data (`test/fixtures.mjs`, hand-made in each provider's documented
format) and checks layers, taps, cards, follow, search, settings and failure
handling. Screenshots go to `test/out/`. Set `CHROME=/path/to/chrome` if needed.

Credits: CesiumJS (Apache 2.0), satellite.js (MIT), and the data providers above.
Public feeds can be late, incomplete or wrong — not for navigation or safety decisions.
