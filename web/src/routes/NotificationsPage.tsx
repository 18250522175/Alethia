import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useNavigate } from 'react-router-dom';
import {
  Bell,
  Check,
  CheckCircle,
  Warning,
  FileText,
  ShieldCheck,
  Info,
  Trash,
  ArrowLeft,
  ArrowRight,
  Funnel,
  Clock
} from '@phosphor-icons/react';
import { useNotification, NotificationType } from '../contexts/NotificationContext';

type TabType = 'all' | NotificationType;

export default function NotificationsPage() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const { notifications, unreadCount, markAsRead, markAllAsRead, clearAll } = useNotification();
  const [activeTab, setActiveTab] = useState<TabType>('all');

  const filteredNotifications =
    activeTab === 'all'
      ? notifications
      : notifications.filter((n) => n.type === activeTab);

  const tabs: { key: TabType; label: string; icon: React.ReactNode }[] = [
    { key: 'all', label: t('notification.filterAll'), icon: <Bell size={16} /> },
    { key: 'review', label: t('notification.filterReview'), icon: <ShieldCheck size={16} /> },
    { key: 'system', label: t('notification.filterSystem'), icon: <Info size={16} /> },
    { key: 'extraction', label: t('notification.filterExtraction'), icon: <FileText size={16} /> },
    { key: 'anomaly', label: t('notification.filterAnomaly'), icon: <Warning size={16} /> },
  ];

  const getUnreadByType = (type: TabType): number => {
    if (type === 'all') return unreadCount;
    return notifications.filter((n) => n.type === type && !n.read).length;
  };

  const formatTime = (isoString: string): string => {
    const now = new Date();
    const date = new Date(isoString);
    const diffMs = now.getTime() - date.getTime();
    const diffMins = Math.floor(diffMs / (1000 * 60));
    const diffHours = Math.floor(diffMs / (1000 * 60 * 60));
    const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));

    if (diffMins < 1) return t('common.justNow');
    if (diffMins < 60) return t('common.minutesAgo', { count: diffMins });
    if (diffHours < 24) return t('common.hoursAgo', { count: diffHours });
    if (diffDays < 7) return t('common.daysAgo', { count: diffDays });
    return date.toLocaleDateString();
  };

  const getTypeIcon = (type: NotificationType) => {
    switch (type) {
      case 'review':
        return <ShieldCheck size={20} />;
      case 'system':
        return <Info size={20} />;
      case 'extraction':
        return <FileText size={20} />;
      case 'anomaly':
        return <Warning size={20} />;
    }
  };

  const getTypeColor = (type: NotificationType): string => {
    switch (type) {
      case 'review':
        return 'text-amber-600 bg-amber-100 dark:text-amber-400 dark:bg-amber-900/30';
      case 'system':
        return 'text-sky-600 bg-sky-100 dark:text-sky-400 dark:bg-sky-900/30';
      case 'extraction':
        return 'text-green-600 bg-green-100 dark:text-green-400 dark:bg-green-900/30';
      case 'anomaly':
        return 'text-red-600 bg-red-100 dark:text-red-400 dark:bg-red-900/30';
    }
  };

  const getTypeName = (type: NotificationType): string => {
    switch (type) {
      case 'review': return t('notification.typeReview');
      case 'system': return t('notification.typeSystem');
      case 'extraction': return t('notification.typeExtraction');
      case 'anomaly': return t('notification.typeAnomaly');
    }
  };

  const handleNotificationClick = (notification: any) => {
    markAsRead(notification.id);
    if (notification.actionUrl) {
      navigate(notification.actionUrl);
    }
  };

  return (
    <div className="animate-fade-in">
      <header className="mb-6">
        <div className="flex items-center gap-3">
          <button
            onClick={() => navigate(-1)}
            className="btn btn-ghost p-2"
            title="返回"
          >
            <ArrowLeft size={18} />
          </button>
          <div>
            <h1 className="flex items-center gap-2 text-2xl font-bold">
              <Bell size={28} className="text-primary-500" />
              {t('notification.title')}
            </h1>
            <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
              {unreadCount > 0 ? t('notification.unreadHint', { count: unreadCount }) : t('notification.allRead')}
            </p>
          </div>
        </div>
      </header>

      <div className="card overflow-hidden">
        <div className="flex items-center justify-between border-b border-slate-200 px-4 py-3 dark:border-slate-700">
          <div className="flex items-center gap-2">
            <Funnel size={16} className="text-slate-400" />
            <div className="flex gap-1">
              {tabs.map((tab) => {
                const count = getUnreadByType(tab.key);
                const isActive = activeTab === tab.key;
                return (
                  <button
                    key={tab.key}
                    onClick={() => setActiveTab(tab.key)}
                    className={`flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-sm font-medium transition-colors ${
                      isActive
                        ? 'bg-primary-100 text-primary-700 dark:bg-primary-900/30 dark:text-primary-400'
                        : 'text-slate-600 hover:bg-slate-100 dark:text-slate-400 dark:hover:bg-slate-700'
                    }`}
                  >
                    {tab.icon}
                    {tab.label}
                    {count > 0 && (
                      <span
                        className={`text-xs px-1.5 py-0.5 rounded-full ${
                          isActive
                            ? 'bg-primary-600 text-white dark:bg-primary-500'
                            : 'bg-slate-200 text-slate-600 dark:bg-slate-600 dark:text-slate-200'
                        }`}
                      >
                        {count > 99 ? '99+' : count}
                      </span>
                    )}
                  </button>
                );
              })}
            </div>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={markAllAsRead}
              disabled={unreadCount === 0}
              className="btn btn-secondary gap-1.5 text-xs disabled:opacity-50 disabled:cursor-not-allowed"
            >
              <Check size={14} />
              {t('notification.markAllRead')}
            </button>
            <button
              onClick={clearAll}
              disabled={notifications.length === 0}
              className="btn btn-ghost gap-1.5 text-xs text-red-500 hover:text-red-600 hover:bg-red-50 dark:hover:bg-red-900/20 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              <Trash size={14} />
              {t('notification.clearAll')}
            </button>
          </div>
        </div>

        <div className="max-h-[calc(100vh-20rem)] overflow-y-auto">
          {filteredNotifications.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-16 text-slate-500 dark:text-slate-400">
              <CheckCircle size={48} weight="thin" />
              <p className="mt-3 text-sm">{t('notification.empty')}</p>
            </div>
          ) : (
            <ul className="divide-y divide-slate-200 dark:divide-slate-700">
              {filteredNotifications.map((notification) => (
                <li key={notification.id}>
                  <button
                    onClick={() => handleNotificationClick(notification)}
                    className={`w-full text-left px-5 py-4 hover:bg-slate-50 dark:hover:bg-slate-700/50 transition-colors ${
                      !notification.read ? 'bg-primary-50/50 dark:bg-primary-900/10' : ''
                    }`}
                  >
                    <div className="flex gap-4">
                      <div
                        className={`flex-shrink-0 flex items-center justify-center w-10 h-10 rounded-xl ${getTypeColor(
                          notification.type
                        )}`}
                      >
                        {getTypeIcon(notification.type)}
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-start justify-between gap-3">
                          <div>
                            <div className="flex items-center gap-2">
                              <p className={`font-medium text-sm ${
                                !notification.read
                                  ? 'text-slate-900 dark:text-white'
                                  : 'text-slate-700 dark:text-slate-300'
                              }`}>
                                {notification.title}
                              </p>
                              {!notification.read && (
                                <span className="flex-shrink-0 h-2 w-2 rounded-full bg-primary-500 dark:bg-primary-400" />
                              )}
                            </div>
                            <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
                              {getTypeName(notification.type)}
                            </p>
                          </div>
                          <span className="flex-shrink-0 flex items-center gap-1 text-xs text-slate-400">
                            <Clock size={12} />
                            {formatTime(notification.ts)}
                          </span>
                        </div>
                        <p className="mt-2 text-sm text-slate-600 dark:text-slate-400 line-clamp-2">
                          {notification.description}
                        </p>
                        {notification.actionLabel && notification.actionUrl && (
                          <div className="mt-3 flex items-center gap-1 text-xs font-medium text-primary-600 dark:text-primary-400">
                            {notification.actionLabel}
                            <ArrowRight size={12} />
                          </div>
                        )}
                      </div>
                    </div>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>
    </div>
  );
}
