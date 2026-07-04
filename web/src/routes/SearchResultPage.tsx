import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useSearchParams, Link as RouterLink } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import {
  MagnifyingGlass,
  Spinner,
  Warning,
  Empty,
  Files,
  FileText,
  ChatsCircle,
  CaretDown,
  CaretUp,
  ArrowRight,
  Clock,
  Hash,
  ArrowLeft
} from '@phosphor-icons/react';
import api from '../lib/api';

const PREVIEW_COUNT = 10;

interface PageResult {
  slug: string;
  title: string;
  snippet: string;
  type: string;
}
interface FileResult {
  hash: string;
  originalName: string;
  mime: string;
  size: number;
  status: string;
}
interface ConversationResult {
  id: string;
  question: string;
  answer: string;
  ts: string;
}

type TabId = 'pages' | 'files' | 'conversations';

const TABS: { id: TabId; label: string; Icon: typeof FileText }[] = [
  { id: 'pages', label: '条目', Icon: FileText },
  { id: 'files', label: '文件', Icon: Files },
  { id: 'conversations', label: '问答记录', Icon: ChatsCircle }
];

function formatRelativeTime(ts: string): string {
  const time = new Date(ts).getTime();
  if (Number.isNaN(time)) return ts;
  const diff = Date.now() - time;
  if (diff < 60_000) return '刚刚';
  if (diff < 3_600_000) return `${Math.floor(diff / 60_000)} 分钟前`;
  if (diff < 86_400_000) return `${Math.floor(diff / 3_600_000)} 小时前`;
  return `${Math.floor(diff / 86_400_000)} 天前`;
}

function formatFileSize(bytes: number): string {
  if (!bytes || bytes < 0) return '0 B';
  const units = ['B', 'KB', 'MB', 'GB', 'TB'];
  let v = bytes;
  let i = 0;
  while (v >= 1024 && i < units.length - 1) {
    v /= 1024;
    i++;
  }
  return `${v.toFixed(v >= 100 ? 0 : 1)} ${units[i]}`;
}

function truncate(text: string, max: number): string {
  if (!text) return '';
  return text.length > max ? `${text.slice(0, max)}…` : text;
}

export default function SearchResultPage() {
  const { t } = useTranslation();
  const [searchParams, setSearchParams] = useSearchParams();
  const query = (searchParams.get('q') || '').trim();
  const [activeTab, setActiveTab] = useState<TabId>('pages');
  const [expandedGroups, setExpandedGroups] = useState<Set<TabId>>(new Set());

  const [inputValue, setInputValue] = useState(query);
  // Keep input in sync when navigating back/forward
  useEffect(() => {
    setInputValue(query);
  }, [query]);

  const searchQuery = useQuery({
    queryKey: ['search', query],
    queryFn: () => api.search(query),
    enabled: query.length > 0,
    staleTime: 30_000
  });

  const pages = searchQuery.data?.pages ?? [];
  const files = searchQuery.data?.files ?? [];
  const conversations = searchQuery.data?.conversations ?? [];
  const total = searchQuery.data?.total ?? pages.length + files.length + conversations.length;

  const counts: Record<TabId, number> = {
    pages: pages.length,
    files: files.length,
    conversations: conversations.length
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const trimmed = inputValue.trim();
    if (trimmed) {
      setSearchParams({ q: trimmed }, { replace: true });
    }
  };

  const toggleGroup = (id: TabId) => {
    setExpandedGroups(prev => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
  };

  const isLoading = searchQuery.isLoading;
  const isError = searchQuery.isError;
  const hasQuery = query.length > 0;
  const hasAnyResult = pages.length > 0 || files.length > 0 || conversations.length > 0;

  return (
    <div className="space-y-6 animate-fade-in">
      <header className="space-y-3">
        <h1 className="flex items-center gap-2 text-2xl font-bold">
          <MagnifyingGlass size={28} className="text-primary-500" />
          全局搜索
        </h1>
        <form onSubmit={handleSubmit} className="flex items-center gap-2">
          <div className="relative flex-1 max-w-2xl">
            <MagnifyingGlass
              size={18}
              className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400"
            />
            <input
              type="text"
              value={inputValue}
              onChange={e => setInputValue(e.target.value)}
              placeholder="搜索条目、文件、问答记录..."
              className="input pl-10"
              autoFocus
            />
          </div>
          <button type="submit" className="btn btn-primary" disabled={!inputValue.trim()}>
            搜索
          </button>
        </form>
        {hasQuery && !isLoading && !isError && (
          <p className="text-sm text-slate-500 dark:text-slate-400">
            关键词「<span className="font-medium text-slate-700 dark:text-slate-200">{query}</span>」
            共找到 <span className="font-medium text-primary-600 dark:text-primary-400">{total}</span> 条结果
            {pages.length > 0 && ` · 条目 ${pages.length}`}
            {files.length > 0 && ` · 文件 ${files.length}`}
            {conversations.length > 0 && ` · 问答 ${conversations.length}`}
          </p>
        )}
      </header>

      {!hasQuery ? (
        <div className="card flex flex-col items-center justify-center py-20 text-center">
          <MagnifyingGlass size={48} className="mb-3 text-slate-300 dark:text-slate-600" />
          <p className="text-slate-600 dark:text-slate-300">请在上方输入要搜索的内容</p>
          <p className="mt-1 text-xs text-slate-400">
            支持搜索百科条目、媒体文件与历史问答记录
          </p>
        </div>
      ) : isLoading ? (
        <div className="flex items-center justify-center py-16 text-slate-500 dark:text-slate-400">
          <Spinner size={24} className="mr-2 animate-spin" />
          {t('common.loading')}
        </div>
      ) : isError ? (
        <div className="card flex flex-col items-center justify-center py-16 text-center">
          <Warning size={40} className="mb-2 text-red-400" />
          <p className="text-slate-600 dark:text-slate-300">搜索请求失败</p>
          <p className="mt-1 text-xs text-slate-400">请检查后端 /api/search 路由是否已实现</p>
        </div>
      ) : !hasAnyResult ? (
        <div className="card flex flex-col items-center justify-center py-16 text-center">
          <Empty size={48} className="mb-3 text-slate-300 dark:text-slate-600" />
          <p className="text-slate-600 dark:text-slate-300">
            没有找到与「{query}」相关的内容
          </p>
          <p className="mt-1 text-xs text-slate-400">
            尝试使用更短的关键词，或检查拼写
          </p>
          <RouterLink to="/" className="btn btn-secondary mt-4">
            <ArrowLeft size={14} className="mr-1" />
            返回首页
          </RouterLink>
        </div>
      ) : (
        <div className="space-y-4">
          {/* Group tabs */}
          <div className="inline-flex rounded-lg border border-slate-200 bg-slate-100 p-1 dark:border-slate-700 dark:bg-slate-800">
            {TABS.map(tab => {
              const Icon = tab.Icon;
              const active = activeTab === tab.id;
              const count = counts[tab.id];
              return (
                <button
                  key={tab.id}
                  type="button"
                  onClick={() => setActiveTab(tab.id)}
                  className={`inline-flex items-center gap-1.5 rounded-md px-3 py-1.5 text-xs font-medium transition-all ${
                    active
                      ? 'bg-white text-primary-600 shadow-sm dark:bg-slate-700 dark:text-primary-300'
                      : 'text-slate-500 hover:text-slate-700 dark:text-slate-400 dark:hover:text-slate-200'
                  }`}
                >
                  <Icon size={14} />
                  {tab.label}
                  <span
                    className={`ml-1 rounded-full px-1.5 text-[10px] ${
                      count > 0
                        ? 'bg-primary-100 text-primary-700 dark:bg-primary-900/50 dark:text-primary-300'
                        : 'bg-slate-200 text-slate-500 dark:bg-slate-700 dark:text-slate-400'
                    }`}
                  >
                    {count}
                  </span>
                </button>
              );
            })}
          </div>

          {/* All groups listed, default-collapsed except active */}
          <div className="space-y-4">
            <ResultGroup
              id="pages"
              title="百科条目"
              icon={<FileText size={16} />}
              total={pages.length}
              expanded={activeTab === 'pages' || expandedGroups.has('pages')}
              onToggle={() => toggleGroup('pages')}
            >
              {pages.map(p => (
                <PageResultCard key={p.slug} page={p} />
              ))}
            </ResultGroup>

            <ResultGroup
              id="files"
              title="媒体文件"
              icon={<Files size={16} />}
              total={files.length}
              expanded={activeTab === 'files' || expandedGroups.has('files')}
              onToggle={() => toggleGroup('files')}
            >
              {files.map(f => (
                <FileResultCard key={f.hash} file={f} />
              ))}
            </ResultGroup>

            <ResultGroup
              id="conversations"
              title="问答记录"
              icon={<ChatsCircle size={16} />}
              total={conversations.length}
              expanded={activeTab === 'conversations' || expandedGroups.has('conversations')}
              onToggle={() => toggleGroup('conversations')}
            >
              {conversations.map(c => (
                <ConversationResultCard key={c.id} conv={c} />
              ))}
            </ResultGroup>
          </div>
        </div>
      )}
    </div>
  );
}

function ResultGroup({
  id,
  title,
  icon,
  total,
  expanded,
  onToggle,
  children
}: {
  id: TabId;
  title: string;
  icon: React.ReactNode;
  total: number;
  expanded: boolean;
  onToggle: () => void;
  children: React.ReactNode;
}) {
  if (total === 0) {
    return (
      <section className="card p-4">
        <header className="flex items-center gap-2 text-sm font-semibold text-slate-500 dark:text-slate-400">
          {icon}
          {title}
          <span className="text-xs text-slate-400">（无结果）</span>
        </header>
      </section>
    );
  }

  const shownChildren = expanded ? children : (
    <>
      {Array.isArray(children) ? children.slice(0, PREVIEW_COUNT) : children}
    </>
  );

  return (
    <section className="card p-0 overflow-hidden">
      <header className="flex items-center justify-between border-b border-slate-200 px-4 py-3 dark:border-slate-700">
        <div className="flex items-center gap-2 text-sm font-semibold">
          <span className="text-primary-500">{icon}</span>
          {title}
          <span className="text-xs font-normal text-slate-500 dark:text-slate-400">
            {total} 条
          </span>
        </div>
        <button
          onClick={onToggle}
          className="flex items-center gap-1 text-xs text-primary-600 hover:text-primary-700 dark:text-primary-400 dark:hover:text-primary-300"
        >
          {expanded ? (
            <>
              <CaretUp size={12} />
              收起
            </>
          ) : (
            <>
              <CaretDown size={12} />
              查看全部 {total} 条
            </>
          )}
        </button>
      </header>
      <div className="divide-y divide-slate-100 dark:divide-slate-700/50">
        {shownChildren}
      </div>
    </section>
  );
}

function PageResultCard({ page }: { page: PageResult }) {
  return (
    <RouterLink
      to={`/wiki/${page.slug}`}
      className="block px-4 py-3 transition-colors hover:bg-slate-50 dark:hover:bg-slate-700/50"
    >
      <div className="flex items-center justify-between gap-2">
        <h3 className="flex items-center gap-2 text-sm font-semibold text-slate-800 dark:text-slate-100">
          <FileText size={14} className="text-primary-500" />
          {page.title || page.slug}
        </h3>
        <span className="flex items-center gap-1 font-mono text-[10px] text-slate-500 dark:text-slate-400">
          <Hash size={10} />
          {page.slug}
          <ArrowRight size={11} className="ml-0.5" />
        </span>
      </div>
      {page.snippet && (
        <p className="mt-1 line-clamp-2 text-xs text-slate-600 dark:text-slate-300">
          {page.snippet}
        </p>
      )}
      {page.type && (
        <div className="mt-1.5 flex items-center gap-2">
          <span className="badge badge-blue text-[10px]">{page.type}</span>
        </div>
      )}
    </RouterLink>
  );
}

function FileResultCard({ file }: { file: FileResult }) {
  const statusBadge =
    file.status === 'ready' || file.status === 'processed'
      ? 'badge-green'
      : file.status === 'pending' || file.status === 'processing'
      ? 'badge-yellow'
      : file.status === 'failed' || file.status === 'error'
      ? 'badge-red'
      : 'badge-blue';

  return (
    <RouterLink
      to={`/library?hash=${encodeURIComponent(file.hash)}`}
      className="block px-4 py-3 transition-colors hover:bg-slate-50 dark:hover:bg-slate-700/50"
    >
      <div className="flex items-center justify-between gap-2">
        <h3 className="flex items-center gap-2 text-sm font-semibold text-slate-800 dark:text-slate-100">
          <Files size={14} className="text-primary-500" />
          <span className="truncate">{file.originalName || file.hash}</span>
        </h3>
        <ArrowRight size={11} className="flex-shrink-0 text-slate-400" />
      </div>
      <div className="mt-1.5 flex flex-wrap items-center gap-2 text-[11px] text-slate-500 dark:text-slate-400">
        <span className="badge badge-blue text-[10px]">{file.mime || '未知类型'}</span>
        <span>{formatFileSize(file.size)}</span>
        <span>·</span>
        <span className={`badge ${statusBadge} text-[10px]`}>{file.status || '未知'}</span>
        <span className="truncate font-mono text-[10px] text-slate-400">{file.hash}</span>
      </div>
    </RouterLink>
  );
}

function ConversationResultCard({ conv }: { conv: ConversationResult }) {
  return (
    <RouterLink
      to={`/qa/${conv.id}`}
      className="block px-4 py-3 transition-colors hover:bg-slate-50 dark:hover:bg-slate-700/50"
    >
      <div className="flex items-start justify-between gap-2">
        <h3 className="flex items-start gap-2 text-sm font-semibold text-slate-800 dark:text-slate-100">
          <ChatsCircle size={14} className="mt-0.5 flex-shrink-0 text-primary-500" />
          <span className="line-clamp-2">{conv.question}</span>
        </h3>
        <span
          className="flex flex-shrink-0 items-center gap-1 text-[11px] text-slate-500 dark:text-slate-400"
          title={conv.ts}
        >
          <Clock size={11} />
          {formatRelativeTime(conv.ts)}
        </span>
      </div>
      {conv.answer && (
        <p className="mt-1 line-clamp-2 pl-6 text-xs text-slate-600 dark:text-slate-300">
          {truncate(conv.answer, 200)}
        </p>
      )}
    </RouterLink>
  );
}
