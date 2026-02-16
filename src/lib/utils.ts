import { clsx, type ClassValue } from "clsx"
import { twMerge } from "tailwind-merge"
import prettyBytes from "pretty-bytes"
import dayjs from "dayjs"
import duration from "dayjs/plugin/duration"

dayjs.extend(duration)

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

/** Format network speed */
export function formatSpeed(bytesPerSecond: number): string {
  if (bytesPerSecond === 0) return '0 B/s';
  return prettyBytes(bytesPerSecond, { bits: false }) + '/s';
}

/** Format bytes */
export function formatBytes(bytes: number): string {
  return prettyBytes(bytes);
}

/** Format uptime */
export function formatUptime(seconds: number): string {
  const d = dayjs.duration(seconds, 'seconds');
  const years = Math.floor(d.asYears());
  const months = Math.floor(d.asMonths()) % 12;
  const days = Math.floor(d.asDays()) % 30;
  const hours = d.hours();

  if (years > 0) return `${years}y${months}m`;
  if (months > 0) return `${months}m${days}d`;
  if (days > 0) return `${days}d${hours}h`;
  return `${hours}h`;
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
