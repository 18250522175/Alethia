import { useTranslation } from 'react-i18next';
import { useAuth } from '../store/AuthContext';
import { useNavigate } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { useState } from 'react';
import api from '../lib/api';
import {
  BookOpen,
  Graph,
  ChatsCircle,
  Gauge,
  Shuffle,
  Question,
  Clock,
  Lightbulb,
  MagnifyingGlass
} from '@phosphor-icons/react';

const PORTAL_COLORS = [
  'bg-blue-500',
  'bg-green-500',
  'bg-purple-500',
  'bg-orange-500',
  'bg-pink-500',
  'bg-teal-500'
];

export default function WikiHomePage() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const [searchQuery, setSearchQuery] = useState('');

  const getGreeting = () => {
    const hour = new Date().getHours();
    if (hour < 12) return t('home.greetingMorning');
    if (hour < 18) return t('home.greetingAfternoon');
    return t('home.greetingEvening');
  };

  const featuredQuery = useQuery({
    queryKey: ['featured-articles'],
    queryFn: () => api.queryKnowledge('featured', { topK: 4 }),
    staleTime: 60_000
  });

  const graphQuery = useQuery({
    queryKey: ['graph-portals'],
    queryFn: () => api.getGraphData(),
    staleTime: 300_000
  });

  const timelineQuery = useQuery({
    queryKey: ['home-timeline'],
    queryFn: () => api.getTimeline({ limit: 6 }),
    staleTime: 30_000
  });

  const featured = featuredQuery.data?.items || [];
  const graphNodes = graphQuery.data?.nodes || [];
  const timelineItems = timelineQuery.data?.items || [];

  const portals = (() => {
    const typeMap = new Map<string, number>();
    graphNodes.forEach((n: any) => {
      const type = n.type || 'other';
      typeMap.set(type, (typeMap.get(type) || 0) + 1);
    });
    const typeDescriptions: Record<string, string> = {
      concept: '核心概念与理论知识',
      process: '流程与方法论',
      person: '人物与组织',
      event: '事件与时间线',
      tool: '工具与技术栈',
      other: '其他条目'
    };
    return Array.from(typeMap.entries()).slice(0, 6).map(([type, count], i) => ({
      id: type,
      name: typeDescriptions[type] ? t(`home.portalType.${type}`) : type,
      description: typeDescriptions[type] || `${type} 类型条目`,
      count,
      color: PORTAL_COLORS[i % PORTAL_COLORS.length]
    }));
  })();

  const handleSearch = (e: React.FormEvent) => {
    e.preventDefault();
    if (searchQuery.trim()) {
      navigate(`/search?q=${encodeURIComponent(searchQuery.trim())}`);
    }
  };

  const handleArticleClick = (slug: string) => {
    navigate(`/wiki/${slug}`);
  };

  const handlePortalClick = (portalId: string) => {
    navigate(`/graph?type=${encodeURIComponent(portalId)}`);
  };

  const handleActivityClick = (slug?: string) => {
    if (slug) navigate(`/wiki/${slug}`);
  };

  const getActivityIcon = (type: string) => {
    const tLower = type?.toLowerCase() || '';
    if (tLower.includes('qa') || tLower.includes('question') || tLower.includes('问答')) return ChatsCircle;
    if (tLower.includes('page') || tLower.includes('edit') || tLower.includes('update') || tLower.includes('编辑')) return BookOpen;
    return Lightbulb;
  };

  const formatRelativeTime = (ts: string) => {
    const diff = Date.now() - new Date(ts).getTime();
    const mins = Math.floor(diff / 60000);
    if (mins < 1) return '刚刚';
    if (mins < 60) return `${mins} 分钟前`;
    const hours = Math.floor(mins / 60);
    if (hours < 24) return `${hours} 小时前`;
    const days = Math.floor(hours / 24);
    return `${days} 天前`;
  };

  const handleRandomWalk = () => {
    if (featured.length > 0) {
      const random = featured[Math.floor(Math.random() * featured.length)];
      navigate(`/wiki/${random.slug}`);
    } else if (graphNodes.length > 0) {
      const random = graphNodes[Math.floor(Math.random() * graphNodes.length)];
      if (random.slug) navigate(`/wiki/${random.slug}`);
    }
  };

  const handleAskAI = () => {
    navigate('/qa');
  };

  return (
    <div className="space-y-6 animate-fade-in">
      <section className="rounded-2xl bg-gradient-to-r from-primary-600 to-knowledge-600 p-8 text-white">
        <h1 className="text-2xl font-bold">
          {getGreeting()}！欢迎回到你的知识库
        </h1>
        <p className="mt-2 text-primary-100">
          {featured.length > 0
            ? `你的知识库有 ${featured.length} 个精选条目，知识图谱有 ${graphNodes.length} 个节点。`
            : '开始构建你的知识库吧。'}
        </p>
        <form onSubmit={handleSearch} className="mt-6 flex gap-3">
          <div className="relative flex-1 max-w-md">
            <MagnifyingGlass size={18} className="absolute left-3 top-1/2 -translate-y-1/2 text-white/60" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder={t('home.searchPlaceholder')}
              className="w-full rounded-lg border-0 bg-white/10 pl-10 pr-4 py-2.5 text-white placeholder-white/60 backdrop-blur focus:bg-white/20 focus:outline-none focus:ring-2 focus:ring-white/30"
            />
          </div>
          <button type="submit" className="btn bg-white text-primary-700 hover:bg-white/90">
            {t('home.searchWiki')}
          </button>
          <button
            type="button"
            onClick={handleAskAI}
            className="btn border border-white/30 text-white hover:bg-white/10"
          >
            <ChatsCircle size={18} className="mr-1.5" />
            {t('home.askAI')}
          </button>
        </form>
      </section>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
        <div className="lg:col-span-2 space-y-6">
          <section className="card p-6">
            <h2 className="mb-4 flex items-center gap-2 text-lg font-semibold">
              <BookOpen size={20} className="text-primary-500" />
              {t('home.featuredArticles')}
            </h2>
            {featuredQuery.isLoading ? (
              <div className="grid gap-4 sm:grid-cols-2">
                {[0, 1, 2, 3].map(i => (
                  <div key={i} className="h-24 animate-pulse rounded-xl bg-slate-200 dark:bg-slate-700"></div>
                ))}
              </div>
            ) : featured.length > 0 ? (
              <div className="grid gap-4 sm:grid-cols-2">
                {featured.map((item: any, i: number) => (
                  <div
                    key={item.slug || i}
                    onClick={() => handleArticleClick(item.slug)}
                    className="cursor-pointer rounded-xl border border-slate-200 p-4 transition-all hover:border-primary-300 hover:shadow-md dark:border-slate-700 dark:hover:border-primary-600"
                  >
                    <h3 className="font-medium">{item.title}</h3>
                    <p className="mt-1 line-clamp-2 text-sm text-slate-500 dark:text-slate-400">
                      {item.snippet || '点击查看详情'}
                    </p>
                    <div className="mt-3 flex items-center gap-2 text-xs text-slate-400">
                      <span className="badge badge-blue">概念</span>
                      <span>相关度 {(item.score * 100).toFixed(0)}%</span>
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <p className="text-center text-sm text-slate-500 dark:text-slate-400">
                暂无精选条目
              </p>
            )}
          </section>

          <section className="card p-6">
            <h2 className="mb-4 flex items-center gap-2 text-lg font-semibold">
              <Graph size={20} className="text-knowledge-500" />
              {t('home.knowledgePortals')}
            </h2>
            {graphQuery.isLoading ? (
              <div className="grid gap-4 sm:grid-cols-3">
                {[0, 1, 2].map(i => (
                  <div key={i} className="h-28 animate-pulse rounded-xl bg-slate-200 dark:bg-slate-700"></div>
                ))}
              </div>
            ) : portals.length > 0 ? (
              <div className="grid gap-4 sm:grid-cols-3">
                {portals.map((portal) => (
                  <div
                    key={portal.id}
                    onClick={() => handlePortalClick(portal.id)}
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
            ) : (
              <p className="text-center text-sm text-slate-500 dark:text-slate-400">
                暂无知识门户
              </p>
            )}
          </section>
        </div>

        <div className="space-y-6">
          <section className="card p-6">
            <h2 className="mb-4 flex items-center gap-2 text-lg font-semibold">
              <Clock size={20} className="text-parchment-500" />
              {t('home.recentActivity')}
            </h2>
            {timelineQuery.isLoading ? (
              <div className="space-y-3">
                {[0, 1, 2, 3].map(i => (
                  <div key={i} className="flex items-start gap-3">
                    <div className="h-8 w-8 flex-shrink-0 animate-pulse rounded-full bg-slate-200 dark:bg-slate-700"></div>
                    <div className="flex-1 space-y-2">
                      <div className="h-4 w-3/4 animate-pulse rounded bg-slate-200 dark:bg-slate-700"></div>
                      <div className="h-3 w-1/2 animate-pulse rounded bg-slate-200 dark:bg-slate-700"></div>
                    </div>
                  </div>
                ))}
              </div>
            ) : timelineItems.length > 0 ? (
              <div className="space-y-3">
                {timelineItems.slice(0, 6).map((activity: any, i: number) => {
                  const Icon = getActivityIcon(activity.type);
                  return (
                    <div
                      key={activity.id || i}
                      onClick={() => handleActivityClick(activity.slug)}
                      className={`flex items-start gap-3 rounded-lg p-2 ${activity.slug ? 'cursor-pointer hover:bg-slate-50 dark:hover:bg-slate-700/50' : ''}`}
                    >
                      <div className="mt-0.5 flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-full bg-slate-100 text-slate-500 dark:bg-slate-700 dark:text-slate-400">
                        <Icon size={16} />
                      </div>
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-sm font-medium">
                          {activity.title || activity.description || activity.type}
                        </p>
                        <p className="text-xs text-slate-500 dark:text-slate-400">
                          {activity.type} · {activity.ts ? formatRelativeTime(activity.ts) : ''}
                        </p>
                      </div>
                    </div>
                  );
                })}
              </div>
            ) : (
              <p className="text-center text-sm text-slate-500 dark:text-slate-400">
                暂无动态
              </p>
            )}
          </section>

          <section className="card p-6">
            <h2 className="mb-4 flex items-center gap-2 text-lg font-semibold">
              <Lightbulb size={20} className="text-yellow-500" />
              {t('home.quickActions')}
            </h2>
            <div className="space-y-2">
              <button onClick={handleRandomWalk} className="btn btn-secondary w-full justify-start">
                <Shuffle size={18} className="mr-2" />
                {t('home.randomWalk')}
              </button>
              <button onClick={() => navigate('/dashboard')} className="btn btn-secondary w-full justify-start">
                <Gauge size={18} className="mr-2" />
                {t('home.knowledgeGaps')}
              </button>
              <button onClick={() => navigate('/qa')} className="btn btn-secondary w-full justify-start">
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
