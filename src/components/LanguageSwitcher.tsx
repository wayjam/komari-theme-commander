import { useState, useRef, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { Languages, ChevronDown } from 'lucide-react';
import { Button } from './ui/button';
import { supportedLanguages, type SupportedLanguage } from '../i18n';

const languageLabels: Record<SupportedLanguage, string> = {
  en: 'EN',
  'zh-CN': '简',
  'zh-TW': '繁',
};

function resolveLanguage(lang: string): SupportedLanguage {
  const codes = supportedLanguages.map(l => l.code);
  if (codes.includes(lang as SupportedLanguage)) return lang as SupportedLanguage;
  // e.g. "zh-TW" from navigator might come as "zh-Hant-TW", "zh" → fallback to zh-CN
  if (lang.startsWith('zh')) {
    if (lang.includes('TW') || lang.includes('HK') || lang.includes('Hant')) return 'zh-TW';
    return 'zh-CN';
  }
  return 'en';
}

export function LanguageSwitcher() {
  const { i18n } = useTranslation();
  const [dropdownOpen, setDropdownOpen] = useState(false);
  const panelRef = useRef<HTMLDivElement>(null);

  const currentLang = resolveLanguage(i18n.language);
  const displayLabel = languageLabels[currentLang] || currentLang;

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

  return (
    <div className="relative" ref={panelRef}>
      <Button
        variant="ghost"
        size="sm"
        onClick={() => setDropdownOpen(!dropdownOpen)}
        className="h-7 px-2 text-xs font-mono hover:bg-primary/15 hover:text-primary"
      >
        <Languages className="h-3.5 w-3.5 sm:mr-1" />
        <span className="hidden sm:inline">{displayLabel}</span>
        <ChevronDown className="h-3 w-3 ml-0.5" />
      </Button>

      {dropdownOpen && (
        <div className="absolute right-0 top-full mt-1 w-40 rounded-lg border border-border/50 bg-card/95 backdrop-blur-xl shadow-xl z-50 overflow-hidden">
          <div className="px-3 py-1.5 border-b border-border/50">
            <span className="text-xxs font-mono font-bold uppercase tracking-wider text-muted-foreground">
              LANGUAGE
            </span>
          </div>
          <div className="p-1">
            {supportedLanguages.map((lang) => {
              const isActive = lang.code === currentLang;
              return (
                <button
                  key={lang.code}
                  onClick={() => {
                    i18n.changeLanguage(lang.code);
                    setDropdownOpen(false);
                  }}
                  className={`w-full flex items-center gap-2.5 px-3 py-1.5 rounded-md text-left transition-colors cursor-pointer ${
                    isActive
                      ? 'bg-primary/15 text-primary'
                      : 'hover:bg-muted/50 text-foreground'
                  }`}
                >
                  <Languages className="h-3.5 w-3.5" />
                  <span className="text-xs font-mono font-medium">{lang.label}</span>
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
