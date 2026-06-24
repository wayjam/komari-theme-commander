import { createContext, useContext } from 'react';
import type { NodeWithStatus } from '@/services/api';

export interface NodesContextType {
  nodes: NodeWithStatus[];
  loading: boolean;
  refreshNodes: () => Promise<void>;
  /** UUID of the node configured as the globe-view "hub" (arcs anchor).
   *  Resolved from `themeConfig.globe_hub_node` against the *unmasked* node
   *  list, so the field always matches the original real name even after
   *  privacy mode renames everything in the masked list. `null` when no
   *  hub is configured or the configured name doesn't match any node. */
  hubNodeUuid: string | null;
}

export const NodesContext = createContext<NodesContextType>({
  nodes: [],
  loading: false,
  refreshNodes: async () => {},
  hubNodeUuid: null,
});

export function useNodesContext() {
  return useContext(NodesContext);
}
