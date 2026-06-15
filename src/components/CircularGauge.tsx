import { cn } from '@/lib/utils';

type GaugeChannel = 'cpu' | 'ram' | 'disk' | 'traffic' | 'load';
type GaugeStatus = 'normal' | 'warning' | 'critical';

interface CircularGaugeProps {
  label: string;
  value: number;
  icon: React.ReactNode;
  status: GaugeStatus;
  detail?: string;
  subDetail?: string;
  size?: number;
  /**
   * Per-channel hue (cpu=chart-1, ram=chart-2, disk=chart-3, traffic=chart-4, load=chart-5).
   * Only applied when status is "normal" — warning/critical always override (semantic > channel).
   * Falls back to `--primary` when omitted, preserving legacy callers.
   */
  channel?: GaugeChannel;
}

const CHANNEL_VAR: Record<GaugeChannel, string> = {
  cpu: 'var(--chart-1)',
  ram: 'var(--chart-2)',
  disk: 'var(--chart-3)',
  traffic: 'var(--chart-4)',
  load: 'var(--chart-5)',
};

export function CircularGauge({
  label,
  value,
  icon,
  status,
  detail,
  subDetail,
  size = 90,
  channel,
}: CircularGaugeProps) {
  const strokeWidth = 5;
  const radius = (size - strokeWidth) / 2;
  const circumference = 2 * Math.PI * radius;
  const clampedValue = Math.min(Math.max(value, 0), 100);
  const offset = circumference - (clampedValue / 100) * circumference;

  // Status > channel > primary fallback
  const colorVar =
    status === 'critical'
      ? 'var(--destructive)'
      : status === 'warning'
        ? 'var(--warning)'
        : channel
          ? CHANNEL_VAR[channel]
          : 'var(--primary)';

  const textColorClass =
    status === 'critical'
      ? 'text-destructive'
      : status === 'warning'
        ? 'text-warning'
        : '';

  const glowClass =
    status === 'critical'
      ? 'circular-gauge-glow-critical'
      : status === 'warning'
        ? 'circular-gauge-glow-warning'
        : 'circular-gauge-glow-normal';

  return (
    <div
      className="flex flex-col items-center gap-1.5 p-3 sm:p-4"
      data-channel={channel}
      data-status={status}
    >
      <div className="flex items-center gap-1.5 self-start">
        <span className={cn('stat-chip', channel && `stat-chip--${channel}`)}>{icon}</span>
        <span className="type-hud-label">
          {label}
        </span>
      </div>
      <div className={cn('relative circular-gauge', glowClass)} style={{ width: size, height: size }}>
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
            className="stroke-muted/50"
            strokeWidth={strokeWidth}
          />
          {/* Value arc */}
          <circle
            cx={size / 2}
            cy={size / 2}
            r={radius}
            fill="none"
            stroke={colorVar}
            className="transition-[stroke-dashoffset] duration-700 ease-out motion-safe:transition-[stroke-dashoffset]"
            strokeWidth={strokeWidth}
            strokeLinecap="round"
            strokeDasharray={circumference}
            strokeDashoffset={offset}
          />
        </svg>
        {/* Center text — kept neutral on normal; status-colored only for warning/critical.
            The arc carries the channel hue; the readout stays calm and legible. */}
        <div className="absolute inset-0 flex flex-col items-center justify-center">
          <span
            className={cn(
              'type-metric-hero tabular-nums',
              textColorClass || 'text-foreground',
            )}
          >
            {clampedValue.toFixed(1)}
          </span>
          <span
            className={cn(
              'text-xxs font-metric mt-0.5',
              textColorClass || 'text-muted-foreground/70',
            )}
          >
            %
          </span>
        </div>
      </div>
      {detail && (
        <div className="text-xs font-metric tabular-nums text-muted-foreground text-center leading-tight">
          {detail}
        </div>
      )}
      {subDetail && (
        <div className="text-xxs font-metric tabular-nums text-muted-foreground/60 text-center leading-tight">
          {subDetail}
        </div>
      )}
    </div>
  );
}
