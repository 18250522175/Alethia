import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  CheckCircle,
  XCircle,
  Ghost,
  Warning,
  Info,
  Spinner,
  Empty
} from '@phosphor-icons/react';
import api from '../lib/api';

const TIERS = [
  { id: 'green', label: '🟢 低风险', desc: '可直接应用', color: 'badge-green' },
  { id: 'yellow', label: '🟡 待确认', desc: '需人工确认', color: 'badge-yellow' },
  { id: 'red', label: '🔴 高风险', desc: '需谨慎审核', color: 'badge-red' }
] as const;

export default function DiffReviewPage() {
  const { t } = useTranslation();
  const [activeTier, setActiveTier] = useState<string>('yellow');
  const queryClient = useQueryClient();

  const diffsQuery = useQuery({
    queryKey: ['diffs', activeTier],
    queryFn: () => api.getPendingDiffs(activeTier),
    staleTime: 30_000
  });

  const applyMutation = useMutation({
    mutationFn: (diffId: string) => api.applyDiff(diffId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['diffs'] });
    }
  });

  const rejectMutation = useMutation({
    mutationFn: (diffId: string) => api.rejectDiff(diffId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['diffs'] });
    }
  });

  const handleBatchApply = async () => {
    const items = diffsQuery.data?.items || [];
    for (const item of items) {
      if (item.tier === 'green') {
        await api.applyDiff(item.id);
      }
    }
    queryClient.invalidateQueries({ queryKey: ['diffs'] });
  };

  const diffs = diffsQuery.data?.items || [];
  const isLoading = diffsQuery.isLoading;
  const tierCounts: Record<string, number> = { green: 0, yellow: 0, red: 0 };
  (diffsQuery.data?.items || []).forEach(d => {
    tierCounts[d.tier] = (tierCounts[d.tier] || 0) + 1;
  });

  return (
    <div className="space-y-6 animate-fade-in">
      <header>
        <h1 className="flex items-center gap-2 text-2xl font-bold">
          <CheckCircle size={28} className="text-knowledge-500" />
          {t('review.title')}
        </h1>
        <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
          人类掌权 · 所有 AI 自动生成的知识变更需经你确认才会写入知识库
        </p>
      </header>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        {TIERS.map(tier => {
          const count = activeTier === tier.id ? diffs.length : 0;
          return (
            <button
              key={tier.id}
              onClick={() => setActiveTier(tier.id)}
              className={`card flex items-center justify-between p-4 text-left transition-all ${
                activeTier === tier.id
                  ? 'ring-2 ring-primary-500'
                  : 'hover:shadow-md'
              }`}
            >
              <div>
                <div className="text-sm font-medium">{tier.label}</div>
                <div className="text-xs text-slate-500 dark:text-slate-400">{tier.desc}</div>
              </div>
              <span className={`badge ${tier.color} text-base`}>
                {count}
              </span>
            </button>
          );
        })}
      </div>

      <div className="flex items-center justify-between">
        <h2 className="text-lg font-semibold">
          {TIERS.find(t => t.id === activeTier)?.label} 待审核变更
        </h2>
        {activeTier === 'green' && diffs.length > 0 && (
          <button
            onClick={handleBatchApply}
            disabled={applyMutation.isPending}
            className="btn btn-primary"
          >
            <CheckCircle size={16} className="mr-1.5" />
            {t('review.batchApply')} ({diffs.length})
          </button>
        )}
      </div>

      {isLoading ? (
        <div className="flex items-center justify-center py-12 text-slate-500">
          <Spinner size={24} className="mr-2 animate-spin" />
          {t('common.loading')}
        </div>
      ) : diffs.length === 0 ? (
        <div className="card flex flex-col items-center justify-center py-16 text-center">
          <Empty size={48} className="mb-3 text-slate-300 dark:text-slate-600" />
          <p className="text-slate-500 dark:text-slate-400">
            当前队列没有 {TIERS.find(t => t.id === activeTier)?.label} 变更。
          </p>
          <p className="mt-1 text-xs text-slate-400">
            当 AI 从上传文件中提取新知识，或检测到知识缺口时，这里会出现待审核条目。
          </p>
        </div>
      ) : (
        <div className="space-y-3">
          {diffs.map(diff => (
            <DiffCard
              key={diff.id}
              diff={diff}
              onApply={() => applyMutation.mutate(diff.id)}
              onReject={() => rejectMutation.mutate(diff.id)}
              applying={applyMutation.isPending && applyMutation.variables === diff.id}
              rejecting={rejectMutation.isPending && rejectMutation.variables === diff.id}
            />
          ))}
        </div>
      )}
    </div>
  );
}

interface DiffCardProps {
  diff: any;
  onApply: () => void;
  onReject: () => void;
  applying: boolean;
  rejecting: boolean;
}

function DiffCard({ diff, onApply, onReject, applying, rejecting }: DiffCardProps) {
  const { t } = useTranslation();
  const tierMeta = TIERS.find(t => t.id === diff.tier) || TIERS[0];
  const impactMeta =
    diff.impact === 'high'
      ? { icon: Warning, color: 'text-red-500', label: '高影响' }
      : diff.impact === 'medium'
        ? { icon: Info, color: 'text-yellow-500', label: '中影响' }
        : { icon: Info, color: 'text-green-500', label: '低影响' };
  const ImpactIcon = impactMeta.icon;
  const isGhost = diff.type === 'ghost_cleanup';

  return (
    <div className="card p-5">
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <div className="flex flex-wrap items-center gap-2">
          <span className={`badge ${tierMeta.color}`}>{tierMeta.label}</span>
          {isGhost && (
            <span className="badge badge-red flex items-center gap-1">
              <Ghost size={12} />
              幽灵清理
            </span>
          )}
          <span className="text-xs text-slate-500 dark:text-slate-400">
            实体：<span className="font-mono text-primary-600 dark:text-primary-400">{diff.slug}</span>
          </span>
          <span className="text-xs text-slate-500 dark:text-slate-400">
            类型：{diff.type}
          </span>
        </div>
        <div className={`flex items-center gap-1 text-xs font-medium ${impactMeta.color}`}>
          <ImpactIcon size={14} />
          {impactMeta.label}
        </div>
      </div>

      <div className="rounded-lg bg-slate-50 p-3 dark:bg-slate-700/50">
        <div className="mb-2 text-xs font-semibold text-slate-500 dark:text-slate-400">
          变更字段：<code className="font-mono">{diff.payload?.field || '-'}</code>
        </div>
        {diff.payload?.oldValue !== undefined && (
          <div className="mb-2 text-sm">
            <span className="text-red-600 dark:text-red-400">- {diff.payload.oldValue}</span>
          </div>
        )}
        <div className="text-sm">
          <span className="text-green-600 dark:text-green-400">+ {diff.payload?.newValue || '-'}</span>
        </div>
        {diff.payload?.context && (
          <div className="mt-2 text-xs text-slate-500 dark:text-slate-400">
            上下文：{diff.payload.context}
          </div>
        )}
      </div>

      <div className="mt-3 flex items-center justify-between">
        <div className="text-xs text-slate-400">
          置信度：{Math.round((diff.confidence || 0) * 100)}% · 创建于{' '}
          {new Date(diff.createdAt).toLocaleString('zh-CN')}
        </div>
        <div className="flex gap-2">
          <button
            onClick={onReject}
            disabled={applying || rejecting}
            className="btn btn-secondary text-sm"
          >
            <XCircle size={14} className="mr-1" />
            {rejecting ? '...' : t('review.reject')}
          </button>
          <button
            onClick={onApply}
            disabled={applying || rejecting}
            className="btn btn-primary text-sm"
          >
            <CheckCircle size={14} className="mr-1" />
            {applying ? '...' : t('review.apply')}
          </button>
        </div>
      </div>
    </div>
  );
}
