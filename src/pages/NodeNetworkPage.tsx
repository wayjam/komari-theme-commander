import { Suspense } from 'react';
import { useParams } from 'react-router-dom';
import { ViewLoadingFallback } from '@/components/ViewLoadingFallback';
import { useNodesContext } from '@/contexts/NodesContext';
import { NodeNetwork } from '@/lib/lazyViews';

export function NodeNetworkPage() {
  const { uuid } = useParams<{ uuid: string }>();
  const { nodes } = useNodesContext();
  const node = nodes.find(n => n.uuid === uuid);
  if (!uuid) return null;
  return (
    <Suspense fallback={<ViewLoadingFallback />}>
      <NodeNetwork nodeUuid={uuid} node={node} />
    </Suspense>
  );
}
