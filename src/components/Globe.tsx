import { useEffect, useLayoutEffect, useRef, useMemo, useCallback, useImperativeHandle, useState, forwardRef, memo } from 'react';
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
  /** When false, auto-rotation is paused (manual drag and selection slerp
   *  still work). Driven by the `globe_mode` theme setting and the on-page
   *  start/stop control. Default true. */
  autoRotate?: boolean;
  /** Marker presentation tier. `rich`: full HTML pulse + speed pills;
   *  `calm`: flat cores, no pulse (click + selection label kept);
   *  `lite`: WebGL dots only — no id, no HTML overlays, select via sidebar. */
  markerStyle?: 'rich' | 'calm' | 'lite';
}

export type GlobeMarkerStyle = NonNullable<GlobeProps['markerStyle']>;

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
    glowColor: [0.58, 0.82, 0.9] as [number, number, number],
    markerColor: [0.12, 0.55, 0.72] as [number, number, number],
    // Brighter, more saturated teal than the marker color — arcs need extra
    // luminance to read as energy beams against the bright sphere.
    arcColor: [0.1, 0.62, 0.82] as [number, number, number],
    mapBrightness: 9.5,
    diffuse: 1.0,
    markerElevation: 0,
    scale: 1.0,
    enableArcs: true,
  },
  deepspace: {
    dark: 1 as const,
    baseColor: [0.15, 0.18, 0.28] as [number, number, number],
    glowColor: [0.0, 0.55, 0.74] as [number, number, number],
    markerColor: [0.0, 1.0, 0.9] as [number, number, number],
    // Slightly mint-shifted from the cyan glow so beams don't blend into
    // the halo — preserves the "data is moving" silhouette against the
    // ambient atmospheric glow.
    arcColor: [0.35, 1.0, 0.85] as [number, number, number],
    mapBrightness: 6.25,
    diffuse: 1.4,
    markerElevation: 0.012,
    scale: 0.98,
    enableArcs: true,
  },
  clean: {
    dark: 0 as const,
    baseColor: [0.9, 0.9, 0.92] as [number, number, number],
    glowColor: [0.88, 0.88, 0.92] as [number, number, number],
    markerColor: [0.3, 0.4, 0.8] as [number, number, number],
    arcColor: [0.3, 0.4, 0.8] as [number, number, number],
    mapBrightness: 8,
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

/** Snap measured/declared refresh rate to a common bucket. */
function normalizeRefreshHz(hz: number): number {
  if (hz >= 100) return 120;
  if (hz >= 52) return 60;
  if (hz >= 38) return 40;
  return 30;
}

/** Best-effort display refresh rate (Chrome `screen.refreshRate`; else 60). */
function estimateRefreshHz(): number {
  if (typeof window === 'undefined') return 60;
  const declared = (window.screen as Screen & { refreshRate?: number }).refreshRate;
  if (typeof declared === 'number' && declared >= 30 && declared <= 240) {
    return normalizeRefreshHz(declared);
  }
  return 60;
}

/** Auto-spin fps: use refresh-rate divisors; interactions still run at 60fps. */
function pickAutoSpinFps(refreshHz: number, markerStyle: GlobeMarkerStyle): number {
  const lowPower =
    markerStyle === 'lite' ||
    (typeof window !== 'undefined' && window.innerWidth < 640) ||
    ((typeof navigator !== 'undefined' ? navigator.hardwareConcurrency : 8) ?? 8) <= 4;

  if (refreshHz >= 60) return lowPower ? 20 : 30;
  if (refreshHz >= 38) return 20;
  return 30;
}

/** DPR cap — slightly higher on sharp Retina desktops when the globe is small. */
function getGlobeDpr(canvasCssSize: number): number {
  const dpr = typeof window !== 'undefined' ? window.devicePixelRatio || 1 : 1;
  const isNarrow = typeof window !== 'undefined' && window.innerWidth < 640;
  if (isNarrow) return Math.min(dpr, 2);
  if (dpr >= 2 && canvasCssSize <= 720) return Math.min(dpr, 2.5);
  return Math.min(dpr, 2);
}

/** Scale mapSamples with backing-buffer size — large screens need more samples. */
function getMapSamples(canvasCssSize: number, markerStyle: GlobeMarkerStyle): number {
  const dpr = getGlobeDpr(canvasCssSize);
  const backing = canvasCssSize * dpr;
  const lite = markerStyle === 'lite';
  const isNarrow = typeof window !== 'undefined' && window.innerWidth < 640;

  if (isNarrow || lite) {
    return backing >= 1000 ? 10000 : 8000;
  }
  if (backing >= 1400) return 16000;
  if (backing >= 1100) return 14000;
  if (backing >= 800) return 12000;
  return 10000;
}

interface GlobeRenderProfile {
  devicePixelRatio: number;
  mapSamples: number;
  autoSpinFps: number;
}

export function getGlobeAutoSpinFps(markerStyle: GlobeMarkerStyle): number {
  return pickAutoSpinFps(estimateRefreshHz(), markerStyle);
}

function getGlobeRenderProfile(
  canvasCssSize: number,
  markerStyle: GlobeMarkerStyle,
): GlobeRenderProfile {
  return {
    devicePixelRatio: getGlobeDpr(canvasCssSize),
    mapSamples: getMapSamples(canvasCssSize, markerStyle),
    autoSpinFps: getGlobeAutoSpinFps(markerStyle),
  };
}

/** Strip marker ids in lite mode so cobe skips per-frame CSS anchor work. */
function toCobeMarkers(regions: RegionMarker[], style: GlobeMarkerStyle): Marker[] {
  if (style === 'lite') {
    return regions.map(({ location, size, color }) => ({ location, size, color }));
  }
  return regions;
}

/** Strip arc ids in lite mode — WebGL arcs remain, anchor DOM is skipped. */
function toCobeArcs(arcs: Arc[], style: GlobeMarkerStyle): Arc[] {
  if (style === 'lite') {
    return arcs.map(({ from, to }) => ({ from, to }));
  }
  return arcs;
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
    autoRotate = true,
    markerStyle = 'rich',
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
  /** True once cobe has been created with a non-zero host size. */
  const [globeReady, setGlobeReady] = useState(false);

  // Mobile portrait exposed a subtle sizing bug: CSS `height: 100%` +
  // `aspect-ratio: 1` can still resolve to a non-square used size when the
  // parent is taller than it is wide and `max-width: 100%` clamps only one
  // axis. cobe then renders into a square backing buffer but CSS stretches
  // it into a rectangle. Measure the available slot and force the host to a
  // concrete square: min(parent width, parent height).
  const globeSlotRef = useRef<HTMLDivElement>(null);
  const [radarPortalRoot, setRadarPortalRoot] = useState<HTMLElement | null>(null);
  const bindGlobeSlot = useCallback((el: HTMLDivElement | null) => {
    globeSlotRef.current = el;
    setRadarPortalRoot(el);
  }, []);
  /** Restart hook for the long-lived RAF loop (slerp / drag / auto-spin resume). */
  const loopControlRef = useRef<{ start: () => void } | null>(null);
  /* Render-profile applier published by the globe-mount effect and consumed
   * by the square-sizing layout effect, so a single ResizeObserver (on the
   * slot) can both keep the host square and re-tune DPR / mapSamples — no
   * need for a second observer on the host. Null until the globe exists. */
  const applyRenderProfileRef = useRef<((cssSize: number) => void) | null>(null);

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

  const regionMarkersRef = useRef(regionMarkers);
  regionMarkersRef.current = regionMarkers;
  const arcsRef = useRef(arcs);
  arcsRef.current = arcs;

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
  const autoRotateRef = useRef(autoRotate);
  autoRotateRef.current = autoRotate;
  const markerStyleRef = useRef(markerStyle);
  markerStyleRef.current = markerStyle;
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

  /* ─────────── Measure square viewport ─────────── */
  useLayoutEffect(() => {
    const slot = globeSlotRef.current;
    const host = canvasHostRef.current;
    if (!slot || !host) return;

    let rafId = 0;
    let lastSize = 0;
    let profileTimer: ReturnType<typeof setTimeout> | null = null;
    const scheduleProfileUpdate = (cssSize: number) => {
      if (profileTimer) clearTimeout(profileTimer);
      // Debounce so a live drag-resize doesn't redraw the globe at every
      // intermediate size; only the settled size gets pushed.
      profileTimer = setTimeout(() => {
        profileTimer = null;
        applyRenderProfileRef.current?.(cssSize);
      }, 200);
    };
    const applySquareSizeNow = () => {
      const rect = slot.getBoundingClientRect();
      const next = Math.floor(Math.max(0, Math.min(rect.width, rect.height)));
      if (!next || next === lastSize) return;
      lastSize = next;
      // Concrete pixel dimensions beat the ambiguous `height:100% +
      // aspect-ratio` combination and keep cobe's wrapper/canvas/anchors
      // in the same square coordinate system on every viewport.
      host.style.width = `${next}px`;
      host.style.height = `${next}px`;
      // Size changed → backing buffer changed → re-tune DPR / mapSamples for
      // the new bucket. The applier itself skips pushing mapSamples / DPR
      // when the bucket didn't actually cross a threshold (see B).
      scheduleProfileUpdate(next);
    };
    const scheduleSquareSize = () => {
      cancelAnimationFrame(rafId);
      rafId = requestAnimationFrame(applySquareSizeNow);
    };

    // Synchronous first measurement: passive cobe init below reads
    // `host.clientWidth`, so the host must already be square before then.
    applySquareSizeNow();
    const resizeObserver = new ResizeObserver(scheduleSquareSize);
    resizeObserver.observe(slot);
    window.addEventListener('orientationchange', scheduleSquareSize);

    return () => {
      cancelAnimationFrame(rafId);
      if (profileTimer) clearTimeout(profileTimer);
      resizeObserver.disconnect();
      window.removeEventListener('orientationchange', scheduleSquareSize);
    };
  }, []);

  /* ─────────── Create globe (once host has a real size) ─────────── */
  useEffect(() => {
    const canvas = canvasRef.current;
    const host = canvasHostRef.current;
    const slot = globeSlotRef.current;
    if (!canvas || !host) return;

    let cleanup: (() => void) | null = null;
    let waitRo: ResizeObserver | null = null;

    const mountGlobe = (): boolean => {
      if (cleanup) return true;

      const size = host.clientWidth;
      const height = host.clientHeight;
      // Wait until the square-sizing layout effect has applied equal
      // width/height — lazy-loaded GlobeView can mount before flex layout
      // settles, and a non-square or zero host breaks cobe anchor math.
      if (size === 0 || height === 0 || size !== height) return false;

      widthRef.current = size;
      const renderProfile = getGlobeRenderProfile(size, markerStyleRef.current);
      const spinFpsRef = { current: renderProfile.autoSpinFps };

      const initialConfig = THEME_CONFIG[theme];

      const globe = createGlobe(canvas, {
      // v2 takes CSS pixels here (it multiplies by dpr internally) — the
      // 0.6.5 signature took pre-multiplied backing-buffer pixels. Don't
      // pre-multiply or you'll end up at 4× resolution and a blurry canvas
      // scaled down by `canvas.style.width`.
      devicePixelRatio: renderProfile.devicePixelRatio,
      width: size,
      height: size,
      phi: phiRef.current,
      theta: thetaRef.current,
      dark: initialConfig.dark,
      diffuse: initialConfig.diffuse,
      mapSamples: renderProfile.mapSamples,
      mapBrightness: initialConfig.mapBrightness,
      baseColor: initialConfig.baseColor,
      markerColor: initialConfig.markerColor,
      glowColor: initialConfig.glowColor,
      markerElevation: initialConfig.markerElevation,
      scale: initialConfig.scale,
      markers: toCobeMarkers(regionMarkersRef.current, markerStyleRef.current),
      // Arcs animate themselves. Initial array is whatever the useMemo
      // computed on first render — the dedicated update effect below pushes
      // any later changes (hub config / online regions).
      arcs: toCobeArcs(arcsRef.current, markerStyleRef.current),
      arcColor: initialConfig.arcColor,
      arcWidth: ARC_WIDTH,
      arcHeight: ARC_HEIGHT,
      context: {
        powerPreference: 'high-performance',
        antialias: false,
        desynchronized: true,
      },
    });
    globeRef.current = globe;

    // Sync latest markers/arcs + camera after init (effects may have run
    // while globeRef was still null during lazy-layout / zero-size frame).
    globe.update({
      markers: toCobeMarkers(regionMarkersRef.current, markerStyleRef.current),
      arcs: toCobeArcs(arcsRef.current, markerStyleRef.current),
      phi: phiRef.current,
      theta: thetaRef.current,
    });

    // Expose cobe's wrapper to React so the selection overlay can portal
    // into it (anchor `<div>`s live inside this wrapper).
    setCobeWrapper(canvas.parentElement);
    setGlobeReady(true);

    /* RAF loop. v2 removed `onRender` — caller drives the loop and pushes
     * camera state via `globe.update()`. We only push phi/theta here;
     * markers/theme/size each get their own dedicated useEffect so we don't
     * pay the per-frame cost of re-uploading data that hasn't changed.
     *
     * Auto-spin is capped to a divisor of the display refresh rate. This keeps
     * passive WebGL repaint work below the original 60fps path while avoiding
     * uneven cadences like 24fps on a 60Hz display, which reads as dropped
     * frames. Drag and selection slerp remain at 60fps for responsiveness.
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
    let wakeTimer: ReturnType<typeof setTimeout> | null = null;
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
    const computeAutoSpin = () => {
      if (!autoRotateRef.current) return false;
      return !(respectReducedMotionRef.current && (reduceMotionMQ?.matches ?? false));
    };
    let autoSpin = computeAutoSpin();
    let visibilityPaused = typeof document !== 'undefined' && document.hidden;
    let inViewport = true;
    let running = false;

    /* Frame-rate cap — auto-spin fps is chosen to divide evenly into common
     * display refresh buckets (60/120→30, low-power/40→20). Drag /
     * slerp stay at 60fps for responsiveness. */
    const INTERACTION_FPS = 60;
    const interactionInterval = 1000 / INTERACTION_FPS - 4;
    const getAutoSpinInterval = () => 1000 / spinFpsRef.current - 4;
    const getFrameInterval = () => {
      const dragging = pointerInteracting.current !== null;
      const slerping =
        targetPhiRef.current !== null && targetThetaRef.current !== null;
      return dragging || slerping ? interactionInterval : getAutoSpinInterval();
    };
    /* Auto-spin expressed in radians/second, integrated against the real
     * frame delta, so rotation speed is identical on every display. */
    const SPIN_RATE = 0.16;
    let lastDrawTs = 0;

    const clearWake = () => {
      if (wakeTimer !== null) {
        clearTimeout(wakeTimer);
        wakeTimer = null;
      }
    };

    const scheduleTick = (delayMs = 0) => {
      clearWake();
      if (rafId) {
        cancelAnimationFrame(rafId);
        rafId = 0;
      }
      if (delayMs > 0) {
        wakeTimer = setTimeout(() => {
          wakeTimer = null;
          rafId = requestAnimationFrame(tick);
        }, delayMs);
      } else {
        rafId = requestAnimationFrame(tick);
      }
    };

    const stopLoop = () => {
      running = false;
      clearWake();
      if (rafId) {
        cancelAnimationFrame(rafId);
        rafId = 0;
      }
    };

    const tick = (now: number) => {
      rafId = 0;
      const interval = getFrameInterval();

      if (lastDrawTs && now - lastDrawTs < interval) {
        scheduleTick(interval - (now - lastDrawTs));
        return;
      }

      const dt = lastDrawTs
        ? Math.min(0.05, (now - lastDrawTs) / 1000)
        : 1 / INTERACTION_FPS;

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
        autoSpin = computeAutoSpin();
        if (autoSpin) phiRef.current += SPIN_RATE * dt;
        else {
          stopLoop();
          return;
        }
      } else if (!dragging) {
        stopLoop();
        return;
      }

      lastDrawTs = now;
      globe.update({ phi: phiRef.current, theta: thetaRef.current });
      scheduleTick(getFrameInterval());
    };

    const handleMotionChange = () => {
      autoSpin = computeAutoSpin();
      if (autoSpin) start();
    };
    reduceMotionMQ?.addEventListener?.('change', handleMotionChange);

    const start = () => {
      if (running) return;
      if (visibilityPaused) return;
      if (!inViewport) return;
      running = true;
      scheduleTick(0);
    };

    const stop = () => {
      stopLoop();
    };

    loopControlRef.current = { start };
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

    /* Re-tune DPR / mapSamples for a new backing-buffer size. Only pushes
     * `mapSamples` / `devicePixelRatio` when the bucket actually changed
     * since the last apply. `mapSamples` is a shader uniform in cobe v2, so
     * duplicate values are cheap but still unnecessary update noise; `width`
     * / `height` are always pushed because they genuinely moved. Published
     * via `applyRenderProfileRef` so the square-sizing layout effect can call
     * us from its single ResizeObserver (see E). */
    let lastAppliedSamples = renderProfile.mapSamples;
    let lastAppliedDpr = renderProfile.devicePixelRatio;
    const applyRenderProfile = (cssSize: number) => {
      const profile = getGlobeRenderProfile(cssSize, markerStyleRef.current);
      spinFpsRef.current = profile.autoSpinFps;
      const patch: { width: number; height: number; devicePixelRatio?: number; mapSamples?: number } = {
        width: cssSize,
        height: cssSize,
      };
      if (profile.devicePixelRatio !== lastAppliedDpr) {
        patch.devicePixelRatio = profile.devicePixelRatio;
        lastAppliedDpr = profile.devicePixelRatio;
      }
      if (profile.mapSamples !== lastAppliedSamples) {
        patch.mapSamples = profile.mapSamples;
        lastAppliedSamples = profile.mapSamples;
      }
      globe.update(patch);
    };
    applyRenderProfileRef.current = applyRenderProfile;

    /* Resize of the host is already covered by the square-sizing layout
     * effect's ResizeObserver on the slot, which calls
     * `applyRenderProfileRef.current` after writing the new square size.
     * No second observer needed here. */

    cleanup = () => {
      stop();
      document.removeEventListener('visibilitychange', onVisibility);
      reduceMotionMQ?.removeEventListener?.('change', handleMotionChange);
      intersectionObserver.disconnect();
      applyRenderProfileRef.current = null;
      globe.destroy();
      globeRef.current = null;
      loopControlRef.current = null;
      setGlobeReady(false);
      setCobeWrapper(null);
    };

    return true;
    };

    if (!mountGlobe()) {
      waitRo = new ResizeObserver(() => {
        if (mountGlobe()) waitRo?.disconnect();
      });
      waitRo.observe(host);
      if (slot) waitRo.observe(slot);
    }

    return () => {
      waitRo?.disconnect();
      cleanup?.();
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
    loopControlRef.current?.start();
  }, [selectedNodeId]);

  useEffect(() => {
    if (autoRotate) loopControlRef.current?.start();
  }, [autoRotate]);

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
    let sig = `${markerStyle}|`;
    for (const m of regionMarkers) {
      if (markerStyle === 'lite') {
        sig += `${m.location[0]},${m.location[1]}:${m.status}:${m.totalNodes}:${m.onlineNodes}:${m.size.toFixed(3)}|`;
      } else {
        sig += `${m.id}:${m.status}:${m.totalNodes}:${m.onlineNodes}:${m.size.toFixed(3)}|`;
      }
    }
    return sig;
  }, [regionMarkers, markerStyle]);

  useEffect(() => {
    if (!globeReady) return;
    globeRef.current?.update({
      markers: toCobeMarkers(regionMarkers, markerStyle),
    });
    // Intentionally depend on the structural signature, not the array
    // reference — we don't want to re-upload markers just because the
    // parent rerendered with stat-only changes.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [markerSignature, globeReady]);

  /* ─────────── Push arc updates (deepspace data-stream lines) ─────────── */
  const arcSignature = useMemo(() => {
    let sig = `${markerStyle}|`;
    for (const a of arcs) {
      // `to` is fixed (the hub) but we include it for correctness on hub
      // changes; cheap relative to the rest of the work skipped.
      sig += `${a.id ?? ''}:${a.from[0]},${a.from[1]}->${a.to[0]},${a.to[1]}|`;
    }
    return sig;
  }, [arcs, markerStyle]);

  useEffect(() => {
    if (!globeReady) return;
    globeRef.current?.update({ arcs: toCobeArcs(arcs, markerStyle) });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [arcSignature, globeReady]);

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
    loopControlRef.current?.start();
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
    loopControlRef.current?.start();
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
    <div ref={bindGlobeSlot} className={`relative flex items-center justify-center ${className ?? ''}`}>
      {/* Stable square host. The layout effect above writes concrete
          `width`/`height` pixels based on min(slot width, slot height), so
          cobe's wrapper (and the canvas + anchor divs inside it) all share
          the same square coordinate space. The inline CSS below is only a
          non-distorting fallback before JS runs. */}
      <div
        ref={canvasHostRef}
        className="relative shrink-0"
        onClick={handleGlobeClick}
        style={{
          aspectRatio: '1 / 1',
          width: 'min(100%, 100svh)',
          height: 'auto',
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
        {markerStyle !== 'lite' && cobeWrapper && globeReady && regionMarkers.map(region => createPortal(
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
        {/* Per-marker speed pill — rich mode only while hub-and-spoke arcs
            are active. */}
        {markerStyle === 'rich' && cobeWrapper && globeReady && hubRegionId && regionMarkers
          .filter(region => region.status !== 'offline')
          .map(region => createPortal(
            <RegionSpeedOverlay
              key={`speed-${region.id}`}
              regionId={region.id}
              up={fmtSpeedCompact(region.netUp)}
              down={fmtSpeedCompact(region.netDown)}
              isHub={region.id === hubRegionId}
            />,
            cobeWrapper
          ))}
        {markerStyle !== 'lite' && cobeWrapper && globeReady && selectedRegion && createPortal(
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
      {radarPortalRoot && globeReady && createPortal(
        <GlobeRadarOverlay />,
        radarPortalRoot,
      )}
    </div>
  );
});

/** HUD radar sweep — portaled into the globe *stage slot* (full flex area),
 *  not the square cobe canvas, so rings + sweep cover the whole HUD frame.
 *  Sits above the WebGL canvas via z-index; `pointer-events: none` keeps
 *  node clicks and canvas drag working. */
const GlobeRadarOverlay = memo(function GlobeRadarOverlay() {
  return (
    <div className="globe-radar-layer" aria-hidden>
      <div className="radar-scan" />
      <div className="globe-radar-ring globe-radar-ring-60" />
      <div className="globe-radar-ring globe-radar-ring-40" />
      <div className="globe-radar-ring globe-radar-ring-20" />
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
  /* Pre-formatted (already rounded to K/M/G) display strings, not raw bps.
   *
   * Why format in the parent instead of inside the memo'd child: the 2s
   * WebSocket tick mints a fresh `nodes` array even when nothing structurally
   * changed, so this overlay re-renders frequently. `memo()` shallow-compares
   * props — if we passed raw `netUp`/`netDown`, a 1-byte jitter (invisible at
   * K/M/G precision) would break the equality check and force a re-render +
   * DOM text update for every pill every tick. By formatting before we hand
   * the value down, memo sees `"1.2M" === "1.2M"` and bails for any region
   * whose *displayed* value didn't change — which is most regions, most of
   * the time. */
  up: string;
  down: string;
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
  up,
  down,
  isHub,
}: RegionSpeedOverlayProps) {
  const style = {
    positionAnchor: `--cobe-${regionId}`,
    ['--vis' as string]: `var(--cobe-visible-${regionId}, 0)`,
  } as React.CSSProperties;

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
