import { useQuery } from '@tanstack/react-query';
import { Brain, Spinner, Warning } from '@phosphor-icons/react';
import api from '../lib/api';
import CausalCanvas from '../components/CognitiveMap/CausalCanvas';

export default function CognitiveMapPage() {
  const { data, isLoading, error } = useQuery({
    queryKey: ['causal-graph-meta'],
    queryFn: () => api.getCausalGraph(),
    staleTime: 60_000,
  });

  const nodeCount = (() => {
    if (!data) return 0;
    const slugs = new Set<string>();
    for (const edge of data.edges) {
      slugs.add(edge.source_slug);
      slugs.add(edge.target_slug);
    }
    return slugs.size;
  })();

  const edgeCount = data?.edges.length || 0;

  return (
    <div className="flex h-[calc(100vh-4rem)] flex-col animate-fade-in">
      {/* Title Bar */}
      <header className="flex-shrink-0 border-b border-slate-200 bg-white px-6 py-3 dark:border-slate-700 dark:bg-slate-800">
        <div className="flex items-center gap-3">
          <Brain size={28} className="text-primary-500" />
          <div>
            <h1 className="text-xl font-bold text-slate-900 dark:text-white">
              因果认知地图
            </h1>
            <p className="text-sm text-slate-500 dark:text-slate-400">
              {isLoading ? (
                <span className="inline-flex items-center gap-1">
                  <Spinner size={12} className="animate-spin" />
                  加载中...
                </span>
              ) : error ? (
                '数据加载失败'
              ) : (
                `${nodeCount} 个节点 · ${edgeCount} 条因果边`
              )}
            </p>
          </div>
        </div>
      </header>

      {/* Canvas Area */}
      <div className="relative flex-1 overflow-hidden">
        {isLoading ? (
          <div className="flex h-full items-center justify-center">
            <Spinner size={32} className="animate-spin text-primary-500" />
            <span className="ml-3 text-slate-500 dark:text-slate-400">加载因果认知地图中...</span>
          </div>
        ) : error ? (
          <div className="flex h-full flex-col items-center justify-center text-slate-500">
            <Warning size={40} className="mb-2 text-red-400" />
            <p>因果认知地图数据加载失败</p>
          </div>
        ) : (
          <CausalCanvas />
        )}
      </div>
    </div>
  );
}