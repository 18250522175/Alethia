import { useTranslation } from 'react-i18next';
import { Clock, PencilSimple, Plus, Trash, GitBranch } from '@phosphor-icons/react';

interface TimelineEvent {
  id: string;
  type: 'create' | 'edit' | 'delete' | 'review' | 'extract';
  title: string;
  description?: string;
  timestamp: string;
  version?: string;
  author?: string;
}

interface EntryTimelineProps {
  events: TimelineEvent[];
  onEventClick?: (event: TimelineEvent) => void;
}

function getTypeIcon(type: string) {
  switch (type) {
    case 'create':
      return <Plus size={14} />;
    case 'edit':
      return <PencilSimple size={14} />;
    case 'delete':
      return <Trash size={14} />;
    case 'review':
      return <GitBranch size={14} />;
    case 'extract':
      return <Clock size={14} />;
    default:
      return <Clock size={14} />;
  }
}

function getTypeColor(type: string): string {
  switch (type) {
    case 'create':
      return 'bg-green-500';
    case 'edit':
      return 'bg-blue-500';
    case 'delete':
      return 'bg-red-500';
    case 'review':
      return 'bg-purple-500';
    case 'extract':
      return 'bg-amber-500';
    default:
      return 'bg-slate-500';
  }
}

export default function EntryTimeline({ events, onEventClick }: EntryTimelineProps) {
  const { t } = useTranslation();

  const formatTime = (isoString: string): string => {
    const date = new Date(isoString);
    const now = new Date();
    const diffMs = now.getTime() - date.getTime();
    const diffMins = Math.floor(diffMs / (1000 * 60));
    const diffHours = Math.floor(diffMs / (1000 * 60 * 60));
    const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));

    if (diffMins < 1) return t('common.justNow');
    if (diffMins < 60) return t('common.minutesAgo', { count: diffMins });
    if (diffHours < 24) return t('common.hoursAgo', { count: diffHours });
    if (diffDays < 7) return t('common.daysAgo', { count: diffDays });
    return date.toLocaleDateString(undefined, {
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    });
  };

  return (
    <div className="card p-4">
      <div className="mb-4 flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-slate-400">
        <Clock size={12} />
        {t('wiki.timeline', '变更时间线')}
      </div>

      <div className="relative">
        <div className="absolute left-3 top-0 h-full w-px bg-slate-200 dark:bg-slate-700" />

        <ul className="space-y-3">
          {events.map((event, index) => (
            <li
              key={event.id}
              className="relative pl-8"
            >
              <div
                className={`absolute left-0 top-0.5 flex h-6 w-6 items-center justify-center rounded-full text-white ring-2 ring-white dark:ring-slate-800 ${getTypeColor(event.type)}`}
              >
                {getTypeIcon(event.type)}
              </div>

              <button
                onClick={() => onEventClick?.(event)}
                className="w-full text-left rounded-lg p-2 -ml-2 hover:bg-slate-50 dark:hover:bg-slate-700/50 transition-colors"
              >
                <div className="flex items-center justify-between gap-2">
                  <span className="text-sm font-medium text-slate-900 dark:text-white">
                    {event.title}
                  </span>
                  <span className="flex-shrink-0 text-xs text-slate-400">
                    {formatTime(event.timestamp)}
                  </span>
                </div>
                {event.description && (
                  <p className="mt-0.5 text-xs text-slate-500 dark:text-slate-400 line-clamp-2">
                    {event.description}
                  </p>
                )}
                <div className="mt-1 flex items-center gap-2 text-xs text-slate-400">
                  {event.version && (
                    <span className="font-mono">v{event.version}</span>
                  )}
                  {event.author && (
                    <span>· {event.author}</span>
                  )}
                </div>
              </button>
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}
