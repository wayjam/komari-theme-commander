import { useEffect, useMemo, useState, useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import { X } from 'lucide-react';
import { PingCurveModeToggle } from './PingCurveModeToggle';
import { HudSpinner } from './HudSpinner';
import { motion, useReducedMotion } from 'motion/react';
import { apiService } from '@/services/api';
import { cn } from '@/lib/utils';
import {
  CpuUsageLineChart,
  SystemLoadLineChart,
  MemoryLineChart,
  DiskUsageLineChart,
  ConnectionsLineChart,
  NetworkTrafficAreaChart,
  PingLatencyLineChart,
} from '@/components/metric-charts';
import {
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

const modalChartClass = 'h-full w-full';

export function ChartModal({ nodeUuid, nodeName, onClose }: ChartModalProps) {
  const reduceMotion = useReducedMotion();
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
            (a, b) => new Date(a.time).getTime() - new Date(b.time).getTime(),
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

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
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

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const handleLegendClick = useCallback((e: any) => {
    if (e?.dataKey != null) {
      const key = String(e.dataKey);
      setHiddenLines(prev => ({ ...prev, [key]: !prev[key] }));
    }
  }, []);

  const renderChart = () => {
    if (loading) {
      return (
        <div className="flex h-full items-center justify-center">
          <HudSpinner size="md" />
        </div>
      );
    }

    if (activeChart === 'ping') {
      return (
        <PingLatencyLineChart
          pingChartData={pingChartData}
          tasks={tasks}
          mode="modal"
          isMobile={false}
          containerClassName={modalChartClass}
          smooth={smooth}
          hiddenLines={hiddenLines}
          onLegendClick={handleLegendClick}
        />
      );
    }

    if (!chartData.length) {
      return (
        <div className="flex h-full items-center justify-center">
          <span className="text-xs font-mono text-muted-foreground">{t('chart.noData')}</span>
        </div>
      );
    }

    switch (activeChart) {
      case 'load':
        return <SystemLoadLineChart chartData={chartData} mode="modal" containerClassName={modalChartClass} />;
      case 'cpu':
        return <CpuUsageLineChart chartData={chartData} mode="modal" containerClassName={modalChartClass} />;
      case 'ram':
        return <MemoryLineChart chartData={chartData} mode="modal" containerClassName={modalChartClass} />;
      case 'disk':
        return <DiskUsageLineChart chartData={chartData} mode="modal" containerClassName={modalChartClass} />;
      case 'network':
      case 'connections':
        return <ConnectionsLineChart chartData={chartData} mode="modal" containerClassName={modalChartClass} />;
      case 'traffic':
        return <NetworkTrafficAreaChart chartData={chartData} mode="modal" containerClassName={modalChartClass} />;
      default:
        return null;
    }
  };

  const backdropTransition = reduceMotion ? { duration: 0 } : { duration: 0.2 };
  const panelTransition = reduceMotion
    ? { duration: 0 }
    : { duration: 0.25, ease: [0.16, 1, 0.3, 1] as const };

  return (
    <div className="fixed inset-0 z-[100] flex items-stretch sm:items-center justify-center" onClick={onClose}>
      <motion.div
        className="absolute inset-0 bg-background/60 backdrop-blur-sm"
        initial={{ opacity: reduceMotion ? 1 : 0 }}
        animate={{ opacity: 1 }}
        transition={backdropTransition}
      />
      <motion.div
        className={cn(
          // Mobile: full-screen sheet anchored to safe-area for clean look
          // on devices with notch / home indicator. Desktop: centred modal.
          "node-card-commander chart-card-commander relative w-full sm:w-[90vw] sm:max-w-3xl overflow-hidden border border-border/50 bg-card/95 shadow-2xl backdrop-blur-xl commander-corners flex flex-col",
          "h-svh sm:h-auto sm:rounded-lg",
          "pt-safe pb-safe",
        )}
        onClick={e => e.stopPropagation()}
        initial={
          reduceMotion
            ? { opacity: 1, scale: 1, y: 0 }
            : { opacity: 0, scale: 0.92, y: 20 }
        }
        animate={{ opacity: 1, scale: 1, y: 0 }}
        transition={panelTransition}
      >
        <span className="corner-bottom" />
        {/* Header */}
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between border-b border-border/50 px-4 py-3 gap-2 telemetry-panel rounded-none border-x-0 border-t-0">
          <div className="flex items-center gap-2 min-w-0 w-full sm:w-auto">
            <span className="font-mono text-xs font-bold truncate">{nodeName}</span>
            <span className="hidden sm:inline text-xxs font-mono text-muted-foreground shrink-0">{t('chart.nodeMonitor')}</span>
          </div>
          <div className="flex w-full items-center justify-between gap-2 sm:w-auto sm:justify-end sm:shrink-0">
            <div className="scrollbar-none flex min-w-0 items-center gap-0.5 overflow-x-auto">
              {[1, 6, 24, 168].map(h => (
                <button
                  key={h}
                  type="button"
                  onClick={() => setTimeRange(h)}
                  className={`rounded h-9 min-w-9 px-2 font-mono text-xs transition-colors cursor-pointer sm:h-7 sm:min-w-0 ${
                    timeRange === h
                      ? 'bg-primary text-primary-foreground'
                      : 'text-muted-foreground hover:bg-muted/50'
                  }`}
                >
                  {h <= 24 ? `${h}H` : `${h / 24}D`}
                </button>
              ))}
            </div>
            <button
              type="button"
              onClick={onClose}
              aria-label={t('action.close', 'Close')}
              className="rounded h-9 w-9 sm:h-8 sm:w-8 flex shrink-0 items-center justify-center transition-colors hover:bg-muted/50 cursor-pointer"
            >
              <X className="h-4 w-4" />
            </button>
          </div>
        </div>

        {/* Chart tabs */}
        <div className="relative">
          <div className="scrollbar-none flex items-center justify-between gap-0.5 overflow-x-auto border-b border-border/30 px-4 py-2 bg-[color-mix(in_oklch,var(--telemetry-surface)_72%,transparent)]">
            <div className="flex items-center gap-0.5">
              {chartTabIds.map(id => (
                <button
                  key={id}
                  type="button"
                  onClick={() => setActiveChart(id)}
                  className={`whitespace-nowrap rounded px-3 h-9 sm:h-7 font-mono text-xs font-bold transition-colors cursor-pointer ${
                    activeChart === id
                      ? 'border border-primary/30 bg-primary/15 text-primary'
                      : 'text-muted-foreground hover:bg-muted/30 hover:text-foreground'
                  }`}
                >
                  {t(chartTabKeys[id])}
                </button>
              ))}
            </div>
            {activeChart === 'ping' && (
              <PingCurveModeToggle
                value={smooth ? 'smooth' : 'raw'}
                onChange={mode => setSmooth(mode === 'smooth')}
              />
            )}
          </div>
          <div className="pointer-events-none absolute top-0 right-0 bottom-0 w-6 bg-gradient-to-l from-card/95 to-transparent sm:hidden" />
        </div>

        {/* Chart area — flex-1 lets the panel fill remaining height on
            mobile (full-screen sheet). Fixed height keeps the desktop
            modal from collapsing. */}
        <div className="flex-1 min-h-0 p-4 sm:h-[360px] sm:min-h-0 sm:p-5">{renderChart()}</div>
      </motion.div>
    </div>
  );
}
