import {
  ArrowClockwise,
  CaretDown,
  CaretRight,
  ChartLine,
  CheckCircle,
  Clock,
  Funnel,
  GitBranch,
  Play,
  Plus,
  Target,
  TrendUp,
  Warning,
  WarningOctagon,
  XCircle
} from '@phosphor-icons/react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import React, { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import api from '../lib/api';

interface Benchmark {
  id: number;
  type: string;
  slug?: string;
  sourceText: string;
  expectedOutput: string;
  gitCommit?: string;
  passed?: boolean;
  score?: number;
}

interface Anomaly {
  id: string;
  metric: string;
  threshold: number;
  actual: number;
  ts: string;
  message: string;
}

interface EvalSummary {
  total: number;
  passed: number;
  accuracy: number;
  reproductionRate: number;
  newErrors: number;
  lastRun?: string;
}

interface TrendPoint {
  date: string;
  accuracy: number;
}

interface EvalReport {
  benchmarks: Benchmark[];
  anomalies: Anomaly[];
  summary: EvalSummary;
  trend: TrendPoint[];
}

interface RunEvalResult {
  passed: boolean;
  accuracy: number;
  reproductionRate: number;
  newErrors: number;
  errors: string[];
}

export default function EvalReportPage() {
  const { t } = useTranslation();
  const queryClient = useQueryClient();
  const [expandedRows, setExpandedRows] = useState<Set<number>>(new Set());
  const [typeFilter, setTypeFilter] = useState<string>('all');
  const [anomaliesCollapsed, setAnomaliesCollapsed] = useState(false);

  const evalQuery = useQuery<EvalReport>({
    queryKey: ['eval-report'],
    queryFn: () => api.getEvalReport() as Promise<EvalReport>,
    staleTime: 30_000
  });

  const runMutation = useMutation<RunEvalResult>({
    mutationFn: () => api.runShadowEval() as Promise<RunEvalResult>,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['eval-report'] });
    }
  });

  const data = evalQuery.data;
  const isLoading = evalQuery.isLoading;
  const isError = evalQuery.isError;

  const types = useMemo(() => {
    if (!data?.benchmarks) return [] as string[];
    const set = new Set<string>();
    data.benchmarks.forEach((b: Benchmark) => set.add(b.type));
    return Array.from(set);
  }, [data?.benchmarks]);

  const filteredBenchmarks = useMemo(() => {
    if (!data?.benchmarks) return [] as Benchmark[];
    if (typeFilter === 'all') return data.benchmarks;
    return data.benchmarks.filter((b: Benchmark) => b.type === typeFilter);
  }, [data?.benchmarks, typeFilter]);

  const toggleRow = (id: number) => {
    setExpandedRows((prev) => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
  };

  return (
    <div className="space-y-6 animate-fade-in">
      <header className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="flex items-center gap-2 text-2xl font-bold">
            <ChartLine size={28} className="text-primary-500" />
            评估报告
          </h1>
          <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
            回归测试、异常熔断与质量趋势一览
          </p>
        </div>
        <button
          onClick={() => runMutation.mutate()}
          disabled={runMutation.isPending}
          className="btn btn-primary"
        >
          <Play size={16} className={`mr-1.5 ${runMutation.isPending ? 'animate-spin' : ''}`} />
          {runMutation.isPending ? '评估中...' : '运行评估'}
        </button>
      </header>

      {isLoading ? (
        <div className="card py-16 text-center text-slate-500">{t('common.loading')}</div>
      ) : isError || !data ? (
        <EmptyState />
      ) : (
        <>
          {data.anomalies.length > 0 && (
            <section className="animate-slide-up">
              <button
                onClick={() => setAnomaliesCollapsed(!anomaliesCollapsed)}
                className="flex w-full items-center justify-between rounded-xl border border-red-300 bg-red-50 p-4 text-left dark:border-red-700 dark:bg-red-900/20"
              >
                <div className="flex items-center gap-3">
                  <WarningOctagon size={24} className="text-red-500" />
                  <div>
                    <h3 className="font-semibold text-red-800 dark:text-red-200">异常熔断告警</h3>
                    <p className="text-sm text-red-600 dark:text-red-300">
                      检测到 {data.anomalies.length} 个异常指标
                    </p>
                  </div>
                </div>
                {anomaliesCollapsed ? (
                  <CaretDown size={20} className="text-red-500" />
                ) : (
                  <CaretRight size={20} className="text-red-500" />
                )}
              </button>
              {!anomaliesCollapsed && (
                <div className="mt-2 space-y-2 animate-fade-in">
                  {data.anomalies.map((a: Anomaly) => (
                    <div
                      key={a.id}
                      className="card border-red-200 bg-red-50/50 p-4 dark:border-red-800 dark:bg-red-900/10"
                    >
                      <div className="flex items-start justify-between">
                        <div>
                          <div className="flex items-center gap-2">
                            <Warning size={16} className="text-red-500" />
                            <span className="font-medium text-red-800 dark:text-red-200">
                              {a.metric}
                            </span>
                            <span className="badge badge-red">异常</span>
                          </div>
                          <p className="mt-1 text-sm text-slate-600 dark:text-slate-300">
                            {a.message}
                          </p>
                        </div>
                        <div className="text-right text-sm">
                          <div className="text-slate-500 dark:text-slate-400">
                            阈值: {a.threshold}
                          </div>
                          <div className="font-semibold text-red-600 dark:text-red-400">
                            实际: {a.actual}
                          </div>
                        </div>
                      </div>
                      <div className="mt-2 flex items-center gap-1 text-xs text-slate-400">
                        <Clock size={12} />
                        {new Date(a.ts).toLocaleString('zh-CN')}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </section>
          )}

          <section>
            <h2 className="mb-3 text-sm font-semibold uppercase text-slate-500 dark:text-slate-400">
              质量指标
            </h2>
            <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
              <MetricCard
                icon={<Target size={20} />}
                label="正确率"
                value={`${Math.round(data.summary.accuracy * 100)}%`}
                color="bg-emerald-500"
                trend={
                  data.summary.accuracy >= 0.9
                    ? 'up'
                    : data.summary.accuracy >= 0.7
                      ? 'neutral'
                      : 'down'
                }
              />
              <MetricCard
                icon={<ArrowClockwise size={20} />}
                label="复现率"
                value={`${Math.round(data.summary.reproductionRate * 100)}%`}
                color="bg-primary-500"
                trend={data.summary.reproductionRate >= 0.9 ? 'up' : 'neutral'}
              />
              <MetricCard
                icon={<Plus size={20} />}
                label="新增错误"
                value={data.summary.newErrors.toString()}
                color={data.summary.newErrors > 0 ? 'bg-red-500' : 'bg-green-500'}
                warning={data.summary.newErrors > 0}
              />
              <MetricCard
                icon={<CheckCircle size={20} />}
                label="通过 / 总数"
                value={`${data.summary.passed}/${data.summary.total}`}
                color="bg-sky-500"
              />
            </div>
            {data.summary.lastRun && (
              <div className="mt-3 text-xs text-slate-500 dark:text-slate-400">
                <Clock size={12} className="mr-1 inline" />
                最后运行: {new Date(data.summary.lastRun).toLocaleString('zh-CN')}
              </div>
            )}
          </section>

          <section className="card p-5">
            <div className="mb-4 flex items-center justify-between">
              <h2 className="flex items-center gap-2 text-sm font-semibold">
                <TrendUp size={18} className="text-primary-500" />
                正确率趋势
              </h2>
              <span className="text-xs text-slate-500 dark:text-slate-400">
                最近 {data.trend.length} 次评估
              </span>
            </div>
            <TrendChart data={data.trend} />
          </section>

          <section className="card">
            <div className="flex flex-col gap-3 border-b border-slate-200 p-4 dark:border-slate-700 sm:flex-row sm:items-center sm:justify-between">
              <h2 className="flex items-center gap-2 text-sm font-semibold">
                <ChartLine size={18} className="text-knowledge-500" />
                回归测试表
              </h2>
              <div className="flex items-center gap-2">
                <Funnel size={14} className="text-slate-400" />
                <select
                  value={typeFilter}
                  onChange={(e) => setTypeFilter(e.target.value)}
                  className="input w-auto py-1 text-xs"
                >
                  <option value="all">全部类型</option>
                  {types.map((type: string) => (
                    <option key={type} value={type}>
                      {type}
                    </option>
                  ))}
                </select>
              </div>
            </div>

            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-slate-200 bg-slate-50 text-left text-xs uppercase text-slate-500 dark:border-slate-700 dark:bg-slate-800/50 dark:text-slate-400">
                    <th className="w-8 px-4 py-3"></th>
                    <th className="px-4 py-3 font-medium">ID</th>
                    <th className="px-4 py-3 font-medium">类型</th>
                    <th className="px-4 py-3 font-medium">实体</th>
                    <th className="px-4 py-3 font-medium">源文本</th>
                    <th className="px-4 py-3 font-medium">状态</th>
                    <th className="px-4 py-3 font-medium">得分</th>
                    <th className="px-4 py-3 font-medium">Git Commit</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredBenchmarks.length === 0 ? (
                    <tr>
                      <td colSpan={8} className="px-4 py-12 text-center text-slate-500">
                        暂无测试用例
                      </td>
                    </tr>
                  ) : (
                    filteredBenchmarks.map((bench: Benchmark) => (
                      <React.Fragment key={bench.id}>
                        <tr
                          className="border-b border-slate-100 transition-colors hover:bg-slate-50 dark:border-slate-700/50 dark:hover:bg-slate-700/30 cursor-pointer"
                          onClick={() => toggleRow(bench.id)}
                        >
                          <td className="px-4 py-3">
                            {expandedRows.has(bench.id) ? (
                              <CaretDown size={14} className="text-slate-400" />
                            ) : (
                              <CaretRight size={14} className="text-slate-400" />
                            )}
                          </td>
                          <td className="px-4 py-3 font-mono text-xs text-slate-500">
                            #{bench.id}
                          </td>
                          <td className="px-4 py-3">
                            <span className="badge badge-blue">{bench.type}</span>
                          </td>
                          <td className="px-4 py-3">
                            {bench.slug || <span className="text-slate-400">-</span>}
                          </td>
                          <td className="px-4 py-3 max-w-xs truncate">{bench.sourceText}</td>
                          <td className="px-4 py-3">
                            {bench.passed === undefined ? (
                              <span className="badge badge-yellow">未运行</span>
                            ) : bench.passed ? (
                              <span className="badge badge-green">
                                <CheckCircle size={12} className="mr-1" />
                                通过
                              </span>
                            ) : (
                              <span className="badge badge-red">
                                <XCircle size={12} className="mr-1" />
                                失败
                              </span>
                            )}
                          </td>
                          <td className="px-4 py-3 font-medium">
                            {bench.score !== undefined ? (
                              `${Math.round(bench.score * 100)}%`
                            ) : (
                              <span className="text-slate-400">-</span>
                            )}
                          </td>
                          <td className="px-4 py-3">
                            {bench.gitCommit ? (
                              <span className="flex items-center gap-1 font-mono text-xs text-slate-500">
                                <GitBranch size={12} />
                                {bench.gitCommit.slice(0, 7)}
                              </span>
                            ) : (
                              <span className="text-slate-400">-</span>
                            )}
                          </td>
                        </tr>
                        {expandedRows.has(bench.id) && (
                          <tr className="bg-slate-50 dark:bg-slate-800/30">
                            <td colSpan={8} className="px-4 py-4">
                              <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                                <div>
                                  <h4 className="mb-2 text-xs font-semibold uppercase text-slate-500">
                                    源文本
                                  </h4>
                                  <div className="rounded-lg bg-white p-3 text-sm dark:bg-slate-900">
                                    {bench.sourceText}
                                  </div>
                                </div>
                                <div>
                                  <h4 className="mb-2 text-xs font-semibold uppercase text-slate-500">
                                    期望输出
                                  </h4>
                                  <div className="rounded-lg bg-white p-3 text-sm dark:bg-slate-900">
                                    {bench.expectedOutput}
                                  </div>
                                </div>
                              </div>
                            </td>
                          </tr>
                        )}
                      </React.Fragment>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </section>

          {runMutation.data && (
            <div
              className={`card border p-4 text-sm ${
                runMutation.data.passed
                  ? 'border-green-300 bg-green-50 dark:border-green-700 dark:bg-green-900/20'
                  : 'border-red-300 bg-red-50 dark:border-red-700 dark:bg-red-900/20'
              }`}
            >
              <div className="flex items-center gap-2 font-semibold">
                {runMutation.data.passed ? (
                  <>
                    <CheckCircle size={18} className="text-green-500" /> 评估通过
                  </>
                ) : (
                  <>
                    <XCircle size={18} className="text-red-500" /> 评估失败
                  </>
                )}
              </div>
              <div className="mt-2 grid grid-cols-3 gap-4 text-sm">
                <div>
                  <span className="text-slate-500">正确率: </span>
                  <span className="font-medium">
                    {Math.round(runMutation.data.accuracy * 100)}%
                  </span>
                </div>
                <div>
                  <span className="text-slate-500">复现率: </span>
                  <span className="font-medium">
                    {Math.round(runMutation.data.reproductionRate * 100)}%
                  </span>
                </div>
                <div>
                  <span className="text-slate-500">新增错误: </span>
                  <span
                    className={`font-medium ${runMutation.data.newErrors > 0 ? 'text-red-600' : ''}`}
                  >
                    {runMutation.data.newErrors}
                  </span>
                </div>
              </div>
              {runMutation.data.errors.length > 0 && (
                <div className="mt-3">
                  <div className="mb-1 text-xs font-medium text-slate-500">错误详情:</div>
                  <ul className="list-disc pl-5 text-sm text-red-700 dark:text-red-300">
                    {runMutation.data.errors.map((err: string, i: number) => (
                      <li key={i}>{err}</li>
                    ))}
                  </ul>
                </div>
              )}
            </div>
          )}
        </>
      )}
    </div>
  );
}

function EmptyState() {
  return (
    <div className="card flex flex-col items-center justify-center py-16 text-center">
      <ChartLine size={48} className="mb-3 text-slate-300 dark:text-slate-600" />
      <p className="text-slate-600 dark:text-slate-300">评估报告加载失败</p>
      <p className="mt-1 text-xs text-slate-400">
        后端服务可能暂未实现，点击「运行评估」开始首次测试
      </p>
    </div>
  );
}

function MetricCard({
  icon,
  label,
  value,
  color,
  trend,
  warning
}: {
  icon: React.ReactNode;
  label: string;
  value: string;
  color: string;
  trend?: 'up' | 'down' | 'neutral';
  warning?: boolean;
}) {
  return (
    <div className={`card p-4 ${warning ? 'ring-2 ring-red-300' : ''}`}>
      <div className="flex items-center justify-between">
        <div className={`flex h-9 w-9 items-center justify-center rounded-lg ${color} text-white`}>
          {icon}
        </div>
        <span className="text-2xl font-bold">{value}</span>
      </div>
      <div className="mt-2 flex items-center justify-between">
        <span className="text-xs text-slate-500 dark:text-slate-400">{label}</span>
        {trend && (
          <span
            className={`text-xs ${
              trend === 'up'
                ? 'text-green-500'
                : trend === 'down'
                  ? 'text-red-500'
                  : 'text-slate-400'
            }`}
          >
            {trend === 'up' ? '↑ 良好' : trend === 'down' ? '↓ 偏低' : '→ 正常'}
          </span>
        )}
      </div>
    </div>
  );
}

function TrendChart({ data }: { data: TrendPoint[] }) {
  const width = 600;
  const height = 200;
  const padding = { top: 20, right: 20, bottom: 30, left: 40 };
  const chartW = width - padding.left - padding.right;
  const chartH = height - padding.top - padding.bottom;

  if (data.length === 0) {
    return (
      <div className="flex h-48 items-center justify-center text-sm text-slate-400">
        暂无趋势数据
      </div>
    );
  }

  const maxVal = 1;
  const minVal = 0;

  const points = data.map((d, i) => {
    const x = padding.left + (data.length === 1 ? chartW / 2 : (i / (data.length - 1)) * chartW);
    const y = padding.top + chartH - ((d.accuracy - minVal) / (maxVal - minVal)) * chartH;
    return { x, y, value: d.accuracy, date: d.date };
  });

  const pathD = points.map((p, i) => `${i === 0 ? 'M' : 'L'} ${p.x} ${p.y}`).join(' ');

  const areaD = `${pathD} L ${points[points.length - 1].x} ${padding.top + chartH} L ${points[0].x} ${padding.top + chartH} Z`;

  const yTicks = [0, 0.25, 0.5, 0.75, 1];

  return (
    <div className="w-full overflow-x-auto">
      <svg viewBox={`0 0 ${width} ${height}`} className="w-full" style={{ minWidth: 400 }}>
        <defs>
          <linearGradient id="areaGradient" x1="0%" y1="0%" x2="0%" y2="100%">
            <stop offset="0%" stopColor="#0ea5e9" stopOpacity="0.3" />
            <stop offset="100%" stopColor="#0ea5e9" stopOpacity="0.05" />
          </linearGradient>
        </defs>

        {yTicks.map((tick, i) => {
          const y = padding.top + chartH - (tick / (maxVal - minVal)) * chartH;
          return (
            <g key={i}>
              <line
                x1={padding.left}
                y1={y}
                x2={width - padding.right}
                y2={y}
                stroke="currentColor"
                strokeOpacity="0.1"
                strokeDasharray="4 4"
                className="text-slate-400"
              />
              <text
                x={padding.left - 8}
                y={y + 4}
                textAnchor="end"
                className="fill-slate-400 text-[10px]"
              >
                {Math.round(tick * 100)}%
              </text>
            </g>
          );
        })}

        <path d={areaD} fill="url(#areaGradient)" />

        <path
          d={pathD}
          fill="none"
          stroke="#0ea5e9"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
        />

        {points.map((p, i) => (
          <g key={i}>
            <circle cx={p.x} cy={p.y} r="4" fill="#0ea5e9" stroke="white" strokeWidth="2" />
            <title>{`${new Date(p.date).toLocaleDateString('zh-CN')}: ${Math.round(p.value * 100)}%`}</title>
          </g>
        ))}

        {data.length <= 10 &&
          points.map((p, i) => (
            <text
              key={i}
              x={p.x}
              y={height - 10}
              textAnchor="middle"
              className="fill-slate-400 text-[10px]"
            >
              {new Date(p.date).toLocaleDateString('zh-CN', { month: 'short', day: 'numeric' })}
            </text>
          ))}
      </svg>
    </div>
  );
}
