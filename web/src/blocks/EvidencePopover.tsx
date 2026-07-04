import { useState, useRef, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import {
  PushPin,
  Copy,
  Check,
  ArrowSquareOut,
  Translate,
  FileText,
  MapPin,
  Globe,
  Gauge,
  X
} from '@phosphor-icons/react';
import type { EvidenceSpan } from '../../../shared/types/evidence';
import type { EvidenceTranslation } from '../../../shared/types/entities';

interface EvidencePopoverProps {
  evidence: EvidenceSpan;
  translation?: EvidenceTranslation;
  children: React.ReactNode;
  onNavigate?: (fileHash: string) => void;
}

type Placement = 'top' | 'bottom';

function buildLibraryLink(e: EvidenceSpan): string {
  return `library://${e.source_file_hash}?offset=${e.source_text_offset}&length=${e.source_text_length}`;
}

function isNonChinese(lang: string): boolean {
  return !!lang && lang !== 'zh-CN' && lang !== 'zh';
}

export default function EvidencePopover({
  evidence,
  translation,
  children,
  onNavigate
}: EvidencePopoverProps) {
  const { t } = useTranslation();
  const triggerRef = useRef<HTMLSpanElement>(null);
  const popoverRef = useRef<HTMLDivElement>(null);
  const [isOpen, setIsOpen] = useState(false);
  const [isPinned, setIsPinned] = useState(false);
  const [placement, setPlacement] = useState<Placement>('top');
  const [copied, setCopied] = useState(false);

  const computePlacement = () => {
    if (!triggerRef.current) return;
    const rect = triggerRef.current.getBoundingClientRect();
    const EST_HEIGHT = 320;
    setPlacement(rect.top >= EST_HEIGHT ? 'top' : 'bottom');
  };

  const open = () => {
    if (!isOpen) {
      computePlacement();
      setIsOpen(true);
    }
  };

  const togglePin = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (!isOpen) {
      computePlacement();
      setIsOpen(true);
    }
    setIsPinned(prev => !prev);
  };

  const handleCopy = async (e: React.MouseEvent) => {
    e.stopPropagation();
    const link = buildLibraryLink(evidence);
    try {
      await navigator.clipboard.writeText(link);
    } catch {
      const ta = document.createElement('textarea');
      ta.value = link;
      ta.style.position = 'fixed';
      ta.style.opacity = '0';
      document.body.appendChild(ta);
      ta.select();
      try {
        document.execCommand('copy');
      } catch {
        /* noop */
      }
      document.body.removeChild(ta);
    }
    setCopied(true);
    window.setTimeout(() => setCopied(false), 1500);
  };

  const handleNavigate = (e: React.MouseEvent) => {
    e.stopPropagation();
    onNavigate?.(evidence.source_file_hash);
  };

  const handleClose = (e: React.MouseEvent) => {
    e.stopPropagation();
    setIsOpen(false);
  };

  // Close on outside click (only when not pinned) & Escape (always).
  useEffect(() => {
    if (!isOpen) return;
    const handleOutside = (e: MouseEvent) => {
      if (isPinned) return;
      const target = e.target as Node;
      if (triggerRef.current?.contains(target)) return;
      if (popoverRef.current?.contains(target)) return;
      setIsOpen(false);
    };
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setIsPinned(false);
        setIsOpen(false);
      }
    };
    document.addEventListener('mousedown', handleOutside);
    document.addEventListener('keydown', handleKey);
    return () => {
      document.removeEventListener('mousedown', handleOutside);
      document.removeEventListener('keydown', handleKey);
    };
  }, [isOpen, isPinned]);

  const showTranslation = isNonChinese(evidence.lang) && !!translation;
  const confidence = evidence.confidence;
  const confBadgeClass =
    confidence === undefined
      ? ''
      : confidence >= 0.75
        ? 'badge-green'
        : confidence >= 0.5
          ? 'badge-yellow'
          : 'badge-red';
  const shortHash =
    evidence.source_file_hash.length > 12
      ? `${evidence.source_file_hash.slice(0, 10)}…`
      : evidence.source_file_hash;
  const libraryLink = buildLibraryLink(evidence);

  return (
    <span
      ref={triggerRef}
      className="relative inline-block"
      onMouseEnter={() => !isPinned && open()}
      onMouseLeave={() => !isPinned && setIsOpen(false)}
    >
      {children}
      {isOpen && (
        <div
          ref={popoverRef}
          role="dialog"
          aria-label={t('evidence.title', '证据来源')}
          className={`absolute left-1/2 z-50 -translate-x-1/2 ${
            placement === 'top' ? 'bottom-full pb-2' : 'top-full pt-2'
          } w-80`}
        >
          <div className="card relative animate-fade-in p-3 shadow-xl">
            {/* arrow pointing at the trigger */}
            <span
              className={`absolute left-1/2 h-3 w-3 -translate-x-1/2 rotate-45 border bg-white dark:bg-slate-800 ${
                placement === 'top'
                  ? '-bottom-[6px] border-b border-r border-slate-200 dark:border-slate-700'
                  : '-top-[6px] border-t border-l border-slate-200 dark:border-slate-700'
              }`}
            />

            {/* header: source file hash + actions */}
            <div className="mb-2 flex items-center justify-between gap-2">
              <div className="flex min-w-0 items-center gap-1.5 text-xs font-semibold text-slate-700 dark:text-slate-200">
                <FileText size={14} className="flex-shrink-0 text-primary-500" />
                <span className="truncate font-mono" title={evidence.source_file_hash}>
                  {shortHash}
                </span>
              </div>
              <div className="flex flex-shrink-0 items-center gap-0.5">
                <button
                  type="button"
                  onClick={togglePin}
                  className={`rounded p-1 transition-colors hover:bg-slate-100 dark:hover:bg-slate-700 ${
                    isPinned
                      ? 'text-primary-500 hover:text-primary-600'
                      : 'text-slate-400 hover:text-slate-600 dark:hover:text-slate-200'
                  }`}
                  title={isPinned ? t('evidence.unpin', '取消钉住') : t('evidence.pin', '钉住')}
                  aria-label={isPinned ? t('evidence.unpin', '取消钉住') : t('evidence.pin', '钉住')}
                  aria-pressed={isPinned}
                >
                  <PushPin size={14} weight={isPinned ? 'fill' : 'regular'} />
                </button>
                <button
                  type="button"
                  onClick={handleClose}
                  className="rounded p-1 text-slate-400 transition-colors hover:bg-slate-100 hover:text-slate-600 dark:hover:bg-slate-700 dark:hover:text-slate-200"
                  title={t('common.close', '关闭')}
                  aria-label={t('common.close', '关闭')}
                >
                  <X size={14} />
                </button>
              </div>
            </div>

            {/* original text */}
            <div className="mb-2">
              <div className="mb-1 flex items-center gap-1 text-[10px] font-semibold uppercase tracking-wide text-slate-400">
                {showTranslation ? (
                  <>
                    <Translate size={11} />
                    {t('evidence.original', '原文')} · {evidence.lang}
                  </>
                ) : (
                  <>
                    <FileText size={11} />
                    {t('evidence.original', '原文')}
                  </>
                )}
              </div>
              <blockquote className="max-h-40 overflow-y-auto rounded-md border-l-2 border-primary-300 bg-slate-50 p-2 text-sm leading-relaxed text-slate-700 dark:border-primary-700 dark:bg-slate-900/50 dark:text-slate-200">
                {evidence.span_text}
              </blockquote>
            </div>

            {/* translation (only when source is non-Chinese and a translation exists) */}
            {showTranslation && (
              <div className="mb-2">
                <div className="mb-1 flex items-center gap-1 text-[10px] font-semibold uppercase tracking-wide text-slate-400">
                  <Translate size={11} />
                  {t('evidence.translation', '译文')} · {translation!.lang}
                </div>
                <blockquote className="max-h-40 overflow-y-auto rounded-md border-l-2 border-knowledge-300 bg-knowledge-50 p-2 text-sm leading-relaxed text-slate-700 dark:border-knowledge-700 dark:bg-knowledge-900/20 dark:text-slate-200">
                  {translation!.translatedText}
                </blockquote>
              </div>
            )}

            {/* meta badges: source type / location / lang / confidence */}
            <div className="mb-2 flex flex-wrap items-center gap-1.5">
              {evidence.source_type && (
                <span className="badge badge-blue">{evidence.source_type.toUpperCase()}</span>
              )}
              {evidence.original_location && (
                <span className="badge badge-yellow">
                  <MapPin size={10} className="mr-1" />
                  {evidence.original_location}
                </span>
              )}
              <span className="badge badge-green">
                <Globe size={10} className="mr-1" />
                {evidence.lang}
              </span>
              {confidence !== undefined && (
                <span className={`badge ${confBadgeClass}`}>
                  <Gauge size={10} className="mr-1" />
                  {t('evidence.confidence', '置信度')} {Math.round(confidence * 100)}%
                </span>
              )}
            </div>

            {/* actions */}
            <div className="flex items-center gap-1.5 border-t border-slate-200 pt-2 dark:border-slate-700">
              <button
                type="button"
                onClick={handleCopy}
                className="btn btn-secondary flex-1 px-2 py-1 text-xs"
                title={libraryLink}
              >
                {copied ? (
                  <>
                    <Check size={12} className="mr-1 text-green-500" />
                    {t('evidence.copied', '已复制')}
                  </>
                ) : (
                  <>
                    <Copy size={12} className="mr-1" />
                    {t('evidence.copyLink', '复制链接')}
                  </>
                )}
              </button>
              {onNavigate && (
                <button
                  type="button"
                  onClick={handleNavigate}
                  className="btn btn-ghost flex-1 px-2 py-1 text-xs"
                >
                  <ArrowSquareOut size={12} className="mr-1" />
                  {t('evidence.navigate', '跳转原文')}
                </button>
              )}
            </div>
          </div>
        </div>
      )}
    </span>
  );
}
