// Shared TypeScript types for the multi-date traffic comparison system

// ── Traffic status ──────────────────────────────────────────────────────
export type TrafficStatus =
  | 'fast'
  | 'slowdown'
  | 'stop_and_go'
  | 'reported_closed'
  | 'no_data';

export interface TrafficEntry {
  status: TrafficStatus;
  color:  string;
}

// ── Geometry ────────────────────────────────────────────────────────────
export interface SegmentGeo {
  id:     string;
  road:   string;
  /** OSM highway class (tertiary, residential, footway, steps, service…) */
  type?:    string;
  /** Reference-only road shown for orientation, outside the survey radius —
   *  not part of the traffic-status comparison. */
  context?: boolean;
  coords:   [number, number][];
}

// ── Per-date traffic data (one status per segment, no time windows) ──────
export interface DateTrafficData {
  id:       string;
  date:     string;
  label:    string;
  type:     'baseline' | 'fair';
  /** segments[segmentId] → { status, color } */
  segments: Record<string, TrafficEntry>;
}

// ── Date selector entry ─────────────────────────────────────────────────
export interface DateOption {
  id:        string;
  date:      string;
  label:     string;
  /** id of the corresponding date in the other list (left ↔ right) */
  pairsWith: string;
}

// ── Geotagged site-visit photo ────────────────────────────────────────────
export interface SitePhoto {
  id:  string;
  name: string;
  /** public/ path, e.g. /site-visit/mount-mary-church/001.jpg */
  src: string;
  lat: number;
  lng: number;
}

// ── Time window entry ───────────────────────────────────────────────────
export interface TimeWindow {
  id:   number;
  name: string;
}

// ── Shared config ───────────────────────────────────────────────────────
export interface DatesConfig {
  church: {
    name: string;
    lat:  number;
    lon:  number;
  };
  left_dates:   DateOption[];
  right_dates:  DateOption[];
  time_windows: TimeWindow[];
}

// ── Props passed from page → TrafficMap ────────────────────────────────
export interface TrafficMapProps {
  config:       DatesConfig;
  segments:     SegmentGeo[];
  allDatesData: Record<string, DateTrafficData>;
  sitePhotos:   SitePhoto[];
}
