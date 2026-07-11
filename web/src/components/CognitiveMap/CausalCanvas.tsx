import { useEffect, useRef, useState, useCallback, useMemo } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import cytoscape, { Core, ElementDefinition } from 'cytoscape';
import { Spinner, Warning, Quotes, X, PencilSimple, Check } from '@phosphor-icons/react';
import api from '../../lib/api';
import CausalToolbar, { LayoutType } from './CausalToolbar';
import CausalNodeDetail from './CausalNodeDetail';
import CausalContextMenu from './CausalContextMenu';
import CausalReasoningPanel from './CausalReasoningPanel';
import CausalSuggestions from './CausalSuggestions';
import CausalAlertPanel from './CausalAlertPanel';
import CausalVersionPanel from './CausalVersionPanel';
import IntentBar from './IntentBar';
import ViewManager from './ViewManager';
import {
  useVirtualNodes,
  usePerspectiveMode,
} from './VirtualNode';

interface EdgeTooltip {
  visible: boolean;
  x: number;
  y: number;
  edgeId: string;
  sourceSlug: string;
  targetSlug: string;
  relation: string;
  weight: number;
  conf: number;
  evidenceSpanIds: string[];
  evidenceSpans: Array<{ spanId: string; source: string; text: string }>;
  loading: boolean;
}

interface HyperedgeContextMenu {
  visible: boolean;
  x: number;
  y: number;
  hyperedgeId: number;
  type: string;
  params: { weight?: number; conf?: number };
  sourceSlugs: string[];
  targetSlugs: string[];
  editing: boolean;
}

interface CausalEdge {
  id: string;
  source_slug: string;
  target_slug: string;
  relation: string;
  lag: string;
  weight: number;
  conf: number;
  evidence: unknown;
}

interface CPT {
  id: string;
  variable_slug: string;
  conditions: Record<string, unknown>;
  probabilities: unknown;
}

interface CausalGraphData {
  edges: CausalEdge[];
  cpts: CPT[];
}

interface HypergraphData {
  hyperedges: Array<{
    id: number;
    source_slugs: string[];
    target_slugs: string[];
    type: string;
    params: { weight?: number; conf?: number };
  }>;
  causalHyperedges: Array<any>;
  cpts: Array<any>;
}

interface KnowledgeGraphData {
  nodes: Array<{
    id: string;
    label: string;
    title?: string;
    type: string;
    slug?: string;
    weight?: number;
    x?: number;
    y?: number;
  }>;
  edges: Array<{
    id: string;
    source: string;
    target: string;
    relation: string;
    weight: number;
  }>;
}

function getNodeStatusColor(conf: number): string {
  if (conf >= 0.7) return '#22c55e';
  if (conf >= 0.3) return '#f97316';
  return '#94a3b8';
}

function getEdgeStyle(relation: string): {
  color: string;
  style: 'solid' | 'dashed';
} {
  if (relation.includes('causesIncrease')) return { color: '#22c55e', style: 'solid' };
  if (relation.includes('causesDecrease')) return { color: '#ef4444', style: 'solid' };
  if (relation.includes('inhibits')) return { color: '#f97316', style: 'solid' };
  if (relation.includes('feedbackLoop')) return { color: '#3b82f6', style: 'dashed' };
  if (relation.includes('jointlyCause')) return { color: '#a855f7', style: 'solid' };
  if (relation.includes('达成决议')) return { color: '#06b6d4', style: 'dashed' };
  return { color: '#94a3b8', style: 'solid' };
}

function getRelationLabel(relation: string): string {
  const map: Record<string, string> = {
    ':causesIncrease': '正向因果',
    ':causesDecrease': '负向因果',
    ':inhibits': '抑制',
    ':feedbackLoop': '反馈回路',
    ':jointlyCause': '联合因果',
    ':达成决议': '达成决议',
  };
  return map[relation] || relation;
}

export default function CausalCanvas() {
  const cyRef = useRef<HTMLDivElement>(null);
  const cyInstanceRef = useRef<Core | null>(null);
  const [layout, setLayout] = useState<LayoutType>('cose');
  const [searchQuery, setSearchQuery] = useState('');
  const [showFeedbackLoops, setShowFeedbackLoops] = useState(true);
  const [showLowConfidence, setShowLowConfidence] = useState(true);
  const [showKnowledgeEdges, setShowKnowledgeEdges] = useState(true);
  const [showCausalEdges, setShowCausalEdges] = useState(true);
  const [selectedNode, setSelectedNode] = useState<{
    id: string;
    label: string;
    incoming: CausalEdge[];
    outgoing: CausalEdge[];
    cpt: CPT | null;
  } | null>(null);
  const [contextMenu, setContextMenu] = useState<{
    visible: boolean;
    x: number;
    y: number;
    isVirtualNode: boolean;
    multiSelected: boolean;
    selectedNodeIds: string[];
  }>({
    visible: false,
    x: 0,
    y: 0,
    isVirtualNode: false,
    multiSelected: false,
    selectedNodeIds: [],
  });
  const [selectedNodeIds, setSelectedNodeIds] = useState<Set<string>>(new Set());
  const [showReasoningPanel, setShowReasoningPanel] = useState(false);
  const [showAlertPanel, setShowAlertPanel] = useState(false);
  const [triggeredEdgeIds, setTriggeredEdgeIds] = useState<Set<string>>(new Set());
  const [showVersionPanel, setShowVersionPanel] = useState(false);
  const [showViewManager, setShowViewManager] = useState(false);
  const [highlightedCluster, setHighlightedCluster] = useState<string[] | null>(null);
  const [edgeTooltip, setEdgeTooltip] = useState<EdgeTooltip>({
    visible: false,
    x: 0,
    y: 0,
    edgeId: '',
    sourceSlug: '',
    targetSlug: '',
    relation: '',
    weight: 0,
    conf: 0,
    evidenceSpanIds: [],
    evidenceSpans: [],
    loading: false,
  });
  const [hyperedgeMenu, setHyperedgeMenu] = useState<HyperedgeContextMenu>({
    visible: false,
    x: 0,
    y: 0,
    hyperedgeId: 0,
    type: '',
    params: {},
    sourceSlugs: [],
    targetSlugs: [],
    editing: false,
  });
  const [editWeight, setEditWeight] = useState('0.5');
  const [editConf, setEditConf] = useState('0.5');
  const [editType, setEditType] = useState('');
  const [isDeleting, setIsDeleting] = useState(false);
  const [isSavingEdit, setIsSavingEdit] = useState(false);
  const evidenceCacheRef = useRef<Map<number, Array<{ spanId: string; source: string; text: string }>>>(new Map());

  const {
    viewState,
    packNodes,
    unpackNode,
    toggleExpand,
    getVirtualNodeById,
    getVirtualNodeByChildId,
    getVisibleNodes,
    isNodeHidden,
  } = useVirtualNodes();

  const {
    perspectiveNode,
    setPerspectiveNode,
    handleMouseEnter,
    handleMouseLeave,
    handleMouseMove,
  } = usePerspectiveMode();

  const queryClient = useQueryClient();

  const { data, isLoading, error } = useQuery<CausalGraphData>({
    queryKey: ['causal-graph'],
    queryFn: () => api.getCausalGraph(),
    staleTime: 60_000,
  });

  const { data: hypergraphData } = useQuery<HypergraphData>({
    queryKey: ['hypergraph'],
    queryFn: () => api.getHypergraph(),
    staleTime: 60_000,
  });

  const { data: graphData } = useQuery<KnowledgeGraphData>({
    queryKey: ['graph-data'],
    queryFn: () => api.getGraphData(),
    staleTime: 60_000,
  });

  // Build node/edge maps from data
  const nodeMap = useMemo(() => {
    if (!data) return new Map<string, { incoming: CausalEdge[]; outgoing: CausalEdge[]; conf: number }>();
    const map = new Map<string, { incoming: CausalEdge[]; outgoing: CausalEdge[]; conf: number }>();
    for (const edge of data.edges) {
      if (!map.has(edge.source_slug)) {
        map.set(edge.source_slug, { incoming: [], outgoing: [], conf: 0 });
      }
      if (!map.has(edge.target_slug)) {
        map.set(edge.target_slug, { incoming: [], outgoing: [], conf: 0 });
      }
      map.get(edge.source_slug)!.outgoing.push(edge);
      map.get(edge.target_slug)!.incoming.push(edge);
    }
    // Calculate average conf per node
    for (const [slug, info] of map) {
      const allEdges = [...info.incoming, ...info.outgoing];
      if (allEdges.length > 0) {
        info.conf = allEdges.reduce((sum, e) => sum + e.conf, 0) / allEdges.length;
      }
    }
    return map;
  }, [data]);

  const cptMap = useMemo(() => {
    if (!data) return new Map<string, CPT>();
    const map = new Map<string, CPT>();
    for (const cpt of data.cpts) {
      map.set(cpt.variable_slug, cpt);
    }
    return map;
  }, [data]);

  // Build cytoscape elements
  const elements = useMemo(() => {
    if (!data) return [];

    const visibleNodeIds = new Set(getVisibleNodes(Array.from(nodeMap.keys())));

    // Also add hyperedge source/target slugs to the visible set
    const hyperNodeSlugs = new Set<string>();
    if (hypergraphData?.hyperedges) {
      for (const he of hypergraphData.hyperedges) {
        for (const s of he.source_slugs) { hyperNodeSlugs.add(s); visibleNodeIds.add(s); }
        for (const t of he.target_slugs) { hyperNodeSlugs.add(t); visibleNodeIds.add(t); }
      }
    }

    // Dedup map: keyed by slug, prefer knowledge graph label/title
    const dedupMap = new Map<string, { id: string; label: string; conf: number; isKnowledge?: boolean }>();

    // First pass: causal map nodes
    for (const slug of visibleNodeIds) {
      const info = nodeMap.get(slug);
      if (info) {
        dedupMap.set(slug, { id: slug, label: slug, conf: info.conf });
      } else if (hyperNodeSlugs.has(slug)) {
        dedupMap.set(slug, { id: slug, label: slug, conf: 0.5 });
      }
    }

    // Second pass: knowledge graph nodes (overwrite label if already exists)
    const kgIdToSlug = new Map<string, string>();
    if (graphData?.nodes) {
      for (const gn of graphData.nodes) {
        const slug = gn.slug || gn.id;
        kgIdToSlug.set(gn.id, slug);
        const existing = dedupMap.get(slug);
        if (existing) {
          existing.label = gn.title || gn.label;
          existing.isKnowledge = true;
        } else {
          dedupMap.set(slug, { id: slug, label: gn.title || gn.label, conf: 0.5, isKnowledge: true });
        }
      }
    }

    const nodeElements: ElementDefinition[] = [];
    for (const [slug, info] of dedupMap) {
      nodeElements.push({
        data: {
          id: slug,
          label: info.label,
          conf: info.conf,
          ...(info.isKnowledge ? { type: 'knowledge' } : {}),
        },
      });
    }

    // Add virtual nodes
    for (const vn of viewState.virtualNodes) {
      const visibleChildIds = vn.childNodeIds.filter(id => visibleNodeIds.has(id));
      if (visibleChildIds.length === 0 && !vn.expanded) continue;
      nodeElements.push({
        data: {
          id: vn.id,
          label: `${vn.label} (${vn.childNodeIds.length})`,
          conf: 0.8,
          isVirtual: true,
          childCount: vn.childNodeIds.length,
          expanded: vn.expanded,
        },
      });
    }

    const edgeElements: ElementDefinition[] = [];
    for (const edge of data.edges) {
      const sourceId = edge.source_slug;
      const targetId = edge.target_slug;

      // Check if source or target is inside a virtual node
      let actualSource = sourceId;
      let actualTarget = targetId;

      const sourceVirtual = getVirtualNodeByChildId(sourceId);
      const targetVirtual = getVirtualNodeByChildId(targetId);

      if (sourceVirtual && !sourceVirtual.expanded) {
        actualSource = sourceVirtual.id;
      }
      if (targetVirtual && !targetVirtual.expanded) {
        actualTarget = targetVirtual.id;
      }

      // Skip if both ends hidden
      if (isNodeHidden(sourceId) && isNodeHidden(targetId)) continue;

      // Skip if source/target is not visible and not replaced by virtual node
      if (!visibleNodeIds.has(actualSource) && !viewState.virtualNodes.find(vn => vn.id === actualSource)) continue;
      if (!visibleNodeIds.has(actualTarget) && !viewState.virtualNodes.find(vn => vn.id === actualTarget)) continue;

      edgeElements.push({
        data: {
          id: `ce_${edge.id}`,
          source: actualSource,
          target: actualTarget,
          relation: edge.relation,
          weight: edge.weight,
          conf: edge.conf,
          lag: edge.lag,
          evidence: Array.isArray(edge.evidence) ? edge.evidence : [],
        },
      });
    }

    // Knowledge graph edges
    if (graphData?.edges) {
      for (const edge of graphData.edges) {
        const sourceSlug = kgIdToSlug.get(edge.source) || edge.source;
        const targetSlug = kgIdToSlug.get(edge.target) || edge.target;
        if (!dedupMap.has(sourceSlug) || !dedupMap.has(targetSlug)) continue;
        edgeElements.push({
          data: {
            id: `kg_${edge.id}`,
            source: sourceSlug,
            target: targetSlug,
            label: edge.relation,
            type: 'knowledge',
            relation: edge.relation,
            weight: edge.weight,
            conf: 0.5,
            evidence: [],
          },
        });
      }
    }

    // Process hyperedges into Cytoscape edge elements
    if (hypergraphData?.hyperedges) {
      for (const he of hypergraphData.hyperedges) {
        for (const source of (he.source_slugs || [])) {
          for (const target of (he.target_slugs || [])) {
            edgeElements.push({
              data: {
                id: `he_${he.id}_${source}_${target}`,
                source,
                target,
                label: he.type,
                type: he.type,
                weight: he.params?.weight || 0.5,
                conf: he.params?.conf || 0.5,
                evidence: [],
              },
              classes: 'hyperedge',
            });
          }
        }
      }
    }

    return [...nodeElements, ...edgeElements];
  }, [data, hypergraphData, graphData, nodeMap, viewState, getVisibleNodes, getVirtualNodeByChildId, isNodeHidden]);

  const nodeCount = useMemo(() => {
    if (!data) return 0;
    const slugs = new Set<string>();
    for (const edge of data.edges) {
      slugs.add(edge.source_slug);
      slugs.add(edge.target_slug);
    }
    if (hypergraphData?.hyperedges) {
      for (const he of hypergraphData.hyperedges) {
        for (const s of he.source_slugs) slugs.add(s);
        for (const t of he.target_slugs) slugs.add(t);
      }
    }
    if (graphData?.nodes) {
      for (const gn of graphData.nodes) {
        slugs.add(gn.slug || gn.id);
      }
    }
    return slugs.size;
  }, [data, hypergraphData, graphData]);

  const edgeCount = (data?.edges.length || 0) +
    (hypergraphData?.hyperedges?.reduce((sum, he) => sum + (he.source_slugs?.length || 0) * (he.target_slugs?.length || 0), 0) || 0) +
    (graphData?.edges?.length || 0);

  const allNodeSlugs = useMemo(() => Array.from(nodeMap.keys()), [nodeMap]);
  const selectedNodes = useMemo(() => Array.from(selectedNodeIds), [selectedNodeIds]);

  // Initialize cytoscape
  // Performance: Cytoscape.js uses native viewport-based rendering optimization
  useEffect(() => {
    if (!cyRef.current || isLoading || !data) return;

    if (cyInstanceRef.current) {
      cyInstanceRef.current.destroy();
    }

    const cy = cytoscape({
      container: cyRef.current,
      elements,
      style: [
        {
          selector: 'node',
          style: {
            'background-color': '#94a3b8',
            'shape': 'ellipse',
            'label': 'data(label)',
            'color': '#334155',
            'font-size': '10px',
            'text-valign': 'bottom',
            'text-halign': 'center',
            'text-margin-y': 4,
            'width': 30,
            'height': 30,
            'transition-property': 'background-color, width, height',
            'transition-duration': 0.2,
          },
        },
        {
          selector: 'node[isVirtual]',
          style: {
            'background-color': '#8b5cf6',
            'border-width': 3,
            'border-color': '#7c3aed',
            'border-style': 'dashed',
            'width': 44,
            'height': 44,
            'font-size': '11px',
            'font-weight': 'bold',
          },
        },
        {
          selector: 'node[isVirtual][expanded = true]',
          style: {
            'border-style': 'solid',
            'background-opacity': 0.3,
          },
        },
        {
          selector: 'node[type="knowledge"]',
          style: {
            'background-color': '#93c5fd',
            'border-color': '#3b82f6',
            'border-width': 2,
            'color': '#1e3a5f',
            'font-size': 12,
          },
        },
        {
          selector: 'edge',
          style: {
            'width': 1.5,
            'line-color': '#94a3b8',
            'target-arrow-color': '#94a3b8',
            'target-arrow-shape': 'triangle',
            'curve-style': 'bezier',
            'label': 'data(label)',
            'font-size': '8px',
            'color': '#64748b',
            'text-rotation': 'autorotate',
          },
        },
        {
          selector: 'edge[type=":jointlyCause"]',
          style: {
            'line-color': '#a855f7',
            'target-arrow-color': '#a855f7',
            'width': 3,
            'line-style': 'solid',
            'curve-style': 'bezier',
            'opacity': 0.8,
            'target-arrow-shape': 'triangle',
            'label': 'data(label)',
            'font-size': 10,
            'color': '#a855f7',
            'text-background-color': '#ffffff',
            'text-background-opacity': 0.7,
          },
        },
        {
          selector: 'edge[type=":达成决议"]',
          style: {
            'line-color': '#06b6d4',
            'target-arrow-color': '#06b6d4',
            'width': 2,
            'line-style': 'dashed',
            'curve-style': 'bezier',
            'opacity': 0.7,
            'target-arrow-shape': 'triangle',
            'label': 'data(label)',
            'font-size': 10,
            'color': '#06b6d4',
          },
        },
        {
          selector: 'edge[type="knowledge"]',
          style: {
            'line-color': '#3b82f6',
            'target-arrow-color': '#3b82f6',
            'width': 1.5,
            'line-style': 'dashed',
            'curve-style': 'bezier',
            'opacity': 0.6,
            'target-arrow-shape': 'triangle',
            'label': 'data(label)',
            'font-size': 9,
            'color': '#3b82f6',
            'text-background-color': '#ffffff',
            'text-background-opacity': 0.5,
          },
        },
        {
          selector: '.highlighted',
          style: {
            'border-width': 4,
            'border-color': '#f59e0b',
            'border-opacity': 0.9,
            'overlay-color': '#f59e0b',
            'overlay-opacity': 0.25,
            'overlay-padding': 6,
          },
        },
        {
          selector: '.dimmed',
          style: {
            'opacity': 0.2,
          },
        },
        {
          selector: '.selected-node',
          style: {
            'border-width': 3,
            'border-color': '#6366f1',
            'border-opacity': 1,
          },
        },
        {
          selector: '.hyperedge',
          style: {
            'line-color': '#a855f7',
            'target-arrow-color': '#a855f7',
            'width': 3.5,
            'line-style': 'solid',
            'curve-style': 'bezier',
            'opacity': 0.85,
            'target-arrow-shape': 'triangle',
            'label': 'data(label)',
            'font-size': 9,
            'color': '#a855f7',
            'text-background-color': '#ffffff',
            'text-background-opacity': 0.7,
          },
        },
      ],
      layout: {
        name: layout,
        animate: true,
        animationDuration: 500,
        padding: 40,
        ...(layout === 'cose'
          ? {
              idealEdgeLength: 100,
              nodeRepulsion: 8000,
              numIter: 1000,
            }
          : {}),
      } as cytoscape.LayoutOptions,
      userPanningEnabled: true,
      userZoomingEnabled: true,
      boxSelectionEnabled: true,
      autoungrabify: false,
    });

    cyInstanceRef.current = cy;

    // Apply node colors based on conf
    cy.nodes().forEach(node => {
      const conf = node.data('conf') as number;
      const color = getNodeStatusColor(conf);
      if (!node.data('isVirtual')) {
        node.style('background-color', color);
      }
    });

    // Apply edge styles based on relation and confidence
    cy.edges().forEach(edge => {
      const relation = (edge.data('relation') || edge.data('type')) as string;
      const conf = edge.data('conf') as number;
      const style = getEdgeStyle(relation);
      edge.style('line-color', style.color);
      edge.style('target-arrow-color', style.color);
      if (style.style === 'dashed') {
        edge.style('line-style', 'dashed');
      }
      // 12d: Confidence-based width and opacity
      const width = 1 + conf * 3;
      const opacity = 0.3 + conf * 0.7;
      edge.style('width', width);
      edge.style('opacity', opacity);
      edge.style('label', `${getRelationLabel(relation)} w:${(edge.data('weight') as number).toFixed(1)}`);
    });

    // Node drag support
    cy.on('dragfree', 'node', () => {
      // Nodes are draggable by default with cytoscape
    });

    // Click on node to select / deselect
    cy.on('tap', 'node', (evt) => {
      const node = evt.target;
      const nodeId = node.data('id');
      const isVirtual = !!node.data('isVirtual');

      if (evt.originalEvent?.ctrlKey || evt.originalEvent?.metaKey) {
        setSelectedNodeIds(prev => {
          const next = new Set(prev);
          if (next.has(nodeId)) {
            next.delete(nodeId);
          } else {
            next.add(nodeId);
          }
          return next;
        });
        return;
      }

      // Clear multi-select on single click without ctrl
      setSelectedNodeIds(new Set());

      if (isVirtual) {
        const virtualNode = getVirtualNodeById(nodeId);
        if (virtualNode) {
          toggleExpand(nodeId);
        }
        return;
      }

      // Highlight neighborhood
      cy.elements().removeClass('highlighted dimmed');
      node.addClass('highlighted');
      node.neighborhood().addClass('highlighted');

      // Show node detail
      const info = nodeMap.get(nodeId);
      const cpt = cptMap.get(nodeId) || null;
      setSelectedNode({
        id: nodeId,
        label: node.data('label') as string,
        incoming: info?.incoming || [],
        outgoing: info?.outgoing || [],
        cpt,
      });
    });

    // Double-click on node to show tooltip
    cy.on('dblclick', 'node', (evt) => {
      const node = evt.target;
      const nodeId = node.data('id');
      const isVirtual = !!node.data('isVirtual');

      if (isVirtual) {
        toggleExpand(nodeId);
        return;
      }

      const info = nodeMap.get(nodeId);
      const cpt = cptMap.get(nodeId) || null;
      setSelectedNode({
        id: nodeId,
        label: node.data('label') as string,
        incoming: info?.incoming || [],
        outgoing: info?.outgoing || [],
        cpt,
      });
    });

    // Right-click context menu
    cy.on('cxttap', 'node', (evt) => {
      evt.originalEvent.preventDefault();
      const node = evt.target;
      const pos = evt.renderedPosition || { x: 0, y: 0 };
      const nodeId = node.data('id');
      const isVirtual = !!node.data('isVirtual');

      const currentSelected = new Set(selectedNodeIds);
      if (!currentSelected.has(nodeId)) {
        currentSelected.add(nodeId);
      }

      setContextMenu({
        visible: true,
        x: pos.x,
        y: pos.y,
        isVirtualNode: isVirtual,
        multiSelected: currentSelected.size > 1,
        selectedNodeIds: Array.from(currentSelected),
      });
    });

    // Tap on background to deselect
    cy.on('tap', (evt) => {
      if (evt.target === cy) {
        setContextMenu(prev => ({ ...prev, visible: false }));
        setSelectedNode(null);
        setSelectedNodeIds(new Set());
        setHighlightedCluster(null);
        cy.elements().removeClass('highlighted dimmed');
      }
    });

    // Mouse enter/leave for perspective mode
    cy.on('mouseover', 'node', (evt) => {
      const node = evt.target;
      const nodeId = node.data('id');
      const isVirtual = !!node.data('isVirtual');
      const info = nodeMap.get(nodeId);
      const childCount = node.data('childCount') as number | undefined;

      handleMouseEnter({
        id: nodeId,
        label: node.data('label') as string,
        isVirtual,
        childCount,
        incomingCount: info?.incoming.length,
        outgoingCount: info?.outgoing.length,
        avgConf: info?.conf,
      });
    });

    cy.on('mouseout', 'node', () => {
      handleMouseLeave();
    });

    cy.on('mousemove', 'node', (evt) => {
      handleMouseMove(evt.renderedPosition?.x || 0, evt.renderedPosition?.y || 0);
    });

    // 12c: Edge hover tooltip
    cy.on('mouseover', 'edge', (evt) => {
      const edge = evt.target;
      const edgeId = edge.data('id') as string;
      const sourceSlug = edge.data('source') as string;
      const targetSlug = edge.data('target') as string;
      const relation = (edge.data('relation') || edge.data('type')) as string;
      const weight = edge.data('weight') as number;
      const conf = edge.data('conf') as number;
      const evidenceSpanIds = (edge.data('evidence') as string[]) || [];

      const pos = evt.renderedPosition || { x: 0, y: 0 };

      setEdgeTooltip({
        visible: true,
        x: pos.x,
        y: pos.y,
        edgeId,
        sourceSlug,
        targetSlug,
        relation,
        weight,
        conf,
        evidenceSpanIds,
        evidenceSpans: [],
        loading: evidenceSpanIds.length > 0,
      });

      // Fetch evidence details if available
      if (evidenceSpanIds.length > 0) {
        const numericId = parseInt(edgeId.replace(/^ce_/, ''), 10);
        if (!isNaN(numericId) && evidenceCacheRef.current.has(numericId)) {
          setEdgeTooltip(prev => ({
            ...prev,
            evidenceSpans: evidenceCacheRef.current.get(numericId)!,
            loading: false,
          }));
        } else if (!isNaN(numericId)) {
          api.getCausalEvidence(numericId).then(res => {
            if (res.evidenceSpans) {
              evidenceCacheRef.current.set(numericId, res.evidenceSpans);
              setEdgeTooltip(prev => {
                if (prev.edgeId === edgeId) {
                  return { ...prev, evidenceSpans: res.evidenceSpans, loading: false };
                }
                return prev;
              });
            }
          }).catch(() => {
            setEdgeTooltip(prev => {
              if (prev.edgeId === edgeId) {
                return { ...prev, loading: false };
              }
              return prev;
            });
          });
        }
      }
    });

    cy.on('mouseout', 'edge', () => {
      setEdgeTooltip(prev => ({ ...prev, visible: false }));
    });

    cy.on('mousemove', 'edge', (evt) => {
      const pos = evt.renderedPosition || { x: 0, y: 0 };
      setEdgeTooltip(prev => {
        if (prev.visible) {
          return { ...prev, x: pos.x, y: pos.y };
        }
        return prev;
      });
    });

    // Tap on hyperedge to show context menu
    cy.on('tap', 'edge.hyperedge', (evt) => {
      evt.originalEvent?.stopPropagation();
      const edge = evt.target;
      const edgeId = edge.data('id') as string;
      const pos = evt.renderedPosition || { x: 0, y: 0 };

      // Extract hyperedge ID from Cytoscape edge ID (format: he_{id}_{source}_{target})
      const match = edgeId.match(/^he_(\d+)_/);
      if (!match) return;
      const hyperedgeId = parseInt(match[1], 10);

      // Find the hyperedge data
      const he = hypergraphData?.hyperedges?.find(h => h.id === hyperedgeId);
      if (!he) return;

      setHyperedgeMenu({
        visible: true,
        x: pos.x,
        y: pos.y,
        hyperedgeId: he.id,
        type: he.type,
        params: he.params || {},
        sourceSlugs: he.source_slugs || [],
        targetSlugs: he.target_slugs || [],
        editing: false,
      });
    });

    // Box selection
    cy.on('boxselect', (_evt) => {
      const selected = cy.nodes(':selected');
      const ids = new Set<string>();
      selected.forEach(n => { ids.add(n.data('id')); });
      setSelectedNodeIds(ids);
    });

    return () => {
      cy.destroy();
      cyInstanceRef.current = null;
    };
  }, [elements, isLoading, data, layout]);

  // Apply view state changes (virtual nodes, etc.) to cytoscape
  useEffect(() => {
    const cy = cyInstanceRef.current;
    if (!cy) return;
    // Rebuild happens through elements change, but we need to update styles
    cy.nodes().forEach(node => {
      const conf = node.data('conf') as number;
      if (!node.data('isVirtual')) {
        const color = getNodeStatusColor(conf);
        node.style('background-color', color);
      }
    });
    cy.edges().forEach(edge => {
      const relation = (edge.data('relation') || edge.data('type')) as string;
      const conf = edge.data('conf') as number;
      const style = getEdgeStyle(relation);
      edge.style('line-color', style.color);
      edge.style('target-arrow-color', style.color);
      edge.style('line-style', style.style);
      // 12d: Confidence-based width and opacity
      const width = 1 + conf * 3;
      const opacity = 0.3 + conf * 0.7;
      edge.style('width', width);
      edge.style('opacity', opacity);
      edge.style('label', `${getRelationLabel(relation)} w:${(edge.data('weight') as number).toFixed(1)}`);
    });
  }, [viewState]);

  // Filter edges
  useEffect(() => {
    const cy = cyInstanceRef.current;
    if (!cy) return;

    cy.edges().forEach(edge => {
      const type = edge.data('type') as string | undefined;
      const relation = (edge.data('relation') || edge.data('type')) as string;
      const conf = edge.data('conf') as number;

      let hidden = false;

      // Top-level: edge type filtering
      if (type === 'knowledge') {
        if (!showKnowledgeEdges) hidden = true;
        // Knowledge edges skip causal filters
      } else {
        if (!showCausalEdges) hidden = true;
        // Apply causal edge filters
        if (!showFeedbackLoops && relation.includes('feedbackLoop')) {
          hidden = true;
        }
        if (!showLowConfidence && conf < 0.3) {
          hidden = true;
        }
      }

      edge.style('display', hidden ? 'none' : 'element');

      if (!hidden) {
        // 12d: Re-apply confidence-based width and opacity
        const width = 1 + conf * 3;
        const opacity = 0.3 + conf * 0.7;
        edge.style('width', width);
        edge.style('opacity', opacity);
      }
    });
  }, [showKnowledgeEdges, showCausalEdges, showFeedbackLoops, showLowConfidence]);

  // Apply triggered alert visual styles
  useEffect(() => {
    const cy = cyInstanceRef.current;
    if (!cy) return;

    cy.edges().forEach(edge => {
      const edgeId = edge.data('id') as string;
      if (triggeredEdgeIds.has(edgeId)) {
        edge.style('line-color', '#ef4444');
        edge.style('target-arrow-color', '#ef4444');
        edge.style('width', 3);
        edge.addClass('alert-pulse');
      } else {
        // Reset to original style
        const relation = (edge.data('relation') || edge.data('type')) as string;
        const style = getEdgeStyle(relation);
        edge.style('line-color', style.color);
        edge.style('target-arrow-color', style.color);
        edge.style('width', 1.5);
        edge.removeClass('alert-pulse');
      }
    });

    // Add warning badge to source nodes of triggered edges
    cy.nodes().forEach(node => {
      const nodeId = node.data('id');
      const hasTriggeredOutgoing = Array.from(triggeredEdgeIds).some(eid => {
        const edgeEl = cy.getElementById(eid);
        return edgeEl.length > 0 && edgeEl.data('source') === nodeId;
      });
      if (hasTriggeredOutgoing) {
        node.style('border-width', 3);
        node.style('border-color', '#ef4444');
        node.addClass('alert-source');
      } else {
        if (!node.data('isVirtual')) {
          node.style('border-width', 0);
          node.removeClass('alert-source');
        }
      }
    });
  }, [triggeredEdgeIds]);

  // Apply cluster highlighting
  useEffect(() => {
    const cy = cyInstanceRef.current;
    if (!cy) return;

    cy.elements().removeClass('highlighted dimmed');

    if (highlightedCluster && highlightedCluster.length > 0) {
      const clusterSet = new Set(highlightedCluster);
      cy.nodes().forEach(node => {
        const nodeId = node.data('id') as string;
        if (clusterSet.has(nodeId)) {
          node.addClass('highlighted');
        } else {
          node.addClass('dimmed');
        }
      });
      cy.edges().addClass('dimmed');
    }
  }, [highlightedCluster]);

  const handleZoomIn = useCallback(() => {
    const cy = cyInstanceRef.current;
    if (!cy) return;
    cy.zoom(cy.zoom() * 1.2);
  }, []);

  const handleZoomOut = useCallback(() => {
    const cy = cyInstanceRef.current;
    if (!cy) return;
    cy.zoom(cy.zoom() / 1.2);
  }, []);

  const handleFit = useCallback(() => {
    cyInstanceRef.current?.fit(undefined, 40);
  }, []);

  const handleLayoutChange = useCallback((newLayout: LayoutType) => {
    setLayout(newLayout);
    const cy = cyInstanceRef.current;
    if (!cy) return;
    cy.layout({
      name: newLayout,
      animate: true,
      animationDuration: 500,
      padding: 40,
      ...(newLayout === 'cose'
        ? { idealEdgeLength: 100, nodeRepulsion: 8000, numIter: 1000 }
        : {}),
    } as cytoscape.LayoutOptions).run();
  }, []);

  const handleExportPng = useCallback(() => {
    const cy = cyInstanceRef.current;
    if (!cy) return;
    const pngData = cy.png({ scale: 2, bg: '#ffffff' });
    const link = document.createElement('a');
    link.href = pngData;
    link.download = `causal-map-${Date.now()}.png`;
    link.click();
  }, []);

  const handleLoadView = useCallback(async (viewId: string) => {
    const view = await api.loadView(viewId);
    if (view.snapshot?.hyperNodes) {
      // Apply the view snapshot to the canvas
      // Note: hyperNodes snapshot application depends on view state structure
    }
    if (view.snapshot?.layout) {
      const cy = cyInstanceRef.current;
      if (cy) {
        cy.layout({ name: view.snapshot.layout, animate: true, animationDuration: 500, padding: 40 }).run();
      }
    }
    if (view.snapshot?.zoomPan) {
      const cy = cyInstanceRef.current;
      if (cy) {
        cy.zoom(view.snapshot.zoomPan.scale);
        cy.pan({ x: view.snapshot.zoomPan.x, y: view.snapshot.zoomPan.y });
      }
    }
    if (view.snapshot?.filters?.showKnowledgeEdges !== undefined) {
      setShowKnowledgeEdges(view.snapshot.filters.showKnowledgeEdges);
    }
    if (view.snapshot?.filters?.showCausalEdges !== undefined) {
      setShowCausalEdges(view.snapshot.filters.showCausalEdges);
    }
    setShowViewManager(false);
  }, []);

  const handleSaveView = useCallback(async (saveName: string) => {
    const cy = cyInstanceRef.current;
    const viewId = `view_${Date.now()}`;
    const snapshot = {
      hyperNodes: viewState.virtualNodes,
      layout,
      zoomPan: {
        x: cy?.pan().x || 0,
        y: cy?.pan().y || 0,
        scale: cy?.zoom() || 1,
      },
      filters: {
        showKnowledgeEdges,
        showCausalEdges,
        showFeedbackLoops,
        showLowConfidence,
      },
    };
    await api.saveView(viewId, saveName, snapshot);
    queryClient.invalidateQueries({ queryKey: ['views'] });
  }, [viewState.virtualNodes, layout, showKnowledgeEdges, showCausalEdges, showFeedbackLoops, showLowConfidence, queryClient]);

  // Hyperedge edit/delete handlers
  const handleHyperedgeEdit = useCallback(() => {
    setEditType(hyperedgeMenu.type);
    setEditWeight(String(hyperedgeMenu.params?.weight ?? 0.5));
    setEditConf(String(hyperedgeMenu.params?.conf ?? 0.5));
    setHyperedgeMenu(prev => ({ ...prev, editing: true }));
  }, [hyperedgeMenu]);

  const handleHyperedgeSave = useCallback(async () => {
    setIsSavingEdit(true);
    try {
      await api.updateHyperedge(hyperedgeMenu.hyperedgeId, {
        type: editType,
        params: { weight: parseFloat(editWeight), conf: parseFloat(editConf) },
      });
      queryClient.invalidateQueries({ queryKey: ['hypergraph'] });
      setHyperedgeMenu({ visible: false, x: 0, y: 0, hyperedgeId: 0, type: '', params: {}, sourceSlugs: [], targetSlugs: [], editing: false });
    } catch (err: any) {
      // Error handled in api layer
    } finally {
      setIsSavingEdit(false);
    }
  }, [hyperedgeMenu.hyperedgeId, editType, editWeight, editConf, queryClient]);

  const handleHyperedgeDelete = useCallback(async () => {
    if (!window.confirm('确定要删除此超边吗？删除后不可恢复。')) return;
    setIsDeleting(true);
    try {
      await api.deleteHyperedge(hyperedgeMenu.hyperedgeId);
      queryClient.invalidateQueries({ queryKey: ['hypergraph'] });
      setHyperedgeMenu({ visible: false, x: 0, y: 0, hyperedgeId: 0, type: '', params: {}, sourceSlugs: [], targetSlugs: [], editing: false });
    } catch (err: any) {
      // Error handled in api layer
    } finally {
      setIsDeleting(false);
    }
  }, [hyperedgeMenu.hyperedgeId, queryClient]);

  const closeHyperedgeMenu = useCallback(() => {
    setHyperedgeMenu({ visible: false, x: 0, y: 0, hyperedgeId: 0, type: '', params: {}, sourceSlugs: [], targetSlugs: [], editing: false });
  }, []);

  const handleSearch = useCallback((query: string) => {
    const cy = cyInstanceRef.current;
    if (!cy || !query.trim()) {
      cy?.elements().removeClass('highlighted dimmed');
      return;
    }
    cy.elements().removeClass('highlighted dimmed');
    const matches = cy.nodes().filter(n =>
      (n.data('label') as string)?.toLowerCase().includes(query.toLowerCase())
    );
    if (matches.length > 0) {
      matches.addClass('highlighted');
      cy.nodes().not(matches).addClass('dimmed');
      cy.center(matches);
      cy.zoom(1.5);
    }
  }, []);

  // Context menu actions
  const handlePackIntoNode = useCallback(() => {
    const ids = contextMenu.selectedNodeIds;
    if (ids.length > 1) {
      const label = ids.map(id => {
        const cy = cyInstanceRef.current;
        if (!cy) return id;
        const node = cy.getElementById(id);
        return (node.data('label') as string) || id;
      }).join(', ');
      packNodes(ids, label.length > 30 ? `${label.slice(0, 27)}...` : label);
    }
    setContextMenu(prev => ({ ...prev, visible: false }));
    setSelectedNodeIds(new Set());
  }, [contextMenu.selectedNodeIds, packNodes]);

  const handleUnpack = useCallback(() => {
    const nodeId = contextMenu.selectedNodeIds[0];
    if (nodeId) {
      unpackNode(nodeId);
    }
    setContextMenu(prev => ({ ...prev, visible: false }));
  }, [contextMenu.selectedNodeIds, unpackNode]);

  const handleTogglePerspective = useCallback(() => {
    // Perspective mode is handled by hover
    setContextMenu(prev => ({ ...prev, visible: false }));
  }, []);

  const handleExpandKnowledgeGraph = useCallback(() => {
    const nodeId = contextMenu.selectedNodeIds[0];
    if (nodeId) {
      window.open(`/wiki/${encodeURIComponent(nodeId)}`, '_blank');
    }
    setContextMenu(prev => ({ ...prev, visible: false }));
  }, [contextMenu.selectedNodeIds]);

  const handleApplySuggestion = useCallback((suggestion: {
    type: string;
    action: string;
    nodes?: string[];
    node?: string;
    title: string;
    description: string;
    confidence: number;
    moduleType?: string;
  }) => {
    const cy = cyInstanceRef.current;
    if (!cy) return;

    // If suggestion has nodes and moduleType, treat it as cluster highlighting
    if (suggestion.nodes && suggestion.nodes.length > 0 && suggestion.moduleType) {
      setHighlightedCluster(suggestion.nodes);
      return;
    }

    switch (suggestion.action) {
      case 'pack':
        if (suggestion.nodes && suggestion.nodes.length > 1) {
          packNodes(suggestion.nodes, suggestion.title);
        }
        break;
      case 'perspective':
        if (suggestion.node) {
          const info = nodeMap.get(suggestion.node);
          const cpt = cptMap.get(suggestion.node) || null;
          setSelectedNode({
            id: suggestion.node,
            label: suggestion.node,
            incoming: info?.incoming || [],
            outgoing: info?.outgoing || [],
            cpt,
          });
          cy.elements().removeClass('highlighted dimmed');
          const targetNode = cy.getElementById(suggestion.node);
          if (targetNode.length > 0) {
            targetNode.addClass('highlighted');
            targetNode.neighborhood().addClass('highlighted');
            cy.center(targetNode);
          }
        }
        break;
      case 'highlight':
        if (suggestion.node) {
          const targetNode = cy.getElementById(suggestion.node);
          if (targetNode.length > 0) {
            cy.elements().removeClass('highlighted dimmed');
            targetNode.addClass('highlighted');
            targetNode.neighborhood().addClass('highlighted');
            cy.center(targetNode);
            cy.zoom(1.5);
          }
        }
        break;
    }
  }, [packNodes, nodeMap, cptMap]);

  // Close context menu on outside click
  useEffect(() => {
    const handleClickOutside = () => {
      setContextMenu(prev => ({ ...prev, visible: false }));
      setHyperedgeMenu(prev => ({ ...prev, visible: false }));
    };
    if (contextMenu.visible || hyperedgeMenu.visible) {
      document.addEventListener('click', handleClickOutside);
    }
    return () => document.removeEventListener('click', handleClickOutside);
  }, [contextMenu.visible, hyperedgeMenu.visible]);

  if (isLoading) {
    return (
      <div className="flex h-full items-center justify-center">
        <Spinner size={32} className="animate-spin text-primary-500" />
        <span className="ml-3 text-slate-500 dark:text-slate-400">加载因果认知地图中...</span>
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex h-full flex-col items-center justify-center text-slate-500">
        <Warning size={40} className="mb-2 text-red-400" />
        <p>因果认知地图数据加载失败</p>
      </div>
    );
  }

  return (
    <div className="relative flex h-full w-full flex-col">
      {/* Toolbar */}
      <div className="absolute left-3 top-3 z-40">
        <CausalToolbar
          onZoomIn={handleZoomIn}
          onZoomOut={handleZoomOut}
          onFit={handleFit}
          layout={layout}
          onLayoutChange={handleLayoutChange}
          onExportPng={handleExportPng}
          showFeedbackLoops={showFeedbackLoops}
          onToggleFeedbackLoops={() => setShowFeedbackLoops(!showFeedbackLoops)}
          showLowConfidence={showLowConfidence}
          onToggleLowConfidence={() => setShowLowConfidence(!showLowConfidence)}
          showKnowledgeEdges={showKnowledgeEdges}
          onToggleKnowledgeEdges={() => setShowKnowledgeEdges(!showKnowledgeEdges)}
          showCausalEdges={showCausalEdges}
          onToggleCausalEdges={() => setShowCausalEdges(!showCausalEdges)}
          onSearch={handleSearch}
          searchQuery={searchQuery}
          onSearchChange={setSearchQuery}
        />
        {highlightedCluster && highlightedCluster.length > 0 && (
          <button
            onClick={() => setHighlightedCluster(null)}
            className="mt-2 flex items-center gap-1.5 rounded-lg border border-amber-300 bg-amber-50 px-3 py-1.5 text-xs font-medium text-amber-700 shadow-sm hover:bg-amber-100 transition-colors dark:border-amber-700 dark:bg-amber-900/30 dark:text-amber-400 dark:hover:bg-amber-900/50"
          >
            <X size={14} />
            清除高亮 ({highlightedCluster.length} 个节点)
          </button>
        )}
        {nodeCount > 200 && (
          <div className="mt-2 rounded-lg border border-amber-200 bg-amber-50 px-3 py-1.5 text-xs text-amber-700 shadow-sm dark:border-amber-800 dark:bg-amber-900/30 dark:text-amber-400">
            <Warning size={14} className="inline mr-1" />
            大图模式：超过200个节点，建议使用筛选或打包功能
          </div>
        )}
      </div>

      {/* Cytoscape canvas */}
      <div ref={cyRef} className="h-full w-full flex-1" />

      {/* Reasoning panel toggle */}
      <button
        onClick={() => setShowReasoningPanel(!showReasoningPanel)}
        className="absolute right-3 top-20 z-40 rounded-lg border border-slate-200 bg-white/95 px-3 py-1.5 text-xs font-medium text-indigo-600 shadow-sm hover:bg-indigo-50 dark:border-slate-700 dark:bg-slate-800/95 dark:text-indigo-400 dark:hover:bg-indigo-900/30 transition-colors"
        title="因果推理引擎"
      >
        {showReasoningPanel ? '隐藏推理' : '因果推理'}
      </button>

      {/* Alert panel toggle */}
      <button
        onClick={() => setShowAlertPanel(!showAlertPanel)}
        className={`absolute right-3 top-36 z-40 rounded-lg border px-3 py-1.5 text-xs font-medium shadow-sm transition-colors ${
          triggeredEdgeIds.size > 0
            ? 'border-red-300 bg-red-50 text-red-600 hover:bg-red-100 dark:border-red-800 dark:bg-red-900/30 dark:text-red-400 dark:hover:bg-red-900/50'
            : 'border-slate-200 bg-white/95 text-orange-600 hover:bg-orange-50 dark:border-slate-700 dark:bg-slate-800/95 dark:text-orange-400 dark:hover:bg-orange-900/30'
        }`}
        title="因果预警"
      >
        <span className="flex items-center gap-1.5">
          {triggeredEdgeIds.size > 0 && (
            <span className="flex h-2 w-2">
              <span className="animate-ping absolute inline-flex h-2 w-2 rounded-full bg-red-400 opacity-75" />
              <span className="relative inline-flex rounded-full h-2 w-2 bg-red-500" />
            </span>
          )}
          {showAlertPanel ? '隐藏预警' : '因果预警'}
          {triggeredEdgeIds.size > 0 && (
            <span className="ml-0.5 rounded-full bg-red-500 px-1.5 py-0.5 text-[10px] text-white">
              {triggeredEdgeIds.size}
            </span>
          )}
        </span>
      </button>

      {/* Version panel toggle */}
      <button
        onClick={() => setShowVersionPanel(!showVersionPanel)}
        className="absolute right-3 top-36 z-40 rounded-lg border border-slate-200 bg-white/95 px-3 py-1.5 text-xs font-medium text-purple-600 shadow-sm hover:bg-purple-50 dark:border-slate-700 dark:bg-slate-800/95 dark:text-purple-400 dark:hover:bg-purple-900/30 transition-colors"
        title="版本历史"
      >
        {showVersionPanel ? '隐藏版本' : '版本历史'}
      </button>

      {/* View Manager toggle */}
      <button
        onClick={() => setShowViewManager(!showViewManager)}
        className="absolute right-3 top-52 z-40 rounded-lg border border-slate-200 bg-white/95 px-3 py-1.5 text-xs font-medium text-purple-600 shadow-sm hover:bg-purple-50 dark:border-slate-700 dark:bg-slate-800/95 dark:text-purple-400 dark:hover:bg-purple-900/30 transition-colors"
        title="视图管理"
      >
        {showViewManager ? '隐藏视图' : '视图'}
      </button>

      {/* Legend */}
      <div className="absolute bottom-3 left-3 z-40 rounded-lg border border-slate-200 bg-white/95 p-3 text-xs shadow-sm dark:border-slate-700 dark:bg-slate-800/95">
        <div className="mb-1 font-semibold text-slate-700 dark:text-slate-200">图例</div>
        <div className="space-y-1">
          <div className="flex items-center gap-2">
            <span className="h-3 w-3 rounded-full bg-green-500" />
            正常 (置信度 ≥ 0.7)
          </div>
          <div className="flex items-center gap-2">
            <span className="h-3 w-3 rounded-full bg-orange-500" />
            降级 (置信度 0.3-0.7)
          </div>
          <div className="flex items-center gap-2">
            <span className="h-3 w-3 rounded-full bg-slate-400" />
            未知 (置信度 &lt; 0.3)
          </div>
          <div className="flex items-center gap-2">
            <span className="h-3 w-3 rounded-full border-2 border-dashed border-purple-500 bg-purple-400" />
            虚拟节点
          </div>
          <div className="mt-1 pt-1 border-t border-slate-100 dark:border-slate-700">
            <div className="flex items-center gap-2">
              <span className="h-0.5 w-6 bg-green-500" />
              正向因果
            </div>
            <div className="flex items-center gap-2">
              <span className="h-0.5 w-6 bg-red-500" />
              负向因果
            </div>
            <div className="flex items-center gap-2">
              <span className="h-0.5 w-6 bg-orange-500" />
              抑制
            </div>
            <div className="flex items-center gap-2">
              <span className="h-0.5 w-6 border-t-2 border-dashed border-blue-500" />
              反馈回路
            </div>
            <div className="flex items-center gap-2">
              <span className="h-0.5 w-6 bg-purple-500" />
              联合因果
            </div>
            <div className="flex items-center gap-2">
              <span className="h-0.5 w-6 border-t-2 border-dashed border-cyan-500" />
              达成决议
            </div>
            <div className="flex items-center gap-2">
              <span className="h-0.5 w-6 border-t-2 border-dashed border-blue-500" />
              知识图谱边
            </div>
          </div>
        </div>
      </div>

      {/* IntentBar - NL Command Input */}
      <IntentBar
        onOperations={(ops) => {
          const cy = cyInstanceRef.current;
          for (const op of ops) {
            switch (op.type) {
              case 'pack':
                if (op.target.length > 1) {
                  const label = (op.params?.label as string) || op.target.join(', ');
                  packNodes(op.target, label.length > 30 ? `${label.slice(0, 27)}...` : label);
                }
                break;
              case 'unpack':
                for (const targetId of op.target) {
                  unpackNode(targetId);
                }
                break;
              case 'expand':
                if (op.target[0]) {
                  toggleExpand(op.target[0]);
                }
                break;
              case 'filter':
                if (op.params?.edgeTypes) {
                  const edgeTypes = op.params.edgeTypes as string[];
                  // Both types selected: show all
                  if (edgeTypes.includes('knowledge') && edgeTypes.includes('causal')) {
                    setShowKnowledgeEdges(true);
                    setShowCausalEdges(true);
                  }
                  // "只显示知识边"
                  if (edgeTypes.includes('knowledge') && !edgeTypes.includes('causal')) {
                    setShowKnowledgeEdges(true);
                    setShowCausalEdges(false);
                  }
                  // "只显示因果边"
                  if (edgeTypes.includes('causal') && !edgeTypes.includes('knowledge')) {
                    setShowKnowledgeEdges(false);
                    setShowCausalEdges(true);
                  }
                }
                if (op.params?.minConf !== undefined) {
                  setShowLowConfidence(false);
                }
                break;
              case 'select':
                if (cy) {
                  for (const slug of op.target) {
                    cy.getElementById(slug)?.select();
                  }
                }
                break;
              case 'layout':
                if (op.params?.layout) {
                  handleLayoutChange(op.params.layout as LayoutType);
                }
                break;
              case 'perspective':
                if (op.target[0]) {
                  const info = nodeMap.get(op.target[0]);
                  const cpt = cptMap.get(op.target[0]) || null;
                  setSelectedNode({
                    id: op.target[0],
                    label: op.target[0],
                    incoming: info?.incoming || [],
                    outgoing: info?.outgoing || [],
                    cpt,
                  });
                  if (cy) {
                    cy.elements().removeClass('highlighted dimmed');
                    const targetNode = cy.getElementById(op.target[0]);
                    if (targetNode.length > 0) {
                      targetNode.addClass('highlighted');
                      targetNode.neighborhood().addClass('highlighted');
                      cy.center(targetNode);
                    }
                  }
                }
                break;
            }
          }
        }}
        allNodes={allNodeSlugs}
        selectedNodes={selectedNodes}
      />

      {/* Node Detail Panel */}
      {selectedNode && (
        <div className="absolute right-3 top-3 z-40">
          <CausalNodeDetail
            nodeId={selectedNode.id}
            nodeLabel={selectedNode.label}
            onClose={() => setSelectedNode(null)}
            incoming={selectedNode.incoming.map(e => ({
              id: e.id,
              source_slug: e.source_slug,
              target_slug: e.target_slug,
              relation: e.relation,
              weight: e.weight,
              conf: e.conf,
            }))}
            outgoing={selectedNode.outgoing.map(e => ({
              id: e.id,
              source_slug: e.source_slug,
              target_slug: e.target_slug,
              relation: e.relation,
              weight: e.weight,
              conf: e.conf,
            }))}
            cpt={selectedNode.cpt}
          />
        </div>
      )}

      {/* Causal Reasoning Panel */}
      {showReasoningPanel && data && (
        <div className="absolute right-3 top-3 z-40 max-h-[90vh] overflow-y-auto">
          <CausalReasoningPanel
            edges={data.edges}
            onClose={() => setShowReasoningPanel(false)}
          />
        </div>
      )}

      {/* Causal Alert Panel */}
      {showAlertPanel && data && (
        <div className="absolute right-3 top-3 z-40 max-h-[90vh] overflow-y-auto">
          <CausalAlertPanel
            edges={data.edges}
            onTriggeredEdges={setTriggeredEdgeIds}
            onClose={() => setShowAlertPanel(false)}
          />
        </div>
      )}

      {/* Causal Version Panel */}
      {showVersionPanel && (
        <div className="absolute right-3 top-3 z-40 max-h-[90vh] w-[360px] overflow-y-auto">
          <CausalVersionPanel
            onClose={() => setShowVersionPanel(false)}
          />
        </div>
      )}

      {/* Context Menu */}
      <CausalContextMenu
        visible={contextMenu.visible}
        x={contextMenu.x}
        y={contextMenu.y}
        isVirtualNode={contextMenu.isVirtualNode}
        multiSelected={contextMenu.multiSelected}
        onPackIntoNode={handlePackIntoNode}
        onUnpack={handleUnpack}
        onTogglePerspective={handleTogglePerspective}
        onExpandKnowledgeGraph={handleExpandKnowledgeGraph}
      />

      {/* Hyperedge Context Menu */}
      {hyperedgeMenu.visible && (
        <div
          className="absolute z-50 min-w-[220px] rounded-lg border border-purple-200 bg-white shadow-xl dark:border-purple-800 dark:bg-slate-800 animate-fade-in"
          style={{
            left: Math.max(0, Math.min(hyperedgeMenu.x, window.innerWidth - 240)),
            top: Math.max(0, Math.min(hyperedgeMenu.y, window.innerHeight - 300)),
          }}
          onClick={(e) => e.stopPropagation()}
        >
          <div className="flex items-center justify-between border-b border-purple-100 px-3 py-2 dark:border-purple-800">
            <span className="text-xs font-semibold text-purple-700 dark:text-purple-300">
              超边操作
            </span>
            <button
              onClick={closeHyperedgeMenu}
              className="rounded p-0.5 text-slate-400 hover:text-slate-600 dark:hover:text-slate-300"
            >
              <X size={14} />
            </button>
          </div>

          {!hyperedgeMenu.editing ? (
            <div className="px-3 py-2 space-y-2">
              <div className="text-xs text-slate-600 dark:text-slate-300">
                <div className="flex items-center gap-2">
                  <span className="text-slate-400">类型:</span>
                  <span className="font-medium text-purple-600 dark:text-purple-400">{hyperedgeMenu.type}</span>
                </div>
                <div className="flex items-center gap-2 mt-1">
                  <span className="text-slate-400">权重:</span>
                  <span className="font-medium">{(hyperedgeMenu.params?.weight ?? 0.5).toFixed(1)}</span>
                </div>
                <div className="flex items-center gap-2 mt-1">
                  <span className="text-slate-400">置信度:</span>
                  <span className="font-medium">{((hyperedgeMenu.params?.conf ?? 0.5) * 100).toFixed(0)}%</span>
                </div>
                <div className="mt-1.5 text-xs text-slate-400">
                  <div>源: {hyperedgeMenu.sourceSlugs.join(', ') || '—'}</div>
                  <div>目标: {hyperedgeMenu.targetSlugs.join(', ') || '—'}</div>
                </div>
              </div>
              <div className="flex gap-2 pt-1 border-t border-slate-100 dark:border-slate-700">
                <button
                  onClick={handleHyperedgeEdit}
                  className="flex-1 flex items-center justify-center gap-1 rounded-md bg-purple-500 px-3 py-1.5 text-xs text-white hover:bg-purple-600 transition-colors"
                >
                  <PencilSimple size={12} />
                  编辑超边
                </button>
                <button
                  onClick={handleHyperedgeDelete}
                  disabled={isDeleting}
                  className="flex-1 flex items-center justify-center gap-1 rounded-md border border-red-300 px-3 py-1.5 text-xs text-red-600 hover:bg-red-50 disabled:opacity-50 dark:border-red-700 dark:text-red-400 dark:hover:bg-red-900/20 transition-colors"
                >
                  <X size={12} />
                  {isDeleting ? '删除中...' : '删除超边'}
                </button>
              </div>
            </div>
          ) : (
            <div className="px-3 py-2 space-y-2">
              <div className="space-y-1.5">
                <label className="text-xs text-slate-500 dark:text-slate-400">关系类型</label>
                <select
                  value={editType}
                  onChange={(e) => setEditType(e.target.value)}
                  className="w-full rounded-md border border-slate-300 px-2 py-1 text-xs dark:border-slate-600 dark:bg-slate-700 dark:text-slate-200"
                >
                  <option value=":jointlyCause">联合因果</option>
                  <option value=":达成决议">达成决议</option>
                  <option value=":causesIncrease">正向因果</option>
                  <option value=":causesDecrease">负向因果</option>
                  <option value=":inhibits">抑制</option>
                  <option value=":feedbackLoop">反馈回路</option>
                </select>
              </div>
              <div className="space-y-1.5">
                <label className="text-xs text-slate-500 dark:text-slate-400">权重</label>
                <input
                  type="number"
                  min="0"
                  max="1"
                  step="0.1"
                  value={editWeight}
                  onChange={(e) => setEditWeight(e.target.value)}
                  className="w-full rounded-md border border-slate-300 px-2 py-1 text-xs dark:border-slate-600 dark:bg-slate-700 dark:text-slate-200"
                />
              </div>
              <div className="space-y-1.5">
                <label className="text-xs text-slate-500 dark:text-slate-400">置信度</label>
                <input
                  type="number"
                  min="0"
                  max="1"
                  step="0.05"
                  value={editConf}
                  onChange={(e) => setEditConf(e.target.value)}
                  className="w-full rounded-md border border-slate-300 px-2 py-1 text-xs dark:border-slate-600 dark:bg-slate-700 dark:text-slate-200"
                />
              </div>
              <div className="flex gap-2 pt-1 border-t border-slate-100 dark:border-slate-700">
                <button
                  onClick={handleHyperedgeSave}
                  disabled={isSavingEdit}
                  className="flex-1 flex items-center justify-center gap-1 rounded-md bg-green-500 px-3 py-1.5 text-xs text-white hover:bg-green-600 disabled:opacity-50 transition-colors"
                >
                  <Check size={12} />
                  {isSavingEdit ? '保存中...' : '保存'}
                </button>
                <button
                  onClick={closeHyperedgeMenu}
                  className="flex-1 flex items-center justify-center gap-1 rounded-md border border-slate-300 px-3 py-1.5 text-xs text-slate-600 hover:bg-slate-100 dark:border-slate-600 dark:text-slate-400 dark:hover:bg-slate-700/60 transition-colors"
                >
                  <X size={12} />
                  取消
                </button>
              </div>
            </div>
          )}
        </div>
      )}

      {/* Perspective Mode Tooltip */}
      {perspectiveNode && (
        <div
          className="pointer-events-none absolute z-50 max-w-[200px] rounded-lg border border-slate-200 bg-white/90 px-3 py-2 shadow-lg backdrop-blur-sm dark:border-slate-700 dark:bg-slate-800/90"
          style={{
            left: Math.min(perspectiveNode.x + 15, window.innerWidth - 220),
            top: Math.max(0, perspectiveNode.y - 40),
          }}
        >
          <div className="text-xs font-semibold text-slate-800 dark:text-slate-100 truncate">
            {perspectiveNode.label}
          </div>
          {perspectiveNode.isVirtual && perspectiveNode.childCount && (
            <div className="mt-0.5 text-xs text-purple-600 dark:text-purple-400">
              包含 {perspectiveNode.childCount} 个内部节点
            </div>
          )}
          <div className="mt-1 space-y-0.5 text-xs text-slate-500 dark:text-slate-400">
            <div>入边: {perspectiveNode.incomingCount ?? '?'}</div>
            <div>出边: {perspectiveNode.outgoingCount ?? '?'}</div>
            {perspectiveNode.avgConf !== undefined && (
              <div>置信度: {(perspectiveNode.avgConf * 100).toFixed(0)}%</div>
            )}
          </div>
        </div>
      )}

      {/* 12c: Edge Evidence Tooltip */}
      {edgeTooltip.visible && (
        <div
          className="pointer-events-none absolute z-50 max-w-[280px] rounded-lg border border-slate-200 bg-white/95 px-3 py-2 shadow-lg backdrop-blur-sm dark:border-slate-700 dark:bg-slate-800/95"
          style={{
            left: Math.min(edgeTooltip.x + 15, window.innerWidth - 300),
            top: Math.max(0, edgeTooltip.y - 80),
          }}
        >
          <div className="text-xs font-semibold text-slate-800 dark:text-slate-100">
            {getRelationLabel(edgeTooltip.relation)}
          </div>
          <div className="mt-0.5 text-xs text-slate-500 dark:text-slate-400">
            {edgeTooltip.sourceSlug} → {edgeTooltip.targetSlug}
          </div>
          <div className="mt-1 flex items-center gap-3 text-xs text-slate-500 dark:text-slate-400">
            <span>权重: {edgeTooltip.weight.toFixed(1)}</span>
            <span>置信度: {(edgeTooltip.conf * 100).toFixed(0)}%</span>
          </div>
          {edgeTooltip.evidenceSpanIds.length > 0 && (
            <div className="mt-1.5 border-t border-slate-100 pt-1.5 dark:border-slate-700">
              <div className="text-xs font-medium text-slate-600 dark:text-slate-300 mb-1">
                证据引用 ({edgeTooltip.evidenceSpanIds.length})
              </div>
              {edgeTooltip.loading && (
                <div className="text-xs text-slate-400 animate-pulse">加载证据详情...</div>
              )}
              {!edgeTooltip.loading && edgeTooltip.evidenceSpans.length > 0 && (
                <div className="space-y-1 max-h-24 overflow-y-auto">
                  {edgeTooltip.evidenceSpans.map((ev, i) => (
                    <div key={i} className="flex items-start gap-1.5">
                      <Quotes size={10} className="mt-0.5 flex-shrink-0 text-indigo-400" />
                      <div className="min-w-0">
                        <div className="text-xs text-slate-500 dark:text-slate-400 truncate">
                          来源: {ev.source || ev.spanId}
                        </div>
                        <div className="text-xs text-slate-400 dark:text-slate-500 line-clamp-2">
                          {ev.text}
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
              {!edgeTooltip.loading && edgeTooltip.evidenceSpans.length === 0 && (
                <div className="text-xs text-slate-400 dark:text-slate-500">
                  {edgeTooltip.evidenceSpanIds.map((id, i) => (
                    <span key={i} className="inline-flex items-center gap-0.5 mr-1.5">
                      <Quotes size={10} className="text-indigo-400" />
                      <span className="font-mono">{id}</span>
                    </span>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>
      )}

      {/* AI Suggestions */}
      <CausalSuggestions
        visibleNodes={Array.from(nodeMap.keys())}
        onApplySuggestion={handleApplySuggestion}
      />

      {/* View Manager */}
      <ViewManager
        visible={showViewManager}
        onClose={() => setShowViewManager(false)}
        onLoadView={handleLoadView}
        onSaveView={handleSaveView}
      />
    </div>
  );
}

