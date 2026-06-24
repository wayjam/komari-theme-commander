import { useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { motion, useReducedMotion } from 'motion/react';
import { X, Landmark, Info, ChevronDown } from 'lucide-react';
import type { NodeWithStatus } from '@/services/api';
import {
  computeAssetStats,
  formatAssetAmount,
  type AssetGroupBy,
  type AssetSortBy,
} from '@/lib/assetStats';
import { cn } from '@/lib/utils';
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from '@/components/ui/tooltip';

interface AssetStatsPanelProps {
  nodes: NodeWithStatus[];
  onClose: () => void;
}

function LedgerSelect<T extends string>({
  label,
  value,
  options,
  onChange,
}: {
  label: string;
  value: T;
  options: { value: T; label: string }[];
  onChange: (v: T) => void;
}) {
  return (
    <label className="flex items-center gap-1.5 text-xxs font-mono shrink-0">
      <span className="text-muted-foreground/60 uppercase tracking-wider">{label}</span>
      <span className="relative">
        <select
          value={value}
          onChange={e => onChange(e.target.value as T)}
          className="appearance-none h-7 pl-2 pr-6 rounded border border-border/40 bg-muted/20 text-xs font-mono text-foreground focus:outline-none focus:border-primary/40 cursor-pointer"
        >
          {options.map(opt => (
            <option key={opt.value} value={opt.value}>{opt.label}</option>
          ))}
        </select>
        <ChevronDown className="pointer-events-none absolute right-1.5 top-1/2 -translate-y-1/2 h-3 w-3 opacity-40" aria-hidden />
      </span>
    </label>
  );
}

function MetricCell({
  label,
  value,
  hint,
  accent,
}: {
  label: string;
  value: React.ReactNode;
  hint?: string;
  accent?: 'default' | 'primary';
}) {
  return (
    <div className={cn(
      'flex flex-col gap-0.5 px-2.5 py-2 min-w-0 border-r border-border/30 last:border-r-0',
      accent === 'primary' && 'bg-primary/5',
    )}>
      <div className="flex items-center gap-1">
        <span className="text-xxs font-mono uppercase tracking-wider text-muted-foreground/60 truncate">{label}</span>
        {hint && (
          <Tooltip>
            <TooltipTrigger asChild>
              <button type="button" className="text-muted-foreground/40 hover:text-muted-foreground/70 cursor-default">
                <Info className="h-3 w-3" aria-hidden />
              </button>
            </TooltipTrigger>
            <TooltipContent side="top" className="max-w-xs text-xs font-mono whitespace-pre-line">
              {hint}
            </TooltipContent>
          </Tooltip>
        )}
      </div>
      <div className="text-sm sm:text-base font-mono font-bold tabular-nums text-foreground truncate">{value}</div>
    </div>
  );
}

export function AssetStatsPanel({ nodes, onClose }: AssetStatsPanelProps) {
  const { t } = useTranslation();
  const reduceMotion = useReducedMotion();
  const [groupBy, setGroupBy] = useState<AssetGroupBy>('group');
  const [sortBy, setSortBy] = useState<AssetSortBy>('value-desc');

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    document.addEventListener('keydown', onKey);
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.removeEventListener('keydown', onKey);
      document.body.style.overflow = prev;
    };
  }, [onClose]);

  const stats = useMemo(
    () => computeAssetStats(nodes, groupBy, sortBy),
    [nodes, groupBy, sortBy],
  );

  const maxBreakdownTotal = useMemo(
    () => stats.breakdown.reduce((max, row) => Math.max(max, row.cycleTotal), 0),
    [stats.breakdown],
  );

  const backdropTransition = reduceMotion ? { duration: 0 } : { duration: 0.2 };
  const panelTransition = reduceMotion ? { duration: 0 } : { type: 'spring' as const, stiffness: 420, damping: 32 };

  const groupOptions: { value: AssetGroupBy; label: string }[] = [
    { value: 'group', label: t('assetStats.groupByGroup') },
    { value: 'region', label: t('assetStats.groupByRegion') },
  ];
  const sortOptions: { value: AssetSortBy; label: string }[] = [
    { value: 'value-desc', label: t('assetStats.sortValueDesc') },
    { value: 'value-asc', label: t('assetStats.sortValueAsc') },
    { value: 'weight', label: t('assetStats.sortWeight') },
    { value: 'name', label: t('assetStats.sortName') },
  ];

  return (
    <div className="fixed inset-0 z-[100] flex items-end sm:items-center justify-center p-0 sm:p-4" onClick={onClose}>
      <motion.div
        className="absolute inset-0 bg-background/55 backdrop-blur-sm"
        initial={{ opacity: reduceMotion ? 1 : 0 }}
        animate={{ opacity: 1 }}
        transition={backdropTransition}
      />
      <motion.div
        role="dialog"
        aria-modal="true"
        aria-labelledby="asset-stats-title"
        className={cn(
          'node-card-commander relative w-full sm:max-w-lg overflow-hidden border border-border/50 bg-card/95 shadow-2xl backdrop-blur-xl commander-corners flex flex-col',
          'max-h-[min(88svh,640px)] rounded-t-xl sm:rounded-lg',
          'pb-safe',
        )}
        onClick={e => e.stopPropagation()}
        initial={reduceMotion ? { opacity: 1, y: 0 } : { opacity: 0, y: 24 }}
        animate={{ opacity: 1, y: 0 }}
        transition={panelTransition}
      >
        <span className="corner-bottom" />

        {/* Header */}
        <div className="flex items-center justify-between gap-3 border-b border-border/40 px-4 py-3 bg-gradient-to-r from-muted/15 to-transparent">
          <div className="flex items-center gap-2.5 min-w-0">
            <div className="flex h-7 w-7 shrink-0 items-center justify-center border border-primary/25 bg-primary/10 relative">
              <span className="absolute top-0 left-0 w-1 h-1 border-t border-l border-primary/50" />
              <span className="absolute bottom-0 right-0 w-1 h-1 border-b border-r border-primary/50" />
              <Landmark className="h-3.5 w-3.5 text-primary" aria-hidden />
            </div>
            <div className="min-w-0">
              <h2 id="asset-stats-title" className="font-display text-sm font-bold tracking-widest uppercase leading-none">
                {t('assetStats.title')}
              </h2>
              <p className="text-xxs font-mono text-muted-foreground/60 mt-0.5 truncate">
                {t('assetStats.subtitle', { billable: stats.billableNodes, total: stats.totalNodes })}
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label={t('action.close')}
            className="rounded h-9 w-9 sm:h-8 sm:w-8 flex shrink-0 items-center justify-center transition-colors hover:bg-muted/50 cursor-pointer"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="flex-1 min-h-0 flex flex-col">
          {stats.billableNodes === 0 ? (
            <div className="flex flex-1 flex-col items-center justify-center gap-2 px-6 py-16 text-center">
              <span className="text-sm font-display font-bold text-muted-foreground/50 uppercase tracking-widest">
                {t('assetStats.noBillable')}
              </span>
              <p className="text-xs font-mono text-muted-foreground/60 max-w-xs">{t('assetStats.noBillableHint')}</p>
            </div>
          ) : (
            <>
              {/* Per-currency summary — pinned above scrollable breakdown */}
              <div className="shrink-0 px-3 pt-3 space-y-2">
                {stats.currencies.map(bucket => (
                  <div
                    key={bucket.currency}
                    className="rounded-sm border border-border/40 overflow-hidden bg-background/40"
                  >
                    <div className="px-2.5 py-1 border-b border-border/25 bg-muted/15 flex items-center justify-between">
                      <span className="text-xxs font-mono uppercase tracking-wider text-muted-foreground/70">
                        {t('assetStats.currencyBlock', { currency: bucket.currency })}
                      </span>
                      <span className="text-xxs font-mono tabular-nums text-muted-foreground/50">
                        {t('assetStats.nodeCount', { count: bucket.billableCount })}
                      </span>
                    </div>
                    <div className="grid grid-cols-3">
                      <MetricCell
                        label={t('assetStats.cycleTotal')}
                        value={formatAssetAmount(bucket.cycleTotal, bucket.currency)}
                      />
                      <MetricCell
                        label={t('assetStats.monthlyEst')}
                        value={formatAssetAmount(bucket.monthlyTotal, bucket.currency)}
                      />
                      <MetricCell
                        label={t('assetStats.remaining')}
                        value={formatAssetAmount(bucket.remainingTotal, bucket.currency)}
                        hint={t('assetStats.remainingHint')}
                        accent="primary"
                      />
                    </div>
                  </div>
                ))}
                {stats.hasMixedCurrency && (
                  <p className="text-xxs font-mono text-muted-foreground/50 px-1">{t('assetStats.mixedCurrencyNote')}</p>
                )}
              </div>

              {/* Breakdown — independently scrollable when list is long */}
              {stats.breakdown.length > 0 && (
                <div className="flex flex-1 min-h-0 flex-col px-3 pt-4 pb-2">
                  <div className="flex shrink-0 items-center gap-2 mb-2 px-0.5">
                    <span className="h-px flex-1 bg-border/40" />
                    <span className="text-xxs font-mono uppercase tracking-widest text-muted-foreground/50 shrink-0">
                      {t('assetStats.breakdown')}
                    </span>
                    <span className="h-px flex-1 bg-border/40" />
                  </div>
                  <ul className="flex-1 min-h-0 overflow-y-auto overscroll-contain space-y-1.5 pr-0.5">
                    {stats.breakdown.map(row => {
                      const pct = maxBreakdownTotal > 0 ? (row.cycleTotal / maxBreakdownTotal) * 100 : 0;
                      return (
                        <li
                          key={row.key}
                          className="rounded-sm border border-border/25 bg-muted/10 px-2.5 py-2 hover:border-primary/20 transition-colors"
                        >
                          <div className="flex items-baseline justify-between gap-2 mb-1.5 min-w-0">
                            <div className="min-w-0 flex items-baseline gap-2">
                              <span className="text-xs font-mono font-bold text-foreground truncate">{row.label}</span>
                              <span className="text-xxs font-mono text-muted-foreground/50 shrink-0">
                                ×{row.nodeCount}
                              </span>
                            </div>
                            <span className="text-xs font-mono font-bold tabular-nums text-primary shrink-0">
                              {formatAssetAmount(row.cycleTotal, row.currency)}
                            </span>
                          </div>
                          <div className="h-1 rounded-full bg-border/30 overflow-hidden">
                            <div
                              className="h-full rounded-full bg-primary/70 transition-[width] duration-300 ease-out"
                              style={{ width: `${Math.max(pct, row.cycleTotal > 0 ? 4 : 0)}%` }}
                            />
                          </div>
                          <div className="flex justify-between mt-1 text-xxs font-mono text-muted-foreground/50 tabular-nums">
                            <span>{t('assetStats.rowMonthly', { amount: formatAssetAmount(row.monthlyTotal, row.currency) })}</span>
                            <span>{Math.round(pct)}%</span>
                          </div>
                        </li>
                      );
                    })}
                  </ul>
                </div>
              )}
            </>
          )}
        </div>

        {/* Footer controls */}
        {stats.billableNodes > 0 && (
          <div className="border-t border-border/40 px-3 py-2.5 flex flex-wrap items-center gap-x-4 gap-y-2 bg-muted/10">
            <LedgerSelect label={t('assetStats.groupBy')} value={groupBy} options={groupOptions} onChange={setGroupBy} />
            <LedgerSelect label={t('assetStats.sort')} value={sortBy} options={sortOptions} onChange={setSortBy} />
          </div>
        )}
      </motion.div>
    </div>
  );
}
