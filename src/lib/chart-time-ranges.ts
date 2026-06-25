/**
 * Load / Ping chart time-range presets — aligned with komari-web instance page.
 */

export type LoadTimeRangeId = 'realtime' | number;
export type PingTimeRangeId = number;

export interface ChartTimeRangeOption<T extends LoadTimeRangeId | PingTimeRangeId> {
  id: T;
  hours?: number;
}

const LOAD_PRESETS = [4, 24, 168, 720] as const;
const PING_PRESETS = [1, 6, 12, 24] as const;

function pushDynamicHourRange<T extends number>(
  ranges: ChartTimeRangeOption<T>[],
  maxHours: number,
  maxPreset: number,
): void {
  if (maxHours <= maxPreset) return;
  if (ranges.some(r => r.id === maxHours)) return;
  ranges.push({ id: maxHours as T, hours: maxHours });
}

/** Load charts: realtime + 4h / 1d / 7d / 30d (filtered by record_preserve_time). */
export function buildLoadChartTimeRanges(recordPreserveTime?: number): ChartTimeRangeOption<LoadTimeRangeId>[] {
  const limit = recordPreserveTime && recordPreserveTime > 0 ? recordPreserveTime : 720;
  const historical: ChartTimeRangeOption<number>[] = [];

  for (const hours of LOAD_PRESETS) {
    if (hours <= limit) {
      historical.push({ id: hours, hours });
    }
  }

  pushDynamicHourRange(historical, limit, LOAD_PRESETS[LOAD_PRESETS.length - 1]);
  return [{ id: 'realtime' }, ...historical];
}

/** Ping charts: 1h / 6h / 12h / 1d — no realtime (filtered by ping_record_preserve_time). */
export function buildPingChartTimeRanges(pingRecordPreserveTime?: number): ChartTimeRangeOption<PingTimeRangeId>[] {
  const limit = pingRecordPreserveTime && pingRecordPreserveTime > 0 ? pingRecordPreserveTime : 48;
  const ranges: ChartTimeRangeOption<PingTimeRangeId>[] = [];

  for (const hours of PING_PRESETS) {
    if (hours <= limit) {
      ranges.push({ id: hours, hours });
    }
  }

  pushDynamicHourRange(ranges, limit, PING_PRESETS[PING_PRESETS.length - 1]);
  return ranges.length > 0 ? ranges : [{ id: 1, hours: 1 }];
}

/** Default ping range: 1 hour when available, else first option. */
export function defaultPingTimeRange(pingRecordPreserveTime?: number): PingTimeRangeId {
  const ranges = buildPingChartTimeRanges(pingRecordPreserveTime);
  return ranges.find(r => r.hours === 1)?.id ?? ranges[0].id;
}

/** Prefer 4h when live data is unavailable; fall back to first historical preset. */
export function defaultOfflineLoadTimeRange(recordPreserveTime?: number): LoadTimeRangeId {
  const ranges = buildLoadChartTimeRanges(recordPreserveTime);
  if (ranges.some(r => r.id === 4)) return 4;
  const firstHistorical = ranges.find(r => typeof r.id === 'number');
  return firstHistorical?.id ?? 4;
}
