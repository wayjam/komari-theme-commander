import { useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import {
  useReactTable,
  getCoreRowModel,
  getSortedRowModel,
  flexRender,
  createColumnHelper,
  type SortingState,
} from '@tanstack/react-table';
import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAppConfig } from '@/hooks/useAppConfig';
import { Progress } from './ui/progress';
import { Sparkline } from './Sparkline';
import { ArrowUpDown, ArrowUp, ArrowDown } from 'lucide-react';
import type { NodeWithStatus } from '@/services/api';
import { useRecentStats } from '@/hooks/useRecentStats';
import { formatSpeed, formatUptime, formatBytes, getUsageStatus, calcTrafficUsage, formatTrafficType, getExpiryStatus, formatExpiry, cn } from '@/lib/utils';
import type { TrafficLimitType } from '@/lib/utils';
import { Tooltip, TooltipTrigger, TooltipContent } from './ui/tooltip';

interface NodeTableProps {
  nodes: NodeWithStatus[];
  onViewCharts?: (nodeUuid: string, nodeName: string) => void;
}

const borderColor: Record<string, string> = {
  critical: 'border-red-500/70',
  warning: 'border-yellow-500/70',
  normal: 'border-transparent',
};

const textColor: Record<string, string> = {
  critical: 'text-red-500',
  warning: 'text-yellow-500',
  normal: '',
};

function UsageCell({ value, status }: { value: number; status: string }) {
  return (
    <div className={cn('relative w-full min-w-[80px] rounded border', borderColor[status] || 'border-transparent')}>
      <Progress
        value={Math.min(value, 100)}
        className="h-5 bg-muted/20 rounded"
        indicatorClassName="rounded transition-all duration-500 bg-primary/60"
      />
      <span className="absolute inset-0 flex items-center justify-center text-xs font-mono font-bold tabular-nums text-foreground">
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

export function NodeTable({ nodes }: NodeTableProps) {
  const { t } = useTranslation();
  const [sorting, setSorting] = useState<SortingState>([]);
  const { getCpuSparkline } = useRecentStats();
  const { isLoggedIn } = useAppConfig();
  const navigate = useNavigate();

  const columns = useMemo(() => [
    columnHelper.accessor('status', {
      header: t('table.status'),
      size: 80,
      enableSorting: true,
      sortingFn: (rowA, rowB) => {
        const a = rowA.original.status === 'online' ? 1 : 0;
        const b = rowB.original.status === 'online' ? 1 : 0;
        return a - b;
      },
      cell: ({ row }) => {
        const isOnline = row.original.status === 'online';
        return (
          <div className="flex items-center gap-1.5">
            <span className={cn(
              'w-1.5 h-1.5 rounded-full',
              isOnline ? 'bg-green-500 animate-pulse' : 'bg-red-500'
            )} />
            <span className={cn(
              'text-xs font-mono font-bold',
              isOnline ? 'text-green-500' : 'text-red-500'
            )}>
              {isOnline ? t('status.on') : t('status.off')}
            </span>
          </div>
        );
      },
    }),

    columnHelper.accessor('name', {
      header: t('table.node'),
      size: 250,
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
        const tagList = node.tags ? node.tags.split(/[,;]/).map(t => t.trim()).filter(Boolean) : [];

        return (
          <div className="min-w-0 space-y-0.5">
            {/* Node name row */}
            <div className="flex items-center gap-2 flex-wrap">
              <span
                className="text-base font-display font-bold truncate cursor-pointer hover:text-primary transition-colors"
                onClick={() => navigate(`/node/${node.uuid}`)}
              >{node.name}</span>
              <span className="text-xs font-mono text-muted-foreground/60">{node.region}</span>
              {node.group && (
                <span className="text-xs font-mono text-primary/80 bg-primary/15 px-1.5 py-0.5 rounded-sm">
                  {node.group}
                </span>
              )}
              {tagList.map((tag, i) => (
                <span key={i} className="text-xs font-mono text-muted-foreground/80 bg-muted/50 px-1.5 py-0.5 rounded-sm">
                  {tag}
                </span>
              ))}
              {node.hidden && (
                <span className="text-xs font-mono text-yellow-500/80 bg-yellow-500/15 px-1.5 py-0.5 rounded-sm">
                  {t('node.hidden')}
                </span>
              )}
            </div>
            {/* System info row */}
            {node.stats && (
              <Tooltip>
                <TooltipTrigger asChild>
                  <div className="text-xs font-mono text-muted-foreground/50 truncate cursor-default">
                    {node.os} · {node.cpu_cores}C · {formatBytes(node.stats.ram.total)}
                  </div>
                </TooltipTrigger>
                <TooltipContent side="bottom" className="max-w-xs text-xs font-mono whitespace-pre-line">
                  {[node.cpu_name && `CPU: ${node.cpu_name} (${node.cpu_cores}C)`, node.os && `OS: ${node.os}`, node.arch && `Arch: ${node.arch}`, node.virtualization && `Virt: ${node.virtualization}`, `RAM: ${formatBytes(node.stats.ram.total)}`].filter(Boolean).join('\n')}
                </TooltipContent>
              </Tooltip>
            )}
            {/* Traffic & expiry row */}
            <div className="flex items-center gap-3">
              {hasTraffic && node.stats && (
                <span className={cn(
                  'text-xs font-mono',
                  trafficPct >= 90 ? 'text-red-500' : trafficPct >= 70 ? 'text-yellow-500' : 'text-muted-foreground/40',
                )}>
                  {formatTrafficType(node.traffic_limit_type!)} {formatBytes(trafficUsed)}/{formatBytes(node.traffic_limit!)}
                </span>
              )}
              {expiryStatus && (
                <span className={cn(
                  'text-xs font-mono',
                  expiryStatus === 'expired' ? 'text-red-500' : expiryStatus === 'warning' ? 'text-yellow-500' : 'text-muted-foreground/40',
                )}>
                  {formatExpiry(node.expired_at)}
                </span>
              )}
            </div>
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
          if (!stats) return <span className="text-xs font-mono text-muted-foreground/30">—</span>;
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
          if (!stats) return <span className="text-xs font-mono text-muted-foreground/30">—</span>;
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
          if (!stats) return <span className="text-xs font-mono text-muted-foreground/30">—</span>;
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
        size: 120,
        enableSorting: true,
        cell: ({ row }) => {
          const stats = row.original.stats;
          if (!stats) return <span className="text-sm font-mono text-muted-foreground/30">—</span>;
          return (
            <div className="text-xs font-mono tabular-nums leading-tight">
              <div><span className="text-green-500/70">↑</span>{formatSpeed(stats.network.up)}</div>
              <div><span className="text-blue-400/70">↓</span>{formatSpeed(stats.network.down)}</div>
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
        size: 80,
        enableSorting: true,
        cell: ({ row }) => {
          const stats = row.original.stats;
          if (!stats) return <span className="text-xs font-mono text-muted-foreground/30">—</span>;
          return <span className="text-xs font-mono tabular-nums">{formatUptime(stats.uptime)}</span>;
        },
      }
    ),

    columnHelper.accessor(
      row => row.stats?.load?.load1 ?? 0,
      {
        id: 'load',
        header: t('label.load'),
        size: 100,
        enableSorting: true,
        cell: ({ row }) => {
          const stats = row.original.stats;
          if (!stats) return <span className="text-xs font-mono text-muted-foreground/30">—</span>;
          return <span className="text-xs font-mono tabular-nums">{stats.load.load1.toFixed(2)}</span>;
        },
      }
    ),

    columnHelper.display({
      id: 'sparkline',
      header: '',
      size: 80,
      cell: ({ row }) => {
        const node = row.original;
        if (node.status !== 'online') return null;
        const data = getCpuSparkline(node.uuid);
        if (!data) return null;
        return <Sparkline data={data} width={64} height={18} />;
      },
    }),

  ], [getCpuSparkline, navigate, t]);

  const table = useReactTable({
    data: nodes,
    columns,
    state: { sorting },
    onSortingChange: setSorting,
    getCoreRowModel: getCoreRowModel(),
    getSortedRowModel: getSortedRowModel(),
  });

  return (
    <div className="rounded-lg border border-border/50 bg-card/80 backdrop-blur-xl overflow-hidden commander-corners relative">
      <div className="commander-scanner-effect" />
      <span className="corner-bottom" />
      
      {/* Console Header Decoration */}
      <div className="flex items-center justify-between px-3 py-1 border-b border-border/30 bg-muted/10 text-xxs font-mono text-muted-foreground/40 uppercase tracking-[0.2em] relative z-10">
        <div className="flex items-center gap-2">
          <div className="w-1.5 h-1.5 rounded-full bg-primary/30" />
          <span>Table View Mode :: Data Stream Alpha-4</span>
        </div>
        <div className="flex items-center gap-4">
          <span>PARITY: OK</span>
          <span>BWIDTH: NOMINAL</span>
        </div>
      </div>

      {/* Desktop table */}
      <div className="hidden lg:block overflow-x-auto relative z-10">
        <table className="w-full">
          <thead>
            {table.getHeaderGroups().map(headerGroup => (
              <tr key={headerGroup.id} className="border-b border-border/40 bg-muted/15 relative">
                {headerGroup.headers.map(header => (
                  <th
                    key={header.id}
                    className={cn(
                      'px-3 py-2.5 text-left text-xs font-mono font-bold text-muted-foreground/60 uppercase tracking-[0.15em]',
                      header.column.getCanSort() && 'cursor-pointer select-none hover:text-primary transition-colors'
                    )}
                    style={{ width: header.getSize() === 999 ? undefined : header.getSize() }}
                    onClick={header.column.getToggleSortingHandler()}
                  >
                    <div className="flex items-center gap-1">
                      <span className="text-primary opacity-40 mr-0.5">_</span>
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
            {table.getRowModel().rows.map((row, idx) => {
              const isOnline = row.original.status === 'online';
              const stats = row.original.stats;
              const isCritical = stats && (
                (stats.cpu.usage > 80) || 
                (stats.ram.used / stats.ram.total > 0.85) || 
                (stats.disk.used / stats.disk.total > 0.9)
              );
              
              return (
                <tr
                  key={row.id}
                  className={cn(
                    'transition-colors hover:bg-primary/8 group relative',
                    idx !== table.getRowModel().rows.length - 1 && 'border-b border-border/20',
                    !isOnline && 'opacity-45',
                    isCritical && 'bg-red-500/5 hover:bg-red-500/10 animate-pulse-subtle'
                  )}
                >
                  {row.getVisibleCells().map((cell, cellIdx) => (
                    <td
                      key={cell.id}
                      className={cn(
                        'px-3 py-2.5 relative',
                        cellIdx > 0 && 'border-l border-border/10'
                      )}
                    >
                      {cellIdx === 0 && isCritical && (
                        <div className="absolute left-0 top-1/2 -translate-y-1/2 w-[2px] h-3/4 bg-red-500 shadow-[0_0_8px_rgba(239,68,68,0.8)]" />
                      )}
                      {flexRender(cell.column.columnDef.cell, cell.getContext())}
                    </td>
                  ))}
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {/* Mobile / Tablet layout */}
      <div className="lg:hidden relative z-10">
        {table.getRowModel().rows.map((row, idx) => {
          const node = row.original;
          const isOnline = node.status === 'online';
          const stats = node.stats;
          const cpuUsage = stats?.cpu?.usage ?? 0;
          const ramUsage = stats ? (stats.ram.used / stats.ram.total) * 100 : 0;
          const diskUsage = stats ? (stats.disk.used / stats.disk.total) * 100 : 0;
          const tagList = node.tags ? node.tags.split(/[,;]/).map(t => t.trim()).filter(Boolean) : [];

          return (
            <div
              key={row.id}
              className={cn(
                'px-3 py-2.5 space-y-1.5 transition-colors hover:bg-primary/8',
                idx !== table.getRowModel().rows.length - 1 && 'border-b border-border/20',
                !isOnline && 'opacity-45'
              )}
            >
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2 min-w-0">
                  <span className={cn(
                    'w-1.5 h-1.5 rounded-full flex-shrink-0',
                    isOnline ? 'bg-green-500' : 'bg-red-500'
                  )} />
                  <span
                    className="text-base font-display font-bold truncate cursor-pointer hover:text-primary transition-colors"
                    onClick={() => navigate(`/node/${node.uuid}`)}
                  >{node.name}</span>
                  <span className="text-xs font-mono text-muted-foreground/60 flex-shrink-0">{node.region}</span>
                </div>
                <div className="flex items-center gap-1.5 flex-shrink-0">
                  {node.group && (
                    <span className="text-xs font-mono text-primary/80 bg-primary/15 px-1.5 py-0.5 rounded-sm">
                      {node.group}
                    </span>
                  )}
                  {tagList.map((tag, i) => (
                    <span key={i} className="text-xs font-mono text-muted-foreground/80 bg-muted/50 px-1.5 py-0.5 rounded-sm">
                      {tag}
                    </span>
                  ))}
                  {node.hidden && (
                    <span className="text-xs font-mono text-yellow-500/80 bg-yellow-500/15 px-1.5 py-0.5 rounded-sm">
                      {t('node.hidden')}
                    </span>
                  )}
                </div>
              </div>
              {stats && (
                <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs font-mono text-muted-foreground ml-3.5">
                  <span className={textColor[getUsageStatus(cpuUsage, { warning: 60, critical: 80 })]}>{t('label.cpu')} {cpuUsage.toFixed(0)}%</span>
                  <span className={textColor[getUsageStatus(ramUsage, { warning: 70, critical: 85 })]}>{t('label.ram')} {ramUsage.toFixed(0)}%</span>
                  <span className={textColor[getUsageStatus(diskUsage, { warning: 75, critical: 90 })]}>{t('label.disk')} {diskUsage.toFixed(0)}%</span>
                  <span><span className="text-green-500/70">↑</span>{formatSpeed(stats.network.up)}</span>
                  <span><span className="text-blue-400/70">↓</span>{formatSpeed(stats.network.down)}</span>
                  <span>{formatUptime(stats.uptime)}</span>
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
