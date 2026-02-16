/**
 * Shared chart constants, types, and data transformation utilities
 * Used by NodeCharts and ChartModal to avoid duplication
 */

// HUD-style neon color palette
export const chartColors = [
  "oklch(0.75 0.18 195)",  // Cyan — CPU
  "oklch(0.75 0.2 145)",   // Neon Green — Load
  "oklch(0.7 0.22 330)",   // Magenta — RAM
  "oklch(0.8 0.18 85)",    // Amber — Disk
  "oklch(0.65 0.25 15)",   // Red — TCP
  "oklch(0.65 0.15 195)",  // Teal — UDP
  "oklch(0.7 0.22 330)",   // Magenta — Net In
  "oklch(0.75 0.2 145)",   // Green — Net Out
  "oklch(0.65 0.15 260)",  // Indigo — SWAP
] as const;

export interface LoadRecord {
  time: string;
  cpu: number;
  ram: number;
  ram_total: number;
  swap: number;
  swap_total: number;
  disk: number;
  disk_total: number;
  load: number;
  connections: number;
  connections_udp: number;
  net_in: number;
  net_out: number;
}

export interface PingRecord {
  client: string;
  task_id: number;
  time: string;
  value: number;
}

export interface TaskInfo {
  id: number;
  name: string;
  interval: number;
}

export interface ChartDataPoint {
  time: string;
  cpu: number;
  ram: number;
  swap: number;
  disk: number;
  load: number;
  connections: number;
  connections_udp: number;
  network_in: number;
  network_out: number;
}

/** Transform raw load records into chart-ready data */
export function transformLoadRecords(records: LoadRecord[]): ChartDataPoint[] {
  return records
    .filter((r) => r && typeof r.time === 'string' && !isNaN(new Date(r.time).getTime()))
    .map((r) => ({
      time: new Date(r.time).toISOString(),
      cpu: Math.min(Math.max(r.cpu || 0, 0), 100),
      ram: Math.min(Math.max(r.ram_total ? (r.ram / r.ram_total) * 100 : 0, 0), 100),
      swap: Math.min(Math.max(r.swap_total ? (r.swap / r.swap_total) * 100 : 0, 0), 100),
      disk: Math.min(Math.max(r.disk_total ? (r.disk / r.disk_total) * 100 : 0, 0), 100),
      load: r.load,
      connections: r.connections,
      connections_udp: r.connections_udp,
      network_in: r.net_in / 1024,
      network_out: r.net_out / 1024,
    }));
}

/** Format tooltip label with date + time */
export function labelFormatter(value: any): string {
  return new Date(value).toLocaleString([], {
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  });
}

/** Shared chart card CSS class */
export const chartCardClass = "border border-border/50 bg-card/80 backdrop-blur-xl";

/** Shared chart container CSS class */
export const chartContainerClass = "h-[200px] sm:h-[250px] md:h-[280px] w-full !aspect-auto overflow-hidden chart-mobile-optimized";

/** Grid stroke color — theme-aware, using CSS variable */
export const gridStrokeColor = "var(--border)";

/**
 * Process raw ping records into chart-ready data points.
 * - Groups records by time with jitter tolerance
 * - Treats negative values as null (packet loss)
 * - Clips to the specified time window
 */
export function processPingRecords(
  records: PingRecord[],
  tasks: TaskInfo[],
  hours: number,
): any[] {
  if (!records.length) return [];

  // Compute jitter tolerance from task intervals
  const taskIntervals = tasks
    .map(t => t.interval)
    .filter((v): v is number => typeof v === 'number' && v > 0);
  const fallbackIntervalSec = taskIntervals.length ? Math.min(...taskIntervals) : 60;
  const toleranceMs = Math.min(6000, Math.max(800, Math.floor(fallbackIntervalSec * 1000 * 0.25)));

  const grouped: Record<number, any> = {};
  const anchors: number[] = [];

  for (const rec of records) {
    const ts = new Date(rec.time).getTime();
    let anchor: number | null = null;
    for (const a of anchors) {
      if (Math.abs(a - ts) <= toleranceMs) { anchor = a; break; }
    }
    const use = anchor ?? ts;
    if (!grouped[use]) {
      grouped[use] = { time: new Date(use).toISOString() };
      if (anchor === null) anchors.push(use);
    }
    grouped[use][rec.task_id] = rec.value < 0 ? null : rec.value;
  }

  const merged = Object.values(grouped).sort(
    (a: any, b: any) => new Date(a.time).getTime() - new Date(b.time).getTime(),
  );

  // Clip to the last `hours` window with one extra leading point
  if (merged.length === 0) return [];
  const lastTs = new Date(merged[merged.length - 1].time).getTime();
  const fromTs = lastTs - hours * 3600_000;
  let startIdx = 0;
  for (let i = 0; i < merged.length; i++) {
    if (new Date(merged[i].time).getTime() >= fromTs) {
      startIdx = Math.max(0, i - 1);
      break;
    }
  }
  return merged.slice(startIdx);
}

/**
 * Linear interpolation for null gaps in ping data.
 * Only interpolates across gaps shorter than maxGapMs.
 */
export function interpolatePingNulls(
  data: any[],
  taskKeys: string[],
  opts: { maxGapMultiplier?: number; minCapMs?: number; maxCapMs?: number } = {},
): any[] {
  if (!data.length || !taskKeys.length) return data;

  const { maxGapMultiplier = 6, minCapMs = 120_000, maxCapMs = 1_800_000 } = opts;

  // Compute median sample interval
  const timestamps = data.map(d => new Date(d.time).getTime());
  const gaps: number[] = [];
  for (let i = 1; i < timestamps.length; i++) gaps.push(timestamps[i] - timestamps[i - 1]);
  gaps.sort((a, b) => a - b);
  const medianGap = gaps.length ? gaps[Math.floor(gaps.length / 2)] : 60_000;
  const maxGapMs = Math.min(maxCapMs, Math.max(minCapMs, medianGap * maxGapMultiplier));

  const result = data.map(d => ({ ...d }));

  for (const key of taskKeys) {
    let lastValidIdx: number | null = null;
    for (let i = 0; i < result.length; i++) {
      const val = result[i][key];
      if (val !== null && val !== undefined) {
        if (lastValidIdx !== null && i - lastValidIdx > 1) {
          const gapMs = timestamps[i] - timestamps[lastValidIdx];
          if (gapMs <= maxGapMs) {
            const startVal = result[lastValidIdx][key];
            const endVal = val;
            for (let j = lastValidIdx + 1; j < i; j++) {
              const ratio = (timestamps[j] - timestamps[lastValidIdx]) / gapMs;
              result[j][key] = startVal + (endVal - startVal) * ratio;
            }
          }
        }
        lastValidIdx = i;
      }
    }
  }
  return result;
}

/**
 * Apply EWMA (Exponential Weighted Moving Average) smoothing to ping data.
 * @param alpha - Smoothing factor (0 < alpha <= 1). Lower = smoother. Default 0.3.
 */
export function ewmaSmooth(
  data: any[],
  taskKeys: string[],
  alpha: number = 0.3,
): any[] {
  if (!data.length || !taskKeys.length) return data;
  const result = data.map(d => ({ ...d }));

  for (const key of taskKeys) {
    let prev: number | null = null;
    for (let i = 0; i < result.length; i++) {
      const val = result[i][key];
      if (val === null || val === undefined) {
        prev = null; // reset on gap
        continue;
      }
      if (prev === null) {
        prev = val;
      } else {
        prev = alpha * val + (1 - alpha) * prev;
        result[i][key] = Math.round(prev * 100) / 100;
      }
    }
  }
  return result;
}
