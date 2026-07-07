import { useEffect, useRef, useState, useCallback, useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { useQuery } from '@tanstack/react-query';
import { useNavigate, useSearchParams } from 'react-router-dom';
import cytoscape, { Core, ElementDefinition, NodeSingular } from 'cytoscape';
import {
  MagnifyingGlass,
  Plus,
  Minus,
  ArrowsOutSimple,
  Graph as GraphIcon,
  Spinner,
  Ghost,
  Warning,
  Clock,
  Download,
  ShareNetwork,
  X,
  Info,
  ArrowSquareOut,
  DotsThreeVertical,
  Crosshair,
  MapPin,
  Flag,
  Path
} from '@phosphor-icons/react';
import api from '../lib/api';

const LAYOUTS = [
  { id: 'cose', label: '力导向' },
  { id: 'circle', label: '同心圆' },
  { id: 'breadthfirst', label: '树形' },
  { id: 'grid', label: '网格' }
] as const;

const TIME_PERIODS = [
  { id: 'all', label: '全部' },
  { id: '7d', label: '7 天' },
  { id: '30d', label: '30 天' },
  { id: '90d', label: '90 天' },
  { id: '1y', label: '1 年' }
];

interface NodeContextMenuState {
  visible: boolean;
  x: number;
  y: number;
  nodeId: string;
  nodeData: any;
}

export default function GraphFullPage() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const cyRef = useRef<HTMLDivElement>(null);
  const cyInstanceRef = useRef<Core | null>(null);
  const [layout, setLayout] = useState<string>('cose');
  const [search, setSearch] = useState('');
  const [filterType, setFilterType] = useState<string>(searchParams.get('type') || 'all');
  const [timePeriod, setTimePeriod] = useState<string>('all');
  const [showClusters, setShowClusters] = useState<boolean>(false);
  const [contextMenu, setContextMenu] = useState<NodeContextMenuState>({
    visible: false,
    x: 0,
    y: 0,
    nodeId: '',
    nodeData: null
  });
  const [selectedNode, setSelectedNode] = useState<{ id: string; data: any } | null>(null);
  const [focusNode, setFocusNode] = useState<string | null>(null);
  const [focusDegrees, setFocusDegrees] = useState<number>(2);
  const [focusNeighbors, setFocusNeighbors] = useState<Set<string> | null>(null);
  const [pathStartNode, setPathStartNode] = useState<string | null>(null);
  const [pathEndNode, setPathEndNode] = useState<string | null>(null);
  const [highlightedPaths, setHighlightedPaths] = useState<Array<{
    nodes: string[];
    edges: Array<{ source: string; target: string; relation: string }>;
    length: number;
  }>>([]);

  const focusNodeRef = useRef<string | null>(null);
  const pathStartNodeRef = useRef<string | null>(null);
  const pathEndNodeRef = useRef<string | null>(null);

  useEffect(() => { focusNodeRef.current = focusNode; }, [focusNode]);
  useEffect(() => { pathStartNodeRef.current = pathStartNode; }, [pathStartNode]);
  useEffect(() => { pathEndNodeRef.current = pathEndNode; }, [pathEndNode]);

  const [timeRange, setTimeRange] = useState({ min: 0, max: 100 });

  const graphQuery = useQuery({
    queryKey: ['graph', timePeriod],
    queryFn: () => api.getGraphData(),
    staleTime: 60_000
  });

  const clusters = useMemo(() => {
    if (!graphQuery.data?.nodes) return [];
    const typeGroups: Record<string, any[]> = {};
    graphQuery.data.nodes.forEach((n: any) => {
      const type = n.type || 'concept';
      if (!typeGroups[type]) typeGroups[type] = [];
      typeGroups[type].push(n);
    });
    return Object.entries(typeGroups).map(([type, nodes]) => ({
      id: type,
      type,
      count: nodes.length,
      label: `${type} (${nodes.length})`
    }));
  }, [graphQuery.data]);

  const [showTimeline, setShowTimeline] = useState(false);

  useEffect(() => {
    if (!cyRef.current || graphQuery.isLoading || !graphQuery.data) return;

    const elements: ElementDefinition[] = [
      ...(graphQuery.data.nodes || []).map(n => ({
        data: {
          id: String(n.id ?? n.slug),
          label: n.title || n.slug,
          type: n.type || 'concept',
          slug: n.slug
        }
      })),
      ...(graphQuery.data.edges || []).map((e: any, i: number) => ({
        data: {
          id: `e${i}`,
          source: String(e.source ?? e.source_slug),
          target: String(e.target ?? e.target_slug),
          orphaned: e.orphaned || false,
          relation: e.relation || ''
        }
      }))
    ];

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
            'background-color': '#6366f1',
            'label': 'data(label)',
            'color': '#475569',
            'font-size': '10px',
            'text-valign': 'bottom',
            'text-halign': 'center',
            'text-margin-y': 4,
            'width': 24,
            'height': 24,
            'transition-property': 'background-color, width, height, border-width',
            'transition-duration': 0.2
          }
        },
        {
          selector: 'node[type="file"]',
          style: { 'background-color': '#06b6d4', 'shape': 'diamond' }
        },
        {
          selector: 'node[type="person"]',
          style: { 'background-color': '#f97316', 'shape': 'rectangle' }
        },
        {
          selector: 'node[type="portal"]',
          style: { 'background-color': '#a855f7', 'shape': 'round-rectangle' }
        },
        {
          selector: 'edge',
          style: {
            'width': 1,
            'line-color': '#cbd5e1',
            'target-arrow-color': '#cbd5e1',
            'target-arrow-shape': 'triangle',
            'curve-style': 'bezier'
          }
        },
        {
          selector: 'edge[orphaned = true]',
          style: {
            'line-color': '#ef4444',
            'line-style': 'dashed',
            'target-arrow-color': '#ef4444'
          }
        },
        {
          selector: '.highlighted',
          style: {
            'background-color': '#fbbf24',
            'border-width': 3,
            'border-color': '#f59e0b'
          }
        },
        {
          selector: '.dimmed',
          style: {
            'opacity': 0.2
          }
        },
        {
          selector: '.focus-dimmed-node',
          style: {
            'opacity': 0.1
          }
        },
        {
          selector: '.focus-dimmed-edge',
          style: {
            'opacity': 0.05
          }
        },
        {
          selector: '.focus-center',
          style: {
            'border-width': 4,
            'border-color': '#fbbf24',
            'border-opacity': 1
          }
        },
        {
          selector: '.path-shortest-node',
          style: {
            'background-color': '#fbbf24',
            'border-width': 3,
            'border-color': '#f59e0b'
          }
        },
        {
          selector: '.path-shortest-edge',
          style: {
            'line-color': '#fbbf24',
            'target-arrow-color': '#fbbf24',
            'width': 3
          }
        },
        {
          selector: '.path-alt-node',
          style: {
            'background-color': '#fb923c',
            'border-width': 2,
            'border-color': '#f97316'
          }
        },
        {
          selector: '.path-alt-edge',
          style: {
            'line-color': '#fb923c',
            'target-arrow-color': '#fb923c',
            'width': 2
          }
        }
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
              numIter: 1000
            }
          : {})
      } as any
    });

    cyInstanceRef.current = cy;

    cy.on('tap', 'node', (evt) => {
      const node = evt.target;
      const nodeId = node.data('id');

      if (evt.originalEvent?.shiftKey) {
        const start = pathStartNodeRef.current;
        const end = pathEndNodeRef.current;
        if (!start) {
          setPathStartNode(nodeId);
        } else if (!end && start !== nodeId) {
          setPathEndNode(nodeId);
          api.findShortestPaths(start, nodeId).then(data => {
            setHighlightedPaths(data.paths || []);
          }).catch(() => setHighlightedPaths([]));
        }
        return;
      }

      if (focusNodeRef.current) {
        setSelectedNode({ id: nodeId, data: node.data() });
        return;
      }

      cy.elements().removeClass('highlighted dimmed');
      node.addClass('highlighted');
      node.neighborhood().addClass('highlighted');
      setSelectedNode({ id: nodeId, data: node.data() });
    });

    cy.on('cxttap', 'node', (evt) => {
      evt.originalEvent.preventDefault();
      const node = evt.target;
      const pos = evt.renderedPosition || { x: 0, y: 0 };
      setContextMenu({
        visible: true,
        x: pos.x,
        y: pos.y,
        nodeId: node.data('id'),
        nodeData: node.data()
      });
    });

    cy.on('tap', (evt) => {
      if (evt.target === cy) {
        setContextMenu(prev => ({ ...prev, visible: false }));
        setSelectedNode(null);
      }
    });

    return () => {
      cy.destroy();
      cyInstanceRef.current = null;
    };
  }, [graphQuery.data, graphQuery.isLoading, layout]);

  useEffect(() => {
    const cy = cyInstanceRef.current;
    if (!cy) return;

    if (filterType === 'all') {
      cy.elements().style('display', 'element');
    } else {
      cy.nodes().style('display', 'none');
      cy.edges().style('display', 'none');
      const filtered = cy.nodes(`node[type="${filterType}"]`);
      filtered.style('display', 'element');
      filtered.connectedEdges().style('display', 'element');
      filtered.neighborhood().nodes().style('display', 'element');
    }
  }, [filterType]);

  useEffect(() => {
    const handleClickOutside = () => {
      setContextMenu(prev => ({ ...prev, visible: false }));
    };
    if (contextMenu.visible) {
      document.addEventListener('click', handleClickOutside);
    }
    return () => document.removeEventListener('click', handleClickOutside);
  }, [contextMenu.visible]);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setFocusNode(null);
        setFocusDegrees(2);
        setFocusNeighbors(null);
      }
    };
    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, []);

  useEffect(() => {
    if (!focusNode) {
      setFocusNeighbors(null);
      return;
    }
    let cancelled = false;
    api.getNodeNeighbors(focusNode, focusDegrees).then(data => {
      if (cancelled) return;
      const neighborSet = new Set<string>();
      data.nodes.forEach((n: any) => neighborSet.add(n.slug || n.id));
      setFocusNeighbors(neighborSet);
    }).catch(() => {
      if (!cancelled) setFocusNeighbors(new Set());
    });
    return () => { cancelled = true; };
  }, [focusNode, focusDegrees]);

  useEffect(() => {
    const cy = cyInstanceRef.current;
    if (!cy) return;

    cy.elements().removeClass('focus-dimmed-node focus-dimmed-edge focus-center');

    if (focusNode && focusNeighbors) {
      const visibleIds = new Set(focusNeighbors);
      visibleIds.add(focusNode);

      const focusEle = cy.getElementById(focusNode);
      if (focusEle.length > 0) {
        focusEle.addClass('focus-center');
      }

      cy.nodes().forEach(node => {
        const id = node.data('id');
        if (!visibleIds.has(id)) {
          node.addClass('focus-dimmed-node');
        }
      });

      cy.edges().forEach(edge => {
        const src = edge.data('source');
        const tgt = edge.data('target');
        if (!visibleIds.has(src) || !visibleIds.has(tgt)) {
          edge.addClass('focus-dimmed-edge');
        }
      });
    }
  }, [focusNode, focusNeighbors]);

  useEffect(() => {
    const cy = cyInstanceRef.current;
    if (!cy) return;

    cy.elements().removeClass('path-shortest-node path-shortest-edge path-alt-node path-alt-edge');

    if (!highlightedPaths.length) return;

    highlightedPaths.forEach((path, idx) => {
      const isShortest = idx === 0;
      const nodeClass = isShortest ? 'path-shortest-node' : 'path-alt-node';
      const edgeClass = isShortest ? 'path-shortest-edge' : 'path-alt-edge';

      path.nodes.forEach(nodeId => {
        const node = cy.getElementById(nodeId);
        if (node.length > 0) node.addClass(nodeClass);
      });

      path.edges.forEach(e => {
        const edges = cy.edges().filter(edge =>
          edge.data('source') === e.source && edge.data('target') === e.target
        );
        edges.forEach(edge => { edge.addClass(edgeClass); });
      });
    });
  }, [highlightedPaths]);

  const handleSearch = () => {
    if (!cyInstanceRef.current || !search.trim()) return;
    const cy = cyInstanceRef.current;
    cy.elements().removeClass('highlighted dimmed');
    const matches = cy.nodes().filter(n =>
      (n.data('label') as string)?.toLowerCase().includes(search.toLowerCase())
    );
    if (matches.length > 0) {
      matches.addClass('highlighted');
      cy.nodes().not(matches).addClass('dimmed');
      cy.center(matches);
      cy.zoom(1.5);
    }
  };

  const handleZoomIn = () => {
    const cy = cyInstanceRef.current;
    if (!cy) return;
    cy.zoom(cy.zoom() * 1.2);
  };

  const handleZoomOut = () => {
    const cy = cyInstanceRef.current;
    if (!cy) return;
    cy.zoom(cy.zoom() / 1.2);
  };

  const handleFit = () => {
    cyInstanceRef.current?.fit(undefined, 40);
  };

  const handleExportImage = useCallback(() => {
    const cy = cyInstanceRef.current;
    if (!cy) return;
    const pngData = cy.png({ scale: 2, bg: '#ffffff' });
    const link = document.createElement('a');
    link.href = pngData;
    link.download = `knowledge-graph-${Date.now()}.png`;
    link.click();
  }, []);

  const handleClusterHighlight = (clusterType: string) => {
    const cy = cyInstanceRef.current;
    if (!cy) return;
    cy.elements().removeClass('highlighted dimmed');
    const clusterNodes = cy.nodes(`node[type="${clusterType}"]`);
    clusterNodes.addClass('highlighted');
    cy.nodes().not(clusterNodes).addClass('dimmed');
    setTimeout(() => {
      navigate(`/search?q=&type=${clusterType}`);
    }, 500);
  };

  const filterNodesByTimePeriod = useCallback(() => {
    const cy = cyInstanceRef.current;
    if (!cy) return;
    cy.nodes().removeClass('dimmed');
  }, []);

  useEffect(() => {
    if (timePeriod !== 'all') {
      filterNodesByTimePeriod();
    }
  }, [timePeriod, filterNodesByTimePeriod]);

  const nodeCount = graphQuery.data?.nodes?.length || 0;
  const edgeCount = graphQuery.data?.edges?.length || 0;
  const ghostCount = (graphQuery.data?.edges || []).filter((e: any) => e.orphaned).length;

  return (
    <div className="flex h-[calc(100vh-8rem)] flex-col animate-fade-in">
      <header className="mb-4">
        <h1 className="flex items-center gap-2 text-2xl font-bold">
          <GraphIcon size={28} className="text-primary-500" />
          {t('graph.title')}
        </h1>
        <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
          全屏沉浸式图谱 · 节点大小反映关联强度 · 红色虚线为幽灵关系
        </p>
      </header>

      <div className="mb-3 flex flex-wrap items-center gap-3">
        <div className="flex items-center gap-2 rounded-lg border border-slate-200 bg-white px-2 dark:border-slate-700 dark:bg-slate-800">
          <MagnifyingGlass size={16} className="text-slate-400" />
          <input
            type="text"
            value={search}
            onChange={e => setSearch(e.target.value)}
            onKeyDown={e => e.key === 'Enter' && handleSearch()}
            placeholder={t('graph.searchNode')}
            className="border-0 bg-transparent px-1 py-1.5 text-sm focus:outline-none dark:text-slate-100"
          />
        </div>
        <div className="flex gap-1 rounded-lg border border-slate-200 bg-white p-1 dark:border-slate-700 dark:bg-slate-800">
          {LAYOUTS.map(l => (
            <button
              key={l.id}
              onClick={() => setLayout(l.id)}
              className={`rounded px-2.5 py-1 text-xs ${
                layout === l.id
                  ? 'bg-primary-600 text-white'
                  : 'text-slate-600 hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-slate-700'
              }`}
            >
              {l.label}
            </button>
          ))}
        </div>
        <select
          value={filterType}
          onChange={e => setFilterType(e.target.value)}
          className="input text-xs"
        >
          <option value="all">全部类型</option>
          <option value="concept">概念</option>
          <option value="person">人物</option>
          <option value="file">文件</option>
          <option value="portal">门户</option>
        </select>

        <button
          onClick={() => setShowTimeline(!showTimeline)}
          className={`btn btn-secondary gap-1.5 text-xs ${showTimeline ? 'ring-2 ring-primary-500' : ''}`}
        >
          <Clock size={14} />
          时间轴
        </button>

        <button
          onClick={() => setShowClusters(!showClusters)}
          className={`btn btn-secondary gap-1.5 text-xs ${showClusters ? 'ring-2 ring-primary-500' : ''}`}
        >
          <ShareNetwork size={14} />
          聚类
        </button>

        <button
          onClick={handleExportImage}
          className="btn btn-secondary gap-1.5 text-xs"
        >
          <Download size={14} />
          导出图片
        </button>

        <div className="ml-auto flex items-center gap-3 text-xs text-slate-500 dark:text-slate-400">
          <span>{nodeCount} 节点</span>
          <span>{edgeCount} 边</span>
          {ghostCount > 0 && (
            <span className="flex items-center gap-1 text-red-500">
              <Ghost size={12} />
              {ghostCount} 幽灵
            </span>
          )}
        </div>
      </div>

      {showTimeline && (
        <div className="mb-3 flex items-center gap-3 rounded-xl border border-slate-200 bg-white p-3 dark:border-slate-700 dark:bg-slate-800">
          <Clock size={16} className="text-slate-400" />
          <div className="flex gap-1">
            {TIME_PERIODS.map(p => (
              <button
                key={p.id}
                onClick={() => setTimePeriod(p.id)}
                className={`rounded-lg px-3 py-1.5 text-xs font-medium transition-colors ${
                  timePeriod === p.id
                    ? 'bg-primary-100 text-primary-700 dark:bg-primary-900/30 dark:text-primary-400'
                    : 'text-slate-600 hover:bg-slate-100 dark:text-slate-400 dark:hover:bg-slate-700'
                }`}
              >
                {p.label}
              </button>
            ))}
          </div>
          <div className="mx-4 flex-1">
            <input
              type="range"
              min="0"
              max="100"
              value={timeRange.min}
              onChange={(e) => setTimeRange(prev => ({ ...prev, min: parseInt(e.target.value) }))}
              className="w-full accent-primary-500"
            />
          </div>
          <span className="text-xs text-slate-500 dark:text-slate-400">
            2024-01 ~ 2024-12
          </span>
        </div>
      )}

      <div className="relative flex-1 overflow-hidden rounded-2xl border border-slate-200 bg-white dark:border-slate-700 dark:bg-slate-800">
        {graphQuery.isLoading ? (
          <div className="flex h-full items-center justify-center text-slate-500">
            <Spinner size={32} className="mr-2 animate-spin" />
            正在加载知识图谱...
          </div>
        ) : graphQuery.error ? (
          <div className="flex h-full flex-col items-center justify-center text-center text-slate-500">
            <Warning size={40} className="mb-2 text-red-400" />
            图谱数据加载失败
          </div>
        ) : nodeCount === 0 ? (
          <div className="flex h-full flex-col items-center justify-center text-center text-slate-500">
            <GraphIcon size={40} className="mb-2 text-slate-300 dark:text-slate-600" />
            知识库为空。请先上传文件或运行结构重建。
          </div>
        ) : (
          <div ref={cyRef} className="h-full w-full" />
        )}

        <div className="absolute right-3 top-3 flex flex-col gap-1 rounded-lg border border-slate-200 bg-white/95 p-1 shadow-sm dark:border-slate-700 dark:bg-slate-800/95">
          <button
            onClick={handleZoomIn}
            className="rounded p-1.5 text-slate-600 hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-slate-700"
            title="放大"
          >
            <Plus size={16} />
          </button>
          <button
            onClick={handleZoomOut}
            className="rounded p-1.5 text-slate-600 hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-slate-700"
            title="缩小"
          >
            <Minus size={16} />
          </button>
          <button
            onClick={handleFit}
            className="rounded p-1.5 text-slate-600 hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-slate-700"
            title="适应视图"
          >
            <ArrowsOutSimple size={16} />
          </button>
        </div>

        {showClusters && clusters.length > 0 && (
          <div className="absolute left-3 top-3 rounded-lg border border-slate-200 bg-white/95 p-3 shadow-sm dark:border-slate-700 dark:bg-slate-800/95">
            <div className="mb-2 flex items-center gap-1.5 text-xs font-semibold text-slate-700 dark:text-slate-200">
              <ShareNetwork size={14} className="text-primary-500" />
              聚类
            </div>
            <div className="space-y-1">
              {clusters.map(cluster => (
                <button
                  key={cluster.id}
                  onClick={() => handleClusterHighlight(cluster.type)}
                  className="flex w-full items-center gap-2 rounded px-2 py-1 text-xs text-slate-600 hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-slate-700"
                >
                  <span
                    className="h-3 w-3 rounded-full"
                    style={{
                      backgroundColor:
                        cluster.type === 'concept' ? '#6366f1' :
                        cluster.type === 'file' ? '#06b6d4' :
                        cluster.type === 'person' ? '#f97316' :
                        cluster.type === 'portal' ? '#a855f7' : '#64748b'
                    }}
                  />
                  {cluster.label}
                </button>
              ))}
            </div>
          </div>
        )}

        {focusNode && (
          <div className="absolute left-3 top-14 rounded-lg border border-slate-200 bg-white/95 p-3 shadow-sm dark:border-slate-700 dark:bg-slate-800/95">
            <div className="mb-2 flex items-center justify-between gap-3">
              <div className="flex items-center gap-1.5 text-xs font-semibold text-slate-700 dark:text-slate-200">
                <Crosshair size={14} className="text-primary-500" />
                焦点模式
              </div>
              <button
                onClick={() => { setFocusNode(null); setFocusDegrees(2); setFocusNeighbors(null); }}
                className="rounded px-2 py-1 text-xs text-red-600 hover:bg-red-50 dark:text-red-400 dark:hover:bg-red-900/20"
              >
                退出焦点
              </button>
            </div>
            <div className="flex items-center gap-2">
              <span className="text-xs text-slate-500 dark:text-slate-400">深度</span>
              <input
                type="range"
                min={1}
                max={5}
                value={focusDegrees}
                onChange={e => setFocusDegrees(Number(e.target.value))}
                className="w-24 accent-primary-500"
              />
              <span className="w-4 text-xs font-medium text-slate-700 dark:text-slate-200">{focusDegrees}</span>
            </div>
          </div>
        )}

        <div className="absolute bottom-3 left-3 rounded-lg border border-slate-200 bg-white/95 p-3 text-xs shadow-sm dark:border-slate-700 dark:bg-slate-800/95">
          <div className="mb-1 font-semibold text-slate-700 dark:text-slate-200">{t('graph.legend')}</div>
          <div className="space-y-1">
            <div className="flex items-center gap-2">
              <span className="h-3 w-3 rounded-full bg-indigo-500"></span>
              概念
            </div>
            <div className="flex items-center gap-2">
              <span className="h-3 w-3 rounded-full bg-purple-500"></span>
              门户
            </div>
            <div className="flex items-center gap-2">
              <span className="h-3 w-3 rotate-45 bg-cyan-500"></span>
              文件
            </div>
            <div className="flex items-center gap-2">
              <span className="h-3 w-3 bg-orange-500"></span>
              人物
            </div>
            <div className="flex items-center gap-2">
              <span className="h-3 w-6 border-t-2 border-dashed border-red-500"></span>
              幽灵关系
            </div>
          </div>
        </div>

        {contextMenu.visible && (
          <div
            className="absolute z-50 min-w-[160px] rounded-lg border border-slate-200 bg-white py-1 shadow-xl dark:border-slate-700 dark:bg-slate-800 animate-fade-in"
            style={{ left: contextMenu.x, top: contextMenu.y }}
            onClick={(e) => e.stopPropagation()}
          >
            <button
              onClick={() => {
                navigate(`/wiki/${contextMenu.nodeData.slug || contextMenu.nodeId}`);
                setContextMenu(prev => ({ ...prev, visible: false }));
              }}
              className="flex w-full items-center gap-2 px-3 py-2 text-sm text-slate-700 hover:bg-slate-100 dark:text-slate-200 dark:hover:bg-slate-700"
            >
              <ArrowSquareOut size={14} />
              查看详情
            </button>
            <button
              onClick={() => {
                setSelectedNode({ id: contextMenu.nodeId, data: contextMenu.nodeData });
                setContextMenu(prev => ({ ...prev, visible: false }));
              }}
              className="flex w-full items-center gap-2 px-3 py-2 text-sm text-slate-700 hover:bg-slate-100 dark:text-slate-200 dark:hover:bg-slate-700"
            >
              <Info size={14} />
              节点信息
            </button>
            <button
              onClick={() => {
                const cy = cyInstanceRef.current;
                if (cy) {
                  const node = cy.getElementById(contextMenu.nodeId);
                  if (node) {
                    cy.elements().removeClass('highlighted dimmed');
                    node.addClass('highlighted');
                    node.neighborhood().addClass('highlighted');
                    cy.center(node);
                    cy.zoom(2);
                  }
                }
                setContextMenu(prev => ({ ...prev, visible: false }));
              }}
              className="flex w-full items-center gap-2 px-3 py-2 text-sm text-slate-700 hover:bg-slate-100 dark:text-slate-200 dark:hover:bg-slate-700"
            >
              <MagnifyingGlass size={14} />
              聚焦节点
            </button>
            <button
              onClick={() => {
                setFocusNode(contextMenu.nodeId);
                setContextMenu(prev => ({ ...prev, visible: false }));
              }}
              className="flex w-full items-center gap-2 px-3 py-2 text-sm text-slate-700 hover:bg-slate-100 dark:text-slate-200 dark:hover:bg-slate-700"
            >
              <Crosshair size={14} />
              设为焦点
            </button>
            <button
              onClick={() => {
                setPathStartNode(contextMenu.nodeId);
                if (pathEndNode && pathEndNode !== contextMenu.nodeId) {
                  api.findShortestPaths(contextMenu.nodeId, pathEndNode).then(data => {
                    setHighlightedPaths(data.paths || []);
                  }).catch(() => setHighlightedPaths([]));
                }
                setContextMenu(prev => ({ ...prev, visible: false }));
              }}
              className="flex w-full items-center gap-2 px-3 py-2 text-sm text-slate-700 hover:bg-slate-100 dark:text-slate-200 dark:hover:bg-slate-700"
            >
              <MapPin size={14} />
              设为路径起点
            </button>
            <button
              onClick={() => {
                setPathEndNode(contextMenu.nodeId);
                if (pathStartNode && pathStartNode !== contextMenu.nodeId) {
                  api.findShortestPaths(pathStartNode, contextMenu.nodeId).then(data => {
                    setHighlightedPaths(data.paths || []);
                  }).catch(() => setHighlightedPaths([]));
                }
                setContextMenu(prev => ({ ...prev, visible: false }));
              }}
              className="flex w-full items-center gap-2 px-3 py-2 text-sm text-slate-700 hover:bg-slate-100 dark:text-slate-200 dark:hover:bg-slate-700"
            >
              <Flag size={14} />
              设为路径终点
            </button>
          </div>
        )}

        {selectedNode && (
          <div className="absolute right-3 top-14 w-64 rounded-xl border border-slate-200 bg-white p-4 shadow-xl dark:border-slate-700 dark:bg-slate-800 animate-slide-in">
            <div className="mb-3 flex items-start justify-between">
              <div className="flex items-center gap-2">
                <div
                  className="h-4 w-4 rounded-full"
                  style={{
                    backgroundColor:
                      selectedNode.data.type === 'concept' ? '#6366f1' :
                      selectedNode.data.type === 'file' ? '#06b6d4' :
                      selectedNode.data.type === 'person' ? '#f97316' :
                      selectedNode.data.type === 'portal' ? '#a855f7' : '#64748b'
                  }}
                />
                <span className="font-semibold text-slate-900 dark:text-white">
                  {selectedNode.data.label}
                </span>
              </div>
              <button
                onClick={() => setSelectedNode(null)}
                className="rounded p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-600 dark:hover:bg-slate-700 dark:hover:text-slate-200"
              >
                <X size={14} />
              </button>
            </div>
            <div className="space-y-2 text-xs text-slate-600 dark:text-slate-300">
              <div className="flex justify-between">
                <span className="text-slate-500 dark:text-slate-400">类型</span>
                <span className="badge badge-blue">{selectedNode.data.type}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-500 dark:text-slate-400">Slug</span>
                <span className="font-mono">{selectedNode.data.slug || selectedNode.id}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-500 dark:text-slate-400">关联度</span>
                <span>高</span>
              </div>
            </div>
            <button
              onClick={() => navigate(`/wiki/${selectedNode.data.slug || selectedNode.id}`)}
              className="mt-3 w-full btn btn-primary text-xs"
            >
              <ArrowSquareOut size={12} className="mr-1" />
              查看完整条目
            </button>
          </div>
        )}

        {highlightedPaths.length > 0 && (
          <div className="absolute right-3 bottom-3 w-64 rounded-xl border border-slate-200 bg-white p-4 shadow-xl dark:border-slate-700 dark:bg-slate-800 animate-slide-in">
            <div className="mb-3 flex items-start justify-between">
              <div className="flex items-center gap-2">
                <Path size={16} className="text-primary-500" />
                <span className="font-semibold text-slate-900 dark:text-white">路径结果</span>
              </div>
              <button
                onClick={() => { setPathStartNode(null); setPathEndNode(null); setHighlightedPaths([]); }}
                className="rounded px-2 py-1 text-xs text-red-600 hover:bg-red-50 dark:text-red-400 dark:hover:bg-red-900/20"
              >
                清除路径
              </button>
            </div>
            <div className="mb-2 text-xs text-slate-500 dark:text-slate-400">
              {pathStartNode} → {pathEndNode}
            </div>
            <div className="space-y-2">
              {highlightedPaths.map((path, i) => (
                <div
                  key={i}
                  className={`rounded-lg border p-2 text-xs ${
                    i === 0
                      ? 'border-yellow-200 bg-yellow-50 dark:border-yellow-900/30 dark:bg-yellow-900/10'
                      : 'border-orange-200 bg-orange-50 dark:border-orange-900/30 dark:bg-orange-900/10'
                  }`}
                >
                  <div className={`font-medium ${i === 0 ? 'text-yellow-700 dark:text-yellow-400' : 'text-orange-700 dark:text-orange-400'}`}>
                    {i === 0 ? '最短路径' : `替代路径 ${i}`}
                  </div>
                  <div className="mt-0.5 text-slate-500 dark:text-slate-400">
                    {path.length} 跳 · {path.nodes.length} 节点
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
