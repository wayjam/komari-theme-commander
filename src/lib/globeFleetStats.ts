import type { NodeWithStatus } from '@/services/api';
import { extractRegionEmoji } from '@/lib/utils';
import { getCoords } from '@/data/regionCoords';

export interface GlobeFleetStats {
  avgCpu: number;
  critical: number;
  sampled: number;
  totalUp: number;
  totalDown: number;
  regionCount: number;
}

export function computeGlobeFleetStats(nodes: NodeWithStatus[]): GlobeFleetStats {
  let cpuSum = 0;
  let cpuCount = 0;
  let critical = 0;
  let totalUp = 0;
  let totalDown = 0;
  const zones = new Set<string>();

  for (const n of nodes) {
    const emoji = extractRegionEmoji(n.region);
    if (emoji && getCoords(emoji)) zones.add(emoji);

    if (n.status === 'online' && n.stats) {
      cpuSum += n.stats.cpu.usage;
      cpuCount++;
      totalUp += n.stats.network.up;
      totalDown += n.stats.network.down;
      const ramPct = n.stats.ram.total > 0 ? (n.stats.ram.used / n.stats.ram.total) * 100 : 0;
      if (n.stats.cpu.usage > 90 || ramPct > 95) critical++;
    }
  }

  return {
    avgCpu: cpuCount > 0 ? cpuSum / cpuCount : 0,
    critical,
    sampled: cpuCount,
    totalUp,
    totalDown,
    regionCount: zones.size,
  };
}
