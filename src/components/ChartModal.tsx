import { useEffect, useMemo, useState, useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import { X, Loader2 } from 'lucide-react';
import { apiService } from '@/services/api';
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

interface ChartModalProps {
  nodeUuid: string;
  nodeName: string;
  onClose: () => void;
}

type ChartType = 'load' | 'cpu' | 'ram' | 'disk' | 'network' | 'connections' | 'traffic' | 'ping';

const chartTabIds: ChartType[] = ['load', 'cpu', 'ram', 'disk', 'network', 'connections', 'traffic', 'ping'];

const chartTabKeys: Record<ChartType, string> = {
  load: 'chart.load',
  cpu: 'chart.cpu',
  ram: 'chart.ram',
  disk: 'chart.disk',
  network: 'chart.net',
  connections: 'chart.conn',
  traffic: 'chart.traffic',
  ping: 'chart.ping',
};

export function ChartModal({ nodeUuid, nodeName, onClose }: ChartModalProps) {
  const { t } = useTranslation();
  const [loadData, setLoadData] = useState<LoadRecord[] | null>(null);
  const [pingData, setPingData] = useState<PingRecord[] | null>(null);
  const [tasks, setTasks] = useState<TaskInfo[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeChart, setActiveChart] = useState<ChartType>('load');
  const [timeRange, setTimeRange] = useState(6);
  const [hiddenLines, setHiddenLines] = useState<Record<string, boolean>>({});
  const [smooth, setSmooth] = useState(false);

  const fetchData = useCallback(() => {
    setLoading(true);
    Promise.all([
      apiService.getLoadHistory(nodeUuid, timeRange),
      apiService.getPingHistory(nodeUuid, timeRange),
    ])
      .then(([loadHistory, pingHistory]) => {
        if (loadHistory?.records) {
          const records = (loadHistory.records as LoadRecord[]).sort(
            (a, b) => new Date(a.time).getTime() - new Date(b.time).getTime()
          );
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
      .catch(() => setLoading(false));
  }, [nodeUuid, timeRange]);

  useEffect(() => { fetchData(); }, [fetchData]);

  useEffect(() => {
    const handler = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    document.addEventListener('keydown', handler);
    return () => document.removeEventListener('keydown', handler);
  }, [onClose]);

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

  const pingConfig = useMemo(() => {
    const c: Record<string, any> = {};
    tasks.forEach((t, i) => { c[t.id] = { label: t.name, color: chartColors[i % chartColors.length] }; });
    return c;
  }, [tasks]);

  const timeFormatter = useCallback((value: string) => {
    return new Date(value).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  }, []);

  const handleLegendClick = useCallback((e: any) => {
    setHiddenLines((prev) => ({ ...prev, [e.dataKey]: !prev[e.dataKey] }));
  }, []);

  const margin = { top: 8, right: 8, bottom: 4, left: 8 };
  const xAxisProps = {
    dataKey: 'time' as const,
    tickLine: false,
    axisLine: false,
    tickFormatter: timeFormatter,
    interval: 'preserveStartEnd' as const,
    minTickGap: 60,
    tick: { fontSize: 10 },
    height: 28,
  };
  const yPctProps = {
    domain: [0, 100] as [number, number],
    tickLine: false,
    axisLine: false,
    unit: '%',
    allowDecimals: false,
    tick: { fontSize: 10 },
    width: 38,
  };
  const yPlainProps = {
    tickLine: false,
    axisLine: false,
    tick: { fontSize: 10 },
    width: 38,
  };

  const renderChart = () => {
    if (loading) {
      return (
        <div className="flex items-center justify-center h-full">
          <Loader2 className="h-5 w-5 animate-spin text-primary" />
        </div>
      );
    }

    // Ping chart uses pingChartData, others use chartData
    if (activeChart === 'ping') {
      if (!pingChartData.length) {
        return (
          <div className="flex items-center justify-center h-full">
            <span className="text-xs font-mono text-muted-foreground">{t('chart.noPingData')}</span>
          </div>
        );
      }
      return (
        <ChartContainer config={pingConfig} className="h-full w-full">
          <LineChart data={pingChartData} margin={margin}>
            <CartesianGrid vertical={false} stroke={gridStrokeColor} strokeOpacity={0.3} />
            <XAxis {...xAxisProps} />
            <YAxis {...yPlainProps} unit="ms" width={42} />
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
      );
    }

    if (!chartData.length) {
      return (
        <div className="flex items-center justify-center h-full">
          <span className="text-xs font-mono text-muted-foreground">{t('chart.noData')}</span>
        </div>
      );
    }

    switch (activeChart) {
      case 'load':
        return (
          <ChartContainer config={{ load: { label: t('label.load'), color: chartColors[1] } }} className="h-full w-full">
            <LineChart data={chartData} margin={margin}>
              <CartesianGrid vertical={false} stroke={gridStrokeColor} strokeOpacity={0.3} />
              <XAxis {...xAxisProps} />
              <YAxis {...yPlainProps} />
              <ChartTooltip cursor={false} content={<ChartTooltipContent labelFormatter={labelFormatter} indicator="dot" />} />
              <Line dataKey="load" stroke={chartColors[1]} dot={false} strokeWidth={2} isAnimationActive={false} />
            </LineChart>
          </ChartContainer>
        );
      case 'cpu':
        return (
          <ChartContainer config={{ cpu: { label: t('label.cpu'), color: chartColors[0] } }} className="h-full w-full">
            <LineChart data={chartData} margin={margin}>
              <CartesianGrid vertical={false} stroke={gridStrokeColor} strokeOpacity={0.3} />
              <XAxis {...xAxisProps} />
              <YAxis {...yPctProps} />
              <ChartTooltip cursor={false} formatter={(v: any) => `${Number(v).toFixed(1)}%`} content={<ChartTooltipContent labelFormatter={labelFormatter} indicator="dot" />} />
              <Line dataKey="cpu" stroke={chartColors[0]} dot={false} strokeWidth={2} isAnimationActive={false} />
            </LineChart>
          </ChartContainer>
        );
      case 'ram':
        return (
          <ChartContainer config={{ ram: { label: t('label.ram'), color: chartColors[2] }, swap: { label: t('label.swap'), color: chartColors[8] } }} className="h-full w-full">
            <LineChart data={chartData} margin={margin}>
              <CartesianGrid vertical={false} stroke={gridStrokeColor} strokeOpacity={0.3} />
              <XAxis {...xAxisProps} />
              <YAxis {...yPctProps} />
              <ChartTooltip cursor={false} formatter={(v: any) => `${Number(v).toFixed(1)}%`} content={<ChartTooltipContent labelFormatter={labelFormatter} indicator="dot" />} />
              <Line dataKey="ram" stroke={chartColors[2]} dot={false} strokeWidth={2} isAnimationActive={false} />
              <Line dataKey="swap" stroke={chartColors[8]} dot={false} strokeWidth={1.5} isAnimationActive={false} strokeDasharray="4 2" />
            </LineChart>
          </ChartContainer>
        );
      case 'disk':
        return (
          <ChartContainer config={{ disk: { label: t('label.disk'), color: chartColors[3] } }} className="h-full w-full">
            <LineChart data={chartData} margin={margin}>
              <CartesianGrid vertical={false} stroke={gridStrokeColor} strokeOpacity={0.3} />
              <XAxis {...xAxisProps} />
              <YAxis {...yPctProps} />
              <ChartTooltip cursor={false} formatter={(v: any) => `${Number(v).toFixed(1)}%`} content={<ChartTooltipContent labelFormatter={labelFormatter} indicator="dot" />} />
              <Line dataKey="disk" stroke={chartColors[3]} dot={false} strokeWidth={2} isAnimationActive={false} />
            </LineChart>
          </ChartContainer>
        );
      case 'network':
        return (
          <ChartContainer config={{ connections: { label: t('label.tcp'), color: chartColors[4] }, connections_udp: { label: t('label.udp'), color: chartColors[5] } }} className="h-full w-full">
            <LineChart data={chartData} margin={margin}>
              <CartesianGrid vertical={false} stroke={gridStrokeColor} strokeOpacity={0.3} />
              <XAxis {...xAxisProps} />
              <YAxis {...yPlainProps} />
              <ChartTooltip cursor={false} content={<ChartTooltipContent labelFormatter={labelFormatter} indicator="dot" />} />
              <Line dataKey="connections" stroke={chartColors[4]} dot={false} strokeWidth={2} isAnimationActive={false} />
              <Line dataKey="connections_udp" stroke={chartColors[5]} dot={false} strokeWidth={1.5} isAnimationActive={false} />
            </LineChart>
          </ChartContainer>
        );
      case 'connections':
        return (
          <ChartContainer config={{ connections: { label: t('label.tcp'), color: chartColors[4] }, connections_udp: { label: t('label.udp'), color: chartColors[5] } }} className="h-full w-full">
            <LineChart data={chartData} margin={margin}>
              <CartesianGrid vertical={false} stroke={gridStrokeColor} strokeOpacity={0.3} />
              <XAxis {...xAxisProps} />
              <YAxis {...yPlainProps} />
              <ChartTooltip cursor={false} content={<ChartTooltipContent labelFormatter={labelFormatter} indicator="dot" />} />
              <Line dataKey="connections" stroke={chartColors[4]} dot={false} strokeWidth={2} isAnimationActive={false} />
              <Line dataKey="connections_udp" stroke={chartColors[5]} dot={false} strokeWidth={1.5} isAnimationActive={false} />
            </LineChart>
          </ChartContainer>
        );
      case 'traffic':
        return (
          <ChartContainer config={{ network_in: { label: t('label.in'), color: chartColors[6] }, network_out: { label: t('label.out'), color: chartColors[7] } }} className="h-full w-full">
            <AreaChart data={chartData} margin={margin}>
              <CartesianGrid vertical={false} stroke={gridStrokeColor} strokeOpacity={0.3} />
              <XAxis {...xAxisProps} />
              <YAxis {...yPlainProps} unit="KB" width={42} />
              <ChartTooltip
                cursor={false}
                formatter={(v: any) => `${Number(v).toFixed(1)} KB/s`}
                content={<ChartTooltipContent labelFormatter={labelFormatter} indicator="dot" />}
              />
              <ChartLegend content={<ChartLegendContent />} />
              <Area dataKey="network_in" stroke={chartColors[6]} fill={chartColors[6]} fillOpacity={0.12} strokeWidth={1.5} isAnimationActive={false} />
              <Area dataKey="network_out" stroke={chartColors[7]} fill={chartColors[7]} fillOpacity={0.12} strokeWidth={1.5} isAnimationActive={false} />
            </AreaChart>
          </ChartContainer>
        );
    }
  };

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center" onClick={onClose}>
      <div className="absolute inset-0 bg-background/60 backdrop-blur-sm" />
      <div
        className="relative w-[90vw] max-w-3xl bg-card/95 backdrop-blur-xl border border-border/50 rounded-lg shadow-2xl overflow-hidden commander-corners"
        onClick={(e) => e.stopPropagation()}
      >
        <span className="corner-bottom" />
        {/* Header */}
        <div className="flex items-center justify-between px-4 py-2.5 border-b border-border/50">
          <div className="flex items-center gap-2">
            <span className="text-xs font-mono font-bold">{nodeName}</span>
            <span className="text-xxs font-mono text-muted-foreground">{t('chart.nodeMonitor')}</span>
          </div>
          <div className="flex items-center gap-2">
            <div className="flex items-center gap-0.5">
              {[1, 6, 24, 168].map(h => (
                <button
                  key={h}
                  onClick={() => setTimeRange(h)}
                  className={`px-2 py-0.5 text-xs font-mono rounded transition-colors ${
                    timeRange === h
                      ? 'bg-primary text-primary-foreground'
                      : 'text-muted-foreground hover:bg-muted/50'
                  }`}
                >
                  {h <= 24 ? `${h}H` : `${h / 24}D`}
                </button>
              ))}
            </div>
            <button onClick={onClose} className="p-1 rounded hover:bg-muted/50 transition-colors">
              <X className="h-4 w-4" />
            </button>
          </div>
        </div>

        {/* Chart tabs */}
        <div className="flex items-center justify-between gap-0.5 px-4 py-1.5 border-b border-border/30 overflow-x-auto">
          <div className="flex items-center gap-0.5">
            {chartTabIds.map(id => (
              <button
                key={id}
                onClick={() => setActiveChart(id)}
                className={`px-3 py-1 text-xs font-mono font-bold rounded transition-colors whitespace-nowrap ${
                  activeChart === id
                    ? 'bg-primary/15 text-primary border border-primary/30'
                    : 'text-muted-foreground hover:text-foreground hover:bg-muted/30'
                }`}
              >
                {t(chartTabKeys[id])}
              </button>
            ))}
          </div>
          {activeChart === 'ping' && (
            <label className="flex items-center gap-1.5 cursor-pointer select-none shrink-0">
              <span className="text-xxs font-mono text-muted-foreground">{smooth ? t('chart.smooth') : t('chart.raw')}</span>
              <button
                onClick={() => setSmooth(s => !s)}
                className={`relative inline-flex h-4 w-7 items-center rounded-full transition-colors ${smooth ? 'bg-primary' : 'bg-muted-foreground/30'}`}
                title={t('chart.ewmaTooltip')}
              >
                <span className={`inline-block h-3 w-3 rounded-full bg-white transition-transform ${smooth ? 'translate-x-3.5' : 'translate-x-0.5'}`} />
              </button>
            </label>
          )}
        </div>

        {/* Chart area */}
        <div className="h-[300px] sm:h-[360px] p-3">
          {renderChart()}
        </div>
      </div>
    </div>
  );
}
