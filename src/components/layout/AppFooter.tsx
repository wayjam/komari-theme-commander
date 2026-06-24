import { useEffect, useRef } from 'react';
import { useTranslation } from 'react-i18next';
import { ArrowUp, ArrowDown, Cpu, Clock } from 'lucide-react';
import { WebSocketStatus } from '@/components/WebSocketStatus';
import { useAppConfig } from '@/hooks/useAppConfig';
import { formatSpeed, cn } from '@/lib/utils';

function FooterSep({ className }: { className?: string }) {
  return (
    <span
      aria-hidden
      className={cn(
        'inline-flex items-center self-center leading-none text-muted-foreground/30 select-none shrink-0',
        className,
      )}
    >
      |
    </span>
  );
}

function FooterLocalClock() {
  const { t } = useTranslation();
  const mobileRef = useRef<HTMLSpanElement>(null);
  const timeRef = useRef<HTMLSpanElement>(null);
  const fullRef = useRef<HTMLSpanElement>(null);
  const tzRef = useRef<HTMLSpanElement>(null);

  useEffect(() => {
    const pad = (n: number) => String(n).padStart(2, '0');
    const tick = () => {
      const d = new Date();
      const date = `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
      const time = `${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`;
      const timeShort = `${pad(d.getHours())}:${pad(d.getMinutes())}`;
      if (mobileRef.current) mobileRef.current.textContent = timeShort;
      if (timeRef.current) timeRef.current.textContent = time;
      if (fullRef.current) fullRef.current.textContent = `${date} ${time}`;
      if (tzRef.current) {
        try {
          const tz = new Intl.DateTimeFormat(undefined, { timeZoneName: 'short' })
            .formatToParts(d)
            .find(part => part.type === 'timeZoneName')?.value;
          tzRef.current.textContent = tz ?? t('hud.local');
        } catch {
          tzRef.current.textContent = t('hud.local');
        }
      }
    };
    tick();

    let id: ReturnType<typeof setInterval> | null = null;
    const start = () => {
      if (id != null) return;
      id = setInterval(tick, 1000);
    };
    const stop = () => {
      if (id == null) return;
      clearInterval(id);
      id = null;
    };
    const onVisibility = () => {
      if (document.hidden) {
        stop();
      } else {
        tick();
        start();
      }
    };

    if (!document.hidden) start();
    document.addEventListener('visibilitychange', onVisibility);
    return () => {
      stop();
      document.removeEventListener('visibilitychange', onVisibility);
    };
  }, [t]);

  return (
    <>
      <div
        className="flex md:hidden items-center gap-1 font-metric tabular-nums text-muted-foreground/80 shrink-0 leading-none"
        title={t('hud.local')}
        aria-live="polite"
        aria-atomic="true"
      >
        <Clock className="h-3 w-3 shrink-0 text-muted-foreground/55" aria-hidden />
        <span ref={mobileRef} className="text-foreground/75 leading-none" />
      </div>
      <div
        className="hidden md:flex items-center gap-1.5 font-metric tabular-nums text-muted-foreground/80 shrink-0 leading-none"
        aria-live="polite"
        aria-atomic="true"
      >
        <Clock className="h-3 w-3 shrink-0 text-muted-foreground/55" aria-hidden />
        <span
          ref={tzRef}
          className="font-mono uppercase tracking-wider text-muted-foreground/55 leading-none"
        >
          {t('hud.local')}
        </span>
        <span ref={timeRef} className="lg:hidden text-foreground/75 leading-none" />
        <span ref={fullRef} className="hidden lg:inline text-foreground/75 leading-none" />
      </div>
    </>
  );
}

interface FooterFleetMetricsProps {
  avgCpu: number;
  totalUp: number;
  totalDown: number;
}

function FooterFleetMetrics({ avgCpu, totalUp, totalDown }: FooterFleetMetricsProps) {
  const { t } = useTranslation();
  const cpuTone =
    avgCpu < 60 ? 'text-success' : avgCpu < 85 ? 'text-warning' : 'text-destructive';
  const upLabel = t('label.netUp');
  const downLabel = t('label.netDown');

  return (
    <div
      className="flex flex-wrap items-center gap-x-2 gap-y-0.5 sm:gap-x-3 min-w-0 leading-none"
      aria-label={`${t('hud.avgCpu')} ${avgCpu.toFixed(0)}%, ${upLabel} ${formatSpeed(totalUp)}, ${downLabel} ${formatSpeed(totalDown)}`}
    >
      <div className="flex items-center gap-1 sm:gap-1.5 shrink-0">
        <Cpu className={cn('h-3 w-3 shrink-0 opacity-70', cpuTone)} aria-hidden />
        <span className="hidden sm:inline text-muted-foreground/60 uppercase tracking-[0.12em] sm:tracking-[0.16em]">
          {t('hud.avgCpu')}
        </span>
        <span className={cn('font-metric tracking-normal normal-case', cpuTone)}>
          {avgCpu.toFixed(0)}%
        </span>
      </div>
      <div className="flex items-center gap-1.5 sm:gap-2 shrink-0 min-w-0">
        <div className="flex items-center gap-0.5 sm:gap-1 shrink-0">
          <ArrowUp className="h-3 w-3 text-success/80 shrink-0" aria-hidden />
          <span className="hidden lg:inline text-muted-foreground/60 uppercase tracking-[0.12em]">
            {upLabel}
          </span>
          <span className="font-metric text-success tracking-normal normal-case">
            {formatSpeed(totalUp)}
          </span>
        </div>
        <span className="text-muted-foreground/25 sm:hidden" aria-hidden>·</span>
        <div className="flex items-center gap-0.5 sm:gap-1 shrink-0">
          <ArrowDown className="h-3 w-3 text-primary/80 shrink-0" aria-hidden />
          <span className="hidden lg:inline text-muted-foreground/60 uppercase tracking-[0.12em]">
            {downLabel}
          </span>
          <span className="font-metric text-primary tracking-normal normal-case">
            {formatSpeed(totalDown)}
          </span>
        </div>
      </div>
    </div>
  );
}

interface AppFooterProps {
  avgCpu: number;
  cpuSampled: number;
  totalUp: number;
  totalDown: number;
  customBody: string;
  version: string;
  customFooter?: string;
  showFooterMetaOnMobile: boolean;
}

export function AppFooter({
  avgCpu,
  cpuSampled,
  totalUp,
  totalDown,
  customBody,
  version,
  customFooter,
  showFooterMetaOnMobile,
}: AppFooterProps) {
  const { t } = useTranslation();
  const appConfig = useAppConfig();

  return (
    <footer className="sticky bottom-0 z-40 border-t border-border/50 bg-background/85 backdrop-blur-xl relative pb-safe">
      <div className="footer-neon-line" />
      <div className="container mx-auto flex min-h-9 items-center px-3 sm:px-4 py-1.5 sm:py-2">
        <div className="flex w-full flex-col gap-1.5 sm:flex-row sm:flex-wrap sm:items-center sm:justify-between sm:gap-x-4 sm:gap-y-1 text-xxs sm:text-xs font-mono leading-none text-muted-foreground">
          <div className="flex min-h-[1.125rem] flex-wrap items-center gap-x-2 sm:gap-x-3 gap-y-1 min-w-0 w-full sm:w-auto sm:flex-1">
            <WebSocketStatus />
            <FooterSep />
            <FooterLocalClock />
            {cpuSampled > 0 && (
              <>
                <FooterSep />
                <FooterFleetMetrics
                  avgCpu={avgCpu}
                  totalUp={totalUp}
                  totalDown={totalDown}
                />
              </>
            )}
          </div>
          <div className={cn(
            'flex min-h-[1.125rem] flex-wrap items-center gap-x-2 gap-y-0.5 shrink-0 w-full sm:w-auto justify-between sm:justify-end',
            !showFooterMetaOnMobile && 'hidden sm:flex',
          )}>
          {customBody ? (
            <span className="hidden sm:inline leading-none" dangerouslySetInnerHTML={{ __html: customBody }} />
          ) : (
            <>
              <span className="hidden sm:inline leading-none">
                {t('footer.poweredBy')}{' '}
                <a
                  href="https://github.com/komari-monitor/komari"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-primary hover:underline"
                >
                  Komari Monitor
                </a>
              </span>
              {appConfig.isLoggedIn && version && (
                <>
                  <FooterSep className="hidden sm:inline-flex" />
                  <span className="font-metric tabular-nums text-muted-foreground/60 leading-none">{version}</span>
                </>
              )}
              <FooterSep className="hidden sm:inline-flex" />
              <span className="hidden sm:inline leading-none">
                {t('footer.theme')}{' '}
                <a
                  href="https://github.com/wayjam/komari-theme-commander"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-primary hover:underline"
                >
                  Commander
                </a>
              </span>
            </>
          )}
          {customFooter && (
            <>
              <FooterSep className="hidden sm:inline-flex" />
              <span className="hidden sm:inline text-muted-foreground/60 leading-none">{customFooter}</span>
            </>
          )}
          </div>
        </div>
      </div>
    </footer>
  );
}
