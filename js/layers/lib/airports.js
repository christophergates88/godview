// Built-in reference list of major airports (code, name, lat, lon).
// Coordinates are approximate (airport reference points rounded to ~0.01°).
// Used by the "Major airports" and "FAA airport delays" layers.

export const AIRPORTS = [
  ['ATL', 'Atlanta Hartsfield-Jackson', 33.64, -84.43], ['LAX', 'Los Angeles', 33.94, -118.41], ['ORD', 'Chicago O\'Hare', 41.98, -87.90],
  ['DFW', 'Dallas/Fort Worth', 32.90, -97.04], ['DEN', 'Denver', 39.86, -104.67], ['JFK', 'New York JFK', 40.64, -73.78],
  ['SFO', 'San Francisco', 37.62, -122.38], ['SEA', 'Seattle-Tacoma', 47.45, -122.31], ['LAS', 'Las Vegas Harry Reid', 36.08, -115.15],
  ['MCO', 'Orlando', 28.43, -81.31], ['EWR', 'Newark', 40.69, -74.17], ['CLT', 'Charlotte', 35.21, -80.94],
  ['PHX', 'Phoenix Sky Harbor', 33.43, -112.01], ['IAH', 'Houston Bush', 29.98, -95.34], ['MIA', 'Miami', 25.79, -80.29],
  ['BOS', 'Boston Logan', 42.36, -71.01], ['MSP', 'Minneapolis-St Paul', 44.88, -93.22], ['FLL', 'Fort Lauderdale', 26.07, -80.15],
  ['DTW', 'Detroit', 42.21, -83.35], ['PHL', 'Philadelphia', 39.87, -75.24], ['LGA', 'New York LaGuardia', 40.78, -73.87],
  ['BWI', 'Baltimore/Washington', 39.18, -76.67], ['SLC', 'Salt Lake City', 40.79, -111.98], ['SAN', 'San Diego', 32.73, -117.19],
  ['IAD', 'Washington Dulles', 38.95, -77.46], ['DCA', 'Washington Reagan', 38.85, -77.04], ['MDW', 'Chicago Midway', 41.79, -87.75],
  ['TPA', 'Tampa', 27.98, -82.53], ['HNL', 'Honolulu', 21.32, -157.92], ['PDX', 'Portland OR', 45.59, -122.60],
  ['BNA', 'Nashville', 36.12, -86.68], ['AUS', 'Austin', 30.19, -97.67], ['DAL', 'Dallas Love', 32.85, -96.85],
  ['STL', 'St Louis', 38.75, -90.37], ['HOU', 'Houston Hobby', 29.65, -95.28], ['SJC', 'San Jose', 37.36, -121.93],
  ['RDU', 'Raleigh-Durham', 35.88, -78.79], ['MCI', 'Kansas City', 39.30, -94.71], ['OAK', 'Oakland', 37.72, -122.22],
  ['SMF', 'Sacramento', 38.70, -121.59], ['SNA', 'Orange County', 33.68, -117.87], ['MSY', 'New Orleans', 29.99, -90.26],
  ['SAT', 'San Antonio', 29.53, -98.47], ['CLE', 'Cleveland', 41.41, -81.85], ['PIT', 'Pittsburgh', 40.49, -80.23],
  ['IND', 'Indianapolis', 39.72, -86.29], ['CMH', 'Columbus OH', 39.998, -82.89], ['CVG', 'Cincinnati', 39.05, -84.67],
  ['JAX', 'Jacksonville', 30.49, -81.69], ['RSW', 'Fort Myers', 26.54, -81.76], ['PBI', 'West Palm Beach', 26.68, -80.10],
  ['MKE', 'Milwaukee', 42.95, -87.90], ['ANC', 'Anchorage', 61.17, -149.99], ['OGG', 'Kahului Maui', 20.90, -156.43],
  ['SAV', 'Savannah/Hilton Head', 32.13, -81.20], ['CHS', 'Charleston SC', 32.90, -80.04], ['MEM', 'Memphis', 35.04, -89.98],
  ['SDF', 'Louisville', 38.17, -85.74], ['BDL', 'Hartford Bradley', 41.94, -72.68], ['ABQ', 'Albuquerque', 35.04, -106.61],
  ['TUS', 'Tucson', 32.12, -110.94], ['OMA', 'Omaha', 41.30, -95.89], ['OKC', 'Oklahoma City', 35.39, -97.60],
  ['RIC', 'Richmond', 37.51, -77.32], ['ORF', 'Norfolk', 36.89, -76.20], ['BUF', 'Buffalo', 42.94, -78.73],
  ['TEB', 'Teterboro', 40.85, -74.06], ['HPN', 'White Plains', 41.07, -73.71], ['ISP', 'Long Island MacArthur', 40.80, -73.10],
  ['MSN', 'Madison', 43.14, -89.34], ['BHM', 'Birmingham AL', 33.56, -86.75], ['AGS', 'Augusta GA', 33.37, -81.96],
  ['MCN', 'Macon GA', 32.69, -83.65], ['CSG', 'Columbus GA', 32.52, -84.94], ['SFB', 'Orlando Sanford', 28.78, -81.24],
  ['YYZ', 'Toronto Pearson', 43.68, -79.63], ['YVR', 'Vancouver', 49.19, -123.18], ['YUL', 'Montreal', 45.47, -73.74],
  ['MEX', 'Mexico City', 19.44, -99.07], ['CUN', 'Cancun', 21.04, -86.87], ['LHR', 'London Heathrow', 51.47, -0.45],
  ['CDG', 'Paris Charles de Gaulle', 49.01, 2.55], ['AMS', 'Amsterdam Schiphol', 52.31, 4.76], ['FRA', 'Frankfurt', 50.03, 8.57],
  ['MAD', 'Madrid', 40.49, -3.57], ['IST', 'Istanbul', 41.26, 28.74], ['DXB', 'Dubai', 25.25, 55.36],
  ['DOH', 'Doha', 25.27, 51.61], ['DEL', 'Delhi', 28.56, 77.10], ['SIN', 'Singapore Changi', 1.36, 103.99],
  ['HKG', 'Hong Kong', 22.31, 113.92], ['HND', 'Tokyo Haneda', 35.55, 139.78], ['NRT', 'Tokyo Narita', 35.77, 140.39],
  ['ICN', 'Seoul Incheon', 37.46, 126.44], ['PEK', 'Beijing Capital', 40.08, 116.58], ['PVG', 'Shanghai Pudong', 31.14, 121.81],
  ['SYD', 'Sydney', -33.95, 151.18], ['GRU', 'São Paulo Guarulhos', -23.43, -46.47], ['BOG', 'Bogotá', 4.70, -74.15],
  ['JNB', 'Johannesburg', -26.14, 28.24],
];

export const AIRPORT_BY_CODE = new Map(AIRPORTS.map(([code, name, lat, lon]) => [code, { code, name, lat, lon }]));
