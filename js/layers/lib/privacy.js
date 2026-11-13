// THE PRIVACY LINE for the "People & records" group.
//
// GodView shows people only in their PUBLIC ROLE (officials, public figures
// with a Wikipedia article), official public appeals (NCMEC posters, shown
// exactly as published), organizations, and people in AGGREGATE (Census).
// It never looks up private individuals: no residents of an address, property
// owners, voter rolls, court/arrest/inmate records, individual donors, home
// addresses, sex-offender maps or people-search of any kind.
//
// Some public registries mix organizations and private persons (aircraft and
// radio licences, contract recipients, regulated "facilities" named after their
// owner). Every name from such a registry goes through recordName() below
// before it is shown. When in doubt the name is withheld.
//
// Pure functions, no browser APIs (unit-tested in test/unit-people.mjs).

// Words that mark an organization or government body (whole words).
const ORG_WORDS = new Set(`
INC INCORPORATED LLC LLP LLLP LP LTD LIMITED CORP CORPORATION COMPANY COMPANIES CO GROUP HOLDINGS HOLDING
PARTNERS PLC FSB BANK BANCORP BANCSHARES TRUSTCO CREDIT FINANCIAL INSURANCE CAPITAL
UNIVERSITY COLLEGE SCHOOL SCHOOLS ACADEMY INSTITUTE SEMINARY LIBRARY
HOSPITAL HOSPITALS MEDICAL HEALTH HEALTHCARE CLINIC CLINICS CENTER CENTRE NURSING REHABILITATION REHAB HOSPICE PHARMACY
FOUNDATION ASSOCIATION ASSN SOCIETY CLUB LEAGUE UNION FEDERATION ALLIANCE COALITION MINISTRIES MINISTRY DIOCESE MOSQUE SYNAGOGUE
BAPTIST METHODIST CATHOLIC PRESBYTERIAN LUTHERAN EPISCOPAL PENTECOSTAL
COUNCIL COMMISSION COMMISSIONERS AUTHORITY DEPARTMENT DEPT AGENCY BOARD BUREAU OFFICE DISTRICT COUNTY CITY TOWNSHIP VILLAGE BOROUGH
FEDERAL NATIONAL GOVERNMENT MUNICIPAL TRIBE TRIBAL ARMY NAVY POLICE SHERIFF WORKS
UTILITY UTILITIES WATER SEWER SEWERAGE ELECTRIC ELECTRICAL ENERGY GAS OIL PIPELINE COOPERATIVE COOP EMC TELEPHONE TELECOM
SERVICES SERVICE SYSTEMS SOLUTIONS TECHNOLOGIES TECHNOLOGY INDUSTRIES INDUSTRIAL INTERNATIONAL ENTERPRISES ENTERPRISE MANUFACTURING
CONSTRUCTION CONTRACTORS CONTRACTING ENGINEERING CONSULTING CONSULTANTS LABORATORIES LABS ASSOCIATES
PLANT QUARRY LANDFILL WWTP WTP WPCP POTW FACILITY FACILITIES TERMINAL AIRPORT RAILROAD RAILWAY
AIRLINES AIRWAYS AVIATION LEASING LOGISTICS TRANSPORT TRANSPORTATION TRUCKING FREIGHT
BROADCASTING BROADCAST COMMUNICATIONS MEDIA RADIO TELEVISION TV NETWORK NETWORKS PUBLISHING
STORE STORES MARKET MARKETS SUPERCENTER SUPERMARKET WAREHOUSE DISTRIBUTION RESTAURANT HOTEL MOTEL RESORT
`.trim().split(/\s+/));
// Organization words that are also common surnames ("John Church", "Ann Mills"):
// they count only when the rest of the name does not look like a person's name.
const WEAK_ORG_WORDS = new Set('CHURCH TEMPLE PARISH POWER BANKS MILL MILLS PORT MARINE GUARD FIRE STATE STATES NATION TOWN STATION MINE MINES PUBLIC'.split(' '));

// Multi-word organization phrases.
const ORG_PHRASES = [/\bCITY OF\b/, /\bCOUNTY OF\b/, /\bSTATE OF\b/, /\bTOWN OF\b/, /\bUNITED STATES\b/, /\bU ?S ?A?\b (ARMY|NAVY|AIR FORCE|DEPT|DEPARTMENT|POSTAL)/,
  /\bBOARD OF\b/, /\bCONSOLIDATED GOVERNMENT\b/, /\bSCHOOL DISTRICT\b/, /\bD ?B ?A\b/];

// Words that point to a private person or a private home: always withheld.
const PRIVATE_WORDS = /\b(RESIDENCE|RESIDENTIAL PROPERTY|HOME OF|HOUSE OF|PRIVATE|INDIVIDUAL|INDIVIDUALS|ESTATE OF|LIVING TRUST|REVOCABLE TRUST|FAMILY TRUST|IRREVOCABLE TRUST|HOMEOWNER|HOMESITE|LOT \d+)\b/;
const PERSON_SUFFIX = /\b(JR|SR|II|III|IV|MD|DDS|DMD|DO|DVM|ESQ|PHD|CPA)\b/;
// Names that registries use for withheld or aggregated persons.
const WITHHELD = /^(|REDACTED.*|MULTIPLE RECIPIENTS|MULTIPLE FOREIGN RECIPIENTS|PRIVATE INDIVIDUAL|INDIVIDUAL|NOT AVAILABLE|N\/?A|UNKNOWN|NONE)$/;

export function normName(s) {
  return String(s ?? '').toUpperCase().replace(/&/g, ' AND ').replace(/[.'’]/g, '').replace(/[^A-Z0-9#,\- ]+/g, ' ').replace(/\s+/g, ' ').trim();
}

// Looks like "JOHN SMITH", "JOHN A SMITH", "SMITH, JOHN A", "J SMITH", "SMITH JOHN".
function looksLikePersonName(n) {
  if (/\d|#/.test(n)) return false;
  const comma = n.includes(',');
  const toks = n.replace(/,/g, ' ').split(' ').filter(Boolean).filter((t) => !PERSON_SUFFIX.test(t));
  if (toks.length < 2 || toks.length > 5) return false;
  if (toks.includes('OF') || toks.includes('THE')) return false;   // "Port of Brunswick"
  if (toks.includes('AND')) return toks.length <= 5;               // "John and Mary Smith"
  if (!toks.every((t) => /^[A-Z][A-Z\-]*$/.test(t))) return false;
  if (comma) return true;                              // "SMITH, JOHN"
  if (toks.some((t) => t.length === 1)) return true;   // has an initial
  return toks.length <= 3;                             // two or three plain words, no organization word
}

// classifyName(name) -> 'org' | 'person' | 'withheld' | 'unknown'
export function classifyName(name) {
  const n = normName(name);
  if (WITHHELD.test(n)) return 'withheld';
  if (PRIVATE_WORDS.test(n)) return 'person';
  const words = n.replace(/[,\-]/g, ' ').split(' ').filter(Boolean);
  if (words.some((w) => ORG_WORDS.has(w)) || ORG_PHRASES.some((re) => re.test(n))) return 'org';
  const person = looksLikePersonName(n) || (PERSON_SUFFIX.test(n) && !/\d|#/.test(n));
  if (person) return 'person';
  if (words.some((w) => WEAK_ORG_WORDS.has(w))) return 'org';
  return 'unknown';
}

// Registrant-type codes that registries publish. Only clear organization or
// government codes count as organizations; everything else is private.
// FAA aircraft registry "Type Registrant": 1 Individual, 2 Partnership,
// 3 Corporation, 4 Co-Owned, 5 Government, 7 LLC, 8 Non-citizen corporation,
// 9 Non-citizen co-owned.
export const TYPE_CODES = {
  faa: { org: new Set(['3', '5', '7', '8']), label: { 1: 'individual', 2: 'partnership', 4: 'co-owned', 9: 'co-owned' } },
};

// recordName(name, { mode, typeCode, registry }) ->
//   { show: true, name, kind }                       the name may be shown
//   { show: false, label, kind }                     shown only as `label`, no name, no address
//
// mode 'strict' (registries that mix persons and organizations: aircraft,
//   radio licences, parcels): show the name ONLY when it is clearly an
//   organization or government body (by type code, else by its words).
// mode 'entity' (databases of businesses and sites: federal award recipients,
//   EPA-regulated facilities, banks, nursing homes): show unless the name looks
//   like a private person's name or a private home.
export function recordName(name, { mode = 'strict', typeCode = null, registry = null } = {}) {
  const kind = classifyName(name);
  const clean = String(name ?? '').trim();
  if (typeCode != null && registry && TYPE_CODES[registry]) {
    const t = TYPE_CODES[registry];
    if (t.org.has(String(typeCode))) return kind === 'withheld' ? { show: false, label: 'Name not published', kind } : { show: true, name: clean, kind: 'org' };
    return { show: false, label: 'Privately registered', kind: 'person' };
  }
  if (kind === 'withheld') return { show: false, label: 'Name not published', kind };
  if (kind === 'person') return { show: false, label: mode === 'strict' ? 'Privately registered' : 'Private individual (not shown)', kind };
  if (kind === 'org') return { show: true, name: clean, kind };
  // unknown
  if (mode === 'entity') return { show: true, name: clean, kind };
  return { show: false, label: 'Privately registered', kind };
}

// Address lines are shown only next to a name that passed as an organization
// or entity; never for a withheld or private record.
export const addressOk = (r) => !!(r && r.show);
