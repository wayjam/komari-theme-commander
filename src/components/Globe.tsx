import { useEffect, useRef, useMemo, useCallback, useImperativeHandle, useState, forwardRef, memo } from 'react';
import { createPortal } from 'react-dom';
import createGlobe, { type Marker, type Arc } from 'cobe';
import type { NodeWithStatus } from '@/services/api';
import { extractRegionEmoji, extractRegionText } from '@/lib/utils';
import { getCoords } from '@/data/regionCoords';
import type { VisualTheme } from '@/hooks/useTheme';

interface GlobeProps {
  nodes: NodeWithStatus[];
  theme: VisualTheme;
  className?: string;
  selectedNodeId?: string | null;
  onSelectNode?: (uuid: string) => void;
  onClearSelection?: () => void;
  /** UUID of the configured "hub" node. When provided and the node is online,
   *  cobe v2 arcs are drawn from every other online region toward this hub.
   *  `null`/undefined disables arcs entirely. */
  hubNodeUuid?: string | null;
  /** Opt-in: when true, viewers whose system has `prefers-reduced-motion:
   *  reduce` enabled will see a static globe (no auto-rotation). Manual drag
   *  and selection slerp still work because those are explicit user intent.
   *  Default false: the globe always auto-rotates regardless of system
   *  motion preference. Driven by the `globe_respect_reduced_motion` theme
   *  setting so admins can decide per deployment whether to honour the OS
   *  signal. */
  respectReducedMotion?: boolean;
}

export interface GlobeHandle {
  rotateToLocation: (lat: number, lng: number) => void;
}

/* Per-theme cobe configuration.
 *
 * Each theme tunes a small set of non-color parameters in addition to the
 * three color triplets:
 *
 *   - `diffuse`         light directionality. Lumina stays low (soft
 *                       overcast); deepspace pushes higher for a clear
 *                       day/night terminator.
 *   - `markerElevation` height markers float above the surface. Only the
 *                       deepspace theme uses this to make markers feel
 *                       like satellites; lumina's CSS pulse layer does
 *                       the height work, so cobe markers stay flat.
 *   - `scale`           globe size relative to canvas. Deepspace shrinks
 *                       slightly so the surrounding void feels bigger.
 *
 * Arcs:
 *   - `enableArcs`      whether this theme may show hub-and-spoke arcs at
 *                       all. Clean stays minimal — even if the admin sets
 *                       `globe_hub_node`, arcs are suppressed here.
 *   - `arcColor`        per-theme tint of the data-stream lines. Lumina
 *                       gets a confident teal for legibility against the
 *                       light background; deepspace gets a neon mint that
 *                       reads as energy distinct from the cyan glow.
 */
const THEME_CONFIG = {
  lumina: {
    dark: 0 as const,
    baseColor: [0.82, 0.88, 0.95] as [number, number, number],
    glowColor: [0.6, 0.86, 1.0] as [number, number, number],
    markerColor: [0.12, 0.55, 0.72] as [number, number, number],
    // Brighter, more saturated teal than the marker color — arcs need extra
    // luminance to read as energy beams against the bright sphere.
    arcColor: [0.1, 0.62, 0.82] as [number, number, number],
    mapBrightness: 7,
    diffuse: 1.0,
    markerElevation: 0,
    scale: 1.0,
    enableArcs: true,
  },
  deepspace: {
    dark: 1 as const,
    baseColor: [0.15, 0.18, 0.28] as [number, number, number],
    glowColor: [0.0, 0.8, 1.0] as [number, number, number],
    markerColor: [0.0, 1.0, 0.9] as [number, number, number],
    // Slightly mint-shifted from the cyan glow so beams don't blend into
    // the halo — preserves the "data is moving" silhouette against the
    // ambient atmospheric glow.
    arcColor: [0.35, 1.0, 0.85] as [number, number, number],
    mapBrightness: 4.5,
    diffuse: 1.4,
    markerElevation: 0.012,
    scale: 0.98,
    enableArcs: true,
  },
  clean: {
    dark: 0 as const,
    baseColor: [0.9, 0.9, 0.92] as [number, number, number],
    glowColor: [0.85, 0.85, 0.9] as [number, number, number],
    markerColor: [0.3, 0.4, 0.8] as [number, number, number],
    arcColor: [0.3, 0.4, 0.8] as [number, number, number],
    mapBrightness: 6,
    diffuse: 1.2,
    markerElevation: 0,
    scale: 1.0,
    // Clean stays visually minimal — no telemetry arcs even when a hub
    // is configured. Admins who want arcs should use lumina/deepspace.
    enableArcs: false,
  },
};

/** Arc geometry — kept thin and low-profile so the lines read as "data
 *  beams" rather than rainbow trajectories. Width is multiplied by 0.005
 *  in cobe internally, so 0.7 ≈ 3.5px of line at default scale. Height of
 *  0.32 keeps the arc apex close to the surface so beams feel direct
 *  rather than ballistic. */
const ARC_WIDTH = 0.7;
const ARC_HEIGHT = 0.32;
/** Cap arcs so the globe stays legible — too many spokes turn into a star
 *  burst and lose the "directional traffic" feel. */
const MAX_ARCS = 8;

const OFFLINE_MARKER_COLOR: [number, number, number] = [1, 0.2, 0.2];
const MIXED_MARKER_COLOR: [number, number, number] = [1, 0.62, 0.16];
type RegionStatus = 'online' | 'mixed' | 'offline';

/**
 * Per-region aggregated marker. One per unique flag emoji.
 *
 * Why aggregate: nodes from the same country share coordinates. If we emit
 * one cobe marker per node, they stack on the same pixel — the last one
 * drawn always wins, so selecting any earlier node never showed visually
 * (its highlight was painted under siblings from the same country). cobe v2
 * also expects stable `id`s for CSS anchor positioning of HTML overlays, and
 * a per-region id maps naturally to "one anchor per visible dot".
 */
interface RegionMarker extends Marker {
  id: string;
  emoji: string;
  regionText: string;
  totalNodes: number;
  onlineNodes: number;
  status: RegionStatus;
  primaryNodeId: string;
  /** Aggregated upload / download speed (bytes per second) summed across
   *  every *online* node in this region. Zero for offline-only regions.
   *  Drives the small speed pill that floats below each marker while the
   *  hub-and-spoke arc system is active — gives viewers an at-a-glance
   *  sense of which spoke is actually moving data. */
  netUp: number;
  netDown: number;
  nodes: {
    uuid: string;
    name: string;
    status: 'online' | 'offline';
  }[];
}

/** Build a CSS-identifier-safe id from a flag emoji's two regional-indicator
 *  codepoints. `🇯🇵` → `region-1F1EF-1F1F5`. */
function emojiToId(emoji: string): string {
  const parts = [...emoji].map(ch => ch.codePointAt(0)!.toString(16).toUpperCase());
  return `region-${parts.join('-')}`;
}

function latLngToAngles(lat: number, lng: number): [number, number] {
  return [
    Math.PI - ((lng * Math.PI) / 180 - Math.PI / 2),
    (lat * Math.PI) / 180,
  ];
}

export const Globe = forwardRef<GlobeHandle, GlobeProps>(function Globe(
  {
    nodes,
    theme,
    className,
    selectedNodeId,
    onSelectNode,
    onClearSelection,
    hubNodeUuid = null,
    respectReducedMotion = false,
  },
  ref
) {
  // `canvasHostRef` is a stable square element we own. cobe will wrap our
  // canvas with its own `<div style="width:100%;height:100%;position:relative">`
  // — by hosting cobe inside a square parent, that wrapper inherits the
  // square size, which is critical because cobe's anchor positions are
  // computed as `left:X% top:Y%` of the wrapper. If the wrapper isn't the
  // same size as the canvas, every anchored HTML overlay drifts.
  const canvasHostRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const globeRef = useRef<ReturnType<typeof createGlobe> | null>(null);
  const phiRef = useRef(0);
  const thetaRef = useRef(0.15);
  const targetPhiRef = useRef<number | null>(null);
  const targetThetaRef = useRef<number | null>(null);
  const widthRef = useRef(0);
  const pointerInteracting = useRef<number | null>(null);
  const pointerInteractionMovement = useRef(0);
  // cobe v2 wraps the canvas in its own `<div style="position:relative">` at
  // init time and appends its anchor `<div>`s into that wrapper. Our
  // selection overlay must portal into that same wrapper for CSS
  // `position-anchor: --cobe-{id}` to resolve against cobe's anchors.
  const [cobeWrapper, setCobeWrapper] = useState<HTMLElement | null>(null);

  const rotateToLocation = useCallback((lat: number, lng: number) => {
    const [phi, theta] = latLngToAngles(lat, lng);
    targetPhiRef.current = phi;
    targetThetaRef.current = theta;
  }, []);

  useImperativeHandle(ref, () => ({ rotateToLocation }), [rotateToLocation]);

  /* ─────────── Build per-region markers ─────────── */
  const regionMarkers = useMemo<RegionMarker[]>(() => {
    const config = THEME_CONFIG[theme];
    const byEmoji = new Map<string, {
      emoji: string;
      regionText: string;
      location: [number, number];
      total: number;
      online: number;
      netUp: number;
      netDown: number;
      primaryNodeId: string;
      primaryNodeOnline: boolean;
      nodes: {
        uuid: string;
        name: string;
        status: 'online' | 'offline';
      }[];
    }>();

    for (const node of nodes) {
      const emoji = extractRegionEmoji(node.region);
      if (!emoji) continue;
      const coords = getCoords(emoji);
      if (coords[0] === 0 && coords[1] === 0) continue;

      // Only count traffic from online nodes — offline `stats` is stale by
      // definition, and including it would make the pill claim a region is
      // "moving data" when nothing is actually responding.
      const isOnline = node.status === 'online';
      const nodeUp = isOnline ? (node.stats?.network.up ?? 0) : 0;
      const nodeDown = isOnline ? (node.stats?.network.down ?? 0) : 0;

      const existing = byEmoji.get(emoji);
      if (existing) {
        existing.total += 1;
        existing.nodes.push({ uuid: node.uuid, name: node.name, status: node.status });
        if (isOnline) {
          existing.online += 1;
          existing.netUp += nodeUp;
          existing.netDown += nodeDown;
          if (!existing.primaryNodeOnline) {
            existing.primaryNodeId = node.uuid;
            existing.primaryNodeOnline = true;
          }
        }
      } else {
        byEmoji.set(emoji, {
          emoji,
          regionText: extractRegionText(node.region),
          location: coords,
          total: 1,
          online: isOnline ? 1 : 0,
          netUp: nodeUp,
          netDown: nodeDown,
          primaryNodeId: node.uuid,
          primaryNodeOnline: isOnline,
          nodes: [{ uuid: node.uuid, name: node.name, status: node.status }],
        });
      }
    }

    return Array.from(byEmoji.values()).map(r => {
      const status: RegionStatus =
        r.online === 0 ? 'offline' : r.online === r.total ? 'online' : 'mixed';
      return {
        id: emojiToId(r.emoji),
        location: r.location,
        // Keep marker dots close to the old 2D look: small, flat, and visually
        // attached to the globe. Node count still nudges size up slightly so
        // multi-node regions read as denser without becoming "floating beacons".
        // 1→0.024, 2→0.029, 5→0.036, 10→0.041.
        size: 0.024 + Math.log2(r.total) * 0.005,
        color: status === 'online'
          ? config.markerColor
          : status === 'mixed'
            ? MIXED_MARKER_COLOR
            : OFFLINE_MARKER_COLOR,
        emoji: r.emoji,
        regionText: r.regionText,
        totalNodes: r.total,
        onlineNodes: r.online,
        status,
        primaryNodeId: r.primaryNodeId,
        netUp: r.netUp,
        netDown: r.netDown,
        nodes: r.nodes,
      };
    });
  }, [nodes, theme]);

  /* ─────────── Resolve hub region ───────────
   * Single source of truth for "which region contains the configured hub
   * node?". Used both to (a) build the spoke arcs and (b) mark the hub's
   * RegionPulseOverlay with `.is-hub` for CSS-driven data-arrival pulse.
   * `null` whenever arcs are suppressed (no hub, hub offline/missing, or
   * the current theme disables arcs altogether).
   */
  const hubRegionId = useMemo<string | null>(() => {
    if (!THEME_CONFIG[theme].enableArcs) return null;
    if (!hubNodeUuid) return null;
    const hubRegion = regionMarkers.find(r =>
      r.nodes.some(n => n.uuid === hubNodeUuid),
    );
    return hubRegion?.id ?? null;
  }, [regionMarkers, hubNodeUuid, theme]);

  /* ─────────── Build arcs (cobe v2 feature) ───────────
   * Hub-and-spoke: every *other* online region draws an arc toward the hub
   * region. Arc ids are derived from the *origin* region so cobe doesn't
   * restart the animation when an unrelated region changes status — one
   * node going offline shouldn't make every other arc jump.
   */
  const arcs = useMemo<Arc[]>(() => {
    if (!hubRegionId) return [];
    const hubRegion = regionMarkers.find(r => r.id === hubRegionId);
    if (!hubRegion) return [];
    const result: Arc[] = [];
    for (const origin of regionMarkers) {
      if (origin.id === hubRegion.id) continue; // skip self-loop
      if (origin.status === 'offline') continue; // mixed is fine, dead is not
      result.push({
        from: origin.location,
        to: hubRegion.location,
        id: `arc-${origin.id}`,
      });
      if (result.length >= MAX_ARCS) break;
    }
    return result;
  }, [regionMarkers, hubRegionId]);

  /* ─────────── Selected node lookup (for overlay) ─────────── */
  const selectedRegion = useMemo(() => {
    if (!selectedNodeId) return null;
    const node = nodes.find(n => n.uuid === selectedNodeId);
    if (!node) return null;
    const emoji = extractRegionEmoji(node.region);
    if (!emoji) return null;
    const region = regionMarkers.find(m => m.emoji === emoji);
    if (!region) return null;
    const selectedIndex = Math.max(0, region.nodes.findIndex(n => n.uuid === selectedNodeId));
    const previousNode = region.nodes[(selectedIndex - 1 + region.nodes.length) % region.nodes.length];
    const nextNode = region.nodes[(selectedIndex + 1) % region.nodes.length];
    return {
      region,
      nodeName: node.name,
      nodeStatus: node.status,
      previousNodeId: previousNode.uuid,
      nextNodeId: nextNode.uuid,
    };
  }, [selectedNodeId, nodes, regionMarkers]);

  /* Refs used by the RAF loop (which is created once and must read latest
   * values without restarting). */
  const selectedNodeIdRef = useRef(selectedNodeId);
  selectedNodeIdRef.current = selectedNodeId;
  // Mirror the `respectReducedMotion` prop into a ref so toggling the theme
  // setting at runtime (or simply re-deriving it during a re-render) is
  // picked up by the long-lived RAF tick + media-query change handler
  // without tearing the cobe instance down. The handler re-reads this on
  // every `change` event and on every frame's `else if` branch.
  const respectReducedMotionRef = useRef(respectReducedMotion);
  respectReducedMotionRef.current = respectReducedMotion;
  // Mirror `nodes` into a ref so the auto-rotate effect can look up the
  // selected node's coordinates without re-firing every WS tick (every 2s).
  // Without this, the effect was re-depending on `nodes`, which meant every
  // websocket update re-armed the slerp toward the same target — wasted
  // work because the target hasn't actually moved.
  const nodesRef = useRef(nodes);
  nodesRef.current = nodes;

  /* ─────────── Auto-rotate to selected node ─────────── */
  // Only fires when the user *changes* selection. Reading nodes via ref
  // means a 2s WS tick (which mints a new `nodes` array even when no
  // status changed) doesn't restart the rotation animation.
  useEffect(() => {
    if (!selectedNodeId) return;
    const node = nodesRef.current.find(n => n.uuid === selectedNodeId);
    if (!node) return;
    const emoji = extractRegionEmoji(node.region);
    if (!emoji) return;
    const coords = getCoords(emoji);
    if (coords[0] === 0 && coords[1] === 0) return;
    rotateToLocation(coords[0], coords[1]);
  }, [selectedNodeId, rotateToLocation]);

  useEffect(() => {
    if (!selectedNodeId) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        onClearSelection?.();
      }
    };
    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [selectedNodeId, onClearSelection]);

  /* ─────────── Create globe (once on mount) ─────────── */
  useEffect(() => {
    const canvas = canvasRef.current;
    const host = canvasHostRef.current;
    if (!canvas || !host) return;

    const dpr = Math.min(window.devicePixelRatio, 2);
    // `host` is the square element we own. Its CSS already constrains it
    // to `min(parent.clientWidth, parent.clientHeight)` via aspect-ratio,
    // so reading clientWidth is enough (it's also the height).
    const size = host.clientWidth;
    widthRef.current = size;

    // mapSamples drives the per-frame dot count; 16k was overkill at the
    // sizes we render at. 8k on narrow viewports keeps per-pixel density
    // comparable while cutting GPU cost ~33%.
    const isNarrow = typeof window !== 'undefined' && window.innerWidth < 640;
    const mapSamples = isNarrow ? 8000 : 12000;

    const initialConfig = THEME_CONFIG[theme];

    const globe = createGlobe(canvas, {
      // v2 takes CSS pixels here (it multiplies by dpr internally) — the
      // 0.6.5 signature took pre-multiplied backing-buffer pixels. Don't
      // pre-multiply or you'll end up at 4× resolution and a blurry canvas
      // scaled down by `canvas.style.width`.
      devicePixelRatio: dpr,
      width: size,
      height: size,
      phi: phiRef.current,
      theta: thetaRef.current,
      dark: initialConfig.dark,
      diffuse: initialConfig.diffuse,
      mapSamples,
      mapBrightness: initialConfig.mapBrightness,
      baseColor: initialConfig.baseColor,
      markerColor: initialConfig.markerColor,
      glowColor: initialConfig.glowColor,
      markerElevation: initialConfig.markerElevation,
      scale: initialConfig.scale,
      markers: regionMarkers,
      // Arcs animate themselves. Initial array is whatever the useMemo
      // computed on first render — the dedicated update effect below pushes
      // any later changes (hub config / online regions).
      arcs,
      arcColor: initialConfig.arcColor,
      arcWidth: ARC_WIDTH,
      arcHeight: ARC_HEIGHT,
    });
    globeRef.current = globe;

    // Expose cobe's wrapper to React so the selection overlay can portal
    // into it (anchor `<div>`s live inside this wrapper).
    setCobeWrapper(canvas.parentElement);

    /* RAF loop. v2 removed `onRender` — caller drives the loop and pushes
     * camera state via `globe.update()`. We only push phi/theta here;
     * markers/theme/size each get their own dedicated useEffect so we don't
     * pay the per-frame cost of re-uploading data that hasn't changed.
     *
     * Why we render at the display refresh rate (60/120Hz) for auto-spin:
     *   An earlier revision throttled auto-spin to 30fps to halve cobe's
     *   per-frame cost. On 60Hz monitors that produced a textbook judder
     *   pattern — every other refresh shows the same frame, so a slow
     *   continuous rotation reads as a step-step-step stutter instead of
     *   smooth motion. Eyes are extremely sensitive to non-uniform motion
     *   at low fps. The fix is the inverse: don't fight the display, just
     *   skip whole-frame work when there's *truly* nothing to draw.
     *
     * The CPU-saving behaviors that remain:
     *
     *   1. **Idle frame skip.** If a node is selected (no auto-spin), no
     *      slerp in flight, and no drag, phi/theta haven't moved since
     *      last frame — calling `globe.update()` would do a full WebGL
     *      redraw + CSS-anchor reposition for nothing. We bail out before
     *      `globe.update()`. The rAF callback still fires (cheap branches).
     *
     *   2. **prefers-reduced-motion ⇒ no auto-spin (opt-in).** Disabled
     *      by default — the globe always rotates, because for many
     *      deployments the motion *is* the product. When the
     *      `globe_respect_reduced_motion` theme setting is enabled by the
     *      admin, viewers whose OS reports `prefers-reduced-motion: reduce`
     *      see a static globe (idle-skip branch above kicks in, per-frame
     *      cost drops to near zero). They can still drag manually and
     *      slerp on selection, both of which are explicit user intents.
     *
     *   3. **Visibility & viewport gates.** rAF is paused outright when
     *      the tab is hidden or the canvas scrolls offscreen — browsers
     *      already throttle hidden-tab rAF to ~1Hz, but each tick still
     *      ran cobe's full WebGL redraw + CSS-anchor write. Suspending
     *      entirely drops the floor to zero.
     *
     * The ~2s WebSocket tick separately tries to push markers/arcs into
     * cobe; we dedupe those via stable signatures further down so a
     * stats-only update doesn't cause a redundant WebGL upload.
     */
    let rafId = 0;
    const reduceMotionMQ =
      typeof window !== 'undefined' && typeof window.matchMedia === 'function'
        ? window.matchMedia('(prefers-reduced-motion: reduce)')
        : null;
    /* Auto-spin gating.
     *
     * Default: `autoSpin = true`. The globe rotates regardless of the OS
     * "reduce motion" setting, because for many deployments the rotating
     * globe *is* the product — a static one looks broken.
     *
     * Opt-in via `respectReducedMotion` (theme setting
     * `globe_respect_reduced_motion`): when ON *and* the visitor's OS
     * reports `prefers-reduced-motion: reduce`, we pause auto-spin. Manual
     * drag and selection slerp still work, so the globe is not "frozen" —
     * just calm.
     *
     * The decision is recomputed both on the MQ `change` event and on
     * every render via `respectReducedMotionRef`, so flipping the admin
     * switch (or the OS preference) takes effect immediately without
     * destroying the cobe instance. */
    const computeAutoSpin = () =>
      !(respectReducedMotionRef.current && (reduceMotionMQ?.matches ?? false));
    let autoSpin = computeAutoSpin();
    let visibilityPaused = typeof document !== 'undefined' && document.hidden;
    let inViewport = true;
    let running = false;

    const tick = () => {
      rafId = requestAnimationFrame(tick);

      const dragging = pointerInteracting.current !== null;
      const slerping =
        targetPhiRef.current !== null && targetThetaRef.current !== null;

      if (slerping) {
        const dphi = targetPhiRef.current! - phiRef.current;
        const dtheta = targetThetaRef.current! - thetaRef.current;
        phiRef.current += dphi * 0.08;
        thetaRef.current += dtheta * 0.08;
        if (Math.abs(dphi) < 0.001 && Math.abs(dtheta) < 0.001) {
          targetPhiRef.current = null;
          targetThetaRef.current = null;
        }
      } else if (!dragging && !selectedNodeIdRef.current) {
        // Default: per-frame auto-spin. Match display refresh so motion
        // reads smooth. The original 0.003 step at 60Hz (~0.18 rad/s) is
        // restored here; on 120Hz panels rAF fires twice as often and the
        // globe will appear to rotate ~2× faster, which is fine — that's
        // the same trade-off cobe's stock implementation makes.
        //
        // Re-evaluate `autoSpin` from the ref each frame so a runtime
        // toggle of the `globe_respect_reduced_motion` admin switch (or a
        // user flipping their OS reduce-motion preference) is picked up
        // without restarting the loop. This is a single ref read + bool
        // AND per frame — negligible cost.
        autoSpin = computeAutoSpin();
        if (autoSpin) phiRef.current += 0.003;
        else return; // reduced-motion (opt-in): behave like "selected idle" — no redraw
      } else if (!dragging) {
        // Selected + no slerp = idle. phi/theta unchanged since last frame
        // → the WebGL redraw would be visually identical. Skip it entirely.
        // This is the deepest CPU-saving branch and is the common state
        // while a user is reading a node's details.
        return;
      }
      // Dragging falls through with phi already mutated by handlePointerMove.

      globe.update({ phi: phiRef.current, theta: thetaRef.current });
    };

    const handleMotionChange = () => {
      autoSpin = computeAutoSpin();
    };
    reduceMotionMQ?.addEventListener?.('change', handleMotionChange);

    const start = () => {
      if (running) return;
      if (visibilityPaused) return;
      if (!inViewport) return;
      running = true;
      rafId = requestAnimationFrame(tick);
    };

    const stop = () => {
      if (!running) return;
      running = false;
      cancelAnimationFrame(rafId);
    };

    start();

    /* Visibility — explicit stop in addition to browser's rAF throttling.
     * Browsers throttle hidden tabs to ~1Hz, but cobe still does a full
     * WebGL redraw + CSS anchor write on each tick. Suspending entirely
     * drops the floor to zero. */
    const onVisibility = () => {
      visibilityPaused = document.hidden;
      if (visibilityPaused) stop();
      else start();
    };
    document.addEventListener('visibilitychange', onVisibility);

    /* IntersectionObserver — when the canvas scrolls out of view (or the
     * stage is hidden by another absolutely-positioned overlay), suspend
     * the loop. Uses a tiny rootMargin so we wake up just before the
     * canvas re-enters the viewport, avoiding a visible "first paint
     * lag" when scrolling back. */
    const intersectionObserver = new IntersectionObserver(
      entries => {
        for (const entry of entries) {
          inViewport = entry.isIntersecting;
        }
        if (inViewport) start();
        else stop();
      },
      { rootMargin: '64px', threshold: 0 },
    );
    intersectionObserver.observe(host);

    /* Resize. v2 supports live `update({ width, height })` so we no longer
     * destroy/rebuild the globe (which would have leaked cobe's wrapper
     * div on every resize anyway). */
    let resizeTimer: ReturnType<typeof setTimeout> | null = null;
    let lastSize = size;
    const resizeObserver = new ResizeObserver(() => {
      const newSize = host.clientWidth;
      if (newSize === lastSize || newSize === 0) return;
      lastSize = newSize;
      widthRef.current = newSize;
      // Debounce the WebGL viewport update so drag-resize doesn't thrash.
      if (resizeTimer) clearTimeout(resizeTimer);
      resizeTimer = setTimeout(() => {
        globe.update({ width: newSize, height: newSize });
      }, 200);
    });
    resizeObserver.observe(host);

    return () => {
      stop();
      document.removeEventListener('visibilitychange', onVisibility);
      reduceMotionMQ?.removeEventListener?.('change', handleMotionChange);
      intersectionObserver.disconnect();
      if (resizeTimer) clearTimeout(resizeTimer);
      resizeObserver.disconnect();
      // cobe.destroy() releases WebGL resources and removes the anchor
      // <div>s + injected <style> tag, but leaves the wrapper <div> in
      // place. The wrapper will be removed when React unmounts our parent
      // container in the same tick.
      globe.destroy();
      globeRef.current = null;
      setCobeWrapper(null);
    };
    // Globe is created exactly once. All later changes flow through
    // dedicated `globe.update({...})` effects below.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  /* When a node becomes/stops being selected, the RAF loop's "truly idle"
   * branch may have been skipping all redraws. After clearing selection we
   * resume auto-spin (which the loop already throttles), and after newly
   * selecting we want one fresh redraw so the slerp begins from the
   * current camera state. cobe internally only does work when `update()`
   * is called, so this nudge guarantees a paint. */
  useEffect(() => {
    globeRef.current?.update({});
  }, [selectedNodeId]);

  /* ─────────── Push marker updates ───────────
   *
   * `regionMarkers` is recomputed on every WS tick (every ~2s) because the
   * `nodes` array reference changes whenever any node's stats move. That
   * doesn't mean cobe has anything new to draw — markers only depend on
   * id / location / status / count, not CPU%. Compute a stable signature
   * and skip the WebGL upload + CSS-anchor recompute when it hasn't
   * changed. Each push goes through cobe's `te()`, which does:
   *   - Float32Array allocation + bufferData(DYNAMIC_DRAW)
   *   - per-marker `O()` projection math + DOM style writes for anchors
   *   - injected <style> textContent rebuild
   * — none of which is free at 30+ region count.
   */
  const markerSignature = useMemo(() => {
    let sig = '';
    for (const m of regionMarkers) {
      sig += `${m.id}:${m.status}:${m.totalNodes}:${m.onlineNodes}:${m.size.toFixed(3)}|`;
    }
    return sig;
  }, [regionMarkers]);

  useEffect(() => {
    globeRef.current?.update({ markers: regionMarkers });
    // Intentionally depend on the structural signature, not the array
    // reference — we don't want to re-upload markers just because the
    // parent rerendered with stat-only changes.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [markerSignature]);

  /* ─────────── Push arc updates (deepspace data-stream lines) ─────────── */
  const arcSignature = useMemo(() => {
    let sig = '';
    for (const a of arcs) {
      // `to` is fixed (the hub) but we include it for correctness on hub
      // changes; cheap relative to the rest of the work skipped.
      sig += `${a.id}:${a.from[0]},${a.from[1]}->${a.to[0]},${a.to[1]}|`;
    }
    return sig;
  }, [arcs]);

  useEffect(() => {
    globeRef.current?.update({ arcs });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [arcSignature]);

  /* ─────────── Push theme updates (no destroy/rebuild) ─────────── */
  useEffect(() => {
    const config = THEME_CONFIG[theme];
    globeRef.current?.update({
      dark: config.dark,
      diffuse: config.diffuse,
      mapBrightness: config.mapBrightness,
      baseColor: config.baseColor,
      markerColor: config.markerColor,
      glowColor: config.glowColor,
      markerElevation: config.markerElevation,
      scale: config.scale,
      arcColor: config.arcColor,
    });
  }, [theme]);

  /* ─────────── Pointer drag ───────────
   * Cursor mutation uses `currentTarget` (the canvas), not `target`. Once
   * cobe v2 paints anchored HTML overlays into the same wrapper, a pointer
   * event that began on the canvas may report a child overlay as `target`
   * if the drag finishes over one — writing `cursor` onto that child does
   * nothing useful and may even change the wrong element's cursor style.
   * `currentTarget` is always the canvas because that's where the handler
   * is bound. */
  const handlePointerDown = useCallback((e: React.PointerEvent<HTMLCanvasElement>) => {
    pointerInteracting.current = e.clientX;
    pointerInteractionMovement.current = 0;
    targetPhiRef.current = null;
    targetThetaRef.current = null;
    e.currentTarget.style.cursor = 'grabbing';
  }, []);

  const handlePointerMove = useCallback((e: React.PointerEvent<HTMLCanvasElement>) => {
    if (pointerInteracting.current === null) return;
    const delta = e.clientX - pointerInteracting.current;
    pointerInteractionMovement.current = delta;
    phiRef.current += delta / 200;
    pointerInteracting.current = e.clientX;
  }, []);

  const handlePointerUp = useCallback((e: React.PointerEvent<HTMLCanvasElement>) => {
    pointerInteracting.current = null;
    e.currentTarget.style.cursor = 'grab';
  }, []);

  const handleGlobeClick = useCallback((e: React.MouseEvent) => {
    if (!selectedNodeId) return;
    if (Math.abs(pointerInteractionMovement.current) > 3) return;
    const target = e.target as HTMLElement;
    if (target.closest('.globe-marker-hitbox')) return;
    onClearSelection?.();
  }, [selectedNodeId, onClearSelection]);

  const handleMarkerSelect = useCallback((uuid: string) => {
    onSelectNode?.(uuid);
  }, [onSelectNode]);

  return (
    <div className={`relative flex items-center justify-center ${className ?? ''}`}>
      {/* Stable square host. The aspect-ratio constraint + min sizing keeps
          the host a perfect square regardless of parent aspect ratio, so
          cobe's wrapper (and the canvas + anchor divs inside it) all share
          the same square coordinate space. Without this the parent's flex
          centering is defeated by cobe's `width:100%; height:100%` wrapper
          and the globe drifts to the upper-left corner. */}
      <div
        ref={canvasHostRef}
        className="relative"
        onClick={handleGlobeClick}
        style={{
          aspectRatio: '1',
          height: '100%',
          maxHeight: '100%',
          maxWidth: '100%',
        }}
      >
        <canvas
          ref={canvasRef}
          className="cursor-grab"
          onPointerDown={handlePointerDown}
          onPointerMove={handlePointerMove}
          onPointerUp={handlePointerUp}
          onPointerLeave={handlePointerUp}
          style={{ display: 'block', width: '100%', height: '100%' }}
        />
        {cobeWrapper && regionMarkers.map(region => createPortal(
          <RegionPulseOverlay
            key={region.id}
            regionId={region.id}
            status={region.status}
            selected={selectedRegion?.region.id === region.id}
            isHub={region.id === hubRegionId}
            primaryNodeId={region.primaryNodeId}
            totalNodes={region.totalNodes}
            onSelect={handleMarkerSelect}
          />,
          cobeWrapper
        ))}
        {/* Per-marker speed pill — only mounted while the hub-and-spoke arc
            system is active. Offline-only regions are excluded (no
            meaningful traffic to show). The hub itself keeps a pill too:
            it tells viewers what's coming in across the arcs in aggregate. */}
        {cobeWrapper && hubRegionId && regionMarkers
          .filter(region => region.status !== 'offline')
          .map(region => createPortal(
            <RegionSpeedOverlay
              key={`speed-${region.id}`}
              regionId={region.id}
              netUp={region.netUp}
              netDown={region.netDown}
              isHub={region.id === hubRegionId}
            />,
            cobeWrapper
          ))}
        {cobeWrapper && selectedRegion && createPortal(
          <SelectionOverlay
            regionId={selectedRegion.region.id}
            emoji={selectedRegion.region.emoji}
            regionText={selectedRegion.region.regionText}
            nodeName={selectedRegion.nodeName}
            nodeStatus={selectedRegion.nodeStatus}
            totalNodes={selectedRegion.region.totalNodes}
            onlineNodes={selectedRegion.region.onlineNodes}
            previousNodeId={selectedRegion.previousNodeId}
            nextNodeId={selectedRegion.nextNodeId}
            onSelectNode={handleMarkerSelect}
          />,
          cobeWrapper
        )}
      </div>
    </div>
  );
});

interface RegionPulseOverlayProps {
  regionId: string;
  status: RegionStatus;
  selected: boolean;
  /** True when this region contains the configured hub node and arcs are
   *  active. The `.is-hub` class enables a stronger pulse animation in CSS
   *  that visualizes data arriving from the spokes. */
  isHub: boolean;
  primaryNodeId: string;
  totalNodes: number;
  onSelect?: (uuid: string) => void;
}

/* memo() with default shallow compare is the right tool here: every prop
 * is a primitive or a stable useCallback. On a WS tick where only stats
 * changed (CPU%, RAM%) — i.e. the common case — every prop on every
 * region's overlay is === to last render and React skips the entire
 * subtree. Without this, all 30+ pulse buttons re-render every 2s and
 * the (cheap-but-not-free) className concat / style object allocation
 * happens for every one.
 */
const RegionPulseOverlay = memo(function RegionPulseOverlay({
  regionId,
  status,
  selected,
  isHub,
  primaryNodeId,
  totalNodes,
  onSelect,
}: RegionPulseOverlayProps) {
  const style = {
    positionAnchor: `--cobe-${regionId}`,
    ['--vis' as string]: `var(--cobe-visible-${regionId}, 0)`,
  } as React.CSSProperties;

  const classes = [
    'globe-marker-hitbox',
    'globe-region-pulse',
    `globe-region-pulse-${status}`,
    selected && 'is-selected',
    isHub && 'is-hub',
  ].filter(Boolean).join(' ');

  return (
    <button
      type="button"
      className={classes}
      style={style}
      onClick={(e) => {
        e.stopPropagation();
        onSelect?.(primaryNodeId);
      }}
      aria-label={`Select ${totalNodes} node${totalNodes === 1 ? '' : 's'} at this location`}
    >
      <span className="globe-region-core" />
      <span className="globe-region-pulse-ring" />
      <span className="globe-region-pulse-ring globe-region-pulse-ring-delay" />
    </button>
  );
});

/* ─────────── Per-marker speed pill ───────────
 * A compact mono "↑X ↓Y" badge anchored below each region marker while the
 * hub-and-spoke arc system is active. It answers the question the arcs
 * themselves can't: "which spokes are actually moving data right now, and
 * how much?". The arc animation alone reads as binary (line is there / not
 * there) — the pill turns that into a quantitative signal.
 *
 * Design choices:
 *   - Anchored BELOW the marker via `top: anchor(center)` + translate, so it
 *     never collides with the `SelectionOverlay` label which floats above.
 *   - Same `--vis` bridge as the other overlays: invisible + blurred when
 *     the marker rotates to the back of the globe.
 *   - Two color-coded values (up = positive/success, down = primary/cyan)
 *     match the conventions used elsewhere (NodeCard, NodeTable, sidebar).
 *   - memo() so the 2s WebSocket tick only re-renders pills whose numbers
 *     actually changed (most regions are idle most of the time).
 */
interface RegionSpeedOverlayProps {
  regionId: string;
  netUp: number;
  netDown: number;
  /** Hub marker is visually larger (48px vs 34px), so its pill needs a
   *  bigger offset to stay clear of the southern crosshair tick. */
  isHub: boolean;
}

/** Compact byte-rate formatter — matches `GlobeTelemetryFeed`'s `fmtSpeed`
 *  so the same value rendered in the bottom ticker and on a marker pill
 *  reads identically. Drops the "/s" suffix to keep the pill narrow. */
function fmtSpeedCompact(bps: number): string {
  if (bps >= 1_073_741_824) return (bps / 1_073_741_824).toFixed(1) + 'G';
  if (bps >= 1_048_576) return (bps / 1_048_576).toFixed(1) + 'M';
  if (bps >= 1024) return (bps / 1024).toFixed(0) + 'K';
  return Math.round(bps) + 'B';
}

const RegionSpeedOverlay = memo(function RegionSpeedOverlay({
  regionId,
  netUp,
  netDown,
  isHub,
}: RegionSpeedOverlayProps) {
  const style = {
    positionAnchor: `--cobe-${regionId}`,
    ['--vis' as string]: `var(--cobe-visible-${regionId}, 0)`,
  } as React.CSSProperties;

  const up = fmtSpeedCompact(netUp);
  const down = fmtSpeedCompact(netDown);

  return (
    <div
      className={`globe-region-speed${isHub ? ' is-hub' : ''}`}
      style={style}
      aria-hidden
    >
      <span className="globe-region-speed-up">↑{up}</span>
      <span className="globe-region-speed-sep" aria-hidden />
      <span className="globe-region-speed-down">↓{down}</span>
    </div>
  );
});

/* ─────────── Selection overlay ───────────
 * Renders a satellite-style label anchored above the selected region's marker
 * via cobe v2's CSS Anchor Positioning. The marker and its pulse stay flat
 * on the globe; only this explanatory label floats above the surface.
 *
 *   - `position-anchor: --cobe-{id}` binds the element to the marker dot.
 *   - cobe injects `:root { --cobe-visible-{id}: N }` while the marker is
 *     on the facing hemisphere (`N` is an invalid CSS value, which makes
 *     properties using it fall back to their *initial* value rather than
 *     to the var() fallback). We route that through a `--vis` custom prop
 *     so the static CSS rules can reference one stable variable name.
 *   - When the marker rotates to the back, cobe deletes the variable, so
 *     `var(--vis, 0)` resolves to 0 → overlay fades out + blurs.
 */
interface SelectionOverlayProps {
  regionId: string;
  emoji: string;
  regionText: string;
  nodeName: string;
  nodeStatus: 'online' | 'offline';
  totalNodes: number;
  onlineNodes: number;
  previousNodeId: string;
  nextNodeId: string;
  onSelectNode?: (uuid: string) => void;
}

const SelectionOverlay = memo(function SelectionOverlay({
  regionId,
  emoji,
  regionText,
  nodeName,
  nodeStatus,
  totalNodes,
  onlineNodes,
  previousNodeId,
  nextNodeId,
  onSelectNode,
}: SelectionOverlayProps) {
  // The CSS variable name is per-region, so we can't bake it into static
  // CSS. We bridge via `--vis` so the stylesheet can stay declarative.
  const style = {
    positionAnchor: `--cobe-${regionId}`,
    ['--vis' as string]: `var(--cobe-visible-${regionId}, 0)`,
  } as React.CSSProperties;
  const hasMultipleNodes = totalNodes > 1;

  return (
    <div
      className="globe-selected-overlay"
      style={style}
      onClick={e => e.stopPropagation()}
    >
      <div className="globe-selected-tether" />
      <div className="globe-selected-label">
        <div className="globe-selected-label-head">
          <span className="globe-selected-label-flag">{emoji}</span>
          {regionText && <span className="globe-selected-label-region">{regionText}</span>}
          <span className={`globe-selected-status globe-selected-status-${nodeStatus}`}>
            {nodeStatus}
          </span>
        </div>
        <div className="globe-selected-label-node">{nodeName}</div>
        <div className="globe-selected-label-meta">
          <span>{onlineNodes}/{totalNodes} online</span>
          {hasMultipleNodes && (
            <span className="globe-selected-switcher">
              <button
                type="button"
                className="globe-selected-switch"
                onClick={(e) => {
                  e.stopPropagation();
                  onSelectNode?.(previousNodeId);
                }}
                aria-label="Previous node at this location"
              >
                ‹
              </button>
              <button
                type="button"
                className="globe-selected-switch"
                onClick={(e) => {
                  e.stopPropagation();
                  onSelectNode?.(nextNodeId);
                }}
                aria-label="Next node at this location"
              >
                ›
              </button>
            </span>
          )}
        </div>
      </div>
    </div>
  );
});
