import { useQuery } from '@tanstack/react-query';
import { CheckCircle, Warning, XCircle, Clock } from '@phosphor-icons/react';
import api from '../lib/api';
import { formatRelativeTime, formatDuration } from '../lib/format';

export default function StatusBar() {
  const healthQuery = useQuery({
    queryKey: ['health'],
    queryFn: () => api.getHealth(),
    staleTime: 30_000,
    refetchInterval: 60_000,
    retry: 3,
    retryDelay: 5_000
  });

  const health = healthQuery.data;
  const status = health?.status || (healthQuery.isError ? 'error' : 'ok');
  const version = health?.version || 'v5.0.0';

  const statusConfig = {
    ok: { color: 'bg-green-500', label: '服务正常', Icon: CheckCircle, iconColor: 'text-green-500' },
    degraded: { color: 'bg-yellow-500', label: '服务降级', Icon: Warning, iconColor: 'text-yellow-500' },
    error: { color: 'bg-red-500', label: '服务异常', Icon: XCircle, iconColor: 'text-red-500' }
  };

  const { color, label, Icon } = statusConfig[status as keyof typeof statusConfig] || statusConfig.error;

  return (
    <footer className="flex h-8 items-center justify-between border-t border-slate-200 bg-white px-4 text-xs text-slate-500 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-400">
      <div className="flex items-center gap-4">
        <span className="flex items-center gap-1.5">
          <span className={`h-2 w-2 rounded-full ${color} ${healthQuery.isFetching ? 'animate-pulse' : ''}`}></span>
          <Icon size={12} className={statusConfig[status as keyof typeof statusConfig]?.iconColor} />
          {label}
        </span>
        {health?.lastSync && (
          <span className="flex items-center gap-1" title={new Date(health.lastSync!).toLocaleString()}>
            <Clock size={12} />
            最后同步：{formatRelativeTime(health.lastSync)}
          </span>
        )}
        {health?.uptimeMs && (
          <span className="hidden sm:inline text-slate-400">
            运行 {formatDuration(health.uptimeMs)}
          </span>
        )}
      </div>
      <div className="flex items-center gap-4">
        <span className="font-mono">{version}</span>
      </div>
    </footer>
  );
}
