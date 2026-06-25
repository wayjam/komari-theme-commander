import { useTranslation } from 'react-i18next';
import { Info } from 'lucide-react';
import { Tooltip, TooltipTrigger, TooltipContent } from '@/components/ui/tooltip';
import { cn } from '@/lib/utils';

export type PingCurveMode = 'raw' | 'smooth';

interface PingCurveModeToggleProps {
  value: PingCurveMode;
  onChange: (value: PingCurveMode) => void;
  className?: string;
  showHint?: boolean;
}

const OPTIONS: PingCurveMode[] = ['raw', 'smooth'];

export function PingCurveModeToggle({
  value,
  onChange,
  className,
  showHint = true,
}: PingCurveModeToggleProps) {
  const { t } = useTranslation();

  const labelKey: Record<PingCurveMode, string> = {
    raw: 'chart.raw',
    smooth: 'chart.smooth',
  };

  return (
    <div className={cn('flex items-center gap-1.5 shrink-0', className)}>
      <div
        className="flex items-center gap-0.5 rounded-md border border-border/40 bg-background/40 p-0.5"
        role="group"
        aria-label={t('chart.curveMode')}
      >
        {OPTIONS.map(mode => (
          <button
            key={mode}
            type="button"
            onClick={() => onChange(mode)}
            aria-pressed={value === mode}
            className={cn(
              'cursor-pointer rounded h-9 sm:h-6 min-w-9 sm:min-w-0 px-2.5 font-mono text-xs tabular-nums transition-all duration-150 shrink-0',
              'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/50',
              value === mode
                ? 'bg-primary/15 text-primary shadow-[inset_0_0_0_1px_color-mix(in_oklch,var(--primary)_30%,transparent)]'
                : 'text-muted-foreground hover:bg-muted/40 hover:text-foreground',
            )}
          >
            {t(labelKey[mode])}
          </button>
        ))}
      </div>
      {showHint && (
        <Tooltip>
          <TooltipTrigger asChild>
            <button
              type="button"
              className="inline-flex h-9 w-9 sm:h-6 sm:w-6 items-center justify-center rounded text-muted-foreground/50 transition-colors hover:bg-muted/30 hover:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/50"
              aria-label={t('chart.ewmaTooltip')}
            >
              <Info className="h-3 w-3" aria-hidden />
            </button>
          </TooltipTrigger>
          <TooltipContent side="bottom" className="max-w-xs text-xs leading-relaxed">
            {t('chart.ewmaTooltip')}
          </TooltipContent>
        </Tooltip>
      )}
    </div>
  );
}
