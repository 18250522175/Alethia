import { useState, useCallback } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Lightbulb, CaretDown, CaretUp, Lightning, Sparkle, Graph, ArrowRight } from '@phosphor-icons/react';
import api from '../../lib/api';

interface Suggestion {
  type: string;
  title: string;
  description: string;
  nodes?: string[];
  node?: string;
  action: string;
  confidence: number;
}

interface CausalSuggestionsProps {
  visibleNodes: string[];
  onApplySuggestion: (suggestion: Suggestion) => void;
}

function getConfidenceColor(conf: number): string {
  if (conf >= 0.8) return 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400';
  if (conf >= 0.6) return 'bg-yellow-100 text-yellow-700 dark:bg-yellow-900/30 dark:text-yellow-400';
  return 'bg-slate-100 text-slate-600 dark:bg-slate-700 dark:text-slate-400';
}

function getTypeIcon(type: string) {
  switch (type) {
    case 'cluster': return <Graph size={16} />;
    case 'hub': return <Lightning size={16} />;
    case 'bridge': return <Sparkle size={16} />;
    default: return <Lightbulb size={16} />;
  }
}

export default function CausalSuggestions({ visibleNodes, onApplySuggestion }: CausalSuggestionsProps) {
  const [collapsed, setCollapsed] = useState(false);

  const { data, isLoading, isError } = useQuery({
    queryKey: ['causal-suggestions', visibleNodes],
    queryFn: () => api.getCausalSuggestions(visibleNodes.length > 0 ? visibleNodes : undefined, 5),
    staleTime: 30_000,
    refetchInterval: 60_000,
  });

  const suggestions = data?.suggestions || [];

  if (isLoading) {
    return (
      <div className="absolute bottom-3 right-3 z-40 rounded-lg border border-slate-200 bg-white/95 p-3 shadow-sm dark:border-slate-700 dark:bg-slate-800/95">
        <div className="flex items-center gap-2 text-xs text-slate-500">
          <Lightbulb size={14} className="animate-pulse" />
          分析图中...
        </div>
      </div>
    );
  }

  if (isError || suggestions.length === 0) {
    return null;
  }

  return (
    <div className="absolute bottom-3 right-3 z-40 max-w-[280px] rounded-lg border border-slate-200 bg-white/95 shadow-sm dark:border-slate-700 dark:bg-slate-800/95">
      {/* Header */}
      <button
        onClick={() => setCollapsed(!collapsed)}
        className="flex w-full items-center justify-between rounded-t-lg px-3 py-2 text-left text-xs font-semibold text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-700/50"
      >
        <span className="flex items-center gap-1.5">
          <Lightbulb size={14} className="text-amber-500" />
          AI 智能建议 ({suggestions.length})
        </span>
        {collapsed ? <CaretUp size={14} /> : <CaretDown size={14} />}
      </button>

      {/* Suggestions list */}
      {!collapsed && (
        <div className="max-h-[320px] overflow-y-auto px-3 pb-3 space-y-2">
          {suggestions.map((suggestion, idx) => (
            <div
              key={idx}
              className="rounded-md border border-slate-100 p-2.5 dark:border-slate-700"
            >
              <div className="flex items-start gap-2">
                <span className="mt-0.5 text-slate-400 dark:text-slate-500">
                  {getTypeIcon(suggestion.type)}
                </span>
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-1.5">
                    <span className="text-xs font-medium text-slate-800 dark:text-slate-100 truncate">
                      {suggestion.title}
                    </span>
                    <span className={`inline-flex shrink-0 rounded px-1 py-0.5 text-[10px] font-medium ${getConfidenceColor(suggestion.confidence)}`}>
                      {(suggestion.confidence * 100).toFixed(0)}%
                    </span>
                  </div>
                  <p className="mt-0.5 text-[11px] leading-relaxed text-slate-500 dark:text-slate-400">
                    {suggestion.description}
                  </p>
                  <button
                    onClick={() => onApplySuggestion(suggestion)}
                    className="mt-1.5 inline-flex items-center gap-1 rounded bg-primary-500 px-2 py-1 text-[10px] font-medium text-white transition-colors hover:bg-primary-600 active:bg-primary-700"
                  >
                    一键执行
                    <ArrowRight size={10} />
                  </button>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}