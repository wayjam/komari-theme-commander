import { useState, useEffect, useCallback, useRef } from 'react';
import { apiService, wsService, type PingStat } from '../services/api';
import type { NodeWithStatus, NodeStats, WsMessage } from '../services/api';

/**
 * Compare a stored, normalised `NodeStats` to the *raw* stats payload coming
 * off the wire. Designed to short-circuit the WS hot loop: if every value
 * the UI actually reads is unchanged, we keep the previous node reference,
 * which lets `React.memo` on NodeCard / NodeTable rows bail out cleanly.
 *
 * `prev` is normalised (no missing fields), `raw` is whatever the server
 * sent — fall back to 0 / '' so the comparison mirrors the normalisation
 * logic in the caller exactly.
 */
function pingStatsEqual(
  prev?: Record<string, PingStat>,
  next?: Record<string, PingStat>,
): boolean {
  if (!prev && !next) return true;
  if (!prev || !next) return false;
  const prevKeys = Object.keys(prev);
  const nextKeys = Object.keys(next);
  if (prevKeys.length !== nextKeys.length) return false;
  for (const key of prevKeys) {
    const a = prev[key];
    const b = next[key];
    if (!b) return false;
    if (a.latest !== b.latest || a.avg !== b.avg || a.loss !== b.loss) return false;
  }
  return true;
}

function rawStatsEqual(
  prev: NodeStats | undefined,
  raw: NodeStats | undefined,
): boolean {
  if (!prev && !raw) return true;
  if (!prev || !raw) return false;
  return (
    prev.cpu.usage === (raw.cpu?.usage || 0) &&
    prev.ram.used === (raw.ram?.used || 0) &&
    prev.ram.total === (raw.ram?.total || 0) &&
    prev.swap.used === (raw.swap?.used || 0) &&
    prev.swap.total === (raw.swap?.total || 0) &&
    prev.disk.used === (raw.disk?.used || 0) &&
    prev.disk.total === (raw.disk?.total || 0) &&
    prev.network.up === (raw.network?.up || 0) &&
    prev.network.down === (raw.network?.down || 0) &&
    prev.network.totalUp === (raw.network?.totalUp || 0) &&
    prev.network.totalDown === (raw.network?.totalDown || 0) &&
    prev.load.load1 === (raw.load?.load1 || 0) &&
    prev.load.load5 === (raw.load?.load5 || 0) &&
    prev.load.load15 === (raw.load?.load15 || 0) &&
    prev.uptime === (raw.uptime || 0) &&
    prev.process === (raw.process || 0) &&
    prev.connections.tcp === (raw.connections?.tcp || 0) &&
    prev.connections.udp === (raw.connections?.udp || 0) &&
    prev.updated_at === (raw.updated_at || prev.updated_at) &&
    pingStatsEqual(prev.ping, raw.ping)
  );
}

export function useNodes() {
  const [nodes, setNodes] = useState<NodeWithStatus[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const nodesRef = useRef<NodeWithStatus[]>([]);

  // Fetch node list
  const fetchNodes = useCallback(async () => {
    setLoading(true);
    setError(null);
    
    try {
      const nodeData = await apiService.getNodes();
      
      // Add status info for each node
      const nodesWithStatus: NodeWithStatus[] = nodeData.map(node => ({
        ...node,
        status: 'offline' as const // Default to offline; WebSocket will update online status
      }));
      
      nodesRef.current = nodesWithStatus;
      setNodes(nodesWithStatus);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to fetch node data');
    } finally {
      setLoading(false);
    }
  }, []);

  // Refresh node data
  const refreshNodes = useCallback(async () => {
    await fetchNodes();
  }, [fetchNodes]);

  // Fetch node data on initialization
  useEffect(() => {
    fetchNodes();
  }, [fetchNodes]);

  // Subset status polling to known nodes once the list is loaded
  useEffect(() => {
    if (nodes.length > 0) {
      wsService.setPollUuids(nodes.map(node => node.uuid));
    }
  }, [nodes]);

  // Set up WebSocket listener
  useEffect(() => {
    const handleWebSocketData = (data: WsMessage) => {
      if (data.online && data.data) {
        const prevNodes = nodesRef.current;
        const onlineSet = new Set(data.online);
        let changed = false;
        const nextNodes = prevNodes.map(node => {
          const isOnline = onlineSet.has(node.uuid);
          const newStatus: 'online' | 'offline' = isOnline ? 'online' : 'offline';
          const rawStats = data.data[node.uuid];

          // Fast path: when both status and the raw stats payload are
          // equivalent to what we already hold, return the previous node
          // reference unchanged. This is the hot loop for every WS tick, so
          // skipping the spread + new-object allocation here is what makes
          // memoised NodeCards actually bail out of re-render.
          if (node.status === newStatus && rawStatsEqual(node.stats, rawStats)) {
            return node;
          }

          const newStats = rawStats ? {
            cpu: { usage: rawStats.cpu?.usage || 0 },
            ram: { total: rawStats.ram?.total || 0, used: rawStats.ram?.used || 0 },
            swap: { total: rawStats.swap?.total || 0, used: rawStats.swap?.used || 0 },
            disk: { total: rawStats.disk?.total || 0, used: rawStats.disk?.used || 0 },
            network: {
              up: rawStats.network?.up || 0,
              down: rawStats.network?.down || 0,
              totalUp: rawStats.network?.totalUp || 0,
              totalDown: rawStats.network?.totalDown || 0,
            },
            load: {
              load1: rawStats.load?.load1 || 0,
              load5: rawStats.load?.load5 || 0,
              load15: rawStats.load?.load15 || 0,
            },
            uptime: rawStats.uptime || 0,
            process: rawStats.process || 0,
            connections: { tcp: rawStats.connections?.tcp || 0, udp: rawStats.connections?.udp || 0 },
            message: rawStats.message || '',
            updated_at: rawStats.updated_at || new Date().toISOString(),
            ping: rawStats.ping,
          } : undefined;

          changed = true;
          return { ...node, status: newStatus, stats: newStats };
        });

        if (changed) {
          nodesRef.current = nextNodes;
          setNodes(nextNodes);
        }
      }
    };

    // Subscribe to WebSocket data
    const unsubscribe = wsService.subscribe(handleWebSocketData);
    
    // Connect WebSocket
    wsService.connect();

    // Set up timer to request data every 2 seconds.
    //
    // Skip the request when the page is hidden — the user can't see anything
    // anyway, and on tabs left open in the background this single change
    // takes the network/CPU floor of this hook close to zero. The next
    // visible tick will resync state because the WebSocket is still
    // connected and the next `send('get')` will deliver fresh stats.
    const intervalId = setInterval(() => {
      if (document.hidden) return;
      wsService.send('get');
    }, 2000);

    // Cleanup function
    return () => {
      clearInterval(intervalId);
      unsubscribe();
      // Don't disconnect WebSocket here, as other components may also need it
    };
  }, []);

  // Get details for a specific node
  const getNodeDetails = useCallback(async (uuid: string) => {
    try {
      const [recentStats, loadHistory, pingHistory] = await Promise.all([
        apiService.getNodeRecentStats(uuid),
        apiService.getLoadHistory(uuid, 24),
        apiService.getPingHistory(uuid, 24)
      ]);

      return {
        recentStats,
        loadHistory,
        pingHistory
      };
    } catch (err) {
      console.error('Failed to fetch node details:', err);
      return null;
    }
  }, []);

  // Get nodes by group
  const getNodesByGroup = useCallback((group: string) => {
    return nodes.filter(node => node.group === group);
  }, [nodes]);

  // Get all groups
  const getGroups = useCallback(() => {
    return Array.from(new Set(nodes.map(node => node.group).filter(Boolean)));
  }, [nodes]);

  // Get online node count
  const getOnlineCount = useCallback(() => {
    return nodes.filter(node => node.status === 'online').length;
  }, [nodes]);

  // Get offline node count
  const getOfflineCount = useCallback(() => {
    return nodes.filter(node => node.status === 'offline').length;
  }, [nodes]);

  return {
    nodes,
    loading,
    error,
    refreshNodes,
    getNodeDetails,
    getNodesByGroup,
    getGroups,
    getOnlineCount,
    getOfflineCount
  };
}