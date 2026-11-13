# GodView

A personal "live Earth" viewer: a 3D globe you can spin and zoom, with 46
layers of live public data in seven groups — air, space, sea, weather, earth
hazards, ground & infrastructure, and signals & media. Tap anything for
details; follow a moving aircraft, satellite or train; tap empty ground for the
weather there; press the (i) button for a plain-language "What's here" briefing.

It is a plain static website (no build step), made for iPhone first and also
comfortable on a Mac. Most layers need no key; a few go through your own small
relay, and two optional layers use free keys (see below).

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
| `js/config.js` | **The one place to change things**: library versions, every data URL, the relay host list, optional keys, layer groups, refresh intervals, start location, base maps, colours. |
| `js/main.js` | Start-up: applies the theme, loads the globe library, starts the app. |
| `js/app.js` | Wires everything together; turns on default layers a quarter-second apart. |
| `js/globe.js` | The 3D globe (CesiumJS, no Cesium ion account): base maps, view styles, camera, tapping, follow, icons. |
| `js/ui.js` | Everything you touch: grouped layer panel with filter, detail card (photos, audio, extra details), "What's here", search, my location, settings. |
| `js/brief.js` | Builds the "What's here" briefing from the loaded layers. |
| `js/core/layer-manager.js` | Runs the layers: timers, error back-off, staggered refreshes, pause in background, status, and `selfTest()`. |
| `js/core/net.js` | Fetch with timeout, readable errors, cache, and `get()` which goes direct or through the data relay automatically. |
| `js/core/settings.js`, `units.js` | Saved settings and keys (this browser only); imperial/metric formatting. |
| `js/layers/index.js` | **The layer list** and a description of the layer interface. |
| `js/layers/*.js` | One file per layer (46). `_template.js` is a starting point. |
| `js/layers/lib/` | Shared helpers: `point-layer.js`, `shape-layer.js`, `imagery-layer.js` (layer factories), `overpass.js` (OpenStreetMap), `geo.js`, `icons.js`, `airports.js`. |
| `extras/flight-relay-worker.js` | The data relay (Cloudflare Worker) source. Not loaded by the app. |
| `test/` | Offline test harness (not part of the app). |

## How to add a layer

1. Copy `js/layers/_template.js` (it uses `makePointLayer`, so a layer is ~20 lines).
2. Add one import and one entry in `js/layers/index.js`, with a `group`.
3. Add its URL to `ENDPOINTS` and its refresh interval to `INTERVALS` in `js/config.js`.
4. If the browser is not allowed to read that host directly (CORS), add the host to
   `RELAY_HOSTS` in `js/config.js` **and** to `ALLOWED_HOSTS` in
   `extras/flight-relay-worker.js`, then redeploy the worker.

The panel row, group count, status, errors, refresh timer, tap card, briefing and
self-test all pick the new layer up automatically.

Instructions you can give an AI assistant: *"Add a GodView layer for X. Follow
js/layers/_template.js and the interface described in js/layers/index.js; put
the URL and interval in js/config.js; register it in js/layers/index.js."*

## The data relay

Some public, keyless feeds do not let web pages read them (the browser "CORS"
rule). GodView sends only those through your own relay, a tiny Cloudflare
Worker (`extras/flight-relay-worker.js`). It is GET-only, answers only your
GitHub Pages address, and forwards only to the hosts in its allow-list:

`api.adsb.lol`, `opensky-network.org`, `api.airplanes.live`, `opendata.adsb.fi`,
`nasstatus.faa.gov`, `www.ndbc.noaa.gov`, `www.nhc.noaa.gov`,
`droughtmonitor.unl.edu`, `www.submarinecablemap.com`, `511ga.org`,
and as fallbacks only (direct is tried first): `services3.arcgis.com`,
`firms.modaps.eosdis.nasa.gov`, `overpass-api.de`.

Settings > Data relay holds the relay address (the built-in one is used when blank).

## Layers (46) and their sources

"Direct" = the browser reads it itself. "Relay" = through your data relay.
"Key" = needs a free key in Settings > API keys. "Computed" = no network.
"Area" = loads only the area in view and reloads when you move.
On by default for a first visit: Flights, Satellites (brightest), Rocket launches,
Day/night, US weather alerts, Earthquakes, Fires & events.

| Group | Layer | Source | Via | Limits / notes |
|---|---|---|---|---|
| Air | Flights | adsb.lol (then OpenSky, airplanes.live) | Relay | Area; ODbL; no SLA |
| Air | Military aircraft | adsb.lol `/v2/mil` | Relay | Worldwide, as tagged by adsb.lol |
| Air | Emergency squawks | adsb.lol `/v2/sqk/7500,7600,7700` | Relay | Codes can be set by mistake |
| Air | FAA airport delays | nasstatus.faa.gov | Relay | Only airports in the built-in list are placed |
| Air | Major airports | Built-in list | Computed | Approximate positions |
| Space | Satellites: brightest, space stations, Starlink, GPS, weather, geostationary | CelesTrak + satellite.js | Direct | Each group downloaded at most every 2 h (CelesTrak blocks repeats); Starlink is large and slower on phones |
| Space | Rocket launches | Launch Library 2 (The Space Devs) | Direct | 15 requests/hour without a key; cached 30 min |
| Space | Aurora forecast + Kp | NOAA SWPC | Direct | Model forecast |
| Space | Day/night, Sun & Moon | Computed | Computed | ~0.5° accuracy |
| Sea | Tides & water levels | NOAA CO-OPS | Direct | Tap a station to load readings |
| Sea | Ocean buoys | NOAA NDBC latest_obs.txt | Relay | |
| Weather | Weather radar | RainViewer | Direct | Past 2 h, zoom 7, 100 req/min |
| Weather | US weather alerts | NWS api.weather.gov | Direct | Zone-only alerts counted, not drawn |
| Weather | Storm reports | NOAA SPC today.csv | Direct | Preliminary, since 12Z |
| Weather | Severe storm outlook | NOAA SPC Day 1 GeoJSON | Direct | |
| Weather | Hurricanes & tropical storms | NOAA NHC CurrentStorms.json | Relay | Empty out of season |
| Weather | NASA satellite view (daily) | NASA GIBS (VIIRS true colour, yesterday) | Direct | Swath gaps are normal |
| Weather | Night lights | NASA GIBS Black Marble 2016 | Direct | Not live |
| Weather | Temperature & wind grid | Open-Meteo | Direct | Area; 5×5 grid; 10,000 calls/day |
| Weather | Air quality (AQI) | Open-Meteo air quality (CAMS) | Direct | Area; modelled, not station data |
| Hazards | Earthquakes | USGS | Direct | |
| Hazards | Fires & events | NASA EONET | Direct | Not official |
| Hazards | Wildfire perimeters / incidents (US) | NIFC WFIGS (ArcGIS) | Direct (relay fallback) | Perimeters simplified, largest 300 |
| Hazards | Satellite fire detections | NASA FIRMS | Key (`firms`) | Area; last 24 h |
| Hazards | Volcano alerts (US) | USGS HANS | Direct | Elevated volcanoes only |
| Hazards | River gauges & floods | NOAA NWPS | Direct | Area |
| Hazards | Drought (US) | U.S. Drought Monitor | Relay | Large file; weekly |
| Ground | Georgia traffic cameras / road incidents | Georgia 511 | Key (`ga511`) + relay | 10 calls/min |
| Ground | California traffic cameras | Caltrans CWWP2 | Direct | Area (California only) |
| Ground | Amtrak trains | Amtraker API (unofficial) | Direct | |
| Ground | Bike share docks | GBFS (6 Lyft-run US systems) | Direct | Area; nearest supported system |
| Ground | Power plants, Nuclear plants, Plate-reader cameras (ALPR), Comms towers | OpenStreetMap via Overpass | Direct (relay fallback) | Area; one query at a time; volunteer-mapped, incomplete |
| Ground | Submarine cables | TeleGeography (CC BY-NC-SA) | Relay | Approximate routes |
| Signals | Radio stations | radio-browser.info | Direct | Area; plays https streams only |
| Signals | Wikipedia nearby | MediaWiki geosearch | Direct | Within 10 km of view centre |
| Signals | Wildlife sightings | iNaturalist | Direct | Area; last 7 days |

Not included, and why: ship AIS (aisstream.io forbids browser connections),
lightning (no permitted keyless source found), FAA TFRs and GOES imagery (could
not verify formats this round), webcams (Windy needs a key in a header the relay
does not forward), internet outages (IODA needs country shapes; not done yet),
news events (GDELT GEO endpoint could not be verified).

## Self-test

Open the site, then in the browser console run `await GodView.selfTest()`. Every
layer does one real fetch for central Georgia (about 300 km), whether or not it
is switched on, and you get back a list of `{ id, name, ok, count, ms, via, error }`.
It finishes within 60 seconds, draws nothing and changes no settings (it may
save downloaded data in the cache, as normal use does).

## Settings (all stored only in this browser)
Units, start location (default: Georgia, USA), API keys (Georgia 511, NASA
FIRMS), data relay, earthquake feed, event window, refresh intervals (with
safe minimums), sources and credits, reset. Group open/closed and which layers
are on are remembered.

Note: every site under `YOUR-USERNAME.github.io` shares one browser storage
area (about 5 MB). GodView keeps its use small (the Starlink satellite group is
the largest at ~2 MB).

## Testing (for developers / AI assistants)
`cd test && npm install && npm test` — runs logic checks in Node, then loads the
real app in headless Chrome with every network request answered from local
sample data (`test/fixtures.mjs`, hand-made in each provider's documented
format) and checks every layer, the relay path, the self-test, the grouped
panel, the briefing, taps, cards, follow, search, settings migration and failure
handling. These samples are not live data, so passing tests do not prove a live
feed works; `GodView.selfTest()` on the real site does that. Screenshots go to `test/out/`. Set `CHROME=/path/to/chrome` if needed.

Credits: CesiumJS (Apache 2.0), satellite.js (MIT), and the data providers above.
Public feeds can be late, incomplete or wrong — not for navigation or safety decisions.
