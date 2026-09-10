/**
 * src/data/index.ts
 * Statically imports every per-date JSON file — no fs/cwd at runtime.
 */

import datesConfig  from './dates-config.json';
import segmentsGeo  from './segments-geo.json';

// Baseline (left) dates
import sep07_2025 from './traffic-sep-07-2025.json';
import sep08_2025 from './traffic-sep-08-2025.json';
import sep01_2024 from './traffic-sep-01-2024.json';
import sep07_2024 from './traffic-sep-07-2024.json';
import sep23_2024 from './traffic-sep-23-2024.json';

// Fair (right) dates
import sep14_2025 from './traffic-sep-14-2025.json';
import sep20_2025 from './traffic-sep-20-2025.json';
import sep21_2025 from './traffic-sep-21-2025.json';
import sep08_2024 from './traffic-sep-08-2024.json';
import sep14_2024 from './traffic-sep-14-2024.json';
import sep15_2024 from './traffic-sep-15-2024.json';

export { datesConfig, segmentsGeo };

export const ALL_DATES_DATA = {
  [sep07_2025.id]: sep07_2025,
  [sep08_2025.id]: sep08_2025,
  [sep01_2024.id]: sep01_2024,
  [sep07_2024.id]: sep07_2024,
  [sep23_2024.id]: sep23_2024,
  [sep14_2025.id]: sep14_2025,
  [sep20_2025.id]: sep20_2025,
  [sep21_2025.id]: sep21_2025,
  [sep08_2024.id]: sep08_2024,
  [sep14_2024.id]: sep14_2024,
  [sep15_2024.id]: sep15_2024,
} as const;
