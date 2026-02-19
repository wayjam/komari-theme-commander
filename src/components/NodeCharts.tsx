import { useEffect, useMemo, useState, useCallback } from "react";
import { useTranslation } from 'react-i18next';
import { Link } from 'react-router-dom';
import { Card, CardContent, CardHeader, CardTitle } from './ui/card';
import { Button } from './ui/button';
import { Cpu, MemoryStick, HardDrive, Activity, Loader2, Clock, Signal, ArrowUpDown, ExternalLink, Unplug, ChevronDown } from 'lucide-react';
import { apiService } from '../services/api';
import { useAppConfig } from '@/hooks/useAppConfig';
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
  ReferenceLine,
} from 'recharts';
import {
  chartColors,
  chartCardClass,
  chartContainerClass,
  gridStrokeColor,
  labelFormatter,
  transformLoadRecords,
  processPingRecords,
  interpolatePingNulls,
  type LoadRecord,
  type PingRecord,
  type TaskInfo,
  type ChartDataPoint,
} from '@/lib/chart-utils';

interface NodeChartsProps {
  nodeUuid: string;
  nodeName: string;
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

export function NodeCharts({ nodeUuid }: NodeChartsProps) {
  const { t } = useTranslation();
  const [loadData, setLoadData] = useState<LoadRecord[] | null>(null);
  const [pingData, setPingData] = useState<PingRecord[] | null>(null);
  const [tasks, setTasks] = useState<TaskInfo[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [timeRange, setTimeRange] = useState(1);
  const [latencyCollapsed, setLatencyCollapsed] = useState(false);
  const isMobile = useIsMobile();
  const { recordPreserveTime, isLoggedIn } = useAppConfig();

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

  // Fetch load data (tied to timeRange)
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

  const chartData: ChartDataPoint[] = useMemo(() => {
    if (!loadData?.length) return [];
    return transformLoadRecords(loadData);
  }, [loadData]);

  // Compute latency summary — independent of timeRange (uses raw ping data)
  const latencySummary = useMemo(() => {
    if (!pingData?.length || !tasks.length) return [];
    const taskKeys = tasks.map(t => String(t.id));
    const processed = processPingRecords(pingData, tasks, 1);
    const interpolated = interpolatePingNulls(processed, taskKeys);

    return tasks.map(task => {
      const key = String(task.id);
      const values = interpolated
        .map(d => d[key])
        .filter((v): v is number => v !== null && v !== undefined);

      const lastVal = values.length > 0 ? values[values.length - 1] : null;
      const avgVal = values.length > 0 ? values.reduce((a, b) => a + b, 0) / values.length : null;

      const taskRecords = pingData.filter(r => r.task_id === task.id);
      const totalRecords = taskRecords.length;
      const lostRecords = taskRecords.filter(r => r.value < 0).length;
      const lossRate = totalRecords > 0 ? (lostRecords / totalRecords) * 100 : 0;

      return {
        id: task.id,
        name: task.name,
        current: lastVal,
        avg: avgVal,
        loss: lossRate,
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

  // Chart configs
  const cpuConfig = { cpu: { label: t('label.cpu'), color: chartColors[0] } };
  const loadConfig = { load: { label: t('label.load'), color: chartColors[1] } };
  const ramConfig = { ram: { label: t('label.ram'), color: chartColors[2] }, swap: { label: t('label.swap'), color: chartColors[8] } };
  const diskConfig = { disk: { label: t('label.disk'), color: chartColors[3] } };
  const connConfig = { connections: { label: t('label.tcp'), color: chartColors[4] }, connections_udp: { label: t('label.udp'), color: chartColors[5] } };
  const netConfig = { network_in: { label: t('label.in'), color: chartColors[6] }, network_out: { label: t('label.out'), color: chartColors[7] } };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <Loader2 className="h-6 w-6 animate-spin text-primary" />
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex flex-col items-center justify-center h-64 rounded-lg border border-border/50 bg-card/80 backdrop-blur-xl">
        <div className="text-sm font-mono text-red-500 mb-3">{error}</div>
        <Button variant="outline" size="sm" onClick={fetchData} className="font-mono text-xs">
          {t('action.retry')}
        </Button>
      </div>
    );
  }

  // Shared XAxis/YAxis props factory
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

  const yAxisPercentProps = {
    domain: [0, 100] as [number, number],
    tickLine: false,
    axisLine: false,
    unit: "%",
    allowDecimals: false,
    orientation: "left" as const,
    type: "number" as const,
    tick: yAxisConfig.tick,
    width: yAxisConfig.width,
  };

  const yAxisPlainProps = {
    tickLine: false,
    axisLine: false,
    orientation: "left" as const,
    type: "number" as const,
    tick: yAxisConfig.tick,
    width: yAxisConfig.width,
  };

  return (
    <div className="space-y-4 w-full overflow-hidden">
      {/* Latency overview table — collapsible with max-height scroll */}
      {latencySummary.length > 0 && (
        <div className="rounded-lg border border-border/50 bg-card/80 backdrop-blur-xl overflow-hidden">
          <button
            onClick={() => setLatencyCollapsed(c => !c)}
            className="w-full flex items-center justify-between px-4 py-3 border-b border-border/30 hover:bg-muted/10 transition-colors cursor-pointer"
          >
            <div className="flex items-center gap-2">
              <Signal className="h-3.5 w-3.5 text-primary" />
              <span className="text-xs font-display font-bold text-muted-foreground uppercase tracking-wider">{t('chart.latencyOverview')}</span>
              <span className="text-xxs font-mono text-muted-foreground/50">({latencySummary.length})</span>
            </div>
            <div className="flex items-center gap-2">
              <Link
                to={`/node/${nodeUuid}/network`}
                className="flex items-center gap-1 text-xxs font-mono text-primary hover:underline"
                onClick={e => e.stopPropagation()}
              >
                {t('label.viewPingLatency')}
                <ExternalLink className="h-2.5 w-2.5" />
              </Link>
              <ChevronDown className={`h-3.5 w-3.5 text-muted-foreground transition-transform duration-200 ${latencyCollapsed ? '-rotate-90' : ''}`} />
            </div>
          </button>
          {!latencyCollapsed && (
            <div className="overflow-x-auto max-h-64 overflow-y-auto">
              <table className="w-full">
                <thead className="sticky top-0 bg-card/95 backdrop-blur-sm z-10">
                  <tr className="border-b border-border/20">
                    <th className="text-left text-xxs font-mono font-bold text-muted-foreground/60 uppercase px-4 py-2">{t('chart.taskName')}</th>
                    <th className="text-right text-xxs font-mono font-bold text-muted-foreground/60 uppercase px-4 py-2">{t('chart.current')}</th>
                    <th className="text-right text-xxs font-mono font-bold text-muted-foreground/60 uppercase px-4 py-2">{t('chart.average')}</th>
                    <th className="text-right text-xxs font-mono font-bold text-muted-foreground/60 uppercase px-4 py-2">{t('chart.loss')}</th>
                  </tr>
                </thead>
                <tbody>
                  {latencySummary.map(item => (
                    <tr key={item.id} className="border-b border-border/10 last:border-0 hover:bg-muted/10 transition-colors">
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
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {/* Time range selector panel */}
      <div className="rounded-lg border border-border/50 bg-card/80 backdrop-blur-xl overflow-hidden">
        <div className="flex items-center justify-between px-4 py-3">
          <div className="flex items-center gap-2">
            <Clock className="h-3.5 w-3.5 text-primary" />
            <span className="text-xs font-display font-bold text-muted-foreground uppercase tracking-wider">{t('chart.timeRange')}</span>
          </div>
          <div className="flex items-center gap-1">
            {timeRanges.map(tr => (
              <Button
                key={tr.value}
                variant={timeRange === tr.value ? 'default' : 'ghost'}
                size="sm"
                onClick={() => setTimeRange(tr.value)}
                className="h-7 px-3 text-xs font-mono"
              >
                {tr.label}
              </Button>
            ))}
            <div className="w-px h-5 bg-border/30 mx-1" />
            <Button variant="ghost" size="sm" onClick={fetchData} className="h-7 px-2 text-xs font-mono hover:bg-primary/15 hover:text-primary">
              ↻
            </Button>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 w-full">
        {/* CPU */}
        <Card className={chartCardClass}>
          <CardHeader className="pb-2 px-4 pt-3">
            <CardTitle className="flex items-center gap-2 text-sm font-semibold">
              <Cpu className="h-4 w-4 text-primary" />
              {t('chart.cpuUsage')}
            </CardTitle>
          </CardHeader>
          <CardContent className="px-4 pb-3">
            <ChartContainer config={cpuConfig} className={chartContainerClass}>
              <LineChart data={chartData} margin={chartMargin}>
                <CartesianGrid vertical={false} stroke={gridStrokeColor} strokeOpacity={0.3} />
                <XAxis {...xAxisProps} />
                <YAxis {...yAxisPercentProps} />
                <ChartTooltip
                  cursor={false}
                  formatter={(v: any) => `${typeof v === 'number' ? v.toFixed(2) : v}%`}
                  content={<ChartTooltipContent labelFormatter={labelFormatter} indicator="dot" />}
                />
                <ChartLegend content={<ChartLegendContent />} />
                <Line dataKey="cpu" name={t('label.cpu')} stroke={chartColors[0]} dot={false} isAnimationActive={false} strokeWidth={2} type="linear" />
                <ReferenceLine y={50} stroke="oklch(0.5 0 0 / 30%)" strokeDasharray="3 3" />
              </LineChart>
            </ChartContainer>
          </CardContent>
        </Card>

        {/* System Load */}
        <Card className={chartCardClass}>
          <CardHeader className="pb-2 px-4 pt-3">
            <CardTitle className="flex items-center gap-2 text-sm font-semibold">
              <Activity className="h-4 w-4 text-primary" />
              {t('chart.systemLoad')}
            </CardTitle>
          </CardHeader>
          <CardContent className="px-4 pb-3">
            <ChartContainer config={loadConfig} className={chartContainerClass}>
              <LineChart data={chartData} margin={chartMargin}>
                <CartesianGrid vertical={false} stroke={gridStrokeColor} strokeOpacity={0.3} />
                <XAxis {...xAxisProps} />
                <YAxis {...yAxisPlainProps} />
                <ChartTooltip
                  cursor={false}
                  formatter={(v: any) => typeof v === 'number' ? v.toFixed(2) : v}
                  content={<ChartTooltipContent labelFormatter={labelFormatter} indicator="dot" />}
                />
                <ChartLegend content={<ChartLegendContent />} />
                <Line dataKey="load" name={t('label.load')} stroke={chartColors[1]} dot={false} isAnimationActive={false} strokeWidth={2} type="linear" />
              </LineChart>
            </ChartContainer>
          </CardContent>
        </Card>

        {/* RAM + SWAP */}
        <Card className={chartCardClass}>
          <CardHeader className="pb-2 px-4 pt-3">
            <CardTitle className="flex items-center gap-2 text-sm font-semibold">
              <MemoryStick className="h-4 w-4 text-primary" />
              {t('chart.memory')}
            </CardTitle>
          </CardHeader>
          <CardContent className="px-4 pb-3">
            <ChartContainer config={ramConfig} className={chartContainerClass}>
              <LineChart data={chartData} margin={chartMargin}>
                <CartesianGrid vertical={false} stroke={gridStrokeColor} strokeOpacity={0.3} />
                <XAxis {...xAxisProps} />
                <YAxis {...yAxisPercentProps} />
                <ChartTooltip
                  cursor={false}
                  formatter={(v: any) => `${typeof v === 'number' ? v.toFixed(2) : v}%`}
                  content={<ChartTooltipContent labelFormatter={labelFormatter} indicator="dot" />}
                />
                <ChartLegend content={<ChartLegendContent />} />
                <Line dataKey="ram" name={t('label.ram')} stroke={chartColors[2]} dot={false} isAnimationActive={false} strokeWidth={2} type="linear" />
                <Line dataKey="swap" name={t('label.swap')} stroke={chartColors[8]} dot={false} isAnimationActive={false} strokeWidth={2} type="linear" />
                <ReferenceLine y={50} stroke="oklch(0.5 0 0 / 30%)" strokeDasharray="3 3" />
              </LineChart>
            </ChartContainer>
          </CardContent>
        </Card>

        {/* Disk */}
        <Card className={chartCardClass}>
          <CardHeader className="pb-2 px-4 pt-3">
            <CardTitle className="flex items-center gap-2 text-sm font-semibold">
              <HardDrive className="h-4 w-4 text-primary" />
              {t('chart.diskUsage')}
            </CardTitle>
          </CardHeader>
          <CardContent className="px-4 pb-3">
            <ChartContainer config={diskConfig} className={chartContainerClass}>
              <LineChart data={chartData} margin={chartMargin}>
                <CartesianGrid vertical={false} stroke={gridStrokeColor} strokeOpacity={0.3} />
                <XAxis {...xAxisProps} />
                <YAxis {...yAxisPercentProps} />
                <ChartTooltip
                  cursor={false}
                  formatter={(v: any) => `${typeof v === 'number' ? v.toFixed(2) : v}%`}
                  content={<ChartTooltipContent labelFormatter={labelFormatter} indicator="dot" />}
                />
                <ChartLegend content={<ChartLegendContent />} />
                <Line dataKey="disk" name={t('label.disk')} stroke={chartColors[3]} dot={false} isAnimationActive={false} strokeWidth={2} type="linear" />
                <ReferenceLine y={50} stroke="oklch(0.5 0 0 / 30%)" strokeDasharray="3 3" />
              </LineChart>
            </ChartContainer>
          </CardContent>
        </Card>

        {/* Connections (login required) */}
        {isLoggedIn && (
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
        )}

        {/* Network Traffic */}
        <Card className={chartCardClass}>
          <CardHeader className="pb-2 px-4 pt-3">
            <CardTitle className="flex items-center justify-between text-sm font-semibold">
              <div className="flex items-center gap-2">
                <ArrowUpDown className="h-4 w-4 text-primary" />
                {t('chart.networkTraffic')}
              </div>
              <Link
                to={`/node/${nodeUuid}/network`}
                className="flex items-center gap-1 text-xxs font-mono font-normal text-primary hover:underline"
              >
                {t('label.viewNetworkTraffic')}
                <ExternalLink className="h-2.5 w-2.5" />
              </Link>
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
      </div>
    </div>
  );
}
