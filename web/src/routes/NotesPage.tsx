import { useState, useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Notebook, Plus, Folder, File, FloppyDisk, Trash, PaperPlaneTilt, CaretDown, CaretRight, Eye, Pencil } from '@phosphor-icons/react';
import api from '../lib/api';
import MarkdownEditor from '../components/MarkdownEditor';
import MarkdownRenderer from '../components/MarkdownRenderer';

interface NoteFile {
  path: string;
  name: string;
  folder: string;
  status: 'draft' | 'ready' | 'archived';
  updatedAt: string;
}

export default function NotesPage() {
  const { t } = useTranslation();
  const queryClient = useQueryClient();
  const [selectedNote, setSelectedNote] = useState<string | null>(null);
  const [editContent, setEditContent] = useState('');
  const [isPreview, setIsPreview] = useState(false);
  const [expandedFolders, setExpandedFolders] = useState<Set<string>>(new Set(['inbox', 'drafts', 'ready-for-review']));

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

  // Load content when note is selected
  const handleSelectNote = useCallback(async (path: string) => {
    setSelectedNote(path);
    setIsPreview(false);
    try {
      const data = await api.getNote(path);
      setEditContent(data.content);
    } catch {
      setEditContent('');
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

  const notesByFolder = (folder: string) => {
    return (notes?.items || []).filter((n: NoteFile) => n.folder === folder);
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
                    className={`flex w-full items-center gap-1.5 rounded px-1.5 py-1 text-xs transition-colors ${
                      selectedNote === note.path
                        ? 'bg-primary-50 text-primary-700 dark:bg-primary-900/30 dark:text-primary-400'
                        : 'text-slate-600 hover:bg-slate-100 dark:text-slate-400 dark:hover:bg-slate-700'
                    }`}
                  >
                    <File size={12} />
                    <span className="flex-1 truncate text-left">{note.name}</span>
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
          </div>
        </aside>
      )}
    </div>
  );
}