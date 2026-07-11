import { useState, useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
import { Notebook, Plus, Folder, File, FloppyDisk, Trash, PaperPlaneTilt, CaretDown, CaretRight, Eye, Pencil, Article, Tag, X } from '@phosphor-icons/react';
import api from '../lib/api';
import MarkdownEditor from '../components/MarkdownEditor';
import MarkdownRenderer from '../components/MarkdownRenderer';

interface NoteFile {
  path: string;
  name: string;
  folder: string;
  status: string;
  updatedAt: string;
  tags?: string[];
}

export default function NotesPage() {
  const { t } = useTranslation();
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  const [selectedNote, setSelectedNote] = useState<string | null>(null);
  const [editContent, setEditContent] = useState('');
  const [isPreview, setIsPreview] = useState(false);
  const [expandedFolders, setExpandedFolders] = useState<Set<string>>(new Set(['inbox', 'drafts', 'ready-for-review']));
  const [selectedTag, setSelectedTag] = useState<string | null>(null);
  const [tagInput, setTagInput] = useState('');
  const [noteTags, setNoteTags] = useState<string[]>([]);

  const { data: notes, isLoading } = useQuery({
    queryKey: ['notes'],
    queryFn: () => api.listNotes(),
    staleTime: 30_000
  });

  const { data: noteContent, isLoading: isLoadingContent } = useQuery({
    queryKey: ['note-content', selectedNote],
    queryFn: () => selectedNote ? api.getNote(selectedNote) : null,
    enabled: !!selectedNote
  });

  const { data: allTags } = useQuery({
    queryKey: ['note-tags'],
    queryFn: () => api.getNoteTags(),
    staleTime: 60_000
  });

  // Load content when note is selected
  const handleSelectNote = useCallback(async (path: string) => {
    setSelectedNote(path);
    setIsPreview(false);
    try {
      const data = await api.getNote(path);
      setEditContent(data.content);
      setNoteTags((data as any).tags || []);
    } catch {
      setEditContent('');
      setNoteTags([]);
    }
  }, []);

  const saveMutation = useMutation({
    mutationFn: ({ path, content }: { path: string; content: string }) => api.saveNote(path, content),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['notes'] });
      queryClient.invalidateQueries({ queryKey: ['note-content'] });
    }
  });

  const createMutation = useMutation({
    mutationFn: (folder: string) => api.createNote(folder),
    onSuccess: (data: any) => {
      queryClient.invalidateQueries({ queryKey: ['notes'] });
      setSelectedNote(data.path);
    }
  });

  const deleteMutation = useMutation({
    mutationFn: (path: string) => api.deleteNote(path),
    onSuccess: () => {
      setSelectedNote(null);
      setEditContent('');
      queryClient.invalidateQueries({ queryKey: ['notes'] });
    }
  });

  const extractMutation = useMutation({
    mutationFn: (path: string) => api.extractNote(path),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['notes'] });
    }
  });

  const updateTagsMutation = useMutation({
    mutationFn: ({ path, tags }: { path: string; tags: string[] }) => api.updateNoteTags(path, tags),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['notes'] });
      queryClient.invalidateQueries({ queryKey: ['note-tags'] });
    }
  });

  const folders = ['inbox', 'drafts', 'ready-for-review'];

  const toggleFolder = (folder: string) => {
    setExpandedFolders(prev => {
      const next = new Set(prev);
      if (next.has(folder)) next.delete(folder);
      else next.add(folder);
      return next;
    });
  };

  const handleSave = () => {
    if (selectedNote) {
      saveMutation.mutate({ path: selectedNote, content: editContent });
    }
  };

  const handleNewNote = (folder: string) => {
    createMutation.mutate(folder);
  };

  const handleDelete = () => {
    if (selectedNote && confirm(t('notes.confirmDelete'))) {
      deleteMutation.mutate(selectedNote);
    }
  };

  const handleExtract = () => {
    if (selectedNote) {
      extractMutation.mutate(selectedNote);
    }
  };

  const handleAddTag = () => {
    if (!selectedNote || !tagInput.trim()) return;
    const newTag = tagInput.trim();
    if (noteTags.includes(newTag)) {
      setTagInput('');
      return;
    }
    const newTags = [...noteTags, newTag];
    setNoteTags(newTags);
    updateTagsMutation.mutate({ path: selectedNote, tags: newTags });
    setTagInput('');
  };

  const handleRemoveTag = (tag: string) => {
    if (!selectedNote) return;
    const newTags = noteTags.filter(t => t !== tag);
    setNoteTags(newTags);
    updateTagsMutation.mutate({ path: selectedNote, tags: newTags });
  };

  const handleTagKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      handleAddTag();
    }
  };

  const notesByFolder = (folder: string) => {
    let items = (notes?.items || []).filter((n: NoteFile) => n.folder === folder);
    if (selectedTag) {
      items = items.filter((n: NoteFile) => (n.tags || []).includes(selectedTag));
    }
    return items;
  };

  return (
    <div className="flex h-[calc(100vh-4rem)] gap-0 animate-fade-in">
      {/* Left: Folder Tree */}
      <aside className="w-56 border-r border-slate-200 dark:border-slate-700 overflow-y-auto bg-slate-50 dark:bg-slate-800/50 p-3">
        <div className="flex items-center justify-between mb-3">
          <h2 className="flex items-center gap-2 text-sm font-semibold">
            <Notebook size={18} className="text-primary-500" />
            {t('notes.title', '笔记')}
          </h2>
        </div>
        {/* Tag Filter */}
        {allTags?.tags && allTags.tags.length > 0 && (
          <div className="mb-3">
            <div className="flex items-center gap-1 mb-1.5">
              <Tag size={12} className="text-slate-400" />
              <span className="text-[10px] font-medium text-slate-500 uppercase">{t('notes.tags', '标签')}</span>
              {selectedTag && (
                <button
                  onClick={() => setSelectedTag(null)}
                  className="ml-auto text-[10px] text-primary-500 hover:text-primary-700"
                >
                  {t('notes.clearFilter', '清除')}
                </button>
              )}
            </div>
            <div className="flex flex-wrap gap-1">
              {allTags.tags.map(tag => (
                <button
                  key={tag}
                  onClick={() => setSelectedTag(selectedTag === tag ? null : tag)}
                  className={`rounded px-1.5 py-0.5 text-[10px] transition-colors ${
                    selectedTag === tag
                      ? 'bg-primary-100 text-primary-700 dark:bg-primary-900/40 dark:text-primary-400'
                      : 'bg-slate-200 text-slate-600 hover:bg-slate-300 dark:bg-slate-700 dark:text-slate-400 dark:hover:bg-slate-600'
                  }`}
                >
                  {tag}
                </button>
              ))}
            </div>
          </div>
        )}
        {selectedTag && (
          <div className="mb-2 text-[10px] text-slate-500">
            {t('notes.filteringBy', '筛选')}: <span className="font-medium text-primary-600">{selectedTag}</span>
          </div>
        )}
        {folders.map(folder => (
          <div key={folder} className="mb-1">
            <button
              onClick={() => toggleFolder(folder)}
              className="flex w-full items-center gap-1.5 rounded px-1.5 py-1 text-xs font-medium text-slate-600 hover:bg-slate-200 dark:text-slate-400 dark:hover:bg-slate-700"
            >
              {expandedFolders.has(folder) ? <CaretDown size={12} /> : <CaretRight size={12} />}
              <Folder size={14} />
              <span className="flex-1 text-left">{t(`notes.folders.${folder}`, folder)}</span>
              <button
                onClick={(e) => { e.stopPropagation(); handleNewNote(folder); }}
                className="rounded p-0.5 hover:bg-slate-300 dark:hover:bg-slate-600"
                title={t('notes.newNote')}
              >
                <Plus size={12} />
              </button>
            </button>
            {expandedFolders.has(folder) && (
              <div className="ml-4 space-y-0.5">
                {notesByFolder(folder).map((note: NoteFile) => (
                  <button
                    key={note.path}
                    onClick={() => handleSelectNote(note.path)}
                    className={`flex w-full flex-col rounded px-1.5 py-1 text-xs transition-colors ${
                      selectedNote === note.path
                        ? 'bg-primary-50 text-primary-700 dark:bg-primary-900/30 dark:text-primary-400'
                        : 'text-slate-600 hover:bg-slate-100 dark:text-slate-400 dark:hover:bg-slate-700'
                    }`}
                  >
                    <div className="flex items-center gap-1.5 w-full">
                      <File size={12} />
                      <span className="flex-1 truncate text-left">{note.name}</span>
                    </div>
                    {note.tags && note.tags.length > 0 && (
                      <div className="flex flex-wrap gap-0.5 ml-[18px] mt-0.5">
                        {note.tags.map(tag => (
                          <span key={tag} className="rounded bg-slate-200 px-1 text-[9px] text-slate-500 dark:bg-slate-700 dark:text-slate-400">
                            {tag}
                          </span>
                        ))}
                      </div>
                    )}
                  </button>
                ))}
                {notesByFolder(folder).length === 0 && (
                  <p className="px-1.5 py-1 text-[10px] text-slate-400">{t('notes.empty')}</p>
                )}
              </div>
            )}
          </div>
        ))}
      </aside>

      {/* Center: Editor / Preview */}
      <main className="flex-1 flex flex-col min-w-0">
        {selectedNote ? (
          <>
            <div className="flex items-center justify-between border-b border-slate-200 dark:border-slate-700 px-4 py-2">
              <div className="flex items-center gap-2">
                <span className="text-sm font-medium truncate">{selectedNote}</span>
                <span className={`badge text-[10px] ${noteContent?.status === 'ready' ? 'badge-green' : 'badge-blue'}`}>
                  {noteContent?.status || 'draft'}
                </span>
              </div>
              <div className="flex items-center gap-1">
                <button
                  onClick={() => setIsPreview(!isPreview)}
                  className="btn btn-secondary text-xs py-1 px-2"
                >
                  {isPreview ? <Pencil size={14} /> : <Eye size={14} />}
                  <span className="ml-1">{isPreview ? t('notes.edit') : t('notes.preview')}</span>
                </button>
                <button onClick={handleSave} disabled={saveMutation.isPending} className="btn btn-primary text-xs py-1 px-2">
                  <FloppyDisk size={14} className="mr-1" />
                  {t('notes.save')}
                </button>
                <button onClick={handleExtract} disabled={extractMutation.isPending} className="btn btn-secondary text-xs py-1 px-2">
                  <PaperPlaneTilt size={14} className="mr-1" />
                  {t('notes.extract')}
                </button>
                <button
                  onClick={() => {
                    const slug = selectedNote.replace(/\.md$/, '').replace(/[^a-zA-Z0-9\u4e00-\u9fff_-]/g, '_');
                    navigate(`/wiki/${slug}`);
                  }}
                  className="btn btn-secondary text-xs py-1 px-2"
                  title={t('notes.convertToWiki', '转为 Wiki 条目')}
                >
                  <Article size={14} className="mr-1" />
                  转为 Wiki 条目
                </button>
                <button onClick={handleDelete} className="btn btn-secondary text-xs py-1 px-2 text-red-500">
                  <Trash size={14} />
                </button>
              </div>
            </div>
            <div className="flex-1 overflow-y-auto p-4">
              {isPreview ? (
                <div className="prose dark:prose-invert max-w-none">
                  <MarkdownRenderer content={editContent || noteContent?.content || ''} />
                </div>
              ) : (
                <MarkdownEditor value={editContent} onChange={setEditContent} />
              )}
            </div>
          </>
        ) : (
          <div className="flex flex-1 items-center justify-center text-slate-400">
            <div className="text-center">
              <Notebook size={48} className="mx-auto mb-3 opacity-30" />
              <p className="text-sm">{t('notes.selectHint', '选择或创建一篇笔记开始写作')}</p>
            </div>
          </div>
        )}
      </main>

      {/* Right: Metadata Panel */}
      {selectedNote && (
        <aside className="w-52 border-l border-slate-200 dark:border-slate-700 overflow-y-auto bg-slate-50 dark:bg-slate-800/50 p-3">
          <h3 className="text-xs font-semibold text-slate-500 dark:text-slate-400 mb-3">
            {t('notes.metadata', '元数据')}
          </h3>
          <div className="space-y-3">
            <div>
              <label className="text-[10px] text-slate-500">{t('notes.status', '状态')}</label>
              <select
                value={noteContent?.status || 'draft'}
                onChange={(e) => {
                  if (selectedNote) {
                    api.updateNoteStatus(selectedNote, e.target.value);
                  }
                }}
                className="input text-xs mt-1 w-full"
              >
                <option value="draft">{t('notes.statusDraft', '草稿')}</option>
                <option value="ready">{t('notes.statusReady', '待提取')}</option>
              </select>
            </div>
            <div>
              <label className="text-[10px] text-slate-500">{t('notes.path', '路径')}</label>
              <p className="text-xs font-mono text-slate-600 dark:text-slate-400 mt-1 break-all">{selectedNote}</p>
            </div>
            <div>
              <label className="text-[10px] text-slate-500">{t('notes.updatedAt', '更新时间')}</label>
              <p className="text-xs text-slate-600 dark:text-slate-400 mt-1">
                {noteContent?.updatedAt ? new Date(noteContent.updatedAt).toLocaleString('zh-CN') : '-'}
              </p>
            </div>
            <div>
              <label className="text-[10px] text-slate-500">{t('notes.tags', '标签')}</label>
              <div className="flex flex-wrap gap-1 mt-1">
                {noteTags.map(tag => (
                  <span key={tag} className="inline-flex items-center gap-0.5 rounded bg-primary-100 px-1.5 py-0.5 text-[10px] text-primary-700 dark:bg-primary-900/30 dark:text-primary-400">
                    {tag}
                    <button
                      onClick={() => handleRemoveTag(tag)}
                      className="ml-0.5 rounded-full hover:bg-primary-200 dark:hover:bg-primary-800/50"
                    >
                      <X size={10} />
                    </button>
                  </span>
                ))}
              </div>
              <div className="flex items-center gap-1 mt-1.5">
                <input
                  type="text"
                  value={tagInput}
                  onChange={(e) => setTagInput(e.target.value)}
                  onKeyDown={handleTagKeyDown}
                  placeholder={t('notes.addTag', '添加标签...')}
                  className="input text-xs py-1 px-1.5 w-full"
                />
                <button
                  onClick={handleAddTag}
                  disabled={!tagInput.trim()}
                  className="btn btn-primary text-[10px] py-1 px-2"
                >
                  <Plus size={12} />
                </button>
              </div>
            </div>
          </div>
        </aside>
      )}
    </div>
  );
}