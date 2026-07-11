import { useState, useCallback, useRef } from 'react';
import { useTranslation } from 'react-i18next';
import { useNavigate } from 'react-router-dom';
import { useQueryClient } from '@tanstack/react-query';
import { UploadSimple, File, Image, FilePdf, FileText, X, Check, Warning, CloudArrowUp, Brain } from '@phosphor-icons/react';
import api from '../lib/api';
import { useNotification } from '../contexts/NotificationContext';

interface UploadFile {
  id: string;
  file: File;
  progress: number;
  status: 'pending' | 'uploading' | 'done' | 'error';
  error?: string;
  sha256?: string;
  preview?: string;
}

const ALLOWED_TYPES = [
  'image/jpeg', 'image/png', 'image/webp', 'image/gif', 'image/svg+xml',
  'application/pdf',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'text/markdown', 'text/plain', 'application/json', 'text/x-markdown',
  'audio/mpeg', 'audio/wav', 'video/mp4'
];

export default function UploadPage() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { addNotification } = useNotification();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [isDragging, setIsDragging] = useState(false);
  const [files, setFiles] = useState<UploadFile[]>([]);
  const [uploadProgress, setUploadProgress] = useState(0);
  const [uploadStage, setUploadStage] = useState('');
  const [isUploading, setIsUploading] = useState(false);
  const [batchCompleted, setBatchCompleted] = useState(false);

  const calculateSHA256 = async (file: File): Promise<string> => {
    const arrayBuffer = await file.arrayBuffer();
    const hashBuffer = await crypto.subtle.digest('SHA-256', arrayBuffer);
    const hashArray = Array.from(new Uint8Array(hashBuffer));
    return hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
  };

  const getFileIcon = (file: File) => {
    if (file.type.startsWith('image/')) return Image;
    if (file.type === 'application/pdf') return FilePdf;
    if (file.type.startsWith('text/') || file.name.endsWith('.md') || file.name.endsWith('.json')) return FileText;
    return File;
  };

  const uploadFile = async (upload: UploadFile): Promise<void> => {
    setFiles(prev => prev.map(f => f.id === upload.id ? { ...f, status: 'uploading' as const, progress: 10 } : f));

    try {
      // Simulate upload progress: 0-20%
      const uploadInterval = setInterval(() => {
        setFiles(prev => prev.map(f =>
          f.id === upload.id && f.status === 'uploading' && f.progress < 20
            ? { ...f, progress: f.progress + 1 }
            : f
        ));
      }, 100);

      const sha256 = await calculateSHA256(upload.file);
      clearInterval(uploadInterval);
      setFiles(prev => prev.map(f => f.id === upload.id ? { ...f, sha256, progress: 30 } : f));

      // Simulate processing: 20-80%
      const processInterval = setInterval(() => {
        setFiles(prev => prev.map(f =>
          f.id === upload.id && f.status === 'uploading' && f.progress >= 30 && f.progress < 80
            ? { ...f, progress: f.progress + 2 }
            : f
        ));
      }, 150);

      await api.ingestFile(upload.file, sha256);
      clearInterval(processInterval);
      setFiles(prev => prev.map(f => f.id === upload.id ? { ...f, status: 'done' as const, progress: 100 } : f));
      addNotification({ type: 'system', title: t('upload.success', '上传成功'), description: upload.file.name });
    } catch (err: any) {
      setFiles(prev => prev.map(f => f.id === upload.id ? { ...f, status: 'error' as const, error: err.message } : f));
      addNotification({ type: 'system', title: t('upload.failed', '上传失败'), description: upload.file.name });
    }
  };

  const startUploadAll = async () => {
    const pending = files.filter(f => f.status === 'pending');
    if (pending.length === 0) return;

    setIsUploading(true);
    setUploadStage('批量上传中...');
    const total = pending.length;
    let completed = 0;

    const updateProgress = () => {
      completed++;
      setUploadProgress(Math.round((completed / total) * 100));
      setUploadStage(`正在上传 (${completed}/${total})...`);
    };

    const queue = [...pending];
    const active = new Set<Promise<void>>();

    const runNext = async () => {
      if (queue.length === 0) return;
      const file = queue.shift()!;
      const p = uploadFile(file).then(() => {
        active.delete(p);
        updateProgress();
      });
      active.add(p);
      await p;
      await runNext();
    };

    // Start initial batch of up to 2 concurrent uploads
    const workers = [];
    for (let i = 0; i < Math.min(2, queue.length); i++) {
      workers.push(runNext());
    }

    await Promise.all(workers);

    // All done
    setIsUploading(false);
    setUploadProgress(0);
    setUploadStage('');
    setBatchCompleted(true);
  };

  const addFiles = useCallback(async (newFiles: FileList | File[]) => {
    const fileArray = Array.from(newFiles);
    const newUploads: UploadFile[] = [];

    for (const file of fileArray) {
      if (!ALLOWED_TYPES.includes(file.type) && !file.name.match(/\.(md|txt|json|docx)$/i)) {
        addNotification({ type: 'system', title: t('upload.unsupportedType', '不支持的文件类型'), description: file.name });
        continue;
      }
      let preview: string | undefined;
      if (file.type.startsWith('image/')) {
        preview = URL.createObjectURL(file);
      }
      newUploads.push({
        id: `${Date.now()}-${Math.random().toString(36).slice(2)}`,
        file,
        progress: 0,
        status: 'pending',
        preview
      });
    }

    setFiles(prev => [...prev, ...newUploads]);
    setBatchCompleted(false);
  }, []);

  const removeFile = (id: string) => {
    setFiles(prev => {
      const file = prev.find(f => f.id === id);
      if (file?.preview) URL.revokeObjectURL(file.preview);
      return prev.filter(f => f.id !== id);
    });
  };

  const clearAll = () => {
    files.forEach(f => { if (f.preview) URL.revokeObjectURL(f.preview); });
    setFiles([]);
    setBatchCompleted(false);
  };

  const handleDragOver = (e: React.DragEvent) => { e.preventDefault(); setIsDragging(true); };
  const handleDragLeave = (e: React.DragEvent) => { e.preventDefault(); setIsDragging(false); };
  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
    if (e.dataTransfer.files.length > 0) {
      addFiles(e.dataTransfer.files);
    }
  };

  const doneCount = files.filter(f => f.status === 'done').length;
  const errorCount = files.filter(f => f.status === 'error').length;

  return (
    <div className="animate-fade-in space-y-6 max-w-4xl mx-auto">
      <header className="flex items-center justify-between">
        <div>
          <h1 className="flex items-center gap-2 text-2xl font-bold">
            <CloudArrowUp size={28} className="text-primary-500" />
            {t('upload.title', '文件上传')}
          </h1>
          <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
            {t('upload.subtitle', '拖拽文件到下方区域，或点击选择文件。支持图片、PDF、文档、Markdown 等格式。')}
          </p>
        </div>
        {files.length > 0 && (
          <div className="flex items-center gap-2">
            {files.some(f => f.status === 'pending') && (
              <button
                onClick={startUploadAll}
                disabled={isUploading}
                className="btn btn-primary text-sm"
              >
                {t('upload.uploadAll', '全部上传')} ({files.filter(f => f.status === 'pending').length})
              </button>
            )}
            <button
              onClick={clearAll}
              disabled={isUploading}
              className="btn btn-secondary text-sm"
            >
              {t('upload.clearQueue', '清空队列')}
            </button>
          </div>
        )}
      </header>

      {/* Global Upload Progress Bar */}
      {isUploading && (
        <div className="card p-4 space-y-2">
          <div className="flex items-center justify-between">
            <span className="text-sm font-medium text-slate-700 dark:text-slate-200">
              {uploadStage}
            </span>
            <span className="text-sm font-semibold text-primary-600 dark:text-primary-400">
              {uploadProgress}%
            </span>
          </div>
          <div className="h-2 w-full rounded-full bg-slate-200 dark:bg-slate-700 overflow-hidden">
            <div
              className="h-full rounded-full bg-primary-500 transition-all duration-500 ease-out"
              style={{ width: `${uploadProgress}%` }}
            />
          </div>
          <p className="text-xs text-slate-500 dark:text-slate-400">
            {uploadProgress < 20 ? '正在将文件传输到服务器...' :
             uploadProgress < 80 ? '服务器正在处理文件，提取知识...' :
             uploadProgress < 100 ? '正在完成上传...' :
             '处理完成'}
          </p>
        </div>
      )}

      {/* Drop Zone */}
      <div
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
        onDrop={handleDrop}
        onClick={() => fileInputRef.current?.click()}
        className={`relative flex flex-col items-center justify-center rounded-xl border-2 border-dashed p-12 transition-all cursor-pointer ${
          isDragging
            ? 'border-primary-500 bg-primary-50 dark:bg-primary-900/20 scale-[1.02]'
            : 'border-slate-300 dark:border-slate-600 hover:border-primary-400 hover:bg-slate-50 dark:hover:bg-slate-800/50'
        }`}
      >
        <UploadSimple size={48} className={`mb-4 ${isDragging ? 'text-primary-500' : 'text-slate-400'}`} />
        <p className="text-lg font-medium text-slate-600 dark:text-slate-300">
          {isDragging ? t('upload.dropHere', '松开以上传文件') : t('upload.dropZone', '拖拽文件到此处')}
        </p>
        <p className="mt-2 text-sm text-slate-400">
          {t('upload.orClick', '或点击选择文件')}
        </p>
        <p className="mt-3 text-xs text-slate-400">
          {t('upload.supportedFormats', '支持：JPG, PNG, WebP, GIF, SVG, PDF, DOCX, MD, TXT, JSON, MP3, WAV, MP4')}
        </p>
        <input
          ref={fileInputRef}
          type="file"
          multiple
          accept="image/*,application/pdf,.docx,.md,.txt,.json,audio/*,video/mp4"
          onChange={(e) => { if (e.target.files) addFiles(e.target.files); e.target.value = ''; }}
          className="hidden"
        />
      </div>

      {/* File List */}
      {files.length > 0 && (
        <div className="space-y-2">
          <div className="flex items-center justify-between text-sm text-slate-500">
            <span>{t('upload.fileCount', { count: files.length })}</span>
            <span className="flex gap-3">
              {files.some(f => f.status === 'pending') && <span className="text-slate-400">{t('upload.pendingCount', { count: files.filter(f => f.status === 'pending').length })}</span>}
              {doneCount > 0 && <span className="text-green-500">{t('upload.doneCount', { count: doneCount })}</span>}
              {errorCount > 0 && <span className="text-red-500">{t('upload.errorCount', { count: errorCount })}</span>}
            </span>
          </div>
          {files.map(upload => {
            const Icon = getFileIcon(upload.file);
            return (
              <div key={upload.id} className="card p-3 flex items-center gap-3">
                {/* Preview or Icon */}
                {upload.preview ? (
                  <img src={upload.preview} alt="" className="h-10 w-10 rounded object-cover" />
                ) : (
                  <div className="flex h-10 w-10 items-center justify-center rounded bg-slate-100 dark:bg-slate-700">
                    <Icon size={20} className="text-slate-500" />
                  </div>
                )}
                {/* File Info */}
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium truncate">{upload.file.name}</p>
                  <p className="text-xs text-slate-500">
                    {(upload.file.size / 1024).toFixed(1)} KB
                    {upload.status === 'uploading' && ` · ${upload.progress}%`}
                    {upload.status === 'error' && ` · ${upload.error}`}
                  </p>
                  {/* Progress Bar */}
                  {upload.status === 'uploading' && (
                    <div className="mt-1 h-1 w-full rounded-full bg-slate-200 dark:bg-slate-700">
                      <div className="h-full rounded-full bg-primary-500 transition-all duration-300" style={{ width: `${upload.progress}%` }} />
                    </div>
                  )}
                </div>
                {/* Status */}
                <div className="flex-shrink-0">
                  {upload.status === 'done' && <Check size={20} className="text-green-500" />}
                  {upload.status === 'error' && <Warning size={20} className="text-red-500" />}
                  {upload.status === 'uploading' && (
                    <div className="h-5 w-5 animate-spin rounded-full border-2 border-primary-500 border-t-transparent" />
                  )}
                </div>
                {/* Remove */}
                <button
                  onClick={() => removeFile(upload.id)}
                  disabled={upload.status === 'uploading'}
                  className="rounded px-2 py-1 text-xs text-slate-400 hover:text-red-500 hover:bg-red-50 dark:hover:bg-red-900/20 disabled:opacity-30 disabled:cursor-not-allowed"
                  title={t('upload.remove', '移除')}
                >
                  <X size={16} />
                </button>
              </div>
            );
          })}
        </div>
      )}

      {/* Batch Upload Summary */}
      {batchCompleted && files.length > 0 && !files.some(f => f.status === 'pending' || f.status === 'uploading') && (
        <div className="card p-4 space-y-2 border-l-4 border-l-primary-500">
          <p className="text-sm font-medium text-slate-700 dark:text-slate-200">
            {t('upload.batchComplete', '批量上传完成')}
          </p>
          <div className="flex gap-4 text-sm">
            <span className="flex items-center gap-1 text-green-600">
              <Check size={16} />
              {t('upload.successCount', { count: doneCount })}
            </span>
            {errorCount > 0 && (
              <span className="flex items-center gap-1 text-red-500">
                <Warning size={16} />
                {t('upload.failedCount', { count: errorCount })}
              </span>
            )}
          </div>
        </div>
      )}

      {/* Quick Link to Observed Files */}
      {doneCount > 0 && (
        <div className="flex flex-wrap items-center justify-center gap-3">
          <button onClick={() => navigate('/observed-files')} className="btn btn-primary">
            {t('upload.viewObserved', '查看已上传文件')}
          </button>
          <button onClick={() => navigate('/cognitive-map')} className="btn btn-secondary text-sm flex items-center gap-1.5">
            <Brain size={16} />
            {t('upload.viewCognitiveMap', '查看关联图谱')}
          </button>
        </div>
      )}
    </div>
  );
}