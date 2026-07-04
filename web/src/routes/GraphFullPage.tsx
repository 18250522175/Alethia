import { useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useQuery } from '@tanstack/react-query';
import cytoscape, { Core, ElementDefinition } from 'cytoscape';
import {
  MagnifyingGlass,
  Plus,
  Minus,
  ArrowsOutSimple,
  Graph as GraphIcon,
  Spinner,
  Ghost,
  Warning
} from '@phosphor-icons/react';
import api from '../lib/api';

const LAYOUTS = [
  { id: 'cose', label: '力导向' },
  { id: 'circle', label: '同心圆' },
  { id: 'breadthfirst', label: '树形' },
  { id: 'grid', label: '网格' }
] as const;

export default function GraphFullPage() {
  const { t } = useTranslation();
  const cyRef = useRef<HTMLDivElement>(null);
  const cyInstanceRef = useRef<Core | null>(null);
  const [layout, setLayout] = useState<string>('cose');
  const [search, setSearch] = useState('');
  const [filterType, setFilterType] = useState<string>('all');

  const graphQuery = useQuery({
    queryKey: ['graph'],
    queryFn: () => api.getGraphData(),
    staleTime: 60_000
  });

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
      ...(graphQuery.data.edges || []).map((e: any, i) => ({
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
            'height': 24
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
      cy.elements().removeClass('highlighted');
      node.addClass('highlighted');
      node.neighborhood().addClass('highlighted');
    });

    return () => {
      cy.destroy();
      cyInstanceRef.current = null;
    };
  }, [graphQuery.data, graphQuery.isLoading, layout]);

  const handleSearch = () => {
    if (!cyInstanceRef.current || !search.trim()) return;
    const cy = cyInstanceRef.current;
    cy.elements().removeClass('highlighted');
    const matches = cy.nodes().filter(n =>
      (n.data('label') as string)?.toLowerCase().includes(search.toLowerCase())
    );
    if (matches.length > 0) {
      matches.addClass('highlighted');
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
          >
            <Plus size={16} />
          </button>
          <button
            onClick={handleZoomOut}
            className="rounded p-1.5 text-slate-600 hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-slate-700"
          >
            <Minus size={16} />
          </button>
          <button
            onClick={handleFit}
            className="rounded p-1.5 text-slate-600 hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-slate-700"
          >
            <ArrowsOutSimple size={16} />
          </button>
        </div>

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
      </div>
    </div>
  );
}
