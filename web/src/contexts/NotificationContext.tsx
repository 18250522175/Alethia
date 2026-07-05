import type { ReactNode } from 'react';
import {
  ArrowRight,
  Bell,
  Check,
  CheckCircle,
  FileText,
  Info,
  ShieldCheck,
  Warning,
  X
} from '@phosphor-icons/react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { createContext, useCallback, useContext, useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useNavigate } from 'react-router-dom';
import api from '../lib/api';
import { formatRelativeTime } from '../lib/format';

export type NotificationType = 'review' | 'system' | 'extraction' | 'anomaly';

export interface Notification {
  id: string;
  type: NotificationType;
  title: string;
  description: string;
  ts: string;
  read: boolean;
  actionUrl?: string;
  actionLabel?: string;
}

interface NotificationContextType {
  notifications: Notification[];
  unreadCount: number;
  addNotification: (notification: Omit<Notification, 'id' | 'ts' | 'read'>) => void;
  markAsRead: (id: string) => void;
  markAllAsRead: () => void;
  clearAll: () => void;
  refetch: () => void;
}

const NotificationContext = createContext<NotificationContextType | undefined>(undefined);

function generateId(): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID();
  }
  return Date.now().toString(36) + Math.random().toString(36).substring(2, 11);
}

export function NotificationProvider({ children }: { children: ReactNode }) {
  const [localNotifications, setLocalNotifications] = useState<Notification[]>([]);
  const queryClient = useQueryClient();

  const { data, refetch } = useQuery({
    queryKey: ['notifications'],
    queryFn: async () => {
      try {
        const result = await api.getNotifications();
        return (result.items as Notification[]) || [];
      } catch {
        return [];
      }
    },
    staleTime: 60_000,
    refetchInterval: 120_000,
    retry: 1
  });

  const serverNotifications = data || [];
  const notifications = [...localNotifications, ...serverNotifications];
  const unreadCount = notifications.filter((n) => !n.read).length;

  const addNotification = useCallback((notification: Omit<Notification, 'id' | 'ts' | 'read'>) => {
    const newNotification: Notification = {
      ...notification,
      id: generateId(),
      ts: new Date().toISOString(),
      read: false
    };
    setLocalNotifications((prev) => [newNotification, ...prev]);
  }, []);

  const markAsRead = useCallback(
    (id: string) => {
      // 乐观更新本地状态
      setLocalNotifications((prev) => prev.map((n) => (n.id === id ? { ...n, read: true } : n)));
      // 同步到后端，失败时刷新以恢复一致状态
      api.markNotificationRead(id).catch(() => {
        void queryClient.invalidateQueries({ queryKey: ['notifications'] });
      });
    },
    [queryClient]
  );

  const markAllAsRead = useCallback(() => {
    setLocalNotifications((prev) => prev.map((n) => ({ ...n, read: true })));
    api
      .markAllNotificationsRead()
      .then(() => {
        void queryClient.invalidateQueries({ queryKey: ['notifications'] });
      })
      .catch(() => {
        void queryClient.invalidateQueries({ queryKey: ['notifications'] });
      });
  }, [queryClient]);

  const clearAll = useCallback(() => {
    setLocalNotifications([]);
  }, []);

  return (
    <NotificationContext.Provider
      value={{
        notifications,
        unreadCount,
        addNotification,
        markAsRead,
        markAllAsRead,
        clearAll,
        refetch
      }}
    >
      {children}
    </NotificationContext.Provider>
  );
}

export function useNotification() {
  const context = useContext(NotificationContext);
  if (context === undefined) {
    throw new Error('useNotification must be used within a NotificationProvider');
  }
  return context;
}

function getTypeIcon(type: NotificationType) {
  switch (type) {
    case 'review':
      return <ShieldCheck size={18} />;
    case 'system':
      return <Info size={18} />;
    case 'extraction':
      return <FileText size={18} />;
    case 'anomaly':
      return <Warning size={18} />;
  }
}

function getTypeColor(type: NotificationType): string {
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
}

interface NotificationCenterProps {
  isOpen: boolean;
  onClose: () => void;
}

type TabType = 'all' | NotificationType;

export function NotificationCenter({ isOpen, onClose }: NotificationCenterProps) {
  const navigate = useNavigate();
  const { notifications, unreadCount, markAsRead, markAllAsRead } = useNotification();
  const [activeTab, setActiveTab] = useState<TabType>('all');
  const panelRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (panelRef.current && !panelRef.current.contains(e.target as Node)) {
        onClose();
      }
    }
    if (isOpen) {
      document.addEventListener('mousedown', handleClickOutside);
    }
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [isOpen, onClose]);

  const filteredNotifications =
    activeTab === 'all' ? notifications : notifications.filter((n) => n.type === activeTab);

  const { t: tNotif } = useTranslation();
  const tabs: { key: TabType; label: string }[] = [
    { key: 'all', label: tNotif('notification.filterAll', '全部') },
    { key: 'review', label: tNotif('notification.filterReview', '审核') },
    { key: 'system', label: tNotif('notification.filterSystem', '系统') },
    { key: 'extraction', label: tNotif('notification.filterExtraction', '补提取') },
    { key: 'anomaly', label: tNotif('notification.filterAnomaly', '异常') }
  ];

  const handleNotificationClick = (id: string) => {
    markAsRead(id);
  };

  const getUnreadByType = (type: TabType): number => {
    if (type === 'all') return unreadCount;
    return notifications.filter((n) => n.type === type && !n.read).length;
  };

  if (!isOpen) return null;

  return (
    <div className="relative" ref={panelRef}>
      <div className="absolute right-0 mt-2 w-96 rounded-xl border border-slate-200 bg-white shadow-xl dark:border-slate-700 dark:bg-slate-800 z-50 animate-fade-in overflow-hidden">
        <div className="flex items-center justify-between px-4 py-3 border-b border-slate-200 dark:border-slate-700">
          <div className="flex items-center gap-2">
            <Bell size={18} className="text-slate-600 dark:text-slate-300" />
            <span className="font-semibold text-slate-900 dark:text-white">
              {tNotif('notification.title', '通知中心')}
            </span>
            {unreadCount > 0 && (
              <span className="badge badge-red">{unreadCount > 99 ? '99+' : unreadCount}</span>
            )}
          </div>
          <button
            onClick={onClose}
            className="btn btn-ghost p-1.5"
            aria-label={tNotif('notification.close', '关闭')}
          >
            <X size={16} />
          </button>
        </div>

        <div className="flex gap-1 px-3 py-2 border-b border-slate-200 dark:border-slate-700 overflow-x-auto">
          {tabs.map((tab) => {
            const count = getUnreadByType(tab.key);
            const isActive = activeTab === tab.key;
            return (
              <button
                key={tab.key}
                onClick={() => setActiveTab(tab.key)}
                className={`flex items-center gap-1.5 px-3 py-1.5 text-sm font-medium rounded-lg whitespace-nowrap transition-colors ${
                  isActive
                    ? 'bg-primary-100 text-primary-700 dark:bg-primary-900/30 dark:text-primary-400'
                    : 'text-slate-600 hover:bg-slate-100 dark:text-slate-400 dark:hover:bg-slate-700'
                }`}
              >
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

        <div className="max-h-96 overflow-y-auto">
          {filteredNotifications.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-12 text-slate-500 dark:text-slate-400">
              <CheckCircle size={40} weight="thin" />
              <p className="mt-2 text-sm">{tNotif('notification.empty', '暂无通知')}</p>
            </div>
          ) : (
            <ul className="divide-y divide-slate-200 dark:divide-slate-700">
              {filteredNotifications.map((notification) => (
                <li key={notification.id}>
                  <button
                    onClick={() => handleNotificationClick(notification.id)}
                    className={`w-full text-left px-4 py-3 hover:bg-slate-50 dark:hover:bg-slate-700/50 transition-colors ${
                      !notification.read ? 'bg-primary-50/50 dark:bg-primary-900/10' : ''
                    }`}
                  >
                    <div className="flex gap-3">
                      <div
                        className={`flex-shrink-0 flex items-center justify-center w-9 h-9 rounded-lg ${getTypeColor(
                          notification.type
                        )}`}
                      >
                        {getTypeIcon(notification.type)}
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-start justify-between gap-2">
                          <p className="font-medium text-sm text-slate-900 dark:text-white truncate">
                            {notification.title}
                          </p>
                          {!notification.read && (
                            <span className="flex-shrink-0 mt-1.5 h-2 w-2 rounded-full bg-primary-500 dark:bg-primary-400" />
                          )}
                        </div>
                        <p className="mt-0.5 text-xs text-slate-600 dark:text-slate-400 line-clamp-2">
                          {notification.description}
                        </p>
                        <div className="flex items-center justify-between mt-2">
                          <span className="text-xs text-slate-400 dark:text-slate-500">
                            {formatRelativeTime(notification.ts)}
                          </span>
                          {notification.actionLabel && notification.actionUrl && (
                            <span className="flex items-center gap-1 text-xs font-medium text-primary-600 dark:text-primary-400">
                              {notification.actionLabel}
                              <ArrowRight size={12} />
                            </span>
                          )}
                        </div>
                      </div>
                    </div>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>

        <div className="flex items-center justify-between px-4 py-2 border-t border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800/50">
          <button
            onClick={markAllAsRead}
            disabled={unreadCount === 0}
            className="flex items-center gap-1.5 text-sm text-slate-600 hover:text-slate-900 dark:text-slate-400 dark:hover:text-white disabled:opacity-50 disabled:cursor-not-allowed"
          >
            <Check size={14} />
            {tNotif('notification.markAllRead', '全部标为已读')}
          </button>
          <button
            onClick={(e) => {
              e.stopPropagation();
              onClose();
              navigate('/notifications');
            }}
            className="flex items-center gap-1.5 text-sm text-primary-600 hover:text-primary-700 dark:text-primary-400 dark:hover:text-primary-300 font-medium"
          >
            {tNotif('notification.viewAll', '查看全部')}
            <ArrowRight size={14} />
          </button>
        </div>
      </div>
    </div>
  );
}
