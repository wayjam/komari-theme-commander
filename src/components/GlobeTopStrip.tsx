import { memo, useEffect, useState, useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { Radio, Clock, Cpu, AlertTriangle, ShieldCheck } from 'lucide-react';
import type { NodeWithStatus } from '@/services/api';

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
 */
export const GlobeTopStrip = memo(function GlobeTopStrip({ nodes }: GlobeTopStripProps) {
  const { t } = useTranslation();
  const [now, setNow] = useState(() => new Date());

  useEffect(() => {
    const id = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(id);
  }, []);

  const stats = useMemo(() => {
    let cpuSum = 0;
    let cpuCount = 0;
    let critical = 0;

    for (const n of nodes) {
      if (n.status === 'online' && n.stats) {
        cpuSum += n.stats.cpu.usage;
        cpuCount++;
        const ramPct = n.stats.ram.total > 0 ? (n.stats.ram.used / n.stats.ram.total) * 100 : 0;
        if (n.stats.cpu.usage > 90 || ramPct > 95) critical++;
      }
    }

    const avgCpu = cpuCount > 0 ? cpuSum / cpuCount : 0;
    return { avgCpu, critical, sampled: cpuCount };
  }, [nodes]);

  const utc = `${String(now.getUTCFullYear())}-${String(now.getUTCMonth() + 1).padStart(2, '0')}-${String(now.getUTCDate()).padStart(2, '0')} ${String(now.getUTCHours()).padStart(2, '0')}:${String(now.getUTCMinutes()).padStart(2, '0')}:${String(now.getUTCSeconds()).padStart(2, '0')}Z`;

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

      {/* UTC clock */}
      <div className="flex items-center gap-2 shrink-0">
        <Clock className="h-3 w-3 text-muted-foreground/55" />
        <span className="text-muted-foreground/60">{t('hud.utc')}</span>
        <span className="font-metric text-foreground/85 tracking-normal normal-case">{utc}</span>
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
