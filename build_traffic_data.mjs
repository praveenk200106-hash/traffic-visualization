/**
 * build_traffic_data.mjs
 *
 * Hand-authored (not random) traffic status per REAL street, for the 4
 * normal-vs-fair comparisons. Status is assigned per road NAME (every
 * clipped OSM segment sharing that name gets the same status) based on:
 *   - distance from the Basilica (closer = more affected by the fair)
 *   - the road's real role: direct pilgrim approach, feeder, parallel
 *     police-diversion route, or an outbound "exit" route that stays
 *     clear because departing crowds are pushed that way.
 * Unnamed lanes/tracks are left out — they fall back to "no sensor data"
 * in the app, which is realistic for small unmonitored service lanes.
 *
 * Run: node build_traffic_data.mjs
 */
import fs from 'fs';
import path from 'path';

const DATA_DIR = './src/data';
const segments = JSON.parse(fs.readFileSync(path.join(DATA_DIR, 'segments-geo.json'), 'utf8'));

const COLOR = {
  fast:            '#22c55e',
  slowdown:        '#fbbf24',
  stop_and_go:     '#ef4444',
  reported_closed: '#7f1d1d',
};

// Column order — 4 baseline (normal) dates, then 4 fair (event) dates.
// Every pair below is exactly 7 days apart (see dates-config.json).
const DATES = [
  { id: 'sep-07-2025', date: '7 Sep 2025',  label: '7 Sep 2025 (normal)',  type: 'baseline' },
  { id: 'sep-13-2025', date: '13 Sep 2025', label: '13 Sep 2025 (normal)', type: 'baseline' },
  { id: 'sep-01-2024', date: '1 Sep 2024',  label: '1 Sep 2024 (normal)',  type: 'baseline' },
  { id: 'sep-07-2024', date: '7 Sep 2024',  label: '7 Sep 2024 (normal)',  type: 'baseline' },
  { id: 'sep-14-2025', date: '14 Sep 2025', label: '14 Sep 2025 (fair)',   type: 'fair' },
  { id: 'sep-20-2025', date: '20 Sep 2025', label: '20 Sep 2025 (fair)',   type: 'fair' },
  { id: 'sep-08-2024', date: '8 Sep 2024',  label: '8 Sep 2024 (fair)',    type: 'fair' },
  { id: 'sep-14-2024', date: '14 Sep 2024', label: '14 Sep 2024 (fair)',   type: 'fair' },
];
// col index: 0=7Sep25  1=13Sep25  2=1Sep24  3=7Sep24  4=14Sep25(opening Sun)
//            5=20Sep25(2nd Sat)  6=8Sep24(Nativity — the single biggest day)  7=14Sep24(2nd Sun)

const F = 'fast', S = 'slowdown', X = 'stop_and_go', C = 'reported_closed';

// Road name → per-date status row. Reasoning per road is in the comment.
// Roads with real internal texture (multiple real OSM segments, verified
// against live Google Maps traffic screenshots of this exact area) are
// handled per-segment instead — see PER_SEGMENT below — since a real road
// is never one uniform colour end-to-end.
const MATRIX = {
  // Pedestrian steps straight to the church door — quiet normally, a crush on fair days.
  'Mount Mary Church Steps':[F, F, S, F,   X, S, C, X],

  // Secondary pedestrian approach — busy, but never as jammed as the main steps.
  'St. Stephens Steps':     [F, F, F, S,   S, S, X, S],

  // Main vehicle feeder road at the base of the hill.
  'Kane Road':               [S, S, S, S,   X, S, X, X],

  // Parallel tertiary road — this is where police divert traffic, so it
  // stays moving even on the worst day.
  'HK Bhaba Road':           [S, S, F, S,   S, S, S, S],

  // Residential lane near Kane Road — soaks up some overflow.
  'D. P. Marg':              [S, F, S, S,   S, X, S, S],

  'Bimal Roy Lane':          [F, F, F, S,   S, S, S, F],

  // Used by police as an outbound exit route — stays clear/fast even during the fair.
  'Bullock Road':            [F, S, F, F,   F, F, F, F],

  // North-east residential, off the main pilgrim route — only overflow parking reaches it.
  'Rebello Road':            [F, F, S, F,   S, F, S, F],

  // ~600 m out, a real secondary road the photographed route continues onto —
  // busier baseline (it's a through-road, not a lane), moderate fair-day overflow.
  'Saint Sebastian Road':    [S, F, S, S,   S, X, S, S],

  // Coastal promenade — not on the fair route at all.
  'Bandstand Promenade':     [F, F, F, F,   F, F, F, F],

  // Farthest named road in the 300 m radius — least affected.
  'Cemetry Road':            [F, F, F, S,   S, F, S, F],
};

// ── Per-segment texture ───────────────────────────────────────────────────
// Real Google Maps traffic never colours a whole road one colour — it varies
// stretch by stretch at junctions and turns. Verified against live traffic
// screenshots of KC Marg, Hill Road, Linking Road, S.V. Road, and the Mount
// Mary Road area. Each entry below overrides MATRIX/CONTEXT_PROBABILITY for
// that specific real OSM segment id, designed independently per road
// (8 statuses in the same DATES column order) rather than one flat value
// for the whole named road.
const PER_SEGMENT = {
  // Mount Mary Road — the main pilgrim approach, steepest, right at the
  // church. The two segments closest to the church are the most severely
  // affected (hitting reported_closed on the worst days); the longer
  // stretch further down the hill stays stop_and_go even on the worst day
  // rather than fully closed.
  'osm-1415665101-0': [S, S, S, S,  X, C, C, X],
  'osm-1415665103-0': [S, S, S, S,  X, X, C, C],
  'osm-31152109-0':   [S, S, S, F,  X, X, X, X],

  // Byramji Jeejeebhoy Road — real diversion route, 2 segments.
  'osm-31151606-0': [F, F, S, F,  F, S, S, S],
  'osm-39480556-0': [F, S, S, F,  S, S, X, S],

  // Kadeshwari Mandir Marg — west-side approach, 4 segments.
  'osm-464383124-0':  [F, F, F, S,  X, S, C, X],
  'osm-215382512-0':  [S, F, S, S,  S, F, X, S],
  'osm-31152131-0':   [S, S, S, S,  S, S, X, S],
  'osm-1393213574-0': [F, F, F, F,  S, F, S, F],

  // St John Baptist Road — peripheral, 2 segments (near end picks up more
  // fair-day overflow than the far end toward Saint Sebastian Road).
  'osm-1552764898-0': [F, S, F, S,  S, X, X, S],
  'osm-31152932-0':   [F, F, F, F,  F, S, S, F],

  // KC Road — real secondary/tertiary road ~512m-1556m out. Mostly ambient
  // Mumbai traffic; the segment near the Lilavati Hospital junction
  // (ctx-1493792222-0) and the flyover-approach segments at the far end
  // are the consistent bottlenecks, matching the live reference screenshot.
  'ctx-1235236206-0': [F, F, F, S,  F, S, S, F],
  'ctx-1081349388-0': [F, S, F, F,  S, F, S, S],
  'ctx-22859779-0':   [S, F, F, S,  S, S, F, F],
  'ctx-1081349387-0': [F, S, S, F,  F, S, S, S],
  'ctx-1140711299-0': [F, F, F, S,  F, F, F, S],
  'ctx-1145063878-0': [S, F, F, F,  S, F, S, F],
  'ctx-1145066142-0': [F, S, F, F,  F, S, F, S],
  'ctx-1493792224-0': [S, F, S, S,  S, F, S, F],
  'ctx-1493792222-0': [X, X, S, X,  X, X, X, X],
  'ctx-741797869-0':  [S, F, F, S,  S, F, S, F],
  'ctx-1334676843-0': [F, S, F, F,  S, S, S, F],
  'ctx-1484812650-0': [S, F, S, F,  F, S, S, S],
  'ctx-1235213722-0': [S, X, S, X,  S, X, X, X],
  'ctx-1289185528-0': [X, S, X, S,  X, X, X, X],
  'ctx-1235236205-0': [S, S, F, S,  X, S, X, S],

  // Hill Road — real commercial street, ~732m-1829m out. Two reference
  // screenshots: mostly green with short red patches at specific junctions
  // (short 2-point segments are the pinch-points); noticeably busier on
  // fair days since this is a real feeder route from the station.
  'ctx-1137489456-0': [F, S, F, F,  S, S, X, S],
  'ctx-783730705-0':  [F, F, S, F,  S, X, X, S],
  'ctx-1137489457-0': [S, F, X, S,  X, X, X, S],
  'ctx-552505788-0':  [F, S, F, F,  S, S, S, X],
  'ctx-552505789-0':  [F, F, F, S,  F, S, S, S],
  'ctx-1053511374-0': [F, F, F, S,  S, S, X, S],
  'ctx-31152564-0':   [F, S, F, F,  S, S, S, S],
  'ctx-1293641200-0': [S, S, F, S,  X, X, X, X],
  'ctx-1293641193-0': [F, F, S, F,  S, S, S, X],
  'ctx-1545066404-0': [S, F, X, S,  X, X, X, X],
  'ctx-1132467164-0': [F, S, S, X,  X, S, X, X],

  // S.V. Road — chronically busy major arterial, ~1676m-1868m out, all in
  // one dense junction cluster. Reference screenshot shows a continuous
  // red middle stretch (Linking Road Market / college area) with green
  // resuming at both the near and far ends — baseline and fair-day
  // character stay close since the fair barely reaches this far.
  'ctx-1235213725-0': [F, F, S, F,  F, S, F, F],
  'ctx-1235442610-0': [S, F, F, S,  F, S, F, F],
  'ctx-1238867119-0': [X, S, X, S,  S, X, X, S],
  'ctx-1235236204-0': [S, X, S, X,  X, S, X, X],
  'ctx-1235442621-0': [X, X, S, X,  X, X, X, S],
  'ctx-1238867133-0': [X, X, X, S,  X, X, S, X],
  'ctx-1090505269-0': [X, X, X, S,  X, X, X, X],
  'ctx-48803919-0':   [X, S, X, X,  X, X, X, X],
  'ctx-1545066402-0': [S, X, X, S,  X, S, X, X],
  'ctx-1238867118-0': [X, S, S, X,  S, X, X, S],
  'ctx-1253603273-0': [S, S, X, S,  S, S, X, S],
  'ctx-1545066403-0': [F, S, F, S,  S, F, S, F],
  'ctx-123266914-0':  [F, F, S, F,  F, F, S, F],
  'ctx-553233665-0':  [F, F, F, S,  F, F, F, F],

  // Linking Road — real major arterial, ~2087m-2428m out, the farthest
  // reference road. Reference screenshot shows congestion concentrated in
  // one identifiable middle stretch (market/college area) with lighter
  // traffic at both ends — only marginally worse on the two biggest fair
  // days from general area congestion, not pilgrim traffic directly.
  'ctx-1237797033-0': [F, S, F, F,  S, S, S, S],
  'ctx-1293641194-0': [S, X, F, S,  S, X, X, S],
  'ctx-1293641198-0': [X, X, S, X,  X, X, X, X],
  'ctx-1394149915-0': [S, S, S, S,  S, X, X, S],
  'ctx-1375103129-0': [F, S, F, S,  F, S, S, F],
  'ctx-552055265-0':  [F, F, F, F,  F, F, S, F],
};

// ── Unnamed paths that the site-visit photo points actually sit on ───────
// Cross-referencing the 72 geotagged Mount Mary Church photos against the
// road network found two unnamed segments carrying real photographed foot
// traffic that the named-road MATRIX above doesn't cover.
const EXTRA_SEGMENTS = {
  // 18 of the 72 photos cluster within 4m of this one — the forecourt path
  // right at the church door. Busiest single point in the whole photo set,
  // so it's treated at least as severely as Mount Mary Road itself.
  'osm-1188226493-0': [S, F, S, F,   X, X, C, X],
  // 14 photos cluster here, right where this path meets St John Baptist Rd
  // / Rebello Road — same light-baseline, overflow-on-fair-days pattern.
  'osm-235923269-0':  [F, S, F, F,   S, S, S, F],
  // 5 photos cluster ~300m NE of the church, near Bimal Roy Lane — a
  // winding residential-compound service lane, peripheral to the fair.
  'osm-701071299-0':  [F, F, F, S,   S, F, S, F],
};

const byRoad = {};
segments.forEach(s => {
  if (!s.road) return;
  (byRoad[s.road] ||= []).push(s.id);
});

let filesWritten = 0;
DATES.forEach((d, col) => {
  const segEntries = {};
  Object.entries(MATRIX).forEach(([road, row]) => {
    const ids = byRoad[road];
    if (!ids) { console.warn(`  ! no segment found for road "${road}" — skipping`); return; }
    const status = row[col];
    ids.forEach(id => { segEntries[id] = { status, color: COLOR[status] }; });
  });

  Object.entries(EXTRA_SEGMENTS).forEach(([segId, row]) => {
    const status = row[col];
    segEntries[segId] = { status, color: COLOR[status] };
  });

  // Per-segment texture overrides everything above for the specific
  // segment ids it covers — this is the finest-grained, most-designed data.
  Object.entries(PER_SEGMENT).forEach(([segId, row]) => {
    const status = row[col];
    segEntries[segId] = { status, color: COLOR[status] };
  });

  const payload = { id: d.id, date: d.date, label: d.label, type: d.type, segments: segEntries };
  fs.writeFileSync(path.join(DATA_DIR, `traffic-${d.id}.json`), JSON.stringify(payload, null, 2) + '\n', 'utf8');
  filesWritten++;
  console.log(`✓ traffic-${d.id}.json  (${Object.keys(segEntries).length} segments)`);
});

// ── Regenerate src/data/index.ts to import exactly these 8 dates ────────
const importLines = DATES.map(d => `import _${d.id.replace(/-/g, '_')} from './traffic-${d.id}.json';`).join('\n');
const mergeLines  = DATES.map(d => `  '${d.id}': _${d.id.replace(/-/g, '_')} as DateTrafficData,`).join('\n');

const indexTs = `// Auto-generated by build_traffic_data.mjs
import type { DateTrafficData, SitePhoto } from '../app/types';
import _datesConfig       from './dates-config.json';
import _segmentsGeo       from './segments-geo.json';
import _sitePhotosMountMary from './site-visit-mount-mary.json';
${importLines}

export const datesConfig   = _datesConfig;
export const segmentsGeo   = _segmentsGeo;
export const sitePhotosMountMary = _sitePhotosMountMary as SitePhoto[];

export const ALL_DATES_DATA: Record<string, DateTrafficData> = {
${mergeLines}
};
`;
fs.writeFileSync(path.join(DATA_DIR, 'index.ts'), indexTs, 'utf8');
console.log(`✓ src/data/index.ts (${DATES.length} dates)`);
console.log(`\nDone — ${filesWritten} traffic files written.`);
