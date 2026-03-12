import { useState, useRef, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { useTheme, type Theme } from '../hooks/useTheme';
import { Sun, Moon, Cloud, Check } from 'lucide-react';
import { Button } from './ui/button';
import { Tooltip, TooltipTrigger, TooltipContent } from './ui/tooltip';

const themeOrder: Theme[] = ['lumina', 'deepspace', 'clean'];

const themeIcons: Record<Theme, typeof Sun> = {
  lumina: Sun,
  deepspace: Moon,
  clean: Cloud,
};

export function ThemeSwitcher() {
  const { t } = useTranslation();
  const { theme, setTheme } = useTheme();
  const [dropdownOpen, setDropdownOpen] = useState(false);
  const panelRef = useRef<HTMLDivElement>(null);

  // Close on outside click
  useEffect(() => {
    if (!dropdownOpen) return;
    const handler = (e: MouseEvent) => {
      if (panelRef.current && !panelRef.current.contains(e.target as Node)) {
        setDropdownOpen(false);
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [dropdownOpen]);

  const Icon = themeIcons[theme];
  const label = t(`theme.${theme}` as const);

  return (
    <div className="relative" ref={panelRef}>
      <Tooltip>
        <TooltipTrigger asChild>
          <Button
            variant="ghost"
            size="sm"
            onClick={() => setDropdownOpen(!dropdownOpen)}
            className="h-7 w-7 p-0 text-xs font-mono cursor-pointer hover:bg-muted/50"
          >
            <Icon className="h-3.5 w-3.5" />
          </Button>
        </TooltipTrigger>
        <TooltipContent side="bottom" className="text-xs font-mono">
          {label}
        </TooltipContent>
      </Tooltip>

      {/* Dropdown menu */}
      {dropdownOpen && (
        <div className="absolute right-0 top-full mt-1 w-36 rounded-lg border border-border/50 bg-popover shadow-xl z-50 overflow-hidden commander-dropdown">
          <div className="p-1">
            {themeOrder.map((th) => {
              const TIcon = themeIcons[th];
              const tLabel = t(`theme.${th}` as const);
              const isActive = th === theme;
              return (
                <button
                  key={th}
                  onClick={() => {
                    setTheme(th);
                    setDropdownOpen(false);
                  }}
                  className={`w-full flex items-center gap-2.5 px-3 py-1.5 rounded-md text-left transition-colors cursor-pointer ${
                    isActive
                      ? 'bg-primary/15 text-primary'
                      : 'hover:bg-muted/50 text-foreground'
                  }`}
                >
                  <TIcon className="h-3.5 w-3.5" />
                  <span className="text-xs font-mono font-medium">{tLabel}</span>
                  {isActive && (
                    <Check className="ml-auto h-3.5 w-3.5 text-primary" />
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
