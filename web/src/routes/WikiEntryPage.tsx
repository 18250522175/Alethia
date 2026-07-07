import { useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useParams, Link as RouterLink, useNavigate } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import matter from 'gray-matter';
import {
  ArrowLeft,
  ArrowRight,
  ArrowsLeftRight,
  PencilSimple,
  X,
  Columns,
  Eye,
  Code,
  FloppyDisk,
  Spinner,
  Warning,
  FileText,
  Hash,
  Tag,
  Clock,
  GitBranch,
  Brain,
  ChatCircleDots,
  Plus,
  Trash,
  Link
} from '@phosphor-icons/react';
import api from '../lib/api';
import MarkdownRenderer from '../components/MarkdownRenderer';
import MarkdownEditor from '../components/MarkdownEditor';
import EvidencePopover from '../blocks/EvidencePopover';
import MiniKnowledgeGraph from '../components/MiniKnowledgeGraph';
import EntryTimeline from '../components/EntryTimeline';

type ViewMode = 'split' | 'preview' | 'source';

const TYPE_BADGE: Record<string, string> = {
  concept: 'badge-blue',
  person: 'badge-green',
  company: 'badge-yellow',
  meeting: 'badge-red',
  atom: 'badge-blue',
  portal: 'badge-yellow',
  category: 'badge-green',
  index: 'badge-blue'
};

function formatDate(iso: string): string {
  try {
    return new Date(iso).toLocaleString('zh-CN', {
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit'
    });
  } catch {
    return iso;
  }
}

export default function WikiEntryPage() {
  const { t } = useTranslation();
  const { slug = '' } = useParams<{ slug: string }>();
  const queryClient = useQueryClient();
  const navigate = useNavigate();

  const [viewMode, setViewMode] = useState<ViewMode>('split');
  const [isEditing, setIsEditing] = useState(false);
  const [draft, setDraft] = useState('');
  const [editAliases, setEditAliases] = useState<string[]>([]);
  const [newAliasInput, setNewAliasInput] = useState('');
  const [activeEvidenceId, setActiveEvidenceId] = useState<string | null>(null);

  const pageQuery = useQuery({
    queryKey: ['wiki-page', slug],
    queryFn: () => api.getWikiPage(slug),
    enabled: !!slug,
    staleTime: 30_000
  });

  const archiveVersionsQuery = useQuery({
    queryKey: ['archive-versions', slug],
    queryFn: () => api.getArchiveVersions(slug),
    enabled: !!slug,
    staleTime: 60_000
  });

  const aliasMapQuery = useQuery({
    queryKey: ['alias-map'],
    queryFn: () => api.getAliasMap(),
    staleTime: 300_000
  });

  const backlinksQuery = useQuery({
    queryKey: ['wiki-backlinks', slug],
    queryFn: () => api.getBacklinks(slug),
    enabled: !!slug,
    staleTime: 30_000
  });

  const saveMutation = useMutation({
    mutationFn: (content: string) => api.updateWikiPage(slug, content),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['wiki-page', slug] });
      setIsEditing(false);
    }
  });

  const page = pageQuery.data?.page;
  const evidenceSpans = pageQuery.data?.evidenceSpans ?? [];
  const incomingLinks = pageQuery.data?.links?.incoming ?? [];
  const outgoingLinks = pageQuery.data?.links?.outgoing ?? [];

  // Sync the editor draft whenever the stored page content changes (load / refetch).
  useEffect(() => {
    if (page) {
      setDraft(page.rawMd);
      setEditAliases(page.aliases || []);
    }
  }, [page?.rawMd, page?.hash, page?.aliases]);

  const activeEvidence = useMemo(
    () => evidenceSpans.find(e => e.span_id === activeEvidenceId) ?? null,
    [evidenceSpans, activeEvidenceId]
  );

  const handleEvidenceClick = (spanId: string) => {
    setActiveEvidenceId(prev => (prev === spanId ? null : spanId));
  };

  const handleStartEdit = () => {
    // ensure the source pane is visible when entering edit mode
    if (viewMode === 'preview') setViewMode('split');
    setIsEditing(true);
  };

  const handleCancelEdit = () => {
    if (page) {
      setDraft(page.rawMd);
      setEditAliases(page.aliases || []);
    }
    setIsEditing(false);
  };

  const handleSave = () => {
    if (!isDirty && JSON.stringify(editAliases) === JSON.stringify(page?.aliases || [])) return;

    let contentToSave = draft;

    // 如果别名有变化，更新 frontmatter 中的 aliases
    if (page && JSON.stringify(editAliases) !== JSON.stringify(page.aliases || [])) {
      try {
        const parsed = matter(draft);
        parsed.data.aliases = editAliases;
        const yamlLines: string[] = [];
        for (const [k, v] of Object.entries(parsed.data)) {
          if (Array.isArray(v)) {
            yamlLines.push(`${k}:`);
            for (const item of v) {
              yamlLines.push(`  - ${item}`);
            }
          } else if (typeof v === 'string') {
            yamlLines.push(`${k}: ${v}`);
          } else {
            yamlLines.push(`${k}: ${v}`);
          }
        }
        contentToSave = `---\n${yamlLines.join('\n')}\n---\n${parsed.content}`;
      } catch {
        // 如果解析失败，直接保存原内容
        contentToSave = draft;
      }
    }

    saveMutation.mutate(contentToSave);
  };

  const isDirty = page
    ? draft !== page.rawMd || JSON.stringify(editAliases) !== JSON.stringify(page.aliases || [])
    : false;

  if (pageQuery.isLoading) {
    return (
      <div className="flex items-center justify-center py-20 text-slate-500 dark:text-slate-400">
        <Spinner size={24} className="mr-2 animate-spin" />
        {t('common.loading')}
      </div>
    );
  }

  if (pageQuery.isError || !page) {
    return (
      <div className="card flex flex-col items-center justify-center py-16 text-center animate-fade-in">
        <Warning size={48} className="mb-3 text-red-400" />
        <p className="text-slate-700 dark:text-slate-200">
          {t('wiki.loadError', '无法加载此条目')}
        </p>
        <p className="mt-1 font-mono text-xs text-slate-500 dark:text-slate-400">{slug}</p>
        <RouterLink to="/" className="btn btn-secondary mt-4">
          <ArrowLeft size={14} className="mr-1" />
          {t('common.back', '返回')}
        </RouterLink>
      </div>
    );
  }

  const showPreview = viewMode !== 'source';
  const showSource = viewMode !== 'preview';
  const gridClass = viewMode === 'split' ? 'lg:grid-cols-[6fr_4fr]' : 'lg:grid-cols-1';
  const typeBadge = TYPE_BADGE[page.type] ?? 'badge-blue';
  const viewModes: { id: ViewMode; icon: typeof Eye; label: string }[] = [
    { id: 'preview', icon: Eye, label: t('wiki.preview', '预览') },
    { id: 'split', icon: Columns, label: t('wiki.split', '双栏') },
    { id: 'source', icon: Code, label: t('wiki.source', '源码') }
  ];

  return (
    <div className="space-y-5 animate-fade-in">
      {/* breadcrumb */}
      <nav className="flex items-center gap-2 text-xs text-slate-400 dark:text-slate-500">
        <RouterLink to="/" className="hover:text-primary-600 dark:hover:text-primary-400">
          知识百科
        </RouterLink>
        <span className="text-slate-300 dark:text-slate-600">/</span>
        <RouterLink
          to={`/search?type=${encodeURIComponent(page.type)}`}
          className="hover:text-primary-600 dark:hover:text-primary-400"
        >
          {page.type === 'concept' ? '概念' : page.type === 'person' ? '人物' : page.type === 'event' ? '事件' : page.type}
        </RouterLink>
        <span className="text-slate-300 dark:text-slate-600">/</span>
        <span className="text-slate-600 dark:text-slate-300">{page.title}</span>
      </nav>

      {/* metadata header */}
      <header className="card overflow-hidden p-0">
        <div className="border-l-4 border-primary-500 p-5">
          <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
            <div className="min-w-0 flex-1">
              <h1 className="text-2xl font-bold text-slate-900 dark:text-slate-100">
                {page.title}
              </h1>
              {page.aliases && page.aliases.length > 0 && (
                <div className="mt-2 flex flex-wrap items-center gap-1.5 text-xs">
                  <span className="text-slate-400">别名:</span>
                  {page.aliases.map(alias => (
                    <span key={alias} className="badge badge-yellow cursor-pointer" onClick={() => navigate(`/wiki/${encodeURIComponent(alias)}`)}>
                      {alias}
                    </span>
                  ))}
                </div>
              )}
              {page.contexts.length > 0 && (
                <div className="mt-1 flex flex-wrap items-center gap-1.5 text-xs">
                  {page.contexts.map(ctx => (
                    <button
                      key={ctx}
                      onClick={() => navigate(`/search?q=&context=${ctx}`)}
                      className="badge badge-blue cursor-pointer hover:bg-blue-100 dark:hover:bg-blue-900/30"
                    >
                      <Tag size={10} className="mr-1" />
                      {ctx}
                    </button>
                  ))}
                </div>
              )}
            </div>
            <div className="flex flex-wrap items-center gap-x-4 gap-y-1.5 text-xs text-slate-500 dark:text-slate-400">
              <span className="inline-flex items-center gap-1">
                <span className={`badge ${typeBadge}`}>{page.type}</span>
              </span>
              <span className="inline-flex items-center gap-1">
                <Hash size={12} />
                <span className="font-mono">{page.slug}</span>
              </span>
              <span className="inline-flex items-center gap-1">
                <Clock size={12} />
                {formatDate(page.updatedAt)}
              </span>
              <span className="inline-flex items-center gap-1">
                <GitBranch size={12} />
                {t('wiki.version', '版本')} v{page.version}
              </span>
            </div>
          </div>
        </div>
      </header>

      {/* action bar */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="inline-flex rounded-lg border border-slate-200 bg-slate-100 p-1 dark:border-slate-700 dark:bg-slate-800">
          {viewModes.map(mode => {
            const Icon = mode.icon;
            const active = viewMode === mode.id;
            return (
              <button
                key={mode.id}
                type="button"
                onClick={() => setViewMode(mode.id)}
                className={`inline-flex items-center gap-1.5 rounded-md px-3 py-1.5 text-xs font-medium transition-all ${
                  active
                    ? 'bg-white text-primary-600 shadow-sm dark:bg-slate-700 dark:text-primary-300'
                    : 'text-slate-500 hover:text-slate-700 dark:text-slate-400 dark:hover:text-slate-200'
                }`}
              >
                <Icon size={14} />
                {mode.label}
              </button>
            );
          })}
        </div>

        <div className="flex items-center gap-2">
          <button
            onClick={() => navigate(`/qa?q=${encodeURIComponent(`关于"${page.title}"的问题`)}`)}
            className="btn btn-secondary gap-1.5"
          >
            <ChatCircleDots size={14} />
            <span className="hidden sm:inline">就此条目提问</span>
            <span className="sm:hidden">提问</span>
          </button>
          {isEditing ? (
            <>
              <button
                type="button"
                onClick={handleCancelEdit}
                disabled={saveMutation.isPending}
                className="btn btn-secondary"
              >
                <X size={14} className="mr-1" />
                {t('common.cancel', '取消')}
              </button>
              <button
                type="button"
                onClick={handleSave}
                disabled={!isDirty || saveMutation.isPending}
                className="btn btn-primary"
              >
                {saveMutation.isPending ? (
                  <Spinner size={14} className="mr-1 animate-spin" />
                ) : (
                  <FloppyDisk size={14} className="mr-1" />
                )}
                {t('common.save', '保存')}
              </button>
            </>
          ) : (
            <button type="button" onClick={handleStartEdit} className="btn btn-secondary">
              <PencilSimple size={14} className="mr-1" />
              {t('common.edit', '编辑')}
            </button>
          )}
        </div>
      </div>

      {saveMutation.isError && (
        <div className="rounded-lg border border-red-300 bg-red-50 px-3 py-2 text-sm text-red-700 dark:border-red-700 dark:bg-red-900/30 dark:text-red-300">
          {t('wiki.saveError', '保存失败，请稍后重试')}
        </div>
      )}

      {/* active evidence inspector dock */}
      {activeEvidence && (
        <div className="flex items-center gap-2 rounded-lg border border-parchment-300 bg-parchment-50 p-2.5 animate-slide-up dark:border-parchment-700 dark:bg-parchment-900/30">
          <FileText
            size={16}
            className="flex-shrink-0 text-parchment-600 dark:text-parchment-400"
          />
          <span className="flex-shrink-0 text-xs font-medium text-slate-600 dark:text-slate-300">
            {t('evidence.title', '证据')}
          </span>
          <EvidencePopover evidence={activeEvidence}>
            <button
              type="button"
              className="badge badge-yellow cursor-pointer font-mono hover:bg-yellow-200 dark:hover:bg-yellow-900/70"
              title={activeEvidence.span_text}
            >
              {activeEvidence.span_id.length > 10
                ? `${activeEvidence.span_id.slice(0, 8)}…`
                : activeEvidence.span_id}
            </button>
          </EvidencePopover>
          <span className="min-w-0 flex-1 truncate text-xs text-slate-500 dark:text-slate-400">
            {activeEvidence.span_text}
          </span>
          <button
            type="button"
            onClick={() => setActiveEvidenceId(null)}
            aria-label={t('common.close', '关闭')}
            className="flex-shrink-0 rounded p-1 text-slate-400 transition-colors hover:bg-slate-200 hover:text-slate-600 dark:hover:bg-slate-700 dark:hover:text-slate-200"
          >
            <X size={14} />
          </button>
        </div>
      )}

      {/* main content with right sidebar */}
      <div className="grid grid-cols-1 gap-5 lg:grid-cols-[1fr_320px]">
        <div className="space-y-5">
          {/* main split view */}
          <div className={`grid grid-cols-1 gap-5 ${gridClass}`}>
            {showPreview && (
              <section className="card p-5">
                <div className="mb-3 flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-slate-400">
                  <Eye size={12} />
                  {t('wiki.preview', '预览')}
                </div>
                <MarkdownRenderer
                  content={page.contentMd}
                  evidenceSpans={evidenceSpans}
                  onEvidenceClick={handleEvidenceClick}
                  aliasMap={aliasMapQuery.data}
                />
              </section>
            )}

            {showSource && (
              <section className="card p-5" data-source-section>
                <div className="mb-3 flex items-center justify-between gap-2 text-xs font-semibold uppercase tracking-wide text-slate-400">
                  <span className="inline-flex items-center gap-1.5">
                    <Code size={12} />
                    {isEditing
                      ? t('wiki.editSource', '编辑源码')
                      : t('wiki.source', '源码')}
                  </span>
                  {isEditing && isDirty && (
                    <span className="inline-flex items-center gap-1 text-yellow-500">
                      <span className="h-1.5 w-1.5 rounded-full bg-yellow-500" />
                      {t('wiki.unsaved', '未保存')}
                    </span>
                  )}
                </div>
                {isEditing && (
                  <div className="mb-4 rounded-lg border border-slate-200 bg-slate-50 p-3 dark:border-slate-700 dark:bg-slate-800">
                    <div className="mb-2 text-xs font-medium text-slate-600 dark:text-slate-300">别名管理</div>
                    <div className="flex flex-wrap items-center gap-2">
                      {editAliases.map((alias, idx) => (
                        <span
                          key={idx}
                          className="inline-flex items-center gap-1 rounded-md bg-white px-2 py-1 text-xs shadow-sm dark:bg-slate-700"
                        >
                          {alias}
                          <button
                            type="button"
                            onClick={() => setEditAliases(prev => prev.filter((_, i) => i !== idx))}
                            className="rounded p-0.5 text-slate-400 hover:bg-red-100 hover:text-red-500 dark:hover:bg-red-900/30"
                          >
                            <Trash size={10} />
                          </button>
                        </span>
                      ))}
                      <div className="flex items-center gap-1">
                        <input
                          type="text"
                          value={newAliasInput}
                          onChange={e => setNewAliasInput(e.target.value)}
                          onKeyDown={e => {
                            if (e.key === 'Enter' && newAliasInput.trim()) {
                              e.preventDefault();
                              const val = newAliasInput.trim();
                              if (!editAliases.includes(val)) {
                                setEditAliases(prev => [...prev, val]);
                              }
                              setNewAliasInput('');
                            }
                          }}
                          placeholder="添加别名..."
                          className="input h-7 w-32 text-xs py-0.5"
                        />
                        <button
                          type="button"
                          onClick={() => {
                            const val = newAliasInput.trim();
                            if (val && !editAliases.includes(val)) {
                              setEditAliases(prev => [...prev, val]);
                              setNewAliasInput('');
                            }
                          }}
                          className="rounded p-1 text-primary-500 hover:bg-primary-50 dark:hover:bg-primary-900/30"
                        >
                          <Plus size={14} />
                        </button>
                      </div>
                    </div>
                  </div>
                )}
                {isEditing ? (
                  <MarkdownEditor value={draft} onChange={setDraft} />
                ) : (
                  <pre className="h-[60vh] overflow-auto rounded-lg bg-slate-50 p-4 font-mono text-sm leading-6 text-slate-700 dark:bg-slate-900/50 dark:text-slate-300">
                    {page.rawMd}
                  </pre>
                )}
              </section>
            )}
          </div>

          {/* related entities & mini graph */}
          <div className="grid grid-cols-1 gap-5 lg:grid-cols-2">
            <section className="card p-5">
              <h2 className="mb-4 flex items-center gap-2 text-base font-semibold">
                <ArrowsLeftRight size={18} className="text-knowledge-500" />
                {t('wiki.relatedEntities', '关联实体')}
              </h2>
              <div className="grid grid-cols-1 gap-5 md:grid-cols-2">
                <LinkList
                  title={t('wiki.incomingLinks', '入链')}
                  icon={<ArrowLeft size={12} />}
                  items={incomingLinks.map(link => ({
                    id: link.id,
                    slug: link.sourceSlug,
                    relation: link.relation
                  }))}
                  emptyText={t('wiki.noIncoming', '暂无入链')}
                />
                <LinkList
                  title={t('wiki.outgoingLinks', '出链')}
                  icon={<ArrowRight size={12} />}
                  items={outgoingLinks.map(link => ({
                    id: link.id,
                    slug: link.targetSlug,
                    relation: link.relation
                  }))}
                  emptyText={t('wiki.noOutgoing', '暂无出链')}
                />
              </div>
            </section>

            <MiniKnowledgeGraph
              currentSlug={slug}
              currentTitle={page.title}
              relatedEntities={[
                ...incomingLinks.map(l => ({ slug: l.sourceSlug, title: l.sourceSlug, relation: l.relation })),
                ...outgoingLinks.map(l => ({ slug: l.targetSlug, title: l.targetSlug, relation: l.relation }))
              ].slice(0, 8)}
            />
          </div>
        </div>

        <aside className="space-y-4">
          <section className="card p-4">
            <div className="mb-3 flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-slate-400">
              <Link size={12} />
              反向链接
            </div>
            {backlinksQuery.isLoading ? (
              <div className="flex items-center justify-center py-4 text-xs text-slate-400">
                <Spinner size={16} className="mr-1 animate-spin" />
                加载中...
              </div>
            ) : !backlinksQuery.data?.backlinks?.length ? (
              <p className="text-xs text-slate-400 dark:text-slate-500">暂无反向链接</p>
            ) : (
              <ul className="space-y-3">
                {backlinksQuery.data.backlinks.map((link, idx) => (
                  <li key={idx} className="rounded-md bg-slate-50 p-2.5 dark:bg-slate-700/40">
                    <div className="mb-1 flex items-center justify-between gap-2">
                      <RouterLink
                        to={`/wiki/${link.sourceSlug}`}
                        className="text-sm font-medium text-primary-600 hover:underline dark:text-primary-400"
                      >
                        {link.sourceTitle}
                      </RouterLink>
                      {link.relationType && (
                        <span className="badge badge-blue text-[10px]">{link.relationType}</span>
                      )}
                    </div>
                    <p className="line-clamp-2 text-xs text-slate-500 dark:text-slate-400">
                      {link.context}
                    </p>
                  </li>
                ))}
              </ul>
            )}
          </section>
        </aside>
      </div>

      {/* entry timeline */}
      <EntryTimeline
        events={archiveVersionsQuery.data?.versions?.map((v, i) => ({
          id: String(i + 1),
          type: i === 0 ? 'edit' : 'create',
          title: i === 0 ? '内容更新' : `版本 v${v.version}`,
          description: v.changeSummary || `版本 v${v.version} 更新`,
          timestamp: v.updatedAt,
          version: String(v.version),
          author: '系统'
        })) || [
          {
            id: '1',
            type: 'edit',
            title: '内容更新',
            description: `版本 v${page.version} 更新`,
            timestamp: page.updatedAt,
            version: String(page.version),
            author: 'AI 助手'
          },
          {
            id: '2',
            type: 'extract',
            title: '知识提取',
            description: '从源文档中自动提取知识',
            timestamp: new Date(Date.now() - 1000 * 60 * 60 * 24 * 3).toISOString(),
            author: '系统'
          },
          {
            id: '3',
            type: 'create',
            title: '条目创建',
            description: '初始版本创建',
            timestamp: new Date(Date.now() - 1000 * 60 * 60 * 24 * 7).toISOString(),
            version: '1',
            author: '系统'
          }
        ]}
      />
    </div>
  );
}

interface LinkItem {
  id: number;
  slug: string;
  relation: string;
}

function LinkList({
  title,
  icon,
  items,
  emptyText
}: {
  title: string;
  icon: React.ReactNode;
  items: LinkItem[];
  emptyText: string;
}) {
  return (
    <div>
      <div className="mb-2 flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-slate-400">
        {icon}
        {title} ({items.length})
      </div>
      {items.length === 0 ? (
        <p className="text-sm text-slate-400 dark:text-slate-500">{emptyText}</p>
      ) : (
        <ul className="space-y-1">
          {items.map(link => (
            <li key={link.id}>
              <RouterLink
                to={`/wiki/${link.slug}`}
                className="inline-flex items-center gap-1.5 rounded-md px-2 py-1 text-sm text-slate-700 transition-colors hover:bg-slate-100 dark:text-slate-200 dark:hover:bg-slate-700/50"
              >
                <span className="font-mono text-primary-600 dark:text-primary-400">
                  {link.slug}
                </span>
                {link.relation && (
                  <span className="badge badge-blue text-[10px]">{link.relation}</span>
                )}
              </RouterLink>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
