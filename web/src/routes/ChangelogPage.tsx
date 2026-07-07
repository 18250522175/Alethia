import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  ClockCounterClockwise,
  ArrowCounterClockwise,
  Copy,
  Check,
  Warning,
  Spinner,
  Empty,
  CaretDown,
  CaretUp,
  Archive,
  ArrowClockwise,
  X,
  FilePlus,
  Pencil,
  FileX
} from '@phosphor-icons/react';
import api from '../lib/api';
import { formatRelativeTime, formatDateTime } from '../lib/format';

interface ChangeLogBatch {
  batchId: string;
  ts: string;
  opCounts: Record<string, number>;
  totalOps: number;
  targets: string[];
}

const OP_FILTERS = [
  { id: 'all', labelKey: 'changelog.opAll', icon: ClockCounterClockwise },
  { id: 'create', labelKey: 'changelog.opCreate', icon: FilePlus },
  { id: 'update', labelKey: 'changelog.opUpdate', icon: Pencil },
  { id: 'delete', labelKey: 'changelog.opDelete', icon: FileX }
] as const;

function copyToClipboard(text: string): Promise<void> {
  return navigator.clipboard.writeText(text);
}

export default function ChangelogPage() {
  const { t } = useTranslation();
  const queryClient = useQueryClient();
  const [opFilter, setOpFilter] = useState<string>('all');
  const [expandedTargets, setExpandedTargets] = useState<Set<string>>(new Set());
  const [archiveExpanded, setArchiveExpanded] = useState(true);
  const [copiedId, setCopiedId] = useState<string | null>(null);

  const changelogQuery = useQuery({
    queryKey: ['changelog', opFilter],
    queryFn: () => api.getChangeLog({ op: opFilter === 'all' ? undefined : opFilter, limit: 100 }),
    staleTime: 30_000
  });

  const rollbackMutation = useMutation({
    mutationFn: (batchId: string) => api.rollbackBatch(batchId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['changelog'] });
    }
  });

  const handleRollback = (batchId: string) => {
    if (!confirm(t('changelog.rollbackConfirm'))) {
      return;
    }
    rollbackMutation.mutate(batchId);
  };

  const handleCopy = async (batchId: string) => {
    await copyToClipboard(batchId);
    setCopiedId(batchId);
    setTimeout(() => setCopiedId(null), 2000);
  };

  const toggleTargets = (batchId: string) => {
    setExpandedTargets(prev => {
      const next = new Set(prev);
      if (next.has(batchId)) {
        next.delete(batchId);
      } else {
        next.add(batchId);
      }
      return next;
    });
  };

  const batches = changelogQuery.data?.batches || [];
  const isLoading = changelogQuery.isLoading;
  const isError = changelogQuery.isError;

  const activeBatches = batches.filter(b => !b.batchId.startsWith('archive-'));
  const archiveBatches = batches.filter(b => b.batchId.startsWith('archive-'));

  return (
    <div className="space-y-6 animate-fade-in">
      <header className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="flex items-center gap-2 text-2xl font-bold">
            <ClockCounterClockwise size={28} className="text-primary-500" />
            {t('nav.changelog')}
          </h1>
          <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
            {t('changelog.subtitle')}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <select
            value={opFilter}
            onChange={e => setOpFilter(e.target.value)}
            className="input w-auto"
          >
            {OP_FILTERS.map(f => (
              <option key={f.id} value={f.id}>{t(f.labelKey)}</option>
            ))}
          </select>
          <button
            onClick={() => changelogQuery.refetch()}
            disabled={changelogQuery.isFetching}
            className="btn btn-secondary"
          >
            <ArrowClockwise
              size={16}
              className={`mr-1.5 ${changelogQuery.isFetching ? 'animate-spin' : ''}`}
            />
            {t('changelog.refresh')}
          </button>
        </div>
      </header>

      {isLoading ? (
        <div className="flex items-center justify-center py-16 text-slate-500">
          <Spinner size={24} className="mr-2 animate-spin" />
          {t('common.loading')}
        </div>
      ) : isError ? (
        <div className="card flex flex-col items-center justify-center py-16 text-center">
          <Warning size={40} className="mb-2 text-red-400" />
          <p className="text-slate-600 dark:text-slate-300">{t('changelog.loadError')}</p>
          <p className="mt-1 text-xs text-slate-400">{t('changelog.loadErrorHint')}</p>
        </div>
      ) : batches.length === 0 ? (
        <div className="card flex flex-col items-center justify-center py-16 text-center">
          <Empty size={48} className="mb-3 text-slate-300 dark:text-slate-600" />
          <p className="text-slate-500 dark:text-slate-400">{t('changelog.empty')}</p>
          <p className="mt-1 text-xs text-slate-400">
            {t('changelog.emptyHint')}
          </p>
        </div>
      ) : (
        <div className="space-y-6">
          {activeBatches.length > 0 && (
            <section className="space-y-3">
              <h2 className="text-sm font-semibold uppercase text-slate-500 dark:text-slate-400">
                {t('changelog.recentBatchesCount', { count: activeBatches.length })}
              </h2>
              <div className="space-y-3">
                {activeBatches.map(batch => (
                  <BatchCard
                    key={batch.batchId}
                    batch={batch}
                    expanded={expandedTargets.has(batch.batchId)}
                    copied={copiedId === batch.batchId}
                    onCopy={() => handleCopy(batch.batchId)}
                    onToggle={() => toggleTargets(batch.batchId)}
                    onRollback={() => handleRollback(batch.batchId)}
                    rollingBack={rollbackMutation.isPending && rollbackMutation.variables === batch.batchId}
                  />
                ))}
              </div>
            </section>
          )}

          {archiveBatches.length > 0 && (
            <section className="space-y-3">
              <button
                onClick={() => setArchiveExpanded(!archiveExpanded)}
                className="flex w-full items-center justify-between text-sm font-semibold uppercase text-slate-500 dark:text-slate-400 transition-colors hover:text-slate-700 dark:hover:text-slate-300"
              >
                <span className="flex items-center gap-2">
                  <Archive size={16} />
                  {t('changelog.archiveBatchesCount', { count: archiveBatches.length })}
                </span>
                {archiveExpanded ? <CaretUp size={16} /> : <CaretDown size={16} />}
              </button>
              {archiveExpanded && (
                <div className="space-y-3 animate-fade-in">
                  {archiveBatches.map(batch => (
                    <BatchCard
                      key={batch.batchId}
                      batch={batch}
                      expanded={expandedTargets.has(batch.batchId)}
                      copied={copiedId === batch.batchId}
                      onCopy={() => handleCopy(batch.batchId)}
                      onToggle={() => toggleTargets(batch.batchId)}
                      archived
                    />
                  ))}
                </div>
              )}
            </section>
          )}
        </div>
      )}

      {rollbackMutation.data && (
        <div className="card border-green-300 bg-green-50 p-4 text-sm dark:border-green-700 dark:bg-green-900/20">
          <div className="flex items-start justify-between">
            <div>
              <strong>{t('changelog.rollbackSuccess')}</strong>
              {t('changelog.rollbackSuccessDesc', { count: rollbackMutation.data.restoredFiles.length })}
              {rollbackMutation.data.rebuildTriggered && t('changelog.rollbackTriggered')}
            </div>
            <button
              onClick={() => rollbackMutation.reset()}
              className="ml-3 rounded p-1 text-slate-400 hover:bg-white/50 hover:text-slate-600 dark:hover:bg-slate-700/50 dark:hover:text-slate-200"
            >
              <X size={16} />
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

interface BatchCardProps {
  batch: ChangeLogBatch;
  expanded: boolean;
  copied: boolean;
  onCopy: () => void;
  onToggle: () => void;
  onRollback?: () => void;
  rollingBack?: boolean;
  archived?: boolean;
}

function BatchCard({
  batch,
  expanded,
  copied,
  onCopy,
  onToggle,
  onRollback,
  rollingBack,
  archived
}: BatchCardProps) {
  const { t } = useTranslation();
  const createCount = batch.opCounts.create || 0;
  const updateCount = batch.opCounts.update || 0;
  const deleteCount = batch.opCounts.delete || 0;

  const displayTargets = expanded ? batch.targets : batch.targets.slice(0, 5);
  const hasMore = batch.targets.length > 5;

  return (
    <div className={`card p-5 ${archived ? 'opacity-80' : ''}`}>
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <div className="flex flex-wrap items-center gap-2">
          {archived && (
            <span className="badge badge-blue flex items-center gap-1">
              <Archive size={12} />
              {t('changelog.archived')}
            </span>
          )}
          <span className="flex items-center gap-1.5 font-mono text-sm text-primary-600 dark:text-primary-400">
            {batch.batchId}
            <button
              onClick={onCopy}
              className="rounded p-1 text-slate-400 transition-colors hover:bg-slate-100 hover:text-slate-600 dark:hover:bg-slate-700 dark:hover:text-slate-300"
              title={t('changelog.copyBatchId')}
            >
              {copied ? <Check size={14} className="text-green-500" /> : <Copy size={14} />}
            </button>
          </span>
        </div>
        <div className="text-xs text-slate-500 dark:text-slate-400" title={formatDateTime(batch.ts)}>
          {formatRelativeTime(batch.ts)}
        </div>
      </div>

      <div className="mb-3 flex flex-wrap items-center gap-2">
        {createCount > 0 && (
          <span className="badge badge-green flex items-center gap-1">
            <FilePlus size={12} />
            {t('changelog.createCount', { count: createCount })}
          </span>
        )}
        {updateCount > 0 && (
          <span className="badge badge-yellow flex items-center gap-1">
            <Pencil size={12} />
            {t('changelog.updateCount', { count: updateCount })}
          </span>
        )}
        {deleteCount > 0 && (
          <span className="badge badge-red flex items-center gap-1">
            <FileX size={12} />
            {t('changelog.deleteCount', { count: deleteCount })}
          </span>
        )}
        <span className="text-xs text-slate-500 dark:text-slate-400">
          {t('changelog.totalOps', { total: batch.totalOps, targets: batch.targets.length })}
        </span>
      </div>

      <div className="rounded-lg bg-slate-50 p-3 dark:bg-slate-700/50">
        <div className="mb-2 text-xs font-semibold text-slate-500 dark:text-slate-400">
          {t('changelog.targets')}
        </div>
        <ul className="space-y-1 text-sm">
          {displayTargets.map((target, idx) => (
            <li key={idx} className="truncate font-mono text-slate-700 dark:text-slate-300">
              {target}
            </li>
          ))}
        </ul>
        {hasMore && (
          <button
            onClick={onToggle}
            className="mt-2 flex items-center gap-1 text-xs text-primary-600 hover:text-primary-700 dark:text-primary-400 dark:hover:text-primary-300"
          >
            {expanded ? (
              <>
                <CaretUp size={12} />
                {t('changelog.collapse')}
              </>
            ) : (
              <>
                <CaretDown size={12} />
                {t('changelog.expandAll', { count: batch.targets.length })}
              </>
            )}
          </button>
        )}
      </div>

      <div className="mt-3 flex items-center justify-between">
        <div className="text-xs text-slate-400">
          {formatDateTime(batch.ts)}
        </div>
        {onRollback && !archived && (
          <button
            onClick={onRollback}
            disabled={rollingBack}
            className="btn btn-danger text-sm"
          >
            <ArrowCounterClockwise size={14} className="mr-1" />
            {rollingBack ? t('changelog.rollingBack') : t('changelog.rollback')}
          </button>
        )}
      </div>
    </div>
  );
}
