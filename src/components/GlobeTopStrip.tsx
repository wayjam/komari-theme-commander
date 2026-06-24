import { memo, useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { Radio, AlertTriangle, ShieldCheck, MapPinned, Pause, Play } from 'lucide-react';
import type { NodeWithStatus } from '@/services/api';
import { computeGlobeFleetStats } from '@/lib/globeFleetStats';

interface GlobeTopStripProps {
  nodes: NodeWithStatus[];
  autoRotate: boolean;
  onStartRotation: () => void;
  onStopRotation: () => void;
}

/**
 * Top KPI strip — the "Mission Ops" header.
 * Single horizontal row, monospace, terminal-style separators.
 * Collapses gracefully on narrow viewports.
 *
 * Note on omissions (intentional — avoid duplicate signals already shown elsewhere):
 *  - FLOW (aggregate IN/OUT) + fleet CPU → covered by the site footer.
 *  - FLEET (online/total)                → covered by the right sidebar status block.
 *  This strip focuses on rotation control, mapped region count, and alert tally.
 */
export const GlobeTopStrip = memo(function GlobeTopStrip({
  nodes,
  autoRotate,
  onStartRotation,
  onStopRotation,
}: GlobeTopStripProps) {
  const { t } = useTranslation();
  const stats = useMemo(() => computeGlobeFleetStats(nodes), [nodes]);

  return (
    <div className="globe-top-strip relative w-full px-3 sm:px-4 py-1 flex items-center gap-3 sm:gap-4 text-xs font-mono uppercase tracking-[0.18em] overflow-hidden">
      {/* Brand segment — always visible */}
      <div className="flex items-center gap-2 shrink-0">
        <span className="relative inline-flex items-center justify-center">
          <span className="absolute inline-block w-1.5 h-1.5 rounded-full bg-primary motion-safe:animate-ping opacity-60" />
          <Radio className="h-3 w-3 text-primary/80" />
        </span>
        <span className="text-primary/80 font-display">{t('hud.missionOps')}</span>
      </div>

      {/* Spacer */}
      <div className="flex-1 min-w-0" />

      {stats.regionCount > 0 && (
        <div className="hidden sm:flex items-center gap-2 shrink-0">
          <MapPinned className="h-3 w-3 text-primary/75" />
          <span className="text-muted-foreground/60">{t('hud.regions')}</span>
          <span className="font-metric tracking-normal text-foreground/85">
            {stats.regionCount}
          </span>
        </div>
      )}

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

      <Sep className="hidden sm:inline" />

      {/* Rotation control — far right of Mission Ops row */}
      {autoRotate ? (
        <button
          type="button"
          onClick={onStopRotation}
          className="globe-rotation-btn shrink-0"
          aria-label={t('hud.stopRotation')}
        >
          <Pause className="size-3" aria-hidden />
          <span>{t('hud.stopRotation')}</span>
        </button>
      ) : (
        <button
          type="button"
          onClick={onStartRotation}
          className="globe-rotation-btn shrink-0"
          aria-label={t('hud.startRotation')}
        >
          <Play className="size-3" aria-hidden />
          <span>{t('hud.startRotation')}</span>
        </button>
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
