#!/usr/bin/env python3
"""GodView data packs: copies of public datasets whose live servers are too
slow, or too often down, to read from a phone.

GitHub Actions runs this every week (.github/workflows/packs.yml) and
publishes the output to this repo's `data` branch. The app reads it from
raw.githubusercontent.com: no key, readable from a web page.

  alpr    plate-reader (ALPR) cameras mapped in OpenStreetMap, via Overpass
  towers  FCC-licensed cell sites (HIFLD Open archive, NASA NCCS mirror)
  care    hospitals (HIFLD Open archive) and nursing homes (CMS Provider
          Information: star ratings, fines, penalties, abuse citations)

Every pack is cut into 5-degree tiles, <pack>/<south>_<west>.json:
  {"pack": ..., "built": ..., "fields": [...], "rows": [[lat, lon, ...], ...]}
index.json lists for each pack when it was built, how many rows, which tiles
exist, the fields, the source and the licence. A pack that fails keeps its
last good copy (the workflow starts from the current data branch), and
index.json records the error.

Only facilities, structures and devices are kept: no data about private people.

Usage: python3 scripts/build_packs.py OUT_DIR [alpr] [towers] [care]
"""
import gzip
import json
import math
import os
import re
import shutil
import sys
import time
import urllib.parse
import urllib.request
from datetime import datetime, timezone

TILE = 5
UA = 'GodView-data-packs/1 (+https://github.com/christophergates88/godview)'
NOW = datetime.now(timezone.utc).strftime('%Y-%m-%dT%H:%M:%SZ')
OVERPASS = [
    'https://overpass-api.de/api/interpreter',
    'https://overpass.private.coffee/api/interpreter',
    'https://maps.mail.ru/osm/tools/overpass/api/interpreter',
]
NCCS = 'https://maps.nccs.nasa.gov/mapping/rest/services/hifld_open'
CMS_NURSING_HOMES = 'https://data.cms.gov/provider-data/api/1/datastore/query/4pq5-n9py/0'


def log(*a):
    print(*a, flush=True)


def fetch(url, data=None, timeout=240, tries=3):
    last = None
    for i in range(tries):
        try:
            req = urllib.request.Request(url, data=data, headers={'User-Agent': UA, 'Accept-Encoding': 'gzip'})
            with urllib.request.urlopen(req, timeout=timeout) as r:
                raw = r.read()
            return gzip.decompress(raw) if raw[:2] == b'\x1f\x8b' else raw
        except Exception as e:  # noqa: BLE001 - every failure is retried, then reported
            last = e
            log(f'    try {i + 1} failed: {e}')
            if i + 1 < tries:
                time.sleep(10 * (i + 1))
    raise last


def fetch_json(url, **kw):
    return json.loads(fetch(url, **kw))


def low(d):
    return {str(k).lower(): v for k, v in (d or {}).items()}


def pick(a, *names):
    """First non-empty value among names (a: dict with lower-case keys)."""
    for n in names:
        v = a.get(n.lower())
        if v is None:
            continue
        if isinstance(v, str):
            v = v.strip()
            if not v or v.upper() in ('NOT AVAILABLE', 'N/A', 'NA', 'NONE'):
                continue
        if isinstance(v, (int, float)) and v in (-999, -999.0):
            continue
        return v
    return None


def num(v):
    try:
        x = float(str(v).replace(',', '').replace('$', ''))
    except (TypeError, ValueError):
        return None
    if not math.isfinite(x) or x in (-999, -999.0):
        return None
    return int(x) if x == int(x) else round(x, 2)


def title(s):
    s = str(s or '').strip()
    if not s:
        return ''
    if s.upper() != s:  # already mixed case
        return s
    out = re.sub(r"[A-Za-z][A-Za-z']*", lambda m: m.group(0).capitalize(), s.lower())
    # keep common short forms in capitals
    out = re.sub(r'\b(Llc|Lp|Llp|Usa|Va|Ii|Iii|Iv|Snf|Ltc|Dba|Pcs|Ne|Nw|Se|Sw|Icu)\b', lambda m: m.group(0).upper(), out)
    return out.replace('At&T', 'AT&T')


def tile_of(lat, lon):
    return f'{math.floor(lat / TILE) * TILE}_{math.floor(lon / TILE) * TILE}'


def write_pack(out, name, fields, rows, source, licence, extra=None):
    d = os.path.join(out, name)
    shutil.rmtree(d, ignore_errors=True)
    os.makedirs(d)
    tiles = {}
    for r in rows:
        lat, lon = r[0], r[1]
        if lat is None or lon is None or not (-90 <= lat <= 90 and -180 <= lon <= 180) or (lat == 0 and lon == 0):
            continue
        tiles.setdefault(tile_of(lat, lon), []).append(r)
    for k, rs in tiles.items():
        with open(os.path.join(d, k + '.json'), 'w', encoding='utf-8') as f:
            json.dump({'pack': name, 'built': NOW, 'fields': fields, 'rows': rs}, f, separators=(',', ':'), ensure_ascii=False)
    n = sum(len(v) for v in tiles.values())
    size = sum(os.path.getsize(os.path.join(d, k + '.json')) for k in tiles)
    log(f'   wrote {n} rows in {len(tiles)} tiles ({size / 1e6:.1f} MB)')
    return {'built': NOW, 'count': n, 'tiles': sorted(tiles), 'fields': fields, 'source': source, 'licence': licence, **(extra or {})}


def arcgis_all(layer_url, fields='*', where='1=1', chunk=400):
    """Every feature of an ArcGIS layer, by object id (works with or without paging support)."""
    meta = fetch_json(layer_url + '/query?' + urllib.parse.urlencode({'where': where, 'returnIdsOnly': 'true', 'f': 'json'}))
    if 'error' in meta:
        raise RuntimeError(f"ArcGIS error: {meta['error']}")
    ids = sorted(meta.get('objectIds') or [])
    log(f'   {len(ids)} features at {layer_url}')
    feats = []
    for i in range(0, len(ids), chunk):
        body = urllib.parse.urlencode({'objectIds': ','.join(map(str, ids[i:i + chunk])), 'outFields': fields,
                                       'returnGeometry': 'true', 'outSR': '4326', 'f': 'json'}).encode()
        j = fetch_json(layer_url + '/query', data=body, timeout=180)
        if 'error' in j:
            raise RuntimeError(f"ArcGIS error: {j['error']}")
        feats.extend(j.get('features') or [])
    if feats:
        log(f'   fields: {sorted(low(feats[0].get("attributes")).keys())}')
    return feats


def point(f):
    g = f.get('geometry') or {}
    x, y = g.get('x'), g.get('y')
    if x is None or y is None:
        return None, None
    return round(float(y), 5), round(float(x), 5)


# ---------------------------------------------------------------- alpr
def pack_alpr(out):
    q = '[out:json][timeout:600];node["surveillance:type"="ALPR"];out body qt;'
    els, err = None, None
    for u in OVERPASS:
        log(f'   asking {u}')
        try:
            j = fetch_json(u, data=urllib.parse.urlencode({'data': q}).encode(), timeout=700, tries=2)
            remark = str(j.get('remark') or '')
            if re.search(r'error|timed out|out of memory', remark, re.I):
                raise RuntimeError(remark[:200])
            els = j.get('elements') or []
            if len(els) < 1000:
                raise RuntimeError(f'only {len(els)} cameras came back: looks incomplete')
            break
        except Exception as e:  # noqa: BLE001
            err, els = e, None
            log(f'   failed: {e}')
    if els is None:
        raise err
    rows = []
    for el in els:
        if el.get('type') != 'node' or el.get('lat') is None:
            continue
        t = el.get('tags') or {}
        rows.append([round(el['lat'], 5), round(el['lon'], 5), el['id'], t.get('operator', ''),
                     t.get('manufacturer') or t.get('brand') or '', t.get('direction') or t.get('camera:direction') or '',
                     t.get('surveillance:zone', '')])
    return write_pack(out, 'alpr', ['lat', 'lon', 'osm', 'operator', 'maker', 'facing', 'zone'], rows,
                      'OpenStreetMap contributors, via the Overpass API (volunteer-mapped, for example through DeFlock)',
                      'ODbL 1.0')


# ---------------------------------------------------------------- towers
def pack_towers(out):
    feats = arcgis_all(f'{NCCS}/communications/FeatureServer/3')
    rows = []
    for f in feats:
        lat, lon = point(f)
        if lat is None:
            continue
        a = low(f.get('attributes'))
        rows.append([lat, lon, title(pick(a, 'licensee') or ''), title(pick(a, 'loccity', 'city') or ''),
                     pick(a, 'locstate', 'state') or '', num(pick(a, 'allstruc')), num(pick(a, 'supstruc')),
                     pick(a, 'callsign') or '', title(pick(a, 'structype', 'strutype', 'struc_type') or '')])
    if len(rows) < 1000:
        raise RuntimeError(f'only {len(rows)} towers: looks incomplete')
    return write_pack(out, 'towers', ['lat', 'lon', 'licensee', 'city', 'state', 'heightM', 'supportM', 'callsign', 'structure'], rows,
                      'FCC licensing data, via the HIFLD Open archive (NASA NCCS mirror)', 'Public domain (US government work)')


# ---------------------------------------------------------------- care
CARE_FIELDS = ['lat', 'lon', 'kind', 'name', 'address', 'city', 'state', 'type', 'beds', 'owner',
               'overall', 'inspection', 'staffing', 'quality', 'fines', 'fineDollars', 'penalties', 'abuse', 'focus', 'ccn',
               'trauma', 'helipad', 'residents', 'chain']


def cms_all(url, page=1500):
    out, off, total = [], 0, None
    while True:
        j = fetch_json(url + '?' + urllib.parse.urlencode({'limit': page, 'offset': off, 'count': 'true', 'results': 'true',
                                                          'schema': 'false', 'keys': 'true', 'format': 'json', 'rowIds': 'false'}))
        rs = j.get('results') or []
        total = j.get('count') if total is None else total
        out.extend(rs)
        off += len(rs)
        if not rs or (total and off >= int(total)):
            break
    log(f'   {len(out)} of {total} rows from {url}')
    if out:
        log(f'   columns: {sorted(out[0].keys())}')
    return out


def cms_point(r):
    lat, lon = num(pick(r, 'latitude')), num(pick(r, 'longitude'))
    if lat is not None and lon is not None:
        return round(lat, 5), round(lon, 5)
    loc = str(pick(r, 'location') or '')
    m = re.search(r'POINT\s*\(\s*(-?[\d.]+)\s+(-?[\d.]+)\s*\)', loc)
    if m:
        return round(float(m.group(2)), 5), round(float(m.group(1)), 5)
    m = re.search(r'\(\s*(-?[\d.]+)\s*,\s*(-?[\d.]+)\s*\)', loc)
    if m:
        return round(float(m.group(1)), 5), round(float(m.group(2)), 5)
    return None, None


def nursing_homes_cms():
    rows = []
    for r in (low(x) for x in cms_all(CMS_NURSING_HOMES)):
        lat, lon = cms_point(r)
        if lat is None:
            continue
        sff = str(pick(r, 'special_focus_status') or '')
        rows.append([lat, lon, 'N', title(pick(r, 'provider_name') or ''), title(pick(r, 'provider_address') or ''),
                     title(pick(r, 'citytown', 'city_town', 'provider_city') or ''), pick(r, 'state', 'provider_state') or '',
                     pick(r, 'ownership_type') or '', num(pick(r, 'number_of_certified_beds')), title(pick(r, 'legal_business_name') or ''),
                     num(pick(r, 'overall_rating')), num(pick(r, 'health_inspection_rating')), num(pick(r, 'staffing_rating')),
                     num(pick(r, 'qm_rating', 'quality_measure_rating')), num(pick(r, 'number_of_fines')),
                     num(pick(r, 'total_amount_of_fines_in_dollars')), num(pick(r, 'total_number_of_penalties')),
                     1 if str(pick(r, 'abuse_icon') or '').upper() in ('Y', 'YES', 'TRUE', '1') else 0,
                     'SFF' if sff.upper() == 'SFF' else ('candidate' if 'CANDIDATE' in sff.upper() else ''),
                     str(pick(r, 'cms_certification_number_ccn', 'federal_provider_number', 'ccn') or ''),
                     '', '', num(pick(r, 'average_number_of_residents_per_day')),
                     title(pick(r, 'chain_name', 'affiliated_entity_name') or '')])
    if len(rows) < 5000:
        raise RuntimeError(f'only {len(rows)} nursing homes with a location: looks incomplete')
    return rows


def nursing_homes_hifld():
    rows = []
    for f in arcgis_all(f'{NCCS}/public_health/FeatureServer/1'):
        lat, lon = point(f)
        if lat is None:
            continue
        a = low(f.get('attributes'))
        if str(pick(a, 'status') or 'OPEN').upper() != 'OPEN':
            continue
        rows.append([lat, lon, 'N', title(pick(a, 'name') or ''), title(pick(a, 'address') or ''), title(pick(a, 'city') or ''),
                     pick(a, 'state') or '', title(pick(a, 'type') or ''), num(pick(a, 'beds')), title(pick(a, 'owner') or ''),
                     None, None, None, None, None, None, None, 0, '', '', '', '', None, ''])
    return rows


def pack_care(out):
    hosp = []
    for f in arcgis_all(f'{NCCS}/public_health/FeatureServer/0'):
        lat, lon = point(f)
        if lat is None:
            continue
        a = low(f.get('attributes'))
        if str(pick(a, 'status') or 'OPEN').upper() != 'OPEN':
            continue
        hosp.append([lat, lon, 'H', title(pick(a, 'name') or ''), title(pick(a, 'address') or ''), title(pick(a, 'city') or ''),
                     pick(a, 'state') or '', title(pick(a, 'type') or ''), num(pick(a, 'beds')), title(pick(a, 'owner') or ''),
                     None, None, None, None, None, None, None, 0, '', '',
                     title(pick(a, 'trauma') or ''), title(pick(a, 'helipad') or ''), None, ''])
    if len(hosp) < 3000:
        raise RuntimeError(f'only {len(hosp)} hospitals: looks incomplete')
    try:
        homes, homes_src = nursing_homes_cms(), 'CMS Provider Information (Care Compare)'
    except Exception as e:  # noqa: BLE001
        log(f'   CMS nursing homes failed ({e}); using the HIFLD copy')
        homes, homes_src = nursing_homes_hifld(), 'HIFLD Open archive (no ratings)'
    return write_pack(out, 'care', CARE_FIELDS, hosp + homes,
                      f'Hospitals: HIFLD Open archive (NASA NCCS mirror). Nursing homes: {homes_src}',
                      'Public domain (US government work)', {'hospitals': len(hosp), 'nursingHomes': len(homes), 'nursingHomeSource': homes_src})


PACKS = {'alpr': pack_alpr, 'towers': pack_towers, 'care': pack_care}


def main():
    if len(sys.argv) < 2:
        sys.exit(__doc__)
    out = sys.argv[1]
    want = [p for p in sys.argv[2:] if p in PACKS] or list(PACKS)
    os.makedirs(out, exist_ok=True)
    ip = os.path.join(out, 'index.json')
    try:
        with open(ip, encoding='utf-8') as f:
            index = json.load(f)
    except (OSError, ValueError):
        index = {}
    index.setdefault('packs', {})
    index.update({'v': 1, 'tile': TILE})
    failed = []
    for name in want:
        log(f'== {name}')
        t0 = time.time()
        try:
            info = PACKS[name](out)
            index['packs'][name] = {**info, 'error': None}
            log(f'   ok in {time.time() - t0:.0f}s')
        except Exception as e:  # noqa: BLE001
            log(f'   FAILED after {time.time() - t0:.0f}s: {e}')
            prev = index['packs'].get(name) or {}
            index['packs'][name] = {**prev, 'error': f'{type(e).__name__}: {e}'[:300], 'tried': NOW}
            failed.append(name)
    index['updated'] = NOW
    with open(ip, 'w', encoding='utf-8') as f:
        json.dump(index, f, indent=1, ensure_ascii=False)
    log(f'done: {len(want) - len(failed)} of {len(want)} packs built' + (f'; failed: {", ".join(failed)}' if failed else ''))
    if len(failed) == len(want):
        sys.exit(1)


if __name__ == '__main__':
    main()
