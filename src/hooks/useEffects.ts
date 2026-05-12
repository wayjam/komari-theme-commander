import { useEffect, useMemo } from 'react';
import { useTheme } from './useTheme';

export type EffectId = 'scanlines' | 'pulse' | 'glow';

const ALL_EFFECT_IDS: EffectId[] = ['scanlines', 'pulse', 'glow'];
const EMPTY_EFFECTS: EffectId[] = [];

export function useEffects() {
  const { resolvedTheme } = useTheme();

  // Effects are always active unless clean theme
  const activeEffects = useMemo<EffectId[]>(
    () => (resolvedTheme === 'clean' ? EMPTY_EFFECTS : ALL_EFFECT_IDS),
    [resolvedTheme],
  );

  useEffect(() => {
    const root = document.documentElement;
    ALL_EFFECT_IDS.forEach(id => {
      root.classList.toggle(`effect-${id}`, activeEffects.includes(id));
    });
  }, [activeEffects]);

  return { activeEffects };
}
