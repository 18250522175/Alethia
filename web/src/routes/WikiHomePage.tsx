import { useTranslation } from 'react-i18next';
import { useAuth } from '../store/AuthContext';
import { useNavigate } from 'react-router-dom';
import { useQuery, useMutation } from '@tanstack/react-query';
import { useState } from 'react';
import api from '../lib/api';
import { formatRelativeTime } from '../lib/format';
import {
  BookOpen,
  Graph,
  ChatsCircle,
  Gauge,
  Shuffle,
  Clock,
  Lightbulb,
  MagnifyingGlass,
  Plus,
  PencilLine,
  Spinner,
  X
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
  const [showDraftWizard, setShowDraftWizard] = useState(false);
  const [draftTitle, setDraftTitle] = useState('');
  const [draftType, setDraftType] = useState('concept');
  const [draftContext, setDraftContext] = useState('');
  const [generatedDraft, setGeneratedDraft] = useState<string | null>(null);

  const getGreeting = () => {
    const hour = new Date().getHours();
    if (hour < 12) return t('home.greetingMorning');
    if (hour < 18) return t('home.greetingAfternoon');
    return t('home.greetingEvening');
  };

  const featuredQuery = useQuery({
    queryKey: ['featured-articles'],
    queryFn: () => api.queryKnowledge('', { topK: 4 }),
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
      concept: t('home.portalType.concept', '核心概念与理论知识'),
      process: t('home.portalType.process', '流程与方法论'),
      person: t('home.portalType.person', '人物与组织'),
      event: t('home.portalType.event', '事件与时间线'),
      tool: t('home.portalType.tool', '工具与技术栈'),
      other: t('home.portalType.other', '其他条目')
    };
    return Array.from(typeMap.entries()).slice(0, 6).map(([type, count], i) => ({
      id: type,
      name: typeDescriptions[type] || type,
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

  const draftMutation = useMutation({
    mutationFn: () => {
      const contexts = draftContext.trim() ? [draftContext.trim()] : [];
      return api.generateDraft(draftTitle.trim(), draftType, contexts);
    },
    onSuccess: (data) => {
      setGeneratedDraft(data.content);
    }
  });

  const handleOpenDraftWizard = () => {
    setDraftTitle('');
    setDraftType('concept');
    setDraftContext('');
    setGeneratedDraft(null);
    draftMutation.reset();
    setShowDraftWizard(true);
  };

  const handleCreateFromDraft = () => {
    const slug = draftTitle.trim()
      .toLowerCase()
      .replace(/[^\w\u4e00-\u9fa5]+/g, '-')
      .replace(/^-|-$/g, '');
    // 将草稿内容通过 sessionStorage 传递给创建页面
    if (generatedDraft) {
      sessionStorage.setItem('new_page_draft', generatedDraft);
      sessionStorage.setItem('new_page_title', draftTitle.trim());
    }
    navigate(`/wiki/${encodeURIComponent(slug)}?new=true`);
  };

  return (
    <div className="space-y-6 animate-fade-in">
      <section className="rounded-2xl bg-gradient-to-r from-primary-600 to-knowledge-600 p-8 text-white">
        <h1 className="text-2xl font-bold">
          {getGreeting()}！{t('home.welcomeBack')}
        </h1>
        <p className="mt-2 text-primary-100">
          {featured.length > 0
            ? t('home.librarySummary', { featured: featured.length, nodes: graphNodes.length })
            : t('home.startBuilding')}
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
          <button
            type="button"
            onClick={handleOpenDraftWizard}
            className="btn border border-white/30 text-white hover:bg-white/10"
          >
            <Plus size={18} className="mr-1.5" />
            {t('home.newPage', '新建条目')}
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
                      <span className="badge badge-blue">{item.type || '概念'}</span>
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

      {showDraftWizard && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm">
          <div className="w-full max-w-2xl rounded-2xl bg-white p-6 shadow-xl dark:bg-slate-800">
            <div className="mb-5 flex items-center justify-between">
              <h2 className="flex items-center gap-2 text-lg font-semibold">
                <PencilLine size={20} className="text-primary-500" />
                {t('home.newPageWizard', '新建条目向导')}
              </h2>
              <button
                onClick={() => setShowDraftWizard(false)}
                className="rounded-lg p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-600 dark:hover:bg-slate-700"
              >
                <X size={20} />
              </button>
            </div>

            {!generatedDraft && (
              <div className="space-y-4">
                <div>
                  <label className="mb-1.5 block text-sm font-medium">{t('home.draftTitle', '标题')}</label>
                  <input
                    type="text"
                    value={draftTitle}
                    onChange={e => setDraftTitle(e.target.value)}
                    placeholder={t('home.draftTitlePlaceholder', '例如：信息熵')}
                    className="input w-full"
                    autoFocus
                  />
                </div>
                <div>
                  <label className="mb-1.5 block text-sm font-medium">{t('home.draftType', '类型')}</label>
                  <select
                    value={draftType}
                    onChange={e => setDraftType(e.target.value)}
                    className="input w-full"
                  >
                    <option value="concept">{t('home.draftTypeConcept', '概念')}</option>
                    <option value="process">{t('home.draftTypeProcess', '流程')}</option>
                    <option value="person">{t('home.draftTypePerson', '人物')}</option>
                    <option value="event">{t('home.draftTypeEvent', '事件')}</option>
                    <option value="tool">{t('home.draftTypeTool', '工具')}</option>
                    <option value="other">{t('home.draftTypeOther', '其他')}</option>
                  </select>
                </div>
                <div>
                  <label className="mb-1.5 block text-sm font-medium">{t('home.draftContext', '上下文（可选）')}</label>
                  <textarea
                    value={draftContext}
                    onChange={e => setDraftContext(e.target.value)}
                    placeholder={t('home.draftContextPlaceholder', '提供一些背景信息帮助 AI 生成更准确的草稿...')}
                    className="input w-full min-h-[80px] resize-y"
                    rows={3}
                  />
                </div>
                <div className="flex justify-end gap-3 pt-2">
                  <button
                    onClick={() => setShowDraftWizard(false)}
                    className="btn btn-secondary"
                  >
                    {t('common.cancel')}
                  </button>
                  <button
                    onClick={() => draftMutation.mutate()}
                    disabled={!draftTitle.trim() || draftMutation.isPending}
                    className="btn btn-primary flex items-center gap-2"
                  >
                    {draftMutation.isPending ? (
                      <>
                        <Spinner size={16} className="animate-spin" />
                        {t('home.generating', '生成中...')}
                      </>
                    ) : (
                      <>
                        <PencilLine size={16} />
                        {t('home.generateDraft', '生成草稿')}
                      </>
                    )}
                  </button>
                </div>
                {draftMutation.isError && (
                  <div className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700 dark:border-red-800 dark:bg-red-900/20 dark:text-red-400">
                    {t('home.draftError', '草稿生成失败，请重试')}
                  </div>
                )}
              </div>
            )}

            {generatedDraft && (
              <div className="space-y-4">
                <div className="rounded-lg border border-green-200 bg-green-50 p-3 text-sm text-green-700 dark:border-green-800 dark:bg-green-900/20 dark:text-green-400">
                  {t('home.draftGenerated', '草稿已生成，您可以预览后创建条目或重新生成。')}
                </div>
                <div className="max-h-96 overflow-y-auto rounded-lg border border-slate-200 bg-slate-50 p-4 dark:border-slate-700 dark:bg-slate-900">
                  <pre className="whitespace-pre-wrap font-sans text-sm text-slate-700 dark:text-slate-300">
                    {generatedDraft}
                  </pre>
                </div>
                <div className="flex justify-end gap-3 pt-2">
                  <button
                    onClick={() => {
                      setGeneratedDraft(null);
                      draftMutation.reset();
                    }}
                    className="btn btn-secondary"
                  >
                    {t('home.regenerate', '重新生成')}
                  </button>
                  <button
                    onClick={handleCreateFromDraft}
                    className="btn btn-primary flex items-center gap-2"
                  >
                    <BookOpen size={16} />
                    {t('home.createPage', '创建条目')}
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
