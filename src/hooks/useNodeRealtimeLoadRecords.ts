import { useState, useEffect, useCallback, useRef } from 'react';
import { apiService } from '@/services/api';
import { useNodesContext } from '@/contexts/NodesContext';
import { nodeStatsToLoadRecord, nodeStatsToLoadRecords, type LoadRecord } from '@/lib/chart-utils';

const MAX_POINTS = 150;

export function useNodeRealtimeLoadRecords(uuid: string, enabled: boolean) {
  const { nodes } = useNodesContext();
  const node = nodes.find(n => n.uuid === uuid);
  const [records, setRecords] = useState<LoadRecord[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const lastAppendedRef = useRef<string | null>(null);

  const refresh = useCallback(async () => {
    if (!uuid || !enabled) return;
    setLoading(true);
    setError(null);
    try {
      const stats = await apiService.getNodeRecentStats(uuid);
      const next = nodeStatsToLoadRecords(stats).slice(-MAX_POINTS);
      setRecords(next);
      lastAppendedRef.current = next.length > 0 ? next[next.length - 1].time : null;
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Error');
    } finally {
      setLoading(false);
    }
  }, [uuid, enabled]);

  useEffect(() => {
    if (!enabled) {
      setRecords([]);
      setError(null);
      lastAppendedRef.current = null;
      return;
    }
    refresh();
  }, [enabled, refresh]);

  useEffect(() => {
    if (!enabled || !node?.stats?.updated_at) return;
    const ts = node.stats.updated_at;
    if (lastAppendedRef.current === ts) return;
    lastAppendedRef.current = ts;
    const newRecord = nodeStatsToLoadRecord(node.stats);
    setRecords(prev => {
      if (prev.some(r => r.time === ts)) return prev;
      return [...prev, newRecord].slice(-MAX_POINTS);
    });
  }, [enabled, node?.stats]);

  return { records, loading, error, refresh };
}
