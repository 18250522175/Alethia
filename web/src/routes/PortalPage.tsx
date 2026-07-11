import { useParams, useNavigate } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import {
  BookOpen,
  Spinner,
  Warning,
  ArrowLeft,
  FileText,
} from '@phosphor-icons/react';
import api from '../lib/api';

const PORTAL_COLORS: Record<string, string> = {
  concept: 'border-blue-300 bg-blue-50 dark:border-blue-700 dark:bg-blue-900/20',
  process: 'border-green-300 bg-green-50 dark:border-green-700 dark:bg-green-900/20',
  person: 'border-purple-300 bg-purple-50 dark:border-purple-700 dark:bg-purple-900/20',
  event: 'border-orange-300 bg-orange-50 dark:border-orange-700 dark:bg-orange-900/20',
  tool: 'border-pink-300 bg-pink-50 dark:border-pink-700 dark:bg-pink-900/20',
  other: 'border-teal-300 bg-teal-50 dark:border-teal-700 dark:bg-teal-900/20',
};

const PORTAL_LABELS: Record<string, string> = {
  concept: '概念',
  process: '流程',
  person: '人物',
  event: '事件',
  tool: '工具',
  other: '其他',
};

export default function PortalPage() {
  const { context } = useParams<{ context: string }>();
  const { t } = useTranslation();
  const navigate = useNavigate();

  const { data, isLoading, error } = useQuery({
    queryKey: ['portal-pages', context],
    queryFn: () => api.queryKnowledge('', { contexts: [context || ''], topK: 50 }),
    staleTime: 60_000,
    enabled: !!context,
  });

  const pages = data?.items || [];
  const label = PORTAL_LABELS[context || ''] || context || '';

  return (
    <div className="space-y-6 animate-fade-in">
      <header className="flex items-center gap-4">
        <button
          onClick={() => navigate('/wiki')}
          className="flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-sm text-slate-600 hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-400 dark:hover:bg-slate-700"
        >
          <ArrowLeft size={16} />
          返回
        </button>
        <div>
          <h1 className="flex items-center gap-2 text-2xl font-bold">
            <BookOpen size={28} className="text-primary-500" />
            {label} 门户
          </h1>
          <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
            按「{label}」上下文筛选的条目
          </p>
        </div>
      </header>

      {isLoading ? (
        <div className="flex items-center justify-center py-16">
          <Spinner size={32} className="animate-spin text-primary-500" />
          <span className="ml-3 text-slate-500 dark:text-slate-400">加载中...</span>
        </div>
      ) : error ? (
        <div className="flex flex-col items-center justify-center py-16 text-slate-500">
          <Warning size={40} className="mb-2 text-red-400" />
          <p>数据加载失败</p>
        </div>
      ) : pages.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-16 text-slate-400">
          <FileText size={40} className="mb-2" />
          <p>暂无「{label}」类型的条目</p>
        </div>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {pages.map((page: any, i: number) => (
            <div
              key={page.slug || i}
              onClick={() => navigate(`/wiki/${encodeURIComponent(page.slug)}`)}
              className={`cursor-pointer rounded-xl border p-4 transition-all hover:shadow-md ${PORTAL_COLORS[context || ''] || 'border-slate-200 bg-white dark:border-slate-700 dark:bg-slate-800'}`}
            >
              <h3 className="font-medium text-slate-900 dark:text-white truncate">
                {page.title}
              </h3>
              {page.snippet && (
                <p className="mt-1 line-clamp-2 text-sm text-slate-500 dark:text-slate-400">
                  {page.snippet}
                </p>
              )}
              <div className="mt-3 flex items-center gap-2 text-xs text-slate-400">
                <span className="badge badge-blue">{page.type || label}</span>
                <span>相关度 {(page.score * 100).toFixed(0)}%</span>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}