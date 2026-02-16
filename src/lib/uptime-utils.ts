/**
 * Uptime calculation utilities.
 *
 * Given load-history records from `/api/records/load`, we split the
 * requested time-range into fixed-width "slots" (e.g. 1 hour each).
 * A slot is considered ONLINE if at least one record falls inside it,
 * OFFLINE if there are zero records, and UNKNOWN if the slot is in the
 * future or before the earliest possible data.
 */

export type SlotStatus = 'online' | 'offline' | 'unknown';

export interface UptimeSlot {
  /** Slot start timestamp (ms) */
  start: number;
  /** Slot end timestamp (ms) */
  end: number;
  status: SlotStatus;
}

export interface UptimeResult {
  /** Per-slot breakdown */
  slots: UptimeSlot[];
  /** 0-100 uptime percentage (based on online / (online+offline)) */
  uptimePercent: number;
  /** Total number of slots that had data */
  onlineSlots: number;
  /** Total number of slots with no data */
  offlineSlots: number;
  /** Total slots analysed (excludes unknown) */
  totalSlots: number;
}

export interface LoadRecord {
  time: string;
  [key: string]: unknown;
}

/**
 * How many hours each display slot covers, keyed by the total display
 * range in hours.  E.g. for 720 h (30 days) each slot = 24 h so we
 * get 30 bars; for 24 h each slot = 1 h → 24 bars, etc.
 */
function slotHoursForRange(rangeHours: number): number {
  if (rangeHours <= 24) return 1;       // 24 slots
  if (rangeHours <= 168) return 6;      // 28 slots for 7d
  return 24;                            // 30 slots for 30d
}

/**
 * Build uptime slots from load-history records.
 *
 * @param records  The `records` array returned by `/api/records/load`
 * @param rangeHours  The requested time range (e.g. 24, 168, 720)
 */
export function computeUptime(
  records: LoadRecord[],
  rangeHours: number,
): UptimeResult {
  const now = Date.now();
  const rangeMs = rangeHours * 3600_000;
  const rangeStart = now - rangeMs;

  const slotMs = slotHoursForRange(rangeHours) * 3600_000;
  const slotCount = Math.ceil(rangeMs / slotMs);

  // Build a Set of slot indices that contain at least one record
  const occupiedSlots = new Set<number>();

  for (const rec of records) {
    const t = new Date(rec.time).getTime();
    if (t < rangeStart || t > now) continue;
    const idx = Math.floor((t - rangeStart) / slotMs);
    if (idx >= 0 && idx < slotCount) {
      occupiedSlots.add(idx);
    }
  }

  const slots: UptimeSlot[] = [];
  let onlineSlots = 0;
  let offlineSlots = 0;

  for (let i = 0; i < slotCount; i++) {
    const start = rangeStart + i * slotMs;
    const end = Math.min(start + slotMs, now);
    if (start > now) {
      slots.push({ start, end, status: 'unknown' });
    } else if (occupiedSlots.has(i)) {
      slots.push({ start, end, status: 'online' });
      onlineSlots++;
    } else {
      slots.push({ start, end, status: 'offline' });
      offlineSlots++;
    }
  }

  const total = onlineSlots + offlineSlots;
  const uptimePercent = total > 0 ? (onlineSlots / total) * 100 : 0;

  return { slots, uptimePercent, onlineSlots, offlineSlots, totalSlots: total };
}

/* ══════════════════════════════════════════════════════════════
   Incremental merge utilities
   ══════════════════════════════════════════════════════════════ */

/**
 * Merge old and new records, deduplicate by timestamp, and prune records
 * older than the sliding window.
 *
 * @param oldRecords  Previously cached records
 * @param newRecords  Freshly fetched records (incremental delta)
 * @param rangeHours  Current time range — records older than this are dropped
 * @returns Merged, deduplicated, pruned records
 */
export function mergeRecords(
  oldRecords: LoadRecord[],
  newRecords: LoadRecord[],
  rangeHours: number,
): LoadRecord[] {
  const cutoff = Date.now() - rangeHours * 3600_000;

  // Deduplicate by timestamp string
  const seen = new Set<string>();
  const merged: LoadRecord[] = [];

  // Process new records first (they take priority)
  for (const rec of newRecords) {
    if (!seen.has(rec.time)) {
      seen.add(rec.time);
      if (new Date(rec.time).getTime() >= cutoff) {
        merged.push(rec);
      }
    }
  }

  // Then old records
  for (const rec of oldRecords) {
    if (!seen.has(rec.time)) {
      seen.add(rec.time);
      if (new Date(rec.time).getTime() >= cutoff) {
        merged.push(rec);
      }
    }
  }

  return merged;
}

/**
 * Human-friendly label for a time range.
 */
export function rangeLabel(hours: number): string {
  if (hours <= 24) return '24h';
  if (hours <= 168) return '7d';
  if (hours <= 720) return '30d';
  if (hours <= 1440) return '60d';
  return `${Math.round(hours / 24)}d`;
}

/** All candidate ranges we might show */
const ALL_RANGES = [
  { hours: 24, label: '24H' },
  { hours: 168, label: '7D' },
  { hours: 720, label: '30D' },
  { hours: 1440, label: '60D' },
];

/**
 * Build uptime range options dynamically based on the backend's
 * `record_preserve_time` (hours).  Only includes ranges ≤ maxHours.
 * Falls back to the default 3 ranges if maxHours is not provided.
 */
export function buildUptimeRanges(maxHours?: number): Array<{ hours: number; label: string }> {
  const limit = maxHours && maxHours > 0 ? maxHours : 720;
  const filtered = ALL_RANGES.filter(r => r.hours <= limit);
  return filtered.length > 0 ? filtered : [ALL_RANGES[0]];
}

/** Default ranges (backward-compatible) */
export const UPTIME_RANGES = buildUptimeRanges();
