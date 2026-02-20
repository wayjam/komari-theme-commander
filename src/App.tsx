import { ThemeSwitcher } from './components/ThemeSwitcher'
import { LanguageSwitcher } from './components/LanguageSwitcher'
import { NodeList } from './components/NodeList'
import { NodeCharts } from './components/NodeCharts'
import { NodeNetwork } from './components/NodeNetwork'
import { GlobeView } from './components/GlobeView'
import { WebSocketStatus } from './components/WebSocketStatus'
import { EffectsOverlay } from './components/EffectsOverlay'
import { Starfield } from './components/Starfield'
import { ChartModal } from './components/ChartModal'
import { CircularGauge } from './components/CircularGauge'
import { Button } from './components/ui/button'
import { useNodes } from './hooks/useNodes'
import { useEffects } from './hooks/useEffects'
import { useAppConfig } from './hooks/useAppConfig'
import { RecentStatsProvider } from './hooks/useRecentStats'
import { UptimeView } from './components/UptimeView'
import { ArrowLeft, Settings, Globe, LayoutGrid, List, Shield, Cpu, MemoryStick, HardDrive, Activity, Network, Clock, User, Monitor, Box, Layers, AlertTriangle, ExternalLink } from 'lucide-react'
import { useState, useEffect, useCallback, useMemo, createContext, useContext } from 'react'
import { useTranslation } from 'react-i18next'
import { Routes, Route, useNavigate, useParams, useLocation, Link } from 'react-router-dom'
import { apiService } from './services/api'
import { formatSpeed, formatBytes, formatUptime, getUsageStatus, calcTrafficUsage, formatTrafficType, getExpiryStatus, formatExpiry, cn, extractRegionEmoji, extractRegionText } from './lib/utils'
import type { TrafficLimitType } from './lib/utils'
import type { NodeWithStatus } from './services/api'
import { Tooltip, TooltipTrigger, TooltipContent } from './components/ui/tooltip'
import dayjs from 'dayjs'
import './App.css'

type ViewMode = 'globe' | 'grid' | 'table' | 'uptime';

function getInitialViewMode(): ViewMode {
  const saved = localStorage.getItem('nodeViewMode');
  if (saved === 'globe' || saved === 'grid' || saved === 'table' || saved === 'uptime') return saved;
  return 'globe';
}

/* ══════════════════════════════════════════════════════════════
   Shared context so useNodes is only called once at App level
   ══════════════════════════════════════════════════════════════ */
interface NodesContextType {
  nodes: NodeWithStatus[];
  loading: boolean;
  refreshNodes: () => Promise<void>;
}

const NodesContext = createContext<NodesContextType>({
  nodes: [],
  loading: false,
  refreshNodes: async () => {},
});

function useNodesContext() {
  return useContext(NodesContext);
}

/* ══════════════════════════════════════════════════════════════
   View mode context — shared between App header and Dashboard
   ══════════════════════════════════════════════════════════════ */
interface ViewModeContextType {
  viewMode: ViewMode;
  setViewMode: (mode: ViewMode) => void;
}

const ViewModeContext = createContext<ViewModeContextType>({
  viewMode: 'globe',
  setViewMode: () => {},
});

/* ══════════════════════════════════════════════════════════════
   Route: Node Detail (Charts)
   ══════════════════════════════════════════════════════════════ */
function NodeInfoPanel({ node }: { node: NodeWithStatus }) {
  const { t } = useTranslation();
  const appConfig = useAppConfig();
  const isOnline = node.status === 'online';
  const stats = node.stats;
  const cpuUsage = stats?.cpu?.usage ?? 0;
  const ramUsage = stats ? (stats.ram.used / stats.ram.total) * 100 : 0;
  const diskUsage = stats ? (stats.disk.used / stats.disk.total) * 100 : 0;
  const isFree = node.price === -1;
  const expiryStatus = (isFree || !appConfig.isLoggedIn) ? null : getExpiryStatus(node.expired_at);
  const hasTraffic = !!(node.traffic_limit && node.traffic_limit > 0 && node.traffic_limit_type && node.traffic_limit_type !== 'no_limit');

  return (
    <div className="rounded-lg border border-border/50 bg-card/80 backdrop-blur-xl p-4">
      {/* Row 1: Name + Status + System Info */}
      <div className="flex flex-col sm:flex-row sm:items-center gap-3 mb-4">
        <div className="flex items-center gap-2 min-w-0">
          <span className={cn('w-2.5 h-2.5 rounded-full shrink-0', isOnline ? 'bg-green-500 animate-pulse' : 'bg-red-500')} />
          <h2 className="text-base font-display font-bold truncate">{node.name}</h2>
          {appConfig.isLoggedIn && (
            <Tooltip>
              <TooltipTrigger asChild>
                <span className="text-xxs font-mono text-muted-foreground/40 cursor-default select-all">{node.uuid}</span>
              </TooltipTrigger>
              <TooltipContent side="bottom" className="text-xs font-mono">UUID: {node.uuid}</TooltipContent>
            </Tooltip>
          )}
          {isOnline && stats?.updated_at ? (
            <Tooltip>
              <TooltipTrigger asChild>
                <span className={cn('text-xxs font-mono font-bold px-1.5 py-0.5 rounded cursor-default', 'bg-green-500/15 text-green-500')}>
                  {t('status.online')}
                </span>
              </TooltipTrigger>
              <TooltipContent side="bottom" className="text-xs font-mono">
                {t('label.lastReport')}: {new Date(stats.updated_at).toLocaleString()}
              </TooltipContent>
            </Tooltip>
          ) : (
            <span className={cn('text-xxs font-mono font-bold px-1.5 py-0.5 rounded', isOnline ? 'bg-green-500/15 text-green-500' : 'bg-red-500/15 text-red-500')}>
              {isOnline ? t('status.online') : t('status.offline')}
            </span>
          )}
          {node.group && (
            <span className="text-xxs font-mono font-bold px-1.5 py-0.5 rounded bg-primary/15 text-primary">[{node.group}]</span>
          )}
          {node.hidden && (
            <span className="text-xxs font-mono font-bold px-1.5 py-0.5 rounded bg-yellow-500/15 text-yellow-500">
              {t('node.hidden')}
            </span>
          )}
          {node.ipv6 && (
            <span className="text-xxs font-mono font-bold px-1.5 py-0.5 rounded bg-blue-500/15 text-blue-500">
              IPv6
            </span>
          )}
        </div>
        <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs font-mono text-muted-foreground sm:ml-auto">
          {node.region && (
            <Tooltip>
              <TooltipTrigger asChild>
                <span className="cursor-default">{node.region}</span>
              </TooltipTrigger>
              <TooltipContent side="bottom" className="whitespace-pre-line text-xs">
                {(() => {
                  const emoji = extractRegionEmoji(node.region);
                  const regionName = extractRegionText(node.region);
                  const displayName = regionName || (emoji ? '' : node.region);
                  return displayName ? `${emoji} ${displayName}` : emoji || node.region;
                })()}
              </TooltipContent>
            </Tooltip>
          )}
          {expiryStatus && (
            <Tooltip>
              <TooltipTrigger asChild>
                <span className={cn(
                  'cursor-default',
                  expiryStatus === 'expired' ? 'text-red-500' : expiryStatus === 'warning' ? 'text-yellow-500' : 'text-muted-foreground',
                )}>
                  {formatExpiry(node.expired_at)}
                </span>
              </TooltipTrigger>
              <TooltipContent side="bottom" className="whitespace-pre-line text-xs">
                {appConfig.isLoggedIn
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
      </div>

      {/* Tags row */}
      {(() => {
        const tagList = node.tags ? node.tags.split(/[,;]/).map(t => t.trim()).filter(Boolean) : [];
        return tagList.length > 0 ? (
          <div className="flex flex-wrap items-center gap-1.5 mb-3">
            {tagList.map((tag, i) => (
              <span key={i} className="text-xs font-mono text-muted-foreground/80 bg-muted/50 px-1.5 py-0.5 rounded-sm">
                {tag}
              </span>
            ))}
          </div>
        ) : null;
      })()}

      {/* Public remark */}
      {node.public_remark && (
        <div className="text-xs font-mono text-muted-foreground/70 mb-3 pl-2 border-l-2 border-primary/20">
          {node.public_remark}
        </div>
      )}

      {/* Private remark (admin only) */}
      {appConfig.isLoggedIn && node.remark && (
        <div className="text-xs font-mono text-muted-foreground/50 mb-3 pl-2 border-l-2 border-yellow-500/30">
          <span className="text-xxs font-bold text-yellow-500/60 uppercase mr-1.5">{t('label.privateRemark')}</span>
          {node.remark}
        </div>
      )}

      {/* Row 2: System specs */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 mb-4 pb-3 border-b border-border/30">
        {node.cpu_name && (
          <Tooltip>
            <TooltipTrigger asChild>
              <div className="flex items-start gap-2 p-2 rounded bg-muted/10 border border-border/15 cursor-default">
                <Cpu className="h-3.5 w-3.5 text-primary mt-0.5 flex-shrink-0" />
                <div className="min-w-0">
                  <div className="text-xs font-mono text-muted-foreground/60 uppercase">{t('label.cpu')}</div>
                  <div className="text-xs font-mono text-foreground/80 truncate">{node.cpu_name} ({node.cpu_cores}C)</div>
                </div>
              </div>
            </TooltipTrigger>
            <TooltipContent side="bottom" className="max-w-xs text-xs font-mono">
              {node.cpu_name} ({node.cpu_cores}C)
            </TooltipContent>
          </Tooltip>
        )}
        {node.os && (
          <Tooltip>
            <TooltipTrigger asChild>
              <div className="flex items-start gap-2 p-2 rounded bg-muted/10 border border-border/15 cursor-default">
                <Monitor className="h-3.5 w-3.5 text-primary mt-0.5 flex-shrink-0" />
                <div className="min-w-0">
                  <div className="text-xs font-mono text-muted-foreground/60 uppercase">{t('label.system')}</div>
                  <div className="text-xs font-mono text-foreground/80 truncate">
                    {node.os}{node.kernel_version ? ` · ${node.kernel_version}` : ''}
                  </div>
                </div>
              </div>
            </TooltipTrigger>
            <TooltipContent side="bottom" className="max-w-xs text-xs font-mono whitespace-pre-line">
              {node.os}{node.kernel_version ? `\n${t('label.kernel')}: ${node.kernel_version}` : ''}
            </TooltipContent>
          </Tooltip>
        )}
        {node.arch && (
          <Tooltip>
            <TooltipTrigger asChild>
              <div className="flex items-start gap-2 p-2 rounded bg-muted/10 border border-border/15 cursor-default">
                <Layers className="h-3.5 w-3.5 text-primary mt-0.5 flex-shrink-0" />
                <div className="min-w-0">
                  <div className="text-xs font-mono text-muted-foreground/60 uppercase">{t('label.arch')}</div>
                  <div className="text-xs font-mono text-foreground/80 truncate">
                    {node.arch}{node.virtualization ? ` · ${node.virtualization}` : ''}
                  </div>
                </div>
              </div>
            </TooltipTrigger>
            <TooltipContent side="bottom" className="max-w-xs text-xs font-mono">
              {node.arch}{node.virtualization ? ` · ${node.virtualization}` : ''}
            </TooltipContent>
          </Tooltip>
        )}
        {node.gpu_name && (
          <Tooltip>
            <TooltipTrigger asChild>
              <div className="flex items-start gap-2 p-2 rounded bg-muted/10 border border-border/15 cursor-default">
                <Box className="h-3.5 w-3.5 text-primary mt-0.5 flex-shrink-0" />
                <div className="min-w-0">
                  <div className="text-xs font-mono text-muted-foreground/60 uppercase">{t('label.gpu')}</div>
                  <div className="text-xs font-mono text-foreground/80 truncate">{node.gpu_name}</div>
                </div>
              </div>
            </TooltipTrigger>
            <TooltipContent side="bottom" className="max-w-xs text-xs font-mono">
              {node.gpu_name}
            </TooltipContent>
          </Tooltip>
        )}
      </div>

      {/* Row 3: Live stats — circular gauges + info cards */}
      {stats ? (
        <>
          {/* Circular gauges row */}
          <div className="grid grid-cols-3 gap-3 mb-3">
            <CircularGauge
              label={t('label.cpu')}
              value={cpuUsage}
              icon={<Cpu className="h-3 w-3 text-muted-foreground" />}
              status={getUsageStatus(cpuUsage, { warning: 60, critical: 80 })}
            />
            <CircularGauge
              label={t('label.ram')}
              value={ramUsage}
              icon={<MemoryStick className="h-3 w-3 text-muted-foreground" />}
              status={getUsageStatus(ramUsage, { warning: 70, critical: 85 })}
              detail={`${formatBytes(stats.ram.used)} / ${formatBytes(stats.ram.total)}`}
              subDetail={stats.swap.total > 0 ? `${t('label.swap')}: ${formatBytes(stats.swap.used)} / ${formatBytes(stats.swap.total)}` : undefined}
            />
            <CircularGauge
              label={t('label.disk')}
              value={diskUsage}
              icon={<HardDrive className="h-3 w-3 text-muted-foreground" />}
              status={getUsageStatus(diskUsage, { warning: 75, critical: 90 })}
              detail={`${formatBytes(stats.disk.used)} / ${formatBytes(stats.disk.total)}`}
            />
          </div>

          {/* Info cards row */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <div className="p-2.5 rounded bg-muted/15 border border-border/20">
              <div className="flex items-center justify-between mb-1">
                <div className="flex items-center gap-1.5">
                  <Network className="h-3 w-3 text-muted-foreground" />
                  <span className="text-xs font-mono text-muted-foreground">{t('label.network')}</span>
                </div>
                <Link
                  to={`/node/${node.uuid}/network`}
                  className="flex items-center gap-0.5 text-xxs font-mono text-primary hover:underline"
                >
                  {t('label.networkDetail')}
                  <ExternalLink className="h-2.5 w-2.5" />
                </Link>
              </div>
              <div className="text-xs font-mono font-bold tabular-nums">
                <span className="text-primary">↑</span> {formatSpeed(stats.network.up)}
              </div>
              <div className="text-xs font-mono font-bold tabular-nums mt-0.5">
                <span className="text-accent">↓</span> {formatSpeed(stats.network.down)}
              </div>
              {appConfig.isLoggedIn && (
                <div className="flex items-center gap-2 mt-1.5 pt-1.5 border-t border-border/15">
                  <span className="text-xxs font-mono text-muted-foreground/60">{t('label.tcp')}</span>
                  <span className="text-xxs font-mono font-bold tabular-nums">{stats.connections.tcp}</span>
                  <span className="text-xxs text-muted-foreground/20">|</span>
                  <span className="text-xxs font-mono text-muted-foreground/60">{t('label.udp')}</span>
                  <span className="text-xxs font-mono font-bold tabular-nums">{stats.connections.udp}</span>
                </div>
              )}
            </div>
            <div className="p-2.5 rounded bg-muted/15 border border-border/20">
              <div className="flex items-center gap-1.5 mb-1">
                <Activity className="h-3 w-3 text-muted-foreground" />
                <span className="text-xs font-mono text-muted-foreground">{t('label.load')}</span>
              </div>
              <div className="text-lg font-mono font-bold tabular-nums">
                {stats.load.load1.toFixed(2)}
              </div>
              <div className="grid grid-cols-3 gap-1 mt-1.5 pt-1.5 border-t border-border/15">
                <div>
                  <div className="text-xxs font-mono text-muted-foreground/60">{t('label.load1m')}</div>
                  <div className="text-sm font-mono font-bold tabular-nums">{stats.load.load1.toFixed(2)}</div>
                </div>
                <div>
                  <div className="text-xxs font-mono text-muted-foreground/60">{t('label.load5m')}</div>
                  <div className="text-sm font-mono font-bold tabular-nums">{stats.load.load5.toFixed(2)}</div>
                </div>
                <div>
                  <div className="text-xxs font-mono text-muted-foreground/60">{t('label.load15m')}</div>
                  <div className="text-sm font-mono font-bold tabular-nums">{stats.load.load15.toFixed(2)}</div>
                </div>
              </div>
            </div>
            <div className="p-2.5 rounded bg-muted/15 border border-border/20">
              <div className="flex items-center gap-1.5 mb-1">
                <Clock className="h-3 w-3 text-muted-foreground" />
                <span className="text-xs font-mono text-muted-foreground">{t('label.uptime')}</span>
              </div>
              <div className="text-lg font-mono font-bold tabular-nums">
                {formatUptime(stats.uptime, 'minute')}
              </div>
            </div>
          </div>

          {/* Traffic limit bar */}
          {hasTraffic && (
            <div className="mt-3 p-2.5 rounded bg-muted/15 border border-border/20">
              <div className="flex items-center justify-between mb-1">
                <span className="text-xs font-mono text-muted-foreground">
                  {t('label.traffic')} ({formatTrafficType(node.traffic_limit_type!)})
                </span>
                <span className={cn(
                  'text-xs font-mono font-bold tabular-nums',
                  (() => {
                    const used = calcTrafficUsage(stats.network.totalUp, stats.network.totalDown, node.traffic_limit_type as TrafficLimitType);
                    const pct = (used / node.traffic_limit!) * 100;
                    return pct >= 90 ? 'text-red-500' : pct >= 70 ? 'text-yellow-500' : '';
                  })()
                )}>
                  {formatBytes(calcTrafficUsage(stats.network.totalUp, stats.network.totalDown, node.traffic_limit_type as TrafficLimitType))} / {formatBytes(node.traffic_limit!)}
                </span>
              </div>
              <div className="h-[4px] w-full bg-muted/40 rounded-full overflow-hidden">
                {(() => {
                  const used = calcTrafficUsage(stats.network.totalUp, stats.network.totalDown, node.traffic_limit_type as TrafficLimitType);
                  const pct = (used / node.traffic_limit!) * 100;
                  const s = getUsageStatus(pct, { warning: 70, critical: 90 });
                  return (
                    <div
                      className={cn(
                        'h-full rounded-full transition-all duration-700',
                        s === 'critical' ? 'bg-red-500' : s === 'warning' ? 'bg-yellow-500' : 'bg-primary',
                      )}
                      style={{ width: `${Math.min(pct, 100)}%` }}
                    />
                  );
                })()}
              </div>
            </div>
          )}
        </>
      ) : (
        <div className="flex items-center justify-center h-16 text-muted-foreground text-xs font-mono">
          {isOnline ? t('telemetry.waiting') : t('telemetry.nodeOffline')}
        </div>
      )}
    </div>
  );
}

function NodeDetailRoute() {
  const { t } = useTranslation();
  const { uuid } = useParams<{ uuid: string }>();
  const navigate = useNavigate();
  const { nodes } = useNodesContext();
  const node = nodes.find(n => n.uuid === uuid);
  const [nodeName, setNodeName] = useState('');

  useEffect(() => {
    if (node) {
      setNodeName(node.name);
    } else if (uuid) {
      apiService.getNodes().then(all => {
        const found = all.find(n => n.uuid === uuid);
        if (found) setNodeName(found.name);
      });
    }
  }, [uuid, node]);

  if (!uuid) return null;

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-3">
        <Button
          variant="ghost"
          size="sm"
          onClick={() => navigate('/')}
          className="h-7 px-2 text-xs font-mono hover:bg-primary/15 hover:text-primary"
        >
          <ArrowLeft className="h-3.5 w-3.5 mr-1" />
          {t('action.back')}
        </Button>
        <span className="text-xs font-mono text-muted-foreground">
          / {nodeName || uuid}
        </span>
      </div>

      {/* Node Info Panel */}
      {node && <NodeInfoPanel node={node} />}

      {/* Charts */}
      <NodeCharts nodeUuid={uuid} nodeName={nodeName} />
    </div>
  );
}

/* ══════════════════════════════════════════════════════════════
   Route: Node Network
   ══════════════════════════════════════════════════════════════ */
function NodeNetworkRoute() {
  const { uuid } = useParams<{ uuid: string }>();
  const { nodes } = useNodesContext();
  const node = nodes.find(n => n.uuid === uuid);
  if (!uuid) return null;
  return <NodeNetwork nodeUuid={uuid} node={node} />;
}

/* ══════════════════════════════════════════════════════════════
   Dashboard (home page)
   ══════════════════════════════════════════════════════════════ */
function Dashboard() {
  const { viewMode } = useContext(ViewModeContext);
  const [chartModal, setChartModal] = useState<{ uuid: string; name: string } | null>(null);
  const navigate = useNavigate();
  const { nodes, loading, refreshNodes } = useNodesContext();

  const handleViewCharts = (uuid: string, name: string) => {
    if (viewMode === 'globe') {
      setChartModal({ uuid, name });
    } else {
      navigate(`/node/${uuid}`);
    }
  };

  return (
    <>
      {viewMode === 'globe' ? (
        <GlobeView nodes={nodes} onViewCharts={handleViewCharts} />
      ) : viewMode === 'uptime' ? (
        <UptimeView nodes={nodes} />
      ) : (
        <NodeList
          nodes={nodes}
          loading={loading}
          onRefresh={refreshNodes}
          onViewCharts={handleViewCharts}
          defaultView={viewMode === 'grid' ? 'grid' : 'table'}
        />
      )}

      {chartModal && (
        <ChartModal
          nodeUuid={chartModal.uuid}
          nodeName={chartModal.name}
          onClose={() => setChartModal(null)}
        />
      )}
    </>
  );
}

/* ══════════════════════════════════════════════════════════════
   App Shell
   ══════════════════════════════════════════════════════════════ */
function App() {
  const { t } = useTranslation();
  const [siteName, setSiteName] = useState('Komari Monitor');
  const [siteDescription, setSiteDescription] = useState('');
  const [version, setVersion] = useState('');
  const [customBody, setCustomBody] = useState<string>('');
  const [viewMode, setViewMode] = useState<ViewMode>(getInitialViewMode);
  const navigate = useNavigate();
  const location = useLocation();

  const { nodes, loading, refreshNodes, getOnlineCount, getOfflineCount } = useNodes();
  const { activeEffects } = useEffects();
  const appConfig = useAppConfig();

  const handleSetViewMode = useCallback((mode: ViewMode) => {
    setViewMode(mode);
    localStorage.setItem('nodeViewMode', mode);
  }, []);

  useEffect(() => {
    const init = async () => {
      try {
        const [publicSettings, versionInfo] = await Promise.all([
          apiService.getPublicSettings(),
          apiService.getVersion(),
        ]);
        if (publicSettings?.sitename) setSiteName(publicSettings.sitename);
        if (publicSettings?.description) setSiteDescription(publicSettings.description);
        if (publicSettings?.custom_body) setCustomBody(publicSettings.custom_body);
        if (versionInfo?.version) setVersion(versionInfo.version);
      } catch (e) {
        console.error('Failed to fetch init data:', e);
      }
    };
    init();
  }, []);

  const onlineCount = getOnlineCount();
  const offlineCount = getOfflineCount();

  const getTotalNetworkStats = () => {
    let totalUp = 0;
    let totalDown = 0;
    nodes.forEach(node => {
      if (node.status === 'online' && node.stats?.network) {
        totalUp += node.stats.network.up || 0;
        totalDown += node.stats.network.down || 0;
      }
    });
    return { totalUp, totalDown };
  };

  const networkStats = getTotalNetworkStats();

  const isDashboard = location.pathname === '/';

  const [currentTime, setCurrentTime] = useState(new Date());

  useEffect(() => {
    const timer = setInterval(() => setCurrentTime(new Date()), 1000);
    return () => clearInterval(timer);
  }, []);

  const onlineUuids = useMemo(
    () => nodes.filter(n => n.status === 'online').map(n => n.uuid),
    [nodes],
  );

  const hasCriticalNode = useMemo(() => {
    return nodes.some(n => {
      if (!n.stats || n.status !== 'online') return false;
      return n.stats.cpu.usage > 90 || (n.stats.ram.used / n.stats.ram.total) > 0.95;
    });
  }, [nodes]);

  const viewButtons: { mode: ViewMode; icon: typeof Globe; label: string }[] = [
    { mode: 'globe', icon: Globe, label: t('view.globe') },
    { mode: 'grid', icon: LayoutGrid, label: t('view.grid') },
    { mode: 'table', icon: List, label: t('view.table') },
    { mode: 'uptime', icon: Shield, label: t('view.uptime') },
  ];

  return (
    <NodesContext.Provider value={{ nodes, loading, refreshNodes }}>
      <RecentStatsProvider onlineUuids={onlineUuids}>
      <ViewModeContext.Provider value={{ viewMode, setViewMode: handleSetViewMode }}>
        <div className="min-h-screen flex flex-col bg-background text-foreground">
          {/* ═══ Header ═══ */}
          <header className="sticky top-0 z-50 border-b border-border/50 bg-background/85 backdrop-blur-xl">
            <div className="commander-scanner-effect" />
            <div className="container mx-auto px-3 sm:px-4 h-12 flex items-center justify-between gap-2 relative z-10">
              <div className="flex items-center gap-3 min-w-0">
                <button
                  onClick={() => navigate('/')}
                  className="text-2xl sm:text-xl font-bold font-display truncate hover:text-primary transition-colors cursor-pointer"
                  title={siteDescription || siteName}
                >
                  {siteName}
                </button>
                <div className="hidden sm:flex items-center gap-2 text-xs font-mono text-muted-foreground">
                  <span className="flex items-center gap-1">
                    <span className="w-1.5 h-1.5 rounded-full bg-green-500" />
                    {onlineCount}
                  </span>
                  <span>/</span>
                  <span className="flex items-center gap-1">
                    <span className="w-1.5 h-1.5 rounded-full bg-red-500" />
                    {offlineCount}
                  </span>
                </div>

                {hasCriticalNode && (
                  <div className="flex items-center gap-1.5 px-2 py-0.5 rounded bg-red-500/10 border border-red-500/20 text-xs font-mono text-red-500 animate-pulse">
                    <AlertTriangle className="h-3 w-3" />
                    <span className="hidden lg:inline uppercase tracking-widest">System Threat Detected</span>
                    <span className="lg:hidden uppercase">Threat</span>
                  </div>
                )}
              </div>
              <div className="flex items-center gap-1.5 sm:gap-2">
                <div className="flex border border-border/50 rounded overflow-hidden">
                  {viewButtons.map(({ mode, icon: Icon, label }) => (
                    <button
                      key={mode}
                      onClick={() => {
                        handleSetViewMode(mode);
                        if (!isDashboard) navigate('/');
                      }}
                      className={`p-1.5 transition-colors cursor-pointer ${viewMode === mode ? 'bg-primary text-primary-foreground' : 'hover:bg-muted/50'}`}
                      title={label}
                    >
                      <Icon className="h-3.5 w-3.5" />
                    </button>
                  ))}
                </div>
                <LanguageSwitcher />
                <ThemeSwitcher />
                {appConfig.isLoggedIn ? (
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => window.location.href = '/admin'}
                    className="h-7 px-2 text-xs font-mono hover:bg-primary/15 hover:text-primary"
                  >
                    <User className="h-3.5 w-3.5 sm:mr-1" />
                    <span className="hidden sm:inline">{appConfig.username || t('action.admin')}</span>
                  </Button>
                ) : (
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => window.location.href = '/admin'}
                    className="h-7 px-2 text-xs font-mono hover:bg-primary/15 hover:text-primary"
                  >
                    <Settings className="h-3.5 w-3.5 sm:mr-1" />
                    <span className="hidden sm:inline">{t('action.admin')}</span>
                  </Button>
                )}
              </div>
            </div>
          </header>

          {/* ═══ Main Content ═══ */}
          <main className="flex-1 container mx-auto px-3 sm:px-4 py-4 sm:py-6">
            <Routes>
              <Route path="/" element={<Dashboard />} />
              <Route path="/node/:uuid" element={<NodeDetailRoute />} />
              <Route path="/node/:uuid/network" element={<NodeNetworkRoute />} />
            </Routes>
          </main>

          {/* ═══ Footer ═══ */}
          <footer className="sticky bottom-0 z-40 border-t border-border/50 bg-background/85 backdrop-blur-xl">
            <div className="container mx-auto px-3 sm:px-4 h-9 flex items-center justify-between text-xs font-mono text-muted-foreground">
              <div className="flex items-center gap-3">
                <WebSocketStatus />
                <span className="hidden sm:inline text-muted-foreground/30">|</span>
                <div className="flex items-center gap-2 px-1.5 py-0.5 rounded">
                  <Clock className="h-3 w-3" />
                  <span className="tabular-nums">{currentTime.toLocaleTimeString()}</span>
                </div>
                <span className="hidden sm:inline text-muted-foreground/60">|</span>
                <div className="hidden sm:flex items-center gap-2">
                  <span>↑ {formatSpeed(networkStats.totalUp)}</span>
                  <span>↓ {formatSpeed(networkStats.totalDown)}</span>
                </div>
              </div>
              <div className="flex items-center gap-2">
                {customBody ? (
                  <span className="hidden sm:inline" dangerouslySetInnerHTML={{ __html: customBody }} />
                ) : (
                  <>
                    <span className="hidden sm:inline">
                      {t('footer.poweredBy')}{' '}
                      <a
                        href="https://github.com/komari-monitor/komari"
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-primary hover:underline"
                      >
                        Komari Monitor
                      </a>
                    </span>
                    {version && (
                      <span className="text-muted-foreground/60">{version}</span>
                    )}
                    <span className="hidden sm:inline text-muted-foreground/40">|</span>
                    <span className="hidden sm:inline">
                      {t('footer.theme')}{' '}
                      <a
                        href="https://github.com/wayjam/komari-theme-commander"
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-primary hover:underline"
                      >
                        Commander
                      </a>
                    </span>
                  </>
                )}
              </div>
            </div>
          </footer>

          <Starfield />
          <EffectsOverlay activeEffects={activeEffects} />
        </div>
      </ViewModeContext.Provider>
      </RecentStatsProvider>
    </NodesContext.Provider>
  );
}

export default App
