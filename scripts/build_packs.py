#!/usr/bin/env python3
"""GodView data packs: copies of public datasets whose live servers are too
slow, too often down, or closed to web pages, so a phone can't read them live.

GitHub Actions runs this every week (.github/workflows/packs.yml) and
publishes the output to this repo's `data` branch. The app reads it from
raw.githubusercontent.com: no key, readable from a web page.

  alpr    plate-reader (ALPR) cameras mapped in OpenStreetMap, via Overpass
  towers  cellular sites licensed by the FCC (Universal Licensing System,
          Cellular service): carrier, structure height, ASR number
  care    hospitals (CMS Hospital General Information, placed on the map by the
          US Census geocoder) and nursing homes (CMS Provider Information): star
          ratings, federal fines and penalties, abuse citations, staff turnover

Every pack is cut into 5-degree tiles, <pack>/<south>_<west>.json:
  {"pack": ..., "built": ..., "fields": [...], "rows": [[lat, lon, ...], ...]}
index.json lists for each pack when it was built, how many rows, which tiles
exist, the fields, the source and the licence. A pack that fails keeps its
last good copy (the workflow starts from the current data branch), and
index.json records the error.

Only facilities, structures and devices are kept: no data about private people.

Usage: python3 scripts/build_packs.py OUT_DIR [alpr] [towers] [care]
"""
import csv
import gzip
import io
import json
import math
import os
import re
import shutil
import sys
import time
import urllib.parse
import urllib.request
import zipfile
from datetime import datetime, timezone

TILE = 5
UA = 'GodView-data-packs/1 (+https://github.com/christophergates88/godview)'
NOW = datetime.now(timezone.utc).strftime('%Y-%m-%dT%H:%M:%SZ')
OVERPASS = [
    'https://overpass-api.de/api/interpreter',
    'https://overpass.private.coffee/api/interpreter',
    'https://maps.mail.ru/osm/tools/overpass/api/interpreter',
]
CMS = 'https://data.cms.gov/provider-data/api/1/datastore/query/{id}/0'
CMS_NURSING_HOMES = CMS.format(id='4pq5-n9py')   # Provider Information (has latitude/longitude)
CMS_HOSPITALS = CMS.format(id='xubh-q36u')       # Hospital General Information (addresses only)
CENSUS_BATCH = 'https://geocoding.geo.census.gov/geocoder/locations/addressbatch'
ZCTA_CENTRES = 'https://www2.census.gov/geo/docs/maps-data/data/gazetteer/{y}_Gazetteer/{y}_Gaz_zcta_national.zip'
FCC_CELLULAR = 'https://data.fcc.gov/download/pub/uls/complete/l_cell.zip'


def log(*a):
    print(*a, flush=True)


def fetch(url, data=None, timeout=240, tries=3, headers=None):
    last = None
    for i in range(tries):
        try:
            req = urllib.request.Request(url, data=data, headers={'User-Agent': UA, 'Accept-Encoding': 'gzip', **(headers or {})})
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
def dms(d, m, sec, hemi):
    if not d.strip():
        return None
    v = float(d) + float(m or 0) / 60 + float(sec or 0) / 3600
    if hemi.strip().upper() in ('S', 'W'):
        v = -v
    return round(v, 5)


def uls_records(z, name):
    """Rows of one pipe-delimited ULS table (HD.dat, EN.dat, LO.dat ...)."""
    member = next((n for n in z.namelist() if n.upper().endswith(name.upper())), None)
    if not member:
        raise RuntimeError(f'{name} is missing from the FCC file (has {z.namelist()})')
    with z.open(member) as f:
        for line in io.TextIOWrapper(f, encoding='latin-1', newline=''):
            yield line.rstrip('\r\n').split('|')


def pack_towers(out):
    raw = fetch(FCC_CELLULAR, timeout=900, tries=3)
    log(f'   FCC cellular file: {len(raw) / 1e6:.0f} MB')
    z = zipfile.ZipFile(io.BytesIO(raw))
    # HD: 5 call sign, 6 licence status (A = active), 7 radio service
    active = {r[1]: r[4] for r in uls_records(z, 'HD.dat') if len(r) > 6 and r[5] == 'A'}
    # EN: 6 entity type (L = licensee), 8 entity name
    lic = {r[1]: r[7] for r in uls_records(z, 'EN.dat') if len(r) > 8 and r[5] == 'L' and r[1] in active}
    log(f'   {len(active)} active cellular licences, {len(lic)} licensee names')
    # LO: 5 call sign, 12-15 address/city/county/state, 20-27 lat/lon (deg, min, sec, N/S/E/W),
    #     38 tower registration (ASR) number, 39 support height (m), 40 overall height (m), 41 structure type
    sites, seen, bad, first = {}, 0, 0, None
    for r in uls_records(z, 'LO.dat'):
        if len(r) < 41 or r[1] not in active:
            continue
        seen += 1
        first = first or r[:45]
        if r[22].strip().upper() not in ('N', 'S') or r[26].strip().upper() not in ('E', 'W'):
            bad += 1
            continue
        try:
            lat, lon = dms(r[19], r[20], r[21], r[22]), dms(r[23], r[24], r[25], r[26])
        except ValueError:
            bad += 1
            continue
        if lat is None or lon is None:
            continue
        k = (round(lat, 4), round(lon, 4))   # carriers that share one structure become one site
        site = sites.get(k)
        if not site:
            site = sites[k] = {'lat': lat, 'lon': lon, 'lic': [], 'calls': [], 'city': title(r[12]), 'state': r[14].strip(),
                               'h': None, 'sup': None, 'asr': '', 'type': ''}
        name = title(lic.get(r[1], ''))
        if name and name not in site['lic']:
            site['lic'].append(name)
        if r[4] and r[4] not in site['calls']:
            site['calls'].append(r[4])
        site['h'] = site['h'] or num(r[39])
        site['sup'] = site['sup'] or num(r[38])
        site['asr'] = site['asr'] or r[37].strip()
        site['type'] = site['type'] or title(r[40])
    log(f'   {seen} site records, {bad} unreadable, {len(sites)} distinct sites; first record: {first}')
    if seen and bad > seen / 2:
        raise RuntimeError(f'most site records did not read as coordinates; the file layout may have changed: {first}')
    rows = [[v['lat'], v['lon'], ' · '.join(v['lic'][:4]), v['city'], v['state'], v['h'], v['sup'], ' '.join(v['calls'][:4]), v['type'], v['asr'], len(v['lic'])]
            for v in sites.values()]
    if len(rows) < 1000:
        raise RuntimeError(f'only {len(rows)} sites: looks incomplete')
    return write_pack(out, 'towers', ['lat', 'lon', 'licensee', 'city', 'state', 'heightM', 'supportM', 'callsign', 'structure', 'asr', 'carriers'], rows,
                      'FCC Universal Licensing System, Cellular service (active licences), weekly', 'Public domain (US government work)')


# ---------------------------------------------------------------- care
CARE_FIELDS = ['lat', 'lon', 'kind', 'name', 'address', 'city', 'state', 'zip', 'type', 'ownership', 'legal', 'chain', 'beds', 'residents',
               'overall', 'inspection', 'staffing', 'quality', 'fines', 'fineDollars', 'penalties', 'abuse', 'focus', 'ccn',
               'emergency', 'mortWorse', 'safetyWorse', 'readmWorse', 'mortBetter', 'safetyBetter', 'readmBetter',
               'turnover', 'ownerChanged', 'deficiencies', 'topRated', 'approx']


def care_row(**k):
    return [k.get(f) for f in CARE_FIELDS]


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
    return out


def yes(v):
    return 1 if str(v or '').strip().upper() in ('Y', 'YES', 'TRUE', '1') else 0


def nursing_homes():
    rows = []
    for r in (low(x) for x in cms_all(CMS_NURSING_HOMES)):
        lat, lon = num(pick(r, 'latitude')), num(pick(r, 'longitude'))
        if lat is None or lon is None:
            continue
        sff = str(pick(r, 'special_focus_status') or '').upper()
        rows.append(care_row(
            lat=round(lat, 5), lon=round(lon, 5), kind='N', name=title(pick(r, 'provider_name') or ''),
            address=title(pick(r, 'provider_address') or ''), city=title(pick(r, 'citytown') or ''), state=pick(r, 'state') or '',
            zip=pick(r, 'zip_code') or '', type=pick(r, 'provider_type') or '', ownership=pick(r, 'ownership_type') or '',
            legal=title(pick(r, 'legal_business_name') or ''), chain=title(pick(r, 'chain_name') or ''),
            beds=num(pick(r, 'number_of_certified_beds')), residents=num(pick(r, 'average_number_of_residents_per_day')),
            overall=num(pick(r, 'overall_rating')), inspection=num(pick(r, 'health_inspection_rating')),
            staffing=num(pick(r, 'staffing_rating')), quality=num(pick(r, 'qm_rating')),
            fines=num(pick(r, 'number_of_fines')), fineDollars=num(pick(r, 'total_amount_of_fines_in_dollars')),
            penalties=num(pick(r, 'total_number_of_penalties')), abuse=yes(pick(r, 'abuse_icon')),
            focus='SFF' if sff == 'SFF' else ('candidate' if 'CANDIDATE' in sff else ''),
            ccn=str(pick(r, 'cms_certification_number_ccn') or ''),
            turnover=num(pick(r, 'total_nursing_staff_turnover')), ownerChanged=yes(pick(r, 'provider_changed_ownership_in_last_12_months')),
            deficiencies=num(pick(r, 'rating_cycle_1_total_number_of_health_deficiencies')), topRated=yes(pick(r, 'high_performing_icon'))))
    if len(rows) < 5000:
        raise RuntimeError(f'only {len(rows)} nursing homes with a location: looks incomplete')
    return rows


def census_geocode(addrs, chunk=2500):
    """{id: (lat, lon)} for [(id, street, city, state, zip)], via the Census batch geocoder."""
    found = {}
    for i in range(0, len(addrs), chunk):
        part = addrs[i:i + chunk]
        buf = io.StringIO()
        csv.writer(buf, lineterminator='\n').writerows(part)
        boundary = f'godview{time.time_ns()}'
        body = (f'--{boundary}\r\nContent-Disposition: form-data; name="benchmark"\r\n\r\nPublic_AR_Current\r\n'
                f'--{boundary}\r\nContent-Disposition: form-data; name="addressFile"; filename="addresses.csv"\r\n'
                f'Content-Type: text/csv\r\n\r\n{buf.getvalue()}\r\n--{boundary}--\r\n').encode('utf-8')
        raw = fetch(CENSUS_BATCH, data=body, timeout=900, tries=2, headers={'Content-Type': f'multipart/form-data; boundary={boundary}'})
        n = 0
        for rec in csv.reader(io.StringIO(raw.decode('utf-8', 'replace'))):
            if len(rec) >= 6 and rec[2] == 'Match' and ',' in rec[5]:
                x, y = rec[5].split(',')[:2]
                found[rec[0]] = (round(float(y), 5), round(float(x), 5))
                n += 1
        log(f'   geocoded {n} of {len(part)} addresses')
    return found


def zip_centres():
    for y in (2025, 2024, 2023):
        try:
            z = zipfile.ZipFile(io.BytesIO(fetch(ZCTA_CENTRES.format(y=y), timeout=300, tries=2)))
            with z.open(z.namelist()[0]) as f:
                rd = csv.reader(io.TextIOWrapper(f, encoding='utf-8', newline=''), delimiter='\t')
                head = [h.strip().upper() for h in next(rd)]
                gi, la, lo = head.index('GEOID'), head.index('INTPTLAT'), head.index('INTPTLONG')
                out = {r[gi].strip(): (round(float(r[la]), 5), round(float(r[lo]), 5)) for r in rd if len(r) > lo}
            log(f'   {len(out)} ZIP code centres ({y})')
            return out
        except Exception as e:  # noqa: BLE001
            log(f'   ZIP centres {y}: {e}')
    return {}


def hospitals():
    src = [low(x) for x in cms_all(CMS_HOSPITALS)]
    if len(src) < 3000:
        raise RuntimeError(f'only {len(src)} hospitals: looks incomplete')
    addrs = [(str(i), pick(r, 'address') or '', pick(r, 'citytown') or '', pick(r, 'state') or '', str(pick(r, 'zip_code') or '')[:5])
             for i, r in enumerate(src)]
    where = census_geocode(addrs)
    centres = zip_centres() if len(where) < len(src) else {}
    rows, approx, lost = [], 0, 0
    for i, r in enumerate(src):
        ll, rough = where.get(str(i)), 0
        if not ll:
            ll, rough = centres.get(str(pick(r, 'zip_code') or '')[:5]), 1
        if not ll:
            lost += 1
            continue
        approx += rough
        rows.append(care_row(
            lat=ll[0], lon=ll[1], kind='H', name=title(pick(r, 'facility_name') or ''), address=title(pick(r, 'address') or ''),
            city=title(pick(r, 'citytown') or ''), state=pick(r, 'state') or '', zip=str(pick(r, 'zip_code') or '')[:5],
            type=pick(r, 'hospital_type') or '', ownership=pick(r, 'hospital_ownership') or '', overall=num(pick(r, 'hospital_overall_rating')),
            ccn=str(pick(r, 'facility_id') or ''), emergency=pick(r, 'emergency_services') or '',
            mortWorse=num(pick(r, 'count_of_mort_measures_worse')), safetyWorse=num(pick(r, 'count_of_safety_measures_worse')),
            readmWorse=num(pick(r, 'count_of_readm_measures_worse')), mortBetter=num(pick(r, 'count_of_mort_measures_better')),
            safetyBetter=num(pick(r, 'count_of_safety_measures_better')), readmBetter=num(pick(r, 'count_of_readm_measures_better')),
            approx=rough))
    log(f'   hospitals placed: {len(rows)} ({approx} at their ZIP code centre), {lost} not placed')
    if len(rows) < 3000:
        raise RuntimeError(f'only {len(rows)} hospitals could be placed')
    return rows


def previous_rows(out, name, fields):
    """Rows of the last good copy of a pack (same fields only), to keep a part that failed this time."""
    rows = []
    d = os.path.join(out, name)
    for fn in (os.listdir(d) if os.path.isdir(d) else []):
        try:
            with open(os.path.join(d, fn), encoding='utf-8') as f:
                t = json.load(f)
            if t.get('fields') == fields:
                rows.extend(t.get('rows') or [])
        except (OSError, ValueError):
            pass
    return rows


def pack_care(out):
    prev = previous_rows(out, 'care', CARE_FIELDS)
    parts, notes = [], {}
    for kind, build, label in (('H', hospitals, 'hospitals'), ('N', nursing_homes, 'nursingHomes')):
        try:
            got = build()
            notes[label] = len(got)
        except Exception as e:  # noqa: BLE001
            got = [r for r in prev if r[2] == kind]
            log(f'   {label} failed ({e}); keeping {len(got)} from the last copy')
            if not got:
                raise
            notes[label] = len(got)
            notes[label + 'Error'] = f'{type(e).__name__}: {e}'[:200]
        parts.extend(got)
    return write_pack(out, 'care', CARE_FIELDS, parts,
                      'CMS Care Compare: Hospital General Information (placed by the US Census geocoder) and nursing-home Provider Information',
                      'Public domain (US government work)', notes)


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
