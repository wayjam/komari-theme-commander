import { useMemo, memo, useState, useCallback, useEffect, useRef } from 'react';
import { useTranslation } from 'react-i18next';
import {
  useReactTable,
  getCoreRowModel,
  getSortedRowModel,
  flexRender,
  createColumnHelper,
  type SortingState,
  type Row,
} from '@tanstack/react-table';
import { useWindowVirtualizer } from '@tanstack/react-virtual';
import { useNavigate } from 'react-router-dom';
import { useAppConfig } from '@/hooks/useAppConfig';
import { useIsMobile } from '@/hooks/useIsMobile';
import { Sparkline } from './Sparkline';
import { ArrowUpDown, ArrowUp, ArrowDown } from 'lucide-react';
import { SystemIcon } from '@/lib/systemIcon';
import type { NodeWithStatus } from '@/services/api';
import { useRecentStats } from '@/hooks/useRecentStats';
import { formatSpeed, formatUptime, formatBytes, getUsageStatus, calcTrafficUsage, formatTrafficType, getExpiryStatus, formatExpiry, cn } from '@/lib/utils';
import type { TrafficLimitType } from '@/lib/utils';
import { Tooltip, TooltipTrigger, TooltipContent } from './ui/tooltip';
import { RegionFlag } from './RegionFlag';
import { TagPill } from './TagPill';
import { parseTagList } from '@/lib/parseTags';
import dayjs from 'dayjs';

interface NodeTableProps {
  nodes: NodeWithStatus[];
}

type GaugeChannel = 'cpu' | 'ram' | 'disk' | 'traffic';
type GaugeStatus = 'normal' | 'warning' | 'critical';

const textByStatus: Record<string, string> = {
  critical: 'text-destructive',
  warning: 'text-warning',
  normal: '',
};

function UsageCell({ value, status, channel, sparkline, sub }: { value: number; status: GaugeStatus; channel: GaugeChannel; sparkline?: number[] | null; sub?: React.ReactNode }) {
  const pct = Math.min(Math.max(value, 0), 100);
  const textColor = status === 'critical' ? 'text-destructive' : status === 'warning' ? 'text-warning' : '';
  
  return (
    <div className="hud-gauge w-full min-w-22" data-channel={channel} data-status={status}>
      <div className="flex items-baseline justify-between gap-2 mb-1">
        <div className="flex items-baseline gap-1.5 min-w-0">
          <span className={cn('hud-gauge__value text-xs font-metric font-bold tabular-nums', textColor)}>
            {value.toFixed(1)}
            <span className="hud-gauge__unit text-xxs font-metric text-muted-foreground/70 ml-0.5">
              %
            </span>
          </span>
          {sub && (
            <span className="text-xxs font-metric text-muted-foreground/55 truncate">
              {sub}
            </span>
          )}
        </div>
        {sparkline && (
          <div className="hidden h-3.5 items-center justify-end xl:flex opacity-80" aria-label="Trend">
            <Sparkline data={sparkline} width={56} height={14} />
          </div>
        )}
      </div>
      <div className="hud-gauge__track-wrap">
        <div className="hud-gauge__ticks" aria-hidden="true">
          <span style={{ left: '25%' }} />
          <span style={{ left: '50%' }} />
          <span style={{ left: '75%' }} />
        </div>
        <div className="hud-gauge__track">
          <div className="hud-gauge__fill" style={{ width: `${pct}%` }}>
            <span className="hud-gauge__cursor" aria-hidden="true" />
          </div>
        </div>
      </div>
    </div>
  );
}

function NetworkCell({ node, t }: { node: NodeWithStatus; t: (k: string, p?: Record<string, unknown>) => string }) {
  const stats = node.stats;
  if (!stats) return <span className="text-sm font-metric text-muted-foreground/30">—</span>;

  const hasTraffic = !!(node.traffic_limit && node.traffic_limit > 0 && node.traffic_limit_type && node.traffic_limit_type !== 'no_limit');
  const trafficUsed = hasTraffic
    ? calcTrafficUsage(stats.network.totalUp, stats.network.totalDown, node.traffic_limit_type as TrafficLimitType)
    : 0;
  const trafficPct = hasTraffic ? (trafficUsed / node.traffic_limit!) * 100 : 0;
  const trafficStatus = getUsageStatus(trafficPct, { warning: 70, critical: 90 }) as GaugeStatus;
  const trafficClamped = Math.min(Math.max(trafficPct, 0), 100);
  const quotaTone = trafficStatus === 'critical'
    ? 'text-destructive'
    : trafficStatus === 'warning'
      ? 'text-warning'
      : 'text-muted-foreground/70';

  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <div className="min-w-0 cursor-default space-y-1.5 text-xs tabular-nums">
          <div className="grid min-w-0 grid-cols-2 gap-3 leading-none">
            <div className="flex min-w-0 items-center gap-1.5">
              <ArrowUp className="h-3 w-3 shrink-0 text-chart-7" aria-hidden />
              <span className="min-w-0 truncate font-metric font-semibold text-foreground/90">
                {formatSpeed(stats.network.up)}
              </span>
            </div>
            <div className="flex min-w-0 items-center gap-1.5">
              <ArrowDown className="h-3 w-3 shrink-0 text-chart-8" aria-hidden />
              <span className="min-w-0 truncate font-metric font-semibold text-foreground/90">
                {formatSpeed(stats.network.down)}
              </span>
            </div>
          </div>

          {hasTraffic ? (
            <div className="min-w-0 space-y-1 border-t border-border/20 pt-1.5">
              <div className="flex min-w-0 items-baseline justify-between gap-2 leading-none mb-1">
                <span className="min-w-0 truncate font-mono text-xxs uppercase tracking-wider text-muted-foreground/55">
                  {t('label.traffic')} ({formatTrafficType(node.traffic_limit_type!)})
                </span>
                <span className={cn('shrink-0 font-metric font-semibold tabular-nums', quotaTone)}>
                  {trafficPct.toFixed(0)}%
                </span>
              </div>
              <div className="hud-gauge" data-channel="traffic" data-status={trafficStatus}>
                <div className="hud-gauge__track-wrap">
                  <div className="hud-gauge__ticks" aria-hidden="true">
                    <span style={{ left: '25%' }} />
                    <span style={{ left: '50%' }} />
                    <span style={{ left: '75%' }} />
                  </div>
                  <div className="hud-gauge__track">
                    <div className="hud-gauge__fill" style={{ width: `${trafficClamped}%` }}>
                      <span className="hud-gauge__cursor" aria-hidden="true" />
                    </div>
                  </div>
                </div>
              </div>
              <div className="min-w-0 truncate text-right text-xxs font-metric text-muted-foreground/60 mt-0.5">
                {formatBytes(trafficUsed)} / {formatBytes(node.traffic_limit!)}
              </div>
            </div>
          ) : (
            <div className="grid min-w-0 grid-cols-2 gap-3 border-t border-border/20 pt-1.5 text-xxs font-metric leading-none">
              <span className="flex min-w-0 items-center gap-1 truncate">
                <ArrowUp className="h-2.5 w-2.5 shrink-0 text-chart-7" aria-hidden />
                <span className="text-muted-foreground/55">{t('label.total')}</span>
                <span className="font-semibold text-foreground/85 tabular-nums">{formatBytes(stats.network.totalUp)}</span>
              </span>
              <span className="flex min-w-0 items-center justify-end gap-1 truncate">
                <ArrowDown className="h-2.5 w-2.5 shrink-0 text-chart-8" aria-hidden />
                <span className="text-muted-foreground/55">{t('label.total')}</span>
                <span className="font-semibold text-foreground/85 tabular-nums">{formatBytes(stats.network.totalDown)}</span>
              </span>
            </div>
          )}
        </div>
      </TooltipTrigger>
      <TooltipContent side="bottom" className="whitespace-pre-line text-xs font-mono">
        {[
          `${t('chart.realtime')}: ${t('label.uploadShort')} ${formatSpeed(stats.network.up)} · ${t('label.downloadShort')} ${formatSpeed(stats.network.down)}`,
          `${t('label.total')} ↑ ${formatBytes(stats.network.totalUp)} · ${t('label.total')} ↓ ${formatBytes(stats.network.totalDown)}`,
          hasTraffic
            ? `${t('label.traffic')} ${formatTrafficType(node.traffic_limit_type!)}: ${formatBytes(trafficUsed)} / ${formatBytes(node.traffic_limit!)} (${trafficPct.toFixed(1)}%)`
            : null,
        ].filter(Boolean).join('\n')}
      </TooltipContent>
    </Tooltip>
  );
}

const columnHelper = createColumnHelper<NodeWithStatus>();

function SortIcon({ sorted }: { sorted: false | 'asc' | 'desc' }) {
  if (!sorted) return <ArrowUpDown className="h-3 w-3 opacity-30" />;
  if (sorted === 'asc') return <ArrowUp className="h-3 w-3 text-primary" />;
  return <ArrowDown className="h-3 w-3 text-primary" />;
}

function compactColumnClass(columnId: string) {
  return columnId === 'load' ? 'hidden xl:table-cell' : '';
}

interface DesktopRowProps {
  row: Row<NodeWithStatus>;
  isLast: boolean;
}

const DesktopRow = memo(function DesktopRow({ row, isLast }: DesktopRowProps) {
  const isOnline = row.original.status === 'online';
  const stats = row.original.stats;
  const isCritical = !!stats && (
    (stats.cpu.usage > 80) ||
    (stats.ram.used / stats.ram.total > 0.85) ||
    (stats.disk.used / stats.disk.total > 0.9)
  );

  return (
    <tr
      className={cn(
        'group transition-colors hover:bg-primary/8 relative',
        !isLast && 'border-b border-border/15',
        !isOnline && 'opacity-45',
        isCritical && 'bg-destructive/10',
      )}
      style={{ height: 60 }}
    >
      {row.getVisibleCells().map((cell, cellIdx) => {
        const isGroupStart = ['cpu', 'network', 'uptime'].includes(cell.column.id);
        
        return (
        <td
          key={cell.id}
          className={cn(
            'py-3 align-middle relative overflow-hidden',
            cellIdx === 0 ? 'px-1 text-center' : 'px-3',
            isGroupStart && 'pl-5 lg:pl-8', // Spacer gutter
            compactColumnClass(cell.column.id),
          )}
        >
          {cellIdx === 0 && (
            <div
              className={cn(
                'pointer-events-none absolute left-0 top-0 bottom-0 w-0.5 transition-colors',
                isCritical
                  ? 'bg-destructive shadow-[0_0_8px_color-mix(in_oklch,var(--destructive)_65%,transparent)] motion-safe:animate-pulse-subtle'
                  : 'bg-transparent group-hover:bg-primary/40',
              )}
            />
          )}
          {flexRender(cell.column.columnDef.cell, cell.getContext())}
        </td>
      )})}
    </tr>
  );
}, (prev, next) =>
  prev.row.original === next.row.original &&
  prev.isLast === next.isLast &&
  prev.row.getVisibleCells().length === next.row.getVisibleCells().length,
);

interface MobileRowProps {
  node: NodeWithStatus;
  isLast: boolean;
  onOpen: (uuid: string) => void;
  t: (k: string, p?: Record<string, unknown>) => string;
  isLoggedIn: boolean;
}

const MobileRow = memo(function MobileRow({ node, isLast, onOpen, t, isLoggedIn }: MobileRowProps) {
  const isOnline = node.status === 'online';
  const stats = node.stats;
  const cpuUsage = stats?.cpu?.usage ?? 0;
  const ramUsage = stats ? (stats.ram.used / stats.ram.total) * 100 : 0;
  const diskUsage = stats ? (stats.disk.used / stats.disk.total) * 100 : 0;
  
  const cpuStatus = getUsageStatus(cpuUsage, { warning: 60, critical: 80 }) as GaugeStatus;
  const ramStatus = getUsageStatus(ramUsage, { warning: 70, critical: 85 }) as GaugeStatus;
  const diskStatus = getUsageStatus(diskUsage, { warning: 75, critical: 90 }) as GaugeStatus;

  const cores = node.cpu_cores || 1;
  const loadRatio = stats ? stats.load.load1 / cores : 0;
  const loadStatus = loadRatio >= 1.5 ? 'critical' : loadRatio >= 1 ? 'warning' : 'normal';
  const expiryStatus = getExpiryStatus(node.expired_at);
  const tagList = parseTagList(node.tags).sort((a, b) => (a.color ? 0 : 1) - (b.color ? 0 : 1));

  return (
    <div
      className={cn(
        'px-3 py-3 space-y-3 transition-colors even:bg-foreground/[0.015] hover:bg-primary/6 relative',
        !isLast && 'border-b border-border/20',
        !isOnline && 'opacity-45',
      )}
    >
      <div className="space-y-1.5">
        <div className="flex items-center gap-2 min-w-0">
          <span className={cn(
            'w-2 h-2 rounded-full shrink-0',
            isOnline
              ? 'bg-success shadow-[0_0_6px_color-mix(in_oklch,var(--success)_55%,transparent)]'
              : 'bg-destructive/80',
          )} />
          <RegionFlag region={node.region} size="sm" />
          <button
            type="button"
            className="node-name min-w-0 flex-1 text-base truncate cursor-pointer text-foreground hover:text-primary hover:underline underline-offset-4 decoration-primary/40 transition-colors text-left"
            onClick={() => onOpen(node.uuid)}
          >{node.name}</button>
        </div>
        {(node.group || tagList.length > 0 || node.hidden || expiryStatus) && (
          <div className="flex flex-wrap items-center gap-1 ml-0 sm:ml-4">
            {node.group && (
              <span className="text-xxs font-mono text-primary/85 bg-primary/15 px-1.5 py-0.5 rounded-sm">
                {node.group}
              </span>
            )}
            {tagList.slice(0, 5).map((tag, i) => (
              <TagPill key={i} label={tag.label} color={tag.color} size="xs" />
            ))}
            {tagList.length > 5 && (
              <Tooltip>
                <TooltipTrigger asChild>
                  <span className="text-xxs font-mono text-muted-foreground/55 bg-muted/35 px-1.5 py-0.5 rounded-sm cursor-default">
                    +{tagList.length - 5}
                  </span>
                </TooltipTrigger>
                <TooltipContent side="bottom" className="text-xs font-mono">
                  {tagList.slice(5).map(t => t.label).join(', ')}
                </TooltipContent>
              </Tooltip>
            )}
            {node.hidden && (
              <span className="text-xxs font-mono text-warning/85 bg-warning/15 px-1.5 py-0.5 rounded-sm">
                {t('node.hidden')}
              </span>
            )}
            {expiryStatus && (
              <Tooltip>
                <TooltipTrigger asChild>
                  <span className={cn(
                    'text-xxs font-mono px-1.5 py-0.5 rounded-sm cursor-default shrink-0',
                    expiryStatus === 'expired'
                      ? 'text-destructive/85 bg-destructive/15'
                      : expiryStatus === 'warning'
                        ? 'text-warning/85 bg-warning/15'
                        : 'text-muted-foreground/55 bg-muted/35',
                  )}>
                    {formatExpiry(node.expired_at)}
                  </span>
                </TooltipTrigger>
                <TooltipContent side="bottom" className="whitespace-pre-line text-xs font-mono">
                  {isLoggedIn
                    ? t('label.expiryTooltipDetail', {
                        date: dayjs(node.expired_at).format('YYYY-MM-DD HH:mm'),
                        cycle: node.billing_cycle ?? '-',
                        renewal: node.auto_renewal ? t('label.yes') : t('label.no'),
                        price: node.price === -1 ? t('label.free') : node.price === 0 ? t('label.notSet') : `${node.currency}${node.price}`,
                      })
                    : t('label.expiryTooltip', {
                        date: dayjs(node.expired_at).format('YYYY-MM-DD HH:mm'),
                      })
                  }
                </TooltipContent>
              </Tooltip>
            )}
          </div>
        )}
      </div>
      {stats && (
        <div className="ml-0 sm:ml-4 space-y-2.5">
          <div className="grid grid-cols-3 gap-2">
            <UsageCell value={cpuUsage} status={cpuStatus} channel="cpu" sub={`${cores}C`} />
            <UsageCell value={ramUsage} status={ramStatus} channel="ram" sub={formatBytes(stats.ram.total)} />
            <UsageCell value={diskUsage} status={diskStatus} channel="disk" sub={formatBytes(stats.disk.total)} />
          </div>
          <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-1.5 text-xs font-metric text-muted-foreground tabular-nums bg-foreground/[0.025] p-2 rounded-sm border border-border/10 hud-data-cell">
            <div className="flex items-center gap-4">
              <span className="whitespace-nowrap flex items-center gap-1"><ArrowUp className="h-3 w-3 text-chart-7" aria-hidden />{formatSpeed(stats.network.up)}</span>
              <span className="whitespace-nowrap flex items-center gap-1"><ArrowDown className="h-3 w-3 text-chart-8" aria-hidden />{formatSpeed(stats.network.down)}</span>
            </div>
            <div className="flex items-center gap-4">
              <span className={cn('whitespace-nowrap', textByStatus[loadStatus])}>{t('label.load')} {stats.load.load1.toFixed(2)}</span>
              <span className="whitespace-nowrap">{formatUptime(stats.uptime)}</span>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}, (prev, next) =>
  prev.node === next.node &&
  prev.isLast === next.isLast &&
  prev.onOpen === next.onOpen &&
  prev.t === next.t &&
  prev.isLoggedIn === next.isLoggedIn,
);

export function NodeTable({ nodes }: NodeTableProps) {
  const { t } = useTranslation();
  const [sorting, setSorting] = useState<SortingState>([]);
  const { getCpuSparkline } = useRecentStats();
  const { isLoggedIn } = useAppConfig();
  const navigate = useNavigate();
  const openNode = useCallback((uuid: string) => navigate(`/node/${uuid}`), [navigate]);
  const bodyRef = useRef<HTMLDivElement>(null);
  const [scrollMargin, setScrollMargin] = useState(0);
  const isCompactLayout = useIsMobile(1024);

  const updateScrollMargin = useCallback(() => {
    if (!bodyRef.current) return;
    const nextScrollMargin = bodyRef.current.getBoundingClientRect().top + window.scrollY;
    setScrollMargin(prev => (prev === nextScrollMargin ? prev : nextScrollMargin));
  }, []);

  useEffect(() => {
    updateScrollMargin();
    const observer = new ResizeObserver(updateScrollMargin);
    if (bodyRef.current) observer.observe(bodyRef.current);
    window.addEventListener('resize', updateScrollMargin);
    return () => {
      observer.disconnect();
      window.removeEventListener('resize', updateScrollMargin);
    };
  }, [updateScrollMargin]);

  const columns = useMemo(() => [
    columnHelper.accessor('status', {
      header: () => (
        <span className="flex items-center justify-center w-full">
          <span className="sr-only">{t('table.status')}</span>
          <span className="inline-block w-1.5 h-1.5 rounded-full bg-current opacity-60" aria-hidden />
        </span>
      ),
      size: 36,
      enableSorting: true,
      sortingFn: (rowA, rowB) => {
        const a = rowA.original.status === 'online' ? 1 : 0;
        const b = rowB.original.status === 'online' ? 1 : 0;
        return a - b;
      },
      cell: ({ row }) => {
        const isOnline = row.original.status === 'online';
        return (
          <div className="flex items-center justify-center w-full">
            <Tooltip>
              <TooltipTrigger asChild>
                <span
                  className={cn(
                    'inline-block w-2 h-2 rounded-full cursor-default',
                    isOnline
                      ? 'bg-success shadow-[0_0_6px_color-mix(in_oklch,var(--success)_55%,transparent)] motion-safe:animate-pulse'
                      : 'bg-destructive/80',
                  )}
                  aria-label={isOnline ? t('status.on') : t('status.off')}
                />
              </TooltipTrigger>
              <TooltipContent side="right" className="text-xs font-mono">
                {isOnline ? t('status.on') : t('status.off')}
              </TooltipContent>
            </Tooltip>
          </div>
        );
      },
    }),

    columnHelper.accessor('name', {
      header: t('table.node'),
      size: 280,
      enableSorting: true,
      cell: ({ row }) => {
        const node = row.original;
        const expiryStatus = getExpiryStatus(node.expired_at);
        const tagList = parseTagList(node.tags).sort((a, b) => (a.color ? 0 : 1) - (b.color ? 0 : 1));
        const platformLine = [
          node.os,
          [node.virtualization, node.arch].filter(Boolean).join('/'),
        ].filter(Boolean).join(' · ');

        return (
          <div className="min-w-0 space-y-1">
            {/* Row 1: flag · node name */}
            <div className="flex items-center gap-2 min-w-0">
              <RegionFlag region={node.region} size="sm" />
              <button
                type="button"
                className="node-name text-base truncate cursor-pointer text-foreground hover:text-primary hover:underline underline-offset-4 decoration-primary/40 transition-colors text-left"
                onClick={() => openNode(node.uuid)}
              >
                {node.name}
              </button>
            </div>

            {/* Row 2: group + tags + hidden + expiry */}
            {(node.group || tagList.length > 0 || node.hidden || expiryStatus) && (
              <div className="flex flex-wrap items-center gap-1">
                {node.group && (
                  <span className="text-xxs font-mono text-primary/85 bg-primary/15 px-1.5 py-0.5 rounded-sm shrink-0">
                    {node.group}
                  </span>
                )}
                {tagList.slice(0, 3).map((tag, i) => (
                  <TagPill key={i} label={tag.label} color={tag.color} size="xs" />
                ))}
                {tagList.length > 3 && (
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <span className="text-xxs font-mono text-muted-foreground/55 bg-muted/35 px-1.5 py-0.5 rounded-sm cursor-default shrink-0">
                        +{tagList.length - 3}
                      </span>
                    </TooltipTrigger>
                    <TooltipContent side="bottom" className="text-xs font-mono">
                      {tagList.slice(3).map(t => t.label).join(', ')}
                    </TooltipContent>
                  </Tooltip>
                )}
                {node.hidden && (
                  <span className="text-xxs font-mono text-warning/85 bg-warning/15 px-1.5 py-0.5 rounded-sm shrink-0">
                    {t('node.hidden')}
                  </span>
                )}
                {expiryStatus && (
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <span
                        className={cn(
                          'text-xxs font-mono px-1.5 py-0.5 rounded-sm cursor-default shrink-0',
                          expiryStatus === 'expired'
                            ? 'text-destructive/85 bg-destructive/15'
                            : expiryStatus === 'warning'
                              ? 'text-warning/85 bg-warning/15'
                              : 'text-muted-foreground/55 bg-muted/35',
                        )}
                      >
                        {formatExpiry(node.expired_at)}
                      </span>
                    </TooltipTrigger>
                    <TooltipContent side="bottom" className="whitespace-pre-line text-xs font-mono">
                      {isLoggedIn
                        ? t('label.expiryTooltipDetail', {
                            date: dayjs(node.expired_at).format('YYYY-MM-DD HH:mm'),
                            cycle: node.billing_cycle ?? '-',
                            renewal: node.auto_renewal ? t('label.yes') : t('label.no'),
                            price: node.price === -1 ? t('label.free') : node.price === 0 ? t('label.notSet') : `${node.currency}${node.price}`,
                          })
                        : t('label.expiryTooltip', {
                            date: dayjs(node.expired_at).format('YYYY-MM-DD HH:mm'),
                          })
                      }
                    </TooltipContent>
                  </Tooltip>
                )}
              </div>
            )}

            {/* Row 3: platform identity. Resource totals live in metric columns. */}
            {platformLine && (
              <div className="min-w-0 space-y-1 text-xs text-muted-foreground/65">
                <Tooltip>
                  <TooltipTrigger asChild>
                    <span className="inline-flex max-w-full min-w-0 items-center gap-1 cursor-default">
                      <SystemIcon kind="os" value={node.os} className="h-2.5 w-2.5 shrink-0 opacity-70" />
                      <span className="min-w-0 truncate">{platformLine}</span>
                    </span>
                  </TooltipTrigger>
                  <TooltipContent side="bottom" className="max-w-xs text-xs font-mono whitespace-pre-line">
                    {[node.os && `OS: ${node.os}`, node.arch && `Arch: ${node.arch}`, node.virtualization && `Virt: ${node.virtualization}`, node.kernel_version && `Kernel: ${node.kernel_version}`].filter(Boolean).join('\n')}
                  </TooltipContent>
                </Tooltip>
              </div>
            )}
          </div>
        );
      },
    }),

    columnHelper.accessor(
      row => row.stats?.cpu?.usage ?? 0,
      {
        id: 'cpu',
        header: t('label.cpu'),
        size: 150,
        enableSorting: true,
        cell: ({ row }) => {
          const stats = row.original.stats;
          if (!stats) return <span className="text-xs font-metric text-muted-foreground/30">—</span>;
          const val = stats.cpu.usage;
          return (
            <UsageCell
              value={val}
              status={getUsageStatus(val, { warning: 60, critical: 80 }) as GaugeStatus}
              channel="cpu"
              sparkline={isLoggedIn ? getCpuSparkline(row.original.uuid) : null}
              sub={`${row.original.cpu_cores || 1}C`}
            />
          );
        },
      }
    ),

    columnHelper.accessor(
      row => row.stats ? (row.stats.ram.used / row.stats.ram.total) * 100 : 0,
      {
        id: 'ram',
        header: t('label.ram'),
        size: 120,
        enableSorting: true,
        cell: ({ row }) => {
          const stats = row.original.stats;
          if (!stats) return <span className="text-xs font-metric text-muted-foreground/30">—</span>;
          const val = (stats.ram.used / stats.ram.total) * 100;
          return <UsageCell value={val} status={getUsageStatus(val, { warning: 70, critical: 85 }) as GaugeStatus} channel="ram" sub={formatBytes(stats.ram.total)} />;
        },
      }
    ),

    columnHelper.accessor(
      row => row.stats ? (row.stats.disk.used / row.stats.disk.total) * 100 : 0,
      {
        id: 'disk',
        header: t('label.disk'),
        size: 120,
        enableSorting: true,
        cell: ({ row }) => {
          const stats = row.original.stats;
          if (!stats) return <span className="text-xs font-metric text-muted-foreground/30">—</span>;
          const val = (stats.disk.used / stats.disk.total) * 100;
          return <UsageCell value={val} status={getUsageStatus(val, { warning: 75, critical: 90 }) as GaugeStatus} channel="disk" sub={formatBytes(stats.disk.total)} />;
        },
      }
    ),

    columnHelper.accessor(
      row => row.stats?.load?.load1 ?? 0,
      {
        id: 'load',
        header: t('label.load'),
        size: 90,
        enableSorting: true,
        cell: ({ row }) => {
          const stats = row.original.stats;
          if (!stats) return <span className="text-xs font-metric text-muted-foreground/30">—</span>;
          const cores = row.original.cpu_cores || 1;
          const ratio = stats.load.load1 / cores;
          const loadStatus = ratio >= 1.5 ? 'critical' : ratio >= 1 ? 'warning' : 'normal';
          return (
            <span className={cn('inline-block text-xs font-metric tabular-nums whitespace-nowrap text-right w-12', textByStatus[loadStatus])}>
              {stats.load.load1.toFixed(2)}
            </span>
          );
        },
      }
    ),

    columnHelper.accessor(
      row => {
        const stats = row.stats;
        if (!stats) return 0;
        return stats.network.up + stats.network.down;
      },
      {
        id: 'network',
        header: t('label.network'),
        size: 240,
        enableSorting: true,
        cell: ({ row }) => <NetworkCell node={row.original} t={t} />,
      }
    ),

    columnHelper.accessor(
      row => row.stats?.uptime ?? 0,
      {
        id: 'uptime',
        header: t('label.uptime'),
        size: 90,
        enableSorting: true,
        cell: ({ row }) => {
          const stats = row.original.stats;
          if (!stats) return <span className="text-xs font-metric text-muted-foreground/30">—</span>;
          return (
            <span className="text-xs font-metric tabular-nums whitespace-nowrap">
              {formatUptime(stats.uptime)}
            </span>
          );
        },
      }
    ),

  ], [getCpuSparkline, openNode, t, isLoggedIn]);

  const table = useReactTable({
    data: nodes,
    columns,
    state: { sorting },
    onSortingChange: setSorting,
    getCoreRowModel: getCoreRowModel(),
    getSortedRowModel: getSortedRowModel(),
  });
  const tableRows = table.getRowModel().rows;

  const rowVirtualizer = useWindowVirtualizer({
    count: tableRows.length,
    estimateSize: () => (isCompactLayout ? 150 : 60),
    overscan: isCompactLayout ? 5 : 10,
    scrollMargin,
  });

  useEffect(() => {
    rowVirtualizer.measure();
  }, [isCompactLayout, rowVirtualizer]);

  const virtualRows = rowVirtualizer.getVirtualItems();
  const firstVirtualRow = virtualRows[0];
  const lastVirtualRow = virtualRows[virtualRows.length - 1];
  const topPadding = firstVirtualRow ? Math.max(0, firstVirtualRow.start - scrollMargin) : 0;
  const bottomPadding = lastVirtualRow
    ? Math.max(0, rowVirtualizer.getTotalSize() - (lastVirtualRow.end - scrollMargin))
    : 0;

  return (
    <div className="rounded-lg border border-border/45 bg-card/70 overflow-hidden commander-corners commander-corners-soft relative">
      <div className="commander-scanner-effect commander-scanner-soft" />
      <span className="corner-bottom" />

      {/* Console Header Decoration */}
      <div className="console-header-decoration flex items-center justify-between px-3 py-1.5 border-b border-border/25 bg-foreground/[0.025] type-hud-label-sm tracking-widest text-muted-foreground/40 relative z-10">
        <div className="flex items-center gap-2">
          <div className="w-1.5 h-1.5 rounded-full bg-primary/30" />
          <span>{t('hud.tableMode')}</span>
        </div>
        <div className="flex items-center gap-4">
          <span>{t('hud.parityOk')}</span>
          <span>{t('hud.bwidthNominal')}</span>
        </div>
      </div>

      <div ref={bodyRef} className="relative z-10">
        {!isCompactLayout ? (
          <div className="overflow-x-auto">
            <table className="w-full table-fixed">
              <thead>
                {table.getHeaderGroups().map(headerGroup => (
                  <tr key={headerGroup.id} className="sticky top-0 z-20 border-b border-border/35 bg-card/90">
                    {headerGroup.headers.map((header, hIdx) => {
                      const isGroupStart = ['cpu', 'network', 'uptime'].includes(header.column.id);

                      return (
                      <th
                        key={header.id}
                        className={cn(
                          'type-hud-column py-2.5 overflow-hidden',
                          hIdx === 0 ? 'px-1 text-center' : 'px-3 text-left',
                          isGroupStart && 'pl-5 lg:pl-8', // Spacer gutter
                          header.column.getCanSort() && 'cursor-pointer select-none hover:text-primary transition-colors',
                          compactColumnClass(header.column.id),
                        )}
                        style={{ width: header.getSize() === 999 ? undefined : header.getSize() }}
                        onClick={header.column.getToggleSortingHandler()}
                      >
                        <div className={cn('flex items-center gap-1', hIdx === 0 && 'justify-center')}>
                          {header.isPlaceholder ? null : flexRender(header.column.columnDef.header, header.getContext())}
                          {header.column.getCanSort() && (
                            <SortIcon sorted={header.column.getIsSorted()} />
                          )}
                        </div>
                      </th>
                    )})}
                  </tr>
                ))}
              </thead>
              <tbody>
                {topPadding > 0 && (
                  <tr aria-hidden="true">
                    <td colSpan={columns.length} style={{ height: topPadding, padding: 0 }} />
                  </tr>
                )}
                {virtualRows.map((virtualRow) => {
                  const row = tableRows[virtualRow.index];
                  if (!row) return null;
                  return (
                    <DesktopRow
                      key={row.id}
                      row={row}
                      isLast={virtualRow.index === tableRows.length - 1}
                    />
                  );
                })}
                {bottomPadding > 0 && (
                  <tr aria-hidden="true">
                    <td colSpan={columns.length} style={{ height: bottomPadding, padding: 0 }} />
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        ) : (
          <div>
            {topPadding > 0 && <div aria-hidden="true" style={{ height: topPadding }} />}
            {virtualRows.map((virtualRow) => {
              const row = tableRows[virtualRow.index];
              if (!row) return null;
              return (
                <div
                  key={row.id}
                  ref={rowVirtualizer.measureElement}
                  data-index={virtualRow.index}
                >
                  <MobileRow
                    node={row.original}
                    isLast={virtualRow.index === tableRows.length - 1}
                    onOpen={openNode}
                    t={t}
                    isLoggedIn={isLoggedIn}
                  />
                </div>
              );
            })}
            {bottomPadding > 0 && <div aria-hidden="true" style={{ height: bottomPadding }} />}
          </div>
        )}
      </div>
    </div>
  );
}
