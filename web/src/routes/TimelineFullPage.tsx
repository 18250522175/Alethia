import { useEffect, useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useInfiniteQuery } from '@tanstack/react-query';
import { Link as RouterLink } from 'react-router-dom';
import {
  Clock,
  Funnel,
  Spinner,
  Warning,
  Empty,
  ArrowClockwise,
  FilePlus,
  Pencil,
  GitMerge,
  Archive,
  ChatsCircle,
  ArrowRight,
  MagnifyingGlass,
  X
} from '@phosphor-icons/react';
import api from '../lib/api';
import { formatRelativeTime, formatDateTime } from '../lib/format';

interface TimelineItem {
  id: number;
  slug: string;
  type: string;
  payload: any;
  ts: string;
  title?: string;
  description?: string;
}

const PAGE_SIZE = 20;

const RANGES = [
  { id: 'all', label: '全部时间' },
  { id: 'day', label: '近 24 小时' },
  { id: 'week', label: '近 7 天' },
  { id: 'month', label: '近 30 天' }
] as const;

const TYPE_META: Record<string, { badge: string; label: string; Icon: typeof FilePlus }> = {
  create: { badge: 'badge-green', label: '创建', Icon: FilePlus },
  update: { badge: 'badge-yellow', label: '更新', Icon: Pencil },
  merge: { badge: 'badge-blue', label: '合并', Icon: GitMerge },
  archive: { badge: 'badge-red', label: '归档', Icon: Archive },
  qa: { badge: 'badge-blue', label: '问答', Icon: ChatsCircle }
};

function isWithinRange(ts: string, range: string): boolean {
  if (range === 'all') return true;
  const time = new Date(ts).getTime();
  if (Number.isNaN(time)) return true;
  const diff = Date.now() - time;
  if (range === 'day') return diff < 86_400_000;
  if (range === 'week') return diff < 7 * 86_400_000;
  if (range === 'month') return diff < 30 * 86_400_000;
  return true;
}

export default function TimelineFullPage() {
  const { t } = useTranslation();
  const [slugInput, setSlugInput] = useState('');
  const [slug, setSlug] = useState('');
  const [range, setRange] = useState<string>('all');
  const sentinelRef = useRef<HTMLDivElement | null>(null);

  const timelineQuery = useInfiniteQuery({
    queryKey: ['timeline', slug, range],
    queryFn: ({ pageParam = 0 }) =>
      api.getTimeline({
        slug: slug || undefined,
        limit: PAGE_SIZE,
        offset: pageParam
      }),
    initialPageParam: 0,
    getNextPageParam: (last, allPages) => {
      const loaded = allPages.reduce((sum, p) => sum + (p.items?.length || 0), 0);
      return loaded < last.total ? loaded : undefined;
    },
    staleTime: 30_000
  });

  const items = useMemo<TimelineItem[]>(() => {
    const all = timelineQuery.data?.pages?.flatMap(p => p.items ?? []) ?? [];
    return all.filter(item => isWithinRange(item.ts, range));
  }, [timelineQuery.data, range]);

  const total = timelineQuery.data?.pages?.[0]?.total ?? 0;
  const hasMore = !!timelineQuery.hasNextPage && !timelineQuery.isFetching;
  const uniqueSlugs = useMemo(() => {
    const seen = new Set<string>();
    const out: string[] = [];
    for (const item of timelineQuery.data?.pages?.flatMap(p => p.items ?? []) ?? []) {
      if (item.slug && !seen.has(item.slug)) {
        seen.add(item.slug);
        out.push(item.slug);
      }
    }
    return out;
  }, [timelineQuery.data]);

  // Infinite scroll observer
  useEffect(() => {
    const node = sentinelRef.current;
    if (!node || !hasMore) return;
    const observer = new IntersectionObserver(
      entries => {
        if (entries[0].isIntersecting) {
          void timelineQuery.fetchNextPage();
        }
      },
      { rootMargin: '200px' }
    );
    observer.observe(node);
    return () => observer.disconnect();
  }, [hasMore, timelineQuery]);

  const handleApplySlug = () => setSlug(slugInput.trim());
  const handleClearSlug = () => {
    setSlugInput('');
    setSlug('');
  };

  const isLoading = timelineQuery.isLoading;
  const isError = timelineQuery.isError;

  return (
    <div className="space-y-6 animate-fade-in">
      <header className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="flex items-center gap-2 text-2xl font-bold">
            <Clock size={28} className="text-primary-500" />
            {t('nav.timeline')}
          </h1>
          <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
            按时间倒序浏览实体事件流 · 支持按实体和时间范围筛选
          </p>
        </div>
        <button
          onClick={() => timelineQuery.refetch()}
          disabled={timelineQuery.isFetching}
          className="btn btn-secondary"
        >
          <ArrowClockwise
            size={16}
            className={`mr-1.5 ${timelineQuery.isFetching ? 'animate-spin' : ''}`}
          />
          刷新
        </button>
      </header>

      <section className="card flex flex-wrap items-center gap-3 p-4">
        <div className="flex items-center gap-2">
          <Funnel size={16} className="text-slate-400" />
          <span className="text-xs font-semibold uppercase text-slate-500 dark:text-slate-400">
            筛选
          </span>
        </div>
        <div className="flex items-center gap-2 rounded-lg border border-slate-200 bg-white px-2 dark:border-slate-700 dark:bg-slate-800">
          <MagnifyingGlass size={16} className="text-slate-400" />
          <input
            type="text"
            list="timeline-slug-options"
            value={slugInput}
            onChange={e => setSlugInput(e.target.value)}
            onKeyDown={e => e.key === 'Enter' && handleApplySlug()}
            placeholder="按实体 slug 过滤..."
            className="w-48 border-0 bg-transparent px-1 py-1.5 text-sm focus:outline-none dark:text-slate-100"
          />
          <datalist id="timeline-slug-options">
            {uniqueSlugs.map(s => (
              <option key={s} value={s} />
            ))}
          </datalist>
          {slugInput && (
            <button
              onClick={handleClearSlug}
              className="rounded p-1 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200"
              aria-label="清除"
            >
              <X size={14} />
            </button>
          )}
        </div>
        <button onClick={handleApplySlug} className="btn btn-primary text-sm">
          应用
        </button>
        <div className="ml-auto flex items-center gap-2">
          <select
            value={range}
            onChange={e => setRange(e.target.value)}
            className="input w-auto text-sm"
          >
            {RANGES.map(r => (
              <option key={r.id} value={r.id}>
                {r.label}
              </option>
            ))}
          </select>
        </div>
      </section>

      {slug && (
        <div className="flex items-center gap-2 text-sm text-slate-500 dark:text-slate-400">
          <span>当前实体：</span>
          <RouterLink
            to={`/wiki/${slug}`}
            className="inline-flex items-center gap-1 font-mono text-primary-600 hover:underline dark:text-primary-400"
          >
            {slug}
            <ArrowRight size={12} />
          </RouterLink>
          <button
            onClick={handleClearSlug}
            className="rounded p-0.5 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200"
            aria-label="清除筛选"
          >
            <X size={14} />
          </button>
        </div>
      )}

      {isLoading ? (
        <div className="flex items-center justify-center py-16 text-slate-500 dark:text-slate-400">
          <Spinner size={24} className="mr-2 animate-spin" />
          {t('common.loading')}
        </div>
      ) : isError ? (
        <div className="card flex flex-col items-center justify-center py-16 text-center">
          <Warning size={40} className="mb-2 text-red-400" />
          <p className="text-slate-600 dark:text-slate-300">时间线加载失败</p>
          <p className="mt-1 text-xs text-slate-400">请检查后端 /api/timeline 路由是否已实现</p>
        </div>
      ) : items.length === 0 ? (
        <div className="card flex flex-col items-center justify-center py-16 text-center">
          <Empty size={48} className="mb-3 text-slate-300 dark:text-slate-600" />
          <p className="text-slate-500 dark:text-slate-400">暂无时间线事件</p>
          <p className="mt-1 text-xs text-slate-400">
            {slug
              ? '该实体当前没有可显示的事件，尝试更换 slug 或清除筛选。'
              : '当 AI 创建、更新、合并、归档条目或回答问题时，事件会按时间倒序出现在这里。'}
          </p>
        </div>
      ) : (
        <div className="space-y-3">
          <div className="text-xs text-slate-500 dark:text-slate-400">
            共 {total} 条事件 · 当前显示 {items.length} 条
          </div>
          <ol className="relative space-y-3 before:absolute before:left-3 before:top-2 before:bottom-2 before:w-px before:bg-slate-200 dark:before:bg-slate-700">
            {items.map(item => (
              <TimelineCard key={item.id} item={item} />
            ))}
          </ol>

          <div ref={sentinelRef} className="h-8" />

          {timelineQuery.isFetchingNextPage && (
            <div className="flex items-center justify-center py-4 text-sm text-slate-500 dark:text-slate-400">
              <Spinner size={16} className="mr-2 animate-spin" />
              加载更多...
            </div>
          )}
          {!hasMore && items.length > 0 && (
            <div className="py-2 text-center text-xs text-slate-400">
              已加载全部事件
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function TimelineCard({ item }: { item: TimelineItem }) {
  const meta = TYPE_META[item.type] ?? {
    badge: 'badge-blue',
    label: item.type || '事件',
    Icon: Clock
  };
  const Icon = meta.Icon;
  const qaTurns = extractQaTurns(item);
  const relatedSlugs = extractRelatedSlugs(item);

  return (
    <li className="relative pl-8">
      <span
        className={`absolute left-1.5 top-3 h-3 w-3 -translate-x-1/2 rounded-full ring-4 ring-white dark:ring-slate-900 ${
          item.type === 'create'
            ? 'bg-green-500'
            : item.type === 'update'
            ? 'bg-yellow-500'
            : item.type === 'merge'
            ? 'bg-blue-500'
            : item.type === 'archive'
            ? 'bg-red-500'
            : 'bg-primary-500'
        }`}
      />
      <article className="card p-4">
        <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
          <div className="flex flex-wrap items-center gap-2">
            <span className={`badge ${meta.badge} flex items-center gap-1`}>
              <Icon size={12} />
              {meta.label}
            </span>
            <RouterLink
              to={`/wiki/${item.slug}`}
              className="inline-flex items-center gap-1 font-mono text-xs text-primary-600 hover:underline dark:text-primary-400"
              title={item.slug}
            >
              {item.slug}
              <ArrowRight size={11} />
            </RouterLink>
          </div>
          <div className="text-xs text-slate-500 dark:text-slate-400" title={formatDateTime(item.ts)}>
            <span className="font-medium">{formatRelativeTime(item.ts)}</span>
            <span className="ml-2 text-slate-400">· {formatDateTime(item.ts)}</span>
          </div>
        </div>

        {item.title && (
          <h3 className="text-sm font-semibold text-slate-800 dark:text-slate-100">
            {item.title}
          </h3>
        )}

        {item.description && (
          <p className="mt-1 text-sm text-slate-600 dark:text-slate-300">
            {item.description}
          </p>
        )}

        {relatedSlugs.length > 0 && (
          <div className="mt-2 flex flex-wrap items-center gap-1.5">
            <span className="text-xs text-slate-500 dark:text-slate-400">关联：</span>
            {relatedSlugs.map(s => (
              <RouterLink
                key={s}
                to={`/wiki/${s}`}
                className="badge badge-blue text-[10px] hover:bg-blue-200 dark:hover:bg-blue-900/70"
              >
                {s}
              </RouterLink>
            ))}
          </div>
        )}

        {qaTurns.length > 0 && (
          <div className="mt-3 space-y-2 rounded-lg bg-slate-50 p-3 dark:bg-slate-700/50">
            <div className="flex items-center gap-1.5 text-xs font-semibold text-slate-500 dark:text-slate-400">
              <ChatsCircle size={12} />
              问答日志
            </div>
            {qaTurns.map((turn, i) => (
              <div key={i} className="text-xs">
                <div className="text-slate-700 dark:text-slate-200">
                  <span className="text-slate-400">问：</span>
                  {turn.question}
                </div>
                {turn.answer && (
                  <div className="mt-0.5 text-slate-600 dark:text-slate-300">
                    <span className="text-slate-400">答：</span>
                    {turn.answer}
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </article>
    </li>
  );
}

function extractRelatedSlugs(item: TimelineItem): string[] {
  const slugs = new Set<string>();
  const collect = (v: unknown) => {
    if (!v) return;
    if (typeof v === 'string') {
      if (v && v !== item.slug) slugs.add(v);
      return;
    }
    if (Array.isArray(v)) {
      v.forEach(collect);
      return;
    }
    if (typeof v === 'object') {
      for (const [k, val] of Object.entries(v as Record<string, unknown>)) {
        if (
          /slug|target|source|related|entity/i.test(k) &&
          typeof val === 'string' &&
          val &&
          val !== item.slug
        ) {
          slugs.add(val);
        } else if (typeof val === 'object') {
          collect(val);
        }
      }
    }
  };
  collect(item.payload);
  return Array.from(slugs).slice(0, 8);
}

function extractQaTurns(
  item: TimelineItem
): Array<{ question: string; answer?: string }> {
  if (item.type !== 'qa') return [];
  const p = item.payload || {};
  const turns: Array<{ question: string; answer?: string }> = [];

  if (typeof p.question === 'string') {
    turns.push({
      question: p.question,
      answer: typeof p.answer === 'string' ? p.answer : undefined
    });
  }
  if (Array.isArray(p.turns)) {
    for (const turn of p.turns) {
      if (turn && typeof turn === 'object') {
        const q = (turn as any).question || (turn as any).q;
        const a = (turn as any).answer || (turn as any).a;
        if (typeof q === 'string') {
          turns.push({ question: q, answer: typeof a === 'string' ? a : undefined });
        }
      }
    }
  }
  if (turns.length === 0 && typeof p.answer === 'string') {
    turns.push({ question: item.title || '问答事件', answer: p.answer });
  }
  return turns.slice(0, 3);
}
