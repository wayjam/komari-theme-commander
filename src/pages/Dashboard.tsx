import { Suspense, useState, useCallback } from 'react';
import { AnimatePresence, motion, useReducedMotion } from 'motion/react';
import { useNavigate } from 'react-router-dom';
import { ViewLoadingFallback } from '@/components/ViewLoadingFallback';
import { useNodesContext } from '@/contexts/NodesContext';
import { useViewMode } from '@/contexts/ViewModeContext';
import { ChartModal, GlobeView, NodeList, UptimeView } from '@/lib/lazyViews';

export function Dashboard() {
  const { viewMode } = useViewMode();
  const reduceMotion = useReducedMotion();
  const [chartModal, setChartModal] = useState<{ uuid: string; name: string } | null>(null);
  const navigate = useNavigate();
  const { nodes, loading, refreshNodes, hubNodeUuid } = useNodesContext();

  const handleViewCharts = useCallback((uuid: string, name: string) => {
    if (viewMode === 'globe') {
      setChartModal({ uuid, name });
    } else {
      navigate(`/node/${uuid}`);
    }
  }, [viewMode, navigate]);

  const viewTransition = reduceMotion ? { duration: 0 } : { duration: 0.2, ease: [0.25, 1, 0.5, 1] as const };

  return (
    <>
      <Suspense fallback={<ViewLoadingFallback />}>
        <AnimatePresence mode="wait" initial={false}>
          <motion.div
            key={viewMode}
            initial={
              reduceMotion
                ? { opacity: 1, y: 0 }
                : { opacity: 0, y: 10 }
            }
            animate={{ opacity: 1, y: 0 }}
            exit={
              reduceMotion
                ? { opacity: 1, y: 0 }
                : { opacity: 0, y: -8 }
            }
            transition={viewTransition}
            className="min-w-0"
          >
            {viewMode === 'globe' ? (
              <GlobeView
                nodes={nodes}
                loading={loading}
                onViewCharts={handleViewCharts}
                hubNodeUuid={hubNodeUuid}
              />
            ) : viewMode === 'uptime' ? (
              <UptimeView nodes={nodes} />
            ) : (
              <NodeList
                nodes={nodes}
                loading={loading}
                onRefresh={refreshNodes}
                defaultView={viewMode === 'grid' ? 'grid' : 'table'}
              />
            )}
          </motion.div>
        </AnimatePresence>
      </Suspense>

      {chartModal && (
        <Suspense fallback={null}>
          <ChartModal
            nodeUuid={chartModal.uuid}
            nodeName={chartModal.name}
            onClose={() => setChartModal(null)}
          />
        </Suspense>
      )}
    </>
  );
}
