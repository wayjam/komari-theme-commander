import type { EffectId } from '@/hooks/useEffects';

interface EffectsOverlayProps {
  activeEffects: EffectId[];
}

export function EffectsOverlay({ activeEffects }: EffectsOverlayProps) {
  if (!activeEffects.includes('scanlines')) return null;

  return (
    <div
      className="pointer-events-none fixed inset-0 z-20 scanlines-overlay"
      aria-hidden="true"
    />
  );
}
