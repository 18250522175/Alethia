import { useTranslation } from 'react-i18next';
import { useNavigate } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { Link, Check, WarningCircle } from '@phosphor-icons/react';
import api from '../lib/api';

export default function AliasesPage() {
  const { t } = useTranslation();
  const navigate = useNavigate();

  const { data, isLoading, error } = useQuery({
    queryKey: ['alias-conflicts'],
    queryFn: () => api.getAliasConflicts(),
    staleTime: 60_000
  });

  return (
    <div className="animate-fade-in max-w-4xl mx-auto">
      <header className="flex items-center gap-3 mb-6">
        <Link size={28} className="text-primary-500" />
        <div>
          <h1 className="text-2xl font-bold">{t('aliases.title', '别名冲突管理')}</h1>
          <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
            {t('aliases.desc', '检测多个实体共享同一别名的情况，帮助维护知识图谱的链接准确性。')}
          </p>
        </div>
      </header>

      {isLoading && (
        <div className="card p-8 text-center text-sm text-slate-400">
          {t('common.loading')}
        </div>
      )}

      {error && (
        <div className="card p-4 border-red-200 bg-red-50 text-red-700 dark:border-red-800 dark:bg-red-900/20 dark:text-red-400">
          <div className="flex items-center gap-2">
            <WarningCircle size={18} />
            <span>{t('aliases.loadError', '加载别名冲突列表失败')}</span>
          </div>
        </div>
      )}

      {data && data.conflicts && data.conflicts.length === 0 && (
        <div className="card p-10 text-center">
          <Check size={48} className="mx-auto mb-3 text-green-500 opacity-40" />
          <p className="text-slate-400">{t('aliases.noConflicts', '没有别名冲突')}</p>
        </div>
      )}

      {data && data.conflicts && data.conflicts.length > 0 && (
        <div className="card overflow-hidden">
          <div className="bg-amber-50 px-4 py-2 text-xs font-medium text-amber-700 dark:bg-amber-900/30 dark:text-amber-400">
            {t('aliases.conflictCount', '共 {{count}} 个别名冲突', { count: data.conflicts.length })}
          </div>
          <div className="divide-y divide-slate-100 dark:divide-slate-700">
            {data.conflicts.map((conflict: { alias: string; slugs: string[] }, i: number) => (
              <div key={i} className="px-4 py-3">
                <div className="mb-1.5 flex items-center gap-2">
                  <span className="rounded bg-amber-100 px-1.5 py-0.5 font-mono text-xs text-amber-700 dark:bg-amber-900/40 dark:text-amber-400">
                    {conflict.alias}
                  </span>
                  <span className="text-xs text-slate-400">
                    {t('aliases.sharedBy', '被 {{count}} 个页面共享', { count: conflict.slugs.length })}
                  </span>
                </div>
                <div className="flex flex-wrap gap-1.5">
                  {conflict.slugs.map((slug: string) => (
                    <button
                      key={slug}
                      onClick={() => navigate(`/wiki/${slug}`)}
                      className="rounded bg-slate-100 px-2 py-0.5 text-xs text-slate-600 hover:bg-slate-200 dark:bg-slate-700 dark:text-slate-300 dark:hover:bg-slate-600"
                    >
                      {slug}
                    </button>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}