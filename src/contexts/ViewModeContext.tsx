import { createContext, useContext } from 'react';

export type ViewMode = 'globe' | 'grid' | 'table' | 'uptime';

/** Warm Vite async chunks when user hovers a view they might switch to */
export function prefetchDashboardView(mode: ViewMode) {
  switch (mode) {
    case 'globe':
      void import('@/components/GlobeView');
      break;
    case 'uptime':
      void import('@/components/UptimeView');
      break;
    case 'grid':
    case 'table':
      void import('@/components/NodeList');
      break;
    default:
      break;
  }
}

export function getInitialViewMode(): ViewMode {
  const saved = localStorage.getItem('nodeViewMode');
  if (saved === 'globe' || saved === 'grid' || saved === 'table' || saved === 'uptime') return saved;
  return 'globe';
}

export interface ViewModeContextType {
  viewMode: ViewMode;
  setViewMode: (mode: ViewMode) => void;
}

export const ViewModeContext = createContext<ViewModeContextType>({
  viewMode: 'globe',
  setViewMode: () => {},
});

export function useViewMode() {
  return useContext(ViewModeContext);
}
