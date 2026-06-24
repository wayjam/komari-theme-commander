import { useCallback, useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { useNavigate, useLocation } from 'react-router-dom';
import { AlertTriangle, Fingerprint, Globe, LayoutGrid, List, Settings, Shield, User } from 'lucide-react';
import { LanguageSwitcher } from '@/components/LanguageSwitcher';
import { ThemeSwitcher } from '@/components/ThemeSwitcher';
import { ViewTabs, type ViewTab } from '@/components/ViewTabs';
import { Button } from '@/components/ui/button';
import { Tooltip, TooltipTrigger, TooltipContent } from '@/components/ui/tooltip';
import {
  prefetchDashboardView,
  useViewMode,
  type ViewMode,
} from '@/contexts/ViewModeContext';
import { useAppConfig } from '@/hooks/useAppConfig';
import { usePrivacyMode } from '@/hooks/usePrivacyMode';
import { cn } from '@/lib/utils';

interface AppHeaderProps {
  siteName: string;
  siteDescription: string;
  logoSrc: string;
  hasCriticalNode: boolean;
}

function CriticalLoadBanner({ compact }: { compact?: boolean }) {
  const { t } = useTranslation();

  return (
    <div
      className="flex items-center gap-1.5 px-2 py-0.5 rounded bg-destructive/10 border border-destructive/20 text-xs font-mono text-destructive motion-safe:animate-pulse threat-badge shrink-0"
      title={t('hud.criticalLoadBanner')}
    >
      <AlertTriangle className="h-3 w-3 shrink-0" aria-hidden />
      {compact ? (
        <span className="uppercase">{t('hud.criticalLoadShort')}</span>
      ) : (
        <>
          <span className="hidden lg:inline uppercase tracking-widest glitch-text">{t('hud.criticalLoadBanner')}</span>
          <span className="lg:hidden uppercase">{t('hud.criticalLoadShort')}</span>
        </>
      )}
    </div>
  );
}

function HeaderUtilityControls({ layout }: { layout: 'desktop' | 'mobile' }) {
  const { t } = useTranslation();
  const appConfig = useAppConfig();
  const { privacyMode, togglePrivacyMode } = usePrivacyMode();
  const isDesktop = layout === 'desktop';
  const btnClass = isDesktop ? 'h-7 w-7' : 'h-9 w-9 sm:h-8 sm:w-8';
  const iconClass = isDesktop ? 'h-3.5 w-3.5' : 'h-4 w-4';
  const adminLabel =
    appConfig.isLoggedIn && appConfig.username
      ? `${t('action.admin')}: ${appConfig.username}`
      : t('action.admin');
  const adminTitle = appConfig.isLoggedIn ? (appConfig.username || t('action.admin')) : t('action.admin');

  const privacyButton = (
    <Button
      variant="ghost"
      size="sm"
      onClick={togglePrivacyMode}
      className={cn(
        `${btnClass} p-0 text-xs font-mono cursor-pointer`,
        privacyMode ? 'bg-primary/15 text-primary hover:bg-primary/25' : 'hover:bg-muted/50',
      )}
      title={isDesktop ? undefined : (privacyMode ? t('privacy.on') : t('privacy.off'))}
      aria-label={t('privacy.label')}
      aria-pressed={privacyMode}
    >
      <Fingerprint className={cn(iconClass, privacyMode && 'text-primary')} aria-hidden />
    </Button>
  );

  const adminButton = (
    <Button
      variant="ghost"
      size="sm"
      onClick={() => { window.location.href = '/admin'; }}
      className={cn(`${btnClass} p-0 text-xs font-mono hover:bg-primary/15 hover:text-primary cursor-pointer`)}
      title={isDesktop ? undefined : adminTitle}
      aria-label={adminLabel}
    >
      {appConfig.isLoggedIn
        ? <User className={iconClass} aria-hidden />
        : <Settings className={iconClass} aria-hidden />}
    </Button>
  );

  if (isDesktop) {
    return (
      <div className="flex items-center gap-1">
        <LanguageSwitcher />
        <ThemeSwitcher />
        {appConfig.isLoggedIn && (
          <Tooltip>
            <TooltipTrigger asChild>{privacyButton}</TooltipTrigger>
            <TooltipContent side="bottom" className="text-xs font-mono">
              {privacyMode ? t('privacy.on') : t('privacy.off')}
            </TooltipContent>
          </Tooltip>
        )}
        <Tooltip>
          <TooltipTrigger asChild>{adminButton}</TooltipTrigger>
          <TooltipContent side="bottom" className="text-xs font-mono">
            {adminTitle}
          </TooltipContent>
        </Tooltip>
      </div>
    );
  }

  return (
    <div className="flex items-center gap-1 shrink-0">
      <LanguageSwitcher />
      <ThemeSwitcher />
      {appConfig.isLoggedIn && privacyButton}
      {adminButton}
    </div>
  );
}

export function AppHeader({ siteName, siteDescription, logoSrc, hasCriticalNode }: AppHeaderProps) {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const location = useLocation();
  const { viewMode, setViewMode } = useViewMode();
  const appConfig = useAppConfig();
  const { themeConfig } = appConfig;

  const isDashboard = location.pathname === '/';

  const viewButtons = useMemo<ViewTab<ViewMode>[]>(() => {
    const all: ViewTab<ViewMode>[] = [
      { mode: 'globe', icon: Globe, label: t('view.globe') },
      { mode: 'grid', icon: LayoutGrid, label: t('view.grid') },
      { mode: 'table', icon: List, label: t('view.table') },
      { mode: 'uptime', icon: Shield, label: t('view.uptime') },
    ];
    return all.filter(({ mode }) => {
      if (mode === 'globe') return themeConfig.enable_globe;
      if (mode === 'uptime') return themeConfig.enable_uptime;
      return true;
    });
  }, [t, themeConfig]);

  const handleViewTabChange = useCallback(
    (mode: ViewMode) => {
      setViewMode(mode);
      if (!isDashboard) navigate('/');
    },
    [setViewMode, isDashboard, navigate],
  );

  const handleViewTabHover = useCallback(
    (mode: ViewMode) => {
      if (mode !== viewMode) prefetchDashboardView(mode);
    },
    [viewMode],
  );

  return (
    <header className="sticky top-0 z-50 border-b border-border/50 bg-background/85 backdrop-blur-xl relative pt-safe">
      <div className="commander-scanner-effect" />
      <div className="header-neon-line" />
      <div className="container mx-auto px-3 sm:px-4 relative z-10">
        <div className="hidden sm:flex h-12 items-center justify-between gap-3">
          <div className="flex items-center gap-3 min-w-0 shrink">
            <button
              type="button"
              onClick={() => navigate('/')}
              className="flex min-w-0 items-center gap-2 rounded-sm hover:text-primary transition-colors duration-200 ease-out cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/60 focus-visible:ring-offset-2 focus-visible:ring-offset-background"
              title={siteDescription || siteName}
              aria-label={`${t('action.home')}: ${siteName}`}
            >
              <img src={logoSrc} alt="" aria-hidden className="h-7 w-7 shrink-0 rounded-md" />
              <span className="truncate text-xl font-bold font-display">{siteName}</span>
            </button>
            {hasCriticalNode && <CriticalLoadBanner />}
          </div>
          <div className="flex items-center gap-3">
            <ViewTabs
              tabs={viewButtons}
              value={viewMode}
              onChange={handleViewTabChange}
              onHoverIntent={handleViewTabHover}
              labelBreakpoint="md"
            />
            <HeaderUtilityControls layout="desktop" />
          </div>
        </div>

        <div className="sm:hidden flex items-center justify-between h-9 pt-1.5 pb-1 mb-1 min-w-0">
          <button
            type="button"
            onClick={() => navigate('/')}
            className="min-w-0 flex flex-1 items-center gap-1.5 text-left rounded-sm hover:text-primary transition-colors duration-200 ease-out cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/60 focus-visible:ring-offset-2 focus-visible:ring-offset-background"
            title={siteDescription || siteName}
            aria-label={`${t('action.home')}: ${siteName}`}
          >
            <img src={logoSrc} alt="" aria-hidden className="h-6 w-6 shrink-0 rounded-[0.4rem] ring-1 ring-primary/15" />
            <span className="truncate text-[clamp(1rem,4.6vw,1.125rem)] font-bold font-display leading-none tracking-[-0.02em]">{siteName}</span>
          </button>
          {hasCriticalNode && <CriticalLoadBanner compact />}
        </div>
        <div className="sm:hidden flex items-center justify-between border-t border-border/25 pt-1.5 pb-2.5 gap-2 min-w-0">
          <ViewTabs
            tabs={viewButtons}
            value={viewMode}
            onChange={handleViewTabChange}
            onHoverIntent={handleViewTabHover}
            labelBreakpoint="never"
            className="min-w-0 max-w-full overflow-x-auto scrollbar-none shrink"
          />
          <HeaderUtilityControls layout="mobile" />
        </div>
      </div>
    </header>
  );
}
