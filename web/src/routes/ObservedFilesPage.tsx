import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Eye, ArrowCounterClockwise, File, Warning, CheckCircle, Clock, Spinner } from '@phosphor-icons/react';
import api from '../lib/api';

export default function ObservedFilesPage() {
  const { t } = useTranslation();
  const queryClient = useQueryClient();
  const [extractingHashes, setExtractingHashes] = useState<Set<string>>(new Set());

  const { data, isLoading, error } = useQuery({
    queryKey: ['observed-files'],
    queryFn: () => api.getObservedFiles(),
    staleTime: 30_000
  });

  const extractMutation = useMutation({
    mutationFn: (hash: string) => {
      setExtractingHashes(prev => new Set(prev).add(hash));
      return api.extractObservedFile(hash);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['observed-files'] });
    },
    onSettled: (_data, _error, hash) => {
      setExtractingHashes(prev => {
        const next = new Set(prev);
        next.delete(hash);
        return next;
      });
    }
  });

  const handleExtractAll = () => {
    if (!data?.items) return;
    const pending = data.items.filter(f => f.status === 'pending');
    pending.forEach(f => extractMutation.mutate(f.hash));
  };

  const formatSize = (bytes: number) => {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  };

  const statusConfig: Record<string, { icon: typeof Eye; color: string; label: string }> = {
    pending: { icon: Clock, color: 'text-amber-500 bg-amber-50 dark:bg-amber-900/20', label: t('observed.pending', '待提取') },
    extracting: { icon: Spinner, color: 'text-blue-500 bg-blue-50 dark:bg-blue-900/20', label: t('observed.extracting', '提取中') },
    extracted: { icon: CheckCircle, color: 'text-green-500 bg-green-50 dark:bg-green-900/20', label: t('observed.extracted', '已提取') },
    failed: { icon: Warning, color: 'text-red-500 bg-red-50 dark:bg-red-900/20', label: t('observed.failed', '失败') },
  };

  const pendingCount = data?.items?.filter(f => f.status === 'pending').length ?? 0;

  return (
    <div className="mx-auto max-w-5xl px-4 py-6">
      <div className="mb-6 flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">{t('observed.title', '观察文件')}</h1>
          <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
            {t('observed.desc', '被引用于知识库但尚未提取内容的文件')}
          </p>
        </div>
        {pendingCount > 0 && (
          <button
            onClick={handleExtractAll}
            disabled={extractMutation.isPending}
            className="flex items-center gap-2 rounded-lg bg-primary-600 px-4 py-2 text-sm font-medium text-white hover:bg-primary-700 disabled:opacity-50"
          >
            <ArrowCounterClockwise size={16} className={extractMutation.isPending ? 'animate-spin' : ''} />
            {t('observed.extractAll', '提取全部')} ({pendingCount})
          </button>
        )}
      </div>

      {isLoading && (
        <div className="flex items-center justify-center py-12 text-slate-400">
          <Spinner size={24} className="animate-spin mr-2" />
          {t('common.loading')}
        </div>
      )}

      {error && (
        <div className="rounded-lg border border-red-200 bg-red-50 p-4 text-sm text-red-700 dark:border-red-800 dark:bg-red-900/20 dark:text-red-400">
          {t('observed.loadError', '加载观察文件列表失败')}
        </div>
      )}

      {data && data.items.length === 0 && (
        <div className="flex flex-col items-center justify-center py-16 text-slate-400">
          <Eye size={48} className="mb-3 opacity-40" />
          <p className="text-sm">{t('observed.empty', '没有观察文件')}</p>
        </div>
      )}

      {data && data.items.length > 0 && (
        <div className="overflow-hidden rounded-xl border border-slate-200 bg-white dark:border-slate-700 dark:bg-slate-800">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-slate-200 bg-slate-50 text-left dark:border-slate-700 dark:bg-slate-800/50">
                  <th className="px-4 py-3 font-medium text-slate-500 dark:text-slate-400">{t('observed.file', '文件')}</th>
                  <th className="px-4 py-3 font-medium text-slate-500 dark:text-slate-400">{t('observed.size', '大小')}</th>
                  <th className="px-4 py-3 font-medium text-slate-500 dark:text-slate-400">{t('observed.modified', '修改时间')}</th>
                  <th className="px-4 py-3 font-medium text-slate-500 dark:text-slate-400">{t('observed.status', '状态')}</th>
                  <th className="px-4 py-3 text-right font-medium text-slate-500 dark:text-slate-400">{t('observed.action', '操作')}</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-slate-700">
                {data.items.map((file) => {
                  const status = statusConfig[file.status] || statusConfig.pending;
                  const StatusIcon = status.icon;
                  const isExtracting = extractingHashes.has(file.hash);

                  return (
                    <tr key={file.hash} className="hover:bg-slate-50 dark:hover:bg-slate-700/50">
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-2">
                          <File size={16} className="flex-shrink-0 text-slate-400" />
                          <span className="truncate font-mono text-xs">{file.path}</span>
                        </div>
                      </td>
                      <td className="whitespace-nowrap px-4 py-3 text-slate-500 dark:text-slate-400">
                        {formatSize(file.size)}
                      </td>
                      <td className="whitespace-nowrap px-4 py-3 text-slate-500 dark:text-slate-400">
                        {new Date(file.mtime).toLocaleString()}
                      </td>
                      <td className="px-4 py-3">
                        <span className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium ${status.color}`}>
                          <StatusIcon size={12} className={file.status === 'extracting' || isExtracting ? 'animate-spin' : ''} />
                          {status.label}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-right">
                        {(file.status === 'pending' || file.status === 'failed') && (
                          <button
                            onClick={() => extractMutation.mutate(file.hash)}
                            disabled={isExtracting}
                            className="inline-flex items-center gap-1 rounded-md px-2.5 py-1 text-xs font-medium text-primary-600 hover:bg-primary-50 disabled:opacity-50 dark:text-primary-400 dark:hover:bg-primary-900/20"
                          >
                            {isExtracting ? (
                              <Spinner size={12} className="animate-spin" />
                            ) : (
                              <ArrowCounterClockwise size={12} />
                            )}
                            {t('observed.extract', '提取')}
                          </button>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}