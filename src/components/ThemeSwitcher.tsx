import { useState, useRef, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { useTheme, type Theme } from '../hooks/useTheme';
import { Sun, Moon, Cloud, Check } from 'lucide-react';
import { Button } from './ui/button';
import { Tooltip, TooltipTrigger, TooltipContent } from './ui/tooltip';
import { cn } from '@/lib/utils';

const themeOrder: Theme[] = ['lumina', 'deepspace', 'clean'];

const themeIcons: Record<Theme, typeof Sun> = {
  lumina: Sun,
  deepspace: Moon,
  clean: Cloud,
};

const MENU_ID = 'theme-switcher-menu';

const menuItemClass = cn(
  'w-full flex items-center gap-2.5 px-3 py-1.5 rounded-md text-left transition-colors cursor-pointer',
  'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/50 focus-visible:ring-offset-2 focus-visible:ring-offset-popover',
);

export function ThemeSwitcher() {
  const { t } = useTranslation();
  const { theme, setTheme } = useTheme();
  const [dropdownOpen, setDropdownOpen] = useState(false);
  const panelRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!dropdownOpen) return;
    const handler = (e: MouseEvent) => {
      if (panelRef.current && !panelRef.current.contains(e.target as Node)) {
        setDropdownOpen(false);
      }
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setDropdownOpen(false);
    };
    document.addEventListener('mousedown', handler);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', handler);
      document.removeEventListener('keydown', onKey);
    };
  }, [dropdownOpen]);

  const Icon = themeIcons[theme];
  const label = t(`theme.${theme}` as const);

  return (
    <div className="relative" ref={panelRef}>
      <Tooltip>
        <TooltipTrigger asChild>
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={() => setDropdownOpen(!dropdownOpen)}
            className="h-7 w-7 p-0 text-xs font-mono cursor-pointer hover:bg-muted/50 transition-colors duration-200 ease-out"
            aria-label={t('theme.select')}
            aria-expanded={dropdownOpen}
            aria-haspopup="menu"
            aria-controls={MENU_ID}
          >
            <Icon className="h-3.5 w-3.5" aria-hidden />
          </Button>
        </TooltipTrigger>
        <TooltipContent side="bottom" className="text-xs font-mono">
          {label}
        </TooltipContent>
      </Tooltip>

      {dropdownOpen && (
        <div
          id={MENU_ID}
          role="menu"
          aria-label={t('theme.title')}
          className="absolute right-0 top-full mt-1 w-36 rounded-lg border border-border/50 bg-popover/95 backdrop-blur-xl shadow-xl z-50 overflow-hidden commander-dropdown"
        >
          <div className="p-1" role="none">
            {themeOrder.map((th) => {
              const TIcon = themeIcons[th];
              const tLabel = t(`theme.${th}` as const);
              const isActive = th === theme;
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
                  <TIcon className="h-3.5 w-3.5 shrink-0" aria-hidden />
                  <span className="text-xs font-mono font-medium">{tLabel}</span>
                  {isActive && (
                    <Check className="ml-auto h-3.5 w-3.5 shrink-0 text-primary" aria-hidden />
                  )}
                </button>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}
