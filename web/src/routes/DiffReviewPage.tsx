import {
  ArrowDown,
  ArrowUp,
  CheckCircle,
  Empty,
  Ghost,
  Info,
  Keyboard,
  Spinner,
  Warning,
  XCircle
} from '@phosphor-icons/react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useCallback, useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import DiffCompare from '../components/DiffCompare';
import { useNotification } from '../contexts/NotificationContext';
import api from '../lib/api';

export default function DiffReviewPage() {
  const { t } = useTranslation();
  const { addNotification } = useNotification();
  const [activeTier, setActiveTier] = useState<string>('yellow');
  const [activeIndex, setActiveIndex] = useState<number>(0);
  const queryClient = useQueryClient();

  const TIERS = [
    {
      id: 'green',
      label: t('review.tierGreen', '🟢 低风险'),
      desc: t('review.tierGreenDesc', '可直接应用'),
      color: 'badge-green'
    },
    {
      id: 'yellow',
      label: t('review.tierYellow', '🟡 待确认'),
      desc: t('review.tierYellowDesc', '需人工确认'),
      color: 'badge-yellow'
    },
    {
      id: 'red',
      label: t('review.tierRed', '🔴 高风险'),
      desc: t('review.tierRedDesc', '需谨慎审核'),
      color: 'badge-red'
    }
  ] as const;

  const allDiffsQuery = useQuery({
    queryKey: ['diffs'],
    queryFn: () => api.getPendingDiffs(),
    staleTime: 30_000
  });

  const applyMutation = useMutation({
    mutationFn: (diffId: string) => api.applyDiff(diffId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['diffs'] });
      addNotification({
        type: 'system',
        title: t('review.applySuccess', '变更已应用'),
        description: t('review.applySuccessDesc', '知识变更已成功应用到知识库')
      });
    },
    onError: (error: Error) => {
      addNotification({
        type: 'system',
        title: t('review.applyFailed', '应用失败'),
        description: error.message || t('review.applyFailedDesc', '应用变更时发生错误')
      });
    }
  });

  const rejectMutation = useMutation({
    mutationFn: (diffId: string) => api.rejectDiff(diffId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['diffs'] });
      addNotification({
        type: 'system',
        title: t('review.rejectSuccess', '变更已拒绝'),
        description: t('review.rejectSuccessDesc', '已拒绝该知识变更建议')
      });
    },
    onError: (error: Error) => {
      addNotification({
        type: 'system',
        title: t('review.operationFailed', '操作失败'),
        description: error.message || t('review.rejectFailedDesc', '拒绝变更时发生错误')
      });
    }
  });

  const allDiffs = allDiffsQuery.data?.items || [];
  const diffs = allDiffs.filter((d) => d.tier === activeTier);

  const tierCounts: Record<string, number> = { green: 0, yellow: 0, red: 0 };
  allDiffs.forEach((d) => {
    if (d.tier && tierCounts[d.tier] !== undefined) {
      tierCounts[d.tier]++;
    }
  });

  const handleApply = useCallback(
    (diffId: string) => {
      applyMutation.mutate(diffId);
    },
    [applyMutation]
  );

  const handleReject = useCallback(
    (diffId: string) => {
      rejectMutation.mutate(diffId);
    },
    [rejectMutation]
  );

  const handleBatchApply = async () => {
    const items = allDiffsQuery.data?.items || [];
    for (const item of items) {
      if (item.tier === 'green') {
        await api.applyDiff(item.id);
      }
    }
    queryClient.invalidateQueries({ queryKey: ['diffs'] });
  };

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (diffs.length === 0) return;

      const target = e.target as HTMLElement;
      if (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA') return;

      if (e.key === 'j' || e.key === 'ArrowDown') {
        e.preventDefault();
        setActiveIndex((prev) => Math.min(prev + 1, diffs.length - 1));
      } else if (e.key === 'k' || e.key === 'ArrowUp') {
        e.preventDefault();
        setActiveIndex((prev) => Math.max(prev - 1, 0));
      } else if (e.key === 'Enter') {
        e.preventDefault();
        const currentDiff = diffs[activeIndex];
        if (currentDiff && !applyMutation.isPending && !rejectMutation.isPending) {
          handleApply(currentDiff.id);
        }
      } else if (e.key === 'r' || e.key === 'R') {
        e.preventDefault();
        const currentDiff = diffs[activeIndex];
        if (currentDiff && !applyMutation.isPending && !rejectMutation.isPending) {
          handleReject(currentDiff.id);
        }
      }
    };

    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [
    diffs,
    activeIndex,
    applyMutation.isPending,
    rejectMutation.isPending,
    handleApply,
    handleReject
  ]);

  useEffect(() => {
    setActiveIndex(0);
  }, [activeTier]);

  const isLoading = allDiffsQuery.isLoading;

  return (
    <div className="space-y-6 animate-fade-in">
      <header>
        <div className="flex items-center justify-between">
          <div>
            <h1 className="flex items-center gap-2 text-2xl font-bold">
              <CheckCircle size={28} className="text-knowledge-500" />
              {t('review.title')}
            </h1>
            <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
              {t(
                'review.subtitle',
                '人类掌权 · 所有 AI 自动生成的知识变更需经你确认才会写入知识库'
              )}
            </p>
          </div>
          <div className="flex items-center gap-2 text-xs text-slate-400">
            <Keyboard size={14} />
            <span className="hidden sm:inline">
              {t('review.shortcuts', '快捷键: J/K 切换 · Enter 应用 · R 拒绝')}
            </span>
            <span className="sm:hidden">J/K/Enter/R</span>
          </div>
        </div>
      </header>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        {TIERS.map((tier) => {
          const count = tierCounts[tier.id] || 0;
          return (
            <button
              key={tier.id}
              onClick={() => setActiveTier(tier.id)}
              className={`card flex items-center justify-between p-4 text-left transition-all ${
                activeTier === tier.id ? 'ring-2 ring-primary-500' : 'hover:shadow-md'
              }`}
            >
              <div>
                <div className="text-sm font-medium">{tier.label}</div>
                <div className="text-xs text-slate-500 dark:text-slate-400">{tier.desc}</div>
              </div>
              <span className={`badge ${tier.color} text-base`}>{count}</span>
            </button>
          );
        })}
      </div>

      <div className="flex items-center justify-between">
        <h2 className="text-lg font-semibold">
          {t('review.pendingDiffs', '{{tier}} 待审核变更', {
            tier: TIERS.find((t) => t.id === activeTier)?.label || ''
          })}
          {diffs.length > 0 && (
            <span className="ml-2 text-sm font-normal text-slate-500">
              ({activeIndex + 1} / {diffs.length})
            </span>
          )}
        </h2>
        <div className="flex items-center gap-2">
          {diffs.length > 0 && (
            <div className="flex items-center gap-1">
              <button
                onClick={() => setActiveIndex((prev) => Math.max(prev - 1, 0))}
                disabled={activeIndex === 0}
                className="btn btn-ghost p-1.5 disabled:opacity-50"
                title="上一个 (K)"
              >
                <ArrowUp size={16} />
              </button>
              <button
                onClick={() => setActiveIndex((prev) => Math.min(prev + 1, diffs.length - 1))}
                disabled={activeIndex === diffs.length - 1}
                className="btn btn-ghost p-1.5 disabled:opacity-50"
                title="下一个 (J)"
              >
                <ArrowDown size={16} />
              </button>
            </div>
          )}
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
            {t('review.emptyQueue', '当前队列没有 {{tier}} 变更。', {
              tier: TIERS.find((t) => t.id === activeTier)?.label || ''
            })}
          </p>
          <p className="mt-1 text-xs text-slate-400">
            {t(
              'review.emptyQueueHint',
              '当 AI 从上传文件中提取新知识，或检测到知识缺口时，这里会出现待审核条目。'
            )}
          </p>
        </div>
      ) : (
        <div className="space-y-4">
          {diffs.map((diff, index) => (
            <DiffCard
              key={diff.id}
              diff={diff}
              onApply={() => handleApply(diff.id)}
              onReject={() => handleReject(diff.id)}
              applying={applyMutation.isPending && applyMutation.variables === diff.id}
              rejecting={rejectMutation.isPending && rejectMutation.variables === diff.id}
              isActive={index === activeIndex}
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
  isActive: boolean;
}

function DiffCard({ diff, onApply, onReject, applying, rejecting, isActive }: DiffCardProps) {
  const { t } = useTranslation();
  const TIERS = [
    {
      id: 'green',
      label: t('review.tierGreen', '🟢 低风险'),
      desc: t('review.tierGreenDesc', '可直接应用'),
      color: 'badge-green'
    },
    {
      id: 'yellow',
      label: t('review.tierYellow', '🟡 待确认'),
      desc: t('review.tierYellowDesc', '需人工确认'),
      color: 'badge-yellow'
    },
    {
      id: 'red',
      label: t('review.tierRed', '🔴 高风险'),
      desc: t('review.tierRedDesc', '需谨慎审核'),
      color: 'badge-red'
    }
  ];
  const tierMeta = TIERS.find((t) => t.id === diff.tier) || TIERS[0];
  const impactMeta =
    diff.impact === 'high'
      ? { icon: Warning, color: 'text-red-500', label: t('review.impactHigh', '高影响') }
      : diff.impact === 'medium'
        ? { icon: Info, color: 'text-yellow-500', label: t('review.impactMedium', '中影响') }
        : { icon: Info, color: 'text-green-500', label: t('review.impactLow', '低影响') };
  const ImpactIcon = impactMeta.icon;
  const isGhost = diff.type === 'ghost_cleanup';

  const oldValue = diff.payload?.oldValue ?? '';
  const newValue = diff.payload?.newValue ?? '';

  return (
    <div
      className={`card p-5 transition-all ${isActive ? 'ring-2 ring-primary-500 shadow-lg' : ''}`}
    >
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <div className="flex flex-wrap items-center gap-2">
          <span className={`badge ${tierMeta.color}`}>{tierMeta.label}</span>
          {isGhost && (
            <span className="badge badge-red flex items-center gap-1">
              <Ghost size={12} />
              {t('review.ghostCleanup', '幽灵清理')}
            </span>
          )}
          <span className="text-xs text-slate-500 dark:text-slate-400">
            {t('review.entity', '实体：')}
            <span className="font-mono text-primary-600 dark:text-primary-400">{diff.slug}</span>
          </span>
          <span className="text-xs text-slate-500 dark:text-slate-400">
            {t('review.type', '类型：')}
            {diff.type}
          </span>
        </div>
        <div className={`flex items-center gap-1 text-xs font-medium ${impactMeta.color}`}>
          <ImpactIcon size={14} />
          {impactMeta.label}
        </div>
      </div>

      <DiffCompare
        oldValue={String(oldValue)}
        newValue={String(newValue)}
        title={t('review.diffField', '变更字段：{{field}}', { field: diff.payload?.field || '-' })}
      />

      {diff.payload?.context && (
        <div className="mt-3 rounded-lg bg-slate-50 p-3 dark:bg-slate-700/50">
          <div className="mb-1 text-xs font-semibold text-slate-500 dark:text-slate-400">
            {t('review.context', '上下文')}
          </div>
          <p className="text-sm text-slate-600 dark:text-slate-300">{diff.payload.context}</p>
        </div>
      )}

      <div className="mt-4 flex items-center justify-between">
        <div className="text-xs text-slate-400">
          {t('review.confidence', '置信度：{{value}}%', {
            value: Math.round((diff.confidence || 0) * 100)
          })}{' '}
          ·{t('review.createdAt', '创建于')} {new Date(diff.createdAt).toLocaleString()}
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
