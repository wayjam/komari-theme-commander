import { useCallback, useEffect, useId, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { AnimatePresence, motion, useReducedMotion } from 'motion/react';
import { useTheme, type VisualTheme } from '../hooks/useTheme';
import { Sun, Moon, Cloud, Check, ChevronDown } from 'lucide-react';
import { Tooltip, TooltipTrigger, TooltipContent } from './ui/tooltip';
import { cn } from '@/lib/utils';

/** The cycle order only contains the three visual themes — "auto" is backend config only */
const themeOrder: VisualTheme[] = ['lumina', 'deepspace', 'clean'];

const themeIcons: Record<VisualTheme, typeof Sun> = {
  lumina: Sun,
  deepspace: Moon,
  clean: Cloud,
};

const menuItemClass = cn(
  'w-full flex min-h-9 items-center gap-2.5 px-3 py-2 sm:py-1.5 rounded-md text-left transition-colors cursor-pointer',
  'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/50 focus-visible:ring-offset-2 focus-visible:ring-offset-popover',
);

/**
 * Split button: primary action cycles to the next theme (toggle),
 * trailing chevron opens an explicit dropdown for direct selection.
 */
export function ThemeSwitcher() {
  const { t } = useTranslation();
  const { resolvedTheme, setTheme } = useTheme();
  const reduceMotion = useReducedMotion();
  const menuId = useId();

  const [dropdownOpen, setDropdownOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  // Cycle is based on the resolved (actually displayed) theme
  const currentIndex = themeOrder.indexOf(resolvedTheme);
  const nextTheme = themeOrder[(currentIndex + 1) % themeOrder.length];

  const Icon = themeIcons[resolvedTheme];
  const NextIcon = themeIcons[nextTheme];
  const label = t(`theme.${resolvedTheme}` as const);
  const nextLabel = t(`theme.${nextTheme}` as const);

  const cycleTheme = useCallback(() => {
    setTheme(nextTheme);
  }, [nextTheme, setTheme]);

  useEffect(() => {
    if (!dropdownOpen) return;
    const handleClickOutside = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setDropdownOpen(false);
      }
    };
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setDropdownOpen(false);
    };
    document.addEventListener('mousedown', handleClickOutside);
    document.addEventListener('keydown', handleKey);
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
      document.removeEventListener('keydown', handleKey);
    };
  }, [dropdownOpen]);

  const iconMotion = reduceMotion
    ? { initial: false, animate: { rotate: 0, opacity: 1 }, exit: { opacity: 1 } }
    : {
        initial: { rotate: -90, opacity: 0 },
        animate: { rotate: 0, opacity: 1 },
        exit: { rotate: 90, opacity: 0 },
      };

  return (
    <div ref={containerRef} className="relative inline-flex items-stretch">
      {/* === Primary action: cycle to next theme === */}
      <Tooltip>
        <TooltipTrigger asChild>
          <button
            type="button"
            onClick={cycleTheme}
            aria-label={t('theme.cycleTo', {
              next: nextLabel,
              defaultValue: `Switch to ${nextLabel} theme`,
            })}
            className={cn(
              'group relative h-9 w-9 sm:h-7 sm:w-7 inline-flex items-center justify-center',
              'rounded-l-md rounded-r-none',
              'text-foreground hover:text-primary hover:bg-muted/60',
              'transition-colors duration-200 ease-out cursor-pointer overflow-hidden',
              'focus-visible:outline-none focus-visible:z-10 focus-visible:ring-2 focus-visible:ring-ring/60 focus-visible:ring-inset',
            )}
          >
            <span className="relative inline-flex h-3.5 w-3.5 items-center justify-center">
              <AnimatePresence mode="wait" initial={false}>
                <motion.span
                  key={resolvedTheme}
                  className="absolute inset-0 flex items-center justify-center"
                  {...iconMotion}
                  transition={
                    reduceMotion
                      ? { duration: 0 }
                      : { duration: 0.2, ease: [0.22, 1, 0.36, 1] }
                  }
                >
                  <Icon className="h-3.5 w-3.5" aria-hidden />
                </motion.span>
              </AnimatePresence>
            </span>
          </button>
        </TooltipTrigger>
        <TooltipContent side="bottom" className="text-xs font-mono">
          <div className="flex items-center gap-1.5">
            <span className="text-muted-foreground">{label}</span>
            <span className="text-muted-foreground/50">→</span>
            <NextIcon className="h-3 w-3 text-primary" aria-hidden />
            <span className="font-bold">{nextLabel}</span>
          </div>
        </TooltipContent>
      </Tooltip>

      {/* === Hairline divider between halves === */}
      <span
        aria-hidden
        className="self-stretch w-px bg-border/60 my-1 pointer-events-none"
      />

      {/* === Secondary action: open dropdown for direct selection === */}
      <Tooltip>
        <TooltipTrigger asChild>
          <button
            type="button"
            onClick={() => setDropdownOpen((v) => !v)}
            aria-haspopup="menu"
            aria-expanded={dropdownOpen}
            aria-controls={menuId}
            aria-label={t('theme.select')}
            className={cn(
              'h-9 w-8 sm:h-7 sm:w-5 inline-flex items-center justify-center',
              'rounded-r-md rounded-l-none',
              'text-muted-foreground hover:text-foreground hover:bg-muted/60',
              'transition-colors duration-200 ease-out cursor-pointer',
              'focus-visible:outline-none focus-visible:z-10 focus-visible:ring-2 focus-visible:ring-ring/60 focus-visible:ring-inset',
              dropdownOpen && 'bg-muted/60 text-foreground',
            )}
          >
            <ChevronDown
              className={cn(
                'h-3 w-3 transition-transform duration-200 ease-out',
                dropdownOpen && 'rotate-180',
              )}
              aria-hidden
            />
          </button>
        </TooltipTrigger>
        <TooltipContent side="bottom" className="text-xs font-mono">
          {t('theme.title')}
        </TooltipContent>
      </Tooltip>

      {/* === Dropdown menu === */}
      <AnimatePresence>
        {dropdownOpen && (
          <motion.div
            id={menuId}
            role="menu"
            aria-label={t('theme.title')}
            initial={reduceMotion ? { opacity: 1, y: 0 } : { opacity: 0, y: -4 }}
            animate={{ opacity: 1, y: 0 }}
            exit={reduceMotion ? { opacity: 1, y: 0 } : { opacity: 0, y: -4 }}
            transition={reduceMotion ? { duration: 0 } : { duration: 0.16, ease: [0.22, 1, 0.36, 1] }}
            className="absolute right-0 top-full mt-1.5 w-40 rounded-lg border border-border/50 bg-popover/95 backdrop-blur-xl shadow-xl z-50 overflow-hidden commander-dropdown"
          >
            <div className="px-3 py-1.5 border-b border-border/50">
              <span className="text-xxs font-mono font-bold uppercase tracking-[0.18em] text-muted-foreground">
                {t('theme.title')}
              </span>
            </div>
            <div className="p-1" role="none">
              {themeOrder.map((th) => {
                const TIcon = themeIcons[th];
                const tLabel = t(`theme.${th}` as const);
                const isActive = th === resolvedTheme;
                return (
                  <button
                    key={th}
                    type="button"
                    role="menuitemradio"
                    aria-checked={isActive}
                    onClick={() => {
                      setTheme(th);
                      setDropdownOpen(false);
                    }}
                    className={cn(
                      menuItemClass,
                      isActive
                        ? 'bg-primary/15 text-primary'
                        : 'hover:bg-muted/50 text-foreground',
                    )}
                  >
                    <TIcon
                      className={cn('h-3.5 w-3.5 shrink-0', isActive && 'text-primary')}
                      aria-hidden
                    />
                    <span className="text-xs font-mono font-medium">{tLabel}</span>
                    {isActive && (
                      <Check className="ml-auto h-3.5 w-3.5 shrink-0 text-primary" aria-hidden />
                    )}
                  </button>
                );
              })}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
