import { useState, useEffect, useRef, useCallback, memo } from 'react';
// Note: useState retained for selectedNodeId; useRef now used by FrameCounter for direct DOM writes.
import { useTranslation } from 'react-i18next';
import { Globe } from '@/components/Globe';
import { Sidebar } from '@/components/Sidebar';
import { HudSpinner } from './HudSpinner';
import { GlobeTopStrip } from './GlobeTopStrip';
import { GlobeTelemetryFeed } from './GlobeTelemetryFeed';
import { useTheme } from '@/hooks/useTheme';
import type { NodeWithStatus } from '@/services/api';

interface GlobeViewProps {
  nodes: NodeWithStatus[];
  loading?: boolean;
  onViewCharts: (uuid: string, name: string) => void;
}

export function GlobeView({ nodes, loading = false, onViewCharts }: GlobeViewProps) {
  const { t } = useTranslation();
  const { resolvedTheme } = useTheme();
  const [selectedNodeId, setSelectedNodeId] = useState<string | null>(null);
  const clearSelection = useCallback(() => setSelectedNodeId(null), []);

  // Feed enabled on themes with HUD aesthetic. Clean theme stays minimal.
  const showFeed = resolvedTheme === 'deepspace' || resolvedTheme === 'lumina';

  // Threats list (recomputed every render — small N, cheap)
  const threats = nodes
    .filter(
      n =>
        n.status === 'online' &&
        ((n.stats?.cpu.usage ?? 0) > 90 ||
          (n.stats ? n.stats.ram.used / n.stats.ram.total > 0.95 : false)),
    )
    .slice(0, 3);

  return (
    <div className="relative z-10 flex flex-col lg:flex-row gap-4 lg:gap-5 w-full h-[calc(100vh-theme(spacing.10)-theme(spacing.8)-theme(spacing.9)-2rem)] sm:h-[calc(100vh-theme(spacing.12)-theme(spacing.9)-3rem)]">
      {/* Globe column — Top strip + Stage + Bottom feed */}
      {/* `min-w-0` is critical: stops nowrap children (top strip, telemetry feed)
          from inflating this flex item's intrinsic width and breaking layout. */}
      <div className="flex-1 min-w-0 flex flex-col min-h-0 relative commander-corners z-30">
        <span className="corner-bottom" />

        {/* ① Top KPI Strip */}
        <GlobeTopStrip nodes={nodes} />

        {/* ② Stage (globe + ambient layers) */}
        <div className="relative flex-1 min-w-0 min-h-0 flex items-center justify-center overflow-hidden">
          {/* DeepSpace ambient */}
          {resolvedTheme === 'deepspace' && (
            <>
              <div className="deepspace-nebula" />
              <div className="deepspace-grid" />
              <div className="deepspace-circles" style={{ width: '90%', height: '90%' }} />
              <div
                className="deepspace-circles"
                style={{ width: '70%', height: '70%', animationDelay: '-5s' }}
              />
            </>
          )}

          {/* Lumina ambient */}
          {resolvedTheme === 'lumina' && (
            <>
              <div className="lumina-hex-grid" />
              <div className="lumina-orbit" style={{ width: '85%', height: '85%' }} />
              <div
                className="lumina-orbit lumina-orbit-reverse"
                style={{ width: '65%', height: '65%', animationDelay: '-3s' }}
              />
              <div className="lumina-pulse-ring" />
            </>
          )}

          {/* Radar background */}
          <div className="absolute inset-0 flex items-center justify-center overflow-hidden pointer-events-none">
            <div className="radar-scan" />
            <div className="absolute w-[60%] aspect-square border border-primary/10 rounded-full" />
            <div className="absolute w-[40%] aspect-square border border-primary/10 rounded-full" />
            <div className="absolute w-[20%] aspect-square border border-primary/10 rounded-full" />
          </div>

          {/* Cardinal markers — N / E / S / W */}
          <CardinalMarkers />

          {/* Sector + Frame counter (mission-control chrome) */}
          <div className="absolute top-3 left-3 z-20 pointer-events-none text-xs font-mono text-primary/45 uppercase tracking-[0.22em]">
            ▌{t('hud.sector')} ALPHA
          </div>
          <FrameCounter />

          {/* Threats — top right (compact, single column) */}
          {threats.length > 0 && (
            <div className="absolute top-3 right-3 z-20 pointer-events-none text-right">
              <div className="text-xs font-mono text-destructive/75 uppercase tracking-[0.22em] mb-1.5 flex items-center gap-2 justify-end">
                <span className="w-1.5 h-1.5 rounded-full bg-destructive motion-safe:animate-pulse" />
                {t('hud.activeThreats')}
              </div>
              <div className="space-y-1">
                {threats.map(node => (
                  <div
                    key={node.uuid}
                    className="text-xxs font-mono text-destructive/70 flex gap-2 items-center justify-end"
                  >
                    <span className="motion-safe:animate-pulse">{t('hud.criticalLoad')}{' << '}</span>
                    <span className="bg-destructive/10 px-1.5 py-0.5 border border-destructive/30">
                      {node.name.substring(0, 12)}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Globe canvas */}
          <Globe
            nodes={nodes}
            theme={resolvedTheme}
            selectedNodeId={selectedNodeId}
            onSelectNode={setSelectedNodeId}
            onClearSelection={clearSelection}
            className="w-full h-full"
          />

          {/* Loading overlay */}
          {loading && nodes.length === 0 && (
            <div className="absolute inset-0 z-30 flex flex-col items-center justify-center gap-4 bg-background/30 backdrop-blur-sm">
              <HudSpinner size="lg" />
              <div className="text-xs font-mono text-primary/60 uppercase tracking-[0.15em]">
                {t('telemetry.acquiring')}
              </div>
            </div>
          )}
        </div>

        {/* ③ Bottom Telemetry Feed */}
        <GlobeTelemetryFeed nodes={nodes} enabled={showFeed} />
      </div>

      {/* Sidebar */}
      <Sidebar
        nodes={nodes}
        loading={loading}
        selectedNodeId={selectedNodeId}
        onSelectNode={setSelectedNodeId}
        onViewCharts={onViewCharts}
        className="w-full lg:w-[22rem] h-[50%] sm:h-[55%] lg:h-full shrink-0"
      />
    </div>
  );
}

/* ─────────── Cardinal markers (N/E/S/W) ─────────── */
const CARDINALS = [
  { label: 'N', pos: 'top-2 left-1/2 -translate-x-1/2' },
  { label: 'S', pos: 'bottom-2 left-1/2 -translate-x-1/2' },
  { label: 'W', pos: 'left-2 top-1/2 -translate-y-1/2' },
  { label: 'E', pos: 'right-2 top-1/2 -translate-y-1/2' },
] as const;

const CardinalMarkers = memo(function CardinalMarkers() {
  return (
    <div className="absolute inset-0 pointer-events-none z-10 hidden sm:block">
      {CARDINALS.map(({ label, pos }) => (
        <span
          key={label}
          className={`absolute ${pos} text-xxs font-mono text-primary/40 tracking-[0.3em]`}
        >
          {label}
        </span>
      ))}
    </div>
  );
});

/* ─────────── Fake frame counter (mission-control flair) ───────────
 * Updates 1×/s. Originally used setState which forced a per-second
 * re-render of GlobeView. Now writes directly into a span via ref so
 * the React tree is untouched on tick. Also pauses while page hidden. */
const FrameCounter = memo(function FrameCounter() {
  const frameRef = useRef<HTMLSpanElement>(null);
  const startRef = useRef(Date.now());
  useEffect(() => {
    const tick = () => {
      const el = frameRef.current;
      if (!el) return;
      const frame = Math.floor((Date.now() - startRef.current) / 1000) * 24;
      el.textContent = `FRAME ${String(frame).padStart(6, '0')}`;
    };
    tick();
    let id: ReturnType<typeof setInterval> | null = null;
    const start = () => { if (id == null) id = setInterval(tick, 1000); };
    const stop = () => { if (id != null) { clearInterval(id); id = null; } };
    const onVis = () => {
      if (document.hidden) {
        stop();
      } else {
        tick();
        start();
      }
    };
    if (!document.hidden) start();
    document.addEventListener('visibilitychange', onVis);
    return () => { stop(); document.removeEventListener('visibilitychange', onVis); };
  }, []);
  return (
    <div className="absolute bottom-3 right-3 z-20 pointer-events-none text-right text-xxs font-mono text-primary/40 uppercase tracking-[0.22em]">
      <span ref={frameRef} className="font-metric tracking-normal normal-case">FRAME 000000</span>
      <span className="mx-1.5 text-primary/25">·</span>
      <span className="font-metric tracking-normal normal-case">24FPS</span>
    </div>
  );
});
