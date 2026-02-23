import { useEffect, useRef, useMemo, useCallback, useImperativeHandle, forwardRef } from 'react';
import createGlobe from 'cobe';
import type { NodeWithStatus } from '@/services/api';
import { extractRegionEmoji } from '@/lib/utils';
import { getCoords } from '@/data/regionCoords';

interface GlobeProps {
  nodes: NodeWithStatus[];
  theme: 'lumina' | 'deepspace' | 'clean';
  className?: string;
  selectedNodeId?: string | null;
}

export interface GlobeHandle {
  rotateToLocation: (lat: number, lng: number) => void;
}

const THEME_CONFIG = {
  lumina: {
    dark: 0 as const,
    baseColor: [0.85, 0.88, 0.95] as [number, number, number],
    glowColor: [0.8, 0.9, 1] as [number, number, number],
    markerColor: [0.2, 0.8, 0.9] as [number, number, number],
  },
  deepspace: {
    dark: 1 as const,
    baseColor: [0.15, 0.18, 0.25] as [number, number, number],
    glowColor: [0, 0.8, 1] as [number, number, number],
    markerColor: [0, 1, 0.9] as [number, number, number],
  },
  clean: {
    dark: 0 as const,
    baseColor: [0.9, 0.9, 0.92] as [number, number, number],
    glowColor: [0.85, 0.85, 0.9] as [number, number, number],
    markerColor: [0.3, 0.4, 0.8] as [number, number, number],
  },
};

const OFFLINE_MARKER_COLOR: [number, number, number] = [1, 0.2, 0.2];
const SELECTED_MARKER_COLOR: [number, number, number] = [1, 0.85, 0];

function latLngToAngles(lat: number, lng: number): [number, number] {
  return [
    Math.PI - ((lng * Math.PI) / 180 - Math.PI / 2),
    (lat * Math.PI) / 180,
  ];
}

export const Globe = forwardRef<GlobeHandle, GlobeProps>(function Globe(
  { nodes, theme, className, selectedNodeId },
  ref
) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const globeRef = useRef<ReturnType<typeof createGlobe> | null>(null);
  const phiRef = useRef(0);
  const thetaRef = useRef(0.15);
  const targetPhiRef = useRef<number | null>(null);
  const targetThetaRef = useRef<number | null>(null);
  const widthRef = useRef(0);
  const pointerInteracting = useRef<number | null>(null);
  const pointerInteractionMovement = useRef(0);

  const rotateToLocation = useCallback((lat: number, lng: number) => {
    const [phi, theta] = latLngToAngles(lat, lng);
    targetPhiRef.current = phi;
    targetThetaRef.current = theta;
  }, []);

  useImperativeHandle(ref, () => ({ rotateToLocation }), [rotateToLocation]);

  // Auto-rotate to selected node
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

  const markers = useMemo(() => {
    const result: { location: [number, number]; size: number; color?: [number, number, number] }[] = [];
    const config = THEME_CONFIG[theme];

    for (const node of nodes) {
      const emoji = extractRegionEmoji(node.region);
      if (!emoji) continue;
      const coords = getCoords(emoji);
      if (coords[0] === 0 && coords[1] === 0 && emoji) continue;

      const isOnline = node.status === 'online';
      const isSelected = node.uuid === selectedNodeId;
      result.push({
        location: coords,
        size: isSelected ? 0.1 : isOnline ? 0.06 : 0.03,
        color: isSelected ? SELECTED_MARKER_COLOR : isOnline ? config.markerColor : OFFLINE_MARKER_COLOR,
      });
    }
    return result;
  }, [nodes, theme, selectedNodeId]);

  const markersRef = useRef(markers);
  markersRef.current = markers;

  const selectedNodeIdRef = useRef(selectedNodeId);
  selectedNodeIdRef.current = selectedNodeId;

  const dprRef = useRef(Math.min(window.devicePixelRatio, 2));

  // Stable onRender — uses refs so globe doesn't need to be recreated
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const onRender = useCallback((state: Record<string, any>) => {
    if (pointerInteracting.current !== null) {
      // User is dragging
    } else if (targetPhiRef.current !== null && targetThetaRef.current !== null) {
      // Smooth rotation to target
      const dphi = targetPhiRef.current - phiRef.current;
      const dtheta = targetThetaRef.current - thetaRef.current;
      phiRef.current += dphi * 0.08;
      thetaRef.current += dtheta * 0.08;
      if (Math.abs(dphi) < 0.001 && Math.abs(dtheta) < 0.001) {
        targetPhiRef.current = null;
        targetThetaRef.current = null;
      }
    } else if (!selectedNodeIdRef.current) {
      // Auto-rotate only when no node is selected
      phiRef.current += 0.003;
    }

    const dpr = dprRef.current;
    state.phi = phiRef.current;
    state.theta = thetaRef.current;
    state.width = widthRef.current * dpr;
    state.height = widthRef.current * dpr;
    state.markers = markersRef.current;
  }, []);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const container = canvas.parentElement;
    if (!container) return;

    const config = THEME_CONFIG[theme];
    const dpr = dprRef.current;

    const buildGlobe = () => {
      const size = Math.min(container.clientWidth, container.clientHeight);
      widthRef.current = size;
      canvas.width = size * dpr;
      canvas.height = size * dpr;
      canvas.style.width = `${size}px`;
      canvas.style.height = `${size}px`;

      return createGlobe(canvas, {
        devicePixelRatio: dpr,
        width: size * dpr,
        height: size * dpr,
        phi: phiRef.current,
        theta: thetaRef.current,
        dark: config.dark,
        diffuse: 1.2,
        mapSamples: 16000,
        mapBrightness: theme === 'deepspace' ? 2 : 6,
        baseColor: config.baseColor,
        markerColor: config.markerColor,
        glowColor: config.glowColor,
        markers: markersRef.current,
        onRender,
      });
    };

    let globe = buildGlobe();
    globeRef.current = globe;

    let resizeTimer: ReturnType<typeof setTimeout> | null = null;
    let lastSize = widthRef.current;

    const resizeObserver = new ResizeObserver(() => {
      const newSize = Math.min(container.clientWidth, container.clientHeight);
      // Only rebuild if size actually changed
      if (newSize === lastSize) return;
      lastSize = newSize;

      // Update canvas immediately to avoid visual glitch
      widthRef.current = newSize;
      canvas.width = newSize * dpr;
      canvas.height = newSize * dpr;
      canvas.style.width = `${newSize}px`;
      canvas.style.height = `${newSize}px`;

      // Debounce globe rebuild to avoid thrashing during drag-resize
      if (resizeTimer) clearTimeout(resizeTimer);
      resizeTimer = setTimeout(() => {
        globe.destroy();
        globe = buildGlobe();
        globeRef.current = globe;
      }, 200);
    });
    resizeObserver.observe(container);

    return () => {
      if (resizeTimer) clearTimeout(resizeTimer);
      globe.destroy();
      globeRef.current = null;
      resizeObserver.disconnect();
    };
  }, [theme, onRender]);

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

  return (
    <div className={`relative flex items-center justify-center ${className ?? ''}`}>
      <canvas
        ref={canvasRef}
        className="cursor-grab"
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerUp}
        onPointerLeave={handlePointerUp}
        style={{ maxWidth: '100%', maxHeight: '100%', aspectRatio: '1' }}
      />
    </div>
  );
});
