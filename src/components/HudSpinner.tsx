import { cn } from '@/lib/utils';

interface HudSpinnerProps {
  size?: 'sm' | 'md' | 'lg';
  className?: string;
}

/**
 * HUD-styled loading indicator for Commander theme.
 * - sm: inline dot pulsing (for inline text / badges)
 * - md: diamond rotating (for section loading)
 * - lg: radar sweep (for full-page loading)
 */
export function HudSpinner({ size = 'md', className }: HudSpinnerProps) {
  if (size === 'sm') {
    return (
      <span className={cn('hud-spinner-sm inline-flex items-center justify-center', className)}>
        <span className="block w-2 h-2 border border-current rotate-45 animate-pulse" />
      </span>
    );
  }

  if (size === 'md') {
    return (
      <span className={cn('hud-spinner-md relative inline-flex items-center justify-center w-5 h-5', className)}>
        <span className="absolute inset-0 border border-primary/40 rotate-45 hud-spinner-diamond" />
        <span className="block w-1.5 h-1.5 bg-primary rounded-full animate-pulse" />
      </span>
    );
  }

  // lg: radar sweep
  return (
    <div className={cn('hud-spinner-lg relative flex items-center justify-center', className)}>
      {/* Outer ring */}
      <div className="absolute w-12 h-12 border border-primary/20 rounded-full" />
      {/* Inner ring */}
      <div className="absolute w-7 h-7 border border-primary/30 rounded-full" />
      {/* Radar sweep */}
      <div className="absolute w-12 h-12 hud-radar-sweep" />
      {/* Crosshair lines */}
      <div className="absolute w-12 h-px bg-primary/10" />
      <div className="absolute w-px h-12 bg-primary/10" />
      {/* Center dot */}
      <div className="w-1.5 h-1.5 bg-primary rounded-full animate-pulse" />
    </div>
  );
}
