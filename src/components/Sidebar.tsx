import { useState, useMemo, useRef, useEffect, useCallback, memo } from 'react';
import { useTranslation } from 'react-i18next';
import { useNavigate } from 'react-router-dom';
import { AnimatePresence, motion, useReducedMotion } from 'motion/react';
import { useVirtualizer } from '@tanstack/react-virtual';
import { ArrowLeft, Cpu, HardDrive, MemoryStick, Network, BarChart3, ExternalLink, Server, Layers, Search, X, Activity, MapPin, Terminal, Clock, Gauge } from 'lucide-react';
import { SystemIcon } from '@/lib/systemIcon';
import type { NodeWithStatus } from '@/services/api';
import { Progress } from '@/components/ui/progress';
import { Button } from '@/components/ui/button';
import { cn, extractRegionEmoji, getRegionDisplayName, formatSpeed, formatBytes, formatUptime, getUsageStatus, calcTrafficUsage, formatTrafficType, getExpiryStatus, formatExpiry } from '@/lib/utils';
import type { TrafficLimitType } from '@/lib/utils';
import { useAppConfig } from '@/hooks/useAppConfig';
import dayjs from 'dayjs';
import { Tooltip, TooltipTrigger, TooltipContent } from '@/components/ui/tooltip';
import { RemarkNote } from './RemarkNote';
import { TagPill } from './TagPill';
import { parseTagList } from '@/lib/parseTags';
interface SidebarProps {
  nodes: NodeWithStatus[];
  loading?: boolean;
  selectedNodeId: string | null;
  onSelectNode: (uuid: string | null) => void;
  onViewCharts: (uuid: string, name: string) => void;
  className?: string;
}

const statusColorMap: Record<'normal' | 'warning' | 'critical', string> = {
  normal: '',
  warning: 'bg-warning',
  critical: 'bg-destructive',
};

// ── Threshold: switch to virtualizer before large fleets become DOM-heavy ──
const VIRTUALIZE_THRESHOLD = 80;

// ── Extracted node row content (shared by both plain and virtualized modes) ──
//
// Memoized with a custom comparator: in the globe view, the parent re-renders
// every ~2s as the WebSocket pushes new stats. Without memoization, every row
// would re-render even when only one node's stats actually changed. We compare
// only the fields the row actually displays (status + the live numeric stats
// + selection). Static fields (name, group, tags, region, os/arch) change so
// rarely that we don't bother — when they DO change, the parent's `nodes`
// array reference is replaced anyway, but the per-row prop reference is what
// we gate on, and identity stability there is enough.
function NodeRowContentInner({
  node,
  isSelected,
  onSelectNode,
}: {
  node: NodeWithStatus;
  isSelected: boolean;
  onSelectNode: (uuid: string) => void;
}) {
  const { t } = useTranslation();
  const isOnline = node.status === 'online';
  const stats = node.stats;
  const cpuUsage = stats?.cpu?.usage ?? 0;
  const ramUsage = stats ? (stats.ram.used / stats.ram.total) * 100 : 0;
  const sidebarCpuLine = `${t('label.cpu')} ${cpuUsage.toFixed(0)}%`;
  const sidebarRamLine = `${t('label.ram')} ${ramUsage.toFixed(0)}%`;
  const sidebarNetLine = stats
    ? `↑${formatSpeed(stats.network.up)} ↓${formatSpeed(stats.network.down)}`
    : '';
  const emoji = extractRegionEmoji(node.region);

  const tagList = parseTagList(node.tags);
  const maxVisibleTags = 3;
  const visibleTags = tagList.slice(0, maxVisibleTags);
  const hiddenTagCount = tagList.length - visibleTags.length;

  return (
    <button
      onClick={() => onSelectNode(node.uuid)}
      className={cn(
        'relative w-full px-3 py-2.5 text-left transition-all duration-150 flex flex-col gap-1',
        'border-b border-border/28 bg-transparent cursor-pointer sidebar-node-item',
        'hover:bg-primary/5 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-inset focus-visible:ring-primary/30',
        isSelected && 'bg-primary/8 ring-1 ring-inset ring-primary/20 border-border/35'
      )}
    >
      <div className="flex items-center gap-2">
        <span
          className={cn(
            'w-1.5 h-1.5 rounded-full flex-shrink-0',
            isOnline ? 'bg-success' : 'bg-destructive',
            isOnline && isSelected && 'motion-safe:animate-pulse'
          )}
        />
        <div className="flex-1 min-w-0">
          <div className="flex items-baseline gap-2 min-w-0">
            <span className="node-name text-base truncate shrink-0 max-w-[65%]">{node.name}</span>
            {(node.os || node.arch) && (
              <span className="inline-flex items-center gap-1 text-xs text-muted-foreground/80 truncate min-w-0">
                <SystemIcon kind="os" value={node.os} className="h-3 w-3 shrink-0 opacity-80" />
                <span className="truncate">
                  {[node.os?.split(/[\s/]/)[0], node.arch, node.virtualization].filter(Boolean).join(' · ')}
                </span>
              </span>
            )}
          </div>
        </div>
        {emoji && (
          <span className="text-base flex-shrink-0 leading-none bg-muted/30 rounded-sm px-1 py-0.5 border border-border/20">
            {emoji}
          </span>
        )}
      </div>
      {/* Tags row — show max 3 tags + overflow count */}
      <div className="flex min-w-0 items-center gap-1.5 ml-3.5">
        {node.group && (
          <span className="text-xs font-mono text-primary/80 bg-primary/15 px-1.5 py-0.5 rounded-sm flex-shrink-0">
            {node.group}
          </span>
        )}
        {visibleTags.map((tag, i) => (
          <TagPill
            key={i}
            label={tag.label}
            color={tag.color}
            size="sm"
            className="truncate max-w-[6rem]"
          />
        ))}
        {hiddenTagCount > 0 && (
          <Tooltip>
            <TooltipTrigger asChild>
              <span className="text-xs font-mono text-muted-foreground/60 bg-muted/30 px-1.5 py-0.5 rounded-sm cursor-default flex-shrink-0">
                +{hiddenTagCount}
              </span>
            </TooltipTrigger>
            <TooltipContent side="right" className="text-xs font-mono">
              {tagList.slice(maxVisibleTags).map(t => t.label).join(', ')}
            </TooltipContent>
          </Tooltip>
        )}
        {node.hidden && (
          <span className="text-xs font-mono text-warning/80 bg-warning/15 px-1.5 py-0.5 rounded-sm flex-shrink-0">
            {t('node.hidden')}
          </span>
        )}
      </div>
      {isOnline && stats && (
        <div
          className="ml-3.5 flex min-w-0 items-center gap-1.5 text-xs font-metric text-muted-foreground"
          title={[sidebarCpuLine, sidebarRamLine, sidebarNetLine].filter(Boolean).join(' · ')}
        >
          <span
            className={cn(
              'shrink-0 whitespace-nowrap tabular-nums',
              cpuUsage >= 80 ? 'text-destructive' : cpuUsage >= 60 ? 'text-warning' : '',
            )}
          >
            {sidebarCpuLine}
          </span>
          <span className="inline-block w-px h-3 bg-border/40 shrink-0" aria-hidden />
          <span
            className={cn(
              'shrink-0 whitespace-nowrap tabular-nums',
              ramUsage >= 85 ? 'text-destructive' : ramUsage >= 70 ? 'text-warning' : '',
            )}
          >
            {sidebarRamLine}
          </span>
          <span className="inline-block w-px h-3 bg-border/40 shrink-0" aria-hidden />
          <span className="min-w-0 truncate tabular-nums" title={sidebarNetLine}>
            {sidebarNetLine}
          </span>
        </div>
      )}
      {/* HUD hover scan line */}
      <div
        className={cn(
          'sidebar-node-scanline',
          isSelected && 'sidebar-node-scanline--selected'
        )}
      />
    </button>
  );
}

const NodeRowContent = memo(NodeRowContentInner, (prev, next) => {
  // Re-render only when something the row actually displays changed.
  if (prev.isSelected !== next.isSelected) return false;
  if (prev.onSelectNode !== next.onSelectNode) return false;
  const a = prev.node;
  const b = next.node;
  if (a === b) return true;
  if (a.uuid !== b.uuid) return false;
  if (a.status !== b.status) return false;
  // Static-ish fields that are still cheap to compare and DO change occasionally.
  if (a.name !== b.name) return false;
  if (a.group !== b.group) return false;
  if (a.tags !== b.tags) return false;
  if (a.region !== b.region) return false;
  if (a.os !== b.os) return false;
  if (a.arch !== b.arch) return false;
  if (a.virtualization !== b.virtualization) return false;
  if (a.hidden !== b.hidden) return false;
  // Live stats — the hot path. We compare only what the row renders.
  const sa = a.stats;
  const sb = b.stats;
  if (sa === sb) return true;
  if (!sa || !sb) return false;
  if (sa.cpu.usage !== sb.cpu.usage) return false;
  if (sa.ram.used !== sb.ram.used) return false;
  if (sa.ram.total !== sb.ram.total) return false;
  if (sa.network.up !== sb.network.up) return false;
  if (sa.network.down !== sb.network.down) return false;
  return true;
});

function NodeListView({
  nodes,
  loading,
  selectedNodeId,
  onSelectNode,
}: {
  nodes: NodeWithStatus[];
  loading?: boolean;
  selectedNodeId: string | null;
  onSelectNode: (uuid: string) => void;
}) {
  const reduceMotion = useReducedMotion();
  const { t } = useTranslation();
  const [searchQuery, setSearchQuery] = useState('');
  const [sortByActive, _setSortByActive] = useState(() => {
    const saved = localStorage.getItem('globeSortByActive');
    return saved === null ? true : saved === 'true';
  });
  const skeletonNameWidths = [52, 68, 61, 75, 57, 70, 64, 58];
  const skeletonMetaWidths = [18, 27, 22, 31, 20, 25, 29, 21];
  const setSortByActive = useCallback((val: boolean | ((prev: boolean) => boolean)) => {
    _setSortByActive(prev => {
      const next = typeof val === 'function' ? val(prev) : val;
      localStorage.setItem('globeSortByActive', String(next));
      return next;
    });
  }, []);
  
  // Determine if we need virtualization based on total node count
  const useVirtual = nodes.length > VIRTUALIZE_THRESHOLD;

  // Force-disable sort by activity when in virtualized mode (sort causes layout issues with virtualizer)
  const effectiveSortByActive = useVirtual ? false : sortByActive;

  // Keep track of the stable order to prevent frequent jumping
  const [stableOrder, setStableOrder] = useState<string[]>([]);
  const lastSortUpdate = useRef(0);

  // Initial order or manual toggle update
  // Note: intentionally excludes `nodes` from deps — we only re-sort on toggle change,
  // not on every real-time stats update (which would cause constant jumping).
  useEffect(() => {
    const getOrder = () => {
      const items = [...nodes];
      if (effectiveSortByActive) {
        items.sort((a, b) => {
          const aActivity = (a.stats?.network.up ?? 0) + (a.stats?.network.down ?? 0);
          const bActivity = (b.stats?.network.up ?? 0) + (b.stats?.network.down ?? 0);
          return bActivity - aActivity;
        });
      } else {
        items.sort((a, b) => (a.weight ?? 0) - (b.weight ?? 0));
      }
      return items.map(n => n.uuid);
    };

    setStableOrder(getOrder());
    lastSortUpdate.current = Date.now();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [effectiveSortByActive]);

  // Keep a ref of latest nodes so the interval callback can access current data
  const nodesRef = useRef(nodes);
  nodesRef.current = nodes;

  // Periodic slow re-sort if enabled (every 10s) to keep it fresh but not jumpy.
  // Skipped while the page is hidden — there's no visible jitter to schedule
  // and reordering would just churn React for no reason.
  useEffect(() => {
    if (!effectiveSortByActive) return;

    const interval = setInterval(() => {
      if (document.hidden) return;
      const newOrder = [...nodesRef.current]
        .sort((a, b) => {
          const aActivity = (a.stats?.network.up ?? 0) + (a.stats?.network.down ?? 0);
          const bActivity = (b.stats?.network.up ?? 0) + (b.stats?.network.down ?? 0);
          return bActivity - aActivity;
        })
        .map(n => n.uuid);
      setStableOrder(newOrder);
    }, 10000);

    return () => clearInterval(interval);
  }, [effectiveSortByActive]);

  const sortedAndFiltered = useMemo(() => {
    const nodeMap = new Map(nodes.map(n => [n.uuid, n]));
    
    // Use stable order first, then add any new nodes that might not be in stableOrder yet
    const result: NodeWithStatus[] = [];
    const seen = new Set<string>();
    stableOrder.forEach(uuid => {
      const node = nodeMap.get(uuid);
      if (node) {
        result.push(node);
        seen.add(uuid);
      }
    });

    // Add nodes not in stable order (newly joined)
    nodes.forEach(node => {
      if (!seen.has(node.uuid)) {
        result.push(node);
      }
    });

    if (!searchQuery) return result;
    const q = searchQuery.toLowerCase();
    return result.filter(n =>
      n.name.toLowerCase().includes(q)
      || n.region?.toLowerCase().includes(q)
      || n.group?.toLowerCase().includes(q)
    );
  }, [nodes, searchQuery, stableOrder]);

  const onlineCount = nodes.filter(n => n.status === 'online').length;

  const parentRef = useRef<HTMLDivElement>(null);
  const [showMoreIndicator, setShowMoreIndicator] = useState(false);

  const virtualizer = useVirtualizer({
    count: useVirtual ? sortedAndFiltered.length : 0,
    getScrollElement: () => parentRef.current,
    estimateSize: () => 76,
    overscan: 8,
    enabled: useVirtual,
  });

  const checkScroll = () => {
    if (parentRef.current) {
      const { scrollTop, scrollHeight, clientHeight } = parentRef.current;
      setShowMoreIndicator(scrollHeight > clientHeight && scrollTop + clientHeight < scrollHeight - 5);
    }
  };

  useEffect(() => {
    checkScroll();
  }, [sortedAndFiltered.length]);

  return (
    <div className="flex flex-col h-full relative">
      {/* Header */}
      <div className="px-3 py-3 border-b border-border/40 bg-gradient-to-r from-muted/15 to-transparent relative overflow-hidden flex-shrink-0">
        <div className="absolute inset-0 pointer-events-none opacity-[0.03]" style={{ backgroundImage: 'linear-gradient(var(--foreground) 1px, transparent 1px), linear-gradient(90deg, var(--foreground) 1px, transparent 1px)', backgroundSize: '16px 16px' }} />
        
        <div className="flex items-center justify-between relative z-10">
          <span className="text-sm font-display font-bold text-foreground uppercase tracking-widest leading-none">
            {t('fleet.status')}
          </span>
          <div className="flex items-stretch border border-border/40 rounded-sm overflow-hidden font-mono text-xxs tabular-nums bg-background/50 shrink-0">
            <div className="flex items-center gap-1 px-1.5 py-0.5 border-r border-border/40 bg-success/10">
              <span className="w-1 h-2 bg-success shrink-0" aria-hidden />
              <span className="text-foreground font-bold leading-none">{onlineCount}</span>
            </div>
            <div className="flex items-center gap-1 px-1.5 py-0.5 bg-destructive/10">
              <span className="w-1 h-2 bg-destructive shrink-0" aria-hidden />
              <span className="text-foreground font-bold leading-none">{nodes.length - onlineCount}</span>
            </div>
          </div>
        </div>
      </div>

      {/* Search filter */}
      <div className="px-2 py-1.5 border-b border-border/30 space-y-1 flex-shrink-0">
        <div className="relative">
          <Search className="absolute left-2 top-1/2 -translate-y-1/2 h-3 w-3 text-muted-foreground/40" />
          <input
            type="text"
            value={searchQuery}
            onChange={e => setSearchQuery(e.target.value)}
            placeholder={t('placeholder.filterNodes')}
            className={cn(
              "w-full h-7 pl-7 text-xs font-mono bg-muted/15 border border-border/20 rounded placeholder:text-muted-foreground/25 focus:outline-none focus:border-primary/40 focus:ring-1 focus:ring-primary/20 transition-colors",
              !useVirtual ? (searchQuery ? "pr-14" : "pr-8") : (searchQuery ? "pr-7" : "pr-2")
            )}
          />
          {!useVirtual && (
            <Tooltip>
              <TooltipTrigger asChild>
                <button
                  type="button"
                  onClick={() => setSortByActive(!sortByActive)}
                  aria-pressed={sortByActive}
                  aria-label={t('filter.sortByActivity')}
                  className={cn(
                    'absolute top-1/2 -translate-y-1/2 flex items-center justify-center h-5 w-5 rounded transition-colors cursor-pointer',
                    searchQuery ? 'right-7' : 'right-1.5',
                    sortByActive
                      ? 'text-primary bg-primary/10 hover:bg-primary/20'
                      : 'text-muted-foreground/40 hover:bg-muted/30 hover:text-muted-foreground'
                  )}
                >
                  <Activity className="h-3 w-3" />
                  {sortByActive && (
                    <span className="absolute -top-0.5 -right-0.5 w-1 h-1 rounded-full bg-primary motion-safe:animate-pulse" />
                  )}
                </button>
              </TooltipTrigger>
              <TooltipContent side="bottom" className="text-xs font-mono">
                {t('filter.sortByActivity')} · {sortByActive ? 'ON' : 'OFF'}
              </TooltipContent>
            </Tooltip>
          )}
          {searchQuery && (
            <button
              onClick={() => setSearchQuery('')}
              className="absolute right-1.5 top-1/2 -translate-y-1/2 p-0.5 rounded hover:bg-muted/50 cursor-pointer"
            >
              <X className="h-3 w-3 text-muted-foreground/40" />
            </button>
          )}
        </div>
        {searchQuery && (
          <div className="text-xxs font-mono text-muted-foreground/50 px-1">
            <span className="font-metric">{sortedAndFiltered.length}</span>
            {' / '}
            <span className="font-metric">{nodes.length}</span>
            {' '}{t('filter.matched')}
          </div>
        )}
      </div>

      {/* Node list */}
      <div 
        ref={parentRef} 
        className="flex-1 overflow-y-auto scrollbar-none"
        onScroll={checkScroll}
      >
        {loading && nodes.length === 0 ? (
          /* ── Skeleton loading ── */
          <div className="relative">
            {Array.from({ length: 8 }).map((_, i) => (
              <div
                key={i}
                className="px-3 py-2.5 border-b border-border/20 flex flex-col gap-1"
                style={{ animationDelay: `${i * 80}ms` }}
              >
                <div className="flex items-center gap-2">
                  <div className="w-1.5 h-1.5 rounded-full bg-muted/30 motion-safe:animate-pulse" />
                  <div className="flex-1 min-w-0">
                    <div className="flex items-baseline gap-2">
                      <div className="h-4 rounded bg-muted/25 motion-safe:animate-pulse" style={{ width: `${skeletonNameWidths[i % skeletonNameWidths.length]}%` }} />
                      <div className="h-3 rounded bg-muted/15 motion-safe:animate-pulse" style={{ width: `${skeletonMetaWidths[i % skeletonMetaWidths.length]}%` }} />
                    </div>
                  </div>
                </div>
                <div className="flex items-center gap-1.5 ml-3.5">
                  <div className="h-4 w-12 rounded-sm bg-primary/8 motion-safe:animate-pulse" />
                  <div className="h-4 w-10 rounded-sm bg-muted/15 motion-safe:animate-pulse" />
                </div>
                <div className="flex items-center gap-2.5 ml-3.5">
                  <div className="h-3 w-14 rounded bg-muted/15 motion-safe:animate-pulse" />
                  <div className="h-3 w-px bg-border/30" />
                  <div className="h-3 w-14 rounded bg-muted/15 motion-safe:animate-pulse" />
                </div>
                {/* Scanning line */}
                <div className="absolute inset-x-0 pointer-events-none overflow-hidden" style={{ top: 0, bottom: 0 }}>
                  <div className="hud-skeleton-scan absolute w-full h-6 bg-gradient-to-b from-transparent via-primary/[0.03] to-transparent" />
                </div>
              </div>
            ))}
          </div>
        ) : useVirtual ? (
          /* ── Virtualized mode (200+ nodes): fixed height rows ── */
          <div
            style={{ height: `${virtualizer.getTotalSize()}px`, width: '100%', position: 'relative' }}
          >
            {virtualizer.getVirtualItems().map((virtualItem) => {
              const node = sortedAndFiltered[virtualItem.index];
              return (
                <div
                  key={node.uuid}
                  ref={virtualizer.measureElement}
                  data-index={virtualItem.index}
                  className="absolute top-0 left-0 w-full"
                  style={{
                    transform: `translateY(${virtualItem.start}px)`,
                  }}
                >
                  <NodeRowContent
                    node={node}
                    isSelected={selectedNodeId === node.uuid}
                    onSelectNode={onSelectNode}
                  />
                </div>
              );
            })}
          </div>
        ) : (
          /* ── Plain mode (<= 200 nodes): direct rendering ── */
          <div>
            {sortedAndFiltered.map((node) => (
              <NodeRowContent
                key={node.uuid}
                node={node}
                isSelected={selectedNodeId === node.uuid}
                onSelectNode={onSelectNode}
              />
            ))}
          </div>
        )}
      </div>

      {/* Overflow Indicator */}
      <AnimatePresence>
        {showMoreIndicator && (
          <motion.div 
            initial={reduceMotion ? { opacity: 1, y: 0 } : { opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={reduceMotion ? { opacity: 1, y: 0 } : { opacity: 0, y: 10 }}
            transition={{ duration: reduceMotion ? 0 : 0.2 }}
            className="absolute bottom-0 left-0 right-0 h-8 flex items-center justify-center pointer-events-none bg-gradient-to-t from-background/80 via-background/40 to-transparent z-20"
          >
            <div className="flex gap-1.5">
              {reduceMotion ? (
                [1, 2, 3].map(i => (
                  <div key={i} className="h-1 w-1 rounded-full bg-primary/70" />
                ))
              ) : (
                [1, 2, 3].map(i => (
                  <motion.div 
                    key={i} 
                    animate={{ 
                      opacity: [0.2, 0.8, 0.2],
                      scale: [1, 1.2, 1]
                    }}
                    transition={{ 
                      duration: 1.5, 
                      repeat: Infinity, 
                      delay: i * 0.2 
                    }}
                    className="w-1 h-1 rounded-full bg-primary"
                  />
                ))
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

function NodeDetailView({
  node,
  onBack,
  onViewCharts,
}: {
  node: NodeWithStatus;
  onBack: () => void;
  onViewCharts: (uuid: string, name: string) => void;
}) {
  const navigate = useNavigate();
  const { t } = useTranslation();
  const stats = node.stats;
  const isOnline = node.status === 'online';
  const { isLoggedIn } = useAppConfig();

  const cpuUsage = stats?.cpu?.usage ?? 0;
  const ramUsage = stats ? (stats.ram.used / stats.ram.total) * 100 : 0;
  const diskUsage = stats ? (stats.disk.used / stats.disk.total) * 100 : 0;
  const swapUsage = stats && stats.swap.total > 0 ? (stats.swap.used / stats.swap.total) * 100 : 0;

  const cpuStatus = getUsageStatus(cpuUsage, { warning: 60, critical: 80 });
  const ramStatus = getUsageStatus(ramUsage, { warning: 70, critical: 85 });
  const diskStatus = getUsageStatus(diskUsage, { warning: 75, critical: 90 });
  const cores = node.cpu_cores || 1;
  const loadRatio = stats ? stats.load.load1 / cores : 0;
  const loadStatusTone =
    loadRatio >= 1.5 ? 'text-destructive' : loadRatio >= 1 ? 'text-warning' : 'text-foreground';
  const regionEmoji = extractRegionEmoji(node.region);
  const regionName = getRegionDisplayName(node.region);

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="px-3 py-2 border-b border-border/50 flex items-center gap-2">
        <Tooltip>
          <TooltipTrigger asChild>
            <button
              onClick={onBack}
              className="p-1 rounded hover:bg-muted/50 transition-colors cursor-pointer"
              aria-label="Back to fleet"
            >
              <ArrowLeft className="h-3.5 w-3.5" />
            </button>
          </TooltipTrigger>
          <TooltipContent side="bottom" className="text-xs font-mono">
            Back to fleet · Esc
          </TooltipContent>
        </Tooltip>
        <div className="flex-1 min-w-0 flex flex-col gap-1">
          <div className="node-name text-base truncate">{node.name}</div>
          <div className="flex items-center gap-1.5">
            <span className={cn(
              'w-1.5 h-1.5 rounded-full shrink-0',
              isOnline ? 'bg-success motion-safe:animate-pulse' : 'bg-destructive'
            )} />
            {isOnline && stats?.updated_at ? (
              <Tooltip>
                <TooltipTrigger asChild>
                  <span className="text-xs font-mono text-muted-foreground cursor-default">
                    {t('status.online')}
                  </span>
                </TooltipTrigger>
                <TooltipContent side="bottom" className="text-xs font-mono">
                  {t('label.lastReport')}: {new Date(stats.updated_at).toLocaleString()}
                </TooltipContent>
              </Tooltip>
            ) : (
              <span className="text-xs font-mono text-muted-foreground">
                {isOnline ? t('status.online') : t('status.offline')}
              </span>
            )}
          </div>
          {/* Chips row: group + expiry */}
          {(node.group || (isLoggedIn && node.price !== -1 && getExpiryStatus(node.expired_at))) && (
            <div className="flex items-center flex-wrap gap-1">
              {node.group && (
                <span className="text-xs font-mono text-primary/90 bg-primary/12 border border-primary/20 px-1.5 py-0.5 rounded-sm">
                  {node.group}
                </span>
              )}
              {isLoggedIn && node.price !== -1 && (() => {
                const expiryStatus = getExpiryStatus(node.expired_at);
                if (!expiryStatus) return null;
                const tone = expiryStatus === 'expired'
                  ? 'text-destructive bg-destructive/12 border-destructive/25'
                  : expiryStatus === 'warning'
                    ? 'text-warning bg-warning/12 border-warning/25'
                    : 'text-muted-foreground bg-muted/40 border-border/30';
                return (
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <span className={cn(
                        'text-xs font-metric border px-1.5 py-0.5 rounded-sm cursor-default',
                        tone,
                      )}>
                        {formatExpiry(node.expired_at)}
                      </span>
                    </TooltipTrigger>
                    <TooltipContent side="bottom" className="whitespace-pre-line text-xs font-mono">
                      {t('label.expiryTooltipDetail', {
                        date: dayjs(node.expired_at).format('YYYY-MM-DD HH:mm'),
                        cycle: node.billing_cycle ?? '-',
                        renewal: node.auto_renewal ? t('label.yes') : t('label.no'),
                        price: node.price === -1 ? t('label.free') : node.price === 0 ? t('label.notSet') : `${node.currency}${node.price}`,
                      })}
                    </TooltipContent>
                  </Tooltip>
                );
              })()}
            </div>
          )}
          {/* Tags */}
          {node.tags && (() => {
            const tagList = parseTagList(node.tags);
            const maxTags = 5;
            const visibleTags = tagList.slice(0, maxTags);
            const hiddenCount = tagList.length - visibleTags.length;
            return tagList.length > 0 ? (
              <div className="flex flex-wrap gap-1">
                {visibleTags.map((tag, i) => (
                  <TagPill key={i} label={tag.label} color={tag.color} size="sm" />
                ))}
                {hiddenCount > 0 && (
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <span className="text-xs font-mono text-muted-foreground/60 bg-muted/30 px-1.5 py-0.5 rounded-sm cursor-default">
                        +{hiddenCount}
                      </span>
                    </TooltipTrigger>
                    <TooltipContent side="bottom" className="text-xs font-mono">
                      {tagList.slice(maxTags).map(t => t.label).join(', ')}
                    </TooltipContent>
                  </Tooltip>
                )}
              </div>
            ) : null;
          })()}
        </div>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto relative min-h-0">
        <div className="p-3 pb-3 space-y-4">
        {!isOnline ? (
          <div className="flex items-center justify-center h-24 text-muted-foreground text-xs leading-relaxed px-2 text-center">
            {t('telemetry.nodeOfflineShort')}
          </div>
        ) : stats ? (
          <>
            {/* Telemetry sections — flat inside sidebar-fleet-panel (no nested instrument chrome) */}
            <div className="sidebar-detail-telemetry">
              {/* System spec — no nested card border */}
              <div className="stat-section p-2.5">
                <div className="flex items-center gap-1.5 mb-2">
                  <span className="stat-chip stat-chip--system"><Server className="h-3 w-3" /></span>
                  <span className="type-hud-label">{t('info.system')}</span>
                </div>
                <div className="grid grid-cols-[12px_auto_1fr] gap-x-2 gap-y-1.5 text-xs font-mono items-center">
                  <SystemIcon kind="cpu" value={node.cpu_name} className="h-3 w-3 text-muted-foreground/70" />
                  <span className="type-hud-label-sm whitespace-nowrap">{t('label.cpu')}</span>
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <span className="truncate cursor-default type-spec-value font-mono text-xs">{node.cpu_name || '-'} ({node.cpu_cores}C)</span>
                    </TooltipTrigger>
                    <TooltipContent side="right" className="max-w-xs text-xs font-mono">{node.cpu_name || '-'} ({node.cpu_cores}C)</TooltipContent>
                  </Tooltip>
                  <SystemIcon kind="arch" value={node.arch} className="h-3 w-3 text-muted-foreground/70" />
                  <span className="type-hud-label-sm whitespace-nowrap">{t('label.arch')}</span>
                  <span className="truncate type-spec-value font-mono text-xs">{node.arch || '-'}</span>
                  <SystemIcon kind="os" value={node.os} className="h-3 w-3 text-muted-foreground/70" />
                  <span className="type-hud-label-sm whitespace-nowrap">{t('label.os')}</span>
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <span className="truncate cursor-default type-spec-value font-mono text-xs">{node.os || '-'}</span>
                    </TooltipTrigger>
                    <TooltipContent side="right" className="max-w-xs text-xs font-mono">{node.os || '-'}</TooltipContent>
                  </Tooltip>
                  <SystemIcon kind="virt" value={node.virtualization} className="h-3 w-3 text-muted-foreground/70" />
                  <span className="type-hud-label-sm whitespace-nowrap">{t('label.virt')}</span>
                  <span className="truncate type-spec-value font-mono text-xs">{node.virtualization || '-'}</span>
                  <MapPin className="h-3 w-3 text-muted-foreground/70" />
                  <span className="type-hud-label-sm whitespace-nowrap">{t('label.region')}</span>
                  <span className="inline-flex min-w-0 items-center gap-1 truncate type-spec-value font-mono text-xs">
                    {node.region ? (
                      <>
                        {regionEmoji && <span className="shrink-0">{regionEmoji}</span>}
                        <span className="truncate">{regionName || node.region}</span>
                      </>
                    ) : (
                      '-'
                    )}
                  </span>
                  {node.kernel_version && (
                    <>
                      <Terminal className="h-3 w-3 text-muted-foreground/70" />
                      <span className="type-hud-label-sm whitespace-nowrap">{t('label.kernel')}</span>
                      <Tooltip>
                        <TooltipTrigger asChild>
                          <span className="truncate cursor-default type-spec-value font-mono text-xs">{node.kernel_version}</span>
                        </TooltipTrigger>
                        <TooltipContent side="right" className="max-w-xs text-xs font-mono">{node.kernel_version}</TooltipContent>
                      </Tooltip>
                    </>
                  )}
                </div>
              </div>

              {/* Resource gauges */}
              <div className="stat-section border-t border-border/20 p-2.5 space-y-2.5">
                <div className="space-y-1">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-1.5">
                      <span className="stat-chip stat-chip--cpu"><Cpu className="h-3 w-3" /></span>
                      <span className="type-hud-label">{t('label.cpu')}</span>
                    </div>
                    <span className={cn('type-metric-md', {
                      'text-destructive': cpuStatus === 'critical',
                      'text-warning': cpuStatus === 'warning',
                    })}>
                      {cpuUsage.toFixed(1)}%
                    </span>
                  </div>
                  <Progress value={cpuUsage} className="h-1.5" indicatorClassName={statusColorMap[cpuStatus]} />
                </div>

                <div className="space-y-1">
                  <div className="flex items-center justify-between gap-2">
                    <div className="flex min-w-0 items-center gap-1.5">
                      <span className="stat-chip stat-chip--ram"><MemoryStick className="h-3 w-3" /></span>
                      <span className="type-hud-label shrink-0">{t('label.ram')}</span>
                      <span className="truncate text-xxs text-muted-foreground font-metric tabular-nums">
                        {formatBytes(stats.ram.used)}/{formatBytes(stats.ram.total)}
                      </span>
                    </div>
                    <span className={cn('type-metric-md shrink-0', {
                      'text-destructive': ramStatus === 'critical',
                      'text-warning': ramStatus === 'warning',
                    })}>
                      {ramUsage.toFixed(1)}%
                    </span>
                  </div>
                  <Progress value={ramUsage} className="h-1.5" indicatorClassName={statusColorMap[ramStatus]} />
                </div>

                {stats.swap.total > 0 && (
                  <div className="space-y-1">
                    <div className="flex items-center justify-between gap-2">
                      <div className="flex min-w-0 items-center gap-1.5">
                        <span className="stat-chip stat-chip--ram"><Layers className="h-3 w-3" /></span>
                        <span className="type-hud-label shrink-0">{t('label.swap')}</span>
                        <span className="truncate text-xxs text-muted-foreground font-metric tabular-nums">
                          {formatBytes(stats.swap.used)}/{formatBytes(stats.swap.total)}
                        </span>
                      </div>
                      <span className="type-metric-md shrink-0">{swapUsage.toFixed(1)}%</span>
                    </div>
                    <Progress value={swapUsage} className="h-1.5" />
                  </div>
                )}

                <div className="space-y-1">
                  <div className="flex items-center justify-between gap-2">
                    <div className="flex min-w-0 items-center gap-1.5">
                      <span className="stat-chip stat-chip--disk"><HardDrive className="h-3 w-3" /></span>
                      <span className="type-hud-label shrink-0">{t('label.disk')}</span>
                      <span className="truncate text-xxs text-muted-foreground font-metric tabular-nums">
                        {formatBytes(stats.disk.used)}/{formatBytes(stats.disk.total)}
                      </span>
                    </div>
                    <span className={cn('type-metric-md shrink-0', {
                      'text-destructive': diskStatus === 'critical',
                      'text-warning': diskStatus === 'warning',
                    })}>
                      {diskUsage.toFixed(1)}%
                    </span>
                  </div>
                  <Progress value={diskUsage} className="h-1.5" indicatorClassName={statusColorMap[diskStatus]} />
                </div>
              </div>

              {/* Load */}
              <div className="stat-section border-t border-border/20 p-2.5 flex flex-col gap-1.5" data-accent="load">
                <div className="flex items-center gap-1.5">
                  <span className="stat-chip stat-chip--load"><Activity className="h-3 w-3" /></span>
                  <span className="type-hud-label">{t('label.load')}</span>
                </div>
                <div className={cn('type-metric-hero tabular-nums', loadStatusTone)}>
                  {stats.load.load1.toFixed(2)}
                </div>
                <div className="grid grid-cols-3 gap-1 pt-1.5 border-t border-border/15">
                  <div>
                    <div className="type-hud-label-sm">{t('label.load1m')}</div>
                    <div className="type-metric-md tabular-nums">{stats.load.load1.toFixed(2)}</div>
                  </div>
                  <div>
                    <div className="type-hud-label-sm">{t('label.load5m')}</div>
                    <div className="type-metric-md tabular-nums text-foreground/85">{stats.load.load5.toFixed(2)}</div>
                  </div>
                  <div>
                    <div className="type-hud-label-sm">{t('label.load15m')}</div>
                    <div className="type-metric-md tabular-nums text-foreground/65">{stats.load.load15.toFixed(2)}</div>
                  </div>
                </div>
              </div>

              {/* Network */}
              <div className="stat-section border-t border-border/20 p-2.5 flex flex-col gap-2" data-accent="network">
                <div className="flex items-center gap-1.5">
                  <span className="stat-chip stat-chip--network"><Network className="h-3 w-3" /></span>
                  <span className="type-hud-label">{t('label.network')}</span>
                </div>
                <div className="flex flex-col gap-1.5">
                  <div className="flex items-baseline justify-between gap-3 tabular-nums">
                    <div className="flex min-w-0 items-baseline gap-2">
                      <span className="type-hud-label-sm shrink-0">{t('label.totalUp')}</span>
                      <span className="type-metric-md">
                        {stats.network.totalUp ? formatBytes(stats.network.totalUp) : t('label.na')}
                      </span>
                    </div>
                    <span className="type-metric-md shrink-0 text-chart-7">{formatSpeed(stats.network.up)}</span>
                  </div>
                  <div className="flex items-baseline justify-between gap-3 tabular-nums">
                    <div className="flex min-w-0 items-baseline gap-2">
                      <span className="type-hud-label-sm shrink-0">{t('label.totalDown')}</span>
                      <span className="type-metric-md">
                        {stats.network.totalDown ? formatBytes(stats.network.totalDown) : t('label.na')}
                      </span>
                    </div>
                    <span className="type-metric-md shrink-0 text-chart-8">{formatSpeed(stats.network.down)}</span>
                  </div>
                </div>
                {isLoggedIn && (
                  <div className="flex items-center gap-2 pt-1.5 border-t border-border/15">
                    <span className="type-hud-label-sm">{t('label.tcp')}</span>
                    <span className="text-xxs font-metric font-bold tabular-nums text-chart-5">{stats.connections.tcp}</span>
                    <span className="text-xxs text-muted-foreground/20">|</span>
                    <span className="type-hud-label-sm">{t('label.udp')}</span>
                    <span className="text-xxs font-metric font-bold tabular-nums text-chart-6">{stats.connections.udp}</span>
                  </div>
                )}
              </div>

              {/* Uptime + process — single-line readout, no hero metric */}
              <div className="stat-section border-t border-border/20 p-2.5">
                <div className="flex items-center justify-between gap-3">
                  <div className="flex min-w-0 items-center gap-1.5">
                    <span className="stat-chip stat-chip--uptime"><Clock className="h-3 w-3" /></span>
                    <span className="type-hud-label">{t('label.uptime')}</span>
                  </div>
                  <span className="type-metric-md tabular-nums shrink-0">{formatUptime(stats.uptime)}</span>
                </div>
                {isLoggedIn && stats.process > 0 && (
                  <div className="flex items-baseline justify-between gap-3 pt-1.5 mt-1.5 border-t border-border/15 tabular-nums">
                    <span className="type-hud-label-sm">{t('label.proc')}</span>
                    <span className="type-metric-md">{stats.process}</span>
                  </div>
                )}
              </div>

              {/* Traffic limit */}
              {!!(node.traffic_limit && node.traffic_limit > 0 && node.traffic_limit_type && node.traffic_limit_type !== 'no_limit') && (
                <div className="stat-section border-t border-border/20 p-2.5 flex flex-col gap-1.5">
                  <div className="flex items-center gap-1.5 min-w-0">
                    <span className="stat-chip stat-chip--traffic shrink-0"><Gauge className="h-3 w-3" /></span>
                    <span className="type-hud-label truncate">
                      {t('label.traffic')} <span className="text-muted-foreground/60 normal-case">({formatTrafficType(node.traffic_limit_type as TrafficLimitType)})</span>
                    </span>
                  </div>
                  <div className="flex items-baseline justify-between gap-2 tabular-nums">
                    <span className={cn(
                      'type-metric-md',
                      (() => {
                        const used = calcTrafficUsage(stats.network.totalUp, stats.network.totalDown, node.traffic_limit_type as TrafficLimitType);
                        const pct = (used / node.traffic_limit!) * 100;
                        return pct >= 90 ? 'text-destructive' : pct >= 70 ? 'text-warning' : '';
                      })()
                    )}>
                      {formatBytes(calcTrafficUsage(stats.network.totalUp, stats.network.totalDown, node.traffic_limit_type as TrafficLimitType))}
                      <span className="text-muted-foreground/60 mx-0.5">/</span>
                      {formatBytes(node.traffic_limit)}
                    </span>
                  </div>
                  <Progress
                    value={Math.min((calcTrafficUsage(stats.network.totalUp, stats.network.totalDown, node.traffic_limit_type as TrafficLimitType) / node.traffic_limit) * 100, 100)}
                    className="h-1.5"
                    indicatorClassName={(() => {
                      const pct = (calcTrafficUsage(stats.network.totalUp, stats.network.totalDown, node.traffic_limit_type as TrafficLimitType) / node.traffic_limit) * 100;
                      return pct >= 90 ? 'bg-destructive' : pct >= 70 ? 'bg-warning' : '';
                    })()}
                  />
                </div>
              )}

              {/* Remark — inline annotation, same panel rhythm */}
              {node.public_remark && (
                <div className="stat-section border-t border-border/20 px-2.5 py-2">
                  <RemarkNote text={node.public_remark} variant="public" layout="inline" />
                </div>
              )}
            </div>
          </>
        ) : null}
        </div>
      </div>

      {/* Action buttons — Charts hidden on mobile (modal too small), Detail always visible */}
      <div className="sidebar-detail-action-bar">
        <Button
          variant="outline"
          size="sm"
          className="hidden sm:flex flex-1 text-xs font-mono border-primary/30 bg-card/40 backdrop-blur-sm hover:bg-primary/15 hover:text-primary"
          onClick={() => onViewCharts(node.uuid, node.name)}
        >
          <BarChart3 className="h-3 w-3 mr-1.5" />
          {t('action.charts')}
        </Button>
        <Button
          variant="outline"
          size="sm"
          className="flex-1 text-xs font-mono border-primary/30 bg-card/40 backdrop-blur-sm hover:bg-primary/15 hover:text-primary"
          onClick={() => navigate(`/node/${node.uuid}`)}
        >
          <ExternalLink className="h-3 w-3 mr-1.5" />
          {t('action.detail')}
        </Button>
      </div>
    </div>
  );
}

export function Sidebar({ nodes, loading, selectedNodeId, onSelectNode, onViewCharts, className }: SidebarProps) {
  const reduceMotion = useReducedMotion();
  const [view, setView] = useState<'list' | 'detail'>('list');

  const selectedNode = useMemo(
    () => nodes.find((n: NodeWithStatus) => n.uuid === selectedNodeId) ?? null,
    [nodes, selectedNodeId]
  );

  // Sync view state: if selectedNodeId is cleared externally, go back to list
  useEffect(() => {
    if (!selectedNodeId) {
      setView('list');
    } else if (selectedNode) {
      setView('detail');
    }
  }, [selectedNodeId, selectedNode]);

  const handleSelectNode = useCallback((uuid: string) => {
    onSelectNode(uuid);
    setView('detail');
  }, [onSelectNode]);

  const handleBack = useCallback(() => {
    setView('list');
    onSelectNode(null);
  }, [onSelectNode]);

  return (
    <div className={cn(
      // backdrop-blur-md (≈12px) instead of -xl (≈24px): the blur on the
      // sidebar wrapper is a per-frame composite cost that scales with the
      // sidebar's pixel area and the radius. Above the GlobeView (which
      // repaints every frame) the wrapper alone was ~3-5ms/frame on
      // mid-range laptops. 12px is visually indistinguishable here because
      // we already have bg-card/80 doing most of the contrast work.
      'flex flex-col h-full bg-card/80 backdrop-blur-md border border-border/50 rounded-lg overflow-hidden',
      'sidebar-fleet-panel commander-corners',
      className
    )}>
      <span className="corner-bottom" />
      <AnimatePresence mode="wait" initial={false}>
        {view === 'list' ? (
          <motion.div
            key="list"
            initial={reduceMotion ? { x: 0, opacity: 1 } : { x: -20, opacity: 0 }}
            animate={{ x: 0, opacity: 1 }}
            exit={reduceMotion ? { x: 0, opacity: 1 } : { x: -20, opacity: 0 }}
            transition={{ duration: reduceMotion ? 0 : 0.2 }}
            className="flex-1 overflow-hidden flex flex-col"
          >
            <NodeListView
              nodes={nodes}
              loading={loading}
              selectedNodeId={selectedNodeId}
              onSelectNode={handleSelectNode}
            />
          </motion.div>
        ) : (
          <motion.div
            key="detail"
            initial={reduceMotion ? { x: 0, opacity: 1 } : { x: 20, opacity: 0 }}
            animate={{ x: 0, opacity: 1 }}
            exit={reduceMotion ? { x: 0, opacity: 1 } : { x: 20, opacity: 0 }}
            transition={{ duration: reduceMotion ? 0 : 0.2 }}
            className="flex-1 overflow-hidden flex flex-col"
          >
            {selectedNode ? (
              <NodeDetailView
                node={selectedNode}
                onBack={handleBack}
                onViewCharts={onViewCharts}
              />
            ) : (
              <div className="flex items-center justify-center h-full text-xs font-mono text-muted-foreground">
                <button onClick={handleBack} className="hover:text-primary cursor-pointer">
                  <ArrowLeft className="h-4 w-4" />
                </button>
              </div>
            )}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
