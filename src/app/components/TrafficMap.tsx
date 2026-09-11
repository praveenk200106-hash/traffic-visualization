'use client';

import { useRef, useEffect, useState, useCallback } from 'react';
import type { TrafficMapProps, SegmentGeo, TrafficEntry, DateOption, SitePhoto } from '../types';
import type L from 'leaflet';

const SURVEY_RADIUS_M = 300;
const RADIUS_BLUE = '#3b82f6';

interface Projected {
  geo:    SegmentGeo;
  points: { x: number; y: number }[];
}

/** Clear Leaflet's container flag so React Strict Mode double-mount doesn't throw */
function clearLeafletContainer(el: HTMLElement | null) {
  if (el) (el as HTMLElement & { _leaflet_id?: number })._leaflet_id = undefined;
}

function pathLength(points: { x: number; y: number }[]): number {
  let len = 0;
  for (let i = 1; i < points.length; i++) len += Math.hypot(points[i].x - points[i - 1].x, points[i].y - points[i - 1].y);
  return len;
}

interface PillStyle {
  bg:     string;
  border: string;
  fg:     string;
}

const ROAD_LABEL_STYLE:   PillStyle = { bg: '#f0e4c8', border: 'rgba(90,68,32,0.25)', fg: '#4a3418' };
const CHURCH_LABEL_STYLE: PillStyle = { bg: '#163047', border: '#0a1a29',             fg: '#fff'    };

/** Google-Maps-style rounded name tag, centred at (x, y) */
function drawLabelPill(ctx: CanvasRenderingContext2D, text: string, x: number, y: number, style: PillStyle) {
  ctx.font = '700 12px system-ui, -apple-system, sans-serif';
  ctx.textAlign    = 'center';
  ctx.textBaseline = 'middle';

  const padX = 9, padY = 5;
  const textW = ctx.measureText(text).width;
  const w = textW + padX * 2;
  const h = 14 + padY * 2;

  ctx.save();
  ctx.shadowColor   = 'rgba(0,0,0,0.35)';
  ctx.shadowBlur    = 4;
  ctx.shadowOffsetY = 1.5;
  ctx.beginPath();
  ctx.roundRect(x - w / 2, y - h / 2, w, h, h / 2);
  ctx.fillStyle = style.bg;
  ctx.fill();
  ctx.restore();

  ctx.beginPath();
  ctx.roundRect(x - w / 2, y - h / 2, w, h, h / 2);
  ctx.strokeStyle = style.border;
  ctx.lineWidth   = 1;
  ctx.stroke();

  ctx.fillStyle = style.fg;
  ctx.fillText(text, x, y + 0.5);

  return h;
}

// ── Responsive hook ──────────────────────────────────────────────────────
function useIsMobile(breakpoint = 540): boolean {
  const [mobile, setMobile] = useState(false);
  useEffect(() => {
    const mq = window.matchMedia(`(max-width: ${breakpoint}px)`);
    setMobile(mq.matches);
    const handler = (e: MediaQueryListEvent) => setMobile(e.matches);
    mq.addEventListener('change', handler);
    return () => mq.removeEventListener('change', handler);
  }, [breakpoint]);
  return mobile;
}

// ── Custom upward-opening picker (used on mobile) ─────────────────────────
interface PickerProps {
  id:        string;
  side:      'left' | 'right';
  options:   DateOption[];
  value:     string;
  onChange:  (val: string) => void;
  ariaLabel: string;
}

function MobilePicker({ id, side, options, value, onChange, ariaLabel }: PickerProps) {
  const [open, setOpen] = useState(false);
  const wrapRef = useRef<HTMLDivElement>(null);

  // Close on outside click
  useEffect(() => {
    if (!open) return;
    function handle(e: MouseEvent) {
      if (wrapRef.current && !wrapRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    document.addEventListener('mousedown', handle);
    return () => document.removeEventListener('mousedown', handle);
  }, [open]);

  const selected = options.find(o => o.id === value);

  return (
    <div className="custom-select-wrapper" ref={wrapRef}>
      <button
        id={id}
        type="button"
        className={`custom-select-btn custom-select-btn--${side}`}
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-label={ariaLabel}
        onClick={() => setOpen(v => !v)}
      >
        {selected?.label ?? value}
      </button>

      {open && (
        <ul
          role="listbox"
          aria-label={ariaLabel}
          className="custom-select-list"
        >
          {options.map(opt => (
            <li key={opt.id} role="option" aria-selected={opt.id === value}>
              <button
                type="button"
                className={`custom-select-option custom-select-option--${side}`}
                aria-selected={opt.id === value}
                onClick={() => { onChange(opt.id); setOpen(false); }}
              >
                {opt.label}
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

export default function TrafficMap({ config, segments, allDatesData, sitePhotos }: TrafficMapProps) {
  const { church, left_dates, right_dates } = config;

  // ── State ────────────────────────────────────────────────────────────
  const [leftId,     setLeftId]     = useState(left_dates[0].id);
  const [rightId,    setRightId]    = useState(right_dates[0].id);
  const [split,      setSplit]      = useState(0.5);
  const [showLegend, setShowLegend] = useState(false);
  const [statusMsg,  setStatusMsg]  = useState<string | null>(null);
  const [zoom,       setZoom]       = useState(17);
  const [mapReady,    setMapReady]    = useState(false);
  const [activePhotos, setActivePhotos] = useState<SitePhoto[] | null>(null);
  const isMobile = useIsMobile();

  // Close the photo sidebar on Escape
  useEffect(() => {
    if (!activePhotos) return;
    const onEsc = (e: KeyboardEvent) => { if (e.key === 'Escape') setActivePhotos(null); };
    document.addEventListener('keydown', onEsc);
    return () => document.removeEventListener('keydown', onEsc);
  }, [activePhotos]);

  // ── Paired selection: each date names its counterpart explicitly ─────
  const selectLeft = useCallback((id: string) => {
    setLeftId(id);
    const pair = left_dates.find(d => d.id === id)?.pairsWith;
    if (pair && right_dates.some(d => d.id === pair)) setRightId(pair);
  }, [left_dates, right_dates]);

  const selectRight = useCallback((id: string) => {
    setRightId(id);
    const pair = right_dates.find(d => d.id === id)?.pairsWith;
    if (pair && left_dates.some(d => d.id === pair)) setLeftId(pair);
  }, [left_dates, right_dates]);


  // ── Refs ──────────────────────────────────────────────────────────────
  const mapRef       = useRef<L.Map | null>(null);
  const mapElRef     = useRef<HTMLDivElement>(null);
  const canvasRef    = useRef<HTMLCanvasElement>(null);
  const frameRef     = useRef<HTMLDivElement>(null);
  const dividerRef   = useRef<HTMLDivElement>(null);
  const handleRef    = useRef<HTMLDivElement>(null);
  const rafRef       = useRef<number>(0);
  const splitRef     = useRef<number>(0.5);
  const projRef      = useRef<Projected[]>([]);
  const leftIdRef    = useRef(leftId);
  const rightIdRef   = useRef(rightId);

  useEffect(() => { splitRef.current  = split;   }, [split]);
  useEffect(() => { leftIdRef.current  = leftId;  }, [leftId]);
  useEffect(() => { rightIdRef.current = rightId; }, [rightId]);

  // ── Segment lookup helper ─────────────────────────────────────────────
  const getEntry = useCallback(
    (segId: string, dateId: string): TrafficEntry =>
      allDatesData[dateId]?.segments?.[segId] ?? { status: 'no_data', color: '#94a3b8' },
    [allDatesData]
  );

  // ── Canvas render ─────────────────────────────────────────────────────
  // Draws the real street network (from OpenStreetMap, clipped to the
  // 300 m survey radius), colored per segment by that side's traffic status.
  const render = useCallback(() => {
    const map    = mapRef.current;
    const canvas = canvasRef.current;
    if (!map || !canvas) return;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const size = map.getSize();
    const dpr  = Math.min(window.devicePixelRatio || 1, 2);
    canvas.width        = Math.round(size.x * dpr);
    canvas.height       = Math.round(size.y * dpr);
    canvas.style.width  = size.x + 'px';
    canvas.style.height = size.y + 'px';
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

    // Container (viewport) coordinates, matching the canvas overlay that
    // sits pinned over the map container rather than inside a Leaflet pane
    projRef.current = segments.map(geo => ({
      geo,
      points: geo.coords.map(c => map.latLngToContainerPoint([c[1], c[0]])),
    }));

    const sp = splitRef.current;

    (['left', 'right'] as const).forEach(side => {
      const dateId = side === 'left' ? leftIdRef.current : rightIdRef.current;

      ctx.save();
      ctx.beginPath();
      side === 'left'
        ? ctx.rect(0, 0, size.x * sp, size.y)
        : ctx.rect(size.x * sp, 0, size.x * (1 - sp), size.y);
      ctx.clip();

      // Context roads at the bottom, then lanes with no data, then anything
      // carrying real per-date status on top — regardless of whether OSM
      // gave it a name (a couple of unnamed paths have hand-placed status
      // too, see EXTRA_SEGMENTS in build_traffic_data.mjs)
      const rank = (g: SegmentGeo) => g.context ? 0 : getEntry(g.id, dateId).status !== 'no_data' ? 2 : 1;
      const sorted = [...projRef.current].sort((a, b) => rank(a.geo) - rank(b.geo));
      const zoom = map.getZoom();

      sorted.forEach(({ geo, points }) => {
        ctx.lineCap  = 'round';
        ctx.lineJoin = 'round';
        ctx.setLineDash([]);

        if (geo.context) {
          // Real road, real distance, well outside the survey radius — its
          // status is a probability-based estimate, not the hand-placed
          // survey data.
          const { color } = getEntry(geo.id, dateId);
          ctx.beginPath();
          points.forEach((pt, i) => i ? ctx.lineTo(pt.x, pt.y) : ctx.moveTo(pt.x, pt.y));
          ctx.strokeStyle = '#0b1a2c';
          ctx.globalAlpha = 0.55;
          ctx.lineWidth   = 6.5;
          ctx.stroke();

          ctx.beginPath();
          points.forEach((pt, i) => i ? ctx.lineTo(pt.x, pt.y) : ctx.moveTo(pt.x, pt.y));
          ctx.strokeStyle = color;
          ctx.globalAlpha = 1;
          ctx.lineWidth   = 4.8;
          ctx.stroke();
          return;
        }

        const entry = getEntry(geo.id, dateId);
        const hasData = entry.status !== 'no_data';

        if (!hasData) {
          // Real street, but no traffic-status data for it — shown as a
          // plain, clearly visible neutral line rather than colour-coded.
          ctx.beginPath();
          points.forEach((pt, i) => i ? ctx.lineTo(pt.x, pt.y) : ctx.moveTo(pt.x, pt.y));
          ctx.strokeStyle = '#0b1a2c';
          ctx.globalAlpha = 0.5;
          ctx.lineWidth   = 2.6;
          ctx.stroke();

          ctx.beginPath();
          points.forEach((pt, i) => i ? ctx.lineTo(pt.x, pt.y) : ctx.moveTo(pt.x, pt.y));
          ctx.strokeStyle = '#cbd5e1';
          ctx.globalAlpha = 0.85;
          ctx.lineWidth   = 1.6;
          ctx.stroke();
          return;
        }

        const { status, color } = entry;
        const unknown = status === 'no_data';
        const width   = unknown ? 1.1 : zoom < 17 ? 3.2 : 4.5;

        // Dark halo for known segments
        if (!unknown) {
          ctx.beginPath();
          points.forEach((pt, i) => i ? ctx.lineTo(pt.x, pt.y) : ctx.moveTo(pt.x, pt.y));
          ctx.strokeStyle = '#163047';
          ctx.globalAlpha = 0.75;
          ctx.lineWidth   = width + 2.3;
          ctx.stroke();
        }

        // Coloured line
        ctx.beginPath();
        points.forEach((pt, i) => i ? ctx.lineTo(pt.x, pt.y) : ctx.moveTo(pt.x, pt.y));
        ctx.strokeStyle = color;
        ctx.globalAlpha = unknown ? 0.4 : 1;
        ctx.lineWidth   = width;
        if (status === 'reported_closed') ctx.setLineDash([8, 4]);
        else if (unknown)                 ctx.setLineDash([2, 4]);
        ctx.stroke();
      });

      ctx.restore();
    });

    // Context-road labels — drawn once, unclipped, spanning the divider
    const byRoad = new Map<string, { x: number; y: number }[]>();
    projRef.current.forEach(({ geo, points }) => {
      if (!geo.context) return;
      const cur = byRoad.get(geo.road);
      if (!cur || pathLength(points) > pathLength(cur)) byRoad.set(geo.road, points);
    });
    byRoad.forEach((points, name) => {
      const mid = points[Math.floor(points.length / 2)];
      drawLabelPill(ctx, name, mid.x, mid.y - 14, ROAD_LABEL_STYLE);
    });

    // Church dot + name label — drawn last, unclipped, so it always paints
    // on top of every road line regardless of which side of the divider
    // it falls on. See the comment above the old marker code in the map-init
    // effect for why this has to be canvas-drawn rather than a Leaflet
    // marker/tooltip.
    const churchPt = map.latLngToContainerPoint([church.lat, church.lon]);
    ctx.beginPath();
    ctx.arc(churchPt.x, churchPt.y, 4, 0, Math.PI * 2);
    ctx.fillStyle = '#163047';
    ctx.fill();
    ctx.lineWidth = 1.5;
    ctx.strokeStyle = '#fff';
    ctx.stroke();

    const labelH = 14 + 5 * 2; // matches drawLabelPill's own h
    drawLabelPill(ctx, church.name, churchPt.x, churchPt.y - 8 - labelH / 2, CHURCH_LABEL_STYLE);
  }, [segments, getEntry, church]);

  const schedule = useCallback(() => {
    cancelAnimationFrame(rafRef.current);
    rafRef.current = requestAnimationFrame(render);
  }, [render]);

  const updateSplit = useCallback((v: number) => {
    const c = Math.max(0, Math.min(1, v));
    splitRef.current = c;
    setSplit(c);
    if (dividerRef.current) dividerRef.current.style.left = c * 100 + '%';
    if (handleRef.current)  handleRef.current.setAttribute('aria-valuenow', String(Math.round(c * 100)));
    schedule();
  }, [schedule]);

  // ── Map init (once) ───────────────────────────────────────────────────
  useEffect(() => {
    // `aborted` lets cleanup cancel the async import before it creates the map
    let aborted = false;

    import('leaflet').then(Lf => {
      if (aborted || !mapElRef.current) return;
      // Also bail if Leaflet already stamped this container (double-render guard)
      if ((mapElRef.current as HTMLElement & { _leaflet_id?: number })._leaflet_id) return;

      const L = (Lf as unknown as { default: typeof import('leaflet') }).default ?? Lf;

      const map = L.map(mapElRef.current, {
        zoomControl: false, zoomAnimation: false,
        fadeAnimation: false, markerZoomAnimation: false,
        minZoom: 14, maxZoom: 20, attributionControl: true,
      }).setView([church.lat, church.lon], 17);

      mapRef.current = map;

      const tiles = L.tileLayer(
        'https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}',
        { maxNativeZoom: 19, maxZoom: 20, attribution: 'Esri, Vantor, Earthstar Geographics, GIS User Community' }
      ).addTo(map);

      let loaded = 0;
      tiles.on('tileload',  () => { loaded++; setStatusMsg(null); });
      tiles.on('tileerror', () => setStatusMsg(loaded ? 'Some satellite tiles are unavailable.' : 'Satellite tiles unavailable. Check your connection.'));
      setTimeout(() => { if (!loaded) setStatusMsg('Satellite imagery not loaded — internet required.'); }, 18000);

      // 300 m survey-radius boundary — dark halo underneath, dashed blue on top
      L.circle([church.lat, church.lon], {
        radius: SURVEY_RADIUS_M, color: '#0b1a2c', weight: 5, opacity: 0.35,
        fill: false, interactive: false,
      }).addTo(map);
      L.circle([church.lat, church.lon], {
        radius: SURVEY_RADIUS_M, color: RADIUS_BLUE, weight: 2, opacity: 0.9,
        dashArray: '2 8', fill: false, interactive: false,
      }).addTo(map);

      // The church dot + name label are NOT a Leaflet marker/tooltip — they're
      // drawn on the #roads canvas instead (see render(), after the segment
      // loop). A Leaflet marker/tooltip lives in a pane nested inside #map,
      // which paints as one stacking-context unit below the #roads canvas
      // (see the comment below on why #roads must stay a plain sibling), so
      // it could never render on top of the road lines. Putting it in a
      // *custom* pane outside that hierarchy fixed the stacking order but
      // broke position tracking instead — Leaflet computes marker position
      // assuming the pane is a descendant of the map's CSS-transformed pane,
      // and a pane attached elsewhere doesn't get that transform, so the dot
      // visibly drifted while panning. Drawing it on the canvas in container
      // coordinates (recomputed every frame, same as the segments) sidesteps
      // both problems: always correctly placed, always painted last = on top.

      // Site-visit photo points — grouped by exact coordinate (several
      // photos are often taken standing in the same spot). Clicking a dot
      // opens the left-hand photo sidebar instead of a Leaflet popup.
      const photoGroups = new Map<string, SitePhoto[]>();
      sitePhotos.forEach(p => {
        const key = `${p.lat.toFixed(6)},${p.lng.toFixed(6)}`;
        if (!photoGroups.has(key)) photoGroups.set(key, []);
        photoGroups.get(key)!.push(p);
      });
      photoGroups.forEach(photos => {
        const { lat, lng } = photos[0];
        L.circleMarker([lat, lng], {
          radius: 6 + Math.min(photos.length, 12) * 0.5,
          color: '#fff', weight: 1.5, fillColor: '#14b8a6', fillOpacity: 0.88,
        })
          .addTo(map)
          .on('click', () => setActivePhotos(photos));
      });

      // The roads canvas deliberately stays a plain sibling overlay of the
      // map container — NOT moved into a Leaflet pane. Panes are
      // CSS-transformed while panning/zooming, which would drag the canvas
      // along with them while its pixels still described the pre-pan view,
      // so roads slid off the viewport-sized canvas and blanked out until
      // something forced a full reset (this was the cause of segments
      // vanishing on normal drag/scroll but reappearing after a refresh).
      // Left in place + drawn in container coordinates, it always lines up.

      map.on('zoomend', () => setZoom(map.getZoom()));
      setMapReady(true);
    });

    return () => {
      aborted = true;
      mapRef.current?.remove();
      mapRef.current = null;
      clearLeafletContainer(mapElRef.current);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // `schedule` gets a new identity whenever the data it draws changes —
  // re-bind the map listener each time so panning/zooming never redraws
  // through a stale, frozen closure. `move` fires continuously during a
  // drag (that's what keeps the overlay glued to the map while dragging);
  // the *end events catch the final resting position.
  useEffect(() => {
    if (!mapReady) return;
    const map = mapRef.current;
    if (!map) return;
    const events = 'move moveend zoom zoomend viewreset resize';
    map.on(events, schedule);
    schedule();
    return () => { map.off(events, schedule); };
  }, [mapReady, schedule]);

  // Re-render when selection changes
  useEffect(() => { schedule(); }, [leftId, rightId, schedule]);

  // ResizeObserver
  useEffect(() => {
    const frame = frameRef.current;
    if (!frame) return;
    const ro = new ResizeObserver(() => { mapRef.current?.invalidateSize({ animate: false }); schedule(); });
    ro.observe(frame);
    return () => ro.disconnect();
  }, [schedule]);

  // ── Pointer events ───────────────────────────────────────────────────
  const onPointerDown = useCallback((e: React.PointerEvent<HTMLDivElement>) => {
    e.preventDefault(); e.stopPropagation();
    (e.currentTarget as HTMLDivElement).setPointerCapture(e.pointerId);
    mapRef.current?.dragging.disable();
  }, []);

  const onPointerMove = useCallback((e: React.PointerEvent<HTMLDivElement>) => {
    if ((e.currentTarget as HTMLDivElement).hasPointerCapture(e.pointerId)) {
      const rect = frameRef.current?.getBoundingClientRect();
      if (rect) updateSplit((e.clientX - rect.left) / rect.width);
    }
  }, [updateSplit]);

  const onPointerUp = useCallback((e: React.PointerEvent<HTMLDivElement>) => {
    (e.currentTarget as HTMLDivElement).releasePointerCapture(e.pointerId);
    mapRef.current?.dragging.enable();
  }, []);

  const zoomIn  = useCallback(() => mapRef.current?.zoomIn(),  []);
  const zoomOut = useCallback(() => mapRef.current?.zoomOut(), []);

  const onKeyDown = useCallback((e: React.KeyboardEvent<HTMLDivElement>) => {
    let next = splitRef.current;
    if      (e.key === 'ArrowLeft'  || e.key === 'ArrowDown') next -= 0.02;
    else if (e.key === 'ArrowRight' || e.key === 'ArrowUp')   next += 0.02;
    else if (e.key === 'Home') next = 0;
    else if (e.key === 'End')  next = 1;
    else return;
    e.preventDefault(); e.stopPropagation();
    updateSplit(next);
  }, [updateSplit]);

  // ── Labels ──────────────────────────────────────────────────────────
  const leftLabel  = left_dates.find(d => d.id === leftId)?.date  ?? '';
  const rightLabel = right_dates.find(d => d.id === rightId)?.date ?? '';

  return (
    <div className="map-frame" ref={frameRef} id="frame">

      <div ref={mapElRef} id="map"
        aria-label="Satellite map. Drag the handle to compare two dates." />
      <canvas ref={canvasRef} id="roads" aria-hidden="true" />

      {/* ── Two date pickers ─────────────────────────────────────── */}
      <div className="top-bar">
        <div className="picker-group">
          {isMobile ? (
            <MobilePicker
              id="leftDateSelect"
              side="left"
              options={left_dates}
              value={leftId}
              onChange={selectLeft}
              ariaLabel="Left date"
            />
          ) : (
            <select
              id="leftDateSelect"
              className="date-select date-select--left"
              value={leftId}
              onChange={e => selectLeft(e.target.value)}
              aria-label="Left date"
            >
              {left_dates.map(d => <option key={d.id} value={d.id}>{d.label}</option>)}
            </select>
          )}

          <span className="vs-chip">vs</span>

          {isMobile ? (
            <MobilePicker
              id="rightDateSelect"
              side="right"
              options={right_dates}
              value={rightId}
              onChange={selectRight}
              ariaLabel="Right date (fair)"
            />
          ) : (
            <select
              id="rightDateSelect"
              className="date-select date-select--right"
              value={rightId}
              onChange={e => selectRight(e.target.value)}
              aria-label="Right date (fair)"
            >
              {right_dates.map(d => <option key={d.id} value={d.id}>{d.label}</option>)}
            </select>
          )}
        </div>
      </div>

      {/* Side labels */}
      <div className="tag left"  id="baselineTag">{leftLabel}</div>
      <div className="tag right" id="eventTag">{rightLabel}</div>

      {/* Divider + handle */}
      <div className="divider" ref={dividerRef} id="divider" style={{ left: `${split * 100}%` }}>
        <div
          className="handle" ref={handleRef} id="handle"
          tabIndex={0} role="slider"
          aria-label="Comparison divider"
          aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.round(split * 100)}
          onPointerDown={onPointerDown}
          onPointerMove={onPointerMove}
          onPointerUp={onPointerUp}
          onPointerCancel={onPointerUp}
          onKeyDown={onKeyDown}
        >‹│›</div>
      </div>

      {/* Zoom controls */}
      <div className="zoom-control" id="zoomControl">
        <button
          type="button"
          className="zoom-btn zoom-btn--in"
          aria-label="Zoom in"
          disabled={zoom >= 20}
          onClick={zoomIn}
        >+</button>
        <button
          type="button"
          className="zoom-btn zoom-btn--out"
          aria-label="Zoom out"
          disabled={zoom <= 14}
          onClick={zoomOut}
        >−</button>
      </div>

      {/* Status */}
      {statusMsg && <div id="status" className="status" role="status">{statusMsg}</div>}

      {/* Legend */}
      {showLegend && (
        <div className="legend" id="legend">
          {[
            ['#22c55e', 'Fast moving'],
            ['#fbbf24', 'Slower / moderate'],
            ['#ef4444', 'Stop-and-go'],
          ].map(([color, label]) => (
            <div className="legend-row" key={label}>
              <i className="legend-swatch" style={{ background: color }} />
              {label}
            </div>
          ))}
          <div className="legend-row">
            <i className="legend-swatch closure" />Closed / blocked
          </div>
          <div className="legend-row">
            <i className="legend-swatch" style={{ background: '#94a3b8' }} />No sensor data
          </div>
          <div className="legend-row">
            <i className="legend-swatch" style={{ border: '1.5px dashed #3b82f6', background: 'transparent' }} />300 m survey radius
          </div>
          <div className="legend-row">
            <i className="legend-swatch" style={{ background: '#64748b', height: 5 }} />SV Road, Hill Road, KC Road (estimated)
          </div>
          <div className="legend-note" id="legendNote">
            <strong>{leftLabel}</strong> — normal day. <strong>{rightLabel}</strong> — Mount
            Mary Fair. Roads closest to the church get congested or blocked; alternate and
            exit routes stay lighter as police divert traffic outward. SV Road, Hill Road and
            KC Road sit 500 m–1.7 km away, outside the survey area — their colour is a
            likelihood-based estimate, not measured data.
          </div>
        </div>
      )}

      {/* Info button */}
      <button
        className={`info-btn${showLegend ? ' active' : ''}`}
        id="info" type="button"
        aria-pressed={showLegend}
        aria-label="Show colour legend"
        onClick={() => setShowLegend(v => !v)}
      >i</button>

      {/* Site-visit photo sidebar — opens when a photo dot is clicked */}
      {activePhotos && (
        <>
          <div className="photo-backdrop" onClick={() => setActivePhotos(null)} />
          <div className="photo-sidebar" role="dialog" aria-label="Site-visit photos at this point">
            <div className="photo-sidebar__header">
              <span>{activePhotos.length} photo{activePhotos.length > 1 ? 's' : ''} at this point</span>
              <button
                type="button"
                className="photo-sidebar__close"
                aria-label="Close photos"
                onClick={() => setActivePhotos(null)}
              >×</button>
            </div>
            <div className="photo-sidebar__grid">
              {activePhotos.map(p => (
                <img key={p.id} src={p.src} alt={p.name} loading="lazy" />
              ))}
            </div>
          </div>
        </>
      )}
    </div>
  );
}
