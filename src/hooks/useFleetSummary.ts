import { useMemo } from 'react';
import type { NodeWithStatus } from '@/services/api';

export interface FleetSummary {
  networkStats: { totalUp: number; totalDown: number };
  avgCpu: number;
  cpuSampled: number;
  onlineUuids: string[];
  hasCriticalNode: boolean;
}

export function useFleetSummary(nodes: NodeWithStatus[]): FleetSummary {
  return useMemo(() => {
    let totalUp = 0;
    let totalDown = 0;
    let cpuSum = 0;
    let cpuSampled = 0;
    const onlineUuids: string[] = [];
    let hasCriticalNode = false;

    nodes.forEach(node => {
      if (node.status === 'online' && node.stats?.network) {
        onlineUuids.push(node.uuid);
        totalUp += node.stats.network.up || 0;
        totalDown += node.stats.network.down || 0;
      }

      if (node.status === 'online' && node.stats) {
        cpuSum += node.stats.cpu.usage;
        cpuSampled++;
      }

      if (!hasCriticalNode && node.status === 'online' && node.stats) {
        hasCriticalNode = node.stats.cpu.usage > 90 || (node.stats.ram.used / node.stats.ram.total) > 0.95;
      }
    });

    return {
      networkStats: { totalUp, totalDown },
      avgCpu: cpuSampled > 0 ? cpuSum / cpuSampled : 0,
      cpuSampled,
      onlineUuids,
      hasCriticalNode,
    };
  }, [nodes]);
}
