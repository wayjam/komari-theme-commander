import type { NodeWithStatus } from '@/services/api';
import { getExpiryTimestamp } from '@/lib/utils';

export type AssetGroupBy = 'group' | 'region';
export type AssetSortBy = 'value-desc' | 'value-asc' | 'weight' | 'name';

export interface CurrencyTotals {
  currency: string;
  billableCount: number;
  cycleTotal: number;
  monthlyTotal: number;
  remainingTotal: number;
}

export interface AssetBreakdownRow {
  key: string;
  label: string;
  currency: string;
  nodeCount: number;
  cycleTotal: number;
  monthlyTotal: number;
  remainingTotal: number;
  maxWeight: number;
}

export interface AssetStatsResult {
  totalNodes: number;
  billableNodes: number;
  currencies: CurrencyTotals[];
  breakdown: AssetBreakdownRow[];
  hasMixedCurrency: boolean;
}

export function isBillableNode(node: NodeWithStatus): boolean {
  return node.price > 0;
}

export function getNodeMonthlyEstimate(node: NodeWithStatus): number {
  if (!isBillableNode(node) || !node.billing_cycle || node.billing_cycle <= 0) return 0;
  return (node.price / node.billing_cycle) * 30;
}

export function getNodeRemainingValue(node: NodeWithStatus, nowMs = Date.now()): number {
  if (!isBillableNode(node) || !node.billing_cycle || node.billing_cycle <= 0) return 0;
  const expiry = getExpiryTimestamp(node.expired_at);
  if (expiry === null) return node.price;
  if (expiry <= nowMs) return 0;
  const remainingDays = (expiry - nowMs) / (1000 * 60 * 60 * 24);
  return Math.min(node.price, (remainingDays / node.billing_cycle) * node.price);
}

function resolveGroupLabel(node: NodeWithStatus, groupBy: AssetGroupBy): string {
  if (groupBy === 'group') {
    return node.group?.trim() || node.region?.trim() || '';
  }
  return node.region?.trim() || node.group?.trim() || '';
}

function compareBreakdown(a: AssetBreakdownRow, b: AssetBreakdownRow, sortBy: AssetSortBy): number {
  switch (sortBy) {
    case 'value-asc':
      return a.cycleTotal - b.cycleTotal || a.label.localeCompare(b.label);
    case 'weight':
      return b.maxWeight - a.maxWeight || b.cycleTotal - a.cycleTotal;
    case 'name':
      return a.label.localeCompare(b.label, undefined, { sensitivity: 'base' });
    case 'value-desc':
    default:
      return b.cycleTotal - a.cycleTotal || a.label.localeCompare(b.label);
  }
}

export function computeAssetStats(
  nodes: NodeWithStatus[],
  groupBy: AssetGroupBy,
  sortBy: AssetSortBy,
  nowMs = Date.now(),
): AssetStatsResult {
  const billable = nodes.filter(isBillableNode);

  const currencyMap = new Map<string, CurrencyTotals>();
  const breakdownMap = new Map<string, AssetBreakdownRow>();

  for (const node of billable) {
    const currency = node.currency?.trim() || '?';
    const monthly = getNodeMonthlyEstimate(node);
    const remaining = getNodeRemainingValue(node, nowMs);

    const bucket = currencyMap.get(currency) ?? {
      currency,
      billableCount: 0,
      cycleTotal: 0,
      monthlyTotal: 0,
      remainingTotal: 0,
    };
    bucket.billableCount += 1;
    bucket.cycleTotal += node.price;
    bucket.monthlyTotal += monthly;
    bucket.remainingTotal += remaining;
    currencyMap.set(currency, bucket);

    const label = resolveGroupLabel(node, groupBy) || '—';
    const rowKey = `${label}\0${currency}`;
    const row = breakdownMap.get(rowKey) ?? {
      key: rowKey,
      label,
      currency,
      nodeCount: 0,
      cycleTotal: 0,
      monthlyTotal: 0,
      remainingTotal: 0,
      maxWeight: node.weight ?? 0,
    };
    row.nodeCount += 1;
    row.cycleTotal += node.price;
    row.monthlyTotal += monthly;
    row.remainingTotal += remaining;
    row.maxWeight = Math.max(row.maxWeight, node.weight ?? 0);
    breakdownMap.set(rowKey, row);
  }

  const currencies = [...currencyMap.values()].sort((a, b) => b.cycleTotal - a.cycleTotal);
  const breakdown = [...breakdownMap.values()].sort((a, b) => compareBreakdown(a, b, sortBy));

  return {
    totalNodes: nodes.length,
    billableNodes: billable.length,
    currencies,
    breakdown,
    hasMixedCurrency: currencies.length > 1,
  };
}

export function formatAssetAmount(amount: number, currency: string): string {
  const value = Number.isFinite(amount) ? amount : 0;
  const abs = Math.abs(value);
  const digits = abs >= 100 ? 2 : abs >= 10 ? 2 : 2;
  const formatted = value.toLocaleString(undefined, {
    minimumFractionDigits: 0,
    maximumFractionDigits: digits,
  });
  return `${currency}${formatted}`;
}
