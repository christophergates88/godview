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
| (cards) | Plane route and details | adsbdb.com | Direct | On tap only; route data may not be copied into other databases |
| (cards) | Plane photos | planespotters.net | Direct | On tap only; photographer credit shown with a link |

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

## Using it (v4)

- **The top line answers first:** a headline for where you are (your location
  if you allowed it, else your first watched place, else the start point) and
  up to three facts, all from live loaded data. Tap it for "What's here"; touch
  the map and it shrinks to a pill.
- **Modes, not switches:** the tiles at the bottom set the whole map in one tap:
  Around me, Sky, Storm, Hazards, Roads, Night, Everything, My mix. Your last
  mode is remembered. "All layers" opens the full grouped list; changing a
  layer by hand turns the mode into "My mix". Edit `js/modes.js` to change what
  a mode shows.
- **A calm map:** far out, aircraft are small dots coloured by height (amber
  low, teal mid, blue high); closer in, the nearest become plane icons with
  heading; emergency (red) and military (lime) aircraft always stand out with a
  label. Busy point layers (buoys, gauges, cameras) show only the nearest 120 as
  small dots when zoomed out.
- **Cards lead with a sentence:** e.g. "Delta 1432, Atlanta to New York, Boeing
  737, 34,000 ft, climbing." Route and aircraft come from adsbdb.com (looked up
  only when you tap; routes can be out of date) and photos from
  planespotters.net with the photographer credited. An owner is shown only when
  it is an airline, company or agency, never a private person.
- The map draws at up to 2x sharpness when still and lighter while moving.

## Watch, Brief, Remember (the watch service)

GodView can keep watching your places while the app is closed. A small
Cloudflare Worker (`server/watch/worker.js`) checks every 5 minutes, sends phone
alerts through the ntfy app, writes a morning brief at 6:15 (New York time,
daylight saving handled), and keeps a short history per place.

**Set it up (once, on the Mac):** copy the `server` folder's contents to
Documents › GodView, then double-click **Deploy GodView Watch**. It prints
(a) the ntfy topic to subscribe to on your iPhone and (b) a setup link to open
once on each device. The link stores the key in that browser and is removed
from the address bar. Run it again any time; it only updates.

**In the app:** the bell button opens **Places** (big tiles: all clear /
heads-up / act now), **Alerts** (mark done, clear all) and **Brief**. Tap a place
for its 30-day timeline and "normal vs now". Add places by search, by tapping
the globe, or with your location. If the service is not set up, the map still
works and the screen says what to do.

**What it checks per place:** NWS alerts at the point (new, updated, ended),
SPC storm reports in the radius, earthquakes (by size and distance), wildfires
within 25+ miles and whether they are getting closer, river gauges reaching
action/flood stage, aircraft emergency codes within 25 miles, military aircraft
low nearby and aircraft staying low overhead (a guess from position only),
hurricane forecast cones, air quality (modelled), aurora chance after dark,
visible Space Station passes (approximate, ±2 min) and rocket launches that may
be visible. Which checks run depends on the place kind (home, family, property,
route, client).

**Alerts:** "act now" always notifies; "heads-up" notifies except in quiet hours
(10 PM–6 AM), when it waits for the morning brief; "info" only goes in the brief.
Nothing repeats. Places live only in your own Cloudflare storage, never in this
code. If a Keychain item `godview-anthropic` exists, Claude (model
`claude-haiku-5-5`) words the brief using only the facts; otherwise the brief is
rule-based.

**Tests:** `node server/watch/test/run.mjs` (worker logic with mocked sources and
storage) and `bash server/test/deploy-mock.sh fresh` (deploy script against a fake
Keychain and a fake Cloudflare API). In the browser console on the live site,
`await GodView.watchSelfTest()` runs every watch check once for a public test
point (Georgia State Capitol) without sending alerts or saving anything.

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

## People & records (group 8, 9 layers, all off by default)

"Records of people you never thought about", with a hard privacy line.

**The privacy line (not negotiable).** GodView shows people only in their
**public role** (elected officials, public figures with a Wikipedia article),
**official public appeals** (NCMEC missing-child posters, shown exactly as
published), **organizations**, and people **in aggregate** (Census numbers).
It never looks up or shows private individuals: no who-lives-at-an-address,
no property owners, no voter rolls, no court, arrest or inmate records, no
individual political donors, no home addresses of private persons, no
sex-offender maps, no people-search of any kind. Where a public registry mixes
organizations and private persons, every name passes through
`js/layers/lib/privacy.js` first: a name that looks like a person or a home is
replaced by "Privately registered" / "Private site", with no name and no street
address. When in doubt, the name is withheld. State legislators' district-office
addresses are never shown (they can be home addresses).

| Layer | Source | Via | Notes |
|---|---|---|---|
| Who's in charge here | Census TIGERweb (districts), @unitedstates congress-legislators, Open States CSV, Wikidata, OpenFEC | Direct (relay fallback) | Senators, representative, governor, state legislators, school district; official links; campaign committee totals load when the card opens (FEC DEMO_KEY: ~30 calls/hour). Also adds its rows when you tap bare ground while it is on. No local officials (no open nationwide source). |
| The people here (Census) | Census ACS 5-year (2020–2024) via Census Reporter; backup: Census Data API | Direct (backup: key `census` + relay) | Tract and county: a few big numbers, never individuals. The Census API itself needs a free key and has no CORS, so it is only a backup |
| Notable people born here | Wikidata + Wikipedia | Direct | Only people with an English Wikipedia article, at their birthplace |
| Federal money here | USAspending.gov | Direct (POST; no relay possible) | Top contract and grant recipients in the county, last 12 months; persons counted, never named |
| EPA-regulated sites | EPA ECHO | Direct (relay fallback) | Up to 10 miles round the view centre (smaller where sites are dense); inspections, violations, penalties; red = violation now |
| Hospitals & nursing homes | OpenStreetMap via Overpass | Direct (relay fallback) | Locations only, with a link to Medicare Care Compare for official star ratings (CMS's own data service blocks web pages and the relay) |
| Bank branches (FDIC) | FDIC BankFind | Direct (relay fallback) | One state per request; nearest branches kept |
| Disaster declarations (FEMA) | OpenFEMA | Direct (relay fallback) | County and statewide declarations |
| Missing children (NCMEC) | NCMEC state RSS | Relay | Official posters only, unchanged; placed at the town they name. Not AMBER Alerts. |

Optional keys (Settings > API keys): Open States (state legislators straight from
its API), an api.data.gov key for the FEC (higher limit than DEMO_KEY) and a
Census API key (backup for the Census numbers; free at api.census.gov/data/key_signup.html).
Relay hosts used by this group (add to `ALLOWED_HOSTS` in the worker):
`www.missingkids.org` (needed), and as fallbacks `tigerweb.geo.census.gov`,
`data.openstates.org`, `v3.openstates.org`, `api.open.fec.gov`, `api.censusreporter.org`,
`echodata.epa.gov`, `api.fdic.gov`, `www.fema.gov`; `api.census.gov` always goes through the relay.

`GodView.selfTest()` checks each layer's main fetch. To check every source this
group uses (each one once), run `await GodViewPeople.check()` in the console.

Not built, and why: OSHA inspections (the Labor Department API needs a key and
its OSHA dataset could not be verified), FCC licences and FAA aircraft owners (no
keyless source that gives the registrant type was verified; the filter for them,
FAA type codes included, is ready in `privacy.js`), nonprofits (ProPublica's API
cannot search by place), city 311/permit portals (no common source).

## Earth pack: "Live from orbit" and more live systems (added 2026-11-12)

23 more layers, all off until you switch them on, in `js/layers/earth-pack.js`. Every address
was loaded from the live site first, so each one is known to answer a web page directly (no relay, no key).

| Group | Layer | Source | Notes |
|---|---|---|---|
| Live from orbit | Live clouds: the Americas / the Pacific | NASA GIBS, GOES-East and GOES-West GeoColor | Newest frame, about an hour old, new every 10 minutes |
| Live from orbit | Live clouds in infrared: Asia and Australia | NASA GIBS, Himawari | About an hour old |
| Live from orbit | Rain and snow falling, worldwide | NASA GIBS, IMERG half-hourly | 5 to 7 hours behind |
| Live from orbit | Sea surface temperature; Snow on the ground; Smoke, dust and haze; Air pollution (NO2); Flood water (3-day); Earth last night | NASA GIBS | Daily products, each a day or more behind |
| Live from orbit | Where people live | NASA GIBS, SEDAC population density 2020 | Fixed picture |
| Weather | US radar, full detail (NEXRAD) | Iowa Environmental Mesonet | National mosaic, new every 5 minutes, US only |
| Weather | Weather radar sites and their status | NWS api.weather.gov | 159 radars: state, alarms, last data |
| Earth hazards | World disaster alerts (GDACS) | gdacs.org | Green wildfires and droughts are left out to keep the map readable |
| Earth hazards | Stream and lake gauges, live (USGS) | waterservices.usgs.gov | Area; can take 10 seconds |
| Space | Deep Space Network | NASA DSN Now feed | Which spacecraft each dish is talking to |
| Sea | Ships, live: Baltic Sea | Fintraffic Digitraffic AIS | Finland's waters only; worldwide ship feeds do not allow web pages |
| Sea | Wave height at sea | Open-Meteo marine | Area grid; land points left out |
| Sea | Sea marks | OpenSeaMap tiles | Zoom in near a coast |
| Ground | High-voltage power lines (US) | HIFLD transmission lines | Area; first 800 lines in view |
| Ground | Railways of the world | OpenRailwayMap tiles | Personal, low-volume use |
| Ground | 3D terrain | Esri World Elevation | A switch: real relief instead of a smooth globe |
| Signals | Internet disruptions by country | IODA, Georgia Tech | One signal alone is often noise; two or more is a stronger sign |

**Power plants and Nuclear plants now always load.** They used to ask OpenStreetMap's public
servers, which are overloaded ("at capacity") most of the time. They now read a list that ships
with GodView: `js/data/power-plants.json`, the World Resources Institute's Global Power Plant
Database (21,337 plants of 10 MW and up, 2021 snapshot, CC BY 4.0). Plate-reader cameras and
Comms towers still depend on OpenStreetMap's servers and say so when those are full.

`js/layers/lib/gibs.js` makes a NASA picture layer from one line (see `js/layers/orbit.js`): NASA
publishes about 1,300 products, so more are easy to add. Sample data for the tests is in
`test/fixtures-earth.mjs`.

Checked and still not possible without a relay or key: FAA flight restrictions and airport
weather (aviationweather.gov and tfr.faa.gov refuse web pages), NASA fireball reports, US wind
turbines (USGS), GDELT news events (did not answer), Safecast radiation (timed out).
