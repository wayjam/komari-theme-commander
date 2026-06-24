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
import { ArrowLeft, ArrowUp, ArrowDown, Settings, Globe, LayoutGrid, List, Shield, Cpu, MemoryStick, HardDrive, Activity, Network, Clock, User, AlertTriangle, ExternalLink, Fingerprint, Calendar, Gauge, RefreshCw } from 'lucide-react'
import { SystemIcon } from '@/lib/systemIcon'
import { cloneElement, useState, useEffect, useCallback, useMemo, useRef, createContext, useContext, lazy, Suspense, type ReactElement, type ReactNode } from 'react'
import { AnimatePresence, motion, useReducedMotion } from 'motion/react'
import { useTranslation } from 'react-i18next'
import { Routes, Route, useNavigate, useParams, useLocation, Link } from 'react-router-dom'
import { apiService } from './services/api'
import { formatSpeed, formatBytes, formatUptime, getUsageStatus, calcTrafficUsage, formatTrafficType, getExpiryStatus, formatExpiryRelative, cn } from './lib/utils'
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

function hasOverflow(element: HTMLElement) {
  const tolerance = 1;
  return (
    element.scrollWidth > element.clientWidth + tolerance ||
    element.scrollHeight > element.clientHeight + tolerance
  );
}

function OverflowTooltip({
  children,
  content,
  side = 'bottom',
  contentClassName,
}: {
  children: ReactElement<React.HTMLAttributes<HTMLElement> & React.RefAttributes<HTMLElement>>;
  content: ReactNode;
  side?: 'top' | 'right' | 'bottom' | 'left';
  contentClassName?: string;
}) {
  const triggerRef = useRef<HTMLElement | null>(null);
  const [isOverflowing, setIsOverflowing] = useState(false);
  const [open, setOpen] = useState(false);

  const updateOverflow = useCallback(() => {
    const next = triggerRef.current ? hasOverflow(triggerRef.current) : false;
    setIsOverflowing(next);
    if (!next) setOpen(false);
    return next;
  }, []);

  useEffect(() => {
    updateOverflow();
    const element = triggerRef.current;
    if (!element || typeof ResizeObserver === 'undefined') return;

    const observer = new ResizeObserver(() => {
      updateOverflow();
    });
    observer.observe(element);
    return () => observer.disconnect();
  }, [updateOverflow, content]);

  const trigger = useMemo(
    () => cloneElement(children, {
      ref: (element: HTMLElement | null) => {
        triggerRef.current = element;
        const { ref } = children.props;
        if (typeof ref === 'function') {
          ref(element);
        } else if (ref && typeof ref === 'object') {
          ref.current = element;
        }
      },
      onPointerEnter: (event: React.PointerEvent<HTMLElement>) => {
        updateOverflow();
        children.props.onPointerEnter?.(event);
      },
      onFocus: (event: React.FocusEvent<HTMLElement>) => {
        updateOverflow();
        children.props.onFocus?.(event);
      },
    }),
    [children, updateOverflow],
  );

  return (
    <Tooltip open={isOverflowing ? open : false} onOpenChange={(nextOpen) => {
      const nextOverflow = updateOverflow();
      setOpen(nextOverflow ? nextOpen : false);
    }}>
      <TooltipTrigger asChild>
        {trigger}
      </TooltipTrigger>
      <TooltipContent side={side} className={contentClassName}>
        {content}
      </TooltipContent>
    </Tooltip>
  );
}

function FooterSep({ className }: { className?: string }) {
  return (
    <span
      aria-hidden
      className={cn('text-muted-foreground/30 select-none shrink-0', className)}
    >
      |
    </span>
  );
}

function FooterLocalClock() {
  const { t } = useTranslation();
  const mobileRef = useRef<HTMLSpanElement>(null);
  const timeRef = useRef<HTMLSpanElement>(null);
  const fullRef = useRef<HTMLSpanElement>(null);
  const tzRef = useRef<HTMLSpanElement>(null);

  useEffect(() => {
    const pad = (n: number) => String(n).padStart(2, '0');
    const tick = () => {
      const d = new Date();
      const date = `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
      const time = `${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`;
      const timeShort = `${pad(d.getHours())}:${pad(d.getMinutes())}`;
      if (mobileRef.current) mobileRef.current.textContent = timeShort;
      if (timeRef.current) timeRef.current.textContent = time;
      if (fullRef.current) fullRef.current.textContent = `${date} ${time}`;
      if (tzRef.current) {
        try {
          const tz = new Intl.DateTimeFormat(undefined, { timeZoneName: 'short' })
            .formatToParts(d)
            .find(part => part.type === 'timeZoneName')?.value;
          tzRef.current.textContent = tz ?? t('hud.local');
        } catch {
          tzRef.current.textContent = t('hud.local');
        }
      }
    };
    tick();

    let id: ReturnType<typeof setInterval> | null = null;
    const start = () => {
      if (id != null) return;
      id = setInterval(tick, 1000);
    };
    const stop = () => {
      if (id == null) return;
      clearInterval(id);
      id = null;
    };
    const onVisibility = () => {
      if (document.hidden) {
        stop();
      } else {
        tick();
        start();
      }
    };

    if (!document.hidden) start();
    document.addEventListener('visibilitychange', onVisibility);
    return () => {
      stop();
      document.removeEventListener('visibilitychange', onVisibility);
    };
  }, [t]);

  return (
    <>
      {/* Narrow: icon + HH:MM */}
      <div
        className="flex md:hidden items-center gap-1 font-metric tabular-nums text-muted-foreground/80 shrink-0"
        title={t('hud.local')}
      >
        <Clock className="h-3 w-3 text-muted-foreground/55" aria-hidden />
        <span ref={mobileRef} className="text-foreground/75" />
      </div>
      {/* md: tz label + time; lg+: full date */}
      <div className="hidden md:flex items-center gap-1.5 font-metric tabular-nums text-muted-foreground/80 shrink-0">
        <Clock className="h-3 w-3 text-muted-foreground/55" aria-hidden />
        <span
          ref={tzRef}
          className="font-mono uppercase tracking-wider text-muted-foreground/55"
        >
          {t('hud.local')}
        </span>
        <span ref={timeRef} className="lg:hidden text-foreground/75" />
        <span ref={fullRef} className="hidden lg:inline text-foreground/75" />
      </div>
    </>
  );
}

interface FooterFleetMetricsProps {
  avgCpu: number;
  totalUp: number;
  totalDown: number;
}

function FooterFleetMetrics({ avgCpu, totalUp, totalDown }: FooterFleetMetricsProps) {
  const { t } = useTranslation();
  const cpuTone =
    avgCpu < 60 ? 'text-success' : avgCpu < 85 ? 'text-warning' : 'text-destructive';
  const upLabel = t('label.netUp');
  const downLabel = t('label.netDown');

  return (
    <div
      className="flex flex-wrap items-center gap-x-2 gap-y-0.5 sm:gap-x-3 min-w-0"
      aria-label={`${t('hud.avgCpu')} ${avgCpu.toFixed(0)}%, ${upLabel} ${formatSpeed(totalUp)}, ${downLabel} ${formatSpeed(totalDown)}`}
    >
      <div className="flex items-center gap-1 sm:gap-1.5 shrink-0">
        <Cpu className={cn('h-3 w-3 shrink-0 opacity-70', cpuTone)} aria-hidden />
        <span className="hidden sm:inline text-muted-foreground/60 uppercase tracking-[0.12em] sm:tracking-[0.16em]">
          {t('hud.avgCpu')}
        </span>
        <span className={cn('font-metric tracking-normal normal-case', cpuTone)}>
          {avgCpu.toFixed(0)}%
        </span>
      </div>
      <div className="flex items-center gap-1.5 sm:gap-2 shrink-0 min-w-0">
        <div className="flex items-center gap-0.5 sm:gap-1 shrink-0">
          <ArrowUp className="h-3 w-3 text-success/80 shrink-0" aria-hidden />
          <span className="hidden lg:inline text-muted-foreground/60 uppercase tracking-[0.12em]">
            {upLabel}
          </span>
          <span className="font-metric text-success tracking-normal normal-case">
            {formatSpeed(totalUp)}
          </span>
        </div>
        <span className="text-muted-foreground/25 sm:hidden" aria-hidden>·</span>
        <div className="flex items-center gap-0.5 sm:gap-1 shrink-0">
          <ArrowDown className="h-3 w-3 text-primary/80 shrink-0" aria-hidden />
          <span className="hidden lg:inline text-muted-foreground/60 uppercase tracking-[0.12em]">
            {downLabel}
          </span>
          <span className="font-metric text-primary tracking-normal normal-case">
            {formatSpeed(totalDown)}
          </span>
        </div>
      </div>
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
  const cores = node.cpu_cores || 1;
  const loadRatio = stats ? stats.load.load1 / cores : 0;
  const loadStatusTone =
    loadRatio >= 1.5 ? 'text-destructive' : loadRatio >= 1 ? 'text-warning' : 'text-foreground';

  return (
    <div className="node-card-commander node-info-panel rounded-lg border border-border/50 bg-card/80 backdrop-blur-xl p-4 sm:p-5 commander-corners relative overflow-hidden">
      <div className="commander-scanner-effect" />
      <span className="corner-bottom" />
      <div className="flex flex-col gap-3">
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

      {/* System specs — unified divided panel (CPU / GPU / System / Arch).
          Values wrap (break-words) instead of truncating so long CPU/System
          names read in full; old telemetry-panel border treatment. */}
      {(node.cpu_name || node.gpu_name || node.os || node.arch) && (
        <div className="network-stats-panel telemetry-panel overflow-hidden">
          <div className="flex flex-col divide-y divide-border/20">
            {/* Row 1: CPU / GPU */}
            {(node.cpu_name || node.gpu_name) && (
              <div className="flex flex-col divide-y divide-border/20 sm:flex-row sm:divide-x sm:divide-y-0">
                {node.cpu_name && (
                  <OverflowTooltip
                    content={`${node.cpu_name} (${node.cpu_cores}C)`}
                    contentClassName="max-w-xs text-xs font-mono"
                  >
                    <div className="stat-section flex min-w-0 flex-1 flex-col gap-1.5 p-3 sm:p-4 cursor-default">
                      <div className="flex items-center gap-1.5">
                        <span className="stat-chip stat-chip--cpu"><SystemIcon kind="cpu" value={node.cpu_name} className="h-3 w-3" /></span>
                        <span className="type-hud-label">{t('label.cpu')}</span>
                      </div>
                      <div className="type-spec-value">{node.cpu_name} ({node.cpu_cores}C)</div>
                    </div>
                  </OverflowTooltip>
                )}
                {node.gpu_name && (
                  <OverflowTooltip
                    content={node.gpu_name}
                    contentClassName="max-w-xs text-xs font-mono"
                  >
                    <div className="stat-section flex min-w-0 flex-1 flex-col gap-1.5 p-3 sm:p-4 cursor-default">
                      <div className="flex items-center gap-1.5">
                        <span className="stat-chip stat-chip--gpu"><SystemIcon kind="gpu" value={node.gpu_name} className="h-3 w-3" /></span>
                        <span className="type-hud-label">{t('label.gpu')}</span>
                      </div>
                      <div className="type-spec-value">{node.gpu_name}</div>
                    </div>
                  </OverflowTooltip>
                )}
              </div>
            )}
            {/* Row 2: System / Arch */}
            {(node.os || node.arch) && (
              <div className="flex flex-col divide-y divide-border/20 sm:flex-row sm:divide-x sm:divide-y-0">
                {node.os && (
                  <OverflowTooltip
                    content={`${node.os}${node.kernel_version ? `\n${t('label.kernel')}: ${node.kernel_version}` : ''}`}
                    contentClassName="max-w-xs text-xs font-mono whitespace-pre-line"
                  >
                    <div className="stat-section flex min-w-0 flex-1 flex-col gap-1.5 p-3 sm:p-4 cursor-default">
                      <div className="flex items-center gap-1.5">
                        <span className="stat-chip stat-chip--system"><SystemIcon kind="os" value={node.os} className="h-3 w-3" /></span>
                        <span className="type-hud-label">{t('label.system')}</span>
                      </div>
                      <div className="type-spec-value">
                        {node.os}{node.kernel_version ? ` · ${node.kernel_version}` : ''}
                      </div>
                    </div>
                  </OverflowTooltip>
                )}
                {node.arch && (
                  <OverflowTooltip
                    content={`${node.arch}${node.virtualization ? ` · ${node.virtualization}` : ''}`}
                    contentClassName="max-w-xs text-xs font-mono"
                  >
                    <div className="stat-section flex min-w-0 flex-1 flex-col gap-1.5 p-3 sm:p-4 cursor-default">
                      <div className="flex items-center gap-1.5">
                        <span className="stat-chip stat-chip--system"><SystemIcon kind="arch" value={node.arch} className="h-3 w-3" /></span>
                        <span className="type-hud-label">{t('label.arch')}</span>
                      </div>
                      <div className="type-spec-value">
                        {node.arch}{node.virtualization ? ` · ${node.virtualization}` : ''}
                      </div>
                    </div>
                  </OverflowTooltip>
                )}
              </div>
            )}
          </div>
        </div>
      )}

      {/* Live telemetry — gauges + realtime stats in one unified divided panel */}
      {stats ? (
        <>
          <div className="network-stats-panel telemetry-panel overflow-hidden">
            {/* Resource gauges: CPU / RAM / Disk */}
            <div className="grid grid-cols-3 divide-x divide-border/20">
              <CircularGauge
                channel="cpu"
                label={t('label.cpu')}
                value={cpuUsage}
                icon={<Cpu className="h-3 w-3" />}
                status={getUsageStatus(cpuUsage, { warning: 60, critical: 80 })}
                detail={node.cpu_cores ? `${node.cpu_cores} ${t('label.cores')}` : undefined}
              />
              <CircularGauge
                channel="ram"
                label={t('label.ram')}
                value={ramUsage}
                icon={<MemoryStick className="h-3 w-3" />}
                status={getUsageStatus(ramUsage, { warning: 70, critical: 85 })}
                detail={`${formatBytes(stats.ram.used)} / ${formatBytes(stats.ram.total)}`}
                subDetail={stats.swap.total > 0 ? `${t('label.swap')}: ${formatBytes(stats.swap.used)} / ${formatBytes(stats.swap.total)}` : undefined}
              />
              <CircularGauge
                channel="disk"
                label={t('label.disk')}
                value={diskUsage}
                icon={<HardDrive className="h-3 w-3" />}
                status={getUsageStatus(diskUsage, { warning: 75, critical: 90 })}
                detail={`${formatBytes(stats.disk.used)} / ${formatBytes(stats.disk.total)}`}
              />
            </div>

            {/* Realtime: Network / Load / Uptime */}
            <div className="grid grid-cols-1 divide-y divide-border/20 border-t border-border/20 sm:grid-cols-3 sm:divide-x sm:divide-y-0">
              {/* Network */}
              <div className="stat-section flex flex-col gap-1.5 p-3 sm:p-4" data-accent="network">
                <div className="flex items-center justify-between gap-2">
                  <div className="flex items-center gap-1.5">
                    <span className="stat-chip stat-chip--network"><Network className="h-3 w-3" /></span>
                    <span className="type-hud-label">{t('label.network')}</span>
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
                  <div className="flex items-center gap-1.5 type-metric-md tabular-nums">
                    <ArrowUp className="h-3 w-3 shrink-0 text-chart-7" aria-hidden />
                    <span>{formatSpeed(stats.network.up)}</span>
                  </div>
                  <div className="flex items-center gap-1.5 type-metric-md tabular-nums">
                    <ArrowDown className="h-3 w-3 shrink-0 text-chart-8" aria-hidden />
                    <span>{formatSpeed(stats.network.down)}</span>
                  </div>
                </div>
                {appConfig.isLoggedIn && (
                  <div className="flex items-center gap-2 mt-auto pt-1.5 border-t border-border/15">
                    <span className="type-hud-label-sm">{t('label.tcp')}</span>
                    <span className="text-xxs font-metric font-bold tabular-nums text-chart-5">{stats.connections.tcp}</span>
                    <span className="text-xxs text-muted-foreground/20">|</span>
                    <span className="type-hud-label-sm">{t('label.udp')}</span>
                    <span className="text-xxs font-metric font-bold tabular-nums text-chart-6">{stats.connections.udp}</span>
                  </div>
                )}
              </div>
              {/* Load */}
              <div className="stat-section flex flex-col gap-1.5 p-3 sm:p-4" data-accent="load">
                <div className="flex items-center gap-1.5">
                  <span className="stat-chip stat-chip--load"><Activity className="h-3 w-3" /></span>
                  <span className="type-hud-label">{t('label.load')}</span>
                </div>
                <div className={cn('type-metric-hero tabular-nums', loadStatusTone)}>
                  {stats.load.load1.toFixed(2)}
                </div>
                <div className="grid grid-cols-3 gap-1 mt-auto pt-1.5 border-t border-border/15">
                  <div>
                    <div className="type-hud-label-sm">{t('label.load1m')}</div>
                    <div className="type-metric-md tabular-nums">{stats.load.load1.toFixed(2)}</div>
                  </div>
                  <div>
                    <div className="type-hud-label-sm">{t('label.load5m')}</div>
                    <div className="type-metric-md font-semibold tabular-nums text-foreground/85">{stats.load.load5.toFixed(2)}</div>
                  </div>
                  <div>
                    <div className="type-hud-label-sm">{t('label.load15m')}</div>
                    <div className="type-metric-md font-medium tabular-nums text-foreground/65">{stats.load.load15.toFixed(2)}</div>
                  </div>
                </div>
              </div>
              {/* Uptime */}
              <div className="stat-section flex flex-col gap-1.5 p-3 sm:p-4" data-accent="uptime">
                <div className="flex items-center gap-1.5">
                  <span className="stat-chip stat-chip--uptime"><Clock className="h-3 w-3" /></span>
                  <span className="type-hud-label">{t('label.uptime')}</span>
                </div>
                <div className="type-metric-hero tabular-nums text-foreground">
                  {formatUptime(stats.uptime, 'minute', 5)}
                </div>
                {stats.process > 0 && (
                  <div className="flex items-center gap-2 mt-auto pt-1.5 border-t border-border/15">
                    <span className="type-hud-label-sm">{t('label.proc')}</span>
                    <span className="text-xxs font-metric font-bold tabular-nums">{stats.process}</span>
                  </div>
                )}
              </div>
            </div>

            {/* Traffic limit bar — full-width row tied to the network panel above */}
            {hasTraffic && (() => {
              const used = calcTrafficUsage(stats.network.totalUp, stats.network.totalDown, node.traffic_limit_type as TrafficLimitType);
              const pct = (used / node.traffic_limit!) * 100;
              const s = getUsageStatus(pct, { warning: 70, critical: 90 });
              const clamped = Math.min(Math.max(pct, 0), 100);
              return (
                <div
                  className="hud-gauge stat-section flex flex-col gap-2 border-t border-border/20 p-3 sm:p-4"
                  data-accent="traffic"
                  data-channel="traffic"
                  data-status={s}
                >
                  <div className="flex items-center justify-between gap-2">
                    <div className="flex items-center gap-1.5 min-w-0">
                      <span className="stat-chip stat-chip--traffic"><Gauge className="h-3 w-3" /></span>
                      <span className="type-hud-label truncate">
                        {t('label.traffic')} <span className="text-muted-foreground/60 normal-case">({formatTrafficType(node.traffic_limit_type!)})</span>
                      </span>
                    </div>
                    <span className={cn(
                      'text-xs font-metric font-bold tabular-nums leading-none flex-shrink-0',
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

          {/* Billing — its own standalone box */}
          {expiryStatus && (
            <div className="network-stats-panel telemetry-panel overflow-hidden">
              <Tooltip>
                <TooltipTrigger asChild>
                  {appConfig.isLoggedIn ? (
                  <div className="stat-section flex min-w-0 flex-col gap-1 p-3 sm:p-4 cursor-default" data-accent="billing">
                    {/* Header: label + price badge */}
                    <div className="flex items-center justify-between gap-2">
                      <div className="flex items-center gap-1.5">
                        <span className="stat-chip stat-chip--billing"><Calendar className="h-3 w-3" /></span>
                        <span className="type-hud-label">{t('label.billing')}</span>
                      </div>
                      <span className="rounded bg-primary/10 px-2 py-0.5 text-xs font-metric font-bold tabular-nums leading-none text-primary ring-1 ring-primary/20">
                        {priceLabel}
                      </span>
                    </div>
                    {/* Primary: expiry status as prominent value */}
                    <div className={cn(
                      'type-metric-lg tabular-nums leading-none',
                      expiryStatus === 'expired' ? 'text-destructive' : expiryStatus === 'warning' ? 'text-warning' : 'text-foreground/85',
                    )}>
                      {formatExpiryRelative(node.expired_at)}
                    </div>
                    {/* Footer: full date + cycle/renewal (admin) */}
                    <div className="flex items-center justify-between gap-3 mt-auto pt-1 border-t border-border/15">
                      <span className="type-hud-label-sm tabular-nums">
                        {dayjs(node.expired_at).format('YYYY-MM-DD')}
                      </span>
                      {node.billing_cycle > 0 && (
                        <div className="flex items-center gap-2">
                          <span className="text-xxs font-mono text-muted-foreground/70">{node.billing_cycle}d</span>
                          <span className={cn(
                            'inline-flex items-center gap-1 text-xxs font-mono',
                            node.auto_renewal ? 'text-success/80' : 'text-muted-foreground/50',
                          )}>
                            {node.auto_renewal ? (
                              <><RefreshCw className="h-2.5 w-2.5" aria-hidden />{t('label.autoRenewal')}</>
                            ) : t('label.manualRenewal')}
                          </span>
                        </div>
                      )}
                    </div>
                  </div>
                ) : (
                  /* Public (logged-out) state: no price / cycle / renewal data, so
                     lay label and expiry side-by-side to fill the width instead of
                     leaving the right side of header + footer empty. */
                  <div className="stat-section flex min-w-0 items-center justify-between gap-3 p-3 sm:p-4 cursor-default" data-accent="billing">
                    <div className="flex items-center gap-1.5">
                      <span className="stat-chip stat-chip--billing"><Calendar className="h-3 w-3" /></span>
                      <span className="type-hud-label">{t('label.billing')}</span>
                    </div>
                    <div className="flex min-w-0 flex-col items-end gap-0.5 text-right">
                      <span className={cn(
                        'type-metric-lg tabular-nums leading-none',
                        expiryStatus === 'expired' ? 'text-destructive' : expiryStatus === 'warning' ? 'text-warning' : 'text-foreground/85',
                      )}>
                        {formatExpiryRelative(node.expired_at)}
                      </span>
                      <span className="type-hud-label-sm tabular-nums">
                        {dayjs(node.expired_at).format('YYYY-MM-DD')}
                      </span>
                    </div>
                  </div>
                )}
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
            </div>
          )}
        </>
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
    // No saved preference — follow server default (don't write localStorage yet;
    // only persist when the viewer explicitly picks a view tab).
    if (!savedView) {
      setViewMode(themeConfig.default_view);
    } else if (!isViewEnabled(viewMode)) {
      handleSetViewMode(themeConfig.default_view);
    }
  }, [
    appConfig.loaded,
    themeConfig.default_view,
    themeConfig.enable_globe,
    themeConfig.enable_uptime,
    viewMode,
    handleSetViewMode,
  ]);

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


  const fleetSummary = useMemo(() => {
    let totalUp = 0;
    let totalDown = 0;
    let cpuSum = 0;
    let cpuSampled = 0;
    const onlineUuids: string[] = [];
    let hasCriticalNode = false;

    nodes.forEach(node => {
      if (node.status === 'online' && node.stats?.network) {
        onlineUuids.push(node.uuid);
        totalUp += node.stats.network.up || 0;
        totalDown += node.stats.network.down || 0;
      }

      if (node.status === 'online' && node.stats) {
        cpuSum += node.stats.cpu.usage;
        cpuSampled++;
      }

      if (!hasCriticalNode && node.status === 'online' && node.stats) {
        hasCriticalNode = node.stats.cpu.usage > 90 || (node.stats.ram.used / node.stats.ram.total) > 0.95;
      }
    });

    return {
      networkStats: { totalUp, totalDown },
      avgCpu: cpuSampled > 0 ? cpuSum / cpuSampled : 0,
      cpuSampled,
      onlineUuids,
      hasCriticalNode,
    };
  }, [nodes]);

  const isDashboard = location.pathname === '/';
  const { networkStats, avgCpu, cpuSampled, onlineUuids, hasCriticalNode } = fleetSummary;
  const shouldFetchSparklines = isDashboard && (viewMode === 'grid' || viewMode === 'table') && appConfig.isLoggedIn;
  const showFooterMetaOnMobile = Boolean(appConfig.isLoggedIn && version);

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
      <RecentStatsProvider onlineUuids={onlineUuids} enabled={shouldFetchSparklines}>
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
            <div className="container mx-auto px-3 sm:px-4 py-1.5 sm:py-2 min-h-9">
              <div className="flex flex-col gap-1.5 sm:flex-row sm:flex-wrap sm:items-center sm:justify-between sm:gap-x-4 sm:gap-y-1 text-xxs sm:text-xs font-mono text-muted-foreground">
                {/* Telemetry rail: WS → local time → fleet KPIs */}
                <div className="flex flex-wrap items-center gap-x-2 sm:gap-x-3 gap-y-1 min-w-0 w-full sm:w-auto sm:flex-1">
                  <WebSocketStatus />
                  <FooterSep />
                  <FooterLocalClock />
                  {cpuSampled > 0 && (
                    <>
                      <FooterSep />
                      <FooterFleetMetrics
                        avgCpu={avgCpu}
                        totalUp={networkStats.totalUp}
                        totalDown={networkStats.totalDown}
                      />
                    </>
                  )}
                </div>
                {/* Meta rail: attribution, version (admin), theme credit */}
                <div className={cn(
                  'flex flex-wrap items-center gap-x-2 gap-y-0.5 shrink-0 w-full sm:w-auto justify-between sm:justify-end',
                  !showFooterMetaOnMobile && 'hidden sm:flex',
                )}>
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
                    {appConfig.isLoggedIn && version && (
                      <>
                        <span className="hidden sm:inline text-muted-foreground/40">|</span>
                        <span className="font-metric tabular-nums text-muted-foreground/60">{version}</span>
                      </>
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
