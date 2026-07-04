import { useTranslation } from 'react-i18next';
import { CheckCircle, XCircle, Ghost, Warning, Info } from '@phosphor-icons/react';
import type { PendingDiff } from '@shared/diff';

export const TIERS = [
  { id: 'green', label: '🟢 低风险', desc: '可直接应用', color: 'badge-green' },
  { id: 'yellow', label: '🟡 待确认', desc: '需人工确认', color: 'badge-yellow' },
  { id: 'red', label: '🔴 高风险', desc: '需谨慎审核', color: 'badge-red' }
] as const;

interface DiffCardProps {
  diff: PendingDiff;
  onApply: () => void;
  onReject: () => void;
  applying?: boolean;
  rejecting?: boolean;
}

export default function DiffCard({
  diff,
  onApply,
  onReject,
  applying = false,
  rejecting = false
}: DiffCardProps) {
  const { t } = useTranslation();
  const tierMeta = TIERS.find(tier => tier.id === diff.tier) || TIERS[0];
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
