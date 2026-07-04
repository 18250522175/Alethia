import { Bell, Gauge, User, List, MagnifyingGlass, ChatsCircle } from '@phosphor-icons/react';
import { useTheme } from '../store/ThemeContext';
import { useAuth } from '../store/AuthContext';
import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';

interface TopBarProps {
  onToggleSidebar: () => void;
}

export default function TopBar({ onToggleSidebar }: TopBarProps) {
  const { isDark, toggleTheme } = useTheme();
  const { logout } = useAuth();
  const [showUserMenu, setShowUserMenu] = useState(false);
  const navigate = useNavigate();
  const { t } = useTranslation();

  const handleLogout = () => {
    logout();
    navigate('/login');
  };

  return (
    <header className="flex h-14 items-center justify-between border-b border-slate-200 bg-white px-4 dark:border-slate-700 dark:bg-slate-800">
      <div className="flex items-center gap-3">
        <button
          onClick={onToggleSidebar}
          className="btn btn-ghost p-2"
          aria-label="切换侧边栏"
        >
          <List size={20} />
        </button>
        <div className="flex items-center gap-2">
          <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary-600 text-white">
            <Gauge size={18} />
          </div>
          <span className="font-semibold text-slate-900 dark:text-white">
            理想 AI 知识库
          </span>
        </div>
      </div>

      <div className="flex flex-1 max-w-xl mx-8">
        <div className="relative w-full">
          <MagnifyingGlass
            size={18}
            className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400"
          />
          <input
            type="text"
            placeholder="搜索知识、文档、问答记录..."
            className="input pl-10"
          />
        </div>
      </div>

      <div className="flex items-center gap-2">
        <button
          onClick={() => navigate('/qa')}
          className="btn btn-primary gap-2"
        >
          <ChatsCircle size={18} />
          <span className="hidden sm:inline">快速提问</span>
        </button>

        <button className="btn btn-ghost p-2 relative" aria-label="通知">
          <Bell size={20} />
          <span className="absolute right-1.5 top-1.5 h-2 w-2 rounded-full bg-red-500"></span>
        </button>

        <div className="relative">
          <button
            onClick={() => setShowUserMenu(!showUserMenu)}
            className="btn btn-ghost p-2"
            aria-label="用户菜单"
          >
            <User size={20} />
          </button>

          {showUserMenu && (
            <div className="absolute right-0 mt-2 w-48 rounded-lg border border-slate-200 bg-white py-1 shadow-lg dark:border-slate-700 dark:bg-slate-800 z-50">
              <button
                onClick={toggleTheme}
                className="flex w-full items-center gap-2 px-4 py-2 text-sm text-slate-700 hover:bg-slate-100 dark:text-slate-200 dark:hover:bg-slate-700"
              >
                {isDark ? '浅色模式' : '深色模式'}
              </button>
              <button
                onClick={() => navigate('/settings')}
                className="flex w-full items-center gap-2 px-4 py-2 text-sm text-slate-700 hover:bg-slate-100 dark:text-slate-200 dark:hover:bg-slate-700"
              >
                {t('nav.settings')}
              </button>
              <hr className="my-1 border-slate-200 dark:border-slate-700" />
              <button
                onClick={handleLogout}
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
