import fs from 'fs';

const raw = JSON.parse(fs.readFileSync('./osm_roads_500m.json', 'utf8'));
const CY = 19.0465581, CX = 72.8224747;
const RADIUS_M = 300;
const MPD_LON = 111320 * Math.cos(CY * Math.PI / 180); // meters per degree lon
const MPD_LAT = 110540; // meters per degree lat

function toMeters(lon, lat) {
  return { x: (lon - CX) * MPD_LON, y: (lat - CY) * MPD_LAT };
}
function toLonLat(x, y) {
  return [CX + x / MPD_LON, CY + y / MPD_LAT];
}

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
    if (Math.hypot(cxp, cyp) > R) return null;
    return null; // brief dip through circle on a segment with both ends outside — skip, negligible at this scale
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

// Excluded because they run over open water within the 300m circle, not on land
const EXCLUDE_TYPES = new Set(['motorway', 'motorway_link', 'construction']);

const segments = [];
raw.elements.forEach(w => {
  const hw = w.tags?.highway;
  if (!w.geometry || EXCLUDE_TYPES.has(hw)) return;
  const name = w.tags?.name || '';
  const pts = w.geometry.map(p => toMeters(p.lon, p.lat));

  const polylines = [];
  let current = [];
  const flush = () => { if (current.length > 1) polylines.push(current); current = []; };
  for (let i = 0; i < pts.length - 1; i++) {
    const seg = clipSegment(pts[i], pts[i + 1], RADIUS_M);
    if (!seg) { flush(); continue; }
    if (current.length === 0) current.push(seg[0]);
    current.push(seg[1]);
  }
  flush();

  polylines.forEach((pl, i) => {
    segments.push({
      id: `osm-${w.id}-${i}`,
      road: name,
      type: hw,
      coords: pl.map(p => {
        const [lon, lat] = toLonLat(p.x, p.y);
        return [Math.round(lon * 1e7) / 1e7, Math.round(lat * 1e7) / 1e7];
      }),
    });
  });
});

fs.writeFileSync('./src/data/segments-geo.json', JSON.stringify(segments, null, 2) + '\n', 'utf8');
console.log(`wrote ${segments.length} segments to src/data/segments-geo.json`);
const named = segments.filter(s => s.road).length;
console.log(`  named: ${named}, unnamed: ${segments.length - named}`);
