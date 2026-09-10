/**
 * generate-date-files.mjs  (v2 — realistic, no time-windows)
 *
 * Each segment gets ONE realistic status per date, based on:
 *  - proximity to Mount Mary Church
 *  - whether it's inbound or outbound
 *  - whether it's a fair day or a normal day
 *
 * Run: node generate-date-files.mjs
 */
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DATA_DIR   = path.join(__dirname, 'src', 'data');
if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });

// ── Color map ──────────────────────────────────────────────────────────
const COLOR = {
  fast:            '#22c55e',
  slowdown:        '#fbbf24',
  stop_and_go:     '#ef4444',
  reported_closed: '#7f1d1d',
  no_data:         '#94a3b8',
};

function e(status) { return { status, color: COLOR[status] }; }

// ── Date identifiers (order is fixed, used for per-segment arrays) ──────
//  0: sep-07-2025  (normal Sat)
//  1: sep-08-2025  (normal Sun)
//  2: sep-01-2024  (normal Sun, light)
//  3: sep-07-2024  (normal Sat)
//  4: sep-23-2024  (normal Mon, very light)
//  5: sep-14-2025  (fair Sun — medium heavy)
//  6: sep-20-2025  (fair Sat — medium heavy)
//  7: sep-21-2025  (fair Sun — last day, heaviest)
//  8: sep-08-2024  (fair Sun — Nativity, heaviest)
//  9: sep-14-2024  (fair Sat — medium heavy)
// 10: sep-15-2024  (fair Sun — medium heavy)

// ── Per-segment status matrix ──────────────────────────────────────────
// Key logic:
//  NORMAL days  → Bandra is naturally busy; narrow roads = slowdown;
//                 arterials mix of fast/slowdown; busy intersections = stop_and_go
//  FAIR days    → Roads inbound to church: stop_and_go → reported_closed
//                 Outbound (away from church): slowdown (controlled flow)
//                 Alternate overflow roads: slowdown (diverted but moving)
//                 Exit routes away from area: fast (police push traffic out)
//                 Unnamed alley: always stop_and_go (tiny lane)

const MATRIX = {
  // ── MOUNT MARY ROAD — direct to church steps ───────────────────────
  // Southbound segments descend toward the church
  '-13560013749929': ['S','S','F','S','F',  'X','X','C','C','X','X'],
  '-13560035613029': ['S','S','F','S','F',  'X','X','C','C','X','X'],
  '-13560013425811': ['S','S','S','S','F',  'X','X','C','C','X','S'],
  // Northbound segments leave the church (outbound — some flow even during fair)
  '13560013749929':  ['S','S','F','S','F',  'X','X','X','X','X','S'],
  '13560035613029':  ['S','F','F','S','F',  'S','X','X','X','X','S'],
  '13560013425811':  ['F','F','F','F','F',  'S','S','X','X','S','S'],

  // ── KANE ROAD — main feeder belt from Bandra station area ──────────
  // Inbound approach (westbound / toward church junction)
  '-13560013595050': ['S','S','F','S','F',  'X','X','X','X','X','S'],
  '-13560037672155': ['S','S','F','S','F',  'X','X','X','X','X','S'],
  '-13560013764920': ['F','F','F','F','F',  'X','X','X','X','S','S'],
  // Outbound (eastbound / leaving the area) — some throughflow even during fair
  '13560013595050':  ['F','F','F','F','F',  'S','S','S','S','S','S'],
  '13560037672155':  ['X','S','S','X','S',  'X','X','X','X','X','X'],
  '13560013764920':  ['S','S','F','S','F',  'S','S','X','S','S','S'],

  // Kane Road fork segments (near church junction — historically congested)
  '-13560343459582': ['N','N','N','N','N',  'S','X','X','X','S','S'],
  '-13560343475154': ['N','N','N','N','N',  'X','X','C','X','X','S'],
  '13560343459582':  ['X','X','S','X','S',  'X','X','X','X','X','X'],
  '13560343475154':  ['X','X','S','X','S',  'X','C','C','X','X','X'],

  // ── H K BHABHA ROAD — parallel alternate route ─────────────────────
  // Police divert traffic here; it moves but slowly during fair
  '-13560343477423': ['S','S','F','S','F',  'S','S','X','X','S','S'],
  '-13560343494836': ['X','S','S','S','F',  'X','X','X','X','X','S'],
  '13560014408481':  ['S','S','F','S','F',  'S','S','S','X','S','S'],
  '13560340007679':  ['S','S','F','S','F',  'X','X','X','X','X','S'],

  // ── BYRAMJI JEEJEEBHOY ROAD ───────────────────────────────────────
  // Short south segment (near main junction)
  '-13560019606602': ['S','S','F','S','F',  'S','S','X','X','S','S'],
  '13560019606602':  ['X','S','S','S','F',  'S','S','X','X','S','S'],
  // Short north connector (tiny, near alley)
  '13560343500152':  ['X','S','S','X','F',  'X','X','X','X','X','S'],
  // LONG northbound exit segment — runs AWAY from the church.
  // During fair, police direct departing crowd this way → actually faster
  '13560343468512':  ['S','S','F','S','F',  'F','F','S','S','F','S'],

  // ── UNNAMED CONNECTOR — tiny alley beside church compound ─────────
  // Always jammed regardless of fair or not (one-lane, no signals)
  '-13560343479463': ['X','X','X','X','X',  'X','X','X','X','X','X'],
};

// ── Date definitions ───────────────────────────────────────────────────
const DATES = [
  { id:'sep-07-2025', date:'7 Sep 2025',  label:'7 Sep 2025',  type:'baseline' },
  { id:'sep-08-2025', date:'8 Sep 2025',  label:'8 Sep 2025',  type:'baseline' },
  { id:'sep-01-2024', date:'1 Sep 2024',  label:'1 Sep 2024',  type:'baseline' },
  { id:'sep-07-2024', date:'7 Sep 2024',  label:'7 Sep 2024',  type:'baseline' },
  { id:'sep-23-2024', date:'23 Sep 2024', label:'23 Sep 2024', type:'baseline' },
  { id:'sep-14-2025', date:'14 Sep 2025', label:'14 Sep 2025', type:'fair' },
  { id:'sep-20-2025', date:'20 Sep 2025', label:'20 Sep 2025', type:'fair' },
  { id:'sep-21-2025', date:'21 Sep 2025', label:'21 Sep 2025', type:'fair' },
  { id:'sep-08-2024', date:'8 Sep 2024',  label:'8 Sep 2024',  type:'fair' },
  { id:'sep-14-2024', date:'14 Sep 2024', label:'14 Sep 2024', type:'fair' },
  { id:'sep-15-2024', date:'15 Sep 2024', label:'15 Sep 2024', type:'fair' },
];

// ── Status abbreviation → full entry ──────────────────────────────────
const MAP_STATUS = { F:'fast', S:'slowdown', X:'stop_and_go', C:'reported_closed', N:'no_data' };

// ── Generate per-date files ────────────────────────────────────────────
DATES.forEach((d, idx) => {
  const segments = {};
  for (const [segId, row] of Object.entries(MATRIX)) {
    const abbr = row[idx];
    const status = MAP_STATUS[abbr] ?? 'no_data';
    segments[segId] = e(status);
  }
  const payload = { id: d.id, date: d.date, label: d.label, type: d.type, segments };
  const out = path.join(DATA_DIR, `traffic-${d.id}.json`);
  fs.writeFileSync(out, JSON.stringify(payload, null, 2));
  console.log(`✓  traffic-${d.id}.json`);
});

// ── dates-config.json ──────────────────────────────────────────────────
const config = {
  church: { name:'Basilica of Our Lady of the Mount, Bandra', lat:19.0465581, lon:72.8224747 },
  left_dates:  DATES.filter(d => d.type === 'baseline').map(({ id, date, label }) => ({ id, date, label })),
  right_dates: DATES.filter(d => d.type === 'fair')    .map(({ id, date, label }) => ({ id, date, label })),
};
fs.writeFileSync(path.join(DATA_DIR, 'dates-config.json'), JSON.stringify(config, null, 2));
console.log('✓  dates-config.json');

console.log(`\nDone — ${DATES.length + 1} files written to src/data/`);
