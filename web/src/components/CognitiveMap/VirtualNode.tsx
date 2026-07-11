import { useState, useCallback, useRef, useEffect } from 'react';

export interface VirtualNodeData {
  id: string;
  label: string;
  childNodeIds: string[];
  expanded: boolean;
  x?: number;
  y?: number;
}

export interface ViewState {
  virtualNodes: VirtualNodeData[];
  expandedNodes: string[];
  version: number;
}

const DEFAULT_VIEW_STATE: ViewState = { virtualNodes: [], expandedNodes: [], version: 1 };

function openDB(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open('causal-map-db', 1);
    request.onupgradeneeded = () => {
      request.result.createObjectStore('view-states', { keyPath: 'id' });
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

async function loadViewState(): Promise<ViewState> {
  try {
    const db = await openDB();
    return new Promise((resolve, reject) => {
      const tx = db.transaction('view-states', 'readonly');
      const req = tx.objectStore('view-states').get('current');
      req.onsuccess = () => resolve(req.result?.data ?? DEFAULT_VIEW_STATE);
      req.onerror = () => reject(req.error);
    });
  } catch {
    return DEFAULT_VIEW_STATE;
  }
}

async function saveViewState(state: ViewState): Promise<void> {
  try {
    const db = await openDB();
    return new Promise((resolve, reject) => {
      const tx = db.transaction('view-states', 'readwrite');
      tx.objectStore('view-states').put({ id: 'current', data: state });
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
  } catch {
    // Silently fail if IndexedDB is unavailable
  }
}

export function useVirtualNodes() {
  const [viewState, setViewState] = useState<ViewState>(DEFAULT_VIEW_STATE);
  const [dbReady, setDbReady] = useState(false);

  useEffect(() => {
    loadViewState().then(state => {
      setViewState(state);
      setDbReady(true);
    }).catch(() => {
      setDbReady(true);
    });
  }, []);

  useEffect(() => {
    if (dbReady) {
      saveViewState(viewState);
    }
  }, [viewState, dbReady]);

  const packNodes = useCallback((nodeIds: string[], label: string) => {
    setViewState(prev => {
      const newId = `virtual-${Date.now()}`;
      const newVirtual: VirtualNodeData = {
        id: newId,
        label,
        childNodeIds: [...nodeIds],
        expanded: false,
      };
      return {
        ...prev,
        virtualNodes: [...prev.virtualNodes, newVirtual],
        version: prev.version + 1,
      };
    });
  }, []);

  const unpackNode = useCallback((virtualNodeId: string) => {
    setViewState(prev => ({
      ...prev,
      virtualNodes: prev.virtualNodes.filter(vn => vn.id !== virtualNodeId),
      expandedNodes: prev.expandedNodes.filter(id => id !== virtualNodeId),
      version: prev.version + 1,
    }));
  }, []);

  const toggleExpand = useCallback((virtualNodeId: string) => {
    setViewState(prev => ({
      ...prev,
      virtualNodes: prev.virtualNodes.map(vn =>
        vn.id === virtualNodeId ? { ...vn, expanded: !vn.expanded } : vn
      ),
      version: prev.version + 1,
    }));
  }, []);

  const getVirtualNodeById = useCallback(
    (id: string) => viewState.virtualNodes.find(vn => vn.id === id),
    [viewState.virtualNodes]
  );

  const getVirtualNodeByChildId = useCallback(
    (childId: string) => viewState.virtualNodes.find(vn => vn.childNodeIds.includes(childId)),
    [viewState.virtualNodes]
  );

  const getVisibleNodes = useCallback(
    (allNodeIds: string[]): string[] => {
      const hiddenIds = new Set<string>();
      viewState.virtualNodes.forEach(vn => {
        if (!vn.expanded) {
          vn.childNodeIds.forEach(id => hiddenIds.add(id));
        }
      });
      return allNodeIds.filter(id => !hiddenIds.has(id));
    },
    [viewState.virtualNodes]
  );

  const isNodeHidden = useCallback(
    (nodeId: string): boolean => {
      for (const vn of viewState.virtualNodes) {
        if (!vn.expanded && vn.childNodeIds.includes(nodeId)) {
          return true;
        }
      }
      return false;
    },
    [viewState.virtualNodes]
  );

  return {
    viewState,
    packNodes,
    unpackNode,
    toggleExpand,
    getVirtualNodeById,
    getVirtualNodeByChildId,
    getVisibleNodes,
    isNodeHidden,
  };
}

// Hover preview tooltip hook
export function usePerspectiveMode() {
  const [perspectiveNode, setPerspectiveNode] = useState<{
    id: string;
    label: string;
    x: number;
    y: number;
    isVirtual: boolean;
    childCount?: number;
    incomingCount?: number;
    outgoingCount?: number;
    avgConf?: number;
  } | null>(null);
  const hoverTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const handleMouseEnter = useCallback(
    (nodeData: {
      id: string;
      label: string;
      isVirtual: boolean;
      childCount?: number;
      incomingCount?: number;
      outgoingCount?: number;
      avgConf?: number;
    }) => {
      hoverTimerRef.current = setTimeout(() => {
        setPerspectiveNode({
          ...nodeData,
          x: 0,
          y: 0,
        });
      }, 500);
    },
    []
  );

  const handleMouseLeave = useCallback(() => {
    if (hoverTimerRef.current) {
      clearTimeout(hoverTimerRef.current);
      hoverTimerRef.current = null;
    }
    setPerspectiveNode(null);
  }, []);

  const handleMouseMove = useCallback((x: number, y: number) => {
    setPerspectiveNode(prev => (prev ? { ...prev, x, y } : null));
  }, []);

  useEffect(() => {
    return () => {
      if (hoverTimerRef.current) {
        clearTimeout(hoverTimerRef.current);
      }
    };
  }, []);

  return {
    perspectiveNode,
    setPerspectiveNode,
    handleMouseEnter,
    handleMouseLeave,
    handleMouseMove,
  };
}