import { useState, useEffect, useCallback, useRef } from 'react';
import { apiService, wsService } from '../services/api';
import type { NodeWithStatus } from '../services/api';

/**
 * Shallow-compare two stats objects. Returns true if they are equivalent.
 */
function statsEqual(a: any, b: any): boolean {
  if (a === b) return true;
  if (!a || !b) return false;
  return (
    a.cpu?.usage === b.cpu?.usage &&
    a.ram?.used === b.ram?.used &&
    a.ram?.total === b.ram?.total &&
    a.swap?.used === b.swap?.used &&
    a.swap?.total === b.swap?.total &&
    a.disk?.used === b.disk?.used &&
    a.disk?.total === b.disk?.total &&
    a.network?.up === b.network?.up &&
    a.network?.down === b.network?.down &&
    a.network?.totalUp === b.network?.totalUp &&
    a.network?.totalDown === b.network?.totalDown &&
    a.load?.load1 === b.load?.load1 &&
    a.load?.load5 === b.load?.load5 &&
    a.load?.load15 === b.load?.load15 &&
    a.uptime === b.uptime &&
    a.process === b.process &&
    a.connections?.tcp === b.connections?.tcp &&
    a.connections?.udp === b.connections?.udp &&
    a.updated_at === b.updated_at
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

  // Set up WebSocket listener
  useEffect(() => {
    const handleWebSocketData = (data: any) => {
      if (data.online && data.data) {
        const prevNodes = nodesRef.current;
        let changed = false;
        const nextNodes = prevNodes.map(node => {
          const isOnline = data.online.includes(node.uuid);
          const newStatus: 'online' | 'offline' = isOnline ? 'online' : 'offline';
          const rawStats = data.data[node.uuid];

          const newStats = rawStats ? {
            ...rawStats,
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
          } : undefined;

          // Skip creating new object if nothing changed
          if (node.status === newStatus && statsEqual(node.stats, newStats)) {
            return node;
          }

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

    // Set up timer to request data every 2 seconds
    const intervalId = setInterval(() => {
      if (wsService.getOnlineNodes().length > 0) {
        wsService.send('get');
      }
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