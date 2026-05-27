import { useEffect, useRef, useMemo, useCallback, useImperativeHandle, useState, forwardRef } from 'react';
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
  { nodes, theme, className, selectedNodeId, onSelectNode, onClearSelection, hubNodeUuid = null },
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

      const existing = byEmoji.get(emoji);
      if (existing) {
        existing.total += 1;
        existing.nodes.push({ uuid: node.uuid, name: node.name, status: node.status });
        if (node.status === 'online') {
          existing.online += 1;
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
          online: node.status === 'online' ? 1 : 0,
          primaryNodeId: node.uuid,
          primaryNodeOnline: node.status === 'online',
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

  /* ─────────── Auto-rotate to selected node ─────────── */
  useEffect(() => {
    if (!selectedNodeId) return;
    const node = nodes.find(n => n.uuid === selectedNodeId);
    if (!node) return;
    const emoji = extractRegionEmoji(node.region);
    if (!emoji) return;
    const coords = getCoords(emoji);
    if (coords[0] === 0 && coords[1] === 0) return;
    rotateToLocation(coords[0], coords[1]);
  }, [selectedNodeId, nodes, rotateToLocation]);

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
     * pay the per-frame cost of re-uploading data that hasn't changed. */
    let rafId = 0;
    const tick = () => {
      if (pointerInteracting.current !== null) {
        // dragging — phi is being mutated by handlePointerMove
      } else if (targetPhiRef.current !== null && targetThetaRef.current !== null) {
        const dphi = targetPhiRef.current - phiRef.current;
        const dtheta = targetThetaRef.current - thetaRef.current;
        phiRef.current += dphi * 0.08;
        thetaRef.current += dtheta * 0.08;
        if (Math.abs(dphi) < 0.001 && Math.abs(dtheta) < 0.001) {
          targetPhiRef.current = null;
          targetThetaRef.current = null;
        }
      } else if (!selectedNodeIdRef.current) {
        phiRef.current += 0.003;
      }
      globe.update({ phi: phiRef.current, theta: thetaRef.current });
      rafId = requestAnimationFrame(tick);
    };
    tick();

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
      cancelAnimationFrame(rafId);
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

  /* ─────────── Push marker updates ─────────── */
  useEffect(() => {
    globeRef.current?.update({ markers: regionMarkers });
  }, [regionMarkers]);

  /* ─────────── Push arc updates (deepspace data-stream lines) ─────────── */
  useEffect(() => {
    globeRef.current?.update({ arcs });
  }, [arcs]);

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

  /* ─────────── Pointer drag ─────────── */
  const handlePointerDown = useCallback((e: React.PointerEvent) => {
    pointerInteracting.current = e.clientX;
    pointerInteractionMovement.current = 0;
    targetPhiRef.current = null;
    targetThetaRef.current = null;
    (e.target as HTMLElement).style.cursor = 'grabbing';
  }, []);

  const handlePointerMove = useCallback((e: React.PointerEvent) => {
    if (pointerInteracting.current === null) return;
    const delta = e.clientX - pointerInteracting.current;
    pointerInteractionMovement.current = delta;
    phiRef.current += delta / 200;
    pointerInteracting.current = e.clientX;
  }, []);

  const handlePointerUp = useCallback((e: React.PointerEvent) => {
    pointerInteracting.current = null;
    (e.target as HTMLElement).style.cursor = 'grab';
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

function RegionPulseOverlay({
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
}

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

function SelectionOverlay({
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
}
