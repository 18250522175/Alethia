import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../store/AuthContext';
import { useTranslation } from 'react-i18next';
import { Gauge, Eye, EyeSlash } from '@phosphor-icons/react';

export default function LoginPage() {
  const [apiKey, setApiKey] = useState('');
  const [remember, setRemember] = useState(true);
  const [showKey, setShowKey] = useState(false);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const { login } = useAuth();
  const navigate = useNavigate();
  const { t } = useTranslation();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setLoading(true);

    try {
      await login(apiKey, remember);
      navigate('/');
    } catch (err: any) {
      setError(err.message || t('login.errorInvalidKey'));
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="flex min-h-screen items-center justify-center bg-gradient-to-br from-slate-900 via-primary-900 to-slate-900 p-4">
      <div className="w-full max-w-md">
        <div className="mb-8 text-center">
          <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-2xl bg-primary-500 text-white shadow-lg shadow-primary-500/30">
            <Gauge size={32} />
          </div>
          <h1 className="text-2xl font-bold text-white">{t('login.title')}</h1>
          <p className="mt-2 text-slate-400">{t('login.subtitle')}</p>
        </div>

        <div className="card p-6">
          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label className="mb-1.5 block text-sm font-medium text-slate-700 dark:text-slate-300">
                API 密钥
              </label>
              <div className="relative">
                <input
                  type={showKey ? 'text' : 'password'}
                  value={apiKey}
                  onChange={(e) => setApiKey(e.target.value)}
                  placeholder={t('login.apiKeyPlaceholder')}
                  className="input pr-10"
                  autoFocus
                />
                <button
                  type="button"
                  onClick={() => setShowKey(!showKey)}
                  className="absolute right-2 top-1/2 -translate-y-1/2 p-1 text-slate-400 hover:text-slate-600 dark:hover:text-slate-300"
                >
                  {showKey ? <EyeSlash size={18} /> : <Eye size={18} />}
                </button>
              </div>
            </div>

            {error && (
              <div className="rounded-lg bg-red-50 p-3 text-sm text-red-600 dark:bg-red-900/20 dark:text-red-400">
                {error}
              </div>
            )}

            <label className="flex items-center gap-2 text-sm text-slate-600 dark:text-slate-400">
              <input
                type="checkbox"
                checked={remember}
                onChange={(e) => setRemember(e.target.checked)}
                className="h-4 w-4 rounded border-slate-300 text-primary-600 focus:ring-primary-500"
              />
              {t('login.rememberDevice')}
            </label>

            <button
              type="submit"
              disabled={loading || !apiKey.trim()}
              className="btn btn-primary w-full"
            >
              {loading ? t('common.loading') : t('login.submit')}
            </button>
          </form>
        </div>

        <p className="mt-6 text-center text-xs text-slate-500">
          输入配置文件中设置的 BRAIN_API_KEY 进行登录
        </p>
      </div>
    </div>
  );
}
