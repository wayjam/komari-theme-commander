import { useEffect } from 'react';
import { useTheme } from './useTheme';

export type EffectId = 'scanlines' | 'pulse' | 'glow';

const ALL_EFFECT_IDS: EffectId[] = ['scanlines', 'pulse', 'glow'];

export function useEffects() {
  const { resolvedTheme } = useTheme();

  // Effects are always active unless clean theme
  const activeEffects: EffectId[] = resolvedTheme === 'clean' ? [] : ALL_EFFECT_IDS;

  useEffect(() => {
    const root = document.documentElement;
    ALL_EFFECT_IDS.forEach(id => {
      root.classList.toggle(`effect-${id}`, activeEffects.includes(id));
    });
  }, [activeEffects]);

  return { activeEffects };
}
