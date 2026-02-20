import { useEffect, useMemo, useState, useCallback, Fragment } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { useTranslation } from 'react-i18next';
import { Card, CardContent, CardHeader, CardTitle } from './ui/card';
import { ArrowLeft, Network, Signal, ArrowUpDown, Unplug, ChevronDown, ChevronRight, Info } from 'lucide-react';
import { HudSpinner } from './HudSpinner';
import { apiService } from '../services/api';
import { useAppConfig } from '@/hooks/useAppConfig';
import { formatSpeed, formatBytes } from '@/lib/utils';
import type { NodeWithStatus } from '@/services/api';
import {
  ChartContainer,
  ChartTooltip,
  ChartTooltipContent,
  ChartLegend,
  ChartLegendContent,
} from './ui/chart';
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  AreaChart,
  Area,
} from 'recharts';
import {
  chartColors,
  chartCardClass,
  chartContainerClass,
  gridStrokeColor,
  labelFormatter,
  processPingRecords,
  interpolatePingNulls,
  ewmaSmooth,
  type PingRecord,
  type TaskInfo,
} from '@/lib/chart-utils';

interface LoadRecord {
  time: string;
  cpu: number;
  ram: number;
  ram_total: number;
  swap: number;
  swap_total: number;
  disk: number;
  disk_total: number;
  load: number;
  connections: number;
  connections_udp: number;
  net_in: number;
  net_out: number;
}

const useIsMobile = () => {
  const [isMobile, setIsMobile] = useState(false);
  useEffect(() => {
    const check = () => setIsMobile(window.innerWidth < 640);
    check();
    window.addEventListener('resize', check);
    return () => window.removeEventListener('resize', check);
  }, []);
  return isMobile;
};

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
  const { recordPreserveTime, isLoggedIn } = useAppConfig();

  const [loadData, setLoadData] = useState<LoadRecord[] | null>(null);
  const [pingData, setPingData] = useState<PingRecord[] | null>(null);
  const [tasks, setTasks] = useState<TaskInfo[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [timeRange, setTimeRange] = useState(1);
  const [hiddenLines, setHiddenLines] = useState<Record<string, boolean>>({});
  const [smooth, setSmooth] = useState(false);
  const [latencyCollapsed, setLatencyCollapsed] = useState(false);
  const [expandedTasks, setExpandedTasks] = useState<Set<number>>(new Set());
  const isMobile = useIsMobile();

  // Accept node data from parent context if available
  const stats = propNode?.stats;

  const timeRanges = useMemo(() => {
    const candidates = [
      { value: 1, label: '1H' },
      { value: 6, label: '6H' },
      { value: 24, label: '24H' },
      { value: 168, label: '7D' },
      { value: 720, label: '30D' },
    ];
    const limit = recordPreserveTime > 0 ? recordPreserveTime : 720;
    return candidates.filter(r => r.value <= limit);
  }, [recordPreserveTime]);

  useEffect(() => {
    if (!nodeName && nodeUuid) {
      apiService.getNodes().then(nodes => {
        const node = nodes.find(n => n.uuid === nodeUuid);
        if (node) setNodeName(node.name);
      });
    }
  }, [nodeUuid, nodeName]);

  const chartMargin = useMemo(() => ({
    top: 10,
    right: isMobile ? 4 : 16,
    bottom: isMobile ? 20 : 10,
    left: isMobile ? 4 : 16
  }), [isMobile]);

  const yAxisConfig = useMemo(() => ({
    tick: { fontSize: isMobile ? 10 : 12, dx: -5 },
    width: isMobile ? 35 : 40
  }), [isMobile]);

  const xAxisConfig = useMemo(() => ({
    tick: { fontSize: isMobile ? 10 : 11 },
    height: isMobile ? 30 : 40,
    minTickGap: isMobile ? 50 : 30
  }), [isMobile]);

  // Fetch ping data independently (not tied to timeRange)
  const fetchPingData = useCallback(() => {
    if (!nodeUuid) return;
    apiService.getPingHistory(nodeUuid, 1)
      .then((pingHistory) => {
        if (pingHistory?.records) {
          const records = (pingHistory.records || []) as PingRecord[];
          records.sort((a, b) => new Date(a.time).getTime() - new Date(b.time).getTime());
          setPingData(records);
          setTasks(pingHistory.tasks || []);
        }
      })
      .catch(() => {});
  }, [nodeUuid]);

  // Fetch load/chart data (tied to timeRange)
  const fetchLoadData = useCallback(() => {
    if (!nodeUuid) return;
    setLoading(true);
    setError(null);
    apiService.getLoadHistory(nodeUuid, timeRange)
      .then((loadHistory) => {
        if (loadHistory?.records) {
          const records = (loadHistory.records || []) as LoadRecord[];
          records.sort((a, b) => new Date(a.time).getTime() - new Date(b.time).getTime());
          setLoadData(records);
        }
        setLoading(false);
      })
      .catch((err) => {
        setError(err.message || "Error");
        setLoading(false);
      });
  }, [nodeUuid, timeRange]);

  const fetchData = useCallback(() => {
    fetchLoadData();
    fetchPingData();
  }, [fetchLoadData, fetchPingData]);

  // Ping data: fetch once on mount
  useEffect(() => { fetchPingData(); }, [fetchPingData]);
  // Load data: fetch when timeRange changes
  useEffect(() => { fetchLoadData(); }, [fetchLoadData]);

  const chartData = useMemo(() => {
    const data = loadData || [];
    if (!data.length) return [];
    return data.map((r) => ({
      time: new Date(r.time).toISOString(),
      connections: r.connections,
      connections_udp: r.connections_udp,
      network_in: r.net_in / 1024,
      network_out: r.net_out / 1024,
    }));
  }, [loadData]);

  const pingChartData = useMemo(() => {
    const data = pingData || [];
    if (!data.length) return [];
    const taskKeys = tasks.map(t => String(t.id));
    let processed = processPingRecords(data, tasks, timeRange);
    processed = interpolatePingNulls(processed, taskKeys);
    if (smooth) {
      processed = ewmaSmooth(processed, taskKeys, 0.3);
    }
    return processed;
  }, [pingData, tasks, timeRange, smooth]);

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

  const timeFormatter = useCallback((value: any, index: number) => {
    if (!chartData.length) return "";
    const total = chartData.length;
    if (isMobile) {
      if (index === 0 || index === total - 1) {
        return new Date(value).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
      }
    } else {
      if (index === 0 || index === total - 1 || index === Math.floor(total / 2)) {
        return new Date(value).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
      }
    }
    return "";
  }, [chartData.length, isMobile]);

  const handleLegendClick = useCallback((e: any) => {
    setHiddenLines((prev) => ({ ...prev, [e.dataKey]: !prev[e.dataKey] }));
  }, []);

  const connConfig = { connections: { label: t('label.tcp'), color: chartColors[4] }, connections_udp: { label: t('label.udp'), color: chartColors[5] } };
  const netConfig = { network_in: { label: t('label.in'), color: chartColors[6] }, network_out: { label: t('label.out'), color: chartColors[7] } };
  const pingConfig = useMemo(() => {
    const c: Record<string, any> = {};
    tasks.forEach((tk, i) => { c[tk.id] = { label: tk.name, color: chartColors[i % chartColors.length] }; });
    return c;
  }, [tasks]);

  const xAxisProps = {
    dataKey: "time",
    tickLine: false,
    axisLine: false,
    tickFormatter: timeFormatter,
    interval: "preserveStartEnd" as const,
    minTickGap: xAxisConfig.minTickGap,
    tick: xAxisConfig.tick,
    height: xAxisConfig.height,
  };

  const yAxisPlainProps = {
    tickLine: false,
    axisLine: false,
    orientation: "left" as const,
    type: "number" as const,
    tick: yAxisConfig.tick,
    width: yAxisConfig.width,
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <HudSpinner size="lg" />
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex flex-col items-center justify-center h-64 rounded-lg border border-border/50 bg-card/80 backdrop-blur-xl">
        <div className="text-sm font-mono text-red-500 mb-3">{error}</div>
        <button onClick={fetchData} className="px-3 py-1.5 text-xs font-mono rounded border border-primary/30 text-primary hover:bg-primary/15 transition-colors cursor-pointer">
          {t('action.retry')}
        </button>
      </div>
    );
  }

  return (
    <div className="space-y-4 w-full overflow-hidden">
      {/* Header */}
      <div className="rounded-lg border border-border/50 bg-card/80 backdrop-blur-xl overflow-hidden">
        <div className="flex items-center justify-between px-4 py-3">
          <div className="flex items-center gap-3">
            <button
              onClick={() => navigate(-1)}
              className="px-2 py-1 text-xs font-mono rounded hover:bg-primary/15 hover:text-primary transition-colors cursor-pointer flex items-center"
            >
              <ArrowLeft className="h-3.5 w-3.5 mr-1" />
              {t('action.back')}
            </button>
            <div className="w-px h-5 bg-border/30" />
            <Network className="h-4 w-4 text-primary" />
            <span className="text-sm font-display font-bold">{nodeName || nodeUuid}</span>
            <span className="text-xs font-display font-bold text-muted-foreground uppercase tracking-wider">{t('label.network')}</span>
          </div>
          <div className="flex items-center gap-1">
            {timeRanges.map(tr => (
              <button
                key={tr.value}
                onClick={() => setTimeRange(tr.value)}
                className={`px-2.5 py-1 text-xs font-mono rounded transition-all duration-200 cursor-pointer ${
                  timeRange === tr.value
                    ? 'bg-primary/15 text-primary border border-primary/30'
                    : 'text-muted-foreground hover:text-foreground hover:bg-muted/30'
                }`}
              >
                {tr.label}
              </button>
            ))}
            <div className="w-px h-5 bg-border/30 mx-1" />
            <button onClick={fetchData} className="px-2 py-1 text-xs font-mono rounded text-muted-foreground hover:bg-primary/15 hover:text-primary transition-colors cursor-pointer">
              ↻
            </button>
          </div>
        </div>
      </div>

      {/* Network Info Panel — live stats with theme-aware design */}
      {stats && (
        <div className="network-stats-panel rounded-lg border border-border/50 bg-card/80 backdrop-blur-xl overflow-hidden">
          <div className="grid grid-cols-2 lg:grid-cols-3 divide-x divide-y divide-border/20">
            {/* Upload / Download */}
            <div className="relative p-4 group">
              <div className="network-stat-glow absolute inset-0 opacity-0 group-hover:opacity-100 transition-opacity duration-300 pointer-events-none" />
              <div className="relative">
                <div className="flex items-center gap-1.5 mb-2">
                  <span className="inline-flex items-center justify-center w-5 h-5 rounded bg-primary/10 text-primary text-xs">↑</span>
                  <span className="text-xs font-display font-bold text-muted-foreground/60 uppercase tracking-wider">{t('label.upload')}</span>
                </div>
                <div className="text-lg font-mono font-bold tabular-nums">{formatSpeed(stats.network.up)}</div>
              </div>
            </div>
            <div className="relative p-4 group">
              <div className="network-stat-glow absolute inset-0 opacity-0 group-hover:opacity-100 transition-opacity duration-300 pointer-events-none" />
              <div className="relative">
                <div className="flex items-center gap-1.5 mb-2">
                  <span className="inline-flex items-center justify-center w-5 h-5 rounded bg-accent/10 text-accent text-xs">↓</span>
                  <span className="text-xs font-display font-bold text-muted-foreground/60 uppercase tracking-wider">{t('label.download')}</span>
                </div>
                <div className="text-lg font-mono font-bold tabular-nums">{formatSpeed(stats.network.down)}</div>
              </div>
            </div>

            {/* Total Traffic */}
            <div className="relative p-4 group">
              <div className="network-stat-glow absolute inset-0 opacity-0 group-hover:opacity-100 transition-opacity duration-300 pointer-events-none" />
              <div className="relative">
                <div className="flex items-center gap-1.5 mb-2">
                  <span className="inline-flex items-center justify-center w-5 h-5 rounded bg-muted/30">
                    <ArrowUpDown className="h-3 w-3 text-muted-foreground" />
                  </span>
                  <span className="text-xs font-display font-bold text-muted-foreground/60 uppercase tracking-wider">{t('label.totalUp')}</span>
                </div>
                <div className="text-sm font-mono font-bold tabular-nums">
                  {stats.network.totalUp ? formatBytes(stats.network.totalUp) : t('label.na')}
                </div>
              </div>
            </div>
            <div className="relative p-4 group">
              <div className="network-stat-glow absolute inset-0 opacity-0 group-hover:opacity-100 transition-opacity duration-300 pointer-events-none" />
              <div className="relative">
                <div className="flex items-center gap-1.5 mb-2">
                  <span className="inline-flex items-center justify-center w-5 h-5 rounded bg-muted/30">
                    <ArrowUpDown className="h-3 w-3 text-muted-foreground" />
                  </span>
                  <span className="text-xs font-display font-bold text-muted-foreground/60 uppercase tracking-wider">{t('label.totalDown')}</span>
                </div>
                <div className="text-sm font-mono font-bold tabular-nums">
                  {stats.network.totalDown ? formatBytes(stats.network.totalDown) : t('label.na')}
                </div>
              </div>
            </div>

            {/* TCP / UDP Connections */}
            {isLoggedIn && (
              <div className="relative p-4 col-span-2 lg:col-span-1 group">
                <div className="network-stat-glow absolute inset-0 opacity-0 group-hover:opacity-100 transition-opacity duration-300 pointer-events-none" />
                <div className="relative">
                  <div className="flex items-center gap-1.5 mb-2">
                    <span className="inline-flex items-center justify-center w-5 h-5 rounded bg-muted/30">
                      <Unplug className="h-3 w-3 text-muted-foreground" />
                    </span>
                    <span className="text-xs font-display font-bold text-muted-foreground/60 uppercase tracking-wider">{t('label.tcpUdp')}</span>
                  </div>
                  <div className="flex items-baseline gap-4">
                    <div>
                      <span className="text-xs font-mono text-muted-foreground/60">TCP</span>
                      <span className="text-sm font-mono font-bold tabular-nums ml-1.5">{stats.connections.tcp}</span>
                    </div>
                    <div className="w-px h-4 bg-border/30" />
                    <div>
                      <span className="text-xs font-mono text-muted-foreground/60">UDP</span>
                      <span className="text-sm font-mono font-bold tabular-nums ml-1.5">{stats.connections.udp}</span>
                    </div>
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Latency overview table — collapsible with max-height scroll + expandable detail rows */}
      {latencySummary.length > 0 && (
        <div className="rounded-lg border border-border/50 bg-card/80 backdrop-blur-xl overflow-hidden">
          <button
            onClick={() => setLatencyCollapsed(c => !c)}
            className="w-full flex items-center justify-between px-4 py-3 border-b border-border/30 hover:bg-muted/10 transition-colors cursor-pointer"
          >
            <div className="flex items-center gap-2">
              <Signal className="h-3.5 w-3.5 text-primary" />
              <span className="text-xs font-display font-bold text-muted-foreground uppercase tracking-wider">{t('chart.latencyOverview')}</span>
              <span className="text-xxs font-mono text-muted-foreground/60">({latencySummary.length})</span>
            </div>
            <ChevronDown className={`h-3.5 w-3.5 text-muted-foreground transition-transform duration-200 ${latencyCollapsed ? '-rotate-90' : ''}`} />
          </button>
          {!latencyCollapsed && (
            <>
              <div className="px-4 py-2 border-b border-border/10 flex items-start gap-1.5 bg-muted/5">
                <Info className="h-3 w-3 text-muted-foreground/40 mt-0.5 shrink-0" />
                <span className="text-xs font-mono text-muted-foreground/60 leading-relaxed">{t('chart.lossDisclaimer')}</span>
              </div>
              <div className="overflow-x-auto max-h-128 overflow-y-auto">
                <table className="w-full">
                  <thead className="sticky top-0 bg-card/95 backdrop-blur-sm z-10">
                    <tr className="border-b border-border/20">
                      <th className="text-left text-xs font-mono font-bold text-muted-foreground/60 uppercase px-4 py-2 w-8"></th>
                      <th className="text-left text-xs font-mono font-bold text-muted-foreground/60 uppercase px-4 py-2">{t('chart.taskName')}</th>
                      <th className="text-right text-xs font-mono font-bold text-muted-foreground/60 uppercase px-4 py-2">{t('chart.current')}</th>
                      <th className="text-right text-xs font-mono font-bold text-muted-foreground/60 uppercase px-4 py-2">{t('chart.average')}</th>
                      <th className="text-right text-xs font-mono font-bold text-muted-foreground/60 uppercase px-4 py-2">{t('chart.loss')}</th>
                      <th className="text-right text-xs font-mono font-bold text-muted-foreground/60 uppercase px-4 py-2">{t('chart.jitter')}</th>
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
                      return (
                        <Fragment key={item.id}>
                          <tr
                            className="border-b border-border/10 last:border-0 hover:bg-muted/10 transition-colors cursor-pointer"
                            onClick={toggleExpand}
                          >
                            <td className="px-2 py-2 w-8 text-center">
                              {isExpanded
                                ? <ChevronDown className="h-3 w-3 text-muted-foreground inline-block" />
                                : <ChevronRight className="h-3 w-3 text-muted-foreground inline-block" />
                              }
                            </td>
                            <td className="px-4 py-2">
                              <div className="flex items-center gap-2">
                                <span className="w-2 h-2 rounded-full shrink-0" style={{ backgroundColor: chartColors[tasks.findIndex(t => t.id === item.id) % chartColors.length] }} />
                                <span className="text-xs font-mono font-medium">{item.name}</span>
                              </div>
                            </td>
                            <td className="text-right px-4 py-2">
                              <span className="text-xs font-mono font-bold tabular-nums">
                                {item.current !== null ? `${Math.round(item.current)} ms` : '—'}
                              </span>
                            </td>
                            <td className="text-right px-4 py-2">
                              <span className="text-xs font-mono tabular-nums text-muted-foreground">
                                {item.avg !== null ? `${Math.round(item.avg)} ms` : '—'}
                              </span>
                            </td>
                            <td className="text-right px-4 py-2">
                              <span className={`text-xs font-mono font-bold tabular-nums ${item.loss > 5 ? 'text-red-500' : item.loss > 0 ? 'text-yellow-500' : 'text-green-500'}`}>
                                {item.loss.toFixed(1)}%
                              </span>
                            </td>
                            <td className="text-right px-4 py-2">
                              <span className={`text-xs font-mono tabular-nums ${item.jitter !== null && item.jitter > 1 ? 'text-yellow-500' : 'text-muted-foreground'}`}>
                                {item.jitter !== null ? item.jitter.toFixed(2) : '—'}
                              </span>
                            </td>
                          </tr>
                          {isExpanded && (
                            <tr key={`${item.id}-detail`} className="border-b border-border/10">
                              <td colSpan={6} className="px-4 py-3 bg-muted/5">
                                <div className="grid grid-cols-3 sm:grid-cols-4 lg:grid-cols-6 gap-x-6 gap-y-2">
                                  <div>
                                    <div className="text-xs font-mono text-muted-foreground/60 uppercase">{t('chart.min')}</div>
                                    <div className="text-xs font-mono font-bold tabular-nums">{item.min !== null ? `${Math.round(item.min)} ms` : '—'}</div>
                                  </div>
                                  <div>
                                    <div className="text-xs font-mono text-muted-foreground/60 uppercase">{t('chart.max')}</div>
                                    <div className="text-xs font-mono font-bold tabular-nums">{item.max !== null ? `${Math.round(item.max)} ms` : '—'}</div>
                                  </div>
                                  <div>
                                    <div className="text-xs font-mono text-muted-foreground/60 uppercase">{t('chart.average')}</div>
                                    <div className="text-xs font-mono font-bold tabular-nums">{item.avg !== null ? `${Math.round(item.avg)} ms` : '—'}</div>
                                  </div>
                                  <div>
                                    <div className="text-xs font-mono text-muted-foreground/60 uppercase">{t('chart.current')}</div>
                                    <div className="text-xs font-mono font-bold tabular-nums">{item.current !== null ? `${Math.round(item.current)} ms` : '—'}</div>
                                  </div>
                                  <div>
                                    <div className="text-xs font-mono text-muted-foreground/60 uppercase">{t('chart.jitter')}</div>
                                    <div className="text-xs font-mono font-bold tabular-nums">{item.jitter !== null ? item.jitter.toFixed(2) : '—'}</div>
                                  </div>
                                  <div>
                                    <div className="text-xs font-mono text-muted-foreground/60 uppercase">P50</div>
                                    <div className="text-xs font-mono font-bold tabular-nums">{item.p50 !== null ? `${Math.round(item.p50)} ms` : '—'}</div>
                                  </div>
                                  <div>
                                    <div className="text-xs font-mono text-muted-foreground/60 uppercase">P99</div>
                                    <div className="text-xs font-mono font-bold tabular-nums">{item.p99 !== null ? `${Math.round(item.p99)} ms` : '—'}</div>
                                  </div>
                                  <div>
                                    <div className="text-xs font-mono text-muted-foreground/60 uppercase">{t('chart.loss')}</div>
                                    <div className={`text-xs font-mono font-bold tabular-nums ${item.loss > 5 ? 'text-red-500' : item.loss > 0 ? 'text-yellow-500' : 'text-green-500'}`}>
                                      {item.loss.toFixed(1)}%
                                    </div>
                                  </div>
                                  <div>
                                    <div className="text-xs font-mono text-muted-foreground/60 uppercase">{t('chart.checkInterval')}</div>
                                    <div className="text-xs font-mono font-bold tabular-nums">{item.interval}s</div>
                                  </div>
                                  <div>
                                    <div className="text-xs font-mono text-muted-foreground/60 uppercase">{t('chart.checkType')}</div>
                                    <div className="text-xs font-mono font-bold tabular-nums uppercase">{item.type || '—'}</div>
                                  </div>
                                  <div>
                                    <div className="text-xs font-mono text-muted-foreground/60 uppercase">{t('chart.sampleCount')}</div>
                                    <div className="text-xs font-mono font-bold tabular-nums">{item.total !== null ? item.total : '—'}</div>
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

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 w-full">
        {/* Network Traffic */}
        <Card className={chartCardClass}>
          <CardHeader className="pb-2 px-4 pt-3">
            <CardTitle className="flex items-center gap-2 text-sm font-semibold">
              <ArrowUpDown className="h-4 w-4 text-primary" />
              {t('chart.networkTraffic')}
            </CardTitle>
          </CardHeader>
          <CardContent className="px-4 pb-3">
            <ChartContainer config={netConfig} className={chartContainerClass}>
              <AreaChart data={chartData} margin={chartMargin}>
                <CartesianGrid vertical={false} stroke={gridStrokeColor} strokeOpacity={0.3} />
                <XAxis {...xAxisProps} />
                <YAxis
                  tickLine={false}
                  axisLine={false}
                  unit="KB/s"
                  orientation="left"
                  type="number"
                  tick={{ ...yAxisConfig.tick, dx: -5 }}
                  width={isMobile ? 50 : 60}
                />
                <ChartTooltip
                  cursor={false}
                  formatter={(v: any) => `${typeof v === 'number' ? v.toFixed(1) : v} KB/s`}
                  content={<ChartTooltipContent labelFormatter={labelFormatter} indicator="dot" />}
                />
                <ChartLegend content={<ChartLegendContent />} />
                <Area dataKey="network_in" name={t('label.in')} stroke={chartColors[6]} fill={chartColors[6]} fillOpacity={0.15} type="linear" />
                <Area dataKey="network_out" name={t('label.out')} stroke={chartColors[7]} fill={chartColors[7]} fillOpacity={0.15} type="linear" />
              </AreaChart>
            </ChartContainer>
          </CardContent>
        </Card>

        {/* Connections */}
        <Card className={chartCardClass}>
          <CardHeader className="pb-2 px-4 pt-3">
            <CardTitle className="flex items-center gap-2 text-sm font-semibold">
              <Unplug className="h-4 w-4 text-primary" />
              {t('chart.connections')}
            </CardTitle>
          </CardHeader>
          <CardContent className="px-4 pb-3">
            <ChartContainer config={connConfig} className={chartContainerClass}>
              <LineChart data={chartData} margin={chartMargin}>
                <CartesianGrid vertical={false} stroke={gridStrokeColor} strokeOpacity={0.3} />
                <XAxis {...xAxisProps} />
                <YAxis {...yAxisPlainProps} />
                <ChartTooltip
                  cursor={false}
                  content={<ChartTooltipContent labelFormatter={labelFormatter} indicator="dot" />}
                />
                <ChartLegend content={<ChartLegendContent />} />
                <Line dataKey="connections" name={t('label.tcp')} stroke={chartColors[4]} dot={false} isAnimationActive={false} strokeWidth={2} type="linear" />
                <Line dataKey="connections_udp" name={t('label.udp')} stroke={chartColors[5]} dot={false} isAnimationActive={false} strokeWidth={2} type="linear" />
              </LineChart>
            </ChartContainer>
          </CardContent>
        </Card>

        {/* Ping Latency */}
        {pingChartData.length > 0 && (
          <Card className={`${chartCardClass} lg:col-span-2`}>
            <CardHeader className="pb-2 px-4 pt-3">
              <CardTitle className="flex items-center justify-between text-sm font-semibold">
                <span className="flex items-center gap-2">
                  <Signal className="h-4 w-4 text-primary" />
                  {t('chart.pingLatency')}
                </span>
                <button
                  onClick={() => setSmooth(s => !s)}
                  title={t('chart.ewmaTooltip')}
                  className={`flex items-center gap-1 px-1.5 py-0.5 rounded text-xs font-mono tracking-widest transition-all duration-200 cursor-pointer ${
                    smooth
                      ? 'bg-primary/10 text-primary/80'
                      : 'text-muted-foreground/40 hover:text-muted-foreground/60'
                  }`}
                >
                  <span className={`w-1.5 h-1.5 rounded-full transition-all duration-300 ${
                    smooth
                      ? 'bg-primary shadow-[0_0_4px_var(--color-primary)]'
                      : 'bg-muted-foreground/20'
                  }`} />
                  <span>{smooth ? 'SMOOTH' : 'RAW'}</span>
                </button>
              </CardTitle>
            </CardHeader>
            <CardContent className="px-4 pb-3">
              <ChartContainer config={pingConfig} className={chartContainerClass}>
                <LineChart data={pingChartData} margin={chartMargin}>
                  <CartesianGrid vertical={false} stroke={gridStrokeColor} strokeOpacity={0.3} />
                  <XAxis {...xAxisProps} />
                  <YAxis
                    tickLine={false}
                    axisLine={false}
                    unit="ms"
                    allowDecimals={false}
                    orientation="left"
                    type="number"
                    tick={yAxisConfig.tick}
                    width={isMobile ? 45 : 50}
                  />
                  <ChartTooltip
                    cursor={false}
                    formatter={(v: any) => `${Math.round(v)} ms`}
                    content={<ChartTooltipContent labelFormatter={labelFormatter} indicator="dot" />}
                  />
                  <ChartLegend content={<ChartLegendContent />} onClick={handleLegendClick} />
                  {tasks.map((task, idx) => (
                    <Line
                      key={task.id}
                      dataKey={String(task.id)}
                      name={task.name}
                      stroke={chartColors[idx % chartColors.length]}
                      dot={false}
                      isAnimationActive={false}
                      strokeWidth={2}
                      connectNulls={false}
                      type={smooth ? "basis" : "linear"}
                      hide={!!hiddenLines[task.id]}
                    />
                  ))}
                </LineChart>
              </ChartContainer>
            </CardContent>
          </Card>
        )}
      </div>
    </div>
  );
}
