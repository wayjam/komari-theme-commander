import { useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { RotateCw } from 'lucide-react';
import { cn } from '@/lib/utils';
import type { ChartTimeRangeOption } from '@/lib/chart-time-ranges';

type TimeRangeId = ChartTimeRangeOption<number | 'realtime'>['id'];

interface ChartTimeRangeBarProps<T extends TimeRangeId> {
  value: T;
  onChange: (value: T) => void;
  onRefresh?: () => void;
  options: ChartTimeRangeOption<T>[];
  loading?: boolean;
  className?: string;
}

function formatOptionLabel(
  t: (key: string, opts?: { count?: number }) => string,
  option: ChartTimeRangeOption<number | 'realtime'>,
): string {
  if (option.id === 'realtime') return t('chart.realtime');
  const hours = option.hours ?? (typeof option.id === 'number' ? option.id : 0);
  if (hours >= 24 && hours % 24 === 0) {
    return t('chart.days', { count: hours / 24 });
  }
  return t('chart.hours', { count: hours });
}

export function ChartTimeRangeBar<T extends TimeRangeId>({
  value,
  onChange,
  onRefresh,
  options,
  loading = false,
  className,
}: ChartTimeRangeBarProps<T>) {
  const { t } = useTranslation();

  const labeledOptions = useMemo(
    () => options.map(opt => ({ ...opt, label: formatOptionLabel(t, opt) })),
    [options, t],
  );

  return (
    <div
      className={cn(
        'flex justify-center rounded-lg border border-border/40 bg-card/60 backdrop-blur-xl px-3 py-2 commander-corners commander-corners-soft relative overflow-hidden',
        className,
      )}
      role="group"
      aria-label={t('chart.timeRange')}
    >
      <span className="corner-bottom" />
      <div className="flex items-center gap-0.5 rounded-md border border-border/40 bg-background/40 p-0.5 overflow-x-auto scrollbar-none max-w-full">
        {labeledOptions.map(opt => (
          <button
            key={String(opt.id)}
            type="button"
            onClick={() => onChange(opt.id as T)}
            aria-pressed={value === opt.id}
            disabled={loading}
            className={cn(
              'cursor-pointer rounded h-9 sm:h-6 min-w-9 sm:min-w-0 px-2.5 font-mono text-xs tabular-nums transition-all duration-150 shrink-0',
              'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/50',
              'disabled:opacity-50 disabled:cursor-not-allowed',
              value === opt.id
                ? 'bg-primary/15 text-primary shadow-[inset_0_0_0_1px_color-mix(in_oklch,var(--primary)_30%,transparent)]'
                : 'text-muted-foreground hover:bg-muted/40 hover:text-foreground',
            )}
          >
            {opt.label}
          </button>
        ))}
        {onRefresh && (
          <>
            <div className="mx-0.5 h-4 w-px bg-border/40 shrink-0" />
            <button
              type="button"
              onClick={onRefresh}
              disabled={loading}
              aria-label={t('action.refresh')}
              className="cursor-pointer rounded h-9 w-9 sm:h-6 sm:w-6 inline-flex items-center justify-center text-muted-foreground transition-colors hover:bg-primary/15 hover:text-primary shrink-0 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/50 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              <RotateCw className={cn('h-3 w-3', loading && 'motion-safe:animate-spin')} aria-hidden />
            </button>
          </>
        )}
      </div>
    </div>
  );
}
