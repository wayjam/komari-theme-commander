import { useEffect, useMemo, useState, useCallback } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { useTranslation } from 'react-i18next';
import { Card, CardContent, CardHeader, CardTitle } from './ui/card';
import { Button } from './ui/button';
import { ArrowLeft, Network, Activity, Loader2 } from 'lucide-react';
import { apiService } from '../services/api';
import {
  ChartContainer,
  ChartTooltip,
  ChartTooltipContent,
  ChartLegend,
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
  processPingRecords,
  interpolatePingNulls,
  ewmaSmooth,
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

interface PingRecord {
  client: string;
  task_id: number;
  time: string;
  value: number;
}

interface TaskInfo {
  id: number;
  name: string;
  interval: number;
}

const colors = [
  "oklch(0.75 0.18 195)",
  "oklch(0.75 0.2 145)",
  "oklch(0.7 0.22 330)",
  "oklch(0.8 0.18 85)",
  "oklch(0.65 0.25 15)",
  "oklch(0.65 0.15 195)",
  "oklch(0.7 0.22 330)",
  "oklch(0.75 0.2 145)",
  "oklch(0.65 0.15 260)",
];

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
}

export function NodeNetwork({ nodeUuid: propUuid, nodeName: propName }: NodeNetworkProps) {
  const { t } = useTranslation();
  const params = useParams<{ uuid: string }>();
  const navigate = useNavigate();
  const nodeUuid = propUuid || params.uuid || '';
  const [nodeName, setNodeName] = useState(propName || '');

  const [loadData, setLoadData] = useState<LoadRecord[] | null>(null);
  const [pingData, setPingData] = useState<PingRecord[] | null>(null);
  const [tasks, setTasks] = useState<TaskInfo[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [timeRange, setTimeRange] = useState(1);
  const [hiddenLines, setHiddenLines] = useState<Record<string, boolean>>({});
  const [smooth, setSmooth] = useState(false);
  const isMobile = useIsMobile();

  // Fetch node name if accessed via URL
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

  const labelFormatter = (value: any) => {
    return new Date(value).toLocaleString([], {
      month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", second: "2-digit",
    });
  };

  const handleLegendClick = useCallback((e: any) => {
    setHiddenLines((prev) => ({ ...prev, [e.dataKey]: !prev[e.dataKey] }));
  }, []);

  const connConfig = { connections: { label: "TCP", color: colors[4] }, connections_udp: { label: "UDP", color: colors[5] } } as const;
  const netConfig = { network_in: { label: "IN", color: colors[6] }, network_out: { label: "OUT", color: colors[7] } } as const;
  const pingConfig = useMemo(() => {
    const c: Record<string, any> = {};
    tasks.forEach((t, i) => { c[t.id] = { label: t.name, color: colors[i % colors.length] }; });
    return c;
  }, [tasks]);

  const timeRanges = [
    { value: 1, label: '1H' },
    { value: 6, label: '6H' },
    { value: 24, label: '24H' },
    { value: 168, label: '7D' },
  ];

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

  const chartClass = "h-[200px] sm:h-[250px] md:h-[280px] w-full !aspect-auto overflow-hidden chart-mobile-optimized";
  const cardClass = "border border-border/50 bg-card/80 backdrop-blur-xl";

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
        <Button variant="outline" size="sm" onClick={fetchData} className="font-mono text-xs">RETRY</Button>
      </div>
    );
  }

  return (
    <div className="space-y-4 w-full overflow-hidden">
      {/* Header */}
      <div className="flex items-center justify-between p-3 rounded-lg border border-border/50 bg-card/80 backdrop-blur-xl">
        <div className="flex items-center gap-3">
          <Button
            variant="ghost"
            size="sm"
            onClick={() => navigate(-1)}
            className="h-7 px-2 text-xs font-mono hover:bg-primary/15 hover:text-primary"
          >
            <ArrowLeft className="h-3.5 w-3.5 mr-1" />
            BACK
          </Button>
          <Network className="h-4 w-4 text-primary" />
          <span className="text-sm font-semibold font-bold">{nodeName || nodeUuid}</span>
          <span className="text-xs font-mono text-muted-foreground">NETWORK</span>
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
        {/* Network Traffic */}
        <Card className={cardClass}>
          <CardHeader className="pb-2 px-4 pt-3">
            <CardTitle className="flex items-center gap-2 text-sm font-semibold">
              <Network className="h-4 w-4 text-primary" />
              NETWORK TRAFFIC
            </CardTitle>
          </CardHeader>
          <CardContent className="px-4 pb-3">
            <ChartContainer config={netConfig} className={chartClass}>
                <AreaChart data={chartData} margin={chartMargin}>
                  <CartesianGrid vertical={false} strokeOpacity={0.15} />
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
                  <ChartLegend />
                  <Area dataKey="network_in" name="IN" stroke={colors[6]} fill={colors[6]} fillOpacity={0.15} type="linear" />
                  <Area dataKey="network_out" name="OUT" stroke={colors[7]} fill={colors[7]} fillOpacity={0.15} type="linear" />
                </AreaChart>
            </ChartContainer>
          </CardContent>
        </Card>

        {/* Connections */}
        <Card className={cardClass}>
          <CardHeader className="pb-2 px-4 pt-3">
            <CardTitle className="flex items-center gap-2 text-sm font-semibold">
              <Network className="h-4 w-4 text-primary" />
              CONNECTIONS
            </CardTitle>
          </CardHeader>
          <CardContent className="px-4 pb-3">
            <ChartContainer config={connConfig} className={chartClass}>
                <LineChart data={chartData} margin={chartMargin}>
                  <CartesianGrid vertical={false} strokeOpacity={0.15} />
                  <XAxis {...xAxisProps} />
                  <YAxis {...yAxisPlainProps} />
                  <ChartTooltip
                    cursor={false}
                    content={<ChartTooltipContent labelFormatter={labelFormatter} indicator="dot" />}
                  />
                  <ChartLegend />
                  <Line dataKey="connections" name="TCP" stroke={colors[4]} dot={false} isAnimationActive={false} strokeWidth={2} type="linear" />
                  <Line dataKey="connections_udp" name="UDP" stroke={colors[5]} dot={false} isAnimationActive={false} strokeWidth={2} type="linear" />
                </LineChart>
            </ChartContainer>
          </CardContent>
        </Card>

        {/* Ping Latency */}
        {pingChartData.length > 0 && (
          <Card className={`${cardClass} lg:col-span-2`}>
            <CardHeader className="pb-2 px-4 pt-3">
              <CardTitle className="flex items-center justify-between text-sm font-semibold">
                <span className="flex items-center gap-2">
                  <Activity className="h-4 w-4 text-primary" />
                  PING LATENCY
                </span>
                <label className="flex items-center gap-1.5 cursor-pointer select-none">
                  <span className="text-xxs font-mono text-muted-foreground">{smooth ? 'SMOOTH' : 'RAW'}</span>
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
              <ChartContainer config={pingConfig} className={chartClass}>
                  <LineChart data={pingChartData} margin={chartMargin}>
                    <CartesianGrid vertical={false} strokeOpacity={0.15} />
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
                    <ChartLegend onClick={handleLegendClick} />
                    {tasks.map((task, idx) => (
                      <Line
                        key={task.id}
                        dataKey={String(task.id)}
                        name={task.name}
                        stroke={colors[idx % colors.length]}
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
