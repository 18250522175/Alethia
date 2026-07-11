import { useState, useMemo } from 'react';
import { X, Lightning, ArrowsClockwise, ChartBar, CaretRight, CaretDown, WarningCircle, Gear } from '@phosphor-icons/react';
import api from '../../lib/api';

interface CausalEdge {
  id: string;
  source_slug: string;
  target_slug: string;
  relation: string;
  weight: number;
  conf: number;
  lag: string;
}

interface CausalReasoningResult {
  baselineProbability: number;
  interventionProbability: number;
  delta: number;
  confidenceInterval: [number, number];
  method: 'cpt' | 'heuristic';
  assumptions: string[];
  evidence: Array<{ source: string; text: string }>;
}

interface PulseItem {
  step: number;
  probability: number;
  confidence: [number, number];
}

interface CausalReasoningPanelProps {
  edges: CausalEdge[];
  onClose: () => void;
}

export default function CausalReasoningPanel({ edges, onClose }: CausalReasoningPanelProps) {
  // 提取所有节点
  const nodeSlugs = useMemo(() => {
    const slugs = new Set<string>();
    for (const edge of edges) {
      slugs.add(edge.source_slug);
      slugs.add(edge.target_slug);
    }
    return Array.from(slugs).sort();
  }, [edges]);

  const [target, setTarget] = useState('');
  const [ivVariable, setIvVariable] = useState('');
  const [toState, setToState] = useState('high');
  const [fromState, setFromState] = useState('low');
  const [isCounterfactual, setIsCounterfactual] = useState(false);
  const [observedVars, setObservedVars] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<CausalReasoningResult | null>(null);
  const [pulses, setPulses] = useState<PulseItem[]>([]);
  const [error, setError] = useState('');
  const [showAssumptions, setShowAssumptions] = useState(false);
  const [showEvidence, setShowEvidence] = useState(false);
  const [showTimePulse, setShowTimePulse] = useState(false);
  const [showAssumptionsCard, setShowAssumptionsCard] = useState(false);
  const [enabledAssumptions, setEnabledAssumptions] = useState<Set<string>>(new Set());
  const [lastModelUpdate, setLastModelUpdate] = useState<string>('');
  const [evalWarnings, setEvalWarnings] = useState<string[]>([]);

  const handleRunReasoning = async () => {
    if (!target || !ivVariable) {
      setError('请选择目标变量和干预变量');
      return;
    }
    setLoading(true);
    setError('');
    setResult(null);
    setPulses([]);
    setShowAssumptionsCard(false);

    try {
      if (isCounterfactual) {
        const res = await api.postCausalCounterfactual({
          observed: observedVars,
          hypothetical: {
            target,
            intervention: { variable: ivVariable, fromState, toState },
          },
        });
        setResult(res as CausalReasoningResult);
        if ((res as CausalReasoningResult).assumptions?.length > 0) {
          setEnabledAssumptions(new Set((res as CausalReasoningResult).assumptions));
          setShowAssumptionsCard(true);
        }
      } else {
        const res = await api.postCausalReason({
          target,
          intervention: { variable: ivVariable, fromState, toState },
        });
        setResult(res as CausalReasoningResult);
        if ((res as CausalReasoningResult).assumptions?.length > 0) {
          setEnabledAssumptions(new Set((res as CausalReasoningResult).assumptions));
          setShowAssumptionsCard(true);
        }

        // 同时获取时间脉冲
        const pulseRes = await api.postCausalTimePulse({
          target,
          intervention: { variable: ivVariable, fromState, toState },
          steps: 5,
        });
        setPulses((pulseRes as any).pulses || []);
      }

      // 12e: Fetch eval check for model health warnings
      try {
        const evalCheck = await api.getCausalEvalCheck();
        setEvalWarnings(evalCheck.warnings || []);
        setLastModelUpdate(new Date().toLocaleString('zh-CN'));
      } catch {
        // Eval check is advisory, ignore errors
      }
    } catch (err: any) {
      setError(err.message || '推理失败');
    } finally {
      setLoading(false);
    }
  };

  const formatPercent = (v: number) => `${(v * 100).toFixed(1)}%`;
  const formatDelta = (v: number) => {
    const sign = v >= 0 ? '+' : '';
    return `${sign}${(v * 100).toFixed(1)}%`;
  };

  const getDeltaColor = (v: number) => {
    if (v > 0.05) return 'text-green-600 dark:text-green-400';
    if (v < -0.05) return 'text-red-600 dark:text-red-400';
    return 'text-slate-500 dark:text-slate-400';
  };

  const toggleAssumption = (assumption: string) => {
    setEnabledAssumptions(prev => {
      const next = new Set(prev);
      if (next.has(assumption)) {
        next.delete(assumption);
      } else {
        next.add(assumption);
      }
      return next;
    });
  };

  const handleRerunWithAssumptions = () => {
    handleRunReasoning();
  };

  return (
    <div className="w-80 rounded-xl border border-slate-200 bg-white p-4 shadow-xl dark:border-slate-700 dark:bg-slate-800 animate-slide-in flex flex-col max-h-[90vh]">
      {/* Header */}
      <div className="mb-3 flex items-start justify-between">
        <div className="flex items-center gap-2">
          <Lightning size={16} className="text-amber-500" />
          <h3 className="text-sm font-semibold text-slate-900 dark:text-white">因果推理引擎</h3>
        </div>
        <button
          onClick={onClose}
          className="rounded p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-600 dark:hover:bg-slate-700 dark:hover:text-slate-200"
        >
          <X size={14} />
        </button>
      </div>

      {/* Form */}
      <div className="space-y-2 mb-3 flex-shrink-0">
        <div>
          <label className="block text-xs font-medium text-slate-500 dark:text-slate-400 mb-1">目标变量</label>
          <select
            value={target}
            onChange={e => setTarget(e.target.value)}
            className="w-full rounded-md border border-slate-200 bg-slate-50 px-2 py-1.5 text-xs text-slate-700 dark:border-slate-600 dark:bg-slate-700 dark:text-slate-200"
          >
            <option value="">选择目标变量...</option>
            {nodeSlugs.map(slug => (
              <option key={slug} value={slug}>{slug}</option>
            ))}
          </select>
        </div>

        <div>
          <label className="block text-xs font-medium text-slate-500 dark:text-slate-400 mb-1">干预变量</label>
          <select
            value={ivVariable}
            onChange={e => setIvVariable(e.target.value)}
            className="w-full rounded-md border border-slate-200 bg-slate-50 px-2 py-1.5 text-xs text-slate-700 dark:border-slate-600 dark:bg-slate-700 dark:text-slate-200"
          >
            <option value="">选择干预变量...</option>
            {nodeSlugs.map(slug => (
              <option key={slug} value={slug}>{slug}</option>
            ))}
          </select>
        </div>

        <div className="flex gap-2">
          <div className="flex-1">
            <label className="block text-xs font-medium text-slate-500 dark:text-slate-400 mb-1">从状态</label>
            <select
              value={fromState}
              onChange={e => setFromState(e.target.value)}
              className="w-full rounded-md border border-slate-200 bg-slate-50 px-2 py-1.5 text-xs text-slate-700 dark:border-slate-600 dark:bg-slate-700 dark:text-slate-200"
            >
              <option value="low">低</option>
              <option value="high">高</option>
            </select>
          </div>
          <div className="flex-1">
            <label className="block text-xs font-medium text-slate-500 dark:text-slate-400 mb-1">到状态</label>
            <select
              value={toState}
              onChange={e => setToState(e.target.value)}
              className="w-full rounded-md border border-slate-200 bg-slate-50 px-2 py-1.5 text-xs text-slate-700 dark:border-slate-600 dark:bg-slate-700 dark:text-slate-200"
            >
              <option value="high">高</option>
              <option value="low">低</option>
            </select>
          </div>
        </div>

        {/* Counterfactual toggle */}
        <label className="flex items-center gap-2 cursor-pointer">
          <input
            type="checkbox"
            checked={isCounterfactual}
            onChange={e => setIsCounterfactual(e.target.checked)}
            className="h-3.5 w-3.5 rounded border-slate-300 text-indigo-600"
          />
          <span className="text-xs text-slate-500 dark:text-slate-400 flex items-center gap-1">
            <ArrowsClockwise size={12} />
            反事实推理模式
          </span>
        </label>
      </div>

      {/* Run button */}
      <button
        onClick={handleRunReasoning}
        disabled={loading}
        className="w-full rounded-lg bg-indigo-600 py-2 text-xs font-medium text-white hover:bg-indigo-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors flex-shrink-0"
      >
        {loading ? '推理中...' : '运行推理'}
      </button>

      {error && (
        <p className="mt-2 text-xs text-red-500">{error}</p>
      )}

      {/* Results */}
      {result && (
        <div className="mt-3 flex-1 overflow-y-auto space-y-3">
          {/* Key metrics */}
          <div className="grid grid-cols-3 gap-2">
            <div className="rounded-lg bg-slate-50 dark:bg-slate-700/50 p-2 text-center">
              <div className="text-xs text-slate-400 dark:text-slate-500">基线概率</div>
              <div className="text-sm font-semibold text-slate-700 dark:text-slate-200">
                {formatPercent(result.baselineProbability)}
              </div>
            </div>
            <div className="rounded-lg bg-indigo-50 dark:bg-indigo-900/20 p-2 text-center">
              <div className="text-xs text-indigo-400 dark:text-indigo-500">干预后</div>
              <div className="text-sm font-semibold text-indigo-700 dark:text-indigo-300">
                {formatPercent(result.interventionProbability)}
              </div>
            </div>
            <div className="rounded-lg bg-slate-50 dark:bg-slate-700/50 p-2 text-center">
              <div className="text-xs text-slate-400 dark:text-slate-500">变化</div>
              <div className={`text-sm font-semibold ${getDeltaColor(result.delta)}`}>
                {formatDelta(result.delta)}
              </div>
            </div>
          </div>

          {/* Confidence interval */}
          <div className="rounded-lg bg-slate-50 dark:bg-slate-700/50 p-2">
            <div className="text-xs text-slate-400 dark:text-slate-500 mb-1">95% 置信区间</div>
            <div className="flex items-center gap-2">
              <div className="flex-1 h-2 rounded-full bg-slate-200 dark:bg-slate-600 overflow-hidden">
                <div
                  className="h-full rounded-full bg-indigo-500"
                  style={{
                    marginLeft: `${result.confidenceInterval[0] * 100}%`,
                    width: `${(result.confidenceInterval[1] - result.confidenceInterval[0]) * 100}%`,
                  }}
                />
              </div>
              <span className="text-xs text-slate-500 dark:text-slate-400">
                [{formatPercent(result.confidenceInterval[0])}, {formatPercent(result.confidenceInterval[1])}]
              </span>
            </div>
          </div>

          {/* Method */}
          <div className="text-xs">
            <span className="text-slate-400 dark:text-slate-500">推理方法: </span>
            <span className={`font-medium ${result.method === 'cpt' ? 'text-green-600 dark:text-green-400' : 'text-amber-600 dark:text-amber-400'}`}>
              {result.method === 'cpt' ? 'CPT 精确推理' : '启发式推理'}
            </span>
          </div>

          {/* Assumptions */}
          <div>
            <button
              onClick={() => setShowAssumptions(!showAssumptions)}
              className="flex items-center gap-1 text-xs text-slate-500 dark:text-slate-400 hover:text-slate-700 dark:hover:text-slate-200"
            >
              {showAssumptions ? <CaretDown size={12} /> : <CaretRight size={12} />}
              假设前提 ({result.assumptions.length})
            </button>
            {showAssumptions && (
              <ul className="mt-1 space-y-0.5 pl-4">
                {result.assumptions.map((a, i) => (
                  <li key={i} className="text-xs text-slate-400 dark:text-slate-500 list-disc">{a}</li>
                ))}
              </ul>
            )}
          </div>

          {/* Evidence chain */}
          {result.evidence.length > 0 && (
            <div>
              <button
                onClick={() => setShowEvidence(!showEvidence)}
                className="flex items-center gap-1 text-xs text-slate-500 dark:text-slate-400 hover:text-slate-700 dark:hover:text-slate-200"
              >
                {showEvidence ? <CaretDown size={12} /> : <CaretRight size={12} />}
                证据链 ({result.evidence.length})
              </button>
              {showEvidence && (
                <div className="mt-1 space-y-1.5 max-h-32 overflow-y-auto">
                  {result.evidence.map((ev, i) => (
                    <div key={i} className="rounded border border-slate-100 dark:border-slate-600 p-1.5">
                      <div className="text-xs text-slate-500 dark:text-slate-400 font-mono">{ev.source}</div>
                      <div className="text-xs text-slate-600 dark:text-slate-300 mt-0.5 line-clamp-2">{ev.text}</div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* 12e: 假设与局限卡片 */}
          <div>
            <button
              onClick={() => setShowAssumptionsCard(!showAssumptionsCard)}
              className="flex items-center gap-1 text-xs font-medium text-amber-600 dark:text-amber-400 hover:text-amber-700 dark:hover:text-amber-300"
            >
              {showAssumptionsCard ? <CaretDown size={12} /> : <CaretRight size={12} />}
              <WarningCircle size={12} />
              假设与局限
            </button>
            {showAssumptionsCard && (
              <div className="mt-2 space-y-2 rounded-lg border border-amber-200 bg-amber-50/50 p-2.5 dark:border-amber-800 dark:bg-amber-900/20">
                {/* Assumptions list */}
                {result.assumptions.length > 0 && (
                  <div>
                    <div className="text-xs font-medium text-amber-700 dark:text-amber-400 mb-1.5">
                      推理假设 ({result.assumptions.length})
                    </div>
                    <div className="space-y-1">
                      {result.assumptions.map((a, i) => (
                        <label
                          key={i}
                          className="flex items-start gap-1.5 cursor-pointer"
                        >
                          <input
                            type="checkbox"
                            checked={enabledAssumptions.has(a)}
                            onChange={() => toggleAssumption(a)}
                            className="mt-0.5 h-3 w-3 rounded border-amber-300 text-amber-600"
                          />
                          <span className="text-xs text-slate-600 dark:text-slate-300 leading-relaxed">
                            {a}
                          </span>
                        </label>
                      ))}
                    </div>
                  </div>
                )}

                {/* Data freshness */}
                {lastModelUpdate && (
                  <div className="border-t border-amber-200 pt-1.5 dark:border-amber-800">
                    <div className="flex items-center gap-1 text-xs text-slate-500 dark:text-slate-400">
                      <Gear size={10} />
                      <span>模型数据更新: {lastModelUpdate}</span>
                    </div>
                  </div>
                )}

                {/* Model eval warnings */}
                {evalWarnings.length > 0 && (
                  <div className="border-t border-amber-200 pt-1.5 dark:border-amber-800">
                    <div className="text-xs font-medium text-amber-700 dark:text-amber-400 mb-1">
                      潜在混杂因素警告
                    </div>
                    <ul className="space-y-0.5">
                      {evalWarnings.map((w, i) => (
                        <li key={i} className="flex items-start gap-1 text-xs text-slate-500 dark:text-slate-400">
                          <WarningCircle size={10} className="mt-0.5 flex-shrink-0 text-amber-500" />
                          <span>{w}</span>
                        </li>
                      ))}
                    </ul>
                  </div>
                )}

                {/* Re-run button */}
                <button
                  onClick={handleRerunWithAssumptions}
                  disabled={loading}
                  className="w-full rounded-md border border-amber-300 bg-white px-2 py-1.5 text-xs font-medium text-amber-700 hover:bg-amber-100 disabled:opacity-50 dark:border-amber-700 dark:bg-slate-700 dark:text-amber-300 dark:hover:bg-amber-900/30 transition-colors"
                >
                  调整假设重新推理
                </button>
              </div>
            )}
          </div>

          {/* Time Pulse Chart */}
          {pulses.length > 0 && !isCounterfactual && (
            <div>
              <button
                onClick={() => setShowTimePulse(!showTimePulse)}
                className="flex items-center gap-1 text-xs text-slate-500 dark:text-slate-400 hover:text-slate-700 dark:hover:text-slate-200"
              >
                <ChartBar size={12} />
                {showTimePulse ? <CaretDown size={12} /> : <CaretRight size={12} />}
                时间脉冲响应
              </button>
              {showTimePulse && (
                <div className="mt-2">
                  <div className="flex items-end gap-1.5 h-20">
                    {pulses.map((p, i) => {
                      const height = `${Math.max(4, p.probability * 100)}%`;
                      return (
                        <div key={i} className="flex-1 flex flex-col items-center gap-0.5">
                          <span className="text-[10px] text-slate-400 dark:text-slate-500">
                            {formatPercent(p.probability)}
                          </span>
                          <div className="w-full flex-1 flex items-end">
                            <div
                              className="w-full rounded-t-sm bg-indigo-400 dark:bg-indigo-500 transition-all"
                              style={{ height }}
                              title={`Step ${p.step}: ${formatPercent(p.probability)}`}
                            />
                          </div>
                          <span className="text-[10px] text-slate-400 dark:text-slate-500">t{p.step}</span>
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
}