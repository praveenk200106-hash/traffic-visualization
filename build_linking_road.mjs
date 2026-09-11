/**
 * build_linking_road.mjs
 *
 * Linking Road — real, major Bandra arterial, but ~2.1 km from the church
 * (the farthest of the reference roads). Added the same way as SV/Hill/KC
 * Road: real geometry, clipped to a bounded extent, drawn as a "context"
 * road outside the 300 m survey area.
 *
 * Run: node build_linking_road.mjs
 */
import fs from 'fs';
import path from 'path';

const CY = 19.0465581, CX = 72.8224747;
const CLIP_RADIUS_M = 2500;
const MPD_LON = 111320 * Math.cos(CY * Math.PI / 180);
const MPD_LAT = 110540;

const raw = JSON.parse(fs.readFileSync('./osm_linking_road.json', 'utf8'));

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
const kept = existing.filter(s => s.road !== 'Linking Road'); // re-runnable

const added = [];
raw.elements.forEach(w => {
  if (!w.geometry || w.tags?.name !== 'Linking Road') return;
  const pts = w.geometry.map(p => toMeters(p.lon, p.lat));

  const polylines = [];
  let current = [];
  const flush = () => { if (current.length > 1) polylines.push(current); current = []; };
  for (let i = 0; i < pts.length - 1; i++) {
    const seg = clipSegment(pts[i], pts[i + 1], CLIP_RADIUS_M);
    if (!seg) { flush(); continue; }
    if (current.length === 0) current.push(seg[0]);
    current.push(seg[1]);
  }
  flush();

  polylines.forEach((pl, i) => {
    added.push({
      id: `ctx-${w.id}-${i}`,
      road: 'Linking Road',
      type: w.tags.highway,
      context: true,
      coords: pl.map(p => {
        const [lon, lat] = toLonLat(p.x, p.y);
        return [Math.round(lon * 1e7) / 1e7, Math.round(lat * 1e7) / 1e7];
      }),
    });
  });
});

fs.writeFileSync(path.join(DATA_DIR, 'segments-geo.json'), JSON.stringify([...kept, ...added], null, 2) + '\n', 'utf8');
console.log(`Added ${added.length} Linking Road segments`);
