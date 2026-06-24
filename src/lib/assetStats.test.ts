import { describe, expect, it } from 'vitest';
import {
  computeAssetStats,
  getNodeMonthlyEstimate,
  getNodeRemainingValue,
  isBillableNode,
} from './assetStats';
import type { NodeWithStatus } from '@/services/api';

function makeNode(overrides: Partial<NodeWithStatus> = {}): NodeWithStatus {
  return {
    uuid: 'uuid-1',
    name: 'test',
    cpu_name: '',
    virtualization: '',
    arch: '',
    cpu_cores: 1,
    os: '',
    gpu_name: '',
    region: '🇭🇰 HK',
    mem_total: 0,
    swap_total: 0,
    disk_total: 0,
    weight: 10,
    price: 100,
    billing_cycle: 30,
    currency: '¥',
    expired_at: '2099-01-01T00:00:00Z',
    group: 'prod',
    tags: '',
    created_at: '',
    updated_at: '',
    status: 'online',
    ...overrides,
  };
}

describe('assetStats', () => {
  it('treats price > 0 as billable', () => {
    expect(isBillableNode(makeNode({ price: 50 }))).toBe(true);
    expect(isBillableNode(makeNode({ price: 0 }))).toBe(false);
    expect(isBillableNode(makeNode({ price: -1 }))).toBe(false);
  });

  it('estimates monthly cost from billing cycle', () => {
    const node = makeNode({ price: 90, billing_cycle: 30 });
    expect(getNodeMonthlyEstimate(node)).toBeCloseTo(90);
  });

  it('returns zero remaining value when expired', () => {
    const node = makeNode({ expired_at: '2020-01-01T00:00:00Z' });
    expect(getNodeRemainingValue(node, Date.parse('2025-01-01'))).toBe(0);
  });

  it('aggregates by currency and group', () => {
    const nodes = [
      makeNode({ uuid: 'a', group: 'hk', price: 100, currency: '¥' }),
      makeNode({ uuid: 'b', group: 'hk', price: 50, currency: '¥' }),
      makeNode({ uuid: 'c', group: 'us', price: 20, currency: '$', region: '🇺🇸 US' }),
    ];
    const stats = computeAssetStats(nodes, 'group', 'value-desc');
    expect(stats.billableNodes).toBe(3);
    expect(stats.currencies).toHaveLength(2);
    expect(stats.currencies[0].cycleTotal).toBe(150);
    expect(stats.breakdown.some(r => r.label === 'hk' && r.cycleTotal === 150)).toBe(true);
  });
});
