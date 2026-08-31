export type GlobeMarkerStyle = 'rich' | 'calm' | 'lite';

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

export function getGlobeAutoSpinFps(markerStyle: GlobeMarkerStyle): number {
  return pickAutoSpinFps(estimateRefreshHz(), markerStyle);
}
