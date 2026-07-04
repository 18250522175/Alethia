import { createContext, useContext, useState, useCallback, ReactNode, useRef, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { useNavigate } from 'react-router-dom';
import {
  Bell,
  CheckCircle,
  Warning,
  FileText,
  ShieldCheck,
  Info,
  X,
  Check,
  ArrowRight,
} from '@phosphor-icons/react';

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
}

const NotificationContext = createContext<NotificationContextType | undefined>(undefined);

const initialNotifications: Notification[] = [
  {
    id: '1',
    type: 'review',
    title: '新的审核任务待处理',
    description: '有 3 条知识变更等待您的审核确认',
    ts: new Date(Date.now() - 1000 * 60 * 5).toISOString(),
    read: false,
    actionUrl: '/review',
    actionLabel: '前往审核',
  },
  {
    id: '2',
    type: 'system',
    title: '系统维护通知',
    description: '系统将于今晚 23:00-24:00 进行例行维护',
    ts: new Date(Date.now() - 1000 * 60 * 30).toISOString(),
    read: false,
  },
  {
    id: '3',
    type: 'extraction',
    title: '补提取任务完成',
    description: '文档「产品说明书 v2.0」知识提取已完成',
    ts: new Date(Date.now() - 1000 * 60 * 60 * 2).toISOString(),
    read: true,
    actionUrl: '/wiki/doc-123',
    actionLabel: '查看详情',
  },
  {
    id: '4',
    type: 'anomaly',
    title: '异常检测告警',
    description: '检测到知识库中存在 2 条幽灵关系，请及时处理',
    ts: new Date(Date.now() - 1000 * 60 * 60 * 5).toISOString(),
    read: false,
    actionUrl: '/dashboard',
    actionLabel: '查看详情',
  },
  {
    id: '5',
    type: 'review',
    title: '审核通过通知',
    description: '您提交的 5 条知识变更已全部通过审核',
    ts: new Date(Date.now() - 1000 * 60 * 60 * 24).toISOString(),
    read: true,
  },
  {
    id: '6',
    type: 'extraction',
    title: '自动提取失败',
    description: '文档「技术规格.pdf」提取失败，原因：格式不支持',
    ts: new Date(Date.now() - 1000 * 60 * 60 * 48).toISOString(),
    read: true,
  },
];

function generateId(): string {
  return Date.now().toString(36) + Math.random().toString(36).substr(2, 9);
}

export function NotificationProvider({ children }: { children: ReactNode }) {
  const [notifications, setNotifications] = useState<Notification[]>(initialNotifications);

  const unreadCount = notifications.filter((n) => !n.read).length;

  const addNotification = useCallback(
    (notification: Omit<Notification, 'id' | 'ts' | 'read'>) => {
      const newNotification: Notification = {
        ...notification,
        id: generateId(),
        ts: new Date().toISOString(),
        read: false,
      };
      setNotifications((prev) => [newNotification, ...prev]);
    },
    []
  );

  const markAsRead = useCallback((id: string) => {
    setNotifications((prev) =>
      prev.map((n) => (n.id === id ? { ...n, read: true } : n))
    );
  }, []);

  const markAllAsRead = useCallback(() => {
    setNotifications((prev) => prev.map((n) => ({ ...n, read: true })));
  }, []);

  const clearAll = useCallback(() => {
    setNotifications([]);
  }, []);

  return (
    <NotificationContext.Provider
      value={{ notifications, unreadCount, addNotification, markAsRead, markAllAsRead, clearAll }}
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

function formatTime(isoString: string): string {
  const now = new Date();
  const date = new Date(isoString);
  const diffMs = now.getTime() - date.getTime();
  const diffMins = Math.floor(diffMs / (1000 * 60));
  const diffHours = Math.floor(diffMs / (1000 * 60 * 60));
  const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));

  if (diffMins < 1) return '刚刚';
  if (diffMins < 60) return `${diffMins} 分钟前`;
  if (diffHours < 24) return `${diffHours} 小时前`;
  if (diffDays < 7) return `${diffDays} 天前`;
  return date.toLocaleDateString('zh-CN');
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
  const { t } = useTranslation();
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
    activeTab === 'all'
      ? notifications
      : notifications.filter((n) => n.type === activeTab);

  const tabs: { key: TabType; label: string }[] = [
    { key: 'all', label: '全部' },
    { key: 'review', label: '审核' },
    { key: 'system', label: '系统' },
    { key: 'extraction', label: '补提取' },
    { key: 'anomaly', label: '异常' },
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
              通知中心
            </span>
            {unreadCount > 0 && (
              <span className="badge badge-red">
                {unreadCount > 99 ? '99+' : unreadCount}
              </span>
            )}
          </div>
          <button
            onClick={onClose}
            className="btn btn-ghost p-1.5"
            aria-label="关闭"
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
              <p className="mt-2 text-sm">暂无通知</p>
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
                            {formatTime(notification.ts)}
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
            全部标为已读
          </button>
          <button
            onClick={(e) => { e.stopPropagation(); onClose(); navigate('/notifications'); }}
            className="flex items-center gap-1.5 text-sm text-primary-600 hover:text-primary-700 dark:text-primary-400 dark:hover:text-primary-300 font-medium"
          >
            查看全部
            <ArrowRight size={14} />
          </button>
        </div>
      </div>
    </div>
  );
}
