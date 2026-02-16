import { useState, useRef, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { useTheme, type Theme } from '../hooks/useTheme';
import { Sun, Moon, Eye, ChevronDown } from 'lucide-react';
import { Button } from './ui/button';

const themeOrder: Theme[] = ['lumina', 'deepspace', 'clean'];

const themeIcons: Record<Theme, typeof Sun> = {
  lumina: Sun,
  deepspace: Moon,
  clean: Eye,
};

export function ThemeSwitcher() {
  const { t } = useTranslation();
  const { theme, setTheme } = useTheme();
  const [dropdownOpen, setDropdownOpen] = useState(false);
  const panelRef = useRef<HTMLDivElement>(null);

  const cycle = () => {
    const idx = themeOrder.indexOf(theme);
    const next = themeOrder[(idx + 1) % themeOrder.length];
    setTheme(next);
  };

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
      <div className="flex items-center">
        {/* Main button: click to cycle */}
        <Button
          variant="ghost"
          size="sm"
          onClick={cycle}
          className="h-7 px-2 text-xs font-mono hover:bg-primary/15 hover:text-primary rounded-r-none"
          title={t('theme.currentSwitch', { label })}
        >
          <Icon className="h-3.5 w-3.5 sm:mr-1" />
          <span className="hidden sm:inline">{label}</span>
        </Button>
        {/* Dropdown arrow */}
        <Button
          variant="ghost"
          size="sm"
          onClick={() => setDropdownOpen(!dropdownOpen)}
          className="h-7 px-1 text-xs font-mono hover:bg-primary/15 hover:text-primary rounded-l-none border-l border-border/30"
          title={t('theme.select')}
        >
          <ChevronDown className="h-3 w-3" />
        </Button>
      </div>

      {/* Dropdown menu */}
      {dropdownOpen && (
        <div className="absolute right-0 top-full mt-1 w-40 rounded-lg border border-border/50 bg-card/95 backdrop-blur-xl shadow-xl z-50 overflow-hidden">
          <div className="px-3 py-1.5 border-b border-border/50">
            <span className="text-xxs font-mono font-bold uppercase tracking-wider text-muted-foreground">
              {t('theme.title')}
            </span>
          </div>
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
                    <span className="ml-auto w-1.5 h-1.5 rounded-full bg-primary" />
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
