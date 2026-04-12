import { useEffect, useMemo, useState, useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import { Link } from 'react-router-dom';
import { Card, CardContent, CardHeader, CardTitle } from './ui/card';
import { Cpu, MemoryStick, HardDrive, Activity, Clock, ArrowUpDown, ExternalLink, Unplug } from 'lucide-react';
import { HudSpinner } from './HudSpinner';
import { apiService } from '../services/api';
import { useAppConfig } from '@/hooks/useAppConfig';
import { useIsMobile } from '@/hooks/useIsMobile';
import {
  CpuUsageLineChart,
  SystemLoadLineChart,
  MemoryLineChart,
  DiskUsageLineChart,
  ConnectionsLineChart,
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
      <div className="flex h-64 items-center justify-center">
        <HudSpinner size="lg" />
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex h-64 flex-col items-center justify-center gap-3 rounded-lg border border-border/50 bg-card/80 backdrop-blur-xl px-4">
        <div className="font-mono text-sm text-destructive text-center">{error}</div>
        <button
          type="button"
          onClick={fetchLoadData}
          className="cursor-pointer rounded border border-primary/30 px-3 py-1.5 font-mono text-xs text-primary transition-colors hover:bg-primary/15"
        >
          {t('action.retry')}
        </button>
      </div>
    );
  }

  return (
    <div className="w-full space-y-5 overflow-hidden">
      <div className="overflow-hidden rounded-lg border border-border/50 bg-card/80 backdrop-blur-xl">
        <div className="flex items-center justify-between px-4 py-3">
          <div className="flex items-center gap-2">
            <Clock className="h-3.5 w-3.5 text-primary" />
            <span className="font-display text-xs font-bold tracking-wider text-muted-foreground uppercase">{t('chart.timeRange')}</span>
          </div>
          <div className="flex items-center gap-1">
            {timeRanges.map(tr => (
              <button
                key={tr.value}
                type="button"
                onClick={() => setTimeRange(tr.value)}
                className={`cursor-pointer rounded px-2.5 py-1 font-mono text-xs transition-all duration-200 ${
                  timeRange === tr.value
                    ? 'border border-primary/30 bg-primary/15 text-primary'
                    : 'text-muted-foreground hover:bg-muted/30 hover:text-foreground'
                }`}
              >
                {tr.label}
              </button>
            ))}
            <div className="mx-1 h-5 w-px bg-border/30" />
            <button
              type="button"
              onClick={fetchLoadData}
              className="cursor-pointer rounded px-2 py-1 font-mono text-xs text-muted-foreground transition-colors hover:bg-primary/15 hover:text-primary"
            >
              ↻
            </button>
          </div>
        </div>
      </div>

      <div className="grid w-full grid-cols-1 gap-4 sm:gap-5 lg:grid-cols-2">
        <Card className={chartCardClass}>
          <CardHeader className="px-4 pt-3 pb-2">
            <CardTitle className="flex items-center gap-2 text-sm font-semibold">
              <Cpu className="h-4 w-4 text-primary" />
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
              <Activity className="h-4 w-4 text-primary" />
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
              <MemoryStick className="h-4 w-4 text-primary" />
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
              <HardDrive className="h-4 w-4 text-primary" />
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

        {isLoggedIn && (
          <Card className={chartCardClass}>
            <CardHeader className="px-4 pt-3 pb-2">
              <CardTitle className="flex items-center gap-2 text-sm font-semibold">
                <Unplug className="h-4 w-4 text-primary" />
                {t('chart.connections')}
              </CardTitle>
            </CardHeader>
            <CardContent className="px-4 pb-3">
              <ConnectionsLineChart chartData={chartData} mode="detail" isMobile={isMobile} containerClassName={chartContainerClass} />
            </CardContent>
          </Card>
        )}

        <Card className={chartCardClass}>
          <CardHeader className="px-4 pt-3 pb-2">
            <CardTitle className="flex items-center justify-between text-sm font-semibold">
              <div className="flex items-center gap-2">
                <ArrowUpDown className="h-4 w-4 text-primary" />
                {t('chart.networkTraffic')}
              </div>
              <Link to={`/node/${nodeUuid}/network`} className="flex items-center gap-1 font-normal text-xxs font-mono text-primary hover:underline">
                {t('label.viewNetworkTraffic')}
                <ExternalLink className="h-2.5 w-2.5" />
              </Link>
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
