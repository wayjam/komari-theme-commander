import { useState, useEffect, useCallback } from 'react';
import { apiService, wsService } from '../services/api';
import type { NodeWithStatus } from '../services/api';

export function useNodes() {
  const [nodes, setNodes] = useState<NodeWithStatus[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

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
        setNodes(prevNodes =>
          prevNodes.map(node => {
            const isOnline = data.online.includes(node.uuid);
            const stats = data.data[node.uuid];
            
            return {
              ...node,
              status: isOnline ? 'online' : 'offline',
              stats: stats ? {
                ...stats,
                // Ensure data format is correct
                cpu: { usage: stats.cpu?.usage || 0 },
                ram: {
                  total: stats.ram?.total || 0,
                  used: stats.ram?.used || 0
                },
                swap: {
                  total: stats.swap?.total || 0,
                  used: stats.swap?.used || 0
                },
                disk: {
                  total: stats.disk?.total || 0,
                  used: stats.disk?.used || 0
                },
                network: {
                  up: stats.network?.up || 0,
                  down: stats.network?.down || 0,
                  totalUp: stats.network?.totalUp || 0,
                  totalDown: stats.network?.totalDown || 0
                },
                load: {
                  load1: stats.load?.load1 || 0,
                  load5: stats.load?.load5 || 0,
                  load15: stats.load?.load15 || 0
                },
                uptime: stats.uptime || 0,
                process: stats.process || 0,
                connections: {
                  tcp: stats.connections?.tcp || 0,
                  udp: stats.connections?.udp || 0
                },
                message: stats.message || '',
                updated_at: stats.updated_at || new Date().toISOString()
              } : undefined
            };
          })
        );
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