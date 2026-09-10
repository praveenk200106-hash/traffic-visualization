'use client';

import { useRef, useEffect, useState, useCallback } from 'react';
import type { TrafficMapProps, SegmentGeo, TrafficEntry, DateOption } from '../types';
import type L from 'leaflet';

interface Projected {
  geo:    SegmentGeo;
  points: { x: number; y: number }[];
}

/** Clear Leaflet's container flag so React Strict Mode double-mount doesn't throw */
function clearLeafletContainer(el: HTMLElement | null) {
  if (el) (el as HTMLElement & { _leaflet_id?: number })._leaflet_id = undefined;
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

export default function TrafficMap({ config, segments, allDatesData }: TrafficMapProps) {
  const { church, left_dates, right_dates } = config;

  // ── State ────────────────────────────────────────────────────────────
  const [leftId,     setLeftId]     = useState(left_dates[0].id);
  const [rightId,    setRightId]    = useState(right_dates[0].id);
  const [split,      setSplit]      = useState(0.5);
  const [showLegend, setShowLegend] = useState(false);
  const [statusMsg,  setStatusMsg]  = useState<string | null>(null);

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

    projRef.current = segments.map(geo => ({
      geo,
      points: geo.coords.map(c => map.latLngToLayerPoint([c[1], c[0]])),
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

      // Draw unknown segments first (below), then known ones on top
      const sorted = [...projRef.current].sort((a, b) =>
        Number(getEntry(a.geo.id, dateId).status !== 'no_data') -
        Number(getEntry(b.geo.id, dateId).status !== 'no_data')
      );

      sorted.forEach(({ geo, points }) => {
        const { status, color } = getEntry(geo.id, dateId);
        const unknown = status === 'no_data';
        const zoom    = map.getZoom();
        const width   = unknown ? 1.1 : zoom < 17 ? 3.2 : 4.5;

        ctx.lineCap  = 'round';
        ctx.lineJoin = 'round';
        ctx.setLineDash([]);

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
  }, [segments, getEntry]);

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

      L.circleMarker([church.lat, church.lon], {
        radius: 4, color: '#fff', weight: 1.5, fillColor: '#163047', fillOpacity: 1, interactive: false,
      }).addTo(map)
        .bindTooltip(church.name, { permanent: true, direction: 'top', offset: [0, -8], className: 'church-tag' })
        .openTooltip();

      const canvas = canvasRef.current;
      if (canvas) {
        const pane = map.createPane('roadsPane');
        pane.style.zIndex = '450';
        pane.style.pointerEvents = 'none';
        pane.appendChild(canvas);
      }

      map.on('move zoom resize', schedule);
      schedule();
    });

    return () => {
      aborted = true;
      mapRef.current?.remove();
      mapRef.current = null;
      clearLeafletContainer(mapElRef.current);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

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
              onChange={setLeftId}
              ariaLabel="Left date"
            />
          ) : (
            <select
              id="leftDateSelect"
              className="date-select date-select--left"
              value={leftId}
              onChange={e => setLeftId(e.target.value)}
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
              onChange={setRightId}
              ariaLabel="Right date (fair)"
            />
          ) : (
            <select
              id="rightDateSelect"
              className="date-select date-select--right"
              value={rightId}
              onChange={e => setRightId(e.target.value)}
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
          <div className="legend-note" id="legendNote">
            <strong>{leftLabel}</strong> — normal weekend.<br />
            <strong>{rightLabel}</strong> — Mount Mary Fair. Roads near the church get congested;
            exit routes may actually flow faster due to police management.
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
    </div>
  );
}
