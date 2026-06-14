import { memo, useEffect, useRef, useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { Radio, Clock, Cpu, AlertTriangle, ShieldCheck, ArrowDown, ArrowUp } from 'lucide-react';
import type { NodeWithStatus } from '@/services/api';
import { formatSpeed } from '@/lib/utils';

interface GlobeTopStripProps {
  nodes: NodeWithStatus[];
}

/**
 * Top KPI strip — the "Mission Ops" header.
 * Single horizontal row, monospace, terminal-style separators.
 * Collapses gracefully on narrow viewports.
 *
 * Note on omissions (intentional — avoid duplicate signals already shown elsewhere):
 *  - FLOW (aggregate IN/OUT) → covered by the bottom telemetry feed (per-node rates).
 *  - FLEET (online/total)    → covered by the right sidebar status block.
 *  This strip focuses on the two things NOT shown in chrome elsewhere:
 *  the live UTC clock and average fleet CPU pressure, plus a critical-alert tally.
 *
 * Performance:
 *  - The UTC clock ticks every second. Originally that was a setState, which
 *    forced a full re-render of this component (and its useMemo over nodes)
 *    once per second — competing with cobe's RAF. Now the clock is written
 *    directly into a span via ref, so the React tree is untouched on tick.
 *  - The interval also pauses while the page is hidden, dropping the
 *    background CPU floor to ~0.
 */
export const GlobeTopStrip = memo(function GlobeTopStrip({ nodes }: GlobeTopStripProps) {
  const { t } = useTranslation();
  const utcRef = useRef<HTMLSpanElement>(null);

  useEffect(() => {
    const tick = () => {
      const el = utcRef.current;
      if (!el) return;
      const d = new Date();
      el.textContent = `${String(d.getUTCFullYear())}-${String(d.getUTCMonth() + 1).padStart(2, '0')}-${String(d.getUTCDate()).padStart(2, '0')} ${String(d.getUTCHours()).padStart(2, '0')}:${String(d.getUTCMinutes()).padStart(2, '0')}:${String(d.getUTCSeconds()).padStart(2, '0')}Z`;
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
  }, []);

  const stats = useMemo(() => {
    let cpuSum = 0;
    let cpuCount = 0;
    let critical = 0;
    let totalUp = 0;
    let totalDown = 0;

    for (const n of nodes) {
      if (n.status === 'online' && n.stats) {
        cpuSum += n.stats.cpu.usage;
        cpuCount++;
        totalUp += n.stats.network.up;
        totalDown += n.stats.network.down;
        const ramPct = n.stats.ram.total > 0 ? (n.stats.ram.used / n.stats.ram.total) * 100 : 0;
        if (n.stats.cpu.usage > 90 || ramPct > 95) critical++;
      }
    }

    const avgCpu = cpuCount > 0 ? cpuSum / cpuCount : 0;
    return { avgCpu, critical, sampled: cpuCount, totalUp, totalDown };
  }, [nodes]);

  const cpuTone =
    stats.avgCpu < 60 ? 'text-success' : stats.avgCpu < 85 ? 'text-warning' : 'text-destructive';

  return (
    <div className="globe-top-strip relative w-full px-3 sm:px-4 py-2 flex items-center gap-3 sm:gap-4 text-xs font-mono uppercase tracking-[0.18em] overflow-hidden">
      {/* Brand segment — always visible */}
      <div className="flex items-center gap-2 shrink-0">
        <span className="relative inline-flex items-center justify-center">
          <span className="absolute inline-block w-1.5 h-1.5 rounded-full bg-primary motion-safe:animate-ping opacity-60" />
          <Radio className="h-3 w-3 text-primary/80" />
        </span>
        <span className="text-primary/80 font-display">{t('hud.missionOps')}</span>
      </div>

      <Sep />

      {/* UTC clock — written directly via ref to avoid per-second React renders */}
      <div className="flex items-center gap-2 shrink-0">
        <Clock className="h-3 w-3 text-muted-foreground/55" />
        <span className="text-muted-foreground/60">{t('hud.utc')}</span>
        <span
          ref={utcRef}
          className="font-metric text-foreground/85 tracking-normal normal-case"
        />
      </div>

      <Sep className="hidden sm:block" />

      {/* Avg CPU */}
      {stats.sampled > 0 && (
        <div className="hidden sm:flex items-center gap-2 shrink-0">
          <Cpu className={`h-3 w-3 ${cpuTone} opacity-70`} />
          <span className="text-muted-foreground/60">{t('hud.avgCpu')}</span>
          <span className={`font-metric tracking-normal ${cpuTone}`}>
            {stats.avgCpu.toFixed(0)}%
          </span>
        </div>
      )}

      {stats.sampled > 0 && (
        <div className="hidden md:flex items-center gap-2 shrink-0">
          <ArrowUp className="h-3 w-3 text-success/80" />
          <span className="text-muted-foreground/60">{t('label.netUp')}</span>
          <span className="font-metric text-success tracking-normal normal-case">
            {formatSpeed(stats.totalUp)}
          </span>
          <ArrowDown className="ml-1 h-3 w-3 text-primary/80" />
          <span className="text-muted-foreground/60">{t('label.netDown')}</span>
          <span className="font-metric text-primary tracking-normal normal-case">
            {formatSpeed(stats.totalDown)}
          </span>
        </div>
      )}

      {/* Spacer */}
      <div className="flex-1 min-w-0" />

      {/* Critical counter — always shown when present */}
      {stats.critical > 0 ? (
        <div className="flex items-center gap-2 shrink-0">
          <AlertTriangle className="h-3 w-3 text-destructive motion-safe:animate-pulse" />
          <span className="text-destructive/85">{t('hud.alert')}</span>
          <span className="font-metric tracking-normal text-destructive">
            {String(stats.critical).padStart(2, '0')}
          </span>
        </div>
      ) : (
        <div className="hidden sm:flex items-center gap-2 shrink-0">
          <ShieldCheck className="h-3 w-3 text-success" />
          <span className="text-success/80">{t('hud.nominal')}</span>
        </div>
      )}
    </div>
  );
});

function Sep({ className = '' }: { className?: string }) {
  return (
    <span
      aria-hidden
      className={`text-primary/25 select-none ${className}`}
    >
      ║
    </span>
  );
}
