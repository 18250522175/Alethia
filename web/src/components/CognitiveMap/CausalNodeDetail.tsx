import { X, ArrowSquareOut } from '@phosphor-icons/react';
import { useNavigate } from 'react-router-dom';
import CausalCPTWidget from '../CausalCPTWidget';

interface CausalEdge {
  id: string;
  source_slug: string;
  target_slug: string;
  relation: string;
  weight: number;
  conf: number;
}

interface CPT {
  id: string;
  variable_slug: string;
  conditions: Record<string, unknown>;
  probabilities: unknown;
}

interface CausalNodeDetailProps {
  nodeId: string;
  nodeLabel: string;
  onClose: () => void;
  incoming: CausalEdge[];
  outgoing: CausalEdge[];
  cpt: CPT | null;
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

function getRelationColor(relation: string): string {
  const map: Record<string, string> = {
    ':causesIncrease': 'text-green-600 dark:text-green-400',
    ':causesDecrease': 'text-red-600 dark:text-red-400',
    ':inhibits': 'text-orange-600 dark:text-orange-400',
    ':feedbackLoop': 'text-blue-600 dark:text-blue-400',
  };
  return map[relation] || 'text-slate-600 dark:text-slate-400';
}

export default function CausalNodeDetail({
  nodeId,
  nodeLabel,
  onClose,
  incoming,
  outgoing,
  cpt,
}: CausalNodeDetailProps) {
  const navigate = useNavigate();

  return (
    <div className="w-72 rounded-xl border border-slate-200 bg-white p-4 shadow-xl dark:border-slate-700 dark:bg-slate-800 animate-slide-in">
      <div className="mb-3 flex items-start justify-between">
        <div className="flex-1 min-w-0">
          <h3 className="truncate text-sm font-semibold text-slate-900 dark:text-white" title={nodeLabel}>
            {nodeLabel}
          </h3>
          <p className="mt-0.5 truncate text-xs text-slate-400 dark:text-slate-500 font-mono">
            {nodeId}
          </p>
        </div>
        <button
          onClick={onClose}
          className="ml-2 flex-shrink-0 rounded p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-600 dark:hover:bg-slate-700 dark:hover:text-slate-200"
        >
          <X size={14} />
        </button>
      </div>

      {/* Incoming edges */}
      <div className="mb-3">
        <h4 className="mb-1.5 text-xs font-medium text-slate-500 dark:text-slate-400">
          输入因果 (入边)
        </h4>
        {incoming.length === 0 ? (
          <p className="text-xs text-slate-400 dark:text-slate-500">无</p>
        ) : (
          <div className="max-h-32 overflow-y-auto space-y-1">
            {incoming.map(edge => (
              <div
                key={edge.id}
                className="flex items-center justify-between rounded bg-slate-50 px-2 py-1 text-xs dark:bg-slate-700/50"
              >
                <div className="flex items-center gap-1.5 min-w-0">
                  <span className="truncate text-slate-700 dark:text-slate-200" title={edge.source_slug}>
                    {edge.source_slug}
                  </span>
                </div>
                <div className="flex items-center gap-1.5 flex-shrink-0">
                  <span className={getRelationColor(edge.relation)}>
                    {getRelationLabel(edge.relation)}
                  </span>
                  <span className="text-slate-400 dark:text-slate-500">
                    w:{edge.weight.toFixed(1)}
                  </span>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Outgoing edges */}
      <div className="mb-3">
        <h4 className="mb-1.5 text-xs font-medium text-slate-500 dark:text-slate-400">
          输出因果 (出边)
        </h4>
        {outgoing.length === 0 ? (
          <p className="text-xs text-slate-400 dark:text-slate-500">无</p>
        ) : (
          <div className="max-h-32 overflow-y-auto space-y-1">
            {outgoing.map(edge => (
              <div
                key={edge.id}
                className="flex items-center justify-between rounded bg-slate-50 px-2 py-1 text-xs dark:bg-slate-700/50"
              >
                <div className="flex items-center gap-1.5 min-w-0">
                  <span className="truncate text-slate-700 dark:text-slate-200" title={edge.target_slug}>
                    {edge.target_slug}
                  </span>
                </div>
                <div className="flex items-center gap-1.5 flex-shrink-0">
                  <span className={getRelationColor(edge.relation)}>
                    {getRelationLabel(edge.relation)}
                  </span>
                  <span className="text-slate-400 dark:text-slate-500">
                    w:{edge.weight.toFixed(1)}
                  </span>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* CPT Widget */}
      {cpt && (
        <div className="mb-3">
          <CausalCPTWidget cpt={{
            variableSlug: cpt.variable_slug,
            parentVariables: (cpt.conditions as Record<string, unknown>)?.parents as string[] || (cpt.conditions as Record<string, unknown>)?.parentVariables as string[] || [],
            states: (cpt.conditions as Record<string, unknown>)?.states as string[] || ['low', 'high'],
            table: (cpt.probabilities as Record<string, unknown>)?.table as Array<Record<string, string>> || (cpt.probabilities as Record<string, unknown>)?.rows as Array<Record<string, string>> || [],
          }} />
        </div>
      )}

      {/* View in Knowledge Graph button */}
      <button
        onClick={() => navigate(`/wiki/${encodeURIComponent(nodeId)}`)}
        className="w-full btn btn-primary text-xs"
      >
        <ArrowSquareOut size={12} className="mr-1" />
        在知识图谱中查看
      </button>
    </div>
  );
}