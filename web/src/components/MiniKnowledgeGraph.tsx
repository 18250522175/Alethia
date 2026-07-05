import type { Core, ElementDefinition } from 'cytoscape';
import { Graph as GraphIcon, Warning } from '@phosphor-icons/react';
import cytoscape from 'cytoscape';
import { useEffect, useRef } from 'react';
import { useTranslation } from 'react-i18next';
import { useNavigate } from 'react-router-dom';

interface MiniKnowledgeGraphProps {
  currentSlug: string;
  currentTitle: string;
  relatedEntities: { slug: string; title: string; relation?: string }[];
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
      ...relatedEntities.map((entity) => ({
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
          relation: entity.relation || '关联'
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
            label: 'data(label)',
            color: '#475569',
            'font-size': '10px',
            'text-valign': 'bottom',
            'text-halign': 'center',
            'text-margin-y': 4,
            width: 20,
            height: 20
          }
        },
        {
          selector: 'node[type = "current"]',
          style: {
            'background-color': '#f59e0b',
            'border-width': 3,
            'border-color': '#d97706',
            width: 28,
            height: 28,
            'font-weight': 'bold'
          }
        },
        {
          selector: 'edge',
          style: {
            width: 1,
            'line-color': '#cbd5e1',
            'target-arrow-color': '#cbd5e1',
            'target-arrow-shape': 'triangle',
            'curve-style': 'bezier',
            label: 'data(relation)',
            'font-size': '8px',
            'text-rotation': 'autorotate',
            'text-margin-y': -6
          }
        }
      ],
      layout: {
        name: 'concentric',
        animate: true,
        animationDuration: 300,
        padding: 20,
        concentric(node: any) {
          return node.data('type') === 'current' ? 2 : 1;
        },
        levelWidth() {
          return 1;
        }
      } as any
    });

    cyInstanceRef.current = cy;

    cy.on('tap', 'node', (evt) => {
      const node = evt.target;
      const slug = node.data('id');
      if (slug !== currentSlug) {
        navigate(`/wiki/${slug}`);
      }
    });

    cy.on('tap', 'edge', (evt) => {
      evt.target.animate(
        {
          style: {
            'line-color': '#f59e0b',
            width: 3
          }
        },
        {
          duration: 200,
          complete() {
            evt.target.animate(
              {
                style: {
                  'line-color': '#cbd5e1',
                  width: 1
                }
              },
              { duration: 200 }
            );
          }
        }
      );
    });

    return () => {
      cy.destroy();
      cyInstanceRef.current = null;
    };
  }, [currentSlug, currentTitle, relatedEntities, navigate]);

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
          <p className="text-xs">暂无关联实体</p>
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
        <button
          onClick={() => navigate('/graph')}
          className="text-xs text-primary-600 hover:text-primary-700 dark:text-primary-400 dark:hover:text-primary-300 font-medium"
        >
          查看全图 →
        </button>
      </div>
      <div ref={cyRef} className="h-48 w-full rounded-lg bg-slate-50 dark:bg-slate-900/50" />
      <div className="mt-2 text-xs text-slate-500 dark:text-slate-400">
        共 {entityCount} 个关联实体 · 点击节点跳转
      </div>
    </div>
  );
}
