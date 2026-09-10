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
  coords: [number, number][];
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
  id:    string;
  date:  string;
  label: string;
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
}
