import { useEffect, useMemo, useState, useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import { Link } from 'react-router-dom';
import { Card, CardContent, CardHeader, CardTitle } from './ui/card';
import { Tooltip, TooltipTrigger, TooltipContent } from './ui/tooltip';
import { Cpu, MemoryStick, HardDrive, Activity, ArrowUpDown, ExternalLink, Unplug, RotateCw, AlertTriangle } from 'lucide-react';
import { HudSpinner } from './HudSpinner';
import { apiService } from '../services/api';
import { useIsMobile } from '@/hooks/useIsMobile';
import { useNodeRealtimeLoadRecords } from '@/hooks/useNodeRealtimeLoadRecords';
import { cn } from '@/lib/utils';
import type { LoadTimeRangeId } from '@/lib/chart-time-ranges';
import {
  CpuUsageLineChart,
  SystemLoadLineChart,
  MemoryLineChart,
  DiskUsageLineChart,
  ConnectionsLineChart,
  ProcessLineChart,
  NetworkTrafficAreaChart,
} from '@/components/metric-charts';
import {
  chartCardClass,
  chartContainerClass,
  transformLoadRecords,
  type LoadRecord,
  type ChartDataPoint,
} from '@/lib/chart-utils';

interface NodeChartsProps {
  nodeUuid: string;
  nodeName: string;
  timeRange: LoadTimeRangeId;
  refreshKey?: number;
}

export function NodeCharts({ nodeUuid, timeRange, refreshKey = 0 }: NodeChartsProps) {
  const { t } = useTranslation();
  const isMobile = useIsMobile();
  const isRealtime = timeRange === 'realtime';

  const [historicalData, setHistoricalData] = useState<LoadRecord[] | null>(null);
  const [historicalLoading, setHistoricalLoading] = useState(false);
  const [historicalError, setHistoricalError] = useState<string | null>(null);

  const {
    records: realtimeRecords,
    loading: realtimeLoading,
    error: realtimeError,
    refresh: refreshRealtime,
  } = useNodeRealtimeLoadRecords(nodeUuid, isRealtime);

  const fetchHistorical = useCallback(() => {
    if (!nodeUuid || isRealtime || typeof timeRange !== 'number') return;
    setHistoricalLoading(true);
    setHistoricalError(null);
    apiService.getLoadHistory(nodeUuid, timeRange)
      .then(loadHistory => {
        if (loadHistory?.records) {
          const records = (loadHistory.records || []) as LoadRecord[];
          records.sort((a, b) => new Date(a.time).getTime() - new Date(b.time).getTime());
          setHistoricalData(records);
        } else {
          setHistoricalData([]);
        }
        setHistoricalLoading(false);
      })
      .catch(err => {
        setHistoricalError(err.message || 'Error');
        setHistoricalLoading(false);
      });
  }, [nodeUuid, timeRange, isRealtime]);

  useEffect(() => {
    if (isRealtime) return;
    fetchHistorical();
  }, [fetchHistorical, isRealtime, refreshKey]);

  useEffect(() => {
    if (isRealtime && refreshKey > 0) {
      refreshRealtime();
    }
  }, [isRealtime, refreshKey, refreshRealtime]);

  const loading = isRealtime ? realtimeLoading : historicalLoading;
  const error = isRealtime ? realtimeError : historicalError;
  const loadData = isRealtime ? realtimeRecords : historicalData;

  const chartData: ChartDataPoint[] = useMemo(() => {
    if (!loadData?.length) return [];
    return transformLoadRecords(loadData);
  }, [loadData]);

  const retry = isRealtime ? refreshRealtime : fetchHistorical;

  const chartGrid = (
    <div className="grid w-full grid-cols-1 gap-4 sm:gap-5 lg:grid-cols-2">
      <Card className={chartCardClass}>
        <CardHeader className="px-4 pt-3 pb-2">
          <CardTitle className="flex items-center gap-2 text-sm font-semibold">
            <Cpu className="h-4 w-4 text-chart-1" />
            {t('chart.cpuUsage')}
          </CardTitle>
        </CardHeader>
        <CardContent className="px-4 pb-3">
          <CpuUsageLineChart
            chartData={chartData}
            mode="detail"
            isMobile={isMobile}
            containerClassName={chartContainerClass}
            showReferenceLine
          />
        </CardContent>
      </Card>

      <Card className={chartCardClass}>
        <CardHeader className="px-4 pt-3 pb-2">
          <CardTitle className="flex items-center gap-2 text-sm font-semibold">
            <Activity className="h-4 w-4 text-chart-2" />
            {t('chart.systemLoad')}
          </CardTitle>
        </CardHeader>
        <CardContent className="px-4 pb-3">
          <SystemLoadLineChart chartData={chartData} mode="detail" isMobile={isMobile} containerClassName={chartContainerClass} />
        </CardContent>
      </Card>

      <Card className={chartCardClass}>
        <CardHeader className="px-4 pt-3 pb-2">
          <CardTitle className="flex items-center gap-2 text-sm font-semibold">
            <MemoryStick className="h-4 w-4 text-chart-3" />
            {t('chart.memory')}
          </CardTitle>
        </CardHeader>
        <CardContent className="px-4 pb-3">
          <MemoryLineChart
            chartData={chartData}
            mode="detail"
            isMobile={isMobile}
            containerClassName={chartContainerClass}
            showReferenceLine
          />
        </CardContent>
      </Card>

      <Card className={chartCardClass}>
        <CardHeader className="px-4 pt-3 pb-2">
          <CardTitle className="flex items-center gap-2 text-sm font-semibold">
            <HardDrive className="h-4 w-4 text-chart-4" />
            {t('chart.diskUsage')}
          </CardTitle>
        </CardHeader>
        <CardContent className="px-4 pb-3">
          <DiskUsageLineChart
            chartData={chartData}
            mode="detail"
            isMobile={isMobile}
            containerClassName={chartContainerClass}
            showReferenceLine
          />
        </CardContent>
      </Card>

      <Card className={chartCardClass}>
        <CardHeader className="px-4 pt-3 pb-2">
          <CardTitle className="flex items-center gap-2 text-sm font-semibold">
            <Unplug className="h-4 w-4 text-chart-5" />
            {t('chart.connections')}
          </CardTitle>
        </CardHeader>
        <CardContent className="px-4 pb-3">
          <ConnectionsLineChart chartData={chartData} mode="detail" isMobile={isMobile} containerClassName={chartContainerClass} />
        </CardContent>
      </Card>

      <Card className={chartCardClass}>
        <CardHeader className="px-4 pt-3 pb-2">
          <CardTitle className="flex items-center gap-2 text-sm font-semibold">
            <Activity className="h-4 w-4 text-chart-9" />
            {t('chart.process')}
          </CardTitle>
        </CardHeader>
        <CardContent className="px-4 pb-3">
          <ProcessLineChart chartData={chartData} mode="detail" isMobile={isMobile} containerClassName={chartContainerClass} />
        </CardContent>
      </Card>

      <Card className={cn(chartCardClass, 'lg:col-span-2')}>
        <CardHeader className="px-4 pt-3 pb-2">
          <CardTitle className="flex items-center justify-between text-sm font-semibold">
            <div className="flex items-center gap-2">
              <ArrowUpDown className="h-4 w-4 text-chart-7" />
              {t('chart.networkTraffic')}
            </div>
            <Tooltip>
              <TooltipTrigger asChild>
                <Link
                  to={`/node/${nodeUuid}/network`}
                  aria-label={t('label.networkDetailHint')}
                  className="inline-flex min-h-9 sm:min-h-0 items-center gap-1 rounded-md bg-primary/10 px-2.5 sm:px-1.5 py-1 sm:py-0.5 text-xxs font-mono font-bold uppercase tracking-wider text-primary ring-1 ring-primary/25 transition-colors hover:bg-primary/18 hover:ring-primary/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/60"
                >
                  {t('label.networkDetail')}
                  <ExternalLink className="h-2.5 w-2.5" aria-hidden />
                </Link>
              </TooltipTrigger>
              <TooltipContent side="bottom" className="max-w-xs text-xs">
                {t('label.networkDetailHint')}
              </TooltipContent>
            </Tooltip>
          </CardTitle>
        </CardHeader>
        <CardContent className="px-4 pb-3">
          <NetworkTrafficAreaChart chartData={chartData} mode="detail" isMobile={isMobile} containerClassName={chartContainerClass} />
        </CardContent>
      </Card>
    </div>
  );

  return (
    <div className="w-full overflow-hidden">
      {loading && (
        <div className="flex h-64 items-center justify-center rounded-lg border border-border/50 bg-card/40 backdrop-blur-xl commander-corners commander-corners-soft relative overflow-hidden mb-4">
          <span className="corner-bottom" />
          <HudSpinner size="lg" />
        </div>
      )}

      {error && !loading && (
        <div className="flex h-64 flex-col items-center justify-center gap-3 rounded-lg border border-destructive/40 bg-card/80 backdrop-blur-xl px-4 commander-corners relative overflow-hidden mb-4">
          <span className="corner-bottom" />
          <AlertTriangle className="h-6 w-6 text-destructive/80" aria-hidden />
          <div className="font-mono text-sm text-destructive text-center max-w-md">{error}</div>
          <button
            type="button"
            onClick={retry}
            className="cursor-pointer rounded border border-primary/30 px-3 py-1.5 font-mono text-xs text-primary transition-colors hover:bg-primary/15 inline-flex items-center gap-1.5"
          >
            <RotateCw className="h-3 w-3" aria-hidden />
            {t('action.retry')}
          </button>
        </div>
      )}

      {!loading && !error && chartGrid}
    </div>
  );
}
