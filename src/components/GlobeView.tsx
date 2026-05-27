import { useState, useEffect, useRef, useCallback, memo } from 'react';
// Note: useState retained for selectedNodeId; useRef now used by FrameCounter for direct DOM writes.
import { useTranslation } from 'react-i18next';
import type { TFunction } from 'i18next';
import { Globe } from '@/components/Globe';
import { Sidebar } from '@/components/Sidebar';
import { HudSpinner } from './HudSpinner';
import { GlobeTopStrip } from './GlobeTopStrip';
import { GlobeTelemetryFeed } from './GlobeTelemetryFeed';
import { useTheme } from '@/hooks/useTheme';
import type { VisualTheme } from '@/hooks/useTheme';
import { useAppConfig } from '@/hooks/useAppConfig';
import type { NodeWithStatus } from '@/services/api';

interface GlobeViewProps {
  nodes: NodeWithStatus[];
  loading?: boolean;
  onViewCharts: (uuid: string, name: string) => void;
  /** UUID of the hub node configured via `theme_settings.globe_hub_node`.
   *  Forwarded to the Globe component so it can draw hub-and-spoke arcs.
   *  `null` (the default) disables arcs. */
  hubNodeUuid?: string | null;
}

export function GlobeView({ nodes, loading = false, onViewCharts, hubNodeUuid = null }: GlobeViewProps) {
  const { t } = useTranslation();
  const { resolvedTheme } = useTheme();
  const { themeConfig } = useAppConfig();
  const [selectedNodeId, setSelectedNodeId] = useState<string | null>(null);
  const clearSelection = useCallback(() => setSelectedNodeId(null), []);

  // Feed enabled on themes with HUD aesthetic. Clean theme stays minimal.
  const showFeed = resolvedTheme === 'deepspace' || resolvedTheme === 'lumina';

  /* Threats list — top-3 nodes either spiking CPU or starving RAM.
   * Single-pass scan with early exit; small N, microsecond cost. Not
   * memoised because the result is only consumed inline in this render's
   * JSX (no memoed child receives it as a prop), so reference stability
   * wouldn't buy us anything. */
  const threats: NodeWithStatus[] = [];
  for (const n of nodes) {
    if (n.status !== 'online' || !n.stats) continue;
    const cpu = n.stats.cpu.usage;
    const ram = n.stats.ram.total > 0 ? n.stats.ram.used / n.stats.ram.total : 0;
    if (cpu > 90 || ram > 0.95) {
      threats.push(n);
      if (threats.length >= 3) break;
    }
  }

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
          {/* All static decoration (ambient, radar, cardinals, sector label,
              frame counter) is grouped in a memoed sub-component so the WS
              tick that mints a new `nodes` array doesn't cause React to
              re-evaluate ~15 div elements + className concat + style
              objects every 2s. They depend only on theme + locale. */}
          <StageChrome theme={resolvedTheme} t={t} />

          {/* Threats — top right (compact, single column).
              Pulses are staggered by index so the four red elements (header
              dot + up to three rows) read as a rolling wave instead of a
              single synchronised blink. Same period, different phase. */}
          {threats.length > 0 && (
            <div className="absolute top-3 right-3 z-20 pointer-events-none text-right">
              <div className="text-xs font-mono text-destructive/75 uppercase tracking-[0.22em] mb-1.5 flex items-center gap-2 justify-end">
                <span className="w-1.5 h-1.5 rounded-full bg-destructive motion-safe:animate-pulse" />
                {t('hud.activeThreats')}
              </div>
              <div className="space-y-1">
                {threats.map((node, i) => {
                  const tag = node.name.length > 12
                    ? `${node.name.slice(0, 11)}…`
                    : node.name;
                  return (
                    <div
                      key={node.uuid}
                      className="text-xxs font-mono text-destructive/70 flex gap-2 items-center justify-end"
                    >
                      <span
                        className="motion-safe:animate-pulse"
                        style={{ animationDelay: `${(i + 1) * 0.2}s` }}
                      >
                        {t('hud.criticalLoad')}{' << '}
                      </span>
                      <span className="bg-destructive/10 px-1.5 py-0.5 border border-destructive/30">
                        {tag}
                      </span>
                    </div>
                  );
                })}
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
            hubNodeUuid={hubNodeUuid}
            respectReducedMotion={themeConfig.globe_respect_reduced_motion}
            className="w-full h-full"
          />

          {/* Loading overlay — letterspacing matches the rest of the stage
              chrome (sector label, threats, frame counter all at 0.22em) so
              the loading state doesn't read as a different typographic
              system from the panels it sits between. */}
          {loading && nodes.length === 0 && (
            <div className="absolute inset-0 z-30 flex flex-col items-center justify-center gap-4 bg-background/30 backdrop-blur-sm">
              <HudSpinner size="lg" />
              <div className="text-xs font-mono text-primary/60 uppercase tracking-[0.22em]">
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

/* ─────────── Static stage decoration ───────────
 * The DeepSpace / Lumina ambient layers, radar background, cardinal markers,
 * sector label and frame counter are all driven entirely by `theme` (and the
 * sector label by `t`). Pulled into a memoed sub-component so the every-2s
 * WS tick — which mutates `nodes` and thus re-renders `GlobeView` — doesn't
 * re-evaluate ~15 div elements with new className strings and style objects
 * just to produce the same DOM. React.memo with default shallow compare is
 * fine: `theme` is a primitive and `t` is stable for the session (only
 * changes on language switch).
 */
interface StageChromeProps {
  theme: VisualTheme;
  t: TFunction;
}

const StageChrome = memo(function StageChrome({ theme, t }: StageChromeProps) {
  return (
    <>
      {/* DeepSpace ambient */}
      {theme === 'deepspace' && (
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
      {theme === 'lumina' && (
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
    </>
  );
});

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
