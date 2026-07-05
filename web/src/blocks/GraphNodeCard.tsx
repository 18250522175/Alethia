import { ArrowRight, Graph } from '@phosphor-icons/react';

interface GraphNodeCardProps {
  node: {
    id: string;
    label: string;
    type: string;
    relatedCount?: number;
  };
  onNavigate?: (id: string) => void;
}

export default function GraphNodeCard({ node, onNavigate }: GraphNodeCardProps) {
  const clickable = !!onNavigate;

  return (
    <div
      onClick={clickable ? () => onNavigate!(node.id) : undefined}
      className={`card p-4 ${
        clickable
          ? 'cursor-pointer transition-all hover:shadow-md hover:border-primary-300 dark:hover:border-primary-600'
          : ''
      }`}
    >
      <div className="flex items-start justify-between gap-2">
        <div className="flex items-center gap-2">
          <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-primary-100 dark:bg-primary-900/30">
            <Graph size={18} className="text-primary-600 dark:text-primary-400" />
          </div>
          <div className="min-w-0">
            <div className="truncate font-medium text-slate-900 dark:text-slate-100">
              {node.label}
            </div>
            <div className="font-mono text-xs text-slate-400">{node.id}</div>
          </div>
        </div>
        {clickable && <ArrowRight size={16} className="mt-1 shrink-0 text-slate-400" />}
      </div>

      <div className="mt-3 flex items-center gap-2">
        <span className="badge badge-blue">{node.type}</span>
        {node.relatedCount !== undefined && (
          <span className="text-xs text-slate-500 dark:text-slate-400">
            {node.relatedCount} 关联
          </span>
        )}
      </div>
    </div>
  );
}
