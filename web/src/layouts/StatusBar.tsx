import { useQuery } from '@tanstack/react-query';
import { CheckCircle, Warning, XCircle, Clock } from '@phosphor-icons/react';
import { useTranslation } from 'react-i18next';
import api from '../lib/api';
import { formatRelativeTime } from '../lib/format';

export default function StatusBar() {
  const { t } = useTranslation();
  const healthQuery = useQuery({
    queryKey: ['health'],
    queryFn: () => api.getHealth(),
    staleTime: 30_000,
    refetchInterval: 60_000,
    retry: 3,
    retryDelay: 5_000
  });

  const health = healthQuery.data;
  const budgetExceeded = health?.budget?.daily?.exceeded || health?.budget?.monthly?.exceeded;
  const status: 'ok' | 'degraded' | 'error' = healthQuery.isError
    ? 'error'
    : budgetExceeded
      ? 'degraded'
      : 'ok';

  const statusConfig = {
    ok: { color: 'bg-green-500', label: t('status.ok', '服务正常'), Icon: CheckCircle, iconColor: 'text-green-500' },
    degraded: { color: 'bg-yellow-500', label: t('status.degraded', '服务降级'), Icon: Warning, iconColor: 'text-yellow-500' },
    error: { color: 'bg-red-500', label: t('status.error', '服务异常'), Icon: XCircle, iconColor: 'text-red-500' }
  };

  const { color, label, Icon } = statusConfig[status] || statusConfig.error;

  return (
    <footer className="flex h-8 items-center justify-between border-t border-slate-200 bg-white px-4 text-xs text-slate-500 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-400">
      <div className="flex items-center gap-4">
        <span className="flex items-center gap-1.5">
          <span className={`h-2 w-2 rounded-full ${color} ${healthQuery.isFetching ? 'animate-pulse' : ''}`}></span>
          <Icon size={12} className={statusConfig[status]?.iconColor} />
          {label}
        </span>
        {health?.lastUpdated && (
          <span className="flex items-center gap-1" title={new Date(health.lastUpdated).toLocaleString()}>
            <Clock size={12} />
            {t('status.lastSync', '最后同步')}：{formatRelativeTime(health.lastUpdated)}
          </span>
        )}
      </div>
      <div className="flex items-center gap-4">
        <span className="font-mono">v5.0.0</span>
      </div>
    </footer>
  );
}
