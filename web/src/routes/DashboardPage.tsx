import { useTranslation } from 'react-i18next';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  Gauge,
  Database,
  Link as LinkIcon,
  Ghost,
  Archive,
  Coins,
  ArrowsClockwise,
  Wallet,
  Brain,
  Warning,
  Files,
  TrendUp,
  ChartLine,
  ChartPie
} from '@phosphor-icons/react';
import {
  Chart as ChartJS,
  CategoryScale,
  LinearScale,
  PointElement,
  LineElement,
  ArcElement,
  Title,
  Tooltip,
  Legend,
  Filler
} from 'chart.js';
import { Line, Pie } from 'react-chartjs-2';
import api from '../lib/api';

ChartJS.register(
  CategoryScale,
  LinearScale,
  PointElement,
  LineElement,
  ArcElement,
  Title,
  Tooltip,
  Legend,
  Filler
);

export default function DashboardPage() {
  const { t } = useTranslation();
  const queryClient = useQueryClient();

  const healthQuery = useQuery({
    queryKey: ['health-dashboard'],
    queryFn: () => api.getHealthDashboard(),
    refetchInterval: 30_000,
    staleTime: 15_000
  });

  const rebuildMutation = useMutation({
    mutationFn: () => api.rebuildStruct(),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['health-dashboard'] });
    }
  });

  const data = healthQuery.data;
  const isLoading = healthQuery.isLoading;
  const isError = healthQuery.isError;

  const trendData = {
    labels: ['周一', '周二', '周三', '周四', '周五', '周六', '周日'],
    datasets: [
      {
        label: '新增页面',
        data: [12, 19, 8, 15, 22, 10, 5],
        borderColor: '#6366f1',
        backgroundColor: 'rgba(99, 102, 241, 0.1)',
        fill: true,
        tension: 0.4
      },
      {
        label: '新增关系',
        data: [25, 35, 20, 40, 55, 30, 15],
        borderColor: '#06b6d4',
        backgroundColor: 'rgba(6, 182, 212, 0.1)',
        fill: true,
        tension: 0.4
      }
    ]
  };

  const costPieData = {
    labels: ['问答', '提取', '审核', '其他'],
    datasets: [
      {
        data: [45, 30, 15, 10],
        backgroundColor: [
          'rgba(99, 102, 241, 0.8)',
          'rgba(6, 182, 212, 0.8)',
          'rgba(249, 115, 22, 0.8)',
          'rgba(148, 163, 184, 0.8)'
        ],
        borderColor: [
          'rgb(99, 102, 241)',
          'rgb(6, 182, 212)',
          'rgb(249, 115, 22)',
          'rgb(148, 163, 184)'
        ],
        borderWidth: 2
      }
    ]
  };

  const chartOptions = {
    responsive: true,
    maintainAspectRatio: false,
    plugins: {
      legend: {
        position: 'bottom' as const,
        labels: {
          boxWidth: 12,
          padding: 15,
          font: { size: 11 }
        }
      }
    },
    scales: {
      y: {
        beginAtZero: true,
        grid: {
          color: 'rgba(148, 163, 184, 0.1)'
        }
      },
      x: {
        grid: {
          display: false
        }
      }
    }
  };

  const pieOptions = {
    responsive: true,
    maintainAspectRatio: false,
    plugins: {
      legend: {
        position: 'bottom' as const,
        labels: {
          boxWidth: 12,
          padding: 15,
          font: { size: 11 }
        }
      }
    }
  };

  return (
    <div className="space-y-6 animate-fade-in">
      <header className="flex items-center justify-between">
        <div>
          <h1 className="flex items-center gap-2 text-2xl font-bold">
            <Gauge size={28} className="text-primary-500" />
            {t('health.title')}
          </h1>
          <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
            知识库整体规模、审核待办、AI 质量、预算与归档状态一览
          </p>
        </div>
        <button
          onClick={() => rebuildMutation.mutate()}
          disabled={rebuildMutation.isPending}
          className="btn btn-primary"
        >
          <ArrowsClockwise size={16} className={`mr-1.5 ${rebuildMutation.isPending ? 'animate-spin' : ''}`} />
          {rebuildMutation.isPending ? '重建中...' : '重建结构'}
        </button>
      </header>

      {isLoading ? (
        <div className="card py-16 text-center text-slate-500">{t('common.loading')}</div>
      ) : isError || !data ? (
        <div className="card flex flex-col items-center justify-center py-16 text-center">
          <Warning size={40} className="mb-2 text-red-400" />
          <p className="text-slate-600 dark:text-slate-300">仪表盘数据加载失败</p>
          <p className="mt-1 text-xs text-slate-400">请检查数据库连接是否正常</p>
        </div>
      ) : (
        <>
          <section>
            <h2 className="mb-3 text-sm font-semibold uppercase text-slate-500 dark:text-slate-400">
              {t('health.scale')}
            </h2>
            <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
              <StatCard
                icon={<Database size={20} />}
                label="页面数"
                value={data.scale.pages}
                color="bg-blue-500"
              />
              <StatCard
                icon={<TrendUp size={20} />}
                label="节点数"
                value={data.scale.nodes}
                color="bg-indigo-500"
              />
              <StatCard
                icon={<LinkIcon size={20} />}
                label="边数"
                value={data.scale.edges}
                color="bg-purple-500"
              />
              <StatCard
                icon={<Archive size={20} />}
                label={t('health.activeVersions')}
                value={data.archiveStatus.activeVersions}
                color="bg-green-500"
              />
            </div>
          </section>

          {/* Charts Section */}
          <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
            <div className="card p-5 lg:col-span-2">
              <div className="mb-4 flex items-center gap-2">
                <ChartLine size={18} className="text-primary-500" />
                <h3 className="text-sm font-semibold text-slate-700 dark:text-slate-200">
                  增长趋势
                </h3>
              </div>
              <div className="h-64">
                <Line data={trendData} options={chartOptions} />
              </div>
            </div>

            <div className="card p-5">
              <div className="mb-4 flex items-center gap-2">
                <ChartPie size={18} className="text-emerald-500" />
                <h3 className="text-sm font-semibold text-slate-700 dark:text-slate-200">
                  成本分布
                </h3>
              </div>
              <div className="h-64">
                <Pie data={costPieData} options={pieOptions} />
              </div>
            </div>
          </div>

          <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
            <section className="card p-5">
              <h2 className="mb-3 flex items-center gap-2 text-sm font-semibold">
                <Gauge size={18} className="text-yellow-500" />
                {t('health.reviewBacklog')}
              </h2>
              <div className="space-y-3">
                <BacklogRow label="🟢 低风险" count={data.reviewBacklog.green} color="text-green-600" />
                <BacklogRow label="🟡 待确认" count={data.reviewBacklog.yellow} color="text-yellow-600" />
                <BacklogRow label="🔴 高风险" count={data.reviewBacklog.red} color="text-red-600" />
              </div>
              <div className="mt-4 border-t border-slate-200 pt-3 text-xs text-slate-500 dark:border-slate-700 dark:text-slate-400">
                总计：{data.reviewBacklog.green + data.reviewBacklog.yellow + data.reviewBacklog.red} 条待审核
              </div>
            </section>

            <section className="card p-5">
              <h2 className="mb-3 flex items-center gap-2 text-sm font-semibold">
                <Wallet size={18} className="text-emerald-500" />
                {t('health.budget')}
              </h2>
              <div className="space-y-3">
                <BudgetRow
                  label={t('health.daily')}
                  spent={data.budget.daily.spent}
                  limit={data.budget.daily.limit}
                  exceeded={data.budget.daily.exceeded}
                />
                <BudgetRow
                  label={t('health.monthly')}
                  spent={data.budget.monthly.spent}
                  limit={data.budget.monthly.limit}
                  exceeded={data.budget.monthly.exceeded}
                />
              </div>
              <div className="mt-3 border-t border-slate-200 pt-3 text-xs text-slate-500 dark:border-slate-700 dark:text-slate-400">
                单次问答上限：${data.budget.perQueryLimit.toFixed(2)}
              </div>
            </section>

            <section className="card p-5">
              <h2 className="mb-3 flex items-center gap-2 text-sm font-semibold">
                <Brain size={18} className="text-primary-500" />
                AI 质量
              </h2>
              <div className="space-y-3">
                <div>
                  <div className="mb-1 flex justify-between text-xs">
                    <span className="text-slate-500 dark:text-slate-400">正确率</span>
                    <span className="font-medium">
                      {Math.round(data.aiQuality.correctness * 100)}%
                    </span>
                  </div>
                  <div className="h-2 overflow-hidden rounded-full bg-slate-100 dark:bg-slate-700">
                    <div
                      className="h-full rounded-full bg-primary-500 transition-all"
                      style={{ width: `${data.aiQuality.correctness * 100}%` }}
                    />
                  </div>
                </div>
                <div>
                  <div className="mb-1 flex justify-between text-xs">
                    <span className="text-slate-500 dark:text-slate-400">缓存命中率</span>
                    <span className="font-medium">{Math.round(data.cacheHitRate * 100)}%</span>
                  </div>
                  <div className="h-2 overflow-hidden rounded-full bg-slate-100 dark:bg-slate-700">
                    <div
                      className="h-full rounded-full bg-emerald-500 transition-all"
                      style={{ width: `${data.cacheHitRate * 100}%` }}
                    />
                  </div>
                </div>
              </div>
            </section>
          </div>

          <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
            <StatCard
              icon={<Ghost size={20} />}
              label={t('health.ghostRelations')}
              value={data.ghostRelations}
              color={data.ghostRelations > 0 ? 'bg-red-500' : 'bg-slate-400'}
              warning={data.ghostRelations > 0}
            />
            <StatCard
              icon={<Archive size={20} />}
              label={t('health.archivedVersions')}
              value={data.archiveStatus.archivedVersions}
              color="bg-slate-500"
            />
            <StatCard
              icon={<Files size={20} />}
              label="观察文件数"
              value={data.observedFiles}
              color="bg-cyan-500"
            />
            <StatCard
              icon={<Warning size={20} />}
              label="断裂证据链"
              value={data.brokenEvidenceChains}
              color={data.brokenEvidenceChains > 0 ? 'bg-red-500' : 'bg-green-500'}
              warning={data.brokenEvidenceChains > 0}
            />
          </div>

          <div className="card p-4 text-xs text-slate-500 dark:text-slate-400">
            <Coins size={14} className="mr-1 inline" />
            {t('health.lastUpdated')}：{new Date(data.lastUpdated).toLocaleString('zh-CN')}
          </div>

          {rebuildMutation.data && (
            <div className="card border-green-300 bg-green-50 p-4 text-sm dark:border-green-700 dark:bg-green-900/20">
              <strong>重建完成：</strong>
              处理页面 {rebuildMutation.data.pages} 条 · 链接 {rebuildMutation.data.links} 条 ·
              幽灵关系 {rebuildMutation.data.ghostCount} 条 · 耗时 {rebuildMutation.data.durationMs}ms
            </div>
          )}
        </>
      )}
    </div>
  );
}

function StatCard({
  icon,
  label,
  value,
  color,
  warning
}: {
  icon: React.ReactNode;
  label: string;
  value: number;
  color: string;
  warning?: boolean;
}) {
  return (
    <div className={`card p-4 ${warning ? 'ring-2 ring-red-300' : ''}`}>
      <div className="flex items-center justify-between">
        <div className={`flex h-9 w-9 items-center justify-center rounded-lg ${color} text-white`}>
          {icon}
        </div>
        <span className="text-2xl font-bold">{value.toLocaleString()}</span>
      </div>
      <div className="mt-2 text-xs text-slate-500 dark:text-slate-400">{label}</div>
    </div>
  );
}

function BacklogRow({ label, count, color }: { label: string; count: number; color: string }) {
  return (
    <div className="flex items-center justify-between">
      <span className={`text-sm ${color}`}>{label}</span>
      <span className="text-lg font-semibold">{count}</span>
    </div>
  );
}

function BudgetRow({
  label,
  spent,
  limit,
  exceeded
}: {
  label: string;
  spent: number;
  limit: number;
  exceeded: boolean;
}) {
  const ratio = limit > 0 ? Math.min(spent / limit, 1) : 0;
  const barColor = exceeded ? 'bg-red-500' : ratio > 0.8 ? 'bg-yellow-500' : 'bg-emerald-500';

  return (
    <div>
      <div className="mb-1 flex items-center justify-between text-xs">
        <span className="text-slate-500 dark:text-slate-400">{label}</span>
        <span className={exceeded ? 'font-semibold text-red-500' : 'font-medium'}>
          ${spent.toFixed(2)} / ${limit.toFixed(2)}
        </span>
      </div>
      <div className="h-2 overflow-hidden rounded-full bg-slate-100 dark:bg-slate-700">
        <div className={`h-full rounded-full ${barColor} transition-all`} style={{ width: `${ratio * 100}%` }} />
      </div>
    </div>
  );
}
