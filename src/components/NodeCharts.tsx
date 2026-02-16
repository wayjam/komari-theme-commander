import { useEffect, useMemo, useState, useCallback } from "react";
import { Link } from "react-router-dom";
import { useTranslation } from 'react-i18next';
import { Card, CardContent, CardHeader, CardTitle } from './ui/card';
import { Button } from './ui/button';
import { Cpu, Network, MemoryStick, HardDrive, Activity, Loader2 } from 'lucide-react';
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
  ewmaSmooth,
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

export function NodeCharts({ nodeUuid, nodeName }: NodeChartsProps) {
  const { t } = useTranslation();
  const [loadData, setLoadData] = useState<LoadRecord[] | null>(null);
  const [pingData, setPingData] = useState<PingRecord[] | null>(null);
  const [tasks, setTasks] = useState<TaskInfo[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [timeRange, setTimeRange] = useState(1);
  const [hiddenLines, setHiddenLines] = useState<Record<string, boolean>>({});
  const [smooth, setSmooth] = useState(false);
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

  const fetchData = useCallback(() => {
    if (!nodeUuid) return;
    setLoading(true);
    setError(null);

    Promise.all([
      apiService.getLoadHistory(nodeUuid, timeRange),
      apiService.getPingHistory(nodeUuid, timeRange)
    ])
      .then(([loadHistory, pingHistory]) => {
        if (loadHistory?.records) {
          const records = (loadHistory.records || []) as LoadRecord[];
          records.sort((a, b) => new Date(a.time).getTime() - new Date(b.time).getTime());
          setLoadData(records);
        }
        if (pingHistory?.records) {
          const records = (pingHistory.records || []) as PingRecord[];
          records.sort((a, b) => new Date(a.time).getTime() - new Date(b.time).getTime());
          setPingData(records);
          setTasks(pingHistory.tasks || []);
        }
        setLoading(false);
      })
      .catch((err) => {
        setError(err.message || "Error");
        setLoading(false);
      });
  }, [nodeUuid, timeRange]);

  useEffect(() => { fetchData(); }, [fetchData]);

  const chartData: ChartDataPoint[] = useMemo(() => {
    if (!loadData?.length) return [];
    return transformLoadRecords(loadData);
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

  // Chart configs
  const cpuConfig = { cpu: { label: t('label.cpu'), color: chartColors[0] } };
  const loadConfig = { load: { label: t('label.load'), color: chartColors[1] } };
  const ramConfig = { ram: { label: t('label.ram'), color: chartColors[2] }, swap: { label: t('label.swap'), color: chartColors[8] } };
  const diskConfig = { disk: { label: t('label.disk'), color: chartColors[3] } };
  const connConfig = { connections: { label: t('label.tcp'), color: chartColors[4] }, connections_udp: { label: t('label.udp'), color: chartColors[5] } };
  const netConfig = { network_in: { label: t('label.in'), color: chartColors[6] }, network_out: { label: t('label.out'), color: chartColors[7] } };
  const pingConfig = useMemo(() => {
    const c: Record<string, any> = {};
    tasks.forEach((t, i) => { c[t.id] = { label: t.name, color: chartColors[i % chartColors.length] }; });
    return c;
  }, [tasks]);

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
      {/* Time range selector */}
      <div className="flex items-center justify-between p-3 rounded-lg border border-border/50 bg-card/80 backdrop-blur-xl">
        <div className="flex items-center gap-3">
          <span className="text-sm font-semibold font-bold">{nodeName}</span>
          <Link
            to={`/node/${nodeUuid}/network`}
            className="text-xs font-mono text-primary hover:underline"
          >
            {t('label.network')} →
          </Link>
        </div>
        <div className="flex items-center gap-1">
          {timeRanges.map(tr => (
            <Button
              key={tr.value}
              variant={timeRange === tr.value ? 'default' : 'ghost'}
              size="sm"
              onClick={() => setTimeRange(tr.value)}
              className="h-7 px-2.5 text-xs font-mono"
            >
              {tr.label}
            </Button>
          ))}
          <Button variant="ghost" size="sm" onClick={fetchData} className="h-7 px-2 text-xs font-mono hover:bg-primary/15 hover:text-primary">
            ↻
          </Button>
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
              <Network className="h-4 w-4 text-primary" />
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
            <CardTitle className="flex items-center gap-2 text-sm font-semibold">
              <Network className="h-4 w-4 text-primary" />
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

        {/* Ping Latency */}
        {pingChartData.length > 0 && (
          <Card className={chartCardClass}>
            <CardHeader className="pb-2 px-4 pt-3">
              <CardTitle className="flex items-center justify-between text-sm font-semibold">
                <span className="flex items-center gap-2">
                  <Activity className="h-4 w-4 text-primary" />
                  {t('chart.pingLatency')}
                </span>
                <label className="flex items-center gap-1.5 cursor-pointer select-none">
                  <span className="text-xxs font-mono text-muted-foreground">{smooth ? t('chart.smooth') : t('chart.raw')}</span>
                  <button
                    onClick={() => setSmooth(s => !s)}
                    className={`relative inline-flex h-4 w-7 items-center rounded-full transition-colors ${smooth ? 'bg-primary' : 'bg-muted-foreground/30'}`}
                    title={t('chart.ewmaTooltip')}
                  >
                    <span className={`inline-block h-3 w-3 rounded-full bg-white transition-transform ${smooth ? 'translate-x-3.5' : 'translate-x-0.5'}`} />
                  </button>
                </label>
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
