import { useState, useEffect, useMemo, useRef } from 'react';
import {
  defaultOfflineLoadTimeRange,
  type LoadTimeRangeId,
} from '@/lib/chart-time-ranges';

/**
 * Load chart time range with offline-aware defaults:
 * - Online → LIVE (realtime)
 * - Offline → 4h (or first available historical preset)
 * - Online again after offline fallback → restore LIVE if still on the offline preset
 */
export function useAdaptiveLoadTimeRange(
  isOnline: boolean | undefined,
  recordPreserveTime?: number,
): [LoadTimeRangeId, (value: LoadTimeRangeId) => void] {
  const offlineDefault = useMemo(
    () => defaultOfflineLoadTimeRange(recordPreserveTime),
    [recordPreserveTime],
  );

  const [timeRange, setTimeRange] = useState<LoadTimeRangeId>('realtime');
  const prevOnlineRef = useRef<boolean | undefined>(undefined);

  useEffect(() => {
    if (isOnline === undefined) return;

    const wasOnline = prevOnlineRef.current;
    prevOnlineRef.current = isOnline;

    if (!isOnline) {
      setTimeRange(prev => (prev === 'realtime' ? offlineDefault : prev));
      return;
    }

    if (wasOnline === false) {
      setTimeRange(prev => (prev === offlineDefault ? 'realtime' : prev));
    }
  }, [isOnline, offlineDefault]);

  return [timeRange, setTimeRange];
}
