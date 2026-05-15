import { useMemo, memo, useState, useCallback } from 'react';
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
import { useNavigate } from 'react-router-dom';
import { useAppConfig } from '@/hooks/useAppConfig';
import { Progress } from './ui/progress';
import { Sparkline } from './Sparkline';
import { ArrowUpDown, ArrowUp, ArrowDown } from 'lucide-react';
import { SystemIcon } from '@/lib/systemIcon';
import type { NodeWithStatus } from '@/services/api';
import { useRecentStats } from '@/hooks/useRecentStats';
import { formatSpeed, formatSpeedParts, formatUptime, formatBytes, getUsageStatus, calcTrafficUsage, formatTrafficType, getExpiryStatus, formatExpiry, cn } from '@/lib/utils';
import type { TrafficLimitType } from '@/lib/utils';
import { Tooltip, TooltipTrigger, TooltipContent } from './ui/tooltip';
import { RegionFlag } from './RegionFlag';
import dayjs from 'dayjs';

interface NodeTableProps {
  nodes: NodeWithStatus[];
}

// Status -> usage bar fill / overlay text color
const fillByStatus: Record<string, string> = {
  critical: 'bg-destructive/75',
  warning: 'bg-warning/70',
  normal: 'bg-primary/55',
};

const textByStatus: Record<string, string> = {
  critical: 'text-destructive',
  warning: 'text-warning',
  normal: '',
};

function UsageCell({ value, status }: { value: number; status: string }) {
  return (
    <div className="relative w-full min-w-22">
      <Progress
        value={Math.min(value, 100)}
        className="h-5 bg-muted/25 rounded"
        indicatorClassName={cn('rounded transition-transform duration-500 ease-out', fillByStatus[status] || 'bg-primary/55')}
      />
      <span
        className={cn(
          'absolute inset-0 flex items-center justify-center text-xs font-metric font-bold',
          status === 'normal' ? 'text-foreground' : textByStatus[status],
        )}
      >
        {value.toFixed(1)}%
      </span>
    </div>
  );
}

const columnHelper = createColumnHelper<NodeWithStatus>();

function SortIcon({ sorted }: { sorted: false | 'asc' | 'desc' }) {
  if (!sorted) return <ArrowUpDown className="h-3 w-3 opacity-30" />;
  if (sorted === 'asc') return <ArrowUp className="h-3 w-3 text-primary" />;
  return <ArrowDown className="h-3 w-3 text-primary" />;
}

/* ──────────────────────────────────────────────────────────────
   Memoised row renderers
   Each WS tick the parent receives a fresh `nodes` array, but the
   *individual* node references stay stable when their stats didn't
   change (see useNodes.ts). Wrapping rows in `memo` keyed on the
   node reference lets unchanged rows skip render entirely — without
   this, react-table walks every cell of every row on every tick.
   ────────────────────────────────────────────────────────────── */
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
        'group transition-colors hover:bg-primary/10',
        !isLast && 'border-b border-border/20',
        !isOnline && 'opacity-45',
        isCritical && 'bg-destructive/4',
      )}
      style={{ height: 64 }}
    >
      {row.getVisibleCells().map((cell, cellIdx) => (
        <td
          key={cell.id}
          className={cn(
            'py-3 align-middle relative',
            cellIdx === 0 ? 'px-1 text-center' : 'px-3',
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
      ))}
    </tr>
  );
}, (prev, next) =>
  // Re-render only when the underlying node reference, position-in-list,
  // or column model changes. `row` is a fresh object every tick, but
  // `row.original` is stable when stats are equivalent.
  prev.row.original === next.row.original &&
  prev.isLast === next.isLast &&
  prev.row.getVisibleCells().length === next.row.getVisibleCells().length,
);

interface MobileRowProps {
  node: NodeWithStatus;
  isLast: boolean;
  onOpen: (uuid: string) => void;
  t: (k: string, p?: Record<string, unknown>) => string;
}

const MobileRow = memo(function MobileRow({ node, isLast, onOpen, t }: MobileRowProps) {
  const isOnline = node.status === 'online';
  const stats = node.stats;
  const cpuUsage = stats?.cpu?.usage ?? 0;
  const ramUsage = stats ? (stats.ram.used / stats.ram.total) * 100 : 0;
  const diskUsage = stats ? (stats.disk.used / stats.disk.total) * 100 : 0;
  const cores = node.cpu_cores || 1;
  const loadRatio = stats ? stats.load.load1 / cores : 0;
  const loadStatus = loadRatio >= 1.5 ? 'critical' : loadRatio >= 1 ? 'warning' : 'normal';
  const tagList = node.tags ? node.tags.split(/[,;]/).map(s => s.trim()).filter(Boolean) : [];

  return (
    <div
      className={cn(
        'px-3 py-3 space-y-2 transition-colors hover:bg-primary/10',
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
            className="text-base font-display font-bold truncate cursor-pointer text-foreground hover:text-primary hover:underline underline-offset-4 decoration-primary/40 transition-colors text-left"
            onClick={() => onOpen(node.uuid)}
          >{node.name}</button>
        </div>
        {(node.group || tagList.length > 0 || node.hidden) && (
          <div className="flex flex-wrap items-center gap-1 ml-4">
            {node.group && (
              <span className="text-xxs font-mono text-primary/85 bg-primary/15 px-1.5 py-0.5 rounded-sm">
                {node.group}
              </span>
            )}
            {tagList.slice(0, 5).map((tag, i) => (
              <span key={i} className="text-xxs font-mono text-muted-foreground/70 bg-muted/45 px-1.5 py-0.5 rounded-sm">
                {tag}
              </span>
            ))}
            {tagList.length > 5 && (
              <Tooltip>
                <TooltipTrigger asChild>
                  <span className="text-xxs font-mono text-muted-foreground/55 bg-muted/35 px-1.5 py-0.5 rounded-sm cursor-default">
                    +{tagList.length - 5}
                  </span>
                </TooltipTrigger>
                <TooltipContent side="bottom" className="text-xs font-mono">
                  {tagList.slice(5).join(', ')}
                </TooltipContent>
              </Tooltip>
            )}
            {node.hidden && (
              <span className="text-xxs font-mono text-warning/85 bg-warning/15 px-1.5 py-0.5 rounded-sm">
                {t('node.hidden')}
              </span>
            )}
          </div>
        )}
      </div>
      {stats && (
        <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs font-metric text-muted-foreground ml-4 tabular-nums">
          <span className={cn('whitespace-nowrap', textByStatus[getUsageStatus(cpuUsage, { warning: 60, critical: 80 })])}>{t('label.cpu')} {cpuUsage.toFixed(0).padStart(2, '0')}%</span>
          <span className={cn('whitespace-nowrap', textByStatus[getUsageStatus(ramUsage, { warning: 70, critical: 85 })])}>{t('label.ram')} {ramUsage.toFixed(0).padStart(2, '0')}%</span>
          <span className={cn('whitespace-nowrap', textByStatus[getUsageStatus(diskUsage, { warning: 75, critical: 90 })])}>{t('label.disk')} {diskUsage.toFixed(0).padStart(2, '0')}%</span>
          <span className="whitespace-nowrap"><span className="text-success/70 mr-1">↑</span>{formatSpeed(stats.network.up)}</span>
          <span className="whitespace-nowrap"><span className="text-primary/70 mr-1">↓</span>{formatSpeed(stats.network.down)}</span>
          <span className={cn('whitespace-nowrap', textByStatus[loadStatus])}>{t('label.load')} {stats.load.load1.toFixed(2)}</span>
          <span className="whitespace-nowrap">{formatUptime(stats.uptime)}</span>
        </div>
      )}
    </div>
  );
}, (prev, next) =>
  prev.node === next.node &&
  prev.isLast === next.isLast &&
  prev.onOpen === next.onOpen &&
  prev.t === next.t,
);

export function NodeTable({ nodes }: NodeTableProps) {
  const { t } = useTranslation();
  const [sorting, setSorting] = useState<SortingState>([]);
  const { getCpuSparkline } = useRecentStats();
  const { isLoggedIn } = useAppConfig();
  const navigate = useNavigate();
  const openNode = useCallback((uuid: string) => navigate(`/node/${uuid}`), [navigate]);

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
        const isFree = node.price === -1;
        const expiryStatus = (isFree || !isLoggedIn) ? null : getExpiryStatus(node.expired_at);
        const hasTraffic = !!(node.traffic_limit && node.traffic_limit > 0 && node.traffic_limit_type && node.traffic_limit_type !== 'no_limit');
        const trafficUsed = hasTraffic && node.stats
          ? calcTrafficUsage(node.stats.network.totalUp, node.stats.network.totalDown, node.traffic_limit_type as TrafficLimitType)
          : 0;
        const trafficPct = hasTraffic ? (trafficUsed / node.traffic_limit!) * 100 : 0;
        const trafficUrgent = trafficPct >= 70;
        const expiryUrgent = expiryStatus === 'expired' || expiryStatus === 'warning';
        const tagList = node.tags ? node.tags.split(/[,;]/).map(t => t.trim()).filter(Boolean) : [];

        return (
          <div className="min-w-0 space-y-1">
            {/* Row 1: flag · node name */}
            <div className="flex items-center gap-2 min-w-0">
              <RegionFlag region={node.region} size="sm" />
              <button
                type="button"
                className="text-base font-display font-bold truncate cursor-pointer text-foreground hover:text-primary hover:underline underline-offset-4 decoration-primary/40 transition-colors text-left"
                onClick={() => openNode(node.uuid)}
              >
                {node.name}
              </button>
            </div>

            {/* Row 2: group + tags + hidden */}
            {(node.group || tagList.length > 0 || node.hidden) && (
              <div className="flex flex-wrap items-center gap-1">
                {node.group && (
                  <span className="text-xxs font-mono text-primary/85 bg-primary/15 px-1.5 py-0.5 rounded-sm shrink-0">
                    {node.group}
                  </span>
                )}
                {tagList.slice(0, 4).map((tag, i) => (
                  <span key={i} className="text-xxs font-mono text-muted-foreground/70 bg-muted/45 px-1.5 py-0.5 rounded-sm shrink-0">
                    {tag}
                  </span>
                ))}
                {tagList.length > 4 && (
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <span className="text-xxs font-mono text-muted-foreground/55 bg-muted/35 px-1.5 py-0.5 rounded-sm cursor-default shrink-0">
                        +{tagList.length - 4}
                      </span>
                    </TooltipTrigger>
                    <TooltipContent side="bottom" className="text-xs font-mono">
                      {tagList.slice(4).join(', ')}
                    </TooltipContent>
                  </Tooltip>
                )}
                {node.hidden && (
                  <span className="text-xxs font-mono text-warning/85 bg-warning/15 px-1.5 py-0.5 rounded-sm shrink-0">
                    {t('node.hidden')}
                  </span>
                )}
              </div>
            )}

            {/* Row 3: system info · traffic · expiry — unified to /50, only urgent states pop */}
            {node.stats && (
              <div className="flex items-center gap-2 text-xxs font-mono text-muted-foreground/50 truncate">
                <Tooltip>
                  <TooltipTrigger asChild>
                    <span className="inline-flex items-center gap-1 truncate cursor-default">
                      <SystemIcon kind="os" value={node.os} className="h-2.5 w-2.5 shrink-0 opacity-70" />
                      <span className="truncate">{node.os} · {node.cpu_cores}C · {formatBytes(node.stats.ram.total)}</span>
                    </span>
                  </TooltipTrigger>
                  <TooltipContent side="bottom" className="max-w-xs text-xs font-mono whitespace-pre-line">
                    {[node.cpu_name && `CPU: ${node.cpu_name} (${node.cpu_cores}C)`, node.os && `OS: ${node.os}`, node.arch && `Arch: ${node.arch}`, node.virtualization && `Virt: ${node.virtualization}`, `RAM: ${formatBytes(node.stats.ram.total)}`].filter(Boolean).join('\n')}
                  </TooltipContent>
                </Tooltip>
                {hasTraffic && (
                  <>
                    <span className="text-muted-foreground/25">·</span>
                    <span
                      className={cn(
                        'font-metric shrink-0',
                        trafficUrgent
                          ? trafficPct >= 90
                            ? 'text-destructive'
                            : 'text-warning'
                          : '',
                      )}
                    >
                      {formatTrafficType(node.traffic_limit_type!)} {formatBytes(trafficUsed)}/{formatBytes(node.traffic_limit!)}
                    </span>
                  </>
                )}
                {expiryStatus && (
                  <>
                    <span className="text-muted-foreground/25">·</span>
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <span
                          className={cn(
                            'font-metric cursor-default shrink-0',
                            expiryUrgent
                              ? expiryStatus === 'expired'
                                ? 'text-destructive'
                                : 'text-warning'
                              : '',
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
                  </>
                )}
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
        size: 120,
        enableSorting: true,
        cell: ({ row }) => {
          const stats = row.original.stats;
          if (!stats) return <span className="text-xs font-metric text-muted-foreground/30">—</span>;
          const val = stats.cpu.usage;
          return <UsageCell value={val} status={getUsageStatus(val, { warning: 60, critical: 80 })} />;
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
          return <UsageCell value={val} status={getUsageStatus(val, { warning: 70, critical: 85 })} />;
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
          return <UsageCell value={val} status={getUsageStatus(val, { warning: 75, critical: 90 })} />;
        },
      }
    ),

    columnHelper.accessor(
      row => (row.stats?.network?.up ?? 0) + (row.stats?.network?.down ?? 0),
      {
        id: 'network',
        header: t('label.network'),
        size: 130,
        enableSorting: true,
        cell: ({ row }) => {
          const stats = row.original.stats;
          if (!stats) return <span className="text-sm font-metric text-muted-foreground/30">—</span>;
          const up = formatSpeedParts(stats.network.up);
          const down = formatSpeedParts(stats.network.down);
          // Fixed-width numeric cell + fixed-width unit cell so row height/width
          // stays stable regardless of the value's order of magnitude.
          return (
            <div className="text-xs font-metric leading-tight tabular-nums whitespace-nowrap">
              <div className="flex items-center gap-1">
                <span className="text-success/70 w-3 text-center shrink-0">↑</span>
                <span className="w-10 text-right shrink-0">{up.value}</span>
                <span className="w-9 text-left text-muted-foreground/70 shrink-0">{up.unit}</span>
              </div>
              <div className="flex items-center gap-1">
                <span className="text-primary/70 w-3 text-center shrink-0">↓</span>
                <span className="w-10 text-right shrink-0">{down.value}</span>
                <span className="w-9 text-left text-muted-foreground/70 shrink-0">{down.unit}</span>
              </div>
            </div>
          );
        },
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

    columnHelper.display({
      id: 'sparkline',
      header: 'TREND',
      size: 80,
      cell: ({ row }) => {
        const node = row.original;
        if (node.status !== 'online') {
          return (
            <div className="w-16 h-4.5 flex items-center" aria-hidden>
              <div className="w-full border-t border-dashed border-muted-foreground/20" />
            </div>
          );
        }
        const data = getCpuSparkline(node.uuid);
        if (!data) return <span className="text-xs font-metric text-muted-foreground/30">—</span>;
        return <Sparkline data={data} width={64} height={18} />;
      },
    }),

  ], [getCpuSparkline, openNode, t, isLoggedIn]);

  const table = useReactTable({
    data: nodes,
    columns,
    state: { sorting },
    onSortingChange: setSorting,
    getCoreRowModel: getCoreRowModel(),
    getSortedRowModel: getSortedRowModel(),
  });

  return (
    <div className="rounded-lg border border-border/50 bg-card/80 backdrop-blur-xl overflow-hidden commander-corners commander-corners-soft relative">
      <div className="commander-scanner-effect commander-scanner-soft" />
      <span className="corner-bottom" />

      {/* Console Header Decoration */}
      <div className="console-header-decoration flex items-center justify-between px-3 py-1.5 border-b border-border/30 bg-muted/10 text-xxs font-mono text-muted-foreground/40 uppercase tracking-[0.2em] relative z-10">
        <div className="flex items-center gap-2">
          <div className="w-1.5 h-1.5 rounded-full bg-primary/30" />
          <span>{t('hud.tableMode')}</span>
        </div>
        <div className="flex items-center gap-4">
          <span>{t('hud.parityOk')}</span>
          <span>{t('hud.bwidthNominal')}</span>
        </div>
      </div>

      {/* Desktop table */}
      <div className="hidden lg:block overflow-x-auto relative z-10">
        <table className="w-full">
          <thead>
            {table.getHeaderGroups().map(headerGroup => (
              <tr key={headerGroup.id} className="border-b border-border/40 bg-muted/15 relative">
                {headerGroup.headers.map((header, hIdx) => (
                  <th
                    key={header.id}
                    className={cn(
                      'py-2.5 text-xxs font-mono font-bold text-muted-foreground/55 uppercase tracking-[0.18em]',
                      hIdx === 0 ? 'px-1 text-center' : 'px-3 text-left',
                      header.column.getCanSort() && 'cursor-pointer select-none hover:text-primary transition-colors'
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
                ))}
              </tr>
            ))}
          </thead>
          <tbody>
            {table.getRowModel().rows.map((row, idx, arr) => (
              <DesktopRow
                key={row.id}
                row={row}
                isLast={idx === arr.length - 1}
              />
            ))}
          </tbody>
        </table>
      </div>

      {/* Mobile / Tablet layout */}
      <div className="lg:hidden relative z-10">
        {table.getRowModel().rows.map((row, idx, arr) => (
          <MobileRow
            key={row.id}
            node={row.original}
            isLast={idx === arr.length - 1}
            onOpen={openNode}
            t={t}
          />
        ))}
      </div>
    </div>
  );
}
