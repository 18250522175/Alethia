import { House, Graph, CheckCircle, ChatsCircle, Gauge, Clock, ClockCounterClockwise, Gear, BookOpen, Brain, Bell, User } from '@phosphor-icons/react';
import { NavLink, useLocation } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import type { ComponentType } from 'react';

interface SidebarProps {
  open: boolean;
  onClose: () => void;
}

interface NavItem {
  path: string;
  icon: ComponentType<any>;
  label: string;
  badge?: string;
  badgeColor?: 'green' | 'yellow' | 'red' | 'blue';
}

export default function Sidebar({ open }: SidebarProps) {
  const { t } = useTranslation();
  const location = useLocation();

  const navItems: NavItem[] = [
    { path: '/', icon: House, label: t('nav.home') },
    { path: '/graph', icon: Graph, label: t('nav.graph') },
    { path: '/review', icon: CheckCircle, label: t('nav.review'), badge: '3', badgeColor: 'yellow' },
    { path: '/qa', icon: ChatsCircle, label: t('nav.qa') },
    { path: '/dashboard', icon: Gauge, label: t('nav.dashboard') },
    { path: '/timeline', icon: Clock, label: t('nav.timeline') },
    { path: '/changelog', icon: ClockCounterClockwise, label: t('nav.changelog') },
    { path: '/settings', icon: Gear, label: t('nav.settings') }
  ];

  return (
    <aside
      className={`${
        open ? 'w-60' : 'w-16'
      } flex flex-col border-r border-slate-200 bg-white dark:border-slate-700 dark:bg-slate-800 transition-all duration-300`}
    >
      <nav className="flex-1 space-y-1 px-2 py-4">
        {navItems.map((item) => {
          const Icon = item.icon;
          const isActive = location.pathname === item.path ||
            (item.path !== '/' && location.pathname.startsWith(item.path));

          return (
            <NavLink
              key={item.path}
              to={item.path}
              className={`flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition-colors ${
                isActive
                  ? 'bg-primary-50 text-primary-700 dark:bg-primary-900/30 dark:text-primary-400'
                  : 'text-slate-600 hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-slate-700'
              }`}
            >
              <Icon size={20} className="flex-shrink-0" />
              {open && <span className="flex-1 truncate">{item.label}</span>}
              {open && item.badge && (
                <span className={`badge badge-${item.badgeColor || 'blue'}`}>
                  {item.badge}
                </span>
              )}
            </NavLink>
          );
        })}
      </nav>

      {open && (
        <div className="border-t border-slate-200 p-3 dark:border-slate-700">
          <div className="text-xs text-slate-500 dark:text-slate-400">
            快速操作
          </div>
          <div className="mt-2 flex gap-2">
            <button className="btn btn-secondary flex-1 px-2 py-1.5 text-xs">
              <Brain size={16} className="mr-1" />
              重建
            </button>
            <button className="btn btn-secondary flex-1 px-2 py-1.5 text-xs">
              <BookOpen size={16} className="mr-1" />
              新建
            </button>
          </div>
        </div>
      )}
    </aside>
  );
}
