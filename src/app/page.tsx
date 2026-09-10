import { datesConfig, segmentsGeo, ALL_DATES_DATA } from '@/data';
import TrafficMap from './components/TrafficMap';
import type { DatesConfig, SegmentGeo, DateTrafficData } from './types';

/**
 * Server component.
 * All data comes from statically-imported JSON files in src/data/ —
 * no file-system reads, no process.cwd().
 */
export default function Home() {
  return (
    <main>
      <TrafficMap
        config={datesConfig as DatesConfig}
        segments={segmentsGeo as SegmentGeo[]}
        allDatesData={ALL_DATES_DATA as Record<string, DateTrafficData>}
      />
    </main>
  );
}
