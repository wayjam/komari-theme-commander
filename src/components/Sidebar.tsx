import { useState, useMemo, useRef, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { useNavigate } from 'react-router-dom';
import { AnimatePresence, motion } from 'motion/react';
import { useVirtualizer } from '@tanstack/react-virtual';
import { ArrowLeft, Cpu, HardDrive, MemoryStick, Network, BarChart3, ExternalLink, Server, Layers, Search, X, Activity } from 'lucide-react';
import { Switch } from '@/components/ui/switch';
import type { NodeWithStatus } from '@/services/api';
import { Progress } from '@/components/ui/progress';
import { Button } from '@/components/ui/button';
import { cn, extractRegionEmoji, formatSpeed, formatBytes, formatUptime, getUsageStatus, calcTrafficUsage, formatTrafficType, getExpiryStatus, formatExpiry } from '@/lib/utils';
import type { TrafficLimitType } from '@/lib/utils';
import { useAppConfig } from '@/hooks/useAppConfig';
import prettyBytes from 'pretty-bytes';

interface SidebarProps {
  nodes: NodeWithStatus[];
  selectedNodeId: string | null;
  onSelectNode: (uuid: string | null) => void;
  onViewCharts: (uuid: string, name: string) => void;
  className?: string;
}

const statusColorMap: Record<'normal' | 'warning' | 'critical', string> = {
  normal: '',
  warning: 'bg-yellow-500',
  critical: 'bg-red-500',
};

function NodeListView({
  nodes,
  selectedNodeId,
  onSelectNode,
}: {
  nodes: NodeWithStatus[];
  selectedNodeId: string | null;
  onSelectNode: (uuid: string) => void;
}) {
  const { t } = useTranslation();
  const [searchQuery, setSearchQuery] = useState('');
  const [sortByActive, setSortByActive] = useState(true);
  
  // Keep track of the stable order to prevent frequent jumping
  const [stableOrder, setStableOrder] = useState<string[]>([]);
  const lastSortUpdate = useRef(0);

  // Initial order or manual toggle update
  useEffect(() => {
    const getOrder = () => {
      const items = [...nodes];
      if (sortByActive) {
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
  }, [sortByActive]);

  // Periodic slow re-sort if enabled (every 10s) to keep it fresh but not jumpy
  useEffect(() => {
    if (!sortByActive) return;
    
    const interval = setInterval(() => {
      const newOrder = [...nodes]
        .sort((a, b) => {
          const aActivity = (a.stats?.network.up ?? 0) + (a.stats?.network.down ?? 0);
          const bActivity = (b.stats?.network.up ?? 0) + (b.stats?.network.down ?? 0);
          return bActivity - aActivity;
        })
        .map(n => n.uuid);
      setStableOrder(newOrder);
    }, 10000);

    return () => clearInterval(interval);
  }, [sortByActive, nodes]);

  const sortedAndFiltered = useMemo(() => {
    // Map nodes to a map for quick lookup
    const nodeMap = new Map(nodes.map(n => [n.uuid, n]));
    
    // Use stable order first, then add any new nodes that might not be in stableOrder yet
    let result: NodeWithStatus[] = [];
    stableOrder.forEach(uuid => {
      const node = nodeMap.get(uuid);
      if (node) result.push(node);
    });

    // Add nodes not in stable order (newly joined)
    nodes.forEach(node => {
      if (!result.find(r => r.uuid === node.uuid)) {
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
    count: sortedAndFiltered.length,
    getScrollElement: () => parentRef.current,
    estimateSize: () => 60,
    overscan: 5,
  });

  const checkScroll = () => {
    if (parentRef.current) {
      const { scrollTop, scrollHeight, clientHeight } = parentRef.current;
      // If scrollable and not at the very bottom
      setShowMoreIndicator(scrollHeight > clientHeight && scrollTop + clientHeight < scrollHeight - 5);
    }
  };

  useEffect(() => {
    checkScroll();
  }, [sortedAndFiltered.length, virtualizer.getTotalSize()]);

  return (
    <div className="flex flex-col h-full relative">
      {/* Header */}
      <div className="px-3 py-2 border-b border-border/50 relative overflow-hidden flex-shrink-0">
        <div className="absolute top-0 right-0 w-16 h-16 pointer-events-none opacity-[0.03]">
          <div className="absolute top-2 right-2 border-t border-right w-full h-full border-primary" />
        </div>
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <span className="text-xs font-display font-bold text-muted-foreground uppercase tracking-wider">
              {t('fleet.status')}
            </span>
            <div className="flex gap-0.5">
              {[1, 2, 3].map(i => (
                <div key={i} className="w-1 h-1 bg-primary/20 rounded-full" />
              ))}
            </div>
          </div>
          <div className="flex items-center gap-2 text-xs font-mono">
            <span className="text-green-500">{onlineCount} {t('status.on')}</span>
            <span className="text-muted-foreground/50">|</span>
            <span className="text-red-500">{nodes.length - onlineCount} {t('status.off')}</span>
          </div>
        </div>
      </div>

      {/* Search filter */}
      <div className="px-2 py-1.5 border-b border-border/30 space-y-2 flex-shrink-0">
        <div className="flex items-center justify-between px-1">
          <div className="flex items-center gap-1.5 cursor-pointer" onClick={() => setSortByActive(!sortByActive)}>
            <Activity className={cn("h-3 w-3 transition-colors", sortByActive ? "text-primary" : "text-muted-foreground/40")} />
            <span className="text-xs font-mono text-muted-foreground/60 uppercase tracking-tight">{t('filter.sortByActivity')}</span>
          </div>
          <Switch 
            checked={sortByActive} 
            onCheckedChange={setSortByActive}
            size="sm"
            className="data-[state=checked]:bg-primary"
          />
        </div>
        <div className="relative">
          <Search className="absolute left-2 top-1/2 -translate-y-1/2 h-3 w-3 text-muted-foreground/40" />
          <input
            type="text"
            value={searchQuery}
            onChange={e => setSearchQuery(e.target.value)}
            placeholder={t('placeholder.filterNodes')}
            className="w-full h-7 pl-7 pr-7 text-xs font-mono bg-muted/15 border border-border/20 rounded placeholder:text-muted-foreground/25 focus:outline-none focus:border-primary/40 focus:ring-1 focus:ring-primary/20 transition-colors"
          />
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
          <div className="text-xxs font-mono text-muted-foreground/50 mt-1 px-1">
            {sortedAndFiltered.length} / {nodes.length} {t('filter.matched')}
          </div>
        )}
      </div>

      {/* Virtualized list */}
      <div 
        ref={parentRef} 
        className="flex-1 overflow-y-auto scrollbar-none"
        onScroll={checkScroll}
      >
        <div
          style={{ height: `${virtualizer.getTotalSize()}px`, width: '100%', position: 'relative' }}
        >
          {virtualizer.getVirtualItems().map((virtualItem) => {
            const node = sortedAndFiltered[virtualItem.index];
            const isOnline = node.status === 'online';
            const stats = node.stats;
            const cpuUsage = stats?.cpu?.usage ?? 0;
            const ramUsage = stats ? (stats.ram.used / stats.ram.total) * 100 : 0;
            const isSelected = selectedNodeId === node.uuid;
            const emoji = extractRegionEmoji(node.region);

            const tagList = node.tags ? node.tags.split(/[,;]/).map(t => t.trim()).filter(Boolean) : [];

            return (
              <button
                key={node.uuid}
                ref={virtualizer.measureElement}
                data-index={virtualItem.index}
                onClick={() => onSelectNode(node.uuid)}
                className={cn(
                  'w-full px-3 py-2.5 text-left transition-all duration-150 border-l-2 absolute top-0 left-0',
                  'hover:bg-muted/50 cursor-pointer',
                  'border-b border-border/20',
                  isSelected
                    ? 'bg-primary/10 border-l-primary'
                    : 'border-l-transparent'
                )}
                style={{
                  transform: `translateY(${virtualItem.start}px)`,
                }}
              >
                <div className="flex items-center gap-2">
                  <span
                    className={cn(
                      'w-1.5 h-1.5 rounded-full flex-shrink-0',
                      isOnline ? 'bg-green-500' : 'bg-red-500',
                      isOnline && 'animate-pulse'
                    )}
                  />
                  <div className="flex-1 min-w-0">
                    <div className="text-base font-display font-bold truncate">{node.name}</div>
                  </div>
                  {emoji && (
                    <span className="text-sm flex-shrink-0">{emoji}</span>
                  )}
                </div>
                {/* Tags row */}
                <div className="flex items-center gap-1.5 mt-1 ml-3.5 flex-wrap">
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
                {isOnline && stats && (
                  <div className="flex items-center gap-3 mt-1 ml-3.5 text-xs font-mono text-muted-foreground">
                    <span className={cn(
                      cpuUsage >= 80 ? 'text-red-500' : cpuUsage >= 60 ? 'text-yellow-500' : ''
                    )}>
                      {t('label.cpu')} {cpuUsage.toFixed(0)}%
                    </span>
                    <span className={cn(
                      ramUsage >= 85 ? 'text-red-500' : ramUsage >= 70 ? 'text-yellow-500' : ''
                    )}>
                      {t('label.ram')} {ramUsage.toFixed(0)}%
                    </span>
                    <span>↑{formatSpeed(stats.network.up)}</span>
                  </div>
                )}
              </button>
            );
          })}
        </div>
      </div>

      {/* Overflow Indicator */}
      <AnimatePresence>
        {showMoreIndicator && (
          <motion.div 
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 10 }}
            className="absolute bottom-0 left-0 right-0 h-8 flex items-center justify-center pointer-events-none bg-gradient-to-t from-background/80 via-background/40 to-transparent z-20"
          >
            <div className="flex gap-1.5">
              {[1, 2, 3].map(i => (
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
              ))}
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

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="px-3 py-2 border-b border-border/50 flex items-center gap-2">
        <button
          onClick={onBack}
          className="p-1 rounded hover:bg-muted/50 transition-colors cursor-pointer"
        >
          <ArrowLeft className="h-3.5 w-3.5" />
        </button>
        <div className="flex-1 min-w-0">
          <div className="text-base font-display font-bold truncate">{node.name}</div>
          <div className="flex items-center gap-1.5">
            <span className={cn(
              'w-1.5 h-1.5 rounded-full',
              isOnline ? 'bg-green-500' : 'bg-red-500'
            )} />
            <span className="text-xs font-mono text-muted-foreground">
              {isOnline ? t('status.online') : t('status.offline')}
            </span>
            {node.group && (
              <>
                <span className="text-xs text-muted-foreground/40">|</span>
                <span className="text-xs font-mono text-primary">{node.group}</span>
              </>
            )}
          </div>
        </div>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto p-3 space-y-3">
        {!isOnline ? (
          <div className="flex items-center justify-center h-24 text-muted-foreground text-xs font-mono">
            {t('telemetry.nodeOfflineShort')}
          </div>
        ) : stats ? (
          <>
            {/* System Info Panel */}
            <div className="space-y-1.5 p-2.5 rounded-md bg-muted/20 border border-border/30">
              <div className="flex items-center gap-1.5 mb-2">
                <Server className="h-3 w-3 text-primary" />
                <span className="text-xs font-display font-bold text-muted-foreground uppercase">{t('info.system')}</span>
              </div>
              <div className="grid grid-cols-2 gap-x-3 gap-y-1 text-xs font-mono">
                <span className="text-muted-foreground">{t('label.cpu')}</span>
                <span className="truncate" title={node.cpu_name}>{node.cpu_name || '-'}</span>
                <span className="text-muted-foreground">{t('label.cores')}</span>
                <span>{node.cpu_cores}C</span>
                <span className="text-muted-foreground">{t('label.arch')}</span>
                <span>{node.arch || '-'}</span>
                <span className="text-muted-foreground">{t('label.os')}</span>
                <span className="truncate" title={node.os}>{node.os || '-'}</span>
                <span className="text-muted-foreground">{t('label.virt')}</span>
                <span>{node.virtualization || '-'}</span>
                <span className="text-muted-foreground">{t('label.region')}</span>
                <span>{node.region || '-'}</span>
                {node.kernel_version && (
                  <>
                    <span className="text-muted-foreground">{t('label.kernel')}</span>
                    <span className="truncate" title={node.kernel_version}>{node.kernel_version}</span>
                  </>
                )}
              </div>
            </div>

            {/* Resource Gauges */}
            <div className="space-y-2.5">
              {/* CPU */}
              <div className="space-y-1">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-1.5">
                    <Cpu className="h-3.5 w-3.5 text-primary" />
                    <span className="text-xs font-mono font-bold">{t('label.cpu')}</span>
                  </div>
                  <span className={cn('text-xs font-mono font-bold', {
                    'text-red-500': cpuStatus === 'critical',
                    'text-yellow-500': cpuStatus === 'warning',
                  })}>
                    {cpuUsage.toFixed(1)}%
                  </span>
                </div>
                <Progress value={cpuUsage} className="h-1.5" indicatorClassName={statusColorMap[cpuStatus]} />
              </div>

              {/* RAM */}
              <div className="space-y-1">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-1.5">
                    <MemoryStick className="h-3.5 w-3.5 text-primary" />
                    <span className="text-xs font-mono font-bold">{t('label.ram')}</span>
                    <span className="text-xs text-muted-foreground font-mono">
                      {prettyBytes(stats.ram.used)}/{prettyBytes(stats.ram.total)}
                    </span>
                  </div>
                  <span className={cn('text-xs font-mono font-bold', {
                    'text-red-500': ramStatus === 'critical',
                    'text-yellow-500': ramStatus === 'warning',
                  })}>
                    {ramUsage.toFixed(1)}%
                  </span>
                </div>
                <Progress value={ramUsage} className="h-1.5" indicatorClassName={statusColorMap[ramStatus]} />
              </div>

              {/* SWAP */}
              {stats.swap.total > 0 && (
                <div className="space-y-1">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-1.5">
                      <Layers className="h-3.5 w-3.5 text-muted-foreground" />
                      <span className="text-xs font-mono font-bold">{t('label.swap')}</span>
                    <span className="text-xs text-muted-foreground font-mono">
                        {prettyBytes(stats.swap.used)}/{prettyBytes(stats.swap.total)}
                    </span>
                    </div>
                    <span className="text-xs font-mono font-bold">
                      {swapUsage.toFixed(1)}%
                    </span>
                  </div>
                  <Progress value={swapUsage} className="h-1.5" />
                </div>
              )}

              {/* Disk */}
              <div className="space-y-1">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-1.5">
                    <HardDrive className="h-3.5 w-3.5 text-primary" />
                    <span className="text-xs font-mono font-bold">{t('label.disk')}</span>
                    <span className="text-xs text-muted-foreground font-mono">
                      {prettyBytes(stats.disk.used)}/{prettyBytes(stats.disk.total)}
                    </span>
                  </div>
                  <span className={cn('text-xs font-mono font-bold', {
                    'text-red-500': diskStatus === 'critical',
                    'text-yellow-500': diskStatus === 'warning',
                  })}>
                    {diskUsage.toFixed(1)}%
                  </span>
                </div>
                <Progress value={diskUsage} className="h-1.5" indicatorClassName={statusColorMap[diskStatus]} />
              </div>
            </div>

            {/* Load & Process */}
            <div className="grid grid-cols-3 gap-1.5">
              <div className="p-2 rounded-md bg-muted/20 border border-border/30 text-center">
                <div className="text-xs font-mono text-muted-foreground">{t('label.load1m')}</div>
                <div className="text-sm font-mono font-bold">{stats.load.load1.toFixed(2)}</div>
              </div>
              <div className="p-2 rounded-md bg-muted/20 border border-border/30 text-center">
                <div className="text-xs font-mono text-muted-foreground">{t('label.load5m')}</div>
                <div className="text-sm font-mono font-bold">{stats.load.load5.toFixed(2)}</div>
              </div>
              <div className="p-2 rounded-md bg-muted/20 border border-border/30 text-center">
                <div className="text-xs font-mono text-muted-foreground">{t('label.load15m')}</div>
                <div className="text-sm font-mono font-bold">{stats.load.load15.toFixed(2)}</div>
              </div>
            </div>

            {/* Network */}
            <div className="p-2.5 rounded-md bg-muted/20 border border-border/30 space-y-2">
              <div className="flex items-center gap-1.5">
                <Network className="h-3.5 w-3.5 text-primary" />
                <span className="text-xs font-display font-bold text-muted-foreground uppercase">{t('label.network')}</span>
              </div>
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <div className="text-xs font-mono text-muted-foreground">{t('label.upload')}</div>
                  <div className="text-sm font-mono font-bold">{formatSpeed(stats.network.up)}</div>
                </div>
                <div>
                  <div className="text-xs font-mono text-muted-foreground">{t('label.download')}</div>
                  <div className="text-sm font-mono font-bold">{formatSpeed(stats.network.down)}</div>
                </div>
                <div>
                  <div className="text-xs font-mono text-muted-foreground">{t('label.totalUp')}</div>
                  <div className="text-sm font-mono font-bold">
                    {stats.network.totalUp ? formatBytes(stats.network.totalUp) : t('label.na')}
                  </div>
                </div>
                <div>
                  <div className="text-xs font-mono text-muted-foreground">{t('label.totalDown')}</div>
                  <div className="text-sm font-mono font-bold">
                    {stats.network.totalDown ? formatBytes(stats.network.totalDown) : t('label.na')}
                  </div>
                </div>
              </div>
            </div>

            {/* Bottom row: connections + process + uptime */}
            <div className={cn('grid gap-1.5', isLoggedIn ? 'grid-cols-3' : 'grid-cols-1')}>
              {isLoggedIn && (
                <>
                  <div className="p-2 rounded-md bg-muted/20 border border-border/30 text-center">
                    <div className="text-xs font-mono text-muted-foreground">{t('label.tcpUdp')}</div>
                    <div className="text-sm font-mono font-bold">{stats.connections.tcp}/{stats.connections.udp}</div>
                  </div>
                  <div className="p-2 rounded-md bg-muted/20 border border-border/30 text-center">
                    <div className="text-xs font-mono text-muted-foreground">{t('label.proc')}</div>
                    <div className="text-sm font-mono font-bold">{stats.process}</div>
                  </div>
                </>
              )}
              <div className="p-2 rounded-md bg-muted/20 border border-border/30 text-center">
                <div className="text-xs font-mono text-muted-foreground">{t('label.uptime')}</div>
                <div className="text-sm font-mono font-bold">{formatUptime(stats.uptime)}</div>
              </div>
            </div>

            {/* Traffic limit */}
            {!!(node.traffic_limit && node.traffic_limit > 0 && node.traffic_limit_type && node.traffic_limit_type !== 'no_limit') && (
              <div className="p-2.5 rounded-md bg-muted/20 border border-border/30 space-y-1">
                <div className="flex items-center justify-between text-xs font-mono">
                  <span className="text-muted-foreground">{t('label.traffic')} ({formatTrafficType(node.traffic_limit_type as TrafficLimitType)})</span>
                  <span className={cn(
                    'font-bold',
                    (() => {
                      const used = calcTrafficUsage(stats.network.totalUp, stats.network.totalDown, node.traffic_limit_type as TrafficLimitType);
                      const pct = (used / node.traffic_limit!) * 100;
                      return pct >= 90 ? 'text-red-500' : pct >= 70 ? 'text-yellow-500' : '';
                    })()
                  )}>
                    {formatBytes(calcTrafficUsage(stats.network.totalUp, stats.network.totalDown, node.traffic_limit_type as TrafficLimitType))} / {formatBytes(node.traffic_limit)}
                  </span>
                </div>
                <Progress
                  value={Math.min((calcTrafficUsage(stats.network.totalUp, stats.network.totalDown, node.traffic_limit_type as TrafficLimitType) / node.traffic_limit) * 100, 100)}
                  className="h-1.5"
                  indicatorClassName={(() => {
                    const pct = (calcTrafficUsage(stats.network.totalUp, stats.network.totalDown, node.traffic_limit_type as TrafficLimitType) / node.traffic_limit) * 100;
                    return pct >= 90 ? 'bg-red-500' : pct >= 70 ? 'bg-yellow-500' : '';
                  })()}
                />
              </div>
            )}

            {/* Expiry & remark - login required */}
            {(() => {
              if (!isLoggedIn || node.price === -1) return null;
              const expiryStatus = getExpiryStatus(node.expired_at);
              return expiryStatus ? (
                <div className={cn(
                  'text-xxs font-mono px-2.5',
                  expiryStatus === 'expired' ? 'text-red-500' : expiryStatus === 'warning' ? 'text-yellow-500' : 'text-muted-foreground/60',
                )}>
                  {formatExpiry(node.expired_at)}
                </div>
              ) : null;
            })()}
            {node.public_remark && (
              <div className="text-xxs font-mono text-muted-foreground/60 px-2.5 border-l-2 border-primary/20">
                {node.public_remark}
              </div>
            )}
          </>
        ) : null}

        {/* View Charts Button */}
        <div className="flex gap-2">
          <Button
            variant="outline"
            size="sm"
            className="flex-1 text-xs font-mono border-primary/30 hover:bg-primary/15 hover:text-primary"
            onClick={() => onViewCharts(node.uuid, node.name)}
          >
            <BarChart3 className="h-3 w-3 mr-1.5" />
            {t('action.charts')}
          </Button>
          <Button
            variant="outline"
            size="sm"
            className="flex-1 text-xs font-mono border-primary/30 hover:bg-primary/15 hover:text-primary"
            onClick={() => navigate(`/node/${node.uuid}`)}
          >
            <ExternalLink className="h-3 w-3 mr-1.5" />
            {t('action.detail')}
          </Button>
        </div>
      </div>
    </div>
  );
}

export function Sidebar({ nodes, selectedNodeId, onSelectNode, onViewCharts, className }: SidebarProps) {
  const [view, setView] = useState<'list' | 'detail'>('list');

  const selectedNode = useMemo(
    () => nodes.find((n: NodeWithStatus) => n.uuid === selectedNodeId) ?? null,
    [nodes, selectedNodeId]
  );

  const handleSelectNode = (uuid: string) => {
    onSelectNode(uuid);
    setView('detail');
  };

  const handleBack = () => {
    setView('list');
    onSelectNode(null);
  };

  return (
    <div className={cn(
      'flex flex-col h-full bg-card/80 backdrop-blur-xl border border-border/50 rounded-lg overflow-hidden',
      'shadow-lg commander-corners',
      className
    )}>
      <span className="corner-bottom" />
      <AnimatePresence mode="wait" initial={false}>
        {view === 'list' || !selectedNode ? (
          <motion.div
            key="list"
            initial={{ x: -20, opacity: 0 }}
            animate={{ x: 0, opacity: 1 }}
            exit={{ x: -20, opacity: 0 }}
            transition={{ duration: 0.2 }}
            className="flex-1 overflow-hidden flex flex-col"
          >
            <NodeListView
              nodes={nodes}
              selectedNodeId={selectedNodeId}
              onSelectNode={handleSelectNode}
            />
          </motion.div>
        ) : (
          <motion.div
            key="detail"
            initial={{ x: 20, opacity: 0 }}
            animate={{ x: 0, opacity: 1 }}
            exit={{ x: 20, opacity: 0 }}
            transition={{ duration: 0.2 }}
            className="flex-1 overflow-hidden flex flex-col"
          >
            <NodeDetailView
              node={selectedNode}
              onBack={handleBack}
              onViewCharts={onViewCharts}
            />
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
