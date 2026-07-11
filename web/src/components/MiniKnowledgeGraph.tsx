import { useEffect, useRef, useState, useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { useNavigate } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import cytoscape, { Core, ElementDefinition } from 'cytoscape';
import { Graph as GraphIcon, Spinner, Warning, Lightning } from '@phosphor-icons/react';
import api from '../lib/api';

interface MiniKnowledgeGraphProps {
  currentSlug: string;
  currentTitle: string;
  relatedEntities: { slug: string; title: string; relation?: string }[];
}

function getRelationLabel(relation: string): string {
  const map: Record<string, string> = {
    ':causesIncrease': '正向因果',
    ':causesDecrease': '负向因果',
    ':inhibits': '抑制',
    ':feedbackLoop': '反馈回路',
  };
  return map[relation] || relation;
}

export default function MiniKnowledgeGraph({
  currentSlug,
  currentTitle,
  relatedEntities
}: MiniKnowledgeGraphProps) {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const cyRef = useRef<HTMLDivElement>(null);
  const cyInstanceRef = useRef<Core | null>(null);
  const [showCausalEdges, setShowCausalEdges] = useState(false);

  const { data: causalData } = useQuery({
    queryKey: ['mini-causal-graph'],
    queryFn: () => api.getCausalGraph(),
    staleTime: 120_000,
  });

  const relatedSlugs = useMemo(() => new Set(relatedEntities.map(e => e.slug)), [relatedEntities]);

  const causalEdges = useMemo(() => {
    if (!causalData?.edges) return [];
    const allSlugs = new Set([currentSlug, ...relatedSlugs]);
    return causalData.edges.filter(
      e => allSlugs.has(e.source_slug) || allSlugs.has(e.target_slug)
    );
  }, [causalData, currentSlug, relatedSlugs]);

  const causalNodeSlugs = useMemo(() => {
    const slugs = new Set<string>();
    for (const e of causalEdges) {
      slugs.add(e.source_slug);
      slugs.add(e.target_slug);
    }
    return slugs;
  }, [causalEdges]);

  const causalEdgeCount = causalEdges.length;

  useEffect(() => {
    if (!cyRef.current) return;

    const elements: ElementDefinition[] = [
      {
        data: {
          id: currentSlug,
          label: currentTitle,
          type: 'current'
        }
      },
      ...relatedEntities.map(entity => ({
        data: {
          id: entity.slug,
          label: entity.title,
          type: 'related'
        }
      })),
      ...relatedEntities.map((entity, i) => ({
        data: {
          id: `e${i}`,
          source: currentSlug,
          target: entity.slug,
          relation: entity.relation || '关联',
          edgeType: 'knowledge',
        }
      }))
    ];

    // Add causal edges
    if (showCausalEdges && causalEdges.length > 0) {
      for (const edge of causalEdges) {
        elements.push({
          data: {
            id: `ce_${edge.id}`,
            source: edge.source_slug,
            target: edge.target_slug,
            relation: getRelationLabel(edge.relation),
            weight: edge.weight,
            conf: edge.conf,
            edgeType: 'causal',
          }
        });
      }
    }

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
            'width': 20,
            'height': 20
          }
        },
        {
          selector: 'node[type = "current"]',
          style: {
            'background-color': '#f59e0b',
            'border-width': 3,
            'border-color': '#d97706',
            'width': 28,
            'height': 28,
            'font-weight': 'bold'
          }
        },
        {
          selector: 'edge',
          style: {
            'width': 1,
            'line-color': '#cbd5e1',
            'target-arrow-color': '#cbd5e1',
            'target-arrow-shape': 'triangle',
            'curve-style': 'bezier',
            'label': 'data(relation)',
            'font-size': '8px',
            'text-rotation': 'autorotate',
            'text-margin-y': -6
          }
        },
        {
          selector: 'edge[edgeType = "causal"]',
          style: {
            'width': 2,
            'line-color': '#a855f7',
            'target-arrow-color': '#a855f7',
            'line-style': 'solid',
            'label': 'data(relation)',
            'font-size': '8px',
            'text-rotation': 'autorotate',
            'text-margin-y': -6,
            'color': '#a855f7',
          }
        }
      ],
      layout: {
        name: 'concentric',
        animate: true,
        animationDuration: 300,
        padding: 20,
        concentric: function(node: any) {
          return node.data('type') === 'current' ? 2 : 1;
        },
        levelWidth: function() { return 1; }
      } as any
    });

    cyInstanceRef.current = cy;

    cy.on('tap', 'node', (evt) => {
      const node = evt.target;
      const slug = node.data('id');
      if (slug !== currentSlug) {
        navigate(`/wiki/${encodeURIComponent(slug)}`);
      }
    });

    cy.on('tap', 'edge', (evt) => {
      evt.target.animate({
        style: {
          'line-color': '#f59e0b',
          'width': 3
        }
      }, {
        duration: 200,
        complete: function() {
          evt.target.animate({
            style: {
              'line-color': '#cbd5e1',
              'width': 1
            }
          }, { duration: 200 });
        }
      });
    });

    return () => {
      cy.destroy();
      cyInstanceRef.current = null;
    };
  }, [currentSlug, currentTitle, relatedEntities, navigate, showCausalEdges, causalEdges]);

  const entityCount = relatedEntities.length;

  if (entityCount === 0) {
    return (
      <div className="card p-4">
        <div className="mb-3 flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-slate-400">
          <GraphIcon size={12} />
          {t('wiki.miniGraph', '知识图谱')}
        </div>
        <div className="flex flex-col items-center justify-center py-6 text-center text-slate-400">
          <Warning size={24} className="mb-2" />
          <p className="text-xs">{t('wiki.noRelated', '暂无关联实体')}</p>
        </div>
      </div>
    );
  }

  return (
    <div className="card p-4">
      <div className="mb-3 flex items-center justify-between">
        <div className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-slate-400">
          <GraphIcon size={12} />
          {t('wiki.miniGraph', '知识图谱')}
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={() => setShowCausalEdges(!showCausalEdges)}
            className={`flex items-center gap-1 rounded px-1.5 py-0.5 text-xs transition-colors ${
              showCausalEdges
                ? 'bg-purple-100 text-purple-700 dark:bg-purple-900/30 dark:text-purple-400'
                : 'text-slate-400 hover:text-purple-600 dark:hover:text-purple-400'
            }`}
            title={showCausalEdges ? '隐藏因果边' : '显示因果边'}
          >
            <Lightning size={11} />
            {showCausalEdges ? '因果' : '因果'}
          </button>
          <button
            onClick={() => navigate('/graph')}
            className="text-xs text-primary-600 hover:text-primary-700 dark:text-primary-400 dark:hover:text-primary-300 font-medium"
          >
            {t('wiki.viewFullGraph', '查看全图')} →
          </button>
        </div>
      </div>
      <div ref={cyRef} className="h-48 w-full rounded-lg bg-slate-50 dark:bg-slate-900/50" />
      <div className="mt-2 text-xs text-slate-500 dark:text-slate-400">
        {t('wiki.relatedCount', '共 {{count}} 个关联实体 · 点击节点跳转', { count: entityCount })}
        {causalEdgeCount > 0 && (
          <span className="ml-2 text-purple-500 dark:text-purple-400">
            · {causalEdgeCount} 条因果边可用
          </span>
        )}
      </div>
    </div>
  );
}
