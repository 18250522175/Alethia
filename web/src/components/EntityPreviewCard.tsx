import { useState, useEffect, useRef, useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import { useQuery } from '@tanstack/react-query';
import { ArrowRight, Pencil, Clock, Link, ChatsCircle, Spinner } from '@phosphor-icons/react';
import { api } from '../lib/api';

interface Position {
  x: number;
  y: number;
}

interface EntityPreview {
  title: string;
  summary: string;
  lastModified: string;
  quality?: string;
  type: string;
  aliases: string[];
  backlinkCount: number;
  hasOpenThreads: boolean;
}

interface EntityPreviewCardProps {
  slug: string;
  position: Position;
  onClose: () => void;
  onNavigate: (slug: string) => void;
  onOpenInSidebar: (slug: string) => void;
  onEditSummary: (slug: string, summary: string) => void;
}

const CARD_WIDTH = 360;
const CARD_HEIGHT = 320;
const ARROW_SIZE = 8;
const OFFSET = 12;

export default function EntityPreviewCard({
  slug,
  position,
  onClose,
  onNavigate,
  onOpenInSidebar,
  onEditSummary
}: EntityPreviewCardProps) {
  const { t } = useTranslation();
  const [isEditing, setIsEditing] = useState(false);
  const [editValue, setEditValue] = useState('');
  const [cardPosition, setCardPosition] = useState({ x: 0, y: 0 });
  const [arrowPosition, setArrowPosition] = useState({ x: 0, y: 0 });
  const [flipY, setFlipY] = useState(false);
  const cardRef = useRef<HTMLDivElement>(null);
  const closeTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const { data: preview, isLoading, error } = useQuery<EntityPreview>({
    queryKey: ['entity-preview', slug],
    queryFn: () => api.getEntityPreview(slug),
    staleTime: 30_000
  });

  useEffect(() => {
    const viewportWidth = window.innerWidth;
    const viewportHeight = window.innerHeight;

    let x = position.x + OFFSET;
    let y = position.y + OFFSET;
    let flip = false;

    if (x + CARD_WIDTH > viewportWidth) {
      x = position.x - CARD_WIDTH - OFFSET;
    }

    if (y + CARD_HEIGHT > viewportHeight) {
      y = position.y - CARD_HEIGHT - OFFSET;
      flip = true;
    }

    x = Math.max(8, Math.min(x, viewportWidth - CARD_WIDTH - 8));
    y = Math.max(8, Math.min(y, viewportHeight - CARD_HEIGHT - 8));

    const arrowX = Math.max(ARROW_SIZE, Math.min(position.x - x, CARD_WIDTH - ARROW_SIZE * 2));

    setCardPosition({ x, y });
    setArrowPosition({ x: arrowX, y: flip ? CARD_HEIGHT - ARROW_SIZE : ARROW_SIZE });
    setFlipY(flip);
  }, [position]);

  useEffect(() => {
    if (preview && isEditing) {
      setEditValue(preview.summary);
    }
  }, [preview, isEditing]);

  const handleMouseEnter = useCallback(() => {
    if (closeTimeoutRef.current) {
      clearTimeout(closeTimeoutRef.current);
      closeTimeoutRef.current = null;
    }
  }, []);

  const handleMouseLeave = useCallback(() => {
    closeTimeoutRef.current = setTimeout(() => {
      onClose();
    }, 150);
  }, [onClose]);

  const handleCardClick = useCallback((e: React.MouseEvent) => {
    e.stopPropagation();
    onNavigate(slug);
  }, [slug, onNavigate]);

  const handleOpenInSidebar = useCallback((e: React.MouseEvent) => {
    e.stopPropagation();
    onOpenInSidebar(slug);
  }, [slug, onOpenInSidebar]);

  const handleEditSummary = useCallback((e: React.MouseEvent) => {
    e.stopPropagation();
    setIsEditing(true);
  }, []);

  const handleSaveEdit = useCallback((e: React.KeyboardEvent) => {
    if (e.ctrlKey && e.key === 'Enter') {
      e.preventDefault();
      onEditSummary(slug, editValue);
      setIsEditing(false);
    }
  }, [slug, editValue, onEditSummary]);

  const handleCancelEdit = useCallback((e: React.MouseEvent) => {
    e.stopPropagation();
    setIsEditing(false);
  }, []);

  useEffect(() => {
    return () => {
      if (closeTimeoutRef.current) {
        clearTimeout(closeTimeoutRef.current);
      }
    };
  }, []);

  if (isLoading) {
    return (
      <div
        ref={cardRef}
        className="fixed z-50 flex items-center justify-center rounded-xl border border-slate-200 bg-white shadow-xl dark:border-slate-700 dark:bg-slate-800"
        style={{
          left: cardPosition.x,
          top: cardPosition.y,
          width: CARD_WIDTH,
          height: 100
        }}
        onMouseEnter={handleMouseEnter}
        onMouseLeave={handleMouseLeave}
      >
        <Spinner className="h-5 w-5 animate-spin text-parchment-500" />
      </div>
    );
  }

  if (error || !preview) {
    return null;
  }

  return (
    <div
      ref={cardRef}
      className="fixed z-50 overflow-hidden rounded-xl border border-slate-200 bg-white shadow-xl dark:border-slate-700 dark:bg-slate-800"
      style={{
        left: cardPosition.x,
        top: cardPosition.y,
        width: CARD_WIDTH,
        maxHeight: CARD_HEIGHT
      }}
      onMouseEnter={handleMouseEnter}
      onMouseLeave={handleMouseLeave}
    >
      <div
        className={`absolute w-4 h-4 border-r border-b border-slate-200 bg-white dark:border-slate-700 dark:bg-slate-800 transition-transform ${
          flipY ? 'rotate-135' : '-rotate-45'
        }`}
        style={{
          left: arrowPosition.x,
          top: arrowPosition.y,
          transformOrigin: 'center center'
        }}
      />

      <div className="flex flex-col max-h-[320px]" onClick={handleCardClick}>
        <div className="border-b border-slate-200 p-4 dark:border-slate-700">
          <div className="flex items-center justify-between gap-2">
            <h3 className="flex-1 truncate text-base font-semibold text-slate-900 dark:text-slate-100">
              {preview.title}
            </h3>
            <span className="shrink-0 rounded-full bg-parchment-100 px-2 py-0.5 text-xs font-medium text-parchment-700 dark:bg-parchment-900/40 dark:text-parchment-300">
              {preview.type}
            </span>
            {preview.quality && (
              <span className="shrink-0 rounded-full bg-green-100 px-2 py-0.5 text-xs font-medium text-green-700 dark:bg-green-900/40 dark:text-green-300">
                {preview.quality}
              </span>
            )}
          </div>

          {preview.aliases && preview.aliases.length > 0 && (
            <p className="mt-2 text-xs text-slate-500 dark:text-slate-400">
              {preview.aliases.join(', ')}
            </p>
          )}
        </div>

        <div className="flex-1 overflow-y-auto p-4">
          <div className="mb-3">
            {isEditing ? (
              <div className="flex flex-col gap-2">
                <textarea
                  value={editValue}
                  onChange={e => setEditValue(e.target.value)}
                  onKeyDown={handleSaveEdit}
                  className="w-full resize-none rounded-lg border border-slate-200 bg-slate-50 p-2 text-sm text-slate-800 outline-none focus:border-parchment-400 focus:ring-1 focus:ring-parchment-400 dark:border-slate-600 dark:bg-slate-700 dark:text-slate-200"
                  rows={4}
                  onClick={e => e.stopPropagation()}
                />
                <div className="flex justify-end gap-2">
                  <button
                    onClick={handleCancelEdit}
                    className="rounded-lg px-2 py-1 text-xs text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-700"
                  >
                    {t('common.cancel')}
                  </button>
                  <button
                    onClick={e => {
                      e.stopPropagation();
                      onEditSummary(slug, editValue);
                      setIsEditing(false);
                    }}
                    className="rounded-lg bg-parchment-500 px-2 py-1 text-xs font-medium text-white hover:bg-parchment-600"
                  >
                    {t('common.save')}
                  </button>
                </div>
                <p className="text-xs text-slate-400">{t('entityPreview.saveHint')}</p>
              </div>
            ) : (
              <p className="line-clamp-4 text-sm text-slate-600 leading-relaxed dark:text-slate-300">
                {preview.summary || t('entityPreview.noSummary')}
              </p>
            )}
          </div>

          <div className="flex flex-wrap gap-3 text-xs text-slate-500 dark:text-slate-400">
            <div className="flex items-center gap-1">
              <Clock size={12} />
              <span>{new Date(preview.lastModified).toLocaleDateString()}</span>
            </div>
            <div className="flex items-center gap-1">
              <Link size={12} />
              <span>{t('entityPreview.backlinkCount', { count: preview.backlinkCount })}</span>
            </div>
            {preview.hasOpenThreads && (
              <div className="flex items-center gap-1 text-amber-500">
                <ChatsCircle size={12} />
                <span>{t('entityPreview.hasOpenThreads')}</span>
              </div>
            )}
          </div>
        </div>

        <div className="border-t border-slate-200 p-3 dark:border-slate-700">
          <div className="flex gap-2">
            <button
              onClick={handleCardClick}
              className="flex flex-1 items-center justify-center gap-1 rounded-lg bg-parchment-500 px-3 py-2 text-xs font-medium text-white hover:bg-parchment-600 transition-colors"
            >
              <ArrowRight size={12} />
              <span>{t('entityPreview.clickToNavigate')}</span>
            </button>
            <button
              onClick={handleOpenInSidebar}
              className="flex items-center justify-center gap-1 rounded-lg border border-slate-200 px-3 py-2 text-xs font-medium text-slate-700 hover:bg-slate-50 dark:border-slate-600 dark:text-slate-300 dark:hover:bg-slate-700/50 transition-colors"
            >
              <ArrowRight size={12} />
              <span>{t('entityPreview.openInSidebar')}</span>
            </button>
            <button
              onClick={handleEditSummary}
              className="flex items-center justify-center gap-1 rounded-lg border border-slate-200 px-3 py-2 text-xs font-medium text-slate-700 hover:bg-slate-50 dark:border-slate-600 dark:text-slate-300 dark:hover:bg-slate-700/50 transition-colors"
            >
              <Pencil size={12} />
              <span>{t('entityPreview.editSummaryInline')}</span>
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}