# GodView

A personal "live Earth" viewer: a 3D globe you can spin and zoom, with 46
layers of live public data in seven groups — air, space, sea, weather, earth
hazards, ground & infrastructure, and signals & media. Tap anything for
details; follow a moving aircraft, satellite or train; tap empty ground for the
weather there; press the (i) button for a plain-language "What's here" briefing.

**v7: GodView and Lookout are one app.** A tab bar runs along the bottom:
**Now** (Lookout's quick look: alerts, weather, road events, nearest cameras, your
Watch places, drive mode, safety links), **Map** (the globe), **Cams** (every
public camera nearby, plus traffic and the live Waze map), **Scanner** (police,
fire and EMS dispatch audio that plays in the app, from OpenMHz) and **News**
(local headlines). See "Now, Cams, Scanner, News" below.

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
| `js/infer.js` | "Possibly happening": educated guesses from aircraft and other signals in view (always labelled, with confidence and evidence). |
| `js/reports.js` | The Reports screen and the printable Conditions report. |
| `js/modes.js` | What each mode tile switches on; `UNRELIABLE` lists layers kept out of every mode. |
| `js/core/layer-manager.js` | Runs the layers: timers, error back-off, staggered refreshes, pause in background, status, and `selfTest()`. |
| `js/core/net.js` | Fetch with timeout, readable errors, cache, and `get()` which goes direct or through the data relay automatically. |
| `js/core/settings.js`, `units.js` | Saved settings and keys (this browser only); imperial/metric formatting. |
| `js/layers/index.js` | **The layer list** and a description of the layer interface. |
| `js/layers/*.js` | One file per layer (46). `_template.js` is a starting point. |
| `js/layers/lib/` | Shared helpers: `point-layer.js`, `shape-layer.js`, `imagery-layer.js` (layer factories), `overpass.js` (OpenStreetMap, last-resort fallback), `arcgis.js` (map-service queries + main/fallback switch), `geo.js`, `icons.js`, `airports.js`. |
| `extras/flight-relay-worker.js` | The data relay (Cloudflare Worker) source. Not loaded by the app. |
| `js/lookout/` | The Now, Cams, Scanner and News tabs (shell, place, feeds, viewer, drive mode, links). |
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
`firms.modaps.eosdis.nasa.gov`, `overpass-api.de`, `maps.nccs.nasa.gov`,
`gis.fema.gov`, `mapservices.weather.noaa.gov`.

Settings > Data relay holds the relay address (the built-in one is used when blank).

## Layers (46) and their sources

"Direct" = the browser reads it itself. "Relay" = through your data relay.
"Key" = an optional key in Settings > Keys (no layer needs one). "Computed" = no network.
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
| Hazards | Satellite fire detections | NASA FIRMS VIIRS via Esri Living Atlas | Direct, no key | Area; last 48 h |
| Hazards | Volcano alerts (US) | USGS HANS | Direct | Elevated volcanoes only |
| Hazards | River gauges & floods | NOAA NWPS | Direct | Area |
| Hazards | Drought (US) | U.S. Drought Monitor | Relay | Large file; weekly |
| Ground | Georgia traffic cameras / road incidents | Georgia 511: the copy rebuilt ~every 15 min by the Lookout repo's feed job (raw.githubusercontent.com); with an optional key, the live 511GA API via relay | Direct, no key | Road events older than 3 h are hidden |
| Ground | California traffic cameras | Caltrans CWWP2 | Direct | Area (California only) |
| Ground | Amtrak trains | Amtraker API (unofficial) | Direct | |
| Ground | Bike share docks | GBFS (6 Lyft-run US systems) | Direct | Area; nearest supported system |
| Ground | Power plants | HIFLD Open (EPA/EIA plants), 2025 copy kept by NASA | Direct (relay fallback) | Area; **a frozen 2025 snapshot, not live**; OpenStreetMap only if it is down |
| Ground | Nuclear reactors | NRC daily power-reactor status, published by FEMA | Direct (relay fallback) | Shows % power; 0% usually means refuelling or maintenance; OpenStreetMap only if down |
| Ground | Cell towers | HIFLD Open (FCC cellular licences, 2025 snapshot), read from GodView's weekly data pack; OpenStreetMap if the pack can't be read | Direct | Loads when zoomed in under 400 km; snapshot, not live; carrier names (AT&T, Verizon, T-Mobile) shown plainly |
| Ground | Plate-reader cameras (ALPR) | OpenStreetMap (volunteer-mapped, e.g. DeFlock), read from GodView's weekly data pack; live Overpass only if the pack can't be read | Direct | Coverage is only what volunteers have mapped; shows operator, maker and which way it faces |
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
layer does one real fetch for Macon, Georgia (about 300 km), whether or not it
is switched on, and you get back a list of `{ id, name, ok, count, ms, via, error }`.
Extra rows check the plane-details sources and the four Conditions report
sources (warnings, storm reports, earthquakes, rainfall).
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
- **Reset in one tap (v6):** the first tile in the bottom row, "Reset", puts
  the layers back to how GodView starts (the Around me set) and cancels any
  layers still waiting to switch on. "All layers" has Reset and All off at the
  top, with a count of what is on; Settings has both too. Each says what it did
  and offers Undo for a few seconds.
- **No keys needed (v6):** every layer works without a key. Georgia 511 comes
  from the copy the Lookout repo's GitHub Action builds with the owner's key
  (kept in that repo's secrets); satellite fire detections come from Esri's
  keyless VIIRS service. A 511GA key saved in Settings > Keys only makes Georgia
  511 live instead of every ~15 minutes.
- **No browser pop-ups (v6):** the iPhone app's web view ignores confirm() and
  prompt(), so every question GodView asks is an in-app box (`js/dialog.js`).
- **Layers that always load (v6.1):** plate-reader cameras, cell towers and
  hospitals & nursing homes read GodView's weekly data packs (see "Data packs"
  below) instead of servers that time out. Plate readers are now in the Roads
  mode. Nursing homes show Medicare's ratings, fines, abuse citations and staff
  turnover; hospitals show their star rating and death-rate, safety and
  readmission measures against the national rate.
- **Dark map without a key (v6.1):** CARTO's dark map started showing "API key
  required"; the Dark map is now Esri's keyless dark gray canvas with place names.
- **Connecting a device to Watch (v6.1):** each device keeps its own key, and the
  iPhone app keeps its own copy apart from Safari. The Deploy script copies the
  setup link to the Mac's clipboard; on the iPhone, paste it in the bell panel
  and tap Connect (an empty box reads the clipboard). A brief that falls back to
  plain wording says why.

## Now, Cams, Scanner, News (v7: Lookout inside GodView)

Lookout used to be a separate web app. Its screens are now GodView's tabs, built
in `js/lookout/`, and its old address forwards to GodView's Now tab (the old page
is kept as `lookout/classic.html`).

- **They load before the globe.** `js/main.js` starts the tabs first, so Now shows
  in about a second; the globe starts behind it and joins when ready
  (`attachApp` in `js/lookout/shell.js`). While another tab is open the globe
  stops drawing, which saves battery.
- **One place for every screen.** The place button at the top shows the town it is
  using. It is your location (read quietly only if you already allowed it, since the
  iPhone app asks again on every launch), else the place you picked (search, a Watch
  place, or where the map is looking), else your first Watch place. Picking a place
  also moves the globe there.
- **Now:** the headline (the most serious weather alert, or the Watch check), the
  weather, alerts you can open, Georgia 511 road events in plain words ("Crash ·
  I-16"), the nearest cameras, your Watch places and the latest brief, quick
  buttons (Drive mode, Map here, Scanner, News) and safety links (power outages,
  crime map, wildfires, county emergency info). The Now tab shows a dot when there
  is a warning.
- **Drive mode:** the time, the weather, the most serious alert and the nearest road
  problem in big type; it asks the phone to keep the screen on.
- **Cams:** Georgia 511 traffic cameras and public webcams (Windy, from the Lookout
  feed job) near the place, nearest first, with filters. Tap for a full-screen
  viewer (swipe for the next; traffic cameras refresh every 10 s), "Show on map"
  opens the camera's card on the globe. **Traffic** lists road events and shows the
  live Waze map.
- **Scanner:** radio systems in your state that publish their dispatch calls on
  OpenMHz, your county first. Tap one to hear the latest calls with talkgroup
  names, then new calls as they come in. Broadcastify and the rest are links.
- **News:** local headlines from Google News (through the data relay; one retry,
  then GDELT as a backup), this week or the last hour.
- **Settings > Opens to:** Now (default), Map, or where you left off. A link with
  `?tab=now|map|cams|scanner|news` opens that tab.

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
Nothing repeats. "Possibly" items (see below) are always marked as guesses. Places live only in your own Cloudflare storage, never in this
code. The brief is worded by AI using only the facts: Cloudflare Workers AI by
default (no key; if it writes a number that is not in the facts, the rule-based
text is used instead), or Claude (`claude-haiku-5-5`) if a Keychain item
`godview-anthropic` exists when you deploy. If the AI fails, the brief is
rule-based.

**Tests:** `node server/watch/test/run.mjs` (worker logic with mocked sources and
storage) and `bash server/test/deploy-mock.sh fresh` (deploy script against a fake
Keychain and a fake Cloudflare API). In the browser console on the live site,
`await GodView.watchSelfTest()` runs every watch check once for a public test
point (Georgia State Capitol) without sending alerts or saving anything.

## Possibly happening, Conditions reports, Camera checks (v5)

**Possibly happening (guesses, never facts).** GodView looks at what is loaded
and, for the watch service, at each place every 5 minutes, and points out
things nobody announced. Each one says "Possibly", has a confidence (low /
medium / high) and lists the evidence it used. It shows in the top line (medium
or high only, within about 20 miles), in "What's here" under "Possibly
happening (not confirmed)" and in the Alerts list. Nothing new is drawn on the
map. What it looks for:
- an aircraft circling (turned more than 300° in the last 15 minutes);
- a helicopter low and slow (may be landing or hovering, e.g. a medical flight);
- two or more helicopters, military or emergency aircraft within 5 km;
- a type used as an air tanker flying low (more confident near a listed fire);
- different kinds of signal close together within an hour (storm report, fire,
  road incident, quake, emergency aircraft);
- likely hail at a place: a warning that named hail of 3/4 inch or more,
  plus hail reports within 15 km;
- a quieter or busier sky than normal for that hour and weekday. This needs
  14 days of history; until then it says "not enough history yet".

Not done, and why: go-arounds and holding patterns need longer aircraft tracks
than the watch service keeps; power-outage hints need a public, keyless outage
feed and none was found; radio/scanner transcription was not built because no
scanner source found allows automated transcription.

**Conditions report.** Reports screen (bell › Reports), a place's detail, or
"Conditions report for this spot" in What's here. Pick a place or point, a
time window (up to 7 days) and a radius. The report lists, each with its
source, time and whether it is *official*, *reported*, *measured* or
*estimated*:
- NWS warnings that covered the exact point (with any hail/wind they named);
- storm reports (hail, wind, tornado, flood) with distance and direction;
- radar rainfall estimate (MRMS; only for windows ending in the last 3 hours);
- earthquakes within 300 km;
- fires and the nearest river gauge (current only, for recent windows);
- links to the radar archive.
It never says whether a property was damaged. Print it or save it as PDF;
share or download the JSON. Its SHA-256 fingerprint is of the exact JSON; the
page re-checks it, and when the watch service is connected the report is
stored there (25 a day) so anyone can check it later at
`/report/<fingerprint>`. Without the service it is built in the browser and is
not stored. Hail size estimates from radar (MESH) are not included: no
keyless source for them was found, so hail comes from warnings and reports.

**Camera checks (off by default).** On a Georgia 511 or Caltrans camera card,
"Watch this camera" adds that public road camera to one of your places (up to
6). Turn on "Camera AI" for that place to have AI look at a frame every
hour, or straight away when a heads-up or act-now alert fires. It reports only
what is visible (flooding, smoke, crash, blocked road, snow/ice); an alert is
raised only at 70% confidence or more. A daily cap (50 pictures, shown in the
app) is kept by the service. No key needed: it uses Cloudflare Workers AI
(`@cf/meta/llama-4-scout-17b-16e-instruct`, the `AI` binding the deploy script
adds; free daily allowance of 10,000 neurons, about 50 neurons a picture). If
the `godview-anthropic` Keychain item exists when you deploy, Claude
(`claude-haiku-5-5`, or the `VISION_MODEL` variable) is used instead. It works
only with Georgia 511 and Caltrans cameras, never private cameras.

**Free-plan budget.** The watch run stays under 45 outside requests. A report
uses about 6; each camera check uses 2 (the picture and Claude). The CPU-time
limit of the free plan is the main risk with many places and cameras.

## Settings (all stored only in this browser)
Layers (Reset to start, Turn all off) at the top; then units, start location
(default: Georgia, USA), optional keys (none needed; tucked under "Optional
keys"), data relay, earthquake feed, event window, refresh intervals (with safe
minimums), sources and credits, and "Reset all settings" (asks first, in an
in-app box). Group open/closed and which layers are on are remembered.

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
| Hospitals & nursing homes | Weekly data pack: HIFLD Open hospitals (2025 snapshot) and CMS nursing-home Provider Information; OpenStreetMap if the pack can't be read | Direct | Nursing homes show Medicare's star ratings (overall, inspections, staffing, quality), federal fines and penalties of the last 3 years, abuse citations and Special Focus status, with a link to that home's Care Compare page. Red = flagged by Medicare. A home listed under a person's name is not named |
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
| Ground | High-voltage power lines (US) | HIFLD transmission lines | Area (60 km); first 500 lines in view; can take several seconds |
| Ground | Railways of the world | OpenRailwayMap tiles | Personal, low-volume use |
| Ground | 3D terrain | Esri World Elevation | A switch: real relief instead of a smooth globe |
| Signals | Internet disruptions by country | IODA, Georgia Tech | One signal alone is often noise; two or more is a stronger sign |

**Power plants and Nuclear plants now always load.** They used to ask OpenStreetMap's public
servers, which are overloaded ("at capacity") most of the time. They now read a list that ships
with GodView: `js/data/power-plants.json`, the World Resources Institute's Global Power Plant
Database (21,337 plants of 10 MW and up, 2021 snapshot, CC BY 4.0).

**Data packs (v6.1).** Plate-reader cameras, cell towers and hospitals & nursing homes used to ask
servers that are usually too slow or full (OpenStreetMap's Overpass, NASA's HIFLD mirror) or that
web pages can't read at all (CMS). A GitHub Action (`.github/workflows/packs.yml`, every Monday,
or "Run workflow" by hand) runs `scripts/build_packs.py`, which downloads them in full and
publishes them, cut into 5-degree tiles, to this repo's `data` branch. The app reads only the
tiles around the view from `raw.githubusercontent.com` (no key). `index.json` on that branch
says when each pack was built; a pack that fails to build keeps its last good copy.

`js/layers/lib/gibs.js` makes a NASA picture layer from one line (see `js/layers/orbit.js`): NASA
publishes about 1,300 products, so more are easy to add. Sample data for the tests is in
`test/fixtures-earth.mjs`.

Checked and still not possible without a relay or key: FAA flight restrictions and airport
weather (aviationweather.gov and tfr.faa.gov refuse web pages), NASA fireball reports, US wind
turbines (USGS), GDELT news events (did not answer), Safecast radiation (timed out).
