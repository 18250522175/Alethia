import { useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useSearchParams, Link as RouterLink } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import {
  FileText,
  ArrowLeft,
  Spinner,
  Warning,
  Hash,
  Clock,
  File as FileIcon,
  FilmSlate,
  SpeakerHigh,
  Image as ImageIcon,
  Download,
  PlayCircle,
  Code,
  ListBullets
} from '@phosphor-icons/react';
import api from '../lib/api';

interface LibraryFile {
  hash: string;
  mime: string;
  originalName: string;
  size: number;
  status: string;
  ingestedAt: string;
}

interface EvidenceSpanItem {
  spanId: string;
  originalLocation: string;
  spanText: string;
  sourceType: string;
}

const TIMECODE_REGEX = /(\d{1,2}):(\d{2})(?::(\d{2}))?/g;

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

function formatDateTime(ts: string): string {
  try {
    return new Date(ts).toLocaleString('zh-CN', {
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit'
    });
  } catch {
    return ts;
  }
}

function parseTimecodeToSeconds(text: string): number | null {
  const match = text.match(/(\d{1,2}):(\d{2})(?::(\d{2}))?/);
  if (!match) return null;
  if (match[3] !== undefined) {
    return parseInt(match[1], 10) * 3600 + parseInt(match[2], 10) * 60 + parseInt(match[3], 10);
  }
  return parseInt(match[1], 10) * 60 + parseInt(match[2], 10);
}

function formatTimecode(seconds: number): string {
  if (!Number.isFinite(seconds) || seconds < 0) return '00:00';
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = Math.floor(seconds % 60);
  const mm = String(m).padStart(2, '0');
  const ss = String(s).padStart(2, '0');
  return h > 0 ? `${String(h).padStart(2, '0')}:${mm}:${ss}` : `${mm}:${ss}`;
}

function detectCategory(mime: string): 'pdf' | 'audio' | 'video' | 'image' | 'text' | 'other' {
  const m = (mime || '').toLowerCase();
  if (m === 'application/pdf' || m.endsWith('+pdf')) return 'pdf';
  if (m.startsWith('audio/')) return 'audio';
  if (m.startsWith('video/')) return 'video';
  if (m.startsWith('image/')) return 'image';
  if (
    m.startsWith('text/') ||
    m === 'application/json' ||
    m === 'application/javascript' ||
    m === 'application/xml' ||
    m === 'application/x-yaml' ||
    m === 'application/x-sh'
  ) {
    return 'text';
  }
  return 'other';
}

export default function LibraryFilePage() {
  const { t } = useTranslation();
  const [searchParams] = useSearchParams();
  const hash = (searchParams.get('hash') || '').trim();
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const [currentTime, setCurrentTime] = useState(0);

  const fileQuery = useQuery({
    queryKey: ['library-file', hash],
    queryFn: () => api.getLibraryFile(hash),
    enabled: !!hash,
    staleTime: 60_000
  });

  const file = fileQuery.data?.file;
  const evidenceSpans = fileQuery.data?.evidenceSpans ?? [];
  const contentUrl = fileQuery.data?.contentUrl ?? '';

  // Extract timecodes from evidence spans
  const timecodes = useMemo(() => {
    const out: Array<{ seconds: number; label: string; spanText: string; spanId: string }> = [];
    for (const span of evidenceSpans) {
      const sources = [span.originalLocation, span.spanText];
      for (const src of sources) {
        if (!src) continue;
        TIMECODE_REGEX.lastIndex = 0;
        const matches = [...src.matchAll(TIMECODE_REGEX)];
        for (const m of matches) {
          const tc = m[0];
          const sec = parseTimecodeToSeconds(tc);
          if (sec !== null && !out.some(o => o.seconds === sec)) {
            out.push({
              seconds: sec,
              label: tc,
              spanText: span.spanText,
              spanId: span.spanId
            });
          }
        }
      }
    }
    return out.sort((a, b) => a.seconds - b.seconds);
  }, [evidenceSpans]);

  const category = file ? detectCategory(file.mime) : 'other';

  const handleJumpTo = (seconds: number) => {
    const media = audioRef.current ?? videoRef.current;
    if (!media) return;
    media.currentTime = seconds;
    void media.play().catch(() => undefined);
  };

  if (!hash) {
    return (
      <div className="card flex flex-col items-center justify-center py-16 text-center animate-fade-in">
        <Warning size={48} className="mb-3 text-yellow-400" />
        <p className="text-slate-700 dark:text-slate-200">缺少文件 hash 参数</p>
        <p className="mt-1 text-xs text-slate-400">请在 URL 中提供 ?hash=&lt;file_hash&gt;</p>
        <RouterLink to="/" className="btn btn-secondary mt-4">
          <ArrowLeft size={14} className="mr-1" />
          返回首页
        </RouterLink>
      </div>
    );
  }

  if (fileQuery.isLoading) {
    return (
      <div className="flex items-center justify-center py-20 text-slate-500 dark:text-slate-400">
        <Spinner size={24} className="mr-2 animate-spin" />
        {t('common.loading')}
      </div>
    );
  }

  if (fileQuery.isError || !file) {
    return (
      <div className="card flex flex-col items-center justify-center py-16 text-center animate-fade-in">
        <Warning size={48} className="mb-3 text-red-400" />
        <p className="text-slate-700 dark:text-slate-200">无法加载文件信息</p>
        <p className="mt-1 font-mono text-xs text-slate-500 dark:text-slate-400">{hash}</p>
        <p className="mt-1 text-xs text-slate-400">请检查后端 /api/library-files/:hash 路由是否已实现</p>
        <RouterLink to="/" className="btn btn-secondary mt-4">
          <ArrowLeft size={14} className="mr-1" />
          {t('common.back', '返回')}
        </RouterLink>
      </div>
    );
  }

  return (
    <div className="space-y-5 animate-fade-in">
      <nav className="flex items-center gap-2 text-sm text-slate-500 dark:text-slate-400">
        <RouterLink to="/" className="hover:text-primary-600 dark:hover:text-primary-400">
          {t('nav.home', '首页')}
        </RouterLink>
        <span className="text-slate-300 dark:text-slate-600">/</span>
        <span className="font-mono text-slate-700 dark:text-slate-200">{file.hash}</span>
      </nav>

      <FileMetaHeader file={file} category={category} contentUrl={contentUrl} />

      <div className="grid grid-cols-1 gap-5 lg:grid-cols-[1fr_320px]">
        <section className="card p-5">
          <div className="mb-3 flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-slate-400">
            <FileText size={12} />
            文件预览
          </div>
          <FilePreview
            category={category}
            file={file}
            contentUrl={contentUrl}
            audioRef={audioRef}
            videoRef={videoRef}
            onTimeUpdate={setCurrentTime}
          />
        </section>

        <aside className="space-y-4">
          <section className="card p-4">
            <div className="mb-3 flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-slate-400">
              <FileIcon size={12} />
              文件元信息
            </div>
            <dl className="space-y-2 text-xs">
              <MetaRow label="文件名" value={file.originalName} mono />
              <MetaRow label="MIME 类型" value={file.mime} mono badge={category} />
              <MetaRow label="大小" value={formatFileSize(file.size)} />
              <MetaRow
                label="状态"
                value={file.status}
                badge={statusBadgeClass(file.status)}
              />
              <MetaRow
                label="上传时间"
                value={formatDateTime(file.ingestedAt)}
              />
              <MetaRow label="哈希" value={file.hash} mono />
            </dl>
          </section>

          {timecodes.length > 0 && (
            <section className="card p-4">
              <div className="mb-3 flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-slate-400">
                <ListBullets size={12} />
                时间码跳转
              </div>
              <ul className="space-y-1.5">
                {timecodes.map(tc => (
                  <li key={tc.spanId + tc.label}>
                    <button
                      type="button"
                      onClick={() => handleJumpTo(tc.seconds)}
                      disabled={category !== 'audio' && category !== 'video'}
                      className="flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-xs transition-colors hover:bg-slate-100 dark:hover:bg-slate-700/60 disabled:cursor-not-allowed disabled:opacity-50"
                    >
                      <PlayCircle size={14} className="flex-shrink-0 text-primary-500" />
                      <span className="font-mono font-semibold text-primary-600 dark:text-primary-400">
                        {tc.label}
                      </span>
                      <span className="min-w-0 flex-1 truncate text-slate-500 dark:text-slate-400">
                        {tc.spanText}
                      </span>
                    </button>
                  </li>
                ))}
              </ul>
              {(category === 'audio' || category === 'video') && (
                <div className="mt-2 border-t border-slate-200 pt-2 text-[11px] text-slate-500 dark:border-slate-700 dark:text-slate-400">
                  当前时间：<span className="font-mono font-medium">{formatTimecode(currentTime)}</span>
                </div>
              )}
            </section>
          )}

          {evidenceSpans.length > 0 && timecodes.length === 0 && (
            <section className="card p-4">
              <div className="mb-3 flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-slate-400">
                <FileText size={12} />
                证据片段（{evidenceSpans.length}）
              </div>
              <ul className="space-y-2">
                {evidenceSpans.slice(0, 12).map(span => (
                  <li
                    key={span.spanId}
                    className="rounded-md bg-slate-50 px-2 py-1.5 text-xs dark:bg-slate-700/40"
                  >
                    <div className="mb-0.5 flex items-center justify-between gap-2">
                      <span className="font-mono text-[10px] text-slate-500 dark:text-slate-400">
                        {span.sourceType}
                      </span>
                      <span
                        className="font-mono text-[10px] text-slate-400"
                        title={span.originalLocation}
                      >
                        {span.originalLocation}
                      </span>
                    </div>
                    <p className="line-clamp-2 text-slate-700 dark:text-slate-200">
                      {span.spanText}
                    </p>
                  </li>
                ))}
                {evidenceSpans.length > 12 && (
                  <li className="text-center text-[11px] text-slate-400">
                    + 其余 {evidenceSpans.length - 12} 条
                  </li>
                )}
              </ul>
            </section>
          )}
        </aside>
      </div>
    </div>
  );
}

function FileMetaHeader({
  file,
  category,
  contentUrl
}: {
  file: LibraryFile;
  category: ReturnType<typeof detectCategory>;
  contentUrl: string;
}) {
  const { Icon, label, color } = categoryIcon(category);
  return (
    <header className="card overflow-hidden p-0">
      <div className={`border-l-4 ${color === 'primary' ? 'border-primary-500' : 'border-slate-400'} p-5`}>
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div className="min-w-0 flex-1">
            <h1 className="flex items-center gap-2 text-xl font-bold text-slate-900 dark:text-slate-100">
              <Icon size={24} className="flex-shrink-0 text-primary-500" />
              <span className="truncate">{file.originalName}</span>
            </h1>
            <div className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-slate-500 dark:text-slate-400">
              <span className="badge badge-blue">{label}</span>
              <span className="inline-flex items-center gap-1 font-mono">
                <Hash size={11} />
                {file.hash}
              </span>
              <span className="inline-flex items-center gap-1">
                <Clock size={11} />
                {formatDateTime(file.ingestedAt)}
              </span>
              <span>{formatFileSize(file.size)}</span>
            </div>
          </div>
          {contentUrl && (
            <a
              href={contentUrl}
              download={file.originalName}
              className="btn btn-secondary text-sm"
            >
              <Download size={14} className="mr-1" />
              下载
            </a>
          )}
        </div>
      </div>
    </header>
  );
}

function categoryIcon(category: ReturnType<typeof detectCategory>): {
  Icon: typeof FileIcon;
  label: string;
  color: 'primary' | 'muted';
} {
  switch (category) {
    case 'pdf':
      return { Icon: FileText, label: 'PDF', color: 'primary' };
    case 'audio':
      return { Icon: SpeakerHigh, label: '音频', color: 'primary' };
    case 'video':
      return { Icon: FilmSlate, label: '视频', color: 'primary' };
    case 'image':
      return { Icon: ImageIcon, label: '图片', color: 'primary' };
    case 'text':
      return { Icon: Code, label: '文本', color: 'primary' };
    default:
      return { Icon: FileIcon, label: '文件', color: 'muted' };
  }
}

function statusBadgeClass(status: string): string {
  const s = (status || '').toLowerCase();
  if (s === 'ready' || s === 'processed' || s === 'active') return 'badge-green';
  if (s === 'pending' || s === 'processing' || s === 'queued') return 'badge-yellow';
  if (s === 'failed' || s === 'error' || s === 'rejected') return 'badge-red';
  return 'badge-blue';
}

function MetaRow({
  label,
  value,
  mono,
  badge
}: {
  label: string;
  value: string;
  mono?: boolean;
  badge?: string;
}) {
  return (
    <div className="flex items-start justify-between gap-3">
      <dt className="flex-shrink-0 text-slate-500 dark:text-slate-400">{label}</dt>
      <dd className="min-w-0 flex flex-wrap items-center gap-1 text-right">
        {badge && (
          <span className={`badge ${badge} text-[10px]`}>{badge}</span>
        )}
        <span
          className={`break-all text-slate-700 dark:text-slate-200 ${mono ? 'font-mono text-[11px]' : ''}`}
        >
          {value || '—'}
        </span>
      </dd>
    </div>
  );
}

function FilePreview({
  category,
  file,
  contentUrl,
  audioRef,
  videoRef,
  onTimeUpdate
}: {
  category: ReturnType<typeof detectCategory>;
  file: LibraryFile;
  contentUrl: string;
  audioRef: React.MutableRefObject<HTMLAudioElement | null>;
  videoRef: React.MutableRefObject<HTMLVideoElement | null>;
  onTimeUpdate: (t: number) => void;
}) {
  if (!contentUrl) {
    return (
      <div className="flex h-48 items-center justify-center text-sm text-slate-400">
        暂无可预览的内容 URL
      </div>
    );
  }

  if (category === 'pdf') {
    return (
      <iframe
        title={file.originalName}
        src={contentUrl}
        className="h-[70vh] w-full rounded-lg border border-slate-200 dark:border-slate-700"
      />
    );
  }

  if (category === 'audio') {
    return (
      <div className="space-y-3">
        <audio
          ref={audioRef}
          src={contentUrl}
          controls
          onTimeUpdate={e => onTimeUpdate((e.target as HTMLAudioElement).currentTime)}
          className="w-full"
        >
          您的浏览器不支持音频播放。
        </audio>
      </div>
    );
  }

  if (category === 'video') {
    return (
      <video
        ref={videoRef}
        src={contentUrl}
        controls
        onTimeUpdate={e => onTimeUpdate((e.target as HTMLVideoElement).currentTime)}
        className="max-h-[70vh] w-full rounded-lg bg-black"
      >
        您的浏览器不支持视频播放。
      </video>
    );
  }

  if (category === 'image') {
    return (
      <img
        src={contentUrl}
        alt={file.originalName}
        className="max-h-[70vh] w-full rounded-lg object-contain bg-slate-50 dark:bg-slate-900/50"
      />
    );
  }

  if (category === 'text') {
    return (
      <TextPreview contentUrl={contentUrl} mime={file.mime} />
    );
  }

  return (
    <div className="flex flex-col items-center justify-center gap-3 py-12 text-center text-slate-500 dark:text-slate-400">
      <FileIcon size={48} className="text-slate-300 dark:text-slate-600" />
      <p className="text-sm">该文件类型（{file.mime || '未知'}）暂不支持在线预览</p>
      <a href={contentUrl} download={file.originalName} className="btn btn-secondary text-sm">
        <Download size={14} className="mr-1" />
        下载文件查看
      </a>
    </div>
  );
}

function TextPreview({ contentUrl, mime }: { contentUrl: string; mime: string }) {
  const { t } = useTranslation();
  const textQuery = useQuery({
    queryKey: ['library-file-text', contentUrl],
    queryFn: async () => {
      const res = await fetch(contentUrl);
      return await res.text();
    },
    enabled: !!contentUrl,
    staleTime: 60_000
  });

  if (textQuery.isLoading) {
    return (
      <div className="flex items-center justify-center py-12 text-sm text-slate-500">
        <Spinner size={20} className="mr-2 animate-spin" />
        {t('common.loading')}
      </div>
    );
  }

  if (textQuery.isError || typeof textQuery.data !== 'string') {
    return (
      <div className="flex flex-col items-center justify-center gap-2 py-12 text-center text-slate-500">
        <Warning size={32} className="text-red-400" />
        <p className="text-sm">无法加载文本内容</p>
        <a href={contentUrl} download className="btn btn-secondary text-xs">
          <Download size={12} className="mr-1" />
          下载查看
        </a>
      </div>
    );
  }

  const lang = mimeToCodeLang(mime);
  return (
    <pre className="max-h-[70vh] overflow-auto rounded-lg bg-slate-900 p-4 font-mono text-xs leading-6 text-slate-100">
      <code>{textQuery.data}</code>
      {lang && <span className="hidden">{lang}</span>}
    </pre>
  );
}

function mimeToCodeLang(mime: string): string {
  const m = (mime || '').toLowerCase();
  if (m === 'application/json') return 'json';
  if (m === 'application/javascript' || m === 'text/javascript') return 'javascript';
  if (m === 'text/markdown') return 'markdown';
  if (m === 'application/xml' || m === 'text/xml') return 'xml';
  if (m === 'application/x-yaml' || m === 'text/yaml') return 'yaml';
  if (m === 'application/x-sh') return 'bash';
  if (m === 'text/html') return 'html';
  if (m === 'text/css') return 'css';
  return 'text';
}
