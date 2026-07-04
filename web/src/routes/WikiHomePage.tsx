import { useTranslation } from 'react-i18next';
import { useAuth } from '../store/AuthContext';
import {
  BookOpen,
  Graph,
  ChatsCircle,
  Gauge,
  Shuffle,
  Question,
  Clock,
  Lightbulb
} from '@phosphor-icons/react';

export default function WikiHomePage() {
  const { t } = useTranslation();

  const getGreeting = () => {
    const hour = new Date().getHours();
    if (hour < 12) return t('home.greetingMorning');
    if (hour < 18) return t('home.greetingAfternoon');
    return t('home.greetingEvening');
  };

  const portals = [
    { name: '科学门户', description: '物理学、数学、计算机科学', count: 128, color: 'bg-blue-500' },
    { name: '技术文档', description: '架构设计、API 参考、最佳实践', count: 86, color: 'bg-green-500' },
    { name: '产品中心', description: '产品规划、需求文档、迭代记录', count: 64, color: 'bg-purple-500' },
  ];

  const activities = [
    { type: '版本变更', title: '更新了「熵」条目', time: '10 分钟前', icon: BookOpen },
    { type: '🗣 问答', title: '用户询问了热力学第二定律', time: '30 分钟前', icon: ChatsCircle },
    { type: '年轮生成', title: '生成了 7 月语义年轮', time: '2 小时前', icon: Lightbulb },
    { type: '文件补提取', title: '「经济学讲义.pdf」已完成提取', time: '3 小时前', icon: BookOpen },
  ];

  return (
    <div className="space-y-6 animate-fade-in">
      <section className="rounded-2xl bg-gradient-to-r from-primary-600 to-knowledge-600 p-8 text-white">
        <h1 className="text-2xl font-bold">
          {getGreeting()}！欢迎回到你的知识库
        </h1>
        <p className="mt-2 text-primary-100">
          你的知识库今天新增了 3 条问答，2 个概念正在演化。
        </p>
        <div className="mt-6 flex gap-3">
          <div className="relative flex-1 max-w-md">
            <input
              type="text"
              placeholder={t('home.searchPlaceholder')}
              className="w-full rounded-lg border-0 bg-white/10 px-4 py-2.5 text-white placeholder-white/60 backdrop-blur focus:bg-white/20 focus:outline-none focus:ring-2 focus:ring-white/30"
            />
          </div>
          <button className="btn bg-white text-primary-700 hover:bg-white/90">
            {t('home.searchWiki')}
          </button>
          <button className="btn border border-white/30 text-white hover:bg-white/10">
            <ChatsCircle size={18} className="mr-1.5" />
            {t('home.askAI')}
          </button>
        </div>
      </section>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
        <div className="lg:col-span-2 space-y-6">
          <section className="card p-6">
            <h2 className="mb-4 flex items-center gap-2 text-lg font-semibold">
              <BookOpen size={20} className="text-primary-500" />
              {t('home.featuredArticles')}
            </h2>
            <div className="grid gap-4 sm:grid-cols-2">
              {['熵', '热力学', '信息论', 'Agent 系统'].map((title, i) => (
                <div
                  key={i}
                  className="cursor-pointer rounded-xl border border-slate-200 p-4 transition-all hover:border-primary-300 hover:shadow-md dark:border-slate-700 dark:hover:border-primary-600"
                >
                  <h3 className="font-medium">{title}</h3>
                  <p className="mt-1 line-clamp-2 text-sm text-slate-500 dark:text-slate-400">
                    关于{title}的详细介绍和核心概念说明...
                  </p>
                  <div className="mt-3 flex items-center gap-2 text-xs text-slate-400">
                    <span className="badge badge-blue">概念</span>
                    <span>更新于 2 天前</span>
                  </div>
                </div>
              ))}
            </div>
          </section>

          <section className="card p-6">
            <h2 className="mb-4 flex items-center gap-2 text-lg font-semibold">
              <Graph size={20} className="text-knowledge-500" />
              {t('home.knowledgePortals')}
            </h2>
            <div className="grid gap-4 sm:grid-cols-3">
              {portals.map((portal, i) => (
                <div
                  key={i}
                  className="cursor-pointer rounded-xl border border-slate-200 p-4 transition-all hover:shadow-md dark:border-slate-700"
                >
                  <div className={`${portal.color} mb-3 h-10 w-10 rounded-lg`}></div>
                  <h3 className="font-medium">{portal.name}</h3>
                  <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
                    {portal.description}
                  </p>
                  <p className="mt-2 text-sm font-medium text-primary-600 dark:text-primary-400">
                    {portal.count} 个条目
                  </p>
                </div>
              ))}
            </div>
          </section>
        </div>

        <div className="space-y-6">
          <section className="card p-6">
            <h2 className="mb-4 flex items-center gap-2 text-lg font-semibold">
              <Clock size={20} className="text-parchment-500" />
              {t('home.recentActivity')}
            </h2>
            <div className="space-y-3">
              {activities.map((activity, i) => {
                const Icon = activity.icon;
                return (
                  <div
                    key={i}
                    className="flex items-start gap-3 rounded-lg p-2 hover:bg-slate-50 dark:hover:bg-slate-700/50"
                  >
                    <div className="mt-0.5 flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-full bg-slate-100 text-slate-500 dark:bg-slate-700 dark:text-slate-400">
                      <Icon size={16} />
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-medium">{activity.title}</p>
                      <p className="text-xs text-slate-500 dark:text-slate-400">
                        {activity.type} · {activity.time}
                      </p>
                    </div>
                  </div>
                );
              })}
            </div>
          </section>

          <section className="card p-6">
            <h2 className="mb-4 flex items-center gap-2 text-lg font-semibold">
              <Lightbulb size={20} className="text-yellow-500" />
              {t('home.quickActions')}
            </h2>
            <div className="space-y-2">
              <button className="btn btn-secondary w-full justify-start">
                <Shuffle size={18} className="mr-2" />
                {t('home.randomWalk')}
              </button>
              <button className="btn btn-secondary w-full justify-start">
                <Question size={18} className="mr-2" />
                {t('home.knowledgeGaps')}
              </button>
              <button className="btn btn-secondary w-full justify-start">
                <ChatsCircle size={18} className="mr-2" />
                {t('home.todayQA')}
              </button>
            </div>
          </section>
        </div>
      </div>
    </div>
  );
}
