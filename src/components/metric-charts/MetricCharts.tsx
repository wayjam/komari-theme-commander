import { useState, useCallback, type ReactNode, type MouseEvent } from 'react';
import { useTranslation } from 'react-i18next';
import {
  ChartContainer,
  ChartTooltip,
  ChartTooltipContent,
  ChartLegend,
  ChartLegendContent,
} from '@/components/ui/chart';
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
  gridStrokeColor,
  labelFormatter,
  type ChartDataPoint,
  type TaskInfo,
  type ChartDataRow,
} from '@/lib/chart-utils';
import { useMetricChartAxes, type MetricChartLayoutMode } from './chart-axes';

export type { MetricChartLayoutMode };

interface BaseProps {
  chartData: ChartDataPoint[];
  mode: MetricChartLayoutMode;
  /** Responsive detail layout; ignored when mode is `modal`. */
  isMobile?: boolean;
  containerClassName: string;
  emptyContent?: ReactNode;
}

function EmptyChart({ children }: { children: ReactNode }) {
  return (
    <div className="flex h-full min-h-[120px] items-center justify-center">
      {children}
    </div>
  );
}

/** Recharts calls `onClick(legendPayloadEntry, index, event)` — entry carries `dataKey`. */
function useSeriesLegendToggle(): [
  Record<string, boolean>,
  (entry: { dataKey?: unknown }, index: number, event: MouseEvent) => void,
] {
  const [hidden, setHidden] = useState<Record<string, boolean>>({});
  const onLegendClick = useCallback((entry: { dataKey?: unknown }) => {
    if (entry?.dataKey != null) {
      const key = String(entry.dataKey);
      setHidden(prev => ({ ...prev, [key]: !prev[key] }));
    }
  }, []);
  return [hidden, onLegendClick];
}

export function CpuUsageLineChart({
  chartData,
  mode,
  isMobile = false,
  containerClassName,
  showReferenceLine,
  emptyContent,
}: BaseProps & { showReferenceLine?: boolean }) {
  const { t } = useTranslation();
  const { margin, xAxisProps, yPctProps } = useMetricChartAxes(mode, chartData.length, isMobile);
  const showLegend = mode === 'detail';
  const cfg = { cpu: { label: t('label.cpu'), color: chartColors[0] } };

  if (!chartData.length) {
    return <EmptyChart>{emptyContent ?? <span className="text-xs font-mono text-muted-foreground">{t('chart.noData')}</span>}</EmptyChart>;
  }

  return (
    <ChartContainer config={cfg} className={containerClassName}>
      <LineChart data={chartData} margin={margin}>
        <CartesianGrid vertical={false} stroke={gridStrokeColor} strokeOpacity={0.3} />
        <XAxis {...xAxisProps} />
        <YAxis {...yPctProps} />
        <ChartTooltip
          cursor={false}
          formatter={(v: number | string) => `${typeof v === 'number' ? v.toFixed(2) : v}%`}
          content={<ChartTooltipContent labelFormatter={labelFormatter} indicator="dot" />}
        />
        {showLegend && <ChartLegend content={<ChartLegendContent />} />}
        <Line
          dataKey="cpu"
          name={t('label.cpu')}
          stroke={chartColors[0]}
          dot={false}
          isAnimationActive={false}
          strokeWidth={2}
          type="linear"
        />
        {showReferenceLine && (
          <ReferenceLine y={50} stroke="oklch(0.5 0 0 / 30%)" strokeDasharray="3 3" />
        )}
      </LineChart>
    </ChartContainer>
  );
}

export function SystemLoadLineChart({
  chartData,
  mode,
  isMobile = false,
  containerClassName,
  emptyContent,
}: BaseProps) {
  const { t } = useTranslation();
  const { margin, xAxisProps, yPlainProps } = useMetricChartAxes(mode, chartData.length, isMobile);
  const showLegend = mode === 'detail';
  const cfg = { load: { label: t('label.load'), color: chartColors[1] } };

  if (!chartData.length) {
    return <EmptyChart>{emptyContent ?? <span className="text-xs font-mono text-muted-foreground">{t('chart.noData')}</span>}</EmptyChart>;
  }

  return (
    <ChartContainer config={cfg} className={containerClassName}>
      <LineChart data={chartData} margin={margin}>
        <CartesianGrid vertical={false} stroke={gridStrokeColor} strokeOpacity={0.3} />
        <XAxis {...xAxisProps} />
        <YAxis {...yPlainProps} />
        <ChartTooltip
          cursor={false}
          formatter={(v: number | string) => (typeof v === 'number' ? v.toFixed(2) : String(v))}
          content={<ChartTooltipContent labelFormatter={labelFormatter} indicator="dot" />}
        />
        {showLegend && <ChartLegend content={<ChartLegendContent />} />}
        <Line
          dataKey="load"
          name={t('label.load')}
          stroke={chartColors[1]}
          dot={false}
          isAnimationActive={false}
          strokeWidth={2}
          type="linear"
        />
      </LineChart>
    </ChartContainer>
  );
}

export function MemoryLineChart({
  chartData,
  mode,
  isMobile = false,
  containerClassName,
  showReferenceLine,
  emptyContent,
}: BaseProps & { showReferenceLine?: boolean }) {
  const { t } = useTranslation();
  const [hidden, onLegendClick] = useSeriesLegendToggle();
  const { margin, xAxisProps, yPctProps } = useMetricChartAxes(mode, chartData.length, isMobile);
  const cfg = {
    ram: { label: t('label.ram'), color: chartColors[2] },
    swap: { label: t('label.swap'), color: chartColors[8] },
  };

  if (!chartData.length) {
    return <EmptyChart>{emptyContent ?? <span className="text-xs font-mono text-muted-foreground">{t('chart.noData')}</span>}</EmptyChart>;
  }

  return (
    <ChartContainer config={cfg} className={containerClassName}>
      <LineChart data={chartData} margin={margin}>
        <CartesianGrid vertical={false} stroke={gridStrokeColor} strokeOpacity={0.3} />
        <XAxis {...xAxisProps} />
        <YAxis {...yPctProps} />
        <ChartTooltip
          cursor={false}
          formatter={(v: number | string) => `${typeof v === 'number' ? v.toFixed(2) : v}%`}
          content={<ChartTooltipContent labelFormatter={labelFormatter} indicator="dot" />}
        />
        <ChartLegend
          content={<ChartLegendContent inactiveDataKeys={hidden} />}
          onClick={onLegendClick}
        />
        <Line
          dataKey="ram"
          name={t('label.ram')}
          stroke={chartColors[2]}
          dot={false}
          isAnimationActive={false}
          strokeWidth={2}
          type="linear"
          hide={!!hidden.ram}
        />
        <Line
          dataKey="swap"
          name={t('label.swap')}
          stroke={chartColors[8]}
          dot={false}
          isAnimationActive={false}
          strokeWidth={mode === 'modal' ? 1.5 : 2}
          type="linear"
          strokeDasharray={mode === 'modal' ? '4 2' : undefined}
          hide={!!hidden.swap}
        />
        {showReferenceLine && (
          <ReferenceLine y={50} stroke="oklch(0.5 0 0 / 30%)" strokeDasharray="3 3" />
        )}
      </LineChart>
    </ChartContainer>
  );
}

export function DiskUsageLineChart({
  chartData,
  mode,
  isMobile = false,
  containerClassName,
  showReferenceLine,
  emptyContent,
}: BaseProps & { showReferenceLine?: boolean }) {
  const { t } = useTranslation();
  const { margin, xAxisProps, yPctProps } = useMetricChartAxes(mode, chartData.length, isMobile);
  const showLegend = mode === 'detail';
  const cfg = { disk: { label: t('label.disk'), color: chartColors[3] } };

  if (!chartData.length) {
    return <EmptyChart>{emptyContent ?? <span className="text-xs font-mono text-muted-foreground">{t('chart.noData')}</span>}</EmptyChart>;
  }

  return (
    <ChartContainer config={cfg} className={containerClassName}>
      <LineChart data={chartData} margin={margin}>
        <CartesianGrid vertical={false} stroke={gridStrokeColor} strokeOpacity={0.3} />
        <XAxis {...xAxisProps} />
        <YAxis {...yPctProps} />
        <ChartTooltip
          cursor={false}
          formatter={(v: number | string) => `${typeof v === 'number' ? v.toFixed(2) : v}%`}
          content={<ChartTooltipContent labelFormatter={labelFormatter} indicator="dot" />}
        />
        {showLegend && <ChartLegend content={<ChartLegendContent />} />}
        <Line dataKey="disk" name={t('label.disk')} stroke={chartColors[3]} dot={false} isAnimationActive={false} strokeWidth={2} type="linear" />
        {showReferenceLine && (
          <ReferenceLine y={50} stroke="oklch(0.5 0 0 / 30%)" strokeDasharray="3 3" />
        )}
      </LineChart>
    </ChartContainer>
  );
}

export function ConnectionsLineChart({
  chartData,
  mode,
  isMobile = false,
  containerClassName,
  emptyContent,
}: BaseProps) {
  const { t } = useTranslation();
  const [hidden, onLegendClick] = useSeriesLegendToggle();
  const { margin, xAxisProps, yPlainProps } = useMetricChartAxes(mode, chartData.length, isMobile);
  const cfg = {
    connections: { label: t('label.tcp'), color: chartColors[4] },
    connections_udp: { label: t('label.udp'), color: chartColors[5] },
  };

  if (!chartData.length) {
    return <EmptyChart>{emptyContent ?? <span className="text-xs font-mono text-muted-foreground">{t('chart.noData')}</span>}</EmptyChart>;
  }

  return (
    <ChartContainer config={cfg} className={containerClassName}>
      <LineChart data={chartData} margin={margin}>
        <CartesianGrid vertical={false} stroke={gridStrokeColor} strokeOpacity={0.3} />
        <XAxis {...xAxisProps} />
        <YAxis {...yPlainProps} />
        <ChartTooltip cursor={false} content={<ChartTooltipContent labelFormatter={labelFormatter} indicator="dot" />} />
        <ChartLegend
          content={<ChartLegendContent inactiveDataKeys={hidden} />}
          onClick={onLegendClick}
        />
        <Line
          dataKey="connections"
          name={t('label.tcp')}
          stroke={chartColors[4]}
          dot={false}
          isAnimationActive={false}
          strokeWidth={2}
          type="linear"
          hide={!!hidden.connections}
        />
        <Line
          dataKey="connections_udp"
          name={t('label.udp')}
          stroke={chartColors[5]}
          dot={false}
          isAnimationActive={false}
          strokeWidth={mode === 'modal' ? 1.5 : 2}
          type="linear"
          hide={!!hidden.connections_udp}
        />
      </LineChart>
    </ChartContainer>
  );
}

export function ProcessLineChart({
  chartData,
  mode,
  isMobile = false,
  containerClassName,
  emptyContent,
}: BaseProps) {
  const { t } = useTranslation();
  const { margin, xAxisProps, yPlainProps } = useMetricChartAxes(mode, chartData.length, isMobile);
  const showLegend = mode === 'detail';
  const cfg = { process: { label: t('chart.process'), color: chartColors[8] } };

  if (!chartData.length) {
    return <EmptyChart>{emptyContent ?? <span className="text-xs font-mono text-muted-foreground">{t('chart.noData')}</span>}</EmptyChart>;
  }

  return (
    <ChartContainer config={cfg} className={containerClassName}>
      <LineChart data={chartData} margin={margin}>
        <CartesianGrid vertical={false} stroke={gridStrokeColor} strokeOpacity={0.3} />
        <XAxis {...xAxisProps} />
        <YAxis {...yPlainProps} />
        <ChartTooltip
          cursor={false}
          formatter={(v: number | string) => (typeof v === 'number' ? Math.round(v).toString() : String(v))}
          content={<ChartTooltipContent labelFormatter={labelFormatter} indicator="dot" />}
        />
        {showLegend && <ChartLegend content={<ChartLegendContent />} />}
        <Line
          dataKey="process"
          name={t('chart.process')}
          stroke={chartColors[8]}
          dot={false}
          isAnimationActive={false}
          strokeWidth={2}
          type="linear"
        />
      </LineChart>
    </ChartContainer>
  );
}

export function NetworkTrafficAreaChart({
  chartData,
  mode,
  isMobile = false,
  containerClassName,
  emptyContent,
}: BaseProps) {
  const { t } = useTranslation();
  const [hidden, onLegendClick] = useSeriesLegendToggle();
  const { margin, xAxisProps, yAxisConfig } = useMetricChartAxes(mode, chartData.length, isMobile);
  const cfg = {
    network_in: { label: t('label.in'), color: chartColors[6] },
    network_out: { label: t('label.out'), color: chartColors[7] },
  };

  const trafficYAxis =
    mode === 'modal'
      ? {
          tickLine: false,
          axisLine: false,
          unit: 'KB' as const,
          tick: { fontSize: 10 },
          width: 42,
        }
      : {
          tickLine: false,
          axisLine: false,
          unit: 'KB/s' as const,
          orientation: 'left' as const,
          type: 'number' as const,
          tick: { ...yAxisConfig.tick, dx: -5 },
          width: isMobile ? 50 : 60,
        };

  const fillOpacity = mode === 'modal' ? 0.12 : 0.15;

  if (!chartData.length) {
    return <EmptyChart>{emptyContent ?? <span className="text-xs font-mono text-muted-foreground">{t('chart.noData')}</span>}</EmptyChart>;
  }

  return (
    <ChartContainer config={cfg} className={containerClassName}>
      <AreaChart data={chartData} margin={margin}>
        <CartesianGrid vertical={false} stroke={gridStrokeColor} strokeOpacity={0.3} />
        <XAxis {...xAxisProps} />
        <YAxis {...trafficYAxis} />
        <ChartTooltip
          cursor={false}
          formatter={(v: number | string) =>
            mode === 'modal'
              ? `${Number(v).toFixed(1)} KB/s`
              : `${typeof v === 'number' ? v.toFixed(1) : v} KB/s`
          }
          content={<ChartTooltipContent labelFormatter={labelFormatter} indicator="dot" />}
        />
        <ChartLegend
          content={<ChartLegendContent inactiveDataKeys={hidden} />}
          onClick={onLegendClick}
        />
        <Area
          dataKey="network_in"
          name={t('label.in')}
          stroke={chartColors[6]}
          fill={chartColors[6]}
          fillOpacity={fillOpacity}
          strokeWidth={1.5}
          isAnimationActive={false}
          type="linear"
          hide={!!hidden.network_in}
        />
        <Area
          dataKey="network_out"
          name={t('label.out')}
          stroke={chartColors[7]}
          fill={chartColors[7]}
          fillOpacity={fillOpacity}
          strokeWidth={1.5}
          isAnimationActive={false}
          type="linear"
          hide={!!hidden.network_out}
        />
      </AreaChart>
    </ChartContainer>
  );
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type LegendHandler = (e: any) => void;

export function PingLatencyLineChart({
  pingChartData,
  tasks,
  mode,
  isMobile = false,
  containerClassName,
  smooth,
  hiddenLines,
  onLegendClick,
  emptyContent,
}: {
  pingChartData: ChartDataRow[];
  tasks: TaskInfo[];
  mode: MetricChartLayoutMode;
  isMobile?: boolean;
  containerClassName: string;
  smooth: boolean;
  hiddenLines: Record<string, boolean>;
  onLegendClick?: LegendHandler;
  emptyContent?: ReactNode;
}) {
  const { t } = useTranslation();
  const { margin, xAxisProps, yAxisConfig } = useMetricChartAxes(mode, pingChartData.length, isMobile);

  const pingConfig: Record<string, { label: string; color: string }> = {};
  tasks.forEach((tk, i) => {
    pingConfig[String(tk.id)] = { label: tk.name, color: chartColors[i % chartColors.length] };
  });

  const yPing =
    mode === 'modal'
      ? {
          tickLine: false,
          axisLine: false,
          unit: 'ms',
          allowDecimals: false,
          tick: { fontSize: 10 },
          width: 42,
        }
      : {
          tickLine: false,
          axisLine: false,
          unit: 'ms',
          allowDecimals: false,
          orientation: 'left' as const,
          type: 'number' as const,
          tick: yAxisConfig.tick,
          width: isMobile ? 45 : 50,
        };

  if (!pingChartData.length) {
    return <EmptyChart>{emptyContent ?? <span className="text-xs font-mono text-muted-foreground">{t('chart.noPingData')}</span>}</EmptyChart>;
  }

  return (
    <ChartContainer config={pingConfig} className={containerClassName}>
      <LineChart data={pingChartData} margin={margin}>
        <CartesianGrid vertical={false} stroke={gridStrokeColor} strokeOpacity={0.3} />
        <XAxis {...xAxisProps} />
        <YAxis {...yPing} />
        <ChartTooltip
          cursor={false}
          formatter={(v: number | string) => `${Math.round(Number(v))} ms`}
          content={<ChartTooltipContent labelFormatter={labelFormatter} indicator="dot" />}
        />
        <ChartLegend
          content={<ChartLegendContent inactiveDataKeys={hiddenLines} />}
          onClick={onLegendClick}
        />
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
            type={smooth ? 'basis' : 'linear'}
            hide={!!hiddenLines[String(task.id)]}
          />
        ))}
      </LineChart>
    </ChartContainer>
  );
}
