import { useEffect, useMemo, useState, useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import { Link } from 'react-router-dom';
import { Card, CardContent, CardHeader, CardTitle } from './ui/card';
import { Tooltip, TooltipTrigger, TooltipContent } from './ui/tooltip';
import { Cpu, MemoryStick, HardDrive, Activity, Clock, ArrowUpDown, ExternalLink, Unplug, RotateCw, AlertTriangle } from 'lucide-react';
import { HudSpinner } from './HudSpinner';
import { apiService } from '../services/api';
import { useAppConfig } from '@/hooks/useAppConfig';
import { useIsMobile } from '@/hooks/useIsMobile';
import { cn } from '@/lib/utils';
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
}

export function NodeCharts({ nodeUuid }: NodeChartsProps) {
  const { t } = useTranslation();
  const [loadData, setLoadData] = useState<LoadRecord[] | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [timeRange, setTimeRange] = useState(1);
  const isMobile = useIsMobile();
  const { recordPreserveTime } = useAppConfig();

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

  const fetchLoadData = useCallback(() => {
    if (!nodeUuid) return;
    setLoading(true);
    setError(null);
    apiService.getLoadHistory(nodeUuid, timeRange)
      .then(loadHistory => {
        if (loadHistory?.records) {
          const records = (loadHistory.records || []) as LoadRecord[];
          records.sort((a, b) => new Date(a.time).getTime() - new Date(b.time).getTime());
          setLoadData(records);
        }
        setLoading(false);
      })
      .catch(err => {
        setError(err.message || 'Error');
        setLoading(false);
      });
  }, [nodeUuid, timeRange]);

  useEffect(() => {
    fetchLoadData();
  }, [fetchLoadData]);

  const chartData: ChartDataPoint[] = useMemo(() => {
    if (!loadData?.length) return [];
    return transformLoadRecords(loadData);
  }, [loadData]);

  if (loading) {
    return (
      <div className="flex h-64 items-center justify-center rounded-lg border border-border/50 bg-card/40 backdrop-blur-xl commander-corners commander-corners-soft relative overflow-hidden">
        <span className="corner-bottom" />
        <HudSpinner size="lg" />
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex h-64 flex-col items-center justify-center gap-3 rounded-lg border border-destructive/40 bg-card/80 backdrop-blur-xl px-4 commander-corners relative overflow-hidden">
        <span className="corner-bottom" />
        <AlertTriangle className="h-6 w-6 text-destructive/80" aria-hidden />
        <div className="font-mono text-sm text-destructive text-center max-w-md">{error}</div>
        <button
          type="button"
          onClick={fetchLoadData}
          className="cursor-pointer rounded border border-primary/30 px-3 py-1.5 font-mono text-xs text-primary transition-colors hover:bg-primary/15 inline-flex items-center gap-1.5"
        >
          <RotateCw className="h-3 w-3" aria-hidden />
          {t('action.retry')}
        </button>
      </div>
    );
  }

  return (
    <div className="w-full space-y-4 overflow-hidden">
      {/* Time range selector — segmented control, inline with refresh */}
      <div className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-border/40 bg-card/60 backdrop-blur-xl px-3 py-2 commander-corners commander-corners-soft relative overflow-hidden">
        <span className="corner-bottom" />
        <div className="flex items-center gap-2">
          <Clock className="h-3.5 w-3.5 text-primary" aria-hidden />
          <span className="font-display text-xxs font-bold tracking-[0.2em] text-muted-foreground uppercase">
            {t('chart.timeRange')}
          </span>
        </div>
        <div className="flex items-center gap-0.5 rounded-md border border-border/40 bg-background/40 p-0.5 overflow-x-auto scrollbar-none max-w-full">
          {timeRanges.map(tr => (
            <button
              key={tr.value}
              type="button"
              onClick={() => setTimeRange(tr.value)}
              aria-pressed={timeRange === tr.value}
              className={cn(
                'cursor-pointer rounded h-9 sm:h-6 min-w-9 sm:min-w-0 px-2.5 font-mono text-xs tabular-nums transition-all duration-150 shrink-0',
                timeRange === tr.value
                  ? 'bg-primary/15 text-primary shadow-[inset_0_0_0_1px_color-mix(in_oklch,var(--primary)_30%,transparent)]'
                  : 'text-muted-foreground hover:bg-muted/40 hover:text-foreground',
              )}
            >
              {tr.label}
            </button>
          ))}
          <div className="mx-0.5 h-4 w-px bg-border/40 shrink-0" />
          <button
            type="button"
            onClick={fetchLoadData}
            aria-label={t('action.retry')}
            className="cursor-pointer rounded h-9 w-9 sm:h-6 sm:w-6 inline-flex items-center justify-center text-muted-foreground transition-colors hover:bg-primary/15 hover:text-primary shrink-0"
          >
            <RotateCw className="h-3 w-3" aria-hidden />
          </button>
        </div>
      </div>

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
                    aria-label={t('label.viewNetworkTrafficHint')}
                    className="inline-flex min-h-9 sm:min-h-0 items-center gap-1 rounded-md bg-primary/10 px-2.5 sm:px-1.5 py-1 sm:py-0.5 text-xxs font-mono font-bold uppercase tracking-wider text-primary ring-1 ring-primary/25 transition-colors hover:bg-primary/18 hover:ring-primary/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/60"
                  >
                    {t('label.viewNetworkTraffic')}
                    <ExternalLink className="h-2.5 w-2.5" aria-hidden />
                  </Link>
                </TooltipTrigger>
                <TooltipContent side="bottom" className="max-w-xs text-xs">
                  {t('label.viewNetworkTrafficHint')}
                </TooltipContent>
              </Tooltip>
            </CardTitle>
          </CardHeader>
          <CardContent className="px-4 pb-3">
            <NetworkTrafficAreaChart chartData={chartData} mode="detail" isMobile={isMobile} containerClassName={chartContainerClass} />
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
