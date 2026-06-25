import { useEffect, useMemo, useState, useCallback, useRef, Fragment } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { useTranslation } from 'react-i18next';
import { Card, CardContent, CardHeader, CardTitle } from './ui/card';
import { Button } from './ui/button';
import { Progress } from './ui/progress';
import { Tooltip, TooltipTrigger, TooltipContent } from './ui/tooltip';
import { Sparkline } from './Sparkline';
import { ChartTimeRangeBar } from './ChartTimeRangeBar';
import { PingCurveModeToggle } from './PingCurveModeToggle';
import { ArrowLeft, Network, Signal, ArrowUp, ArrowDown, ArrowUpDown, Gauge, Unplug, ChevronDown, ChevronRight, Info, AlertTriangle, RotateCw } from 'lucide-react';
import { HudSpinner } from './HudSpinner';
import { apiService, type NodeWithStatus } from '../services/api';
import { useAppConfig } from '@/hooks/useAppConfig';
import { usePrivacyMode } from '@/hooks/usePrivacyMode';
import { useIsMobile } from '@/hooks/useIsMobile';
import { formatSpeed, formatBytes, cn, calcTrafficUsage, type TrafficLimitType } from '@/lib/utils';
import { useAdaptiveLoadTimeRange } from '@/hooks/useAdaptiveLoadTimeRange';
import { useNodeRealtimeLoadRecords } from '@/hooks/useNodeRealtimeLoadRecords';
import {
  buildLoadChartTimeRanges,
  buildPingChartTimeRanges,
  defaultPingTimeRange,
  type PingTimeRangeId,
} from '@/lib/chart-time-ranges';
import {
  ConnectionsLineChart,
  NetworkTrafficAreaChart,
  PingLatencyLineChart,
} from '@/components/metric-charts';
import {
  chartColors,
  chartCardClass,
  chartContainerClass,
  processPingRecords,
  interpolatePingNulls,
  ewmaSmooth,
  transformLoadRecords,
  type LoadRecord,
  type PingRecord,
  type TaskInfo,
} from '@/lib/chart-utils';

interface NodeNetworkProps {
  nodeUuid?: string;
  nodeName?: string;
  node?: NodeWithStatus;
}

export function NodeNetwork({ nodeUuid: propUuid, nodeName: propName, node: propNode }: NodeNetworkProps) {
  const { t } = useTranslation();
  const params = useParams<{ uuid: string }>();
  const navigate = useNavigate();
  const nodeUuid = propUuid || params.uuid || '';
  const [nodeName, setNodeName] = useState(propName || '');
  const { recordPreserveTime, pingRecordPreserveTime, isLoggedIn } = useAppConfig();
  const { maskName } = usePrivacyMode();

  const [loadTimeRange, setLoadTimeRange] = useAdaptiveLoadTimeRange(
    propNode ? propNode.status === 'online' : undefined,
    recordPreserveTime,
  );
  const [pingTimeRange, setPingTimeRange] = useState<PingTimeRangeId>(() =>
    defaultPingTimeRange(pingRecordPreserveTime),
  );
  const [loadRefreshKey, setLoadRefreshKey] = useState(0);
  const [pingRefreshKey, setPingRefreshKey] = useState(0);
  const isLoadRealtime = loadTimeRange === 'realtime';

  const [historicalLoadData, setHistoricalLoadData] = useState<LoadRecord[] | null>(null);
  const [historicalLoadLoading, setHistoricalLoadLoading] = useState(false);
  const [historicalLoadError, setHistoricalLoadError] = useState<string | null>(null);
  const [pingData, setPingData] = useState<PingRecord[] | null>(null);
  const [tasks, setTasks] = useState<TaskInfo[]>([]);
  const [pingLoading, setPingLoading] = useState(false);
  const [hiddenLines, setHiddenLines] = useState<Record<string, boolean>>({});
  const [smooth, setSmooth] = useState(false);
  const [latencyCollapsed, setLatencyCollapsed] = useState(false);
  const [expandedTasks, setExpandedTasks] = useState<Set<number>>(new Set());
  const isMobile = useIsMobile();

  // Accept node data from parent context if available
  const stats = propNode?.stats;

  // ──────────────────────────────────────────────────────────────
  // Rolling 60-sample sparkline buffer for realtime up/down speeds.
  // Stats arrive every ~2s via the parent polling loop, so ~60
  // samples ≈ last 2 minutes of activity.
  // ──────────────────────────────────────────────────────────────
  const SPARK_CAP = 60;
  const [upHistory, setUpHistory] = useState<number[]>([]);
  const [downHistory, setDownHistory] = useState<number[]>([]);
  const lastStatsRef = useRef<{ up: number; down: number } | null>(null);

  useEffect(() => {
    if (!stats) return;
    const up = stats.network?.up ?? 0;
    const down = stats.network?.down ?? 0;
    const prev = lastStatsRef.current;
    // Only record when value actually changes (polling may re-emit identical payloads)
    if (prev && prev.up === up && prev.down === down) return;
    lastStatsRef.current = { up, down };
    setUpHistory(h => [...h.slice(-(SPARK_CAP - 1)), up]);
    setDownHistory(h => [...h.slice(-(SPARK_CAP - 1)), down]);
  }, [stats]);

  const loadTimeRangeOptions = useMemo(
    () => buildLoadChartTimeRanges(recordPreserveTime),
    [recordPreserveTime],
  );
  const pingTimeRangeOptions = useMemo(
    () => buildPingChartTimeRanges(pingRecordPreserveTime),
    [pingRecordPreserveTime],
  );

  const {
    records: realtimeLoadRecords,
    loading: realtimeLoadLoading,
    error: realtimeLoadError,
    refresh: refreshRealtimeLoad,
  } = useNodeRealtimeLoadRecords(nodeUuid, isLoadRealtime);

  useEffect(() => {
    if (!nodeName && nodeUuid) {
      apiService.getNodes().then(nodes => {
        const node = nodes.find(n => n.uuid === nodeUuid);
        if (node) setNodeName(maskName(node.uuid, node.name));
      });
    }
  }, [nodeUuid, nodeName, maskName]);

  const fetchPingData = useCallback(() => {
    if (!nodeUuid) return;
    setPingLoading(true);
    apiService.getPingHistory(nodeUuid, pingTimeRange)
      .then((pingHistory) => {
        if (pingHistory?.records) {
          const records = (pingHistory.records || []) as PingRecord[];
          records.sort((a, b) => new Date(a.time).getTime() - new Date(b.time).getTime());
          setPingData(records);
          setTasks(pingHistory.tasks || []);
        } else {
          setPingData([]);
        }
        setPingLoading(false);
      })
      .catch(() => {
        setPingLoading(false);
      });
  }, [nodeUuid, pingTimeRange]);

  const fetchHistoricalLoad = useCallback(() => {
    if (!nodeUuid || isLoadRealtime || typeof loadTimeRange !== 'number') return;
    setHistoricalLoadLoading(true);
    setHistoricalLoadError(null);
    apiService.getLoadHistory(nodeUuid, loadTimeRange)
      .then((loadHistory) => {
        if (loadHistory?.records) {
          const records = (loadHistory.records || []) as LoadRecord[];
          records.sort((a, b) => new Date(a.time).getTime() - new Date(b.time).getTime());
          setHistoricalLoadData(records);
        } else {
          setHistoricalLoadData([]);
        }
        setHistoricalLoadLoading(false);
      })
      .catch((err) => {
        setHistoricalLoadError(err.message || "Error");
        setHistoricalLoadLoading(false);
      });
  }, [nodeUuid, loadTimeRange, isLoadRealtime]);

  useEffect(() => { fetchPingData(); }, [fetchPingData, pingRefreshKey]);
  useEffect(() => {
    if (isLoadRealtime) return;
    fetchHistoricalLoad();
  }, [fetchHistoricalLoad, isLoadRealtime, loadRefreshKey]);

  useEffect(() => {
    if (isLoadRealtime && loadRefreshKey > 0) {
      refreshRealtimeLoad();
    }
  }, [isLoadRealtime, loadRefreshKey, refreshRealtimeLoad]);

  const loadData = isLoadRealtime ? realtimeLoadRecords : historicalLoadData;
  const loadLoading = isLoadRealtime ? realtimeLoadLoading : historicalLoadLoading;
  const loadError = isLoadRealtime ? realtimeLoadError : historicalLoadError;

  const chartData = useMemo(() => {
    const data = loadData || [];
    if (!data.length) return [];
    return transformLoadRecords(data);
  }, [loadData]);

  const pingChartData = useMemo(() => {
    const data = pingData || [];
    if (!data.length) return [];
    const taskKeys = tasks.map(t => String(t.id));
    let processed = processPingRecords(data, tasks, pingTimeRange);
    processed = interpolatePingNulls(processed, taskKeys);
    if (smooth) {
      processed = ewmaSmooth(processed, taskKeys, 0.3);
    }
    return processed;
  }, [pingData, tasks, pingTimeRange, smooth]);

  // Latency summary — uses backend stats when available, falls back to local calculation
  const latencySummary = useMemo(() => {
    if (!tasks.length) return [];

    return tasks.map(task => {
      const key = String(task.id);

      // Use backend-provided stats when available
      if (task.avg !== undefined && task.latest !== undefined) {
        const jitter = task.p99 !== undefined && task.p50 !== undefined
          ? (task.p99 - task.p50) / Math.max(Math.min(task.p50, 50), 10)
          : null;
        return {
          id: task.id,
          name: task.name,
          current: task.latest,
          avg: task.avg,
          min: task.min ?? null,
          max: task.max ?? null,
          p50: task.p50 ?? null,
          p99: task.p99 ?? null,
          loss: task.loss ?? 0,
          jitter,
          interval: task.interval,
          type: task.type ?? null,
          total: task.total ?? null,
        };
      }

      // Fallback: calculate from raw records
      if (!pingData?.length) {
        return {
          id: task.id, name: task.name, current: null, avg: null, min: null, max: null,
          p50: null, p99: null, loss: 0, jitter: null, interval: task.interval,
          type: task.type ?? null, total: null,
        };
      }

      const taskKeys = tasks.map(t => String(t.id));
      const processed = processPingRecords(pingData, tasks, 1);
      const interpolated = interpolatePingNulls(processed, taskKeys);
      const values = interpolated
        .map(d => d[key])
        .filter((v): v is number => v !== null && v !== undefined);

      const lastVal = values.length > 0 ? values[values.length - 1] : null;
      const avgVal = values.length > 0 ? values.reduce((a, b) => a + b, 0) / values.length : null;
      const sorted = [...values].sort((a, b) => a - b);
      const minVal = sorted.length > 0 ? sorted[0] : null;
      const maxVal = sorted.length > 0 ? sorted[sorted.length - 1] : null;
      const p50Val = sorted.length > 0 ? sorted[Math.floor(sorted.length * 0.5)] : null;
      const p99Val = sorted.length > 0 ? sorted[Math.floor(sorted.length * 0.99)] : null;

      const taskRecords = pingData.filter(r => r.task_id === task.id);
      const totalRecords = taskRecords.length;
      const lostRecords = taskRecords.filter(r => r.value < 0).length;
      const lossRate = totalRecords > 0 ? (lostRecords / totalRecords) * 100 : 0;

      const jitter = p99Val !== null && p50Val !== null
        ? (p99Val - p50Val) / Math.max(Math.min(p50Val, 50), 10)
        : null;

      return {
        id: task.id,
        name: task.name,
        current: lastVal,
        avg: avgVal,
        min: minVal,
        max: maxVal,
        p50: p50Val,
        p99: p99Val,
        loss: lossRate,
        jitter,
        interval: task.interval,
        type: task.type ?? null,
        total: totalRecords,
      };
    });
  }, [pingData, tasks]);

  // Health overview — one-line answer for "is the network healthy right now?"
  const healthOverview = useMemo(() => {
    if (!latencySummary.length) {
      return { level: 'unknown' as const, avgCurrent: null, maxLoss: 0, issueCount: 0 };
    }
    const currents = latencySummary
      .map(i => i.current)
      .filter((v): v is number => v !== null);
    const avgCurrent = currents.length
      ? currents.reduce((a, b) => a + b, 0) / currents.length
      : null;
    const maxLoss = latencySummary.reduce((m, i) => Math.max(m, i.loss), 0);
    const issueCount = latencySummary.filter(i => i.loss > 5).length;
    const warnCount = latencySummary.filter(i => i.loss > 0 && i.loss <= 5).length;
    const level: 'nominal' | 'degraded' | 'critical' =
      maxLoss > 5 ? 'critical' : warnCount > 0 ? 'degraded' : 'nominal';
    return { level, avgCurrent, maxLoss, issueCount, warnCount };
  }, [latencySummary]);

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const handleLegendClick = useCallback((e: any) => {
    if (e?.dataKey != null) {
      const key = String(e.dataKey);
      setHiddenLines((prev) => ({ ...prev, [key]: !prev[key] }));
    }
  }, []);

  if (!nodeUuid) return null;

  return (
    <div className="w-full space-y-5 overflow-hidden">
      {/* 与节点详情页 `/node/:uuid` 对齐：返回 + 面包屑（网络页为节点详情的子视图） */}
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
        <Button
          variant="ghost"
          size="sm"
          type="button"
          onClick={() => navigate(`/node/${nodeUuid}`)}
          className="h-7 px-2 font-mono text-xs hover:bg-primary/15 hover:text-primary"
        >
          <ArrowLeft className="mr-1 h-3.5 w-3.5" />
          {t('action.back')}
        </Button>
        <span className="flex min-w-0 items-center gap-2 font-mono text-xs text-muted-foreground">
          <Network className="h-3.5 w-3.5 shrink-0 text-primary" />
          <span className="truncate">
            / {nodeName || nodeUuid}
            <span className="text-muted-foreground/70"> · {t('label.network')}</span>
          </span>
        </span>
      </div>

      {/* Network Info Panel — 实时速率与累计流量分层，避免 lg 三列栅格错位 */}
      {stats && (
        <div className="network-stats-panel contain-layout rounded-lg border border-border/50 bg-card/80 backdrop-blur-xl overflow-hidden">
          {/* 实时上/下行：主信息区，大屏并排、小屏纵向堆叠 */}
          <div className="grid grid-cols-1 divide-y divide-border/20 sm:grid-cols-2 sm:divide-x sm:divide-y-0">
            <div className="relative p-4 sm:p-5 group">
              <div className="network-stat-glow pointer-events-none absolute inset-0 opacity-0 transition-opacity duration-300 group-hover:opacity-100" />
              <div className="relative flex min-h-[5.25rem] flex-col justify-center gap-2">
                <div className="flex items-center gap-2">
                  <span className="stat-chip stat-chip--up">
                    <ArrowUp className="h-3 w-3" />
                  </span>
                  <span className="type-hud-label text-muted-foreground/70">{t('label.upload')}</span>
                  <span className="ml-auto inline-flex items-center gap-1 rounded-full bg-primary/10 px-1.5 py-px text-xxs font-mono font-bold uppercase tracking-wider text-primary">
                    <span className="relative flex h-1.5 w-1.5">
                      <span className="absolute inset-0 rounded-full bg-primary/60 motion-safe:animate-ping" aria-hidden />
                      <span className="relative h-1.5 w-1.5 rounded-full bg-primary" />
                    </span>
                    {t('chart.realtime')}
                  </span>
                </div>
                <div className="flex items-end gap-3">
                  <div className="type-metric-xl text-xl sm:text-2xl text-foreground tabular-nums">
                    {formatSpeed(stats.network.up)}
                  </div>
                  {upHistory.length >= 2 && (
                    <div className="ml-auto shrink-0" aria-hidden>
                      <Sparkline data={upHistory} width={84} height={28} color="var(--color-primary)" />
                    </div>
                  )}
                </div>
                <div className="type-hud-label-sm text-muted-foreground/50">
                  {t('chart.recentWindow')}
                </div>
              </div>
            </div>
            <div className="relative p-4 sm:p-5 group">
              <div className="network-stat-glow pointer-events-none absolute inset-0 opacity-0 transition-opacity duration-300 group-hover:opacity-100" />
              <div className="relative flex min-h-[5.25rem] flex-col justify-center gap-2">
                <div className="flex items-center gap-2">
                  <span className="stat-chip stat-chip--down">
                    <ArrowDown className="h-3 w-3" />
                  </span>
                  <span className="type-hud-label text-muted-foreground/70">{t('label.download')}</span>
                  <span className="network-dir-live network-dir-live--down ml-auto inline-flex items-center gap-1 rounded-full bg-accent/10 px-1.5 py-px text-xxs font-mono font-bold uppercase tracking-wider text-accent">
                    <span className="relative flex h-1.5 w-1.5">
                      <span className="absolute inset-0 rounded-full bg-accent/60 motion-safe:animate-ping" aria-hidden />
                      <span className="relative h-1.5 w-1.5 rounded-full bg-accent" />
                    </span>
                    {t('chart.realtime')}
                  </span>
                </div>
                <div className="flex items-end gap-3">
                  <div className="type-metric-xl text-xl sm:text-2xl text-foreground tabular-nums">
                    {formatSpeed(stats.network.down)}
                  </div>
                  {downHistory.length >= 2 && (
                    <div className="ml-auto shrink-0" aria-hidden>
                      <Sparkline data={downHistory} width={84} height={28} color="var(--network-down-color, var(--color-accent))" />
                    </div>
                  )}
                </div>
                <div className="type-hud-label-sm text-muted-foreground/50">
                  {t('chart.recentWindow')}
                </div>
              </div>
            </div>
          </div>

          {/* 累计上下行：次级信息，统一字阶与对齐 */}
          <div className="grid grid-cols-2 divide-x divide-border/20 border-t border-border/20">
            <div className="stat-section group relative p-4 sm:p-4">
              <div className="network-stat-glow pointer-events-none absolute inset-0 opacity-0 transition-opacity duration-300 group-hover:opacity-100" />
              <div className="relative flex min-h-[3.75rem] flex-col justify-center gap-1.5">
                <div className="flex items-center gap-2">
                  <span className="stat-chip stat-chip--up">
                    <ArrowUp className="h-3 w-3" />
                  </span>
                  <span className="type-hud-label-sm sm:text-xs sm:leading-4">{t('label.totalUp')}</span>
                </div>
                <div className="type-metric-md sm:text-base text-foreground tabular-nums">
                  {stats.network.totalUp ? formatBytes(stats.network.totalUp) : t('label.na')}
                </div>
              </div>
            </div>
            <div className="stat-section group relative p-4 sm:p-4">
              <div className="network-stat-glow pointer-events-none absolute inset-0 opacity-0 transition-opacity duration-300 group-hover:opacity-100" />
              <div className="relative flex min-h-[3.75rem] flex-col justify-center gap-1.5">
                <div className="flex items-center gap-2">
                  <span className="stat-chip stat-chip--down">
                    <ArrowDown className="h-3 w-3" />
                  </span>
                  <span className="type-hud-label-sm sm:text-xs sm:leading-4">{t('label.totalDown')}</span>
                </div>
                <div className="type-metric-md sm:text-base text-foreground tabular-nums">
                  {stats.network.totalDown ? formatBytes(stats.network.totalDown) : t('label.na')}
                </div>
              </div>
            </div>
          </div>

          {/* Traffic limit progress — only shown when the node has a configured quota */}
          {propNode?.traffic_limit ? (() => {
            const used = calcTrafficUsage(
              stats.network.totalUp || 0,
              stats.network.totalDown || 0,
              propNode.traffic_limit_type as TrafficLimitType,
            );
            const pct = Math.min((used / propNode.traffic_limit) * 100, 100);
            const tone = pct >= 90 ? 'destructive' : pct >= 70 ? 'warning' : 'primary';
            return (
              <div className="stat-section relative border-t border-border/20 px-4 py-3 sm:px-5 flex flex-col gap-1.5">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <span className="flex items-center gap-2 type-hud-label-sm sm:text-xs sm:leading-4">
                    <span className="stat-chip stat-chip--traffic"><Gauge className="h-3 w-3" /></span>
                    {t('label.traffic')}
                  </span>
                  <span
                    className={cn(
                      'min-w-0 text-right text-xs font-metric font-bold tabular-nums wrap-break-word',
                      tone === 'destructive' && 'text-destructive',
                      tone === 'warning' && 'text-warning',
                    )}
                  >
                    {formatBytes(used)} / {formatBytes(propNode.traffic_limit)}
                    <span className="ml-2 text-xxs font-mono text-muted-foreground/70">
                      {t('chart.ofLimit', { pct: `${pct.toFixed(1)}%` })}
                    </span>
                  </span>
                </div>
                <Progress
                  value={pct}
                  className="h-1.5"
                  indicatorClassName={
                    tone === 'destructive'
                      ? 'bg-destructive'
                      : tone === 'warning'
                        ? 'bg-warning'
                        : ''
                  }
                />
              </div>
            );
          })() : null}

          {isLoggedIn && (
            <div className="stat-section relative border-t border-border/20 p-4 sm:px-5 sm:py-4 group" data-accent="network">
              <div className="network-stat-glow pointer-events-none absolute inset-0 opacity-0 transition-opacity duration-300 group-hover:opacity-100" />
              <div className="relative flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                <div className="flex items-center gap-2">
                  <span className="stat-chip stat-chip--network"><Unplug className="h-3 w-3" /></span>
                  <span className="type-hud-label text-muted-foreground/70">{t('label.tcpUdp')}</span>
                </div>
                <div className="flex flex-wrap items-baseline gap-x-6 gap-y-1 sm:justify-end">
                  <div className="flex items-baseline gap-2">
                    <span className="text-xs font-mono text-muted-foreground/70">TCP</span>
                    <span className="text-base font-metric font-bold tabular-nums text-chart-5">{stats.connections.tcp}</span>
                  </div>
                  <div className="hidden h-4 w-px bg-border/35 sm:block" aria-hidden />
                  <div className="flex items-baseline gap-2">
                    <span className="text-xs font-mono text-muted-foreground/70">UDP</span>
                    <span className="text-base font-metric font-bold tabular-nums text-chart-6">{stats.connections.udp}</span>
                  </div>
                </div>
              </div>
            </div>
          )}
        </div>
      )}

      {/* Latency overview table — collapsible with max-height scroll + expandable detail rows */}
      {latencySummary.length > 0 && (
        <div className="rounded-lg border border-border/50 bg-card/80 backdrop-blur-xl overflow-hidden">
          <button
            type="button"
            onClick={() => setLatencyCollapsed(c => !c)}
            aria-expanded={!latencyCollapsed}
            className="w-full flex items-center justify-between gap-3 px-4 py-3 border-b border-border/30 hover:bg-muted/10 transition-colors cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/50 focus-visible:ring-inset"
          >
            <div className="flex items-center gap-2 min-w-0">
              <Signal className="h-3.5 w-3.5 text-primary shrink-0" />
              <span className="type-panel-title">{t('chart.latencyOverview')}</span>
              <span className="text-xxs font-metric tabular-nums text-muted-foreground/60">({latencySummary.length})</span>
              {/* Collapsed-state summary badges — remain informative when the section is closed */}
              {latencyCollapsed && healthOverview.avgCurrent !== null && (
                <span className="ml-2 hidden items-center gap-2 sm:flex">
                  <span className="text-xxs font-mono text-muted-foreground/70 tabular-nums">
                    ~{Math.round(healthOverview.avgCurrent)}
                    <span className="ml-0.5 text-muted-foreground/50">ms</span>
                  </span>
                  <span
                    className={cn(
                      'rounded px-1.5 py-px text-xxs font-mono font-bold tabular-nums',
                      healthOverview.maxLoss > 5
                        ? 'bg-destructive/10 text-destructive'
                        : healthOverview.maxLoss > 0
                          ? 'bg-warning/10 text-warning'
                          : 'bg-success/10 text-success',
                    )}
                  >
                    {t('chart.lossPct', { pct: healthOverview.maxLoss.toFixed(1) })}
                  </span>
                </span>
              )}
              <Tooltip>
                <TooltipTrigger asChild>
                  <span
                    onClick={(e) => e.stopPropagation()}
                    className="ml-1 inline-flex h-9 w-9 sm:h-5 sm:w-5 items-center justify-center rounded-full text-muted-foreground/50 hover:bg-muted/30 hover:text-muted-foreground cursor-help"
                    aria-label={t('chart.lossDisclaimer')}
                  >
                    <Info className="h-3 w-3" />
                  </span>
                </TooltipTrigger>
                <TooltipContent side="bottom" className="max-w-xs text-xs leading-relaxed whitespace-pre-line">
                  {t('chart.lossDisclaimer')}
                </TooltipContent>
              </Tooltip>
            </div>
            <ChevronDown className={cn('h-3.5 w-3.5 text-muted-foreground transition-transform duration-200 shrink-0', latencyCollapsed && '-rotate-90')} />
          </button>
          {!latencyCollapsed && (
            <>
              <div className="overflow-x-auto max-h-128 overflow-y-auto">
                <table className="w-full min-w-140">
                  <thead className="sticky top-0 bg-card/95 backdrop-blur-sm z-10">
                    <tr className="border-b border-border/20">
                      <th className="w-8 px-2 py-2.5"></th>
                      <th className="type-hud-column px-4 py-2.5 text-left">{t('chart.taskName')}</th>
                      <th className="type-hud-column px-4 py-2.5 text-right">{t('chart.current')}</th>
                      <th className="type-hud-column px-4 py-2.5 text-right">{t('chart.average')}</th>
                      <th className="type-hud-column px-4 py-2.5 text-right">{t('chart.loss')}</th>
                      <th className="type-hud-column px-4 py-2.5 text-right">{t('chart.jitter')}</th>
                    </tr>
                  </thead>
                  <tbody>
                    {latencySummary.map(item => {
                      const isExpanded = expandedTasks.has(item.id);
                      const toggleExpand = () => setExpandedTasks(prev => {
                        const next = new Set(prev);
                        if (next.has(item.id)) next.delete(item.id); else next.add(item.id);
                        return next;
                      });
                      const lossTone =
                        item.loss > 5 ? 'destructive' : item.loss > 0 ? 'warning' : 'success';
                      return (
                        <Fragment key={item.id}>
                          <tr
                            className={cn(
                              'group cursor-pointer border-b transition-colors',
                              isExpanded
                                ? 'border-border/20 bg-primary/[0.07] shadow-[inset_3px_0_0_0_var(--color-primary)] hover:bg-primary/[0.09]'
                                : lossTone === 'destructive'
                                  ? 'border-destructive/15 bg-destructive/[0.04] shadow-[inset_3px_0_0_0_color-mix(in_oklch,var(--destructive)_45%,transparent)] hover:bg-destructive/[0.07]'
                                  : 'border-border/10 hover:bg-muted/10 last:border-0',
                            )}
                            onClick={toggleExpand}
                          >
                            <td className="w-8 px-2 py-2.5 text-center align-middle">
                              {isExpanded ? (
                                <ChevronDown className="inline-block h-3.5 w-3.5 text-primary" />
                              ) : (
                                <ChevronRight className="inline-block h-3.5 w-3.5 text-muted-foreground transition-colors group-hover:text-foreground" />
                              )}
                            </td>
                            <td className="px-4 py-2.5">
                              <div className="flex items-center gap-2">
                                <span
                                  className={cn(
                                    'h-2 w-2 shrink-0 rounded-full ring-2 ring-offset-1 ring-offset-background transition-shadow',
                                    isExpanded ? 'ring-primary/35' : 'ring-transparent',
                                  )}
                                  style={{ backgroundColor: chartColors[tasks.findIndex(t => t.id === item.id) % chartColors.length] }}
                                />
                                <span
                                  className={cn(
                                    'font-mono text-xs transition-colors',
                                    isExpanded ? 'font-semibold text-foreground' : 'font-medium text-foreground/90',
                                  )}
                                >
                                  {item.name}
                                </span>
                                {lossTone === 'destructive' && !isExpanded && (
                                  <AlertTriangle className="h-3 w-3 text-destructive" aria-hidden />
                                )}
                              </div>
                            </td>
                            <td className="px-4 py-2.5 text-right align-middle">
                              <span className="text-xs font-metric font-bold tabular-nums">
                                {item.current !== null ? `${Math.round(item.current)} ms` : '—'}
                              </span>
                            </td>
                            <td className="px-4 py-2.5 text-right align-middle">
                              <span className="text-xs font-metric tabular-nums text-muted-foreground">
                                {item.avg !== null ? `${Math.round(item.avg)} ms` : '—'}
                              </span>
                            </td>
                            <td className="px-4 py-2.5 text-right align-middle">
                              <span
                                className={cn(
                                  'inline-flex items-center rounded px-1.5 py-0.5 text-xs font-metric font-bold tabular-nums',
                                  lossTone === 'destructive' && 'bg-destructive/12 text-destructive ring-1 ring-destructive/25',
                                  lossTone === 'warning' && 'bg-warning/12 text-warning ring-1 ring-warning/25',
                                  lossTone === 'success' && 'text-success',
                                )}
                              >
                                {item.loss.toFixed(1)}%
                              </span>
                            </td>
                            <td className="px-4 py-2.5 text-right align-middle">
                              <span className={cn('text-xs font-metric tabular-nums', item.jitter !== null && item.jitter > 1 ? 'text-warning' : 'text-muted-foreground')}>
                                {item.jitter !== null ? item.jitter.toFixed(2) : '—'}
                              </span>
                            </td>
                          </tr>
                          {isExpanded && (
                            <tr key={`${item.id}-detail`} className="border-b border-border/10 bg-muted/[0.12]">
                              <td colSpan={6} className="p-0">
                                <div className="border-t border-primary/15 px-3 pb-3 pt-0">
                                  <div className="px-4 py-3.5">
                                    <div className="grid grid-cols-3 gap-x-6 gap-y-3 sm:grid-cols-4 lg:grid-cols-6">
                                  <div>
                                    <div className="text-xs font-mono text-muted-foreground/60 uppercase">{t('chart.min')}</div>
                                    <div className="text-xs font-metric font-bold tabular-nums">{item.min !== null ? `${Math.round(item.min)} ms` : '—'}</div>
                                  </div>
                                  <div>
                                    <div className="text-xs font-mono text-muted-foreground/60 uppercase">{t('chart.max')}</div>
                                    <div className="text-xs font-metric font-bold tabular-nums">{item.max !== null ? `${Math.round(item.max)} ms` : '—'}</div>
                                  </div>
                                  <div>
                                    <div className="text-xs font-mono text-muted-foreground/60 uppercase">{t('chart.average')}</div>
                                    <div className="text-xs font-metric font-bold tabular-nums">{item.avg !== null ? `${Math.round(item.avg)} ms` : '—'}</div>
                                  </div>
                                  <div>
                                    <div className="text-xs font-mono text-muted-foreground/60 uppercase">{t('chart.current')}</div>
                                    <div className="text-xs font-metric font-bold tabular-nums">{item.current !== null ? `${Math.round(item.current)} ms` : '—'}</div>
                                  </div>
                                  <div>
                                    <div className="text-xs font-mono text-muted-foreground/60 uppercase">{t('chart.jitter')}</div>
                                    <div className="text-xs font-metric font-bold tabular-nums">{item.jitter !== null ? item.jitter.toFixed(2) : '—'}</div>
                                  </div>
                                  <div>
                                    <div className="text-xs font-mono text-muted-foreground/60 uppercase">P50</div>
                                    <div className="text-xs font-metric font-bold tabular-nums">{item.p50 !== null ? `${Math.round(item.p50)} ms` : '—'}</div>
                                  </div>
                                  <div>
                                    <div className="text-xs font-mono text-muted-foreground/60 uppercase">P99</div>
                                    <div className="text-xs font-metric font-bold tabular-nums">{item.p99 !== null ? `${Math.round(item.p99)} ms` : '—'}</div>
                                  </div>
                                  <div>
                                    <div className="text-xs font-mono text-muted-foreground/60 uppercase">{t('chart.loss')}</div>
                                    <div className={cn('text-xs font-metric font-bold tabular-nums', item.loss > 5 ? 'text-destructive' : item.loss > 0 ? 'text-warning' : 'text-success')}>
                                      {item.loss.toFixed(1)}%
                                    </div>
                                  </div>
                                  <div>
                                    <div className="text-xs font-mono text-muted-foreground/60 uppercase">{t('chart.checkInterval')}</div>
                                    <div className="text-xs font-metric font-bold tabular-nums">{item.interval}s</div>
                                  </div>
                                  <div>
                                    <div className="text-xs font-mono text-muted-foreground/60 uppercase">{t('chart.checkType')}</div>
                                    <div className="text-xs font-mono font-bold uppercase">{item.type || '—'}</div>
                                  </div>
                                  <div>
                                    <div className="text-xs font-mono text-muted-foreground/60 uppercase">{t('chart.sampleCount')}</div>
                                    <div className="text-xs font-metric font-bold tabular-nums">{item.total !== null ? item.total : '—'}</div>
                                  </div>
                                    </div>
                                  </div>
                                </div>
                              </td>
                            </tr>
                          )}
                        </Fragment>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </>
          )}
        </div>
      )}

      {/* Load charts — time range aligned with node detail page */}
      <ChartTimeRangeBar
        value={loadTimeRange}
        onChange={setLoadTimeRange}
        onRefresh={() => setLoadRefreshKey(k => k + 1)}
        options={loadTimeRangeOptions}
        loading={loadLoading}
      />

      {loadLoading && (
        <div className="flex h-48 items-center justify-center rounded-lg border border-border/50 bg-card/40 backdrop-blur-xl">
          <HudSpinner size="lg" />
        </div>
      )}

      {loadError && !loadLoading && (
        <div className="flex flex-col items-center justify-center gap-3 h-48 rounded-lg border border-destructive/40 bg-card/80 backdrop-blur-xl px-4">
          <AlertTriangle className="h-5 w-5 text-destructive/80" aria-hidden />
          <div className="text-sm text-destructive text-center">{loadError}</div>
          <button
            type="button"
            onClick={isLoadRealtime ? refreshRealtimeLoad : fetchHistoricalLoad}
            className="px-3 py-1.5 text-xs font-mono rounded border border-primary/30 text-primary hover:bg-primary/15 transition-colors cursor-pointer inline-flex items-center gap-1.5"
          >
            <RotateCw className="h-3 w-3" aria-hidden />
            {t('action.retry')}
          </button>
        </div>
      )}

      {!loadLoading && !loadError && (
      <div className="grid w-full grid-cols-1 gap-4 lg:grid-cols-2">
        <Card className={chartCardClass}>
          <CardHeader className="px-4 pt-3 pb-2">
            <CardTitle className="flex items-center gap-2 text-sm font-semibold">
              <Unplug className="h-4 w-4 text-chart-5" />
              {t('chart.connections')}
            </CardTitle>
          </CardHeader>
          <CardContent className="px-4 pb-3">
            <ConnectionsLineChart
              chartData={chartData}
              mode="detail"
              isMobile={isMobile}
              containerClassName={chartContainerClass}
            />
          </CardContent>
        </Card>

        <Card className={chartCardClass}>
          <CardHeader className="px-4 pt-3 pb-2">
            <CardTitle className="flex items-center gap-2 text-sm font-semibold">
              <ArrowUpDown className="h-4 w-4 text-chart-7" />
              {t('chart.networkTraffic')}
            </CardTitle>
          </CardHeader>
          <CardContent className="px-4 pb-3">
            <NetworkTrafficAreaChart
              chartData={chartData}
              mode="detail"
              isMobile={isMobile}
              containerClassName={chartContainerClass}
            />
          </CardContent>
        </Card>

        {pingChartData.length > 0 && (
          <>
            <ChartTimeRangeBar
              value={pingTimeRange}
              onChange={setPingTimeRange}
              onRefresh={() => setPingRefreshKey(k => k + 1)}
              options={pingTimeRangeOptions}
              loading={pingLoading}
              className="lg:col-span-2"
            />
          <Card className={`${chartCardClass} lg:col-span-2`}>
            <CardHeader className="px-4 pt-3 pb-2">
              <CardTitle className="flex items-center justify-between text-sm font-semibold">
                <span className="flex items-center gap-2">
                  <Signal className="h-4 w-4 text-chart-2" />
                  {t('chart.pingLatency')}
                </span>
                <PingCurveModeToggle
                  value={smooth ? 'smooth' : 'raw'}
                  onChange={mode => setSmooth(mode === 'smooth')}
                />
              </CardTitle>
            </CardHeader>
            <CardContent className="px-4 pb-3">
              <PingLatencyLineChart
                pingChartData={pingChartData}
                tasks={tasks}
                mode="detail"
                isMobile={isMobile}
                containerClassName={chartContainerClass}
                smooth={smooth}
                hiddenLines={hiddenLines}
                onLegendClick={handleLegendClick}
              />
            </CardContent>
          </Card>
          </>
        )}
      </div>
      )}
    </div>
  );
}
