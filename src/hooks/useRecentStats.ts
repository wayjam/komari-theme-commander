import { createContext, useContext, useState, useEffect, useCallback, useRef, useMemo, type ReactNode } from 'react';
import { createElement } from 'react';
import { apiService } from '@/services/api';

interface RecentStatsContextType {
  /** Get CPU usage sparkline data for a node */
  getCpuSparkline: (uuid: string) => number[] | null;
}

const RecentStatsContext = createContext<RecentStatsContextType>({
  getCpuSparkline: () => null,
});

export function useRecentStats() {
  return useContext(RecentStatsContext);
}

const BATCH_SIZE = 4;
const REFRESH_INTERVAL = 30_000; // 30 seconds

export function RecentStatsProvider({
  onlineUuids,
  children,
}: {
  onlineUuids: string[];
  children: ReactNode;
}) {
  const [sparklineMap, setSparklineMap] = useState<Map<string, number[]>>(new Map());
  const fetchingRef = useRef(false);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const fetchAll = useCallback(async (uuids: string[]) => {
    if (fetchingRef.current || uuids.length === 0) return;
    fetchingRef.current = true;

    try {
      for (let i = 0; i < uuids.length; i += BATCH_SIZE) {
        const batch = uuids.slice(i, i + BATCH_SIZE);
        const results = await Promise.all(
          batch.map(async (uuid) => {
            try {
              const stats = await apiService.getNodeRecentStats(uuid);
              // Extract CPU usage values from the stats array
              const cpuValues = (stats || [])
                .map((s: any) => s?.cpu?.usage ?? null)
                .filter((v: any): v is number => v !== null);
              return { uuid, data: cpuValues };
            } catch {
              return { uuid, data: [] as number[] };
            }
          })
        );

        setSparklineMap(prev => {
          const next = new Map(prev);
          for (const { uuid, data } of results) {
            if (data.length >= 2) {
              next.set(uuid, data);
            }
          }
          return next;
        });
      }
    } finally {
      fetchingRef.current = false;
    }
  }, []);

  // Initial fetch + when online nodes change
  useEffect(() => {
    fetchAll(onlineUuids);
  }, [onlineUuids, fetchAll]);

  // Periodic refresh
  useEffect(() => {
    if (timerRef.current) clearInterval(timerRef.current);
    timerRef.current = setInterval(() => {
      fetchAll(onlineUuids);
    }, REFRESH_INTERVAL);
    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
    };
  }, [onlineUuids, fetchAll]);

  const getCpuSparkline = useCallback(
    (uuid: string) => sparklineMap.get(uuid) ?? null,
    [sparklineMap],
  );

  const value = useMemo(() => ({ getCpuSparkline }), [getCpuSparkline]);

  return createElement(RecentStatsContext.Provider, { value }, children);
}
