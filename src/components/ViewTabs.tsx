import { useId, useLayoutEffect, useRef, useState, type ComponentType } from 'react';
import { motion, useReducedMotion } from 'motion/react';
import { useTranslation } from 'react-i18next';
import { cn } from '@/lib/utils';

export interface ViewTab<T extends string> {
  mode: T;
  icon: ComponentType<{ className?: string; 'aria-hidden'?: boolean }>;
  label: string;
}

interface ViewTabsProps<T extends string> {
  tabs: ViewTab<T>[];
  value: T;
  onChange: (mode: T) => void;
  /** Prefetch on hover/focus — used to warm async chunks before navigation. */
  onHoverIntent?: (mode: T) => void;
  /** Hide labels below this Tailwind breakpoint. Default: 'md' (icons-only on small viewports). */
  labelBreakpoint?: 'sm' | 'md' | 'lg' | 'never';
  className?: string;
}

const breakpointShowClass: Record<NonNullable<ViewTabsProps<string>['labelBreakpoint']>, string> = {
  sm: 'hidden sm:inline',
  md: 'hidden md:inline',
  lg: 'hidden lg:inline',
  never: 'hidden',
};

/**
 * Animated sliding-indicator segmented tabs.
 * - The indicator is a single absolutely-positioned card that translates between active tabs.
 * - Tabs themselves have transparent backgrounds; only foreground color changes per state.
 * - Theme-aware: deepspace adds a soft neon inset, clean uses a crisp 1px border, lumina balances both.
 */
export function ViewTabs<T extends string>({
  tabs,
  value,
  onChange,
  onHoverIntent,
  labelBreakpoint = 'md',
  className,
}: ViewTabsProps<T>) {
  const { t } = useTranslation();
  const reduceMotion = useReducedMotion();
  const groupId = useId();

  const containerRef = useRef<HTMLDivElement>(null);
  const tabRefs = useRef<Map<T, HTMLButtonElement>>(new Map());
  const [indicator, setIndicator] = useState<{ left: number; width: number } | null>(null);

  // Reposition the indicator whenever the active tab changes, the tab set changes,
  // or the container resizes (responsive label show/hide changes tab widths).
  useLayoutEffect(() => {
    const container = containerRef.current;
    const node = tabRefs.current.get(value);
    if (!container || !node) {
      setIndicator(null);
      return;
    }
    const measure = () => {
      const cRect = container.getBoundingClientRect();
      const nRect = node.getBoundingClientRect();
      setIndicator({ left: nRect.left - cRect.left, width: nRect.width });
    };
    measure();
    if (typeof ResizeObserver === 'undefined') return;
    const ro = new ResizeObserver(measure);
    ro.observe(container);
    ro.observe(node);
    return () => ro.disconnect();
  }, [value, tabs]);

  return (
    <div
      ref={containerRef}
      role="tablist"
      aria-label={t('view.tablistLabel', { defaultValue: 'View mode' })}
      className={cn(
        'relative inline-flex max-w-full min-w-0 items-center rounded-md p-0.5',
        // Restrained tinted background — sits at the same visual weight as ghost icon buttons next to it.
        'bg-muted/40 border border-border/40',
        // Theme-specific finishing
        'view-tabs',
        className,
      )}
    >
      {/* Sliding indicator */}
      {indicator && (
        <motion.span
          aria-hidden
          className="view-tabs-indicator pointer-events-none absolute top-0.5 bottom-0.5 rounded bg-card"
          initial={false}
          animate={{ x: indicator.left, width: indicator.width }}
          transition={
            reduceMotion
              ? { duration: 0 }
              : { type: 'tween', ease: [0.22, 1, 0.36, 1], duration: 0.28 }
          }
        />
      )}

      {tabs.map(({ mode, icon: Icon, label }) => {
        const isActive = value === mode;
        return (
          <button
            key={mode}
            ref={(el) => {
              if (el) tabRefs.current.set(mode, el);
              else tabRefs.current.delete(mode);
            }}
            type="button"
            role="tab"
            aria-selected={isActive}
            aria-controls={`${groupId}-${mode}`}
            tabIndex={isActive ? 0 : -1}
            onMouseEnter={() => { if (!isActive) onHoverIntent?.(mode); }}
            onFocus={() => { if (!isActive) onHoverIntent?.(mode); }}
            onClick={() => onChange(mode)}
            title={label}
            className={cn(
              'relative z-10 inline-flex h-9 min-w-9 shrink-0 items-center justify-center gap-1.5 rounded px-2.5 sm:h-7 sm:min-w-0 sm:px-2',
              'text-xxs font-mono font-bold uppercase tracking-[0.14em]',
              'transition-colors duration-200 ease-out cursor-pointer',
              'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/60 focus-visible:ring-offset-1 focus-visible:ring-offset-background',
              isActive
                ? 'text-foreground'
                : 'text-muted-foreground/75 hover:text-foreground',
            )}
          >
            <Icon
              className={cn(
                'h-3.5 w-3.5 shrink-0 transition-colors duration-200 ease-out',
                isActive ? 'text-primary' : 'text-current',
              )}
              aria-hidden
            />
            <span className={cn(breakpointShowClass[labelBreakpoint])}>{label}</span>
          </button>
        );
      })}
    </div>
  );
}
