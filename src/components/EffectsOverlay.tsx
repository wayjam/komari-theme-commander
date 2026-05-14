import type { EffectId } from '@/hooks/useEffects';

interface EffectsOverlayProps {
  activeEffects: EffectId[];
}

/**
 * Ambient background layer for the active theme.
 *
 * Lumina  → millimeter-paper grid + slow teal self-test sweep.
 * Deepspace → CRT scanlines.
 * Clean   → nothing (the hook returns an empty list).
 *
 * Mounted at z-index: -10 so it sits *behind* all content. The previous
 * implementation lived at z-20 over the entire viewport, which sliced
 * chart lines, table rows, and progress bars with a black 4px raster —
 * fine as a CRT prop, hostile to a data-dense monitoring surface.
 */
export function EffectsOverlay({ activeEffects }: EffectsOverlayProps) {
  if (!activeEffects.includes('scanlines')) return null;

  return (
    <div
      className="pointer-events-none fixed inset-0 -z-10 scanlines-overlay"
      aria-hidden="true"
    />
  );
}

