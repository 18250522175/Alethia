import { useEffect, useMemo, useRef, useState, useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import { useSearchParams, Link as RouterLink } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
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
  ArrowLeft,
  Question,
  BookmarkSimple,
  X,
  Trash,
  ClockCounterClockwise,
  Check
} from '@phosphor-icons/react';
import api from '../lib/api';
import { formatRelativeTime, formatFileSize, truncateText } from '../lib/format';
import HighlightText from '../components/HighlightText';

const PREVIEW_COUNT = 10;
const PAGE_SIZE = 20;
const HISTORY_STORAGE_KEY = 'search_history_v1';
const HISTORY_MAX_ITEMS = 10;

// 已知的高级搜索关键字
const SYNTAX_KEYS = [
  'type',
  'tag',
  'tags',
  'context',
  'namespace',
  'quality',
  'date',
  'after',
  'before',
  'lang',
  'author',
  'status'
] as const;
type SyntaxKey = (typeof SYNTAX_KEYS)[number];

const DATE_KEYS: SyntaxKey[] = ['date', 'after', 'before'];

function isKnownKey(key: string): key is SyntaxKey {
  return (SYNTAX_KEYS as readonly string[]).includes(key);
}

function isDateKey(key: string): boolean {
  return DATE_KEYS.includes(key as SyntaxKey);
}

interface ParsedToken {
  text: string;
  type: 'plain' | 'filter' | 'invalid';
  key?: string;
  value?: string;
}

// 解析单条 token（一个用空白分割的片段）
function parseToken(raw: string): ParsedToken {
  const match = raw.match(/^([A-Za-z_][\w-]*):(.*)$/);
  if (!match) {
    return { text: raw, type: 'plain' };
  }
  const [, key, value] = match;
  if (!isKnownKey(key)) {
    return { text: raw, type: 'invalid', key, value };
  }
  // date 类关键字需要校验日期格式
  if (isDateKey(key) && value && !/^(\d{4}-\d{2}-\d{2}|today|yesterday|week|month|this-week|this-month)?$/i.test(value)) {
    return { text: raw, type: 'invalid', key, value };
  }
  return { text: raw, type: 'filter', key, value };
}

// 拆分搜索字符串为 token 数组（按空白），保留空白位置以便正确拼回
function tokenize(input: string): Array<{ token: string; leading: string }> {
  if (!input) return [];
  const result: Array<{ token: string; leading: string }> = [];
  const re = /(\s+)|([^\s]+)/g;
  let m: RegExpExecArray | null;
  let pendingSpace = '';
  while ((m = re.exec(input)) !== null) {
    if (m[1]) {
      pendingSpace += m[1];
    } else if (m[2]) {
      result.push({ token: m[2], leading: pendingSpace });
      pendingSpace = '';
    }
  }
  if (pendingSpace) {
    // 末尾空白，作为最后一个 token 的前导
    if (result.length > 0) {
      result[result.length - 1].leading += pendingSpace;
    }
  }
  return result;
}

interface FilterChip {
  key: string;
  value: string;
  raw: string;
}

// 提取搜索字符串中的所有 filter 形式的键值对
function extractFilters(input: string): FilterChip[] {
  const tokens = tokenize(input);
  return tokens
    .map(({ token }) => parseToken(token))
    .filter(p => p.type === 'filter' && p.key && p.value)
    .map(p => ({ key: p.key as string, value: p.value as string, raw: p.text }));
}

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

interface HistoryItem {
  query: string;
  ts: number;
}

interface CompletionItem {
  value: string;
  description?: string;
}

export default function SearchResultPage() {
  const { t } = useTranslation();
  const [searchParams, setSearchParams] = useSearchParams();
  const query = (searchParams.get('q') || '').trim();
  const [activeTab, setActiveTab] = useState<TabId>('pages');
  const [expandedGroups, setExpandedGroups] = useState<Set<TabId>>(new Set());
  const [loadedCounts, setLoadedCounts] = useState<Record<TabId, number>>({
    pages: PREVIEW_COUNT,
    files: PREVIEW_COUNT,
    conversations: PREVIEW_COUNT
  });

  const tabs: { id: TabId; label: string; Icon: typeof FileText }[] = [
    { id: 'pages', label: t('search.pages', '条目'), Icon: FileText },
    { id: 'files', label: t('search.files', '文件'), Icon: Files },
    { id: 'conversations', label: t('search.conversations', '问答记录'), Icon: ChatsCircle }
  ];

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
      pushHistory(trimmed);
    }
  };

  const toggleGroup = (id: TabId) => {
    setExpandedGroups(prev => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
        setLoadedCounts(p => ({ ...p, [id]: PREVIEW_COUNT }));
      } else {
        next.add(id);
        const currentLoaded = loadedCounts[id];
        const total = counts[id];
        if (currentLoaded < total) {
          setLoadedCounts(p => ({ ...p, [id]: Math.min(total, currentLoaded + PAGE_SIZE) }));
        }
      }
      return next;
    });
  };

  const isLoading = searchQuery.isLoading;
  const isError = searchQuery.isError;
  const hasQuery = query.length > 0;
  const hasAnyResult = pages.length > 0 || files.length > 0 || conversations.length > 0;

  // ===== 搜索历史 =====
  const [history, setHistory] = useState<HistoryItem[]>(() => {
    try {
      const raw = localStorage.getItem(HISTORY_STORAGE_KEY);
      if (!raw) return [];
      const arr = JSON.parse(raw);
      if (!Array.isArray(arr)) return [];
      return arr.filter((x: any) => x && typeof x.query === 'string');
    } catch {
      return [];
    }
  });

  const pushHistory = useCallback((q: string) => {
    if (!q.trim()) return;
    setHistory(prev => {
      const filtered = prev.filter(p => p.query !== q);
      const next = [{ query: q, ts: Date.now() }, ...filtered].slice(0, HISTORY_MAX_ITEMS);
      try {
        localStorage.setItem(HISTORY_STORAGE_KEY, JSON.stringify(next));
      } catch {
        /* 忽略写入失败 */
      }
      return next;
    });
  }, []);

  const clearHistory = useCallback(() => {
    setHistory([]);
    try {
      localStorage.removeItem(HISTORY_STORAGE_KEY);
    } catch {
      /* 忽略 */
    }
  }, []);

  // 解析当前输入的 filter 列表
  const activeFilters = useMemo(() => extractFilters(inputValue), [inputValue]);
  const invalidToken = useMemo(() => {
    const tokens = tokenize(inputValue);
    for (const { token } of tokens) {
      const parsed = parseToken(token);
      if (parsed.type === 'invalid') return parsed;
    }
    return null;
  }, [inputValue]);

  // 移除单个 filter
  const removeFilter = (raw: string) => {
    setInputValue(prev => {
      const re = new RegExp(`\\s*${raw.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\s*`, 'g');
      return prev.replace(re, ' ').trim();
    });
  };

  return (
    <div className="space-y-6 animate-fade-in">
      <header className="space-y-3">
        <h1 className="flex items-center gap-2 text-2xl font-bold">
          <MagnifyingGlass size={28} className="text-primary-500" />
          {t('search.title', '全局搜索')}
        </h1>
        <form onSubmit={handleSubmit} className="flex items-center gap-2">
          <div className="flex-1 max-w-2xl">
            <SearchInput
              value={inputValue}
              onChange={setInputValue}
              onSubmit={(v) => {
                const trimmed = v.trim();
                if (trimmed) {
                  setSearchParams({ q: trimmed }, { replace: true });
                  pushHistory(trimmed);
                }
              }}
              history={history}
              onPickHistory={(q) => {
                setInputValue(q);
                setSearchParams({ q }, { replace: true });
                pushHistory(q);
              }}
              onClearHistory={clearHistory}
            />
          </div>
          <button type="submit" className="btn btn-primary" disabled={!inputValue.trim()}>
            {t('common.search', '搜索')}
          </button>
        </form>

        {hasAnyResult && (
          <SaveSearchButton query={query} />
        )}

        {invalidToken && (
          <p className="flex items-center gap-1.5 text-xs text-red-500">
            <Warning size={12} />
            {t('search.invalidSyntax', '语法错误')}：
            <code className="rounded bg-red-50 px-1 py-0.5 font-mono text-[11px] dark:bg-red-900/30">
              {invalidToken.text}
            </code>
            （{invalidToken.key}:）
          </p>
        )}

        {/* 活动过滤条件徽章 */}
        {(activeFilters.length > 0 || hasQuery) && (
          <ActiveFilterChips
            filters={activeFilters}
            onRemove={removeFilter}
            rawQuery={query}
          />
        )}

        <SavedSearchesPanel
          onPick={(q) => {
            setInputValue(q);
            setSearchParams({ q }, { replace: true });
            pushHistory(q);
          }}
          currentQuery={query}
        />

        <HistoryHint
          history={history}
          onPick={(q) => {
            setInputValue(q);
            setSearchParams({ q }, { replace: true });
            pushHistory(q);
          }}
          onClear={clearHistory}
        />

        {hasQuery && !isLoading && !isError && (
          <p className="text-sm text-slate-500 dark:text-slate-400">
            {t('search.resultKeywordPrefix', '关键词「')}
            <span className="font-medium text-slate-700 dark:text-slate-200">{query}</span>
            {t('search.resultKeywordSuffix', '」')}{' '}
            {t('search.resultSummary', '共找到 {{total}} 条结果', { total })}
            {pages.length > 0 && t('search.pageCount', ' · 条目 {{count}}', { count: pages.length })}
            {files.length > 0 && t('search.fileCount', ' · 文件 {{count}}', { count: files.length })}
            {conversations.length > 0 && t('search.convCount', ' · 问答 {{count}}', { count: conversations.length })}
          </p>
        )}
      </header>

      {!hasQuery ? (
        <div className="card flex flex-col items-center justify-center py-20 text-center">
          <MagnifyingGlass size={48} className="mb-3 text-slate-300 dark:text-slate-600" />
          <p className="text-slate-600 dark:text-slate-300">{t('search.emptyHint', '请在上方输入要搜索的内容')}</p>
          <p className="mt-1 text-xs text-slate-400">
            {t('search.emptySubHint', '支持搜索百科条目、媒体文件与历史问答记录')}
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
          <p className="text-slate-600 dark:text-slate-300">{t('search.errorTitle', '搜索请求失败')}</p>
          <p className="mt-1 text-xs text-slate-400">{t('search.errorHint', '请检查后端 /api/search 路由是否已实现')}</p>
        </div>
      ) : !hasAnyResult ? (
        <div className="card flex flex-col items-center justify-center py-16 text-center">
          <Empty size={48} className="mb-3 text-slate-300 dark:text-slate-600" />
          <p className="text-slate-600 dark:text-slate-300">
            {t('search.noResultsTitle', '没有找到与「{{query}}」相关的内容', { query })}
          </p>
          <p className="mt-1 text-xs text-slate-400">
            {t('search.noResultsHint', '尝试使用更短的关键词，或检查拼写')}
          </p>
          <RouterLink to="/" className="btn btn-secondary mt-4">
            <ArrowLeft size={14} className="mr-1" />
            {t('common.returnHome', '返回首页')}
          </RouterLink>
        </div>
      ) : (
        <div className="space-y-4">
          {/* Group tabs */}
          <div className="inline-flex rounded-lg border border-slate-200 bg-slate-100 p-1 dark:border-slate-700 dark:bg-slate-800">
            {tabs.map(tab => {
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
              title={t('search.wikiEntry', '百科条目')}
              icon={<FileText size={16} />}
              total={pages.length}
              expanded={activeTab === 'pages' || expandedGroups.has('pages')}
              onToggle={() => toggleGroup('pages')}
              t={t}
              loadedCount={loadedCounts.pages}
            >
              {pages.map(p => (
                <PageResultCard key={p.slug} page={p} query={query} filters={activeFilters} />
              ))}
            </ResultGroup>

            <ResultGroup
              id="files"
              title={t('search.mediaFile', '媒体文件')}
              icon={<Files size={16} />}
              total={files.length}
              expanded={activeTab === 'files' || expandedGroups.has('files')}
              onToggle={() => toggleGroup('files')}
              t={t}
              loadedCount={loadedCounts.files}
            >
              {files.map(f => (
                <FileResultCard key={f.hash} file={f} query={query} filters={activeFilters} />
              ))}
            </ResultGroup>

            <ResultGroup
              id="conversations"
              title={t('search.qaRecord', '问答记录')}
              icon={<ChatsCircle size={16} />}
              total={conversations.length}
              expanded={activeTab === 'conversations' || expandedGroups.has('conversations')}
              onToggle={() => toggleGroup('conversations')}
              t={t}
              loadedCount={loadedCounts.conversations}
            >
              {conversations.map(c => (
                <ConversationResultCard key={c.id} conv={c} query={query} filters={activeFilters} />
              ))}
            </ResultGroup>
          </div>
        </div>
      )}
    </div>
  );
}

// ======================= 带语法高亮的输入组件 =======================

interface SearchInputProps {
  value: string;
  onChange: (v: string) => void;
  onSubmit: (v: string) => void;
  history: HistoryItem[];
  onPickHistory: (q: string) => void;
  onClearHistory: () => void;
}

function SearchInput({ value, onChange, onSubmit, history, onPickHistory, onClearHistory }: SearchInputProps) {
  const { t } = useTranslation();
  const inputRef = useRef<HTMLInputElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const [showHelp, setShowHelp] = useState(false);
  const [showHistory, setShowHistory] = useState(false);
  const [showCompletion, setShowCompletion] = useState(false);
  const [highlightedIndex, setHighlightedIndex] = useState(0);

  // 计算当前正在编辑的 token
  const currentTokenInfo = useMemo(() => {
    const tokens = tokenize(value);
    if (tokens.length === 0) {
      return { token: '', start: 0, isFilter: false, key: '' };
    }
    // 判断最后一个字符是否是空白
    const trailing = /\s$/.test(value);
    if (trailing) {
      return { token: '', start: value.length, isFilter: false, key: '' };
    }
    const last = tokens[tokens.length - 1];
    const start = value.length - last.token.length;
    const match = last.token.match(/^([A-Za-z_][\w-]*):(.*)$/);
    return {
      token: last.token,
      start,
      isFilter: !!match,
      key: match ? match[1] : ''
    };
  }, [value]);

  // 拉取补全数据
  const completionsQuery = useQuery({
    queryKey: ['search-completions', currentTokenInfo.key],
    queryFn: () => api.getSearchCompletions(),
    staleTime: 5 * 60_000
  });

  // 语法帮助数据
  const helpQuery = useQuery({
    queryKey: ['syntax-help'],
    queryFn: () => api.getSyntaxHelp(),
    staleTime: 60 * 60_000
  });

  // 计算当前可用的补全项
  const completionItems: CompletionItem[] = useMemo(() => {
    if (!currentTokenInfo.isFilter) return [];
    const data = completionsQuery.data;
    const key = currentTokenInfo.key;
    if (!data) return [];
    if (key === 'type') {
      return (data.types || []).map(v => ({ value: v, description: '类型' }));
    }
    if (key === 'tag' || key === 'tags') {
      return (data.tags || []).map(v => ({ value: v, description: '标签' }));
    }
    if (key === 'context') {
      return (data.contexts || []).map(v => ({ value: v, description: '上下文' }));
    }
    if (key === 'namespace') {
      return (data.namespaces || []).map(v => ({ value: v, description: '命名空间' }));
    }
    if (key === 'quality') {
      const fixed = ['A', 'B', 'C'];
      return fixed.map(v => ({ value: v, description: '质量等级' }));
    }
    if (isDateKey(key)) {
      return [
        { value: 'today', description: t('today', '今天') },
        { value: 'yesterday', description: t('yesterday', '昨天') },
        { value: 'this-week', description: t('thisWeek', '本周') },
        { value: 'this-month', description: t('thisMonth', '本月') }
      ];
    }
    if (key === 'lang') {
      return ((data as any).languages || ['zh', 'en', 'ja', 'fr']).map((v: string) => ({ value: v, description: '语言' }));
    }
    if (key === 'author') {
      return ((data as any).authors || []).map((v: string) => ({ value: v, description: '作者' }));
    }
    if (key === 'status') {
      return ((data as any).statuses || ['draft', 'published', 'archived']).map((v: string) => ({ value: v, description: '状态' }));
    }
    return [];
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentTokenInfo, completionsQuery.data]);

  // 关键字补全（当用户输入的是 key 形式未完成时）
  const keyCompletionItems: CompletionItem[] = useMemo(() => {
    if (currentTokenInfo.isFilter) return [];
    if (!currentTokenInfo.token) return [];
    if (currentTokenInfo.token.includes(':')) return [];
    const prefix = currentTokenInfo.token.toLowerCase();
    return SYNTAX_KEYS
      .filter(k => k.toLowerCase().startsWith(prefix))
      .map(k => ({ value: `${k}:`, description: '关键字' }));
  }, [currentTokenInfo]);

  const activeItems = currentTokenInfo.isFilter ? completionItems : keyCompletionItems;

  // 控制下拉显隐
  useEffect(() => {
    if (activeItems.length > 0 && document.activeElement === inputRef.current) {
      setShowCompletion(true);
      setHighlightedIndex(0);
    } else {
      setShowCompletion(false);
    }
  }, [activeItems.length, value]);

  // 点击外部关闭弹层
  useEffect(() => {
    const onClick = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setShowHelp(false);
        setShowCompletion(false);
        // 历史只在点击外部时收起，焦点时不要收起
        if (!inputRef.current?.contains(e.target as Node)) {
          setShowHistory(false);
        }
      }
    };
    document.addEventListener('mousedown', onClick);
    return () => document.removeEventListener('mousedown', onClick);
  }, []);

  const applyCompletion = (item: CompletionItem) => {
    const { start, token } = currentTokenInfo;
    const before = value.slice(0, start);
    let inserted = item.value;
    if (!inserted.endsWith(':') && !inserted.includes(':')) {
      inserted = `${inserted}`;
    }
    const after = value.slice(start + token.length);
    const sep = after.length > 0 && !after.startsWith(' ') ? ' ' : '';
    const next = `${before}${inserted}${sep}${after}`;
    onChange(next);
    setShowCompletion(false);
    // 重新聚焦
    setTimeout(() => inputRef.current?.focus(), 0);
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (showCompletion && activeItems.length > 0) {
      if (e.key === 'ArrowDown') {
        e.preventDefault();
        setHighlightedIndex(i => (i + 1) % activeItems.length);
        return;
      }
      if (e.key === 'ArrowUp') {
        e.preventDefault();
        setHighlightedIndex(i => (i - 1 + activeItems.length) % activeItems.length);
        return;
      }
      if (e.key === 'Enter') {
        e.preventDefault();
        applyCompletion(activeItems[highlightedIndex]);
        return;
      }
      if (e.key === 'Escape') {
        e.preventDefault();
        setShowCompletion(false);
        return;
      }
    }
    if (e.key === 'Enter') {
      e.preventDefault();
      onSubmit(value);
      setShowCompletion(false);
      setShowHistory(false);
    }
    if (e.key === 'Escape') {
      setShowCompletion(false);
      setShowHistory(false);
      setShowHelp(false);
    }
  };

  // 渲染高亮层
  const highlightedHtml = useMemo(() => {
    const tokens = tokenize(value);
    if (tokens.length === 0) return '';
    return tokens
      .map(({ token, leading }) => {
        const parsed = parseToken(token);
        if (parsed.type === 'filter') {
          const key = parsed.key || '';
          const val = parsed.value || '';
          return (
            `${escapeHtml(leading)}` +
            `<span class="text-blue-600 dark:text-blue-400 font-semibold">${escapeHtml(key)}</span>` +
            `<span class="text-slate-500 dark:text-slate-400">:</span>` +
            (val
              ? `<span class="text-green-600 dark:text-green-400">${escapeHtml(val)}</span>`
              : `<span class="text-slate-400 dark:text-slate-500"></span>`)
          );
        }
        if (parsed.type === 'invalid') {
          return (
            `${escapeHtml(leading)}` +
            `<span class="text-red-500 underline decoration-wavy decoration-red-400 underline-offset-2">${escapeHtml(token)}</span>`
          );
        }
        return `${escapeHtml(leading)}${escapeHtml(token)}`;
      })
      .join('');
  }, [value]);

  return (
    <div ref={containerRef} className="relative">
      <div className="relative">
        <MagnifyingGlass
          size={18}
          className="pointer-events-none absolute left-3 top-1/2 z-20 -translate-y-1/2 text-slate-400"
        />
        {/* 高亮显示层 */}
        <div
          aria-hidden
          className="input pointer-events-none relative overflow-hidden whitespace-pre pl-10 pr-24 text-transparent caret-transparent"
          style={{ minHeight: '2.5rem' }}
        >
          <span
            className="whitespace-pre"
            dangerouslySetInnerHTML={{ __html: highlightedHtml + '<span>&nbsp;</span>' }}
          />
        </div>
        {/* 透明输入层 */}
        <input
          ref={inputRef}
          type="text"
          value={value}
          onChange={e => onChange(e.target.value)}
          onFocus={() => {
            if (!value.trim() && history.length > 0) {
              setShowHistory(true);
            }
            if (activeItems.length > 0) {
              setShowCompletion(true);
            }
          }}
          onBlur={() => {
            // 延迟关闭，让点击补全项时不被吞掉
            setTimeout(() => {
              setShowHistory(false);
              setShowCompletion(false);
            }, 150);
          }}
          onKeyDown={handleKeyDown}
          placeholder={t('search.placeholder', '搜索条目、文件、问答记录...')}
          className="input absolute inset-0 pl-10 pr-24 text-slate-900 caret-slate-900 dark:text-slate-100 dark:caret-slate-100"
          autoFocus
        />
        <div className="pointer-events-none absolute right-2 top-1/2 z-20 flex -translate-y-1/2 items-center gap-1">
          <button
            type="button"
            onMouseDown={(e) => e.preventDefault()}
            onClick={() => setShowHelp(v => !v)}
            title={t('search.syntaxHelp', '语法帮助')}
            className="pointer-events-auto inline-flex h-6 w-6 items-center justify-center rounded-full border border-slate-300 bg-white text-[11px] font-semibold text-slate-500 hover:border-primary-400 hover:text-primary-600 dark:border-slate-600 dark:bg-slate-800 dark:text-slate-400 dark:hover:border-primary-500 dark:hover:text-primary-400"
          >
            ?
          </button>
        </div>
      </div>

      {/* 语法帮助弹层 */}
      {showHelp && (
        <SyntaxHelpCard
          onClose={() => setShowHelp(false)}
          onPickExample={(ex) => {
            onChange(ex);
            setShowHelp(false);
            setTimeout(() => inputRef.current?.focus(), 0);
          }}
          helpData={helpQuery.data}
          isLoading={helpQuery.isLoading}
        />
      )}

      {/* 补全下拉 */}
      {showCompletion && activeItems.length > 0 && (
        <CompletionDropdown
          items={activeItems}
          highlightedIndex={highlightedIndex}
          onHover={setHighlightedIndex}
          onPick={applyCompletion}
        />
      )}

      {/* 搜索历史下拉 */}
      {showHistory && history.length > 0 && !value.trim() && (
        <HistoryDropdown
          history={history}
          onPick={(q) => {
            onPickHistory(q);
            setShowHistory(false);
          }}
          onClear={() => {
            onClearHistory();
            setShowHistory(false);
          }}
        />
      )}
    </div>
  );
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

// ======================= 补全下拉 =======================

interface CompletionDropdownProps {
  items: CompletionItem[];
  highlightedIndex: number;
  onHover: (i: number) => void;
  onPick: (item: CompletionItem) => void;
}

function CompletionDropdown({ items, highlightedIndex, onHover, onPick }: CompletionDropdownProps) {
  return (
    <div className="absolute left-0 right-0 z-30 mt-1 max-h-64 overflow-auto rounded-lg border border-slate-200 bg-white py-1 shadow-xl dark:border-slate-700 dark:bg-slate-800">
      {items.map((item, i) => {
        const active = i === highlightedIndex;
        return (
          <button
            key={`${item.value}-${i}`}
            type="button"
            onMouseDown={(e) => e.preventDefault()}
            onMouseEnter={() => onHover(i)}
            onClick={() => onPick(item)}
            className={`flex w-full items-center justify-between gap-2 px-3 py-1.5 text-left text-xs transition-colors ${
              active
                ? 'bg-primary-50 text-primary-700 dark:bg-primary-900/30 dark:text-primary-200'
                : 'text-slate-700 hover:bg-slate-50 dark:text-slate-200 dark:hover:bg-slate-700/40'
            }`}
          >
            <span className="flex items-center gap-2">
              {item.description && (
                <span className="text-[10px] uppercase tracking-wide text-slate-400">{item.description}</span>
              )}
              <span className="font-mono">{item.value}</span>
            </span>
            {active && <Check size={12} className="text-primary-500" />}
          </button>
        );
      })}
    </div>
  );
}

// ======================= 语法帮助卡片 =======================

interface SyntaxHelpCardProps {
  onClose: () => void;
  onPickExample: (example: string) => void;
  helpData?: { items: Array<{ key: string; description: string; example: string }> };
  isLoading?: boolean;
}

function SyntaxHelpCard({ onClose, onPickExample, helpData, isLoading }: SyntaxHelpCardProps) {
  const { t } = useTranslation();
  // 内置的兜底帮助，避免接口未实现时空白
  const fallback: Array<{ key: string; description: string; example: string }> = [
    { key: 'type:', description: '按类型过滤条目', example: 'type:concept' },
    { key: 'tag:', description: '按标签过滤', example: 'tag:ai' },
    { key: 'tags:', description: '按多个标签（任一）过滤', example: 'tags:机器学习' },
    { key: 'context:', description: '按上下文/分类过滤', example: 'context:技术' },
    { key: 'namespace:', description: '按命名空间过滤', example: 'namespace:wiki' },
    { key: 'quality:', description: '按质量等级过滤（A/B/C）', example: 'quality:A' },
    { key: 'date:', description: '按日期过滤', example: 'date:2024-01-15' },
    { key: 'after:', description: '起始日期', example: 'after:2024-01-01' },
    { key: 'before:', description: '截止日期', example: 'before:2024-12-31' }
  ];
  const items = helpData?.items?.length ? helpData.items : fallback;
  return (
    <div className="absolute right-0 z-30 mt-2 w-full max-w-md rounded-xl border border-slate-200 bg-white p-4 shadow-2xl dark:border-slate-700 dark:bg-slate-800">
      <div className="mb-2 flex items-center justify-between">
        <h4 className="flex items-center gap-1.5 text-sm font-semibold text-slate-700 dark:text-slate-200">
          <Question size={14} className="text-primary-500" />
          {t('search.syntaxHelp', '语法帮助')}
        </h4>
        <button
          type="button"
          onClick={onClose}
          className="rounded p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-600 dark:hover:bg-slate-700"
        >
          <X size={12} />
        </button>
      </div>
      {isLoading && (
        <p className="text-xs text-slate-400">{t('common.loading', '加载中…')}</p>
      )}
      <p className="mb-2 text-xs text-slate-500 dark:text-slate-400">
        {t('search.syntaxHelpHint', '支持以下高级搜索语法：')}
      </p>
      <ul className="max-h-72 space-y-1 overflow-auto pr-1">
        {items.map(item => (
          <li
            key={item.key}
            className="group flex items-start gap-2 rounded-md px-2 py-1 text-xs hover:bg-slate-50 dark:hover:bg-slate-700/40"
          >
            <code className="inline-flex min-w-[5.5rem] items-center rounded bg-blue-50 px-1.5 py-0.5 font-mono text-[11px] font-semibold text-blue-700 dark:bg-blue-900/40 dark:text-blue-300">
              {item.key}
            </code>
            <div className="min-w-0 flex-1">
              <p className="text-slate-700 dark:text-slate-200">{item.description}</p>
              {item.example && (
                <button
                  type="button"
                  onClick={() => onPickExample(item.example)}
                  className="mt-0.5 inline-flex items-center gap-1 rounded font-mono text-[11px] text-green-700 hover:underline dark:text-green-400"
                >
                  <span>例：</span>
                  <span>{item.example}</span>
                </button>
              )}
            </div>
          </li>
        ))}
      </ul>
    </div>
  );
}

// ======================= 保存搜索 =======================

function SaveSearchButton({ query }: { query: string }) {
  const { t } = useTranslation();
  const [open, setOpen] = useState(false);
  const [name, setName] = useState('');
  const queryClient = useQueryClient();

  const saveMutation = useMutation({
    mutationFn: ({ name, query }: { name: string; query: string }) => api.saveSearch(name, query),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['saved-searches'] });
      setOpen(false);
      setName('');
    }
  });

  if (!query.trim()) return null;

  return (
    <div className="flex items-center gap-2">
      <button
        type="button"
        onClick={() => setOpen(v => !v)}
        className="inline-flex items-center gap-1 rounded-md border border-slate-200 bg-white px-2 py-1 text-xs font-medium text-slate-600 hover:border-primary-300 hover:text-primary-600 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-300 dark:hover:border-primary-500 dark:hover:text-primary-300"
      >
        <BookmarkSimple size={12} />
        {t('search.saveSearch', '保存搜索')}
      </button>
      {open && (
        <div className="flex items-center gap-1.5">
          <input
            type="text"
            value={name}
            onChange={e => setName(e.target.value)}
            placeholder={t('search.saveSearchPrompt', '为这个搜索命名：')}
            className="input w-48 py-1 text-xs"
            autoFocus
            onKeyDown={(e) => {
              if (e.key === 'Enter' && name.trim()) {
                saveMutation.mutate({ name: name.trim(), query });
              }
              if (e.key === 'Escape') {
                setOpen(false);
                setName('');
              }
            }}
          />
          <button
            type="button"
            disabled={!name.trim() || saveMutation.isPending}
            onClick={() => saveMutation.mutate({ name: name.trim(), query })}
            className="btn btn-primary px-2 py-1 text-xs"
          >
            {saveMutation.isPending ? <Spinner size={12} className="animate-spin" /> : t('common.save', '保存')}
          </button>
        </div>
      )}
    </div>
  );
}

// ======================= 已保存的搜索 =======================

interface SavedItem {
  name: string;
  query: string;
  description: string;
  created_at: string;
  updated_at: string;
}

function SavedSearchesPanel({
  onPick,
  currentQuery
}: {
  onPick: (q: string) => void;
  currentQuery: string;
}) {
  const { t } = useTranslation();
  const [open, setOpen] = useState(false);
  const queryClient = useQueryClient();
  const savedQuery = useQuery({
    queryKey: ['saved-searches'],
    queryFn: () => api.getSavedSearches(),
    staleTime: 60_000
  });
  const deleteMutation = useMutation({
    mutationFn: (name: string) => api.deleteSavedSearch(name),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['saved-searches'] })
  });

  const items: SavedItem[] = savedQuery.data?.items || [];

  return (
    <div className="rounded-lg border border-slate-200 bg-slate-50 dark:border-slate-700 dark:bg-slate-800/50">
      <button
        type="button"
        onClick={() => setOpen(v => !v)}
        className="flex w-full items-center justify-between px-3 py-2 text-xs font-medium text-slate-600 dark:text-slate-300"
      >
        <span className="flex items-center gap-1.5">
          <BookmarkSimple size={12} className="text-primary-500" />
          {t('search.savedSearches', '已保存的搜索')}
          {items.length > 0 && (
            <span className="rounded-full bg-slate-200 px-1.5 py-0.5 text-[10px] text-slate-500 dark:bg-slate-700 dark:text-slate-300">
              {items.length}
            </span>
          )}
        </span>
        {open ? <CaretUp size={12} /> : <CaretDown size={12} />}
      </button>
      {open && (
        <div className="border-t border-slate-200 px-3 py-2 dark:border-slate-700">
          {savedQuery.isLoading ? (
            <p className="text-xs text-slate-400">{t('common.loading', '加载中…')}</p>
          ) : items.length === 0 ? (
            <p className="text-xs text-slate-400">{t('search.noSavedSearches', '暂无已保存的搜索')}</p>
          ) : (
            <ul className="space-y-1">
              {items.map((s) => (
                <li
                  key={s.name}
                  className={`group flex items-center justify-between gap-2 rounded-md px-2 py-1.5 text-xs hover:bg-white dark:hover:bg-slate-700/40 ${
                    s.query === currentQuery
                      ? 'bg-primary-50 dark:bg-primary-900/30'
                      : ''
                  }`}
                >
                  <button
                    type="button"
                    onClick={() => onPick(s.query)}
                    className="min-w-0 flex-1 text-left"
                  >
                    <div className="truncate font-medium text-slate-700 dark:text-slate-200">{s.name}</div>
                    <div className="truncate font-mono text-[10px] text-slate-500 dark:text-slate-400">{s.query}</div>
                  </button>
                  <button
                    type="button"
                    onClick={() => deleteMutation.mutate(s.name)}
                    className="rounded p-1 text-slate-400 opacity-0 transition-opacity hover:bg-red-50 hover:text-red-500 group-hover:opacity-100 dark:hover:bg-red-900/30"
                    title={t('search.deleteSaved', '删除')}
                  >
                    <Trash size={11} />
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </div>
  );
}

// ======================= 搜索历史下拉 =======================

function HistoryDropdown({
  history,
  onPick,
  onClear
}: {
  history: HistoryItem[];
  onPick: (q: string) => void;
  onClear: () => void;
}) {
  return (
    <div className="absolute left-0 right-0 z-30 mt-1 max-h-64 overflow-auto rounded-lg border border-slate-200 bg-white py-1 shadow-xl dark:border-slate-700 dark:bg-slate-800">
      <div className="flex items-center justify-between px-3 py-1.5 text-[10px] uppercase tracking-wide text-slate-400">
        <span>最近搜索</span>
        <button
          type="button"
          onMouseDown={(e) => e.preventDefault()}
          onClick={onClear}
          className="text-slate-400 hover:text-red-500"
        >
          清空
        </button>
      </div>
      {history.map((h, i) => (
        <button
          key={`${h.query}-${i}`}
          type="button"
          onMouseDown={(e) => e.preventDefault()}
          onClick={() => onPick(h.query)}
          className="flex w-full items-center gap-2 px-3 py-1.5 text-left text-xs text-slate-700 hover:bg-slate-50 dark:text-slate-200 dark:hover:bg-slate-700/40"
        >
          <ClockCounterClockwise size={12} className="flex-shrink-0 text-slate-400" />
          <span className="flex-1 truncate font-mono">{h.query}</span>
          <span className="text-[10px] text-slate-400">{formatRelativeTime(new Date(h.ts).toISOString())}</span>
        </button>
      ))}
    </div>
  );
}

function HistoryHint({
  history,
  onPick,
  onClear
}: {
  history: HistoryItem[];
  onPick: (q: string) => void;
  onClear: () => void;
}) {
  const { t } = useTranslation();
  if (history.length === 0) return null;
  return (
    <div className="flex flex-wrap items-center gap-1.5 text-xs text-slate-500 dark:text-slate-400">
      <ClockCounterClockwise size={12} className="text-slate-400" />
      <span>{t('search.searchHistory', '搜索历史')}：</span>
      {history.slice(0, 5).map((h, i) => (
        <button
          key={`${h.query}-${i}`}
          type="button"
          onClick={() => onPick(h.query)}
          className="badge badge-blue hover:opacity-80"
          title={h.query}
        >
          {h.query.length > 24 ? h.query.slice(0, 24) + '…' : h.query}
        </button>
      ))}
      <button
        type="button"
        onClick={onClear}
        className="text-[10px] text-slate-400 hover:text-red-500"
      >
        {t('search.clearHistory', '清空')}
      </button>
    </div>
  );
}

// ======================= 活动过滤条件徽章 =======================

function ActiveFilterChips({
  filters,
  onRemove,
  rawQuery
}: {
  filters: FilterChip[];
  onRemove: (raw: string) => void;
  rawQuery: string;
}) {
  const { t } = useTranslation();
  if (filters.length === 0 && !rawQuery.trim()) return null;
  return (
    <div className="flex flex-wrap items-center gap-1.5 text-xs">
      <span className="text-slate-500 dark:text-slate-400">
        {t('search.activeFilters', '当前过滤条件')}：
      </span>
      {filters.length === 0 && (
        <span className="text-slate-400 dark:text-slate-500">
          {t('search.noActiveFilters', '无过滤条件')}
        </span>
      )}
      {filters.map((f, i) => (
        <span
          key={`${f.raw}-${i}`}
          className="badge badge-blue inline-flex items-center gap-1"
        >
          <span className="font-mono">{f.key}:{f.value}</span>
          <button
            type="button"
            onClick={() => onRemove(f.raw)}
            className="rounded-full p-0.5 hover:bg-blue-200 dark:hover:bg-blue-800"
            aria-label="remove filter"
          >
            <X size={10} />
          </button>
        </span>
      ))}
    </div>
  );
}

// ======================= 结果分组 =======================

function ResultGroup({
  id,
  title,
  icon,
  total,
  expanded,
  onToggle,
  children,
  t,
  loadedCount
}: {
  id: TabId;
  title: string;
  icon: React.ReactNode;
  total: number;
  expanded: boolean;
  onToggle: () => void;
  children: React.ReactNode;
  t: any;
  loadedCount: number;
}) {
  if (total === 0) {
    return (
      <section className="card p-4">
        <header className="flex items-center gap-2 text-sm font-semibold text-slate-500 dark:text-slate-400">
          {icon}
          {title}
          <span className="text-xs text-slate-400">（{t('common.noResults', '无结果')}）</span>
        </header>
      </section>
    );
  }

  const displayCount = expanded ? loadedCount : PREVIEW_COUNT;
  const shownChildren = (
    <>
      {Array.isArray(children) ? children.slice(0, displayCount) : children}
    </>
  );

  return (
    <section className="card p-0 overflow-hidden">
      <header className="flex items-center justify-between border-b border-slate-200 px-4 py-3 dark:border-slate-700">
        <div className="flex items-center gap-2 text-sm font-semibold">
          <span className="text-primary-500">{icon}</span>
          {title}
          <span className="text-xs font-normal text-slate-500 dark:text-slate-400">
            {t('search.totalResults', '{{count}} 条', { count: total })}
          </span>
        </div>
        <button
          onClick={onToggle}
          className="flex items-center gap-1 text-xs text-primary-600 hover:text-primary-700 dark:text-primary-400 dark:hover:text-primary-300"
        >
          {expanded ? (
            <>
              <CaretUp size={12} />
              {t('common.collapse', '收起')}
            </>
          ) : (
            <>
              <CaretDown size={12} />
              {t('search.showAll', '查看全部 {{count}} 条', { count: total })}
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

// ======================= 单条结果卡片 =======================

function ResultFilterChips({ filters }: { filters: FilterChip[] }) {
  if (filters.length === 0) return null;
  return (
    <div className="mt-1.5 flex flex-wrap gap-1">
      {filters.map((f, i) => (
        <span
          key={`${f.raw}-${i}`}
          className="badge badge-blue font-mono text-[10px]"
          title={f.raw}
        >
          {f.key}:{f.value}
        </span>
      ))}
    </div>
  );
}

function PageResultCard({ page, query, filters }: { page: PageResult; query: string; filters: FilterChip[] }) {
  return (
    <RouterLink
      to={`/wiki/${page.slug}`}
      className="block px-4 py-3 transition-colors hover:bg-slate-50 dark:hover:bg-slate-700/50"
    >
      <div className="flex items-center justify-between gap-2">
        <h3 className="flex items-center gap-2 text-sm font-semibold text-slate-800 dark:text-slate-100">
          <FileText size={14} className="text-primary-500" />
          <HighlightText text={page.title || page.slug} keyword={query} />
        </h3>
        <span className="flex items-center gap-1 font-mono text-[10px] text-slate-500 dark:text-slate-400">
          <Hash size={10} />
          {page.slug}
          <ArrowRight size={11} className="ml-0.5" />
        </span>
      </div>
      {page.snippet && (
        <p className="mt-1 line-clamp-2 text-xs text-slate-600 dark:text-slate-300">
          <HighlightText text={page.snippet} keyword={query} />
        </p>
      )}
      <div className="mt-1.5 flex flex-wrap items-center gap-2">
        {page.type && <span className="badge badge-blue text-[10px]">{page.type}</span>}
        <ResultFilterChips filters={filters} />
      </div>
    </RouterLink>
  );
}

function FileResultCard({ file, query, filters }: { file: FileResult; query: string; filters: FilterChip[] }) {
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
      to={`/library/${encodeURIComponent(file.hash)}`}
      className="block px-4 py-3 transition-colors hover:bg-slate-50 dark:hover:bg-slate-700/50"
    >
      <div className="flex items-center justify-between gap-2">
        <h3 className="flex items-center gap-2 text-sm font-semibold text-slate-800 dark:text-slate-100">
          <Files size={14} className="text-primary-500" />
          <span className="truncate">
            <HighlightText text={file.originalName || file.hash} keyword={query} />
          </span>
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
      <ResultFilterChips filters={filters} />
    </RouterLink>
  );
}

function ConversationResultCard({ conv, query, filters }: { conv: ConversationResult; query: string; filters: FilterChip[] }) {
  return (
    <RouterLink
      to={`/qa/${conv.id}`}
      className="block px-4 py-3 transition-colors hover:bg-slate-50 dark:hover:bg-slate-700/50"
    >
      <div className="flex items-start justify-between gap-2">
        <h3 className="flex items-start gap-2 text-sm font-semibold text-slate-800 dark:text-slate-100">
          <ChatsCircle size={14} className="mt-0.5 flex-shrink-0 text-primary-500" />
          <span className="line-clamp-2">
            <HighlightText text={conv.question} keyword={query} />
          </span>
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
          {truncateText(conv.answer, 200)}
        </p>
      )}
      <ResultFilterChips filters={filters} />
    </RouterLink>
  );
}
