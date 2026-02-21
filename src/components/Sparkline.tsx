import { useId, useMemo, useCallback, memo } from 'react';
import { Area, AreaChart, YAxis } from 'recharts';

interface SparklineProps {
  data: number[];
  width?: number;
  height?: number;
  color?: string;
  className?: string;
}

function LastDot({ cx, cy, index, total, color }: { cx?: number; cy?: number; index?: number; total: number; color: string }) {
  if (index !== total - 1 || cx == null || cy == null) return null;
  return (
    <g>
      <circle cx={cx} cy={cy} r={2} fill={color} className="sparkline-dot-svg" />
      <circle cx={cx} cy={cy} r={5} fill={color} opacity={0.3} className="sparkline-dot-glow" />
    </g>
  );
}

export const Sparkline = memo(function Sparkline({
  data,
  width = 64,
  height = 20,
  color = 'var(--color-primary)',
  className,
}: SparklineProps) {
  const gradId = useId();
  const chartData = useMemo(() => data?.map((v, i) => ({ i, v })) ?? [], [data]);

  const renderDot = useCallback(
    (props: Record<string, unknown>) => (
      <LastDot
        key={props.index as number}
        cx={props.cx as number}
        cy={props.cy as number}
        index={props.index as number}
        total={chartData.length}
        color={color}
      />
    ),
    [chartData.length, color],
  );

  if (!data || data.length < 2) return null;

  return (
    <div className={`sparkline-container ${className ?? ''}`} style={{ width, height }}>
      <AreaChart width={width} height={height} data={chartData} margin={{ top: 3, right: 4, bottom: 3, left: 2 }}>
        <defs>
          <linearGradient id={gradId} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor={color} stopOpacity={0.3} />
            <stop offset="100%" stopColor={color} stopOpacity={0} />
          </linearGradient>
        </defs>
        <YAxis domain={['dataMin', 'dataMax']} hide />
        <Area
          type="monotone"
          dataKey="v"
          stroke={color}
          strokeWidth={1.5}
          fill={`url(#${gradId})`}
          isAnimationActive={false}
          dot={renderDot}
          activeDot={false}
        />
      </AreaChart>
    </div>
  );
});
