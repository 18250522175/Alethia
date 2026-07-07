import { Bell, Gauge, User, List, ChatsCircle, CurrencyDollar } from '@phosphor-icons/react';
import { useTheme } from '../store/ThemeContext';
import { useAuth } from '../store/AuthContext';
import { useState, useRef, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { useNotification, NotificationCenter } from '../contexts/NotificationContext';
import SearchCombobox from '../blocks/SearchCombobox';
import { Popover, PopoverButton, PopoverPanel } from '@headlessui/react';
import { useQuery } from '@tanstack/react-query';
import api from '../lib/api';

interface TopBarProps {
  onToggleSidebar: () => void;
}

export default function TopBar({ onToggleSidebar }: TopBarProps) {
  const { isDark, toggleTheme } = useTheme();
  const { logout } = useAuth();
  const [showUserMenu, setShowUserMenu] = useState(false);
  const userMenuRef = useRef<HTMLDivElement>(null);
  const navigate = useNavigate();
  const { t } = useTranslation();
  const { unreadCount } = useNotification();

  const menuItemsRef = useRef<(HTMLButtonElement | null)[]>([]);

  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (userMenuRef.current && !userMenuRef.current.contains(e.target as Node)) {
        setShowUserMenu(false);
      }
    }
    if (showUserMenu) {
      document.addEventListener('mousedown', handleClickOutside);
    }
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [showUserMenu]);

  const handleMenuKeyDown = (e: React.KeyboardEvent) => {
    const items = menuItemsRef.current.filter(Boolean) as HTMLButtonElement[];
    if (items.length === 0) return;
    const currentIdx = items.indexOf(document.activeElement as HTMLButtonElement);

    if (e.key === 'ArrowDown') {
      e.preventDefault();
      const next = currentIdx < 0 ? 0 : (currentIdx + 1) % items.length;
      items[next].focus();
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      const prev = currentIdx <= 0 ? items.length - 1 : currentIdx - 1;
      items[prev].focus();
    } else if (e.key === 'Home') {
      e.preventDefault();
      items[0].focus();
    } else if (e.key === 'End') {
      e.preventDefault();
      items[items.length - 1].focus();
    } else if (e.key === 'Escape') {
      e.stopPropagation();
      setShowUserMenu(false);
      (e.currentTarget as HTMLElement).focus();
    }
  };

  const handleUserMenuButtonKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'ArrowDown' && !showUserMenu) {
      e.preventDefault();
      setShowUserMenu(true);
      requestAnimationFrame(() => {
        const items = menuItemsRef.current.filter(Boolean) as HTMLButtonElement[];
        if (items.length > 0) items[0].focus();
      });
    } else if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      setShowUserMenu(!showUserMenu);
      if (!showUserMenu) {
        requestAnimationFrame(() => {
          const items = menuItemsRef.current.filter(Boolean) as HTMLButtonElement[];
          if (items.length > 0) items[0].focus();
        });
      }
    }
  };

  const handleLogout = () => {
    logout();
    navigate('/login');
  };

  const budgetQuery = useQuery({
    queryKey: ['budget-remaining'],
    queryFn: () => api.getBudgetRemaining(),
    staleTime: 60_000,
    retry: 1
  });

  const budgetData = {
    daily: budgetQuery.data?.period === 'daily' 
      ? { used: budgetQuery.data.used, total: budgetQuery.data.total }
      : { used: 2.35, total: 5 },
    monthly: { used: 45.8, total: 100 }
  };

  return (
    <header className="flex h-14 items-center justify-between border-b border-slate-200 bg-white px-4 dark:border-slate-700 dark:bg-slate-800">
      <div className="flex items-center gap-3">
        <button
          onClick={onToggleSidebar}
          className="btn btn-ghost p-2"
          aria-label={t('topbar.toggleSidebar', '切换侧边栏')}
        >
          <List size={20} />
        </button>
        <div className="flex items-center gap-2">
          <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary-600 text-white">
            <Gauge size={18} />
          </div>
          <span className="font-semibold text-slate-900 dark:text-white">
            {t('topbar.appName', '理想 AI 知识库')}
          </span>
        </div>
      </div>

      <div className="flex flex-1 max-w-xl mx-8">
        <SearchCombobox />
      </div>

      <div className="flex items-center gap-2">
        <button
          onClick={() => navigate('/qa')}
          className="btn btn-primary gap-2"
        >
          <ChatsCircle size={18} />
          <span className="hidden sm:inline">{t('topbar.quickAsk', '快速提问')}</span>
        </button>

        <Popover className="relative">
          <PopoverButton
            className="btn btn-ghost p-2 relative"
            aria-label={unreadCount > 0
              ? t('topbar.notificationUnread', '通知（{{count}} 条未读）', { count: unreadCount })
              : t('topbar.notification', '通知')}
          >
            <Bell size={20} />
            {unreadCount > 0 && (
              <span
                className="absolute right-1.5 top-1.5 flex h-4 min-w-[16px] items-center justify-center rounded-full bg-red-500 px-1 text-[10px] font-bold text-white"
                aria-hidden="true"
              >
                {unreadCount > 9 ? '9+' : unreadCount}
              </span>
            )}
          </PopoverButton>
          <PopoverPanel
            anchor="bottom end"
            className="z-50 mt-2 w-96"
          >
            {({ close }) => (
              <NotificationCenter
                isOpen={true}
                onClose={close}
              />
            )}
          </PopoverPanel>
        </Popover>

        <Popover className="relative">
          <PopoverButton
            className="btn btn-ghost p-2 relative"
            aria-label={t('topbar.budget', '预算')}
          >
            <CurrencyDollar size={20} />
          </PopoverButton>
          <PopoverPanel
            anchor="bottom end"
            className="z-50 mt-2 w-64"
          >
            <div className="card p-3 shadow-xl animate-fade-in">
              <div className="mb-2 flex items-center gap-1.5 text-sm font-semibold text-slate-700 dark:text-slate-200">
                <CurrencyDollar size={16} className="text-primary-500" />
                {t('health.budget', '预算使用')}
              </div>
              <div className="space-y-2">
                <BudgetMiniBar
                  label={t('health.daily', '每日')}
                  used={budgetData.daily.used}
                  total={budgetData.daily.total}
                />
                <BudgetMiniBar
                  label={t('health.monthly', '每月')}
                  used={budgetData.monthly.used}
                  total={budgetData.monthly.total}
                />
              </div>
              <button
                onClick={() => navigate('/dashboard')}
                className="mt-3 w-full text-xs text-primary-600 hover:text-primary-700 dark:text-primary-400 dark:hover:text-primary-300 font-medium text-right"
              >
                {t('common.viewDetails', '查看详情 →')}
              </button>
            </div>
          </PopoverPanel>
        </Popover>

        <div className="relative" ref={userMenuRef}>
          <button
            onClick={() => setShowUserMenu(!showUserMenu)}
            onKeyDown={handleUserMenuButtonKeyDown}
            className="btn btn-ghost p-2"
            aria-label={t('topbar.userMenu', '用户菜单')}
            aria-expanded={showUserMenu}
            aria-haspopup="menu"
          >
            <User size={20} />
          </button>

          {showUserMenu && (
            <div
              className="absolute right-0 mt-2 w-48 rounded-lg border border-slate-200 bg-white py-1 shadow-lg dark:border-slate-700 dark:bg-slate-800 z-50"
              role="menu"
              aria-label={t('topbar.userMenu', '用户菜单')}
              onKeyDown={handleMenuKeyDown}
            >
              <button
                ref={el => { menuItemsRef.current[0] = el; }}
                onClick={toggleTheme}
                role="menuitem"
                tabIndex={0}
                className="flex w-full items-center gap-2 px-4 py-2 text-sm text-slate-700 hover:bg-slate-100 dark:text-slate-200 dark:hover:bg-slate-700"
              >
                {isDark ? t('topbar.lightMode', '浅色模式') : t('topbar.darkMode', '深色模式')}
              </button>
              <button
                ref={el => { menuItemsRef.current[1] = el; }}
                onClick={() => {
                  navigate('/settings');
                  setShowUserMenu(false);
                }}
                role="menuitem"
                tabIndex={0}
                className="flex w-full items-center gap-2 px-4 py-2 text-sm text-slate-700 hover:bg-slate-100 dark:text-slate-200 dark:hover:bg-slate-700"
              >
                {t('nav.settings')}
              </button>
              <hr className="my-1 border-slate-200 dark:border-slate-700" />
              <button
                ref={el => { menuItemsRef.current[2] = el; }}
                onClick={handleLogout}
                role="menuitem"
                tabIndex={0}
                className="flex w-full items-center gap-2 px-4 py-2 text-sm text-red-600 hover:bg-red-50 dark:hover:bg-red-900/20"
              >
                {t('nav.logout')}
              </button>
            </div>
          )}
        </div>
      </div>
    </header>
  );
}

function BudgetMiniBar({
  label,
  used,
  total
}: {
  label: string;
  used: number;
  total: number;
}) {
  const pct = total > 0 ? Math.round((used / total) * 100) : 0;
  const exceeded = used > total;
  const barColor = exceeded
    ? 'bg-red-500'
    : pct >= 80
      ? 'bg-yellow-500'
      : 'bg-primary-500';

  return (
    <div>
      <div className="mb-1 flex items-center justify-between text-xs">
        <span className="text-slate-500 dark:text-slate-400">{label}</span>
        <span className={exceeded ? 'font-medium text-red-600 dark:text-red-400' : 'text-slate-600 dark:text-slate-300'}>
          {exceeded ? '超额' : `${pct}%`}
        </span>
      </div>
      <div className="h-1.5 w-full overflow-hidden rounded-full bg-slate-200 dark:bg-slate-700">
        <div
          className={`h-full rounded-full transition-all ${barColor}`}
          style={{ width: `${Math.min(pct, 100)}%` }}
        />
      </div>
    </div>
  );
}
