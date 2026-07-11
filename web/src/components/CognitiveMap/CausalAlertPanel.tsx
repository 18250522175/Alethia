import { useState, useEffect, useCallback } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  Bell,
  Plus,
  Trash,
  ToggleRight,
  ToggleLeft,
  Warning,
  X,
  Lightning,
  Spinner,
  Wrench,
  Minus,
  Prohibit,
  Check,
} from '@phosphor-icons/react';
import api from '../../lib/api';
import { useNotification } from '../../contexts/NotificationContext';

interface CausalAlertData {
  id: number;
  edge_id: number;
  source_slug: string;
  target_slug: string;
  relation: string;
  threshold: { condition: string; value: number };
  enabled: boolean;
  last_triggered_at: string | null;
  created_at: string;
}

interface TriggeredAlert {
  alertId: number;
  edgeId: number;
  sourceSlug: string;
  targetSlug: string;
  message: string;
}

interface CausalEdge {
  id: string;
  source_slug: string;
  target_slug: string;
  relation: string;
  weight: number;
  conf: number;
}

interface CausalAlertPanelProps {
  edges: CausalEdge[];
  onTriggeredEdges?: (edgeIds: Set<string>) => void;
  onClose: () => void;
}

const CONDITION_LABELS: Record<string, string> = {
  gt: '大于',
  lt: '小于',
  gte: '大于等于',
  lte: '小于等于',
};

function getRelationLabel(relation: string): string {
  const map: Record<string, string> = {
    ':causesIncrease': '正向因果',
    ':causesDecrease': '负向因果',
    ':inhibits': '抑制',
    ':feedbackLoop': '反馈回路',
  };
  return map[relation] || relation;
}

export default function CausalAlertPanel({ edges, onTriggeredEdges, onClose }: CausalAlertPanelProps) {
  const queryClient = useQueryClient();
  const { addNotification } = useNotification();
  const [showCreateForm, setShowCreateForm] = useState(false);
  const [selectedEdgeId, setSelectedEdgeId] = useState<string>('');
  const [selectedCondition, setSelectedCondition] = useState('gt');
  const [thresholdValue, setThresholdValue] = useState('');
  const [triggeredEdgeIds, setTriggeredEdgeIds] = useState<Set<string>>(new Set());
  const [acknowledgedAlertIds, setAcknowledgedAlertIds] = useState<Set<number>>(new Set());

  // Fetch alerts
  const { data: alertsData, isLoading: alertsLoading } = useQuery({
    queryKey: ['causal-alerts'],
    queryFn: () => api.listCausalAlerts(),
    staleTime: 30_000,
  });

  const alerts = alertsData?.alerts || [];

  // Create alert mutation
  const createMutation = useMutation({
    mutationFn: (body: { edgeId: number; threshold: { condition: string; value: number }; enabled: boolean }) =>
      api.createCausalAlert(body),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['causal-alerts'] });
      setShowCreateForm(false);
      setSelectedEdgeId('');
      setThresholdValue('');
    },
  });

  // Update alert mutation
  const updateMutation = useMutation({
    mutationFn: ({ id, body }: { id: number; body: { enabled?: boolean } }) =>
      api.updateCausalAlert(id, body),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['causal-alerts'] });
    },
  });

  // Delete alert mutation
  const deleteMutation = useMutation({
    mutationFn: (id: number) => api.deleteCausalAlert(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['causal-alerts'] });
    },
  });

  // Fix: reduce edge weight
  const reduceWeightMutation = useMutation({
    mutationFn: ({ edgeId, alertId }: { edgeId: number; alertId: number }) =>
      Promise.all([
        api.updateCausalEdge(edgeId, { weight: 0.1 }),
        api.updateCausalAlert(alertId, { enabled: false }),
      ]),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['causal-alerts'] });
      queryClient.invalidateQueries({ queryKey: ['causal-graph'] });
      addNotification({
        type: 'system' as any,
        title: '已降低权重',
        description: '因果边权重已降低至 0.1',
      });
    },
  });

  // Fix: delete conflicting edge
  const deleteEdgeMutation = useMutation({
    mutationFn: ({ edgeId, alertId }: { edgeId: number; alertId: number }) =>
      Promise.all([
        api.deleteCausalEdge(edgeId),
        api.updateCausalAlert(alertId, { enabled: false }),
      ]),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['causal-alerts'] });
      queryClient.invalidateQueries({ queryKey: ['causal-graph'] });
      addNotification({
        type: 'system' as any,
        title: '已删除冲突边',
        description: '冲突因果边已被删除',
      });
    },
  });

  // Fix: ignore/dismiss alert
  const ignoreMutation = useMutation({
    mutationFn: (alertId: number) =>
      api.updateCausalAlert(alertId, { enabled: false }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['causal-alerts'] });
      addNotification({
        type: 'system' as any,
        title: '已忽略预警',
        description: '该预警规则已禁用',
      });
    },
  });

  const [openFixMenuId, setOpenFixMenuId] = useState<number | null>(null);

  // Check alerts mutation
  const checkMutation = useMutation({
    mutationFn: () => api.checkCausalAlerts(),
    onSuccess: (data) => {
      const newTriggeredIds = new Set<string>();
      const newAcknowledged = new Set<number>(acknowledgedAlertIds);

      for (const triggered of data.triggered) {
        if (!newAcknowledged.has(triggered.alertId)) {
          newTriggeredIds.add(String(triggered.edgeId));
          // Add notification
          addNotification({
            type: 'anomaly' as any,
            title: '因果预警触发',
            description: triggered.message,
            actionUrl: '/cognitive-map',
            actionLabel: '查看因果图',
          });
        }
      }

      setTriggeredEdgeIds(newTriggeredIds);
      setAcknowledgedAlertIds(newAcknowledged);
      onTriggeredEdges?.(newTriggeredIds);
    },
  });

  // Acknowledge triggered alerts
  const acknowledgeAlerts = useCallback(() => {
    const newAcknowledged = new Set(acknowledgedAlertIds);
    for (const alert of alerts) {
      if (triggeredEdgeIds.has(String(alert.edge_id))) {
        newAcknowledged.add(alert.id);
      }
    }
    setAcknowledgedAlertIds(newAcknowledged);
    setTriggeredEdgeIds(new Set());
    onTriggeredEdges?.(new Set());
  }, [alerts, triggeredEdgeIds, acknowledgedAlertIds, onTriggeredEdges]);

  const handleCreate = () => {
    if (!selectedEdgeId || !thresholdValue) return;
    const numValue = parseFloat(thresholdValue);
    if (isNaN(numValue)) return;

    createMutation.mutate({
      edgeId: parseInt(selectedEdgeId, 10),
      threshold: { condition: selectedCondition, value: numValue },
      enabled: true,
    });
  };

  const handleToggle = (alert: CausalAlertData) => {
    updateMutation.mutate({ id: alert.id, body: { enabled: !alert.enabled } });
  };

  const handleDelete = (id: number) => {
    if (confirm('确定要删除此预警吗？')) {
      deleteMutation.mutate(id);
    }
  };

  const handleCheck = () => {
    checkMutation.mutate();
  };

  const hasTriggered = triggeredEdgeIds.size > 0;

  return (
    <div className="w-80 rounded-lg border border-slate-200 bg-white shadow-xl dark:border-slate-700 dark:bg-slate-800 overflow-hidden">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-slate-200 dark:border-slate-700">
        <div className="flex items-center gap-2">
          <Bell size={18} className="text-slate-600 dark:text-slate-300" />
          <span className="font-semibold text-sm text-slate-900 dark:text-white">因果预警</span>
          {hasTriggered && (
            <span className="flex h-2 w-2">
              <span className="animate-ping absolute inline-flex h-2 w-2 rounded-full bg-red-400 opacity-75" />
              <span className="relative inline-flex rounded-full h-2 w-2 bg-red-500" />
            </span>
          )}
        </div>
        <button
          onClick={onClose}
          className="rounded p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-600 dark:hover:bg-slate-700 dark:hover:text-slate-300"
        >
          <X size={16} />
        </button>
      </div>

      {/* Actions */}
      <div className="flex gap-2 px-4 py-2 border-b border-slate-100 dark:border-slate-700">
        <button
          onClick={() => setShowCreateForm(!showCreateForm)}
          className="flex items-center gap-1.5 rounded-md bg-primary-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-primary-700 transition-colors"
        >
          <Plus size={14} />
          新建预警
        </button>
        <button
          onClick={handleCheck}
          disabled={checkMutation.isPending}
          className="flex items-center gap-1.5 rounded-md border border-orange-300 bg-orange-50 px-3 py-1.5 text-xs font-medium text-orange-700 hover:bg-orange-100 dark:border-orange-700 dark:bg-orange-900/30 dark:text-orange-400 dark:hover:bg-orange-900/50 transition-colors disabled:opacity-50"
        >
          {checkMutation.isPending ? (
            <Spinner size={14} className="animate-spin" />
          ) : (
            <Lightning size={14} />
          )}
          检查预警
        </button>
      </div>

      {/* Create Form */}
      {showCreateForm && (
        <div className="px-4 py-3 border-b border-slate-100 dark:border-slate-700 bg-slate-50 dark:bg-slate-800/50">
          <div className="space-y-2">
            <div>
              <label className="block text-xs font-medium text-slate-600 dark:text-slate-400 mb-1">
                选择因果边
              </label>
              <select
                value={selectedEdgeId}
                onChange={e => setSelectedEdgeId(e.target.value)}
                className="w-full rounded border border-slate-200 bg-white px-2 py-1.5 text-xs text-slate-700 dark:border-slate-600 dark:bg-slate-700 dark:text-slate-200 focus:border-primary-500 focus:outline-none"
              >
                <option value="">-- 选择边 --</option>
                {edges.map(edge => (
                  <option key={edge.id} value={edge.id}>
                    {edge.source_slug} → {edge.target_slug} ({getRelationLabel(edge.relation)})
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-600 dark:text-slate-400 mb-1">
                条件类型
              </label>
              <select
                value={selectedCondition}
                onChange={e => setSelectedCondition(e.target.value)}
                className="w-full rounded border border-slate-200 bg-white px-2 py-1.5 text-xs text-slate-700 dark:border-slate-600 dark:bg-slate-700 dark:text-slate-200 focus:border-primary-500 focus:outline-none"
              >
                <option value="gt">大于</option>
                <option value="lt">小于</option>
                <option value="gte">大于等于</option>
                <option value="lte">小于等于</option>
              </select>
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-600 dark:text-slate-400 mb-1">
                阈值
              </label>
              <input
                type="number"
                step="0.01"
                value={thresholdValue}
                onChange={e => setThresholdValue(e.target.value)}
                placeholder="输入阈值，如 0.8"
                className="w-full rounded border border-slate-200 bg-white px-2 py-1.5 text-xs text-slate-700 dark:border-slate-600 dark:bg-slate-700 dark:text-slate-200 focus:border-primary-500 focus:outline-none"
              />
            </div>
            <div className="flex gap-2">
              <button
                onClick={handleCreate}
                disabled={createMutation.isPending || !selectedEdgeId || !thresholdValue}
                className="flex-1 rounded-md bg-primary-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-primary-700 disabled:opacity-50 transition-colors"
              >
                {createMutation.isPending ? '创建中...' : '创建预警'}
              </button>
              <button
                onClick={() => setShowCreateForm(false)}
                className="rounded-md border border-slate-200 px-3 py-1.5 text-xs text-slate-600 hover:bg-slate-100 dark:border-slate-600 dark:text-slate-400 dark:hover:bg-slate-700 transition-colors"
              >
                取消
              </button>
            </div>
            {createMutation.isError && (
              <p className="text-xs text-red-500">
                {(createMutation.error as any)?.message || '创建失败'}
              </p>
            )}
          </div>
        </div>
      )}

      {/* Triggered alerts banner */}
      {hasTriggered && (
        <div className="mx-4 mt-2 rounded-md bg-red-50 border border-red-200 px-3 py-2 dark:bg-red-900/20 dark:border-red-800">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-1.5">
              <Warning size={14} className="text-red-500 animate-pulse" />
              <span className="text-xs font-medium text-red-700 dark:text-red-400">
                {triggeredEdgeIds.size} 条边触发预警
              </span>
            </div>
            <button
              onClick={acknowledgeAlerts}
              className="text-xs text-red-600 hover:text-red-800 dark:text-red-400 dark:hover:text-red-300"
            >
              确认
            </button>
          </div>
        </div>
      )}

      {/* Alert list */}
      <div className="max-h-64 overflow-y-auto">
        {alertsLoading ? (
          <div className="flex items-center justify-center py-8">
            <Spinner size={20} className="animate-spin text-slate-400" />
          </div>
        ) : alerts.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-8 text-slate-400 dark:text-slate-500">
            <Bell size={32} weight="thin" />
            <p className="mt-2 text-xs">暂无预警规则</p>
          </div>
        ) : (
          <ul className="divide-y divide-slate-100 dark:divide-slate-700">
            {alerts.map(alert => {
              const isTriggered = triggeredEdgeIds.has(String(alert.edge_id));
              const isFixMenuOpen = openFixMenuId === alert.id;
              return (
                <li
                  key={alert.id}
                  className={`px-4 py-2.5 transition-colors ${
                    isTriggered
                      ? 'bg-red-50 dark:bg-red-900/10'
                      : 'hover:bg-slate-50 dark:hover:bg-slate-700/50'
                  }`}
                >
                  <div className="flex items-start justify-between gap-2">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-1.5">
                        {isTriggered && (
                          <span className="animate-pulse">
                            <Warning size={12} className="text-red-500" />
                          </span>
                        )}
                        <span className="text-xs font-medium text-slate-700 dark:text-slate-200 truncate">
                          {alert.source_slug}
                        </span>
                        <span className="text-xs text-slate-400">→</span>
                        <span className="text-xs font-medium text-slate-700 dark:text-slate-200 truncate">
                          {alert.target_slug}
                        </span>
                      </div>
                      <div className="mt-0.5 flex items-center gap-2">
                        <span className="text-xs text-slate-400 dark:text-slate-500">
                          {getRelationLabel(alert.relation)}
                        </span>
                        <span className="text-xs px-1.5 py-0.5 rounded bg-slate-100 text-slate-600 dark:bg-slate-700 dark:text-slate-300">
                          {CONDITION_LABELS[alert.threshold.condition] || alert.threshold.condition} {alert.threshold.value}
                        </span>
                      </div>
                    </div>
                    <div className="flex items-center gap-1 flex-shrink-0 relative">
                      {/* Fix button */}
                      {isTriggered && (
                        <div className="relative">
                          <button
                            onClick={() => setOpenFixMenuId(isFixMenuOpen ? null : alert.id)}
                            className="rounded p-0.5 text-orange-500 hover:bg-orange-100 dark:hover:bg-orange-900/30 transition-colors"
                            title="修复"
                          >
                            <Wrench size={14} />
                          </button>
                          {isFixMenuOpen && (
                            <div className="absolute right-0 top-6 z-50 min-w-[130px] rounded-lg border border-slate-200 bg-white shadow-xl dark:border-slate-700 dark:bg-slate-800 animate-fade-in">
                              <button
                                onClick={() => {
                                  reduceWeightMutation.mutate({ edgeId: alert.edge_id, alertId: alert.id });
                                  setOpenFixMenuId(null);
                                }}
                                disabled={reduceWeightMutation.isPending}
                                className="flex w-full items-center gap-2 px-3 py-2 text-xs text-slate-700 hover:bg-slate-50 dark:text-slate-300 dark:hover:bg-slate-700 disabled:opacity-50"
                              >
                                <Minus size={12} className="text-orange-500" />
                                降低权重
                              </button>
                              <button
                                onClick={() => {
                                  if (confirm(`确定要删除边 ${alert.source_slug} → ${alert.target_slug} 吗？`)) {
                                    deleteEdgeMutation.mutate({ edgeId: alert.edge_id, alertId: alert.id });
                                    setOpenFixMenuId(null);
                                  }
                                }}
                                disabled={deleteEdgeMutation.isPending}
                                className="flex w-full items-center gap-2 px-3 py-2 text-xs text-slate-700 hover:bg-slate-50 dark:text-slate-300 dark:hover:bg-slate-700 disabled:opacity-50"
                              >
                                <Prohibit size={12} className="text-red-500" />
                                删除冲突边
                              </button>
                              <button
                                onClick={() => {
                                  ignoreMutation.mutate(alert.id);
                                  setOpenFixMenuId(null);
                                }}
                                disabled={ignoreMutation.isPending}
                                className="flex w-full items-center gap-2 px-3 py-2 text-xs text-slate-700 hover:bg-slate-50 dark:text-slate-300 dark:hover:bg-slate-700 disabled:opacity-50"
                              >
                                <Check size={12} className="text-green-500" />
                                忽略
                              </button>
                            </div>
                          )}
                        </div>
                      )}
                      <button
                        onClick={() => handleToggle(alert)}
                        disabled={updateMutation.isPending}
                        className="rounded p-0.5 hover:bg-slate-200 dark:hover:bg-slate-600 transition-colors"
                        title={alert.enabled ? '禁用' : '启用'}
                      >
                        {alert.enabled ? (
                          <ToggleRight size={18} className="text-green-500" />
                        ) : (
                          <ToggleLeft size={18} className="text-slate-400" />
                        )}
                      </button>
                      <button
                        onClick={() => handleDelete(alert.id)}
                        disabled={deleteMutation.isPending}
                        className="rounded p-0.5 text-slate-400 hover:bg-red-100 hover:text-red-500 dark:hover:bg-red-900/30 dark:hover:text-red-400 transition-colors"
                        title="删除"
                      >
                        <Trash size={14} />
                      </button>
                    </div>
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </div>

      {/* Check error */}
      {checkMutation.isError && (
        <div className="px-4 py-2 border-t border-slate-100 dark:border-slate-700">
          <p className="text-xs text-red-500">
            {(checkMutation.error as any)?.message || '检查失败'}
          </p>
        </div>
      )}
    </div>
  );
}