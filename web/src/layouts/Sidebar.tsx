import { House, Graph, CheckCircle, ChatsCircle, Gauge, Clock, ClockCounterClockwise, Gear, BookOpen, Brain, CaretDown, CaretRight, Ghost, Eye, MagnifyingGlass, Bell, Flask, Notebook, UploadSimple, Link, Sparkle } from '@phosphor-icons/react';
import { NavLink, useLocation, useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { useState } from 'react';
import type { ComponentType } from 'react';
import { useNotification } from '../contexts/NotificationContext';
import { useQuery } from '@tanstack/react-query';
import api from '../lib/api';

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
  children?: SubNavItem[];
}

interface SubNavItem {
  path: string;
  label: string;
}

function NavItemWithTooltip({
  item,
  open,
  isActive
}: {
  item: NavItem;
  open: boolean;
  isActive: boolean;
}) {
  const Icon = item.icon;
  const [showTooltip, setShowTooltip] = useState(false);

  if (open) {
    return (
      <NavLink
        to={item.path}
        className={`flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition-colors ${
          isActive
            ? 'bg-primary-50 text-primary-700 dark:bg-primary-900/30 dark:text-primary-400'
            : 'text-slate-600 hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-slate-700'
        }`}
      >
        <Icon size={20} className="flex-shrink-0" />
        <span className="flex-1 truncate">{item.label}</span>
        {item.badge && (
          <span className={`badge badge-${item.badgeColor || 'blue'}`}>
            {item.badge}
          </span>
        )}
      </NavLink>
    );
  }

  return (
    <div className="relative">
      <NavLink
        to={item.path}
        onMouseEnter={() => setShowTooltip(true)}
        onMouseLeave={() => setShowTooltip(false)}
        className={`flex items-center justify-center rounded-lg py-2.5 text-sm font-medium transition-colors ${
          isActive
            ? 'bg-primary-50 text-primary-700 dark:bg-primary-900/30 dark:text-primary-400'
            : 'text-slate-600 hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-slate-700'
        }`}
      >
        <Icon size={20} />
      </NavLink>
      {showTooltip && (
        <div className="absolute left-full top-1/2 z-50 ml-2 -translate-y-1/2 whitespace-nowrap rounded-md bg-slate-900 px-2 py-1 text-xs text-white shadow-lg dark:bg-slate-700">
          {item.label}
          <div className="absolute left-0 top-1/2 -translate-x-1 -translate-y-1/2 h-2 w-2 rotate-45 bg-slate-900 dark:bg-slate-700" />
        </div>
      )}
    </div>
  );
}

function WikiNavGroup({ open }: { open: boolean }) {
  const { t } = useTranslation();
  const location = useLocation();
  const [expanded, setExpanded] = useState(true);
  const [showTooltip, setShowTooltip] = useState(false);

  const portals: SubNavItem[] = [
    { path: '/wiki/portal-product', label: t('sidebar.portalProduct', '产品门户') },
    { path: '/wiki/portal-engineering', label: t('sidebar.portalEngineering', '工程门户') },
    { path: '/wiki/portal-research', label: t('sidebar.portalResearch', '研究门户') },
    { path: '/wiki/portal-operations', label: t('sidebar.portalOperations', '运营门户') },
  ];

  const isWikiActive = location.pathname.startsWith('/wiki');

  if (open) {
    return (
      <div className="space-y-1">
        <button
          onClick={() => setExpanded(!expanded)}
          className={`flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition-colors ${
            isWikiActive
              ? 'bg-primary-50 text-primary-700 dark:bg-primary-900/30 dark:text-primary-400'
              : 'text-slate-600 hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-slate-700'
          }`}
        >
          <BookOpen size={20} className="flex-shrink-0" />
          <span className="flex-1 truncate text-left">{t('nav.wiki', '百科')}</span>
          {expanded ? (
            <CaretDown size={16} />
          ) : (
            <CaretRight size={16} />
          )}
        </button>
        {expanded && (
          <div className="ml-5 space-y-1 border-l border-slate-200 dark:border-slate-700 pl-2">
            {portals.map(portal => (
              <NavLink
                key={portal.path}
                to={portal.path}
                className={`block rounded-md px-3 py-2 text-sm transition-colors ${
                  location.pathname === portal.path
                    ? 'bg-primary-50 text-primary-700 dark:bg-primary-900/30 dark:text-primary-400'
                    : 'text-slate-500 hover:bg-slate-100 dark:text-slate-400 dark:hover:bg-slate-700'
                }`}
              >
                {portal.label}
              </NavLink>
            ))}
          </div>
        )}
      </div>
    );
  }

  return (
    <div className="relative">
      <NavLink
        to="/"
        onMouseEnter={() => setShowTooltip(true)}
        onMouseLeave={() => setShowTooltip(false)}
        className={`flex items-center justify-center rounded-lg py-2.5 text-sm font-medium transition-colors ${
          isWikiActive
            ? 'bg-primary-50 text-primary-700 dark:bg-primary-900/30 dark:text-primary-400'
            : 'text-slate-600 hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-slate-700'
        }`}
      >
        <BookOpen size={20} />
      </NavLink>
      {showTooltip && (
        <div className="absolute left-full top-1/2 z-50 ml-2 -translate-y-1/2 whitespace-nowrap rounded-md bg-slate-900 px-2 py-1 text-xs text-white shadow-lg dark:bg-slate-700">
          {t('nav.wiki', '百科')}
          <div className="absolute left-0 top-1/2 -translate-x-1 -translate-y-1/2 h-2 w-2 rotate-45 bg-slate-900 dark:bg-slate-700" />
        </div>
      )}
    </div>
  );
}

export default function Sidebar({ open, onClose }: SidebarProps) {
  const { t } = useTranslation();
  const location = useLocation();
  const navigate = useNavigate();
  const { notifications } = useNotification();

  const reviewCount = notifications.filter(n => n.type === 'review' && !n.read).length;
  const notificationCount = notifications.filter(n => !n.read).length;

  const navItems: NavItem[] = [
    { path: '/', icon: House, label: t('nav.home') },
    { path: '/graph', icon: Graph, label: t('nav.graph') },
    { path: '/cognitive-map', icon: Brain, label: t('nav.cognitiveMap', '认知地图') },
    { path: '/review', icon: CheckCircle, label: t('nav.review'), badge: reviewCount > 0 ? String(reviewCount) : undefined, badgeColor: 'yellow' },
    { path: '/qa', icon: ChatsCircle, label: t('nav.qa') },
    { path: '/dashboard', icon: Gauge, label: t('nav.dashboard') },
    { path: '/timeline', icon: Clock, label: t('nav.timeline') },
    { path: '/changelog', icon: ClockCounterClockwise, label: t('nav.changelog') },
    { path: '/settings', icon: Gear, label: t('nav.settings') },
    { path: '/observed-files', icon: Eye, label: t('nav.observedFiles', '观察文件') },
    { path: '/search', icon: MagnifyingGlass, label: t('nav.search', '搜索') },
    { path: '/notifications', icon: Bell, label: t('nav.notifications', '通知'), badge: notificationCount > 0 ? String(notificationCount) : undefined, badgeColor: 'blue' },
    { path: '/eval-report', icon: Flask, label: t('nav.evalReport', '评测报告') },
    { path: '/library', icon: BookOpen, label: t('nav.library', '资料库') },
    { path: '/notes', icon: Notebook, label: t('nav.notes', '笔记') },
    { path: '/upload', icon: UploadSimple, label: t('nav.upload', '上传') },
    { path: '/prompts', icon: Sparkle, label: t('nav.prompts', '提示词') },
    { path: '/aliases', icon: Link, label: t('nav.aliases', '别名') }
  ];

  const healthQuery = useQuery({
    queryKey: ['health-dashboard'],
    queryFn: () => api.getHealthDashboard(),
    staleTime: 60_000,
    retry: 1
  });

  const ghostCount = healthQuery.data?.ghostRelations ?? 0;

  const handleRebuild = async () => {
    try {
      await api.rebuildStruct();
      onClose?.();
    } catch {
      // silent fail
    }
  };

  const handleNewPage = () => {
    navigate('/wiki/new');
    onClose?.();
  };

  return (
    <aside
      className={`${
        open ? 'w-60' : 'w-16'
      } flex flex-col border-r border-slate-200 bg-white dark:border-slate-700 dark:bg-slate-800 transition-all duration-300`}
    >
      <nav className="flex-1 space-y-1 px-2 py-4">
        {navItems.slice(0, 1).map((item) => {
          const isActive = location.pathname === item.path ||
            (item.path !== '/' && location.pathname.startsWith(item.path));
          return (
            <NavItemWithTooltip
              key={item.path}
              item={item}
              open={open}
              isActive={isActive}
            />
          );
        })}

        <WikiNavGroup open={open} />

        {navItems.slice(1).map((item) => {
          const isActive = location.pathname === item.path ||
            (item.path !== '/' && location.pathname.startsWith(item.path));
          return (
            <NavItemWithTooltip
              key={item.path}
              item={item}
              open={open}
              isActive={isActive}
            />
          );
        })}

        {ghostCount > 0 && (
          <div className={`mt-2 ${open ? 'px-3' : 'flex justify-center'}`}>
            <button
              onClick={() => navigate('/settings#cleanup')}
              className={`flex items-center gap-2 rounded-lg bg-red-50 px-2 py-1.5 text-xs text-red-600 transition-colors hover:bg-red-100 dark:bg-red-900/20 dark:text-red-400 dark:hover:bg-red-800/20 ${
                open ? '' : 'justify-center w-8'
              }`}
              title={t('sidebar.ghostRelationsTitle', '{{count}} 条幽灵关系待处理，点击查看', { count: ghostCount })}
            >
              <Ghost size={14} />
              {open && <span>{t('sidebar.ghostRelations', '{{count}} 幽灵关系', { count: ghostCount })}</span>}
            </button>
          </div>
        )}
      </nav>

      {open && (
        <div className="border-t border-slate-200 p-3 dark:border-slate-700">
          <div className="text-xs text-slate-500 dark:text-slate-400">
            {t('sidebar.quickActions', '快速操作')}
          </div>
          <div className="mt-2 flex gap-2">
            <button
              onClick={handleRebuild}
              className="btn btn-secondary flex-1 px-2 py-1.5 text-xs"
              title={t('sidebar.rebuildTitle', '重建知识结构')}
            >
              <Brain size={16} className="mr-1" />
              {t('sidebar.rebuild', '重建')}
            </button>
            <button
              onClick={handleNewPage}
              className="btn btn-secondary flex-1 px-2 py-1.5 text-xs"
              title={t('sidebar.newPageTitle', '新建页面')}
            >
              <BookOpen size={16} className="mr-1" />
              {t('sidebar.newPage', '新建')}
            </button>
          </div>
        </div>
      )}
    </aside>
  );
}
