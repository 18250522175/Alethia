import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { X, Clock, Check, ArrowRight, FloppyDisk, ArrowsLeftRight, CheckCircle, GitDiff } from '@phosphor-icons/react';
import api from '../../lib/api';

interface VersionItem {
  version_id: string;
  comment: string;
  is_active: boolean;
  created_at: string;
}

interface CausalVersionPanelProps {
  onClose: () => void;
}

function formatTime(ts: string): string {
  try {
    const d = new Date(ts);
    return d.toLocaleString('zh-CN', {
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
    });
  } catch {
    return ts;
  }
}

export default function CausalVersionPanel({ onClose }: CausalVersionPanelProps) {
  const queryClient = useQueryClient();
  const [comment, setComment] = useState('');
  const [compareMode, setCompareMode] = useState(false);
  const [selectedV1, setSelectedV1] = useState<string | null>(null);
  const [selectedV2, setSelectedV2] = useState<string | null>(null);
  const [compareResult, setCompareResult] = useState<any>(null);
  const [compareLoading, setCompareLoading] = useState(false);

  // Bottom version compare section state
  const [bottomV1, setBottomV1] = useState('');
  const [bottomV2, setBottomV2] = useState('');
  const [bottomCompareResult, setBottomCompareResult] = useState<any>(null);
  const [bottomCompareLoading, setBottomCompareLoading] = useState(false);

  const { data, isLoading, isError, refetch } = useQuery({
    queryKey: ['causal-versions'],
    queryFn: () => api.listCausalVersions(),
  });

  const versions = data?.versions || [];

  const saveMutation = useMutation({
    mutationFn: () => api.saveCausalVersion(comment),
    onSuccess: () => {
      setComment('');
      queryClient.invalidateQueries({ queryKey: ['causal-versions'] });
    },
  });

  const switchMutation = useMutation({
    mutationFn: (versionId: string) => api.switchCausalVersion(versionId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['causal-versions'] });
      queryClient.invalidateQueries({ queryKey: ['causal-graph'] });
      refetch();
    },
  });

  const handleCompare = async () => {
    if (!selectedV1 || !selectedV2) return;
    setCompareLoading(true);
    try {
      const result = await api.compareCausalVersions(selectedV1, selectedV2);
      setCompareResult(result);
    } catch {
      setCompareResult(null);
    } finally {
      setCompareLoading(false);
    }
  };

  const handleBottomCompare = async () => {
    if (!bottomV1 || !bottomV2) return;
    setBottomCompareLoading(true);
    try {
      const result = await api.compareCausalVersions(bottomV1, bottomV2);
      setBottomCompareResult(result);
    } catch {
      setBottomCompareResult(null);
    } finally {
      setBottomCompareLoading(false);
    }
  };

  const handleCheckboxClick = (versionId: string) => {
    if (selectedV1 === versionId) {
      setSelectedV1(null);
    } else if (selectedV2 === versionId) {
      setSelectedV2(null);
    } else if (!selectedV1) {
      setSelectedV1(versionId);
    } else if (!selectedV2) {
      setSelectedV2(versionId);
    }
    setCompareResult(null);
  };

  return (
    <div className="flex h-full flex-col rounded-lg border border-slate-200 bg-white shadow-lg dark:border-slate-700 dark:bg-slate-850">
      {/* Header */}
      <div className="flex items-center justify-between border-b border-slate-200 px-4 py-3 dark:border-slate-700">
        <div className="flex items-center gap-2">
          <Clock size={18} className="text-indigo-500" />
          <span className="text-sm font-semibold text-slate-800 dark:text-slate-100">版本历史</span>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={() => setCompareMode(!compareMode)}
            className={`rounded px-2 py-1 text-xs font-medium transition-colors ${
              compareMode
                ? 'bg-indigo-100 text-indigo-700 dark:bg-indigo-900/30 dark:text-indigo-400'
                : 'bg-slate-100 text-slate-600 hover:bg-slate-200 dark:bg-slate-700 dark:text-slate-400'
            }`}
          >
            <ArrowsLeftRight size={14} className="inline mr-0.5" />
            对比版本
          </button>
          <button
            onClick={onClose}
            className="rounded p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-600 dark:hover:bg-slate-700 dark:hover:text-slate-300"
          >
            <X size={16} />
          </button>
        </div>
      </div>

      {/* Save Section */}
      <div className="border-b border-slate-200 px-4 py-3 dark:border-slate-700">
        <div className="flex items-center gap-2">
          <input
            type="text"
            value={comment}
            onChange={(e) => setComment(e.target.value)}
            placeholder="输入版本备注（可选）..."
            maxLength={500}
            className="flex-1 rounded border border-slate-300 px-2.5 py-1.5 text-xs text-slate-700 placeholder-slate-400 focus:border-indigo-400 focus:outline-none focus:ring-1 focus:ring-indigo-400 dark:border-slate-600 dark:bg-slate-700 dark:text-slate-200 dark:placeholder-slate-500"
          />
          <button
            onClick={() => saveMutation.mutate()}
            disabled={saveMutation.isPending}
            className="flex items-center gap-1 rounded bg-indigo-500 px-3 py-1.5 text-xs font-medium text-white transition-colors hover:bg-indigo-600 disabled:opacity-50"
          >
            <FloppyDisk size={14} />
            {saveMutation.isPending ? '保存中...' : '保存当前版本'}
          </button>
        </div>
        {saveMutation.isError && (
          <p className="mt-1.5 text-xs text-red-500">保存失败，请重试</p>
        )}
        {saveMutation.isSuccess && (
          <p className="mt-1.5 text-xs text-green-500">版本已保存</p>
        )}
      </div>

      {/* Compare Controls */}
      {compareMode && (
        <div className="border-b border-slate-200 px-4 py-3 dark:border-slate-700">
          <div className="mb-2 flex items-center gap-2 text-xs text-slate-500 dark:text-slate-400">
            <span>选择两个版本进行对比</span>
            {selectedV1 && selectedV2 && (
              <button
                onClick={handleCompare}
                disabled={compareLoading}
                className="ml-auto flex items-center gap-1 rounded bg-indigo-500 px-2.5 py-1 text-xs font-medium text-white hover:bg-indigo-600 disabled:opacity-50"
              >
                {compareLoading ? '对比中...' : '开始对比'}
              </button>
            )}
          </div>
          <div className="flex items-center gap-2 text-xs">
            <span className="rounded bg-slate-100 px-2 py-0.5 text-slate-600 dark:bg-slate-700 dark:text-slate-400">
              v1: {selectedV1 ? selectedV1.slice(0, 20) + '...' : '（未选择）'}
            </span>
            <ArrowRight size={14} className="text-slate-400" />
            <span className="rounded bg-slate-100 px-2 py-0.5 text-slate-600 dark:bg-slate-700 dark:text-slate-400">
              v2: {selectedV2 ? selectedV2.slice(0, 20) + '...' : '（未选择）'}
            </span>
          </div>
        </div>
      )}

      {/* Version List */}
      <div className="flex-1 overflow-y-auto">
        {isLoading && (
          <div className="flex items-center justify-center py-8 text-xs text-slate-400">
            加载版本列表中...
          </div>
        )}
        {isError && (
          <div className="flex items-center justify-center py-8 text-xs text-red-400">
            加载失败，请点击重试
          </div>
        )}
        {!isLoading && !isError && versions.length === 0 && (
          <div className="flex items-center justify-center py-8 text-xs text-slate-400">
            暂无保存的版本
          </div>
        )}
        {versions.map((v: VersionItem) => {
          const isV1 = selectedV1 === v.version_id;
          const isV2 = selectedV2 === v.version_id;
          return (
            <div
              key={v.version_id}
              className={`border-b border-slate-100 px-4 py-2.5 transition-colors dark:border-slate-700/50 ${
                isV1 ? 'bg-blue-50 dark:bg-blue-900/20' :
                isV2 ? 'bg-amber-50 dark:bg-amber-900/20' :
                'hover:bg-slate-50 dark:hover:bg-slate-800/50'
              }`}
            >
              <div className="flex items-start gap-2">
                {compareMode && (
                  <input
                    type="checkbox"
                    checked={isV1 || isV2}
                    onChange={() => handleCheckboxClick(v.version_id)}
                    className="mt-0.5 h-3.5 w-3.5 rounded border-slate-300 text-indigo-500 focus:ring-indigo-400"
                  />
                )}
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-1.5">
                    <span className="text-xs font-mono text-slate-600 dark:text-slate-400 truncate">
                      {v.version_id}
                    </span>
                    {v.is_active && (
                      <span className="flex shrink-0 items-center gap-0.5 rounded bg-green-100 px-1.5 py-0.5 text-[10px] font-medium text-green-700 dark:bg-green-900/30 dark:text-green-400">
                        <CheckCircle size={10} />
                        当前
                      </span>
                    )}
                    {isV1 && compareMode && (
                      <span className="shrink-0 rounded bg-blue-100 px-1.5 py-0.5 text-[10px] font-medium text-blue-700 dark:bg-blue-900/30 dark:text-blue-400">
                        v1
                      </span>
                    )}
                    {isV2 && compareMode && (
                      <span className="shrink-0 rounded bg-amber-100 px-1.5 py-0.5 text-[10px] font-medium text-amber-700 dark:bg-amber-900/30 dark:text-amber-400">
                        v2
                      </span>
                    )}
                  </div>
                  {v.comment && (
                    <p className="mt-0.5 text-xs text-slate-500 dark:text-slate-400 truncate">
                      {v.comment}
                    </p>
                  )}
                  <p className="mt-0.5 text-[10px] text-slate-400 dark:text-slate-500">
                    {formatTime(v.created_at)}
                  </p>
                </div>
                {!compareMode && !v.is_active && (
                  <button
                    onClick={() => switchMutation.mutate(v.version_id)}
                    disabled={switchMutation.isPending}
                    className="flex shrink-0 items-center gap-0.5 rounded border border-slate-200 px-2 py-0.5 text-[10px] text-slate-600 hover:bg-slate-100 disabled:opacity-50 dark:border-slate-600 dark:text-slate-400 dark:hover:bg-slate-700"
                  >
                    <Check size={12} />
                    切换到此版本
                  </button>
                )}
              </div>
            </div>
          );
        })}
      </div>

      {/* Compare Results */}
      {compareResult && (
        <div className="border-t border-slate-200 px-4 py-3 dark:border-slate-700">
          <div className="mb-2 text-xs font-semibold text-slate-700 dark:text-slate-200">对比结果</div>

          {compareResult.added.length === 0 && compareResult.removed.length === 0 && compareResult.modified.length === 0 && (
            <p className="text-xs text-slate-400">两个版本完全相同</p>
          )}

          {compareResult.added.length > 0 && (
            <div className="mb-2">
              <span className="text-xs font-medium text-green-600 dark:text-green-400">
                新增边 ({compareResult.added.length})
              </span>
              <div className="mt-1 space-y-1">
                {compareResult.added.map((e: any, i: number) => (
                  <div
                    key={`added-${i}`}
                    className="rounded bg-green-50 px-2 py-1 text-xs text-green-800 dark:bg-green-900/20 dark:text-green-300"
                  >
                    {e.source_slug} → {e.target_slug} ({e.relation})
                    {e.weight != null && (
                      <span className="ml-1 text-green-600 dark:text-green-400">
                        w:{Number(e.weight).toFixed(1)}
                      </span>
                    )}
                  </div>
                ))}
              </div>
            </div>
          )}

          {compareResult.removed.length > 0 && (
            <div className="mb-2">
              <span className="text-xs font-medium text-red-600 dark:text-red-400">
                删除边 ({compareResult.removed.length})
              </span>
              <div className="mt-1 space-y-1">
                {compareResult.removed.map((e: any, i: number) => (
                  <div
                    key={`removed-${i}`}
                    className="rounded bg-red-50 px-2 py-1 text-xs text-red-800 line-through dark:bg-red-900/20 dark:text-red-300"
                  >
                    {e.source_slug} → {e.target_slug} ({e.relation})
                    {e.weight != null && (
                      <span className="ml-1 text-red-600 dark:text-red-400">
                        w:{Number(e.weight).toFixed(1)}
                      </span>
                    )}
                  </div>
                ))}
              </div>
            </div>
          )}

          {compareResult.modified.length > 0 && (
            <div>
              <span className="text-xs font-medium text-amber-600 dark:text-amber-400">
                修改边 ({compareResult.modified.length})
              </span>
              <div className="mt-1 space-y-1">
                {compareResult.modified.map((m: any, i: number) => (
                  <div
                    key={`modified-${i}`}
                    className="rounded bg-amber-50 px-2 py-1 text-xs dark:bg-amber-900/20"
                  >
                    <span className="text-amber-800 dark:text-amber-300">
                      {m.source} → {m.target} ({m.relation})
                    </span>
                    <div className="mt-0.5 space-y-0.5">
                      {m.changes.map((chg: any, j: number) => (
                        <span
                          key={j}
                          className="block text-amber-700 dark:text-amber-400"
                        >
                          {chg.field}:{' '}
                          <span className="text-red-500 line-through">{JSON.stringify(chg.old)}</span>
                          {' → '}
                          <span className="text-green-500">{JSON.stringify(chg.new)}</span>
                        </span>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      {/* Bottom Version Compare Section */}
      <div className="border-t border-slate-200 px-4 py-3 dark:border-slate-700">
        <div className="flex items-center gap-2 mb-2">
          <GitDiff size={16} className="text-indigo-500" />
          <span className="text-xs font-semibold text-slate-700 dark:text-slate-200">版本对比</span>
        </div>
        <div className="flex items-center gap-2 mb-2">
          <select
            value={bottomV1}
            onChange={e => setBottomV1(e.target.value)}
            className="flex-1 rounded border border-slate-300 bg-slate-50 px-2 py-1.5 text-xs text-slate-700 focus:border-indigo-400 focus:outline-none focus:ring-1 focus:ring-indigo-400 dark:border-slate-600 dark:bg-slate-700 dark:text-slate-200"
          >
            <option value="">选择版本 A...</option>
            {versions.map((v: VersionItem) => (
              <option key={v.version_id} value={v.version_id}>
                {v.version_id.slice(0, 20)}... {v.is_active ? '(当前)' : ''}
              </option>
            ))}
          </select>
          <ArrowRight size={14} className="text-slate-400 shrink-0" />
          <select
            value={bottomV2}
            onChange={e => setBottomV2(e.target.value)}
            className="flex-1 rounded border border-slate-300 bg-slate-50 px-2 py-1.5 text-xs text-slate-700 focus:border-indigo-400 focus:outline-none focus:ring-1 focus:ring-indigo-400 dark:border-slate-600 dark:bg-slate-700 dark:text-slate-200"
          >
            <option value="">选择版本 B...</option>
            {versions.map((v: VersionItem) => (
              <option key={v.version_id} value={v.version_id}>
                {v.version_id.slice(0, 20)}... {v.is_active ? '(当前)' : ''}
              </option>
            ))}
          </select>
          <button
            onClick={handleBottomCompare}
            disabled={bottomCompareLoading || !bottomV1 || !bottomV2}
            className="shrink-0 flex items-center gap-1 rounded bg-indigo-500 px-3 py-1.5 text-xs font-medium text-white hover:bg-indigo-600 disabled:opacity-50 transition-colors"
          >
            {bottomCompareLoading ? '对比中...' : '对比'}
          </button>
        </div>

        {/* Bottom Compare Results */}
        {bottomCompareResult && (
          <div className="mt-3">
            <div className="mb-2 text-xs font-semibold text-slate-700 dark:text-slate-200">对比结果</div>

            {bottomCompareResult.added.length === 0 && bottomCompareResult.removed.length === 0 && bottomCompareResult.modified.length === 0 && (
              <p className="text-xs text-slate-400">两个版本完全相同</p>
            )}

            {bottomCompareResult.added.length > 0 && (
              <div className="mb-2">
                <span className="text-xs font-medium text-green-600 dark:text-green-400">
                  新增边 ({bottomCompareResult.added.length})
                </span>
                <div className="mt-1 space-y-1 max-h-32 overflow-y-auto">
                  {bottomCompareResult.added.map((e: any, i: number) => (
                    <div
                      key={`btm-added-${i}`}
                      className="rounded bg-green-50 px-2 py-1 text-xs text-green-800 dark:bg-green-900/20 dark:text-green-300"
                    >
                      {e.source_slug} → {e.target_slug} ({e.relation})
                      {e.weight != null && (
                        <span className="ml-1 text-green-600 dark:text-green-400">
                          w:{Number(e.weight).toFixed(1)}
                        </span>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            )}

            {bottomCompareResult.removed.length > 0 && (
              <div className="mb-2">
                <span className="text-xs font-medium text-red-600 dark:text-red-400">
                  删除边 ({bottomCompareResult.removed.length})
                </span>
                <div className="mt-1 space-y-1 max-h-32 overflow-y-auto">
                  {bottomCompareResult.removed.map((e: any, i: number) => (
                    <div
                      key={`btm-removed-${i}`}
                      className="rounded bg-red-50 px-2 py-1 text-xs text-red-800 line-through dark:bg-red-900/20 dark:text-red-300"
                    >
                      {e.source_slug} → {e.target_slug} ({e.relation})
                      {e.weight != null && (
                        <span className="ml-1 text-red-600 dark:text-red-400">
                          w:{Number(e.weight).toFixed(1)}
                        </span>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            )}

            {bottomCompareResult.modified.length > 0 && (
              <div>
                <span className="text-xs font-medium text-amber-600 dark:text-amber-400">
                  修改边 ({bottomCompareResult.modified.length})
                </span>
                <div className="mt-1 space-y-1 max-h-32 overflow-y-auto">
                  {bottomCompareResult.modified.map((m: any, i: number) => (
                    <div
                      key={`btm-modified-${i}`}
                      className="rounded bg-amber-50 px-2 py-1 text-xs dark:bg-amber-900/20"
                    >
                      <span className="text-amber-800 dark:text-amber-300">
                        {m.source} → {m.target} ({m.relation})
                      </span>
                      <div className="mt-0.5 space-y-0.5">
                        {m.changes.map((chg: any, j: number) => (
                          <span
                            key={j}
                            className="block text-amber-700 dark:text-amber-400"
                          >
                            {chg.field}:{' '}
                            <span className="text-red-500 line-through">{JSON.stringify(chg.old)}</span>
                            {' → '}
                            <span className="text-green-500">{JSON.stringify(chg.new)}</span>
                          </span>
                        ))}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}