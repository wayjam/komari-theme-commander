import { useEffect } from 'react';
import { useTheme } from './useTheme';

export type EffectId = 'scanlines' | 'pulse' | 'glow';

const ALL_EFFECT_IDS: EffectId[] = ['scanlines', 'pulse', 'glow'];

export function useEffects() {
  const { theme } = useTheme();

  // Effects are always active unless clean theme
  const activeEffects: EffectId[] = theme === 'clean' ? [] : ALL_EFFECT_IDS;

  useEffect(() => {
    const root = document.documentElement;
    ALL_EFFECT_IDS.forEach(id => {
      root.classList.toggle(`effect-${id}`, activeEffects.includes(id));
    });
  }, [activeEffects]);

  return { activeEffects };
}
