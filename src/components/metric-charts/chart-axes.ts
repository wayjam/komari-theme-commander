import { useMemo, useCallback } from 'react';

export type MetricChartLayoutMode = 'modal' | 'detail';

export function useMetricChartAxes(
  mode: MetricChartLayoutMode,
  chartDataLength: number,
  isMobile: boolean,
) {
  const margin = useMemo(() => {
    if (mode === 'modal') {
      return { top: 8, right: 8, bottom: 4, left: 8 };
    }
    return {
      top: 10,
      right: isMobile ? 4 : 16,
      bottom: isMobile ? 20 : 10,
      left: isMobile ? 4 : 16,
    };
  }, [mode, isMobile]);

  const timeFormatterModal = useCallback((value: string) => {
    return new Date(value).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  }, []);

  const timeFormatterDetail = useCallback(
    (value: number | string, index: number) => {
      if (!chartDataLength) return '';
      const total = chartDataLength;
      if (isMobile) {
        if (index === 0 || index === total - 1) {
          return new Date(value).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
        }
      } else if (index === 0 || index === total - 1 || index === Math.floor(total / 2)) {
        return new Date(value).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
      }
      return '';
    },
    [chartDataLength, isMobile],
  );

  const xAxisProps = useMemo(() => {
    if (mode === 'modal') {
      return {
        dataKey: 'time' as const,
        tickLine: false,
        axisLine: false,
        tickFormatter: timeFormatterModal,
        interval: 'preserveStartEnd' as const,
        minTickGap: 60,
        tick: { fontSize: 10 },
        height: 28,
      };
    }
    const tickFont = isMobile ? 10 : 11;
    const height = isMobile ? 30 : 40;
    const minTickGap = isMobile ? 50 : 30;
    return {
      dataKey: 'time' as const,
      tickLine: false,
      axisLine: false,
      tickFormatter: timeFormatterDetail,
      interval: 'preserveStartEnd' as const,
      minTickGap,
      tick: { fontSize: tickFont },
      height,
    };
  }, [mode, isMobile, timeFormatterModal, timeFormatterDetail]);

  const yAxisConfig = useMemo(
    () => ({
      tick: { fontSize: isMobile ? 10 : 12, dx: -5 },
      width: isMobile ? 35 : 40,
    }),
    [isMobile],
  );

  const yPctProps = useMemo(() => {
    const base = {
      domain: [0, 100] as [number, number],
      tickLine: false,
      axisLine: false,
      unit: '%',
      allowDecimals: false,
    };
    if (mode === 'modal') {
      return { ...base, tick: { fontSize: 10 }, width: 38 };
    }
    return {
      ...base,
      orientation: 'left' as const,
      type: 'number' as const,
      tick: yAxisConfig.tick,
      width: yAxisConfig.width,
    };
  }, [mode, yAxisConfig]);

  const yPlainProps = useMemo(() => {
    if (mode === 'modal') {
      return { tickLine: false, axisLine: false, tick: { fontSize: 10 }, width: 38 };
    }
    return {
      tickLine: false,
      axisLine: false,
      orientation: 'left' as const,
      type: 'number' as const,
      tick: yAxisConfig.tick,
      width: yAxisConfig.width,
    };
  }, [mode, yAxisConfig]);

  return { margin, xAxisProps, yPctProps, yPlainProps, yAxisConfig };
}
