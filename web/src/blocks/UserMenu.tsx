import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { User, Gear, SignOut } from '@phosphor-icons/react';
import { useAuth } from '../store/AuthContext';

interface UserMenuProps {
  onLogout: () => void;
  onSettings: () => void;
}

export default function UserMenu({ onLogout, onSettings }: UserMenuProps) {
  const { t } = useTranslation();
  const { token } = useAuth();
  const [open, setOpen] = useState(false);
  const apiKeyMasked = token ? `${token.slice(0, 4)}${'*'.repeat(Math.max(4, token.length - 4))}` : '--';

  const handleSettings = () => {
    setOpen(false);
    onSettings();
  };

  const handleLogout = () => {
    setOpen(false);
    onLogout();
  };

  return (
    <div className="relative">
      <button
        onClick={() => setOpen(!open)}
        className="btn btn-ghost p-2"
        aria-label={t('nav.settings')}
      >
        <User size={20} />
      </button>

      {open && (
        <div className="absolute right-0 mt-2 w-56 rounded-lg border border-slate-200 bg-white py-1 shadow-lg dark:border-slate-700 dark:bg-slate-800 z-50 animate-fade-in">
          <div className="border-b border-slate-200 px-4 py-2 dark:border-slate-700">
            <div className="text-xs text-slate-500 dark:text-slate-400">
              {t('settings.apiKey')}
            </div>
            <div className="font-mono text-sm text-slate-700 dark:text-slate-200">
              {apiKeyMasked}
            </div>
          </div>
          <button
            onClick={handleSettings}
            className="flex w-full items-center gap-2 px-4 py-2 text-sm text-slate-700 hover:bg-slate-100 dark:text-slate-200 dark:hover:bg-slate-700"
          >
            <Gear size={16} />
            {t('nav.settings')}
          </button>
          <hr className="my-1 border-slate-200 dark:border-slate-700" />
          <button
            onClick={handleLogout}
            className="flex w-full items-center gap-2 px-4 py-2 text-sm text-red-600 hover:bg-red-50 dark:hover:bg-red-900/20"
          >
            <SignOut size={16} />
            {t('nav.logout')}
          </button>
        </div>
      )}
    </div>
  );
}
