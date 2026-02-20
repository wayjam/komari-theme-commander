import { cn } from '@/lib/utils';

interface CircularGaugeProps {
  label: string;
  value: number;
  icon: React.ReactNode;
  status: 'normal' | 'warning' | 'critical';
  detail?: string;
  subDetail?: string;
  size?: number;
}

export function CircularGauge({
  label,
  value,
  icon,
  status,
  detail,
  subDetail,
  size = 90,
}: CircularGaugeProps) {
  const strokeWidth = 5;
  const radius = (size - strokeWidth) / 2;
  const circumference = 2 * Math.PI * radius;
  const clampedValue = Math.min(Math.max(value, 0), 100);
  const offset = circumference - (clampedValue / 100) * circumference;

  const strokeColor =
    status === 'critical'
      ? 'stroke-red-500'
      : status === 'warning'
        ? 'stroke-yellow-500'
        : 'stroke-primary';

  const textColor =
    status === 'critical'
      ? 'text-red-500'
      : status === 'warning'
        ? 'text-yellow-500'
        : 'text-primary';

  const glowColor =
    status === 'critical'
      ? 'circular-gauge-glow-critical'
      : status === 'warning'
        ? 'circular-gauge-glow-warning'
        : 'circular-gauge-glow-normal';

  return (
    <div className="flex flex-col items-center gap-1.5 p-2.5 rounded bg-muted/15 border border-border/20">
      <div className="flex items-center gap-1.5 self-start">
        {icon}
        <span className="text-xs font-mono text-muted-foreground uppercase tracking-wider">
          {label}
        </span>
      </div>
      <div className={cn('relative circular-gauge', glowColor)} style={{ width: size, height: size }}>
        <svg
          width={size}
          height={size}
          viewBox={`0 0 ${size} ${size}`}
          className="transform -rotate-90"
        >
          {/* Background track */}
          <circle
            cx={size / 2}
            cy={size / 2}
            r={radius}
            fill="none"
            className="stroke-muted/30"
            strokeWidth={strokeWidth}
          />
          {/* Value arc */}
          <circle
            cx={size / 2}
            cy={size / 2}
            r={radius}
            fill="none"
            className={cn(strokeColor, 'transition-all duration-700 ease-out')}
            strokeWidth={strokeWidth}
            strokeLinecap="round"
            strokeDasharray={circumference}
            strokeDashoffset={offset}
          />
        </svg>
        {/* Center text */}
        <div className="absolute inset-0 flex flex-col items-center justify-center">
          <span className={cn('text-lg font-mono font-bold tabular-nums leading-none', textColor)}>
            {clampedValue.toFixed(1)}
          </span>
          <span className={cn('text-xxs font-mono tabular-nums', textColor)}>%</span>
        </div>
      </div>
      {detail && (
        <div className="text-xs font-mono text-muted-foreground text-center leading-tight">
          {detail}
        </div>
      )}
      {subDetail && (
        <div className="text-xxs font-mono text-muted-foreground/60 text-center leading-tight">
          {subDetail}
        </div>
      )}
    </div>
  );
}
