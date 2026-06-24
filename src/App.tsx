import { useState, useEffect, useCallback, useMemo } from 'react';
import { Routes, Route, useLocation } from 'react-router-dom';
import { EffectsOverlay } from '@/components/EffectsOverlay';
import { Starfield } from '@/components/Starfield';
import { AppHeader } from '@/components/layout/AppHeader';
import { AppFooter } from '@/components/layout/AppFooter';
import { NodesContext } from '@/contexts/NodesContext';
import {
  ViewModeContext,
  getInitialViewMode,
  type ViewMode,
} from '@/contexts/ViewModeContext';
import { useNodes } from '@/hooks/useNodes';
import { useEffects } from '@/hooks/useEffects';
import { useAppConfig } from '@/hooks/useAppConfig';
import { useTheme } from '@/hooks/useTheme';
import { RecentStatsProvider } from '@/hooks/useRecentStats';
import { usePrivacyMode } from '@/hooks/usePrivacyMode';
import { useSiteMeta } from '@/hooks/useSiteMeta';
import { useFleetSummary } from '@/hooks/useFleetSummary';
import { getCommanderLogoDataUri } from '@/lib/commanderLogo';
import { Dashboard } from '@/pages/Dashboard';
import { NodeDetailPage } from '@/pages/NodeDetailPage';
import { NodeNetworkPage } from '@/pages/NodeNetworkPage';

function App() {
  const [viewMode, setViewMode] = useState<ViewMode>(getInitialViewMode);
  const location = useLocation();

  const { nodes, loading, refreshNodes } = useNodes();
  const { activeEffects } = useEffects();
  const appConfig = useAppConfig();
  const { resolvedTheme, setTheme } = useTheme();
  const { maskNodes, setDefaultPrivacyMode } = usePrivacyMode();
  const { siteName, siteDescription, version, customBody } = useSiteMeta();
  const fleetSummary = useFleetSummary(nodes);

  const { themeConfig } = appConfig;
  const logoSrc = useMemo(() => getCommanderLogoDataUri(resolvedTheme), [resolvedTheme]);

  useEffect(() => {
    if (!appConfig.loaded) return;
    const savedTheme = localStorage.getItem('appearance');
    if (!savedTheme) {
      setTheme(themeConfig.default_theme);
    }
  }, [appConfig.loaded, themeConfig.default_theme, setTheme]);

  useEffect(() => {
    if (!appConfig.loaded) return;
    setDefaultPrivacyMode(themeConfig.enable_privacy_mode);
  }, [appConfig.loaded, themeConfig.enable_privacy_mode, setDefaultPrivacyMode]);

  const maskedNodes = useMemo(() => maskNodes(nodes), [maskNodes, nodes]);

  const hubNodeUuid = useMemo<string | null>(() => {
    const target = themeConfig.globe_hub_node?.trim().toLowerCase();
    if (!target) return null;
    const match = nodes.find(n => n.name.trim().toLowerCase() === target);
    return match?.uuid ?? null;
  }, [nodes, themeConfig.globe_hub_node]);

  const handleSetViewMode = useCallback((mode: ViewMode) => {
    setViewMode(mode);
    localStorage.setItem('nodeViewMode', mode);
  }, []);

  useEffect(() => {
    if (!appConfig.loaded) return;
    const savedView = localStorage.getItem('nodeViewMode');
    const isViewEnabled = (v: ViewMode) => {
      if (v === 'globe') return themeConfig.enable_globe;
      if (v === 'uptime') return themeConfig.enable_uptime;
      return true;
    };
    if (!savedView) {
      setViewMode(themeConfig.default_view);
    } else if (!isViewEnabled(viewMode)) {
      handleSetViewMode(themeConfig.default_view);
    }
  }, [
    appConfig.loaded,
    themeConfig.default_view,
    themeConfig.enable_globe,
    themeConfig.enable_uptime,
    viewMode,
    handleSetViewMode,
  ]);

  const isDashboard = location.pathname === '/';
  const { networkStats, avgCpu, cpuSampled, onlineUuids, hasCriticalNode } = fleetSummary;
  const shouldFetchSparklines = isDashboard && (viewMode === 'grid' || viewMode === 'table') && appConfig.isLoggedIn;
  const showFooterMetaOnMobile = Boolean(appConfig.isLoggedIn && version);

  const nodesContextValue = useMemo(
    () => ({ nodes: maskedNodes, loading, refreshNodes, hubNodeUuid }),
    [maskedNodes, loading, refreshNodes, hubNodeUuid],
  );

  const viewModeContextValue = useMemo(
    () => ({ viewMode, setViewMode: handleSetViewMode }),
    [viewMode, handleSetViewMode],
  );

  return (
    <NodesContext.Provider value={nodesContextValue}>
      <RecentStatsProvider onlineUuids={onlineUuids} enabled={shouldFetchSparklines}>
        <ViewModeContext.Provider value={viewModeContextValue}>
          <div className="min-h-dvh flex flex-col bg-background text-foreground">
            <AppHeader
              siteName={siteName}
              siteDescription={siteDescription}
              logoSrc={logoSrc}
              hasCriticalNode={hasCriticalNode}
            />

            <main className="flex-1 container mx-auto px-3 sm:px-4 py-5 sm:py-7">
              <Routes>
                <Route path="/" element={<Dashboard />} />
                <Route path="/node/:uuid" element={<NodeDetailPage />} />
                <Route path="/node/:uuid/network" element={<NodeNetworkPage />} />
              </Routes>
            </main>

            <AppFooter
              avgCpu={avgCpu}
              cpuSampled={cpuSampled}
              totalUp={networkStats.totalUp}
              totalDown={networkStats.totalDown}
              customBody={customBody}
              version={version}
              customFooter={themeConfig.custom_footer}
              showFooterMetaOnMobile={showFooterMetaOnMobile}
            />

            <Starfield />
            <EffectsOverlay activeEffects={activeEffects} />
          </div>
        </ViewModeContext.Provider>
      </RecentStatsProvider>
    </NodesContext.Provider>
  );
}

export default App;
