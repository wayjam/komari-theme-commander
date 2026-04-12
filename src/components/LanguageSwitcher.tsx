import { useState, useRef, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { Languages } from 'lucide-react';
import { Button } from './ui/button';
import { supportedLanguages, type SupportedLanguage } from '../i18n';
import { cn } from '@/lib/utils';

function resolveLanguage(lang: string): SupportedLanguage {
  const codes = supportedLanguages.map(l => l.code);
  if (codes.includes(lang as SupportedLanguage)) return lang as SupportedLanguage;
  if (lang.startsWith('zh')) {
    if (lang.includes('TW') || lang.includes('HK') || lang.includes('Hant')) return 'zh-Hant';
    return 'zh-Hans';
  }
  return 'en';
}

const MENU_ID = 'language-switcher-menu';

const menuItemClass = cn(
  'w-full flex items-center gap-2.5 px-3 py-1.5 rounded-md text-left transition-colors cursor-pointer',
  'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/50 focus-visible:ring-offset-2 focus-visible:ring-offset-popover',
);

export function LanguageSwitcher() {
  const { t, i18n } = useTranslation();
  const [dropdownOpen, setDropdownOpen] = useState(false);
  const panelRef = useRef<HTMLDivElement>(null);

  const currentLang = resolveLanguage(i18n.language);

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

  return (
    <div className="relative" ref={panelRef}>
      <Button
        type="button"
        variant="ghost"
        size="sm"
        onClick={() => setDropdownOpen(!dropdownOpen)}
        className="h-7 w-7 p-0 text-xs font-mono cursor-pointer hover:bg-muted/50 transition-colors duration-200 ease-out"
        aria-label={t('lang.select')}
        aria-expanded={dropdownOpen}
        aria-haspopup="menu"
        aria-controls={MENU_ID}
      >
        <Languages className="h-3.5 w-3.5" aria-hidden />
      </Button>

      {dropdownOpen && (
        <div
          id={MENU_ID}
          role="menu"
          aria-label={t('lang.title')}
          className="absolute right-0 top-full mt-1 w-40 rounded-lg border border-border/50 bg-popover/95 backdrop-blur-xl shadow-xl z-50 overflow-hidden commander-dropdown"
        >
          <div className="px-3 py-1.5 border-b border-border/50">
            <span className="text-xxs font-mono font-bold uppercase tracking-wider text-muted-foreground">
              {t('lang.title')}
            </span>
          </div>
          <div className="p-1" role="none">
            {supportedLanguages.map((lang) => {
              const isActive = lang.code === currentLang;
              return (
                <button
                  key={lang.code}
                  type="button"
                  role="menuitemradio"
                  aria-checked={isActive}
                  onClick={() => {
                    i18n.changeLanguage(lang.code);
                    setDropdownOpen(false);
                  }}
                  className={cn(
                    menuItemClass,
                    isActive
                      ? 'bg-primary/15 text-primary'
                      : 'hover:bg-muted/50 text-foreground',
                  )}
                >
                  <Languages className="h-3.5 w-3.5 shrink-0 opacity-70" aria-hidden />
                  <span className="text-xs font-mono font-medium">{lang.label}</span>
                  {isActive && (
                    <span className="ml-auto w-1.5 h-1.5 shrink-0 rounded-full bg-primary" aria-hidden />
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
