import { clsx, type ClassValue } from "clsx"
import { extendTailwindMerge } from "tailwind-merge"
import prettyBytes from "pretty-bytes"
import dayjs from "dayjs"
import duration from "dayjs/plugin/duration"

dayjs.extend(duration)

const twMerge = extendTailwindMerge({
  extend: {
    classGroups: {
      'font-size': [{ text: ['xxs'] }],
    },
  },
})

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

/**
 * Extract country flag emoji from the region field.
 * Region format: "🇸🇬 Singapore" or "🇯🇵 Japan".
 * A flag emoji consists of two Regional Indicator Symbols.
 */
export function extractRegionEmoji(region: string): string {
  if (!region) return '';
  const chars = [...region];
  if (chars.length >= 2) {
    const first = chars[0].codePointAt(0) ?? 0;
    if (first >= 0x1F1E6 && first <= 0x1F1FF) {
      return chars[0] + chars[1];
    }
  }
  return '';
}

/**
 * Extract text portion from the region field (everything after the flag emoji).
 * Region format: "🇸🇬 Singapore" → "Singapore", "🇯🇵" → ""
 */
export function extractRegionText(region: string): string {
  if (!region) return '';
  const emoji = extractRegionEmoji(region);
  if (!emoji) return region.trim();
  return region.slice(emoji.length).trim();
}

/** Format network speed */
export function formatSpeed(bytesPerSecond: number): string {
  if (bytesPerSecond === 0) return '0 B/s';
  return prettyBytes(bytesPerSecond, { bits: false }) + '/s';
}

/** Format bytes */
export function formatBytes(bytes: number): string {
  return prettyBytes(bytes);
}

export type UptimePrecision = 'year' | 'month' | 'day' | 'hour' | 'minute';

/**
 * Format uptime with configurable precision.
 * Shows all units from the largest non-zero unit down to the specified precision.
 * @param seconds - uptime in seconds
 * @param precision - smallest unit to display, default 'hour'
 */
export function formatUptime(seconds: number, precision: UptimePrecision = 'hour'): string {
  const d = dayjs.duration(seconds, 'seconds');
  const years = Math.floor(d.asYears());
  const months = Math.floor(d.asMonths()) % 12;
  const days = Math.floor(d.asDays()) % 30;
  const hours = d.hours();
  const minutes = d.minutes();

  const units: { value: number; label: string; key: UptimePrecision }[] = [
    { value: years, label: 'y', key: 'year' },
    { value: months, label: 'mo', key: 'month' },
    { value: days, label: 'd', key: 'day' },
    { value: hours, label: 'h', key: 'hour' },
    { value: minutes, label: 'min', key: 'minute' },
  ];

  const precisionIndex = units.findIndex(u => u.key === precision);
  const visibleUnits = units.slice(0, precisionIndex + 1);

  // Find first non-zero unit
  const firstNonZero = visibleUnits.findIndex(u => u.value > 0);
  if (firstNonZero === -1) return `0${visibleUnits[visibleUnits.length - 1].label}`;

  return visibleUnits
    .slice(firstNonZero)
    .map(u => `${u.value}${u.label}`)
    .join(' ');
}

/** Get resource usage status */
export function getUsageStatus(
  usage: number,
  thresholds: { warning: number; critical: number } = { warning: 60, critical: 80 }
): 'normal' | 'warning' | 'critical' {
  if (usage >= thresholds.critical) return 'critical';
  if (usage >= thresholds.warning) return 'warning';
  return 'normal';
}

/** Traffic limit type */
export type TrafficLimitType = 'max' | 'min' | 'sum' | 'up' | 'down';

/**
 * Calculate current traffic usage based on traffic_limit_type.
 * totalUp/totalDown come from WebSocket realtime data network.totalUp/totalDown (bytes).
 */
export function calcTrafficUsage(
  totalUp: number,
  totalDown: number,
  type: TrafficLimitType
): number {
  switch (type) {
    case 'up': return totalUp;
    case 'down': return totalDown;
    case 'sum': return totalUp + totalDown;
    case 'max': return Math.max(totalUp, totalDown);
    case 'min': return Math.min(totalUp, totalDown);
    default: return totalUp + totalDown;
  }
}

/** Format traffic limit type display label */
export function formatTrafficType(type: string): string {
  switch (type) {
    case 'up': return '↑UP';
    case 'down': return '↓DOWN';
    case 'sum': return '↑+↓';
    case 'max': return 'MAX';
    case 'min': return 'MIN';
    default: return type.toUpperCase();
  }
}

/**
 * Determine expiry status.
 * Returns null if no expiry date is set.
 */
export function getExpiryStatus(
  expiredAt: string | null | undefined
): 'normal' | 'warning' | 'expired' | null {
  if (!expiredAt) return null;
  const d = dayjs(expiredAt);
  if (!d.isValid() || d.year() <= 1) return null;
  const now = dayjs();
  if (d.isBefore(now)) return 'expired';
  if (d.diff(now, 'day') <= 7) return 'warning';
  return 'normal';
}

/** Format expiry date as short text */
export function formatExpiry(expiredAt: string): string {
  const d = dayjs(expiredAt);
  if (!d.isValid() || d.year() <= 1) return '';
  const now = dayjs();
  if (d.isBefore(now)) {
    const days = now.diff(d, 'day');
    return days === 0 ? 'Expired today' : `Expired ${days}d ago`;
  }
  const days = d.diff(now, 'day');
  if (days === 0) return 'Expires today';
  if (days <= 30) return `${days}d left`;
  return d.format('YYYY-MM-DD');
}
