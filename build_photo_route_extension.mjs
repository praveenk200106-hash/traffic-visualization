/**
 * build_photo_route_extension.mjs
 *
 * The site-visit photos document a real walking route that continues past
 * the 300m survey boundary — St John Baptist Road runs much further than
 * the tiny clipped piece we originally kept, and it connects into Saint
 * Sebastian Road, a road we never fetched at all. Both carry real
 * photographed foot traffic, so they're added at their real length
 * (clipped to 650m — comfortably past the farthest relevant photo cluster
 * at ~605m) rather than left as dead ends with no data.
 *
 * Run: node build_photo_route_extension.mjs   (after build_real_segments.mjs)
 */
import fs from 'fs';
import path from 'path';

const CY = 19.0465581, CX = 72.8224747;
const EXT_RADIUS_M = 650;
const MPD_LON = 111320 * Math.cos(CY * Math.PI / 180);
const MPD_LAT = 110540;

const raw = JSON.parse(fs.readFileSync('./osm_roads_700m.json', 'utf8'));
const TARGET_WAY_IDS = new Set([1552764898, 31152932, 31151924]);

function toMeters(lon, lat) { return { x: (lon - CX) * MPD_LON, y: (lat - CY) * MPD_LAT }; }
function toLonLat(x, y) { return [CX + x / MPD_LON, CY + y / MPD_LAT]; }

function clipSegment(p0, p1, R) {
  const d0 = Math.hypot(p0.x, p0.y), d1 = Math.hypot(p1.x, p1.y);
  const in0 = d0 <= R, in1 = d1 <= R;
  if (in0 && in1) return [p0, p1];
  const dx = p1.x - p0.x, dy = p1.y - p0.y;
  if (!in0 && !in1) {
    const len2 = dx * dx + dy * dy;
    if (len2 === 0) return null;
    const t = -(p0.x * dx + p0.y * dy) / len2;
    if (t < 0 || t > 1) return null;
    const cxp = p0.x + t * dx, cyp = p0.y + t * dy;
    return Math.hypot(cxp, cyp) > R ? null : null;
  }
  const a = dx * dx + dy * dy;
  const b = 2 * (p0.x * dx + p0.y * dy);
  const c = p0.x * p0.x + p0.y * p0.y - R * R;
  const disc = b * b - 4 * a * c;
  if (disc < 0) return in0 ? [p0, p0] : [p1, p1];
  const sq = Math.sqrt(disc);
  const s1 = (-b + sq) / (2 * a), s2 = (-b - sq) / (2 * a);
  const cand = [s1, s2].filter(s => s >= 0 && s <= 1);
  const sVal = cand.length ? cand[0] : (s1 >= 0 && s1 <= 1 ? s1 : s2);
  const ix = p0.x + sVal * dx, iy = p0.y + sVal * dy;
  return in0 ? [p0, { x: ix, y: iy }] : [{ x: ix, y: iy }, p1];
}

const DATA_DIR = './src/data';
const existing = JSON.parse(fs.readFileSync(path.join(DATA_DIR, 'segments-geo.json'), 'utf8'));
// Drop the old truncated St John Baptist Road piece — replaced below with its real full length
const kept = existing.filter(s => s.id !== 'osm-1552764898-0');

const added = [];
raw.elements.forEach(w => {
  if (!TARGET_WAY_IDS.has(w.id) || !w.geometry) return;
  const name = w.tags?.name ?? '';
  const pts = w.geometry.map(p => toMeters(p.lon, p.lat));

  const polylines = [];
  let current = [];
  const flush = () => { if (current.length > 1) polylines.push(current); current = []; };
  for (let i = 0; i < pts.length - 1; i++) {
    const seg = clipSegment(pts[i], pts[i + 1], EXT_RADIUS_M);
    if (!seg) { flush(); continue; }
    if (current.length === 0) current.push(seg[0]);
    current.push(seg[1]);
  }
  flush();

  polylines.forEach((pl, i) => {
    added.push({
      id: `osm-${w.id}-${i}`,
      road: name,
      type: w.tags.highway,
      coords: pl.map(p => {
        const [lon, lat] = toLonLat(p.x, p.y);
        return [Math.round(lon * 1e7) / 1e7, Math.round(lat * 1e7) / 1e7];
      }),
    });
  });
});

fs.writeFileSync(path.join(DATA_DIR, 'segments-geo.json'), JSON.stringify([...kept, ...added], null, 2) + '\n', 'utf8');
console.log(`Replaced truncated St John Baptist Road piece; added ${added.length} segments:`,
  [...new Set(added.map(s => s.road))].join(', '));
