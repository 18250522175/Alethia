import { useTranslation } from 'react-i18next';
import { CurrencyDollar, Warning } from '@phosphor-icons/react';

interface BudgetUsage {
  used: number;
  total: number;
}

interface BudgetBadgeProps {
  daily: BudgetUsage;
  monthly?: BudgetUsage;
}

function percent(used: number, total: number) {
  if (total <= 0) return 0;
  return Math.round((used / total) * 100);
}

function BudgetBar({
  label,
  used,
  total,
  exceededLabel
}: {
  label: string;
  used: number;
  total: number;
  exceededLabel: string;
}) {
  const pct = percent(used, total);
  const exceeded = used > total;
  const barColor = exceeded
    ? 'bg-red-500'
    : pct >= 80
      ? 'bg-yellow-500'
      : 'bg-primary-500';

  return (
    <div
      role="progressbar"
      aria-label={label}
      aria-valuenow={pct}
      aria-valuemin={0}
      aria-valuemax={100}
      aria-valuetext={`${pct}%（已用 ${used.toFixed(2)} / 总额 ${total.toFixed(2)}）`}
    >
      <div className="mb-1 flex items-center justify-between text-xs">
        <span className="text-slate-500 dark:text-slate-400">{label}</span>
        <span
          className={
            exceeded
              ? 'font-medium text-red-600 dark:text-red-400'
              : 'text-slate-600 dark:text-slate-300'
          }
        >
          {exceeded ? exceededLabel : `${pct}%`}
        </span>
      </div>
      <div className="h-1.5 w-full overflow-hidden rounded-full bg-slate-200 dark:bg-slate-700">
        <div
          className={`h-full rounded-full transition-all ${barColor}`}
          style={{ width: `${Math.min(pct, 100)}%` }}
        />
      </div>
    </div>
  );
}

export default function BudgetBadge({ daily, monthly }: BudgetBadgeProps) {
  const { t } = useTranslation();
  const dailyExceeded = daily.used > daily.total;

  return (
    <div className={`card p-3 ${dailyExceeded ? 'ring-2 ring-red-500' : ''}`}>
      <div className="mb-2 flex items-center gap-1.5 text-sm font-semibold">
        <CurrencyDollar size={16} className="text-primary-500" />
        {t('health.budget')}
        {dailyExceeded && <Warning size={14} className="text-red-500" />}
      </div>
      <div className="space-y-2">
        <BudgetBar
          label={t('health.daily')}
          used={daily.used}
          total={daily.total}
          exceededLabel={t('health.exceeded')}
        />
        {monthly && (
          <BudgetBar
            label={t('health.monthly')}
            used={monthly.used}
            total={monthly.total}
            exceededLabel={t('health.exceeded')}
          />
        )}
      </div>
    </div>
  );
}
