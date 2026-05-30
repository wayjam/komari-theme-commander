import { ThemeSwitcher } from './components/ThemeSwitcher'
import { LanguageSwitcher } from './components/LanguageSwitcher'
import { ViewTabs, type ViewTab } from './components/ViewTabs'
import { WebSocketStatus } from './components/WebSocketStatus'
import { EffectsOverlay } from './components/EffectsOverlay'
import { Starfield } from './components/Starfield'
import { CircularGauge } from './components/CircularGauge'
import { HudSpinner } from './components/HudSpinner'
import { RegionFlag } from './components/RegionFlag'
import { RemarkNote } from './components/RemarkNote'
import { TagPill } from './components/TagPill'
import { parseTagList } from './lib/parseTags'
import { getCommanderLogoDataUri } from './lib/commanderLogo'
import { Button } from './components/ui/button'
import { useNodes } from './hooks/useNodes'
import { useEffects } from './hooks/useEffects'
import { useAppConfig } from './hooks/useAppConfig'
import { useTheme } from './hooks/useTheme'
import { RecentStatsProvider } from './hooks/useRecentStats'
import { ArrowLeft, Settings, Globe, LayoutGrid, List, Shield, Cpu, MemoryStick, HardDrive, Activity, Network, Clock, User, AlertTriangle, ExternalLink, Fingerprint } from 'lucide-react'
import { SystemIcon } from '@/lib/systemIcon'
import { useState, useEffect, useCallback, useMemo, createContext, useContext, lazy, Suspense } from 'react'
import { AnimatePresence, motion, useReducedMotion } from 'motion/react'
import { useTranslation } from 'react-i18next'
import { Routes, Route, useNavigate, useParams, useLocation, Link } from 'react-router-dom'
import { apiService } from './services/api'
import { formatSpeed, formatBytes, formatUptime, getUsageStatus, calcTrafficUsage, formatTrafficType, getExpiryStatus, formatExpiry, cn } from './lib/utils'
import { usePrivacyMode } from './hooks/usePrivacyMode'
import type { TrafficLimitType } from './lib/utils'
import type { NodeWithStatus } from './services/api'
import { Tooltip, TooltipTrigger, TooltipContent } from './components/ui/tooltip'
import dayjs from 'dayjs'
import './App.css'

const GlobeView = lazy(() => import('./components/GlobeView').then(m => ({ default: m.GlobeView })));
const NodeList = lazy(() => import('./components/NodeList').then(m => ({ default: m.NodeList })));
const UptimeView = lazy(() => import('./components/UptimeView').then(m => ({ default: m.UptimeView })));
const NodeCharts = lazy(() => import('./components/NodeCharts').then(m => ({ default: m.NodeCharts })));
const NodeNetwork = lazy(() => import('./components/NodeNetwork').then(m => ({ default: m.NodeNetwork })));
const ChartModal = lazy(() => import('./components/ChartModal').then(m => ({ default: m.ChartModal })));

function ViewLoadingFallback() {
  return (
    <div className="flex min-h-[min(28rem,55vh)] w-full items-center justify-center">
      <HudSpinner size="lg" />
    </div>
  );
}

function ChartsRouteFallback() {
  return (
    <div className="flex h-64 w-full items-center justify-center rounded-lg border border-border/50 bg-card/50">
      <HudSpinner size="lg" />
    </div>
  );
}

type ViewMode = 'globe' | 'grid' | 'table' | 'uptime';

/** Warm Vite async chunks when user hovers a view they might switch to */
function prefetchDashboardView(mode: ViewMode) {
  switch (mode) {
    case 'globe':
      void import('./components/GlobeView');
      break;
    case 'uptime':
      void import('./components/UptimeView');
      break;
    case 'grid':
    case 'table':
      void import('./components/NodeList');
      break;
    default:
      break;
  }
}

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
  /** UUID of the node configured as the globe-view "hub" (arcs anchor).
   *  Resolved from `themeConfig.globe_hub_node` against the *unmasked* node
   *  list, so the field always matches the original real name even after
   *  privacy mode renames everything in the masked list. `null` when no
   *  hub is configured or the configured name doesn't match any node. */
  hubNodeUuid: string | null;
}

const NodesContext = createContext<NodesContextType>({
  nodes: [],
  loading: false,
  refreshNodes: async () => {},
  hubNodeUuid: null,
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
  const expiryStatus = getExpiryStatus(node.expired_at);
  const hasTraffic = !!(node.traffic_limit && node.traffic_limit > 0 && node.traffic_limit_type && node.traffic_limit_type !== 'no_limit');
  const tagList = parseTagList(node.tags);
  const hasSystemTags = !!(node.group || node.hidden);
  const shouldShowTagDivider = hasSystemTags && tagList.length > 0;
  const hasTagStrip = hasSystemTags || tagList.length > 0 || !!node.region;
  const priceLabel = isFree ? t('label.free') : node.price === 0 ? t('label.notSet') : `${node.currency}${node.price}`;

  return (
    <div className="rounded-lg border border-border/50 bg-card/80 backdrop-blur-xl p-4 sm:p-5 commander-corners relative overflow-hidden">
      <div className="commander-scanner-effect" />
      <span className="corner-bottom" />
      <div className="flex flex-col gap-2">
      {hasTagStrip && (
        <div className="flex flex-wrap items-center gap-1.5 text-xs font-mono">
          {node.group && (
            <span className="text-xxs font-mono font-bold px-1.5 py-0.5 rounded bg-primary/15 text-primary shrink-0">[{node.group}]</span>
          )}
          {node.hidden && (
            <span className="text-xxs font-mono font-bold px-1.5 py-0.5 rounded bg-warning/15 text-warning shrink-0">
              {t('node.hidden')}
            </span>
          )}
          {shouldShowTagDivider && <span className="mx-1 h-3 w-px bg-border/40" aria-hidden />}
          {tagList.map((tag, i) => (
            <TagPill key={i} label={tag.label} color={tag.color} size="sm" />
          ))}
        </div>
      )}

      {/* Public remark */}
      <RemarkNote text={node.public_remark} variant="public" />

      {/* Private remark (admin only) */}
      {appConfig.isLoggedIn && <RemarkNote text={node.remark} variant="private" />}

      {/* Row 2: System specs — CPU+GPU first row, System+Arch second row */}
      <div className="grid grid-cols-2 gap-2 pb-4 border-b border-border/30">
        {node.cpu_name && (
          <Tooltip>
            <TooltipTrigger asChild>
              <div className="flex items-start gap-2 p-2 rounded bg-muted/10 border border-border/15 cursor-default">
                <SystemIcon kind="cpu" value={node.cpu_name} className="h-3.5 w-3.5 text-primary mt-0.5 flex-shrink-0" />
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
        {node.gpu_name && (
          <Tooltip>
            <TooltipTrigger asChild>
              <div className="flex items-start gap-2 p-2 rounded bg-muted/10 border border-border/15 cursor-default">
                <SystemIcon kind="gpu" value={node.gpu_name} className="h-3.5 w-3.5 text-primary mt-0.5 flex-shrink-0" />
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
        {node.os && (
          <Tooltip>
            <TooltipTrigger asChild>
              <div className="flex items-start gap-2 p-2 rounded bg-muted/10 border border-border/15 cursor-default">
                <SystemIcon kind="os" value={node.os} className="h-3.5 w-3.5 text-primary mt-0.5 flex-shrink-0" />
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
                <SystemIcon kind="arch" value={node.arch} className="h-3.5 w-3.5 text-primary mt-0.5 flex-shrink-0" />
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
      </div>

      {/* Row 3: Live stats — circular gauges + info cards */}
      {stats ? (
        <div className="flex flex-col gap-4">
          {/* Circular gauges row */}
          <div className="grid grid-cols-3 gap-3">
            <CircularGauge
              channel="cpu"
              label={t('label.cpu')}
              value={cpuUsage}
              icon={<Cpu className="h-3 w-3 text-muted-foreground" />}
              status={getUsageStatus(cpuUsage, { warning: 60, critical: 80 })}
            />
            <CircularGauge
              channel="ram"
              label={t('label.ram')}
              value={ramUsage}
              icon={<MemoryStick className="h-3 w-3 text-muted-foreground" />}
              status={getUsageStatus(ramUsage, { warning: 70, critical: 85 })}
              detail={`${formatBytes(stats.ram.used)} / ${formatBytes(stats.ram.total)}`}
              subDetail={stats.swap.total > 0 ? `${t('label.swap')}: ${formatBytes(stats.swap.used)} / ${formatBytes(stats.swap.total)}` : undefined}
            />
            <CircularGauge
              channel="disk"
              label={t('label.disk')}
              value={diskUsage}
              icon={<HardDrive className="h-3 w-3 text-muted-foreground" />}
              status={getUsageStatus(diskUsage, { warning: 75, critical: 90 })}
              detail={`${formatBytes(stats.disk.used)} / ${formatBytes(stats.disk.total)}`}
            />
          </div>

          {/* Info cards row */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 sm:gap-4">
            <div className="p-2.5 rounded bg-muted/15 border border-border/20 flex flex-col gap-1.5">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-1.5">
                  <Network className="h-3 w-3 text-muted-foreground" />
                  <span className="text-xs font-mono text-muted-foreground uppercase tracking-wider">{t('label.network')}</span>
                </div>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <Link
                      to={`/node/${node.uuid}/network`}
                      aria-label={t('label.networkDetailHint')}
                      className="inline-flex items-center gap-1 rounded-md bg-primary/10 px-1.5 py-0.5 text-xxs font-mono font-bold uppercase tracking-wider text-primary ring-1 ring-primary/25 transition-colors hover:bg-primary/18 hover:ring-primary/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/60"
                    >
                      {t('label.networkDetail')}
                      <ExternalLink className="h-2.5 w-2.5" aria-hidden />
                    </Link>
                  </TooltipTrigger>
                  <TooltipContent side="bottom" className="max-w-xs text-xs">
                    {t('label.networkDetailHint')}
                  </TooltipContent>
                </Tooltip>
              </div>
              <div className="flex flex-col gap-0.5">
                <div className="flex items-baseline gap-1.5 text-sm font-metric font-bold tabular-nums">
                  <span className="text-chart-7">↑</span>
                  <span>{formatSpeed(stats.network.up)}</span>
                </div>
                <div className="flex items-baseline gap-1.5 text-sm font-metric font-bold tabular-nums">
                  <span className="text-chart-8">↓</span>
                  <span>{formatSpeed(stats.network.down)}</span>
                </div>
              </div>
              {appConfig.isLoggedIn && (
                <div className="flex items-center gap-2 pt-1.5 border-t border-border/15">
                  <span className="text-xxs font-mono text-muted-foreground/60">{t('label.tcp')}</span>
                  <span className="text-xxs font-metric font-bold tabular-nums">{stats.connections.tcp}</span>
                  <span className="text-xxs text-muted-foreground/20">|</span>
                  <span className="text-xxs font-mono text-muted-foreground/60">{t('label.udp')}</span>
                  <span className="text-xxs font-metric font-bold tabular-nums">{stats.connections.udp}</span>
                </div>
              )}
            </div>
            <div className="p-2.5 rounded bg-muted/15 border border-border/20 flex flex-col gap-1.5">
              <div className="flex items-center gap-1.5">
                <Activity className="h-3 w-3 text-muted-foreground" />
                <span className="text-xs font-mono text-muted-foreground uppercase tracking-wider">{t('label.load')}</span>
              </div>
              <div className="text-lg font-metric font-bold tabular-nums leading-none">
                {stats.load.load1.toFixed(2)}
              </div>
              <div className="grid grid-cols-3 gap-1 pt-1.5 border-t border-border/15">
                <div>
                  <div className="text-xxs font-mono text-muted-foreground/60">{t('label.load1m')}</div>
                  <div className="text-sm font-metric font-bold tabular-nums">{stats.load.load1.toFixed(2)}</div>
                </div>
                <div>
                  <div className="text-xxs font-mono text-muted-foreground/60">{t('label.load5m')}</div>
                  <div className="text-sm font-metric font-semibold tabular-nums text-foreground/85">{stats.load.load5.toFixed(2)}</div>
                </div>
                <div>
                  <div className="text-xxs font-mono text-muted-foreground/60">{t('label.load15m')}</div>
                  <div className="text-sm font-metric font-medium tabular-nums text-foreground/65">{stats.load.load15.toFixed(2)}</div>
                </div>
              </div>
            </div>
            <div className="p-2.5 rounded bg-muted/15 border border-border/20 flex flex-col gap-1.5">
              <div className="flex items-center gap-1.5">
                <Clock className="h-3 w-3 text-muted-foreground" />
                <span className="text-xs font-mono text-muted-foreground uppercase tracking-wider">{t('label.uptime')}</span>
              </div>
              <div className="flex flex-1 items-center text-lg font-metric font-bold tabular-nums leading-none">
                {formatUptime(stats.uptime, 'minute')}
              </div>
            </div>
          </div>

          {(expiryStatus || hasTraffic) && (
            <div className={cn(
              'grid grid-cols-1 gap-3 sm:gap-4',
              expiryStatus && hasTraffic && 'lg:grid-cols-2',
            )}>
              {expiryStatus && (
                <Tooltip>
                  <TooltipTrigger asChild>
                    <div className="p-3 rounded bg-muted/15 border border-border/20 flex flex-col gap-2 cursor-default min-h-[5.5rem]">
                      <div className="flex items-baseline justify-between gap-3">
                        <span className="text-xs font-mono text-muted-foreground uppercase tracking-wider">{t('label.billing')}</span>
                        {appConfig.isLoggedIn && (
                          <span className="rounded bg-primary/10 px-2 py-1 text-xs font-metric font-bold tabular-nums leading-none text-primary ring-1 ring-primary/20">
                            {priceLabel}
                          </span>
                        )}
                      </div>
                      <div className="mt-auto flex flex-wrap items-end justify-between gap-x-4 gap-y-1.5 border-t border-border/15 pt-2">
                        <span className="text-xxs font-mono uppercase tracking-[0.16em] text-muted-foreground/50">
                          {t('label.expires')}
                        </span>
                        <span className={cn(
                          'text-sm font-metric font-bold tabular-nums leading-none',
                          expiryStatus === 'expired' ? 'text-destructive' : expiryStatus === 'warning' ? 'text-warning' : 'text-foreground/85',
                        )}>
                          {formatExpiry(node.expired_at)}
                        </span>
                      </div>
                    </div>
                  </TooltipTrigger>
                  <TooltipContent side="bottom" className="whitespace-pre-line text-xs">
                    {appConfig.isLoggedIn
                      ? t('label.expiryTooltipDetail', {
                          date: dayjs(node.expired_at).format('YYYY-MM-DD HH:mm'),
                          cycle: node.billing_cycle ?? '-',
                          renewal: node.auto_renewal ? t('label.yes') : t('label.no'),
                          price: priceLabel,
                        })
                      : t('label.expiryTooltip', {
                          date: dayjs(node.expired_at).format('YYYY-MM-DD HH:mm'),
                        })
                    }
                  </TooltipContent>
                </Tooltip>
              )}

              {/* Traffic limit bar — uses unified .hud-gauge */}
              {hasTraffic && (() => {
                const used = calcTrafficUsage(stats.network.totalUp, stats.network.totalDown, node.traffic_limit_type as TrafficLimitType);
                const pct = (used / node.traffic_limit!) * 100;
                const s = getUsageStatus(pct, { warning: 70, critical: 90 });
                const clamped = Math.min(Math.max(pct, 0), 100);
                return (
                  <div
                    className="hud-gauge p-3 rounded bg-muted/15 border border-border/20 flex flex-col gap-1.5 min-h-[5.5rem]"
                    data-channel="traffic"
                    data-status={s}
                  >
                    <div className="flex items-baseline justify-between gap-2">
                      <span className="text-xs font-mono text-muted-foreground uppercase tracking-wider">
                        {t('label.traffic')} <span className="text-muted-foreground/60 normal-case">({formatTrafficType(node.traffic_limit_type!)})</span>
                      </span>
                      <span className={cn(
                        'text-xs font-metric font-bold tabular-nums leading-none',
                        s === 'critical' ? 'text-destructive' : s === 'warning' ? 'text-warning' : '',
                      )}>
                        {formatBytes(used)}
                        <span className="text-muted-foreground/60 mx-1">/</span>
                        <span className="text-muted-foreground/80">{formatBytes(node.traffic_limit!)}</span>
                      </span>
                    </div>
                    <div className="mt-auto hud-gauge__track-wrap">
                      <div className="hud-gauge__ticks" aria-hidden="true">
                        <span style={{ left: '25%' }} />
                        <span style={{ left: '50%' }} />
                        <span style={{ left: '75%' }} />
                      </div>
                      <div className="hud-gauge__track">
                        <div className="hud-gauge__fill" style={{ width: `${clamped}%` }}>
                          <span className="hud-gauge__cursor" aria-hidden="true" />
                        </div>
                      </div>
                    </div>
                  </div>
                );
              })()}
            </div>
          )}
        </div>
      ) : (
        <div className="flex items-center justify-center min-h-[4.5rem] text-muted-foreground text-xs leading-relaxed px-2 text-center">
          {isOnline ? t('telemetry.waiting') : t('telemetry.nodeOffline')}
        </div>
      )}
      </div>
    </div>
  );
}

function NodeDetailRoute() {
  const { t } = useTranslation();
  const { uuid } = useParams<{ uuid: string }>();
  const navigate = useNavigate();
  const { nodes } = useNodesContext();
  const appConfig = useAppConfig();
  const { maskName } = usePrivacyMode();
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

  const displayName = uuid ? maskName(uuid, nodeName) : nodeName;
  const isOnline = node?.status === 'online';
  const lastReport = node?.stats?.updated_at;
  const nodeTitle = (
    <h1 className="text-sm sm:text-base font-display font-bold truncate max-w-[60vw] sm:max-w-md">
      {displayName || uuid}
    </h1>
  );
  const renderIpChip = (
    label: 'IPv4' | 'IPv6',
    value: string | undefined,
    className: string,
  ) => {
    const ip = value?.trim();
    if (!ip) return null;

    const chip = (
      <span className={cn(
        'text-xxs font-mono font-bold px-1.5 py-0.5 rounded cursor-default shrink-0',
        className,
      )}>
        {label}
      </span>
    );

    if (!appConfig.isLoggedIn) return chip;

    return (
      <Tooltip>
        <TooltipTrigger asChild>
          {chip}
        </TooltipTrigger>
        <TooltipContent side="bottom" className="max-w-xs text-xs font-mono select-all break-all">
          {label}: {ip}
        </TooltipContent>
      </Tooltip>
    );
  };

  if (!uuid) return null;

  return (
    <div className="space-y-5 sm:space-y-6">
      {/* Commander route header — back + breadcrumb + status */}
      <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
        <Button
          type="button"
          variant="ghost"
          size="sm"
          onClick={() => navigate('/')}
          className="h-7 px-2 text-xs font-mono hover:bg-primary/15 hover:text-primary"
        >
          <ArrowLeft className="h-3.5 w-3.5 mr-1" aria-hidden />
          {t('action.back')}
        </Button>
        <div className="flex items-center gap-2 min-w-0">
          <span className="text-xxs font-mono text-muted-foreground/50 uppercase tracking-[0.2em]">NODE</span>
          <span className="text-xxs font-mono text-muted-foreground/30">/</span>
          {node && (
            <span
              className={cn(
                'w-2 h-2 rounded-full shrink-0',
                isOnline ? 'bg-success motion-safe:animate-pulse' : 'bg-destructive',
              )}
              aria-hidden
            />
          )}
          {node?.region && <RegionFlag region={node.region} size="lg" tooltipSide="bottom" />}
          {node && appConfig.isLoggedIn ? (
            <Tooltip>
              <TooltipTrigger asChild>
                {nodeTitle}
              </TooltipTrigger>
              <TooltipContent side="bottom" className="text-xs font-mono select-all">UUID: {node.uuid}</TooltipContent>
            </Tooltip>
          ) : nodeTitle}
          {node && (
            isOnline && lastReport ? (
              <Tooltip>
                <TooltipTrigger asChild>
                  <span className="text-xxs font-mono font-bold px-1.5 py-0.5 rounded cursor-default shrink-0 bg-success/15 text-success">
                    {t('status.online')}
                  </span>
                </TooltipTrigger>
                <TooltipContent side="bottom" className="text-xs font-mono">
                  {t('label.lastReport')}: {new Date(lastReport).toLocaleString()}
                </TooltipContent>
              </Tooltip>
            ) : (
              <span className={cn(
                'text-xxs font-mono font-bold px-1.5 py-0.5 rounded shrink-0',
                isOnline ? 'bg-success/15 text-success' : 'bg-destructive/15 text-destructive',
              )}>
                {isOnline ? t('status.online') : t('status.offline')}
              </span>
            )
          )}
          {renderIpChip('IPv4', node?.ipv4, 'bg-chart-7/15 text-chart-7 ring-1 ring-chart-7/25')}
          {renderIpChip('IPv6', node?.ipv6, 'bg-chart-6/15 text-chart-6 ring-1 ring-chart-6/25')}
        </div>
      </div>

      {/* Node Info Panel */}
      {node && <NodeInfoPanel node={node} />}

      {/* Charts */}
      <Suspense fallback={<ChartsRouteFallback />}>
        <NodeCharts nodeUuid={uuid} nodeName={displayName} />
      </Suspense>
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
  return (
    <Suspense fallback={<ViewLoadingFallback />}>
      <NodeNetwork nodeUuid={uuid} node={node} />
    </Suspense>
  );
}

/* ══════════════════════════════════════════════════════════════
   Dashboard (home page)
   ══════════════════════════════════════════════════════════════ */
function Dashboard() {
  const { viewMode } = useContext(ViewModeContext);
  const reduceMotion = useReducedMotion();
  const [chartModal, setChartModal] = useState<{ uuid: string; name: string } | null>(null);
  const navigate = useNavigate();
  const { nodes, loading, refreshNodes, hubNodeUuid } = useNodesContext();

  const handleViewCharts = useCallback((uuid: string, name: string) => {
    if (viewMode === 'globe') {
      setChartModal({ uuid, name });
    } else {
      navigate(`/node/${uuid}`);
    }
  }, [viewMode, navigate]);

  const viewTransition = reduceMotion ? { duration: 0 } : { duration: 0.2, ease: [0.25, 1, 0.5, 1] as const };

  return (
    <>
      <Suspense fallback={<ViewLoadingFallback />}>
        <AnimatePresence mode="wait" initial={false}>
          <motion.div
            key={viewMode}
            initial={
              reduceMotion
                ? { opacity: 1, y: 0 }
                : { opacity: 0, y: 10 }
            }
            animate={{ opacity: 1, y: 0 }}
            exit={
              reduceMotion
                ? { opacity: 1, y: 0 }
                : { opacity: 0, y: -8 }
            }
            transition={viewTransition}
            className="min-w-0"
          >
            {viewMode === 'globe' ? (
              <GlobeView
                nodes={nodes}
                loading={loading}
                onViewCharts={handleViewCharts}
                hubNodeUuid={hubNodeUuid}
              />
            ) : viewMode === 'uptime' ? (
              <UptimeView nodes={nodes} />
            ) : (
              <NodeList
                nodes={nodes}
                loading={loading}
                onRefresh={refreshNodes}
                defaultView={viewMode === 'grid' ? 'grid' : 'table'}
              />
            )}
          </motion.div>
        </AnimatePresence>
      </Suspense>

      {chartModal && (
        <Suspense fallback={null}>
          <ChartModal
            nodeUuid={chartModal.uuid}
            nodeName={chartModal.name}
            onClose={() => setChartModal(null)}
          />
        </Suspense>
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

  const { nodes, loading, refreshNodes } = useNodes();
  const { activeEffects } = useEffects();
  const appConfig = useAppConfig();
  const { resolvedTheme, setTheme } = useTheme();
  const { privacyMode, togglePrivacyMode, maskNodes, setDefaultPrivacyMode } = usePrivacyMode();

  const { themeConfig } = appConfig;
  const logoSrc = useMemo(() => getCommanderLogoDataUri(resolvedTheme), [resolvedTheme]);

  // Apply default_theme from server config if user hasn't set a preference
  useEffect(() => {
    if (!appConfig.loaded) return;
    const savedTheme = localStorage.getItem('appearance');
    if (!savedTheme) {
      setTheme(themeConfig.default_theme);
    }
  }, [appConfig.loaded, themeConfig.default_theme, setTheme]);

  // Push enable_privacy_mode from server config as the privacy-mode default.
  // The hook keeps a separate "user override" so logged-in admins can opt out
  // of the masking for their own session via the toggle button without
  // affecting other viewers.
  useEffect(() => {
    if (!appConfig.loaded) return;
    setDefaultPrivacyMode(themeConfig.enable_privacy_mode);
  }, [appConfig.loaded, themeConfig.enable_privacy_mode, setDefaultPrivacyMode]);

  const maskedNodes = useMemo(() => maskNodes(nodes), [maskNodes, nodes]);

  /* Resolve the configured hub node *against the unmasked node list*, so
   * the lookup stays correct even after privacy mode renames everything in
   * the masked list downstream. Matching is case-insensitive and trimmed
   * so admins don't get burned by trailing spaces in the backend setting. */
  const hubNodeUuid = useMemo<string | null>(() => {
    const target = themeConfig.globe_hub_node?.trim().toLowerCase();
    if (!target) return null;
    const match = nodes.find(n => n.name.trim().toLowerCase() === target);
    return match?.uuid ?? null;
  }, [nodes, themeConfig.globe_hub_node]);

  const handleSetViewMode = useCallback((mode: ViewMode) => {
    setViewMode(mode);
    localStorage.setItem('nodeViewMode', mode);
  }, []);

  // When config loads, apply default_view (if user hasn't chosen) and enforce disabled views
  useEffect(() => {
    if (!appConfig.loaded) return;
    const savedView = localStorage.getItem('nodeViewMode');
    const isViewEnabled = (v: ViewMode) => {
      if (v === 'globe') return themeConfig.enable_globe;
      if (v === 'uptime') return themeConfig.enable_uptime;
      return true;
    };
    // If no saved preference, apply default_view from config
    if (!savedView) {
      handleSetViewMode(themeConfig.default_view);
    } else if (!isViewEnabled(viewMode)) {
      // Current view is disabled — fallback
      handleSetViewMode(themeConfig.default_view);
    }
  }, [appConfig.loaded, themeConfig, viewMode, handleSetViewMode]);

  useEffect(() => {
    const init = async () => {
      try {
        const [publicSettings, versionInfo] = await Promise.all([
          apiService.getPublicSettings(),
          apiService.getVersion(),
        ]);
        if (publicSettings?.sitename) setSiteName(publicSettings.sitename as string);
        if (publicSettings?.description) setSiteDescription(publicSettings.description as string);
        if (publicSettings?.custom_body) setCustomBody(publicSettings.custom_body as string);
        if (versionInfo?.version) setVersion(versionInfo.version);
      } catch {
        /* keep defaults when public API is unreachable */
      }
    };
    init();
  }, []);


  const networkStats = useMemo(() => {
    let totalUp = 0;
    let totalDown = 0;
    nodes.forEach(node => {
      if (node.status === 'online' && node.stats?.network) {
        totalUp += node.stats.network.up || 0;
        totalDown += node.stats.network.down || 0;
      }
    });
    return { totalUp, totalDown };
  }, [nodes]);

  const isDashboard = location.pathname === '/';

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

  const viewButtons = useMemo<ViewTab<ViewMode>[]>(() => {
    const all: ViewTab<ViewMode>[] = [
      { mode: 'globe', icon: Globe, label: t('view.globe') },
      { mode: 'grid', icon: LayoutGrid, label: t('view.grid') },
      { mode: 'table', icon: List, label: t('view.table') },
      { mode: 'uptime', icon: Shield, label: t('view.uptime') },
    ];
    return all.filter(({ mode }) => {
      if (mode === 'globe') return themeConfig.enable_globe;
      if (mode === 'uptime') return themeConfig.enable_uptime;
      return true;
    });
  }, [t, themeConfig]);

  const handleViewTabChange = useCallback(
    (mode: ViewMode) => {
      handleSetViewMode(mode);
      if (!isDashboard) navigate('/');
    },
    [handleSetViewMode, isDashboard, navigate],
  );

  const handleViewTabHover = useCallback(
    (mode: ViewMode) => {
      if (mode !== viewMode) prefetchDashboardView(mode);
    },
    [viewMode],
  );

  return (
    <NodesContext.Provider value={{ nodes: maskedNodes, loading, refreshNodes, hubNodeUuid }}>
      <RecentStatsProvider onlineUuids={onlineUuids}>
      <ViewModeContext.Provider value={{ viewMode, setViewMode: handleSetViewMode }}>
        <div className="min-h-dvh flex flex-col bg-background text-foreground">
          {/* ═══ Header ═══ */}
          <header className="sticky top-0 z-50 border-b border-border/50 bg-background/85 backdrop-blur-xl relative pt-safe">
            <div className="commander-scanner-effect" />
            <div className="header-neon-line" />
            <div className="container mx-auto px-3 sm:px-4 relative z-10">
              {/* Desktop: single row with everything */}
              <div className="hidden sm:flex h-12 items-center justify-between gap-3">
                <div className="flex items-center gap-3 min-w-0 shrink">
                  <button
                    type="button"
                    onClick={() => navigate('/')}
                    className="flex min-w-0 items-center gap-2 rounded-sm hover:text-primary transition-colors duration-200 ease-out cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/60 focus-visible:ring-offset-2 focus-visible:ring-offset-background"
                    title={siteDescription || siteName}
                    aria-label={`${t('action.home')}: ${siteName}`}
                  >
                    <img src={logoSrc} alt="" aria-hidden className="h-7 w-7 shrink-0 rounded-md" />
                    <span className="truncate text-xl font-bold font-display">{siteName}</span>
                  </button>
                  {hasCriticalNode && (
                    <div
                      className="flex items-center gap-1.5 px-2 py-0.5 rounded bg-destructive/10 border border-destructive/20 text-xs font-mono text-destructive motion-safe:animate-pulse threat-badge"
                      title={t('hud.criticalLoadBanner')}
                    >
                      <AlertTriangle className="h-3 w-3 shrink-0" aria-hidden />
                      <span className="hidden lg:inline uppercase tracking-widest glitch-text">{t('hud.criticalLoadBanner')}</span>
                      <span className="lg:hidden uppercase">{t('hud.criticalLoadShort')}</span>
                    </div>
                  )}
                </div>
                <div className="flex items-center gap-3">
                  <ViewTabs
                    tabs={viewButtons}
                    value={viewMode}
                    onChange={handleViewTabChange}
                    onHoverIntent={handleViewTabHover}
                    labelBreakpoint="md"
                  />
                  <div className="flex items-center gap-1">
                    <LanguageSwitcher />
                    <ThemeSwitcher />
                    {appConfig.isLoggedIn && (
                      <Tooltip>
                        <TooltipTrigger asChild>
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={togglePrivacyMode}
                            className={cn(
                              'h-7 w-7 p-0 text-xs font-mono cursor-pointer',
                              privacyMode ? 'bg-primary/15 text-primary hover:bg-primary/25' : 'hover:bg-muted/50'
                            )}
                            aria-label={t('privacy.label')}
                            aria-pressed={privacyMode}
                          >
                            <Fingerprint className={cn("h-3.5 w-3.5", privacyMode && "text-primary")} aria-hidden />
                          </Button>
                        </TooltipTrigger>
                        <TooltipContent side="bottom" className="text-xs font-mono">
                          {privacyMode ? t('privacy.on') : t('privacy.off')}
                        </TooltipContent>
                      </Tooltip>
                    )}
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => window.location.href = '/admin'}
                          className="h-7 w-7 p-0 text-xs font-mono hover:bg-primary/15 hover:text-primary cursor-pointer"
                          aria-label={
                            appConfig.isLoggedIn && appConfig.username
                              ? `${t('action.admin')}: ${appConfig.username}`
                              : t('action.admin')
                          }
                        >
                          {appConfig.isLoggedIn ? <User className="h-3.5 w-3.5" aria-hidden /> : <Settings className="h-3.5 w-3.5" aria-hidden />}
                        </Button>
                      </TooltipTrigger>
                      <TooltipContent side="bottom" className="text-xs font-mono">
                        {appConfig.isLoggedIn ? (appConfig.username || t('action.admin')) : t('action.admin')}
                      </TooltipContent>
                    </Tooltip>
                  </div>
                </div>
              </div>

              {/* Mobile: Row 1 — compact brand lockup */}
              <div className="sm:hidden flex items-center justify-between h-9 pt-1.5 pb-1 mb-1 min-w-0">
                <button
                  type="button"
                  onClick={() => navigate('/')}
                  className="min-w-0 flex flex-1 items-center gap-1.5 text-left rounded-sm hover:text-primary transition-colors duration-200 ease-out cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/60 focus-visible:ring-offset-2 focus-visible:ring-offset-background"
                  title={siteDescription || siteName}
                  aria-label={`${t('action.home')}: ${siteName}`}
                >
                  <img src={logoSrc} alt="" aria-hidden className="h-6 w-6 shrink-0 rounded-[0.4rem] ring-1 ring-primary/15" />
                  <span className="truncate text-[clamp(1rem,4.6vw,1.125rem)] font-bold font-display leading-none tracking-[-0.02em]">{siteName}</span>
                </button>
                {hasCriticalNode && (
                  <div
                    className="flex items-center gap-1.5 px-2 py-0.5 rounded bg-destructive/10 border border-destructive/20 text-xs font-mono text-destructive motion-safe:animate-pulse threat-badge shrink-0"
                    title={t('hud.criticalLoadBanner')}
                  >
                    <AlertTriangle className="h-3 w-3 shrink-0" aria-hidden />
                    <span className="uppercase">{t('hud.criticalLoadShort')}</span>
                  </div>
                )}
              </div>
              {/* Mobile: Row 2 — view switcher + controls */}
              <div className="sm:hidden flex items-center justify-between border-t border-border/25 pt-1.5 pb-2.5 gap-2 min-w-0">
                <ViewTabs
                  tabs={viewButtons}
                  value={viewMode}
                  onChange={handleViewTabChange}
                  onHoverIntent={handleViewTabHover}
                  labelBreakpoint="never"
                  className="min-w-0 max-w-full overflow-x-auto scrollbar-none shrink"
                />
                <div className="flex items-center gap-1 shrink-0">
                  <LanguageSwitcher />
                  <ThemeSwitcher />
                  {appConfig.isLoggedIn && (
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={togglePrivacyMode}
                      className={cn(
                        'h-9 w-9 sm:h-8 sm:w-8 p-0 text-xs font-mono cursor-pointer',
                        privacyMode ? 'bg-primary/15 text-primary hover:bg-primary/25' : 'hover:bg-muted/50'
                      )}
                      title={privacyMode ? t('privacy.on') : t('privacy.off')}
                      aria-label={t('privacy.label')}
                      aria-pressed={privacyMode}
                    >
                      <Fingerprint className={cn("h-4 w-4", privacyMode && "text-primary")} aria-hidden />
                    </Button>
                  )}
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => window.location.href = '/admin'}
                    className="h-9 w-9 sm:h-8 sm:w-8 p-0 text-xs font-mono hover:bg-primary/15 hover:text-primary cursor-pointer"
                    title={appConfig.isLoggedIn ? (appConfig.username || t('action.admin')) : t('action.admin')}
                    aria-label={
                      appConfig.isLoggedIn && appConfig.username
                        ? `${t('action.admin')}: ${appConfig.username}`
                        : t('action.admin')
                    }
                  >
                    {appConfig.isLoggedIn ? <User className="h-4 w-4" aria-hidden /> : <Settings className="h-4 w-4" aria-hidden />}
                  </Button>
                </div>
              </div>
            </div>
          </header>

          {/* ═══ Main Content ═══ */}
          <main className="flex-1 container mx-auto px-3 sm:px-4 py-5 sm:py-7">
            <Routes>
              <Route path="/" element={<Dashboard />} />
              <Route path="/node/:uuid" element={<NodeDetailRoute />} />
              <Route path="/node/:uuid/network" element={<NodeNetworkRoute />} />
            </Routes>
          </main>

          {/* ═══ Footer ═══ */}
          <footer className="sticky bottom-0 z-40 border-t border-border/50 bg-background/85 backdrop-blur-xl relative pb-safe">
            <div className="footer-neon-line" />
            <div className="container mx-auto px-3 sm:px-4 h-9 flex items-center justify-between text-xs font-mono text-muted-foreground">
              <div className="flex items-center gap-3">
                <WebSocketStatus />
                <span className="hidden sm:inline text-muted-foreground/30">|</span>
                <div className="hidden sm:flex items-center gap-2 font-metric tabular-nums">
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
                {themeConfig.custom_footer && (
                  <>
                    <span className="hidden sm:inline text-muted-foreground/40">|</span>
                    <span className="hidden sm:inline text-muted-foreground/60">{themeConfig.custom_footer}</span>
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
