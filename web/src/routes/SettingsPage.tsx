import { useState, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { useParams, useNavigate } from 'react-router-dom';
import {
  Palette,
  Translate,
  Wallet,
  Folder,
  Check,
  Database,
  Brain,
  ArrowDown,
  ClipboardText,
  SlidersHorizontal,
  FloppyDisk,
  ArrowCounterClockwise,
  Trash,
  DotsThreeVertical
} from '@phosphor-icons/react';
import { useSettings } from '../store/SettingsContext';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import api from '../lib/api';
import { useTheme } from '../store/ThemeContext';
import { useNotification } from '../contexts/NotificationContext';

const sections = [
  { id: 'appearance', icon: Palette },
  { id: 'language', icon: Translate },
  { id: 'budget', icon: Wallet },
  { id: 'models', icon: Brain },
  { id: 'llm-config', icon: Brain },
  { id: 'embedding', icon: Database },
  { id: 'reranking', icon: ArrowDown },
  { id: 'nli', icon: ClipboardText },
  { id: 'data', icon: Folder },
  { id: 'advanced', icon: SlidersHorizontal },
] as const;

export default function SettingsPage() {
  const { t } = useTranslation();
  const { section } = useParams<{ section?: string }>();
  const { settings, isLoading, updateSettings } = useSettings();
  const [activeSection, setActiveSection] = useState(section || 'appearance');
  const [localSettings, setLocalSettings] = useState<any>({});
  const [isDirty, setIsDirty] = useState(false);
  const [saveStatus, setSaveStatus] = useState<'idle' | 'saving' | 'saved' | 'error'>('idle');

  // 根据 URL section 参数设置活动标签页
  useEffect(() => {
    if (section && sections.find(s => s.id === section)) {
      setActiveSection(section);
    }
  }, [section]);

  useEffect(() => {
    if (settings) {
      setLocalSettings(settings);
      setIsDirty(false);
    }
  }, [settings]);

  const handleChange = (path: string, value: any) => {
    setLocalSettings((prev: any) => {
      const next = { ...prev };
      const keys = path.split('.');
      let current = next;
      for (let i = 0; i < keys.length - 1; i++) {
        if (!current[keys[i]]) current[keys[i]] = {};
        current = current[keys[i]];
      }
      current[keys[keys.length - 1]] = value;
      return next;
    });
    setIsDirty(true);
    setSaveStatus('idle');
  };

  const handleSave = async () => {
    setSaveStatus('saving');
    try {
      await updateSettings(localSettings);
      setSaveStatus('saved');
      setIsDirty(false);
      setTimeout(() => setSaveStatus('idle'), 2000);
    } catch {
      setSaveStatus('error');
    }
  };

  const handleReset = () => {
    if (settings) {
      setLocalSettings(settings);
      setIsDirty(false);
      setSaveStatus('idle');
    }
  };

  if (isLoading) {
    return (
      <div className="flex h-64 items-center justify-center">
        <div className="text-slate-500">{t('common.loading')}</div>
      </div>
    );
  }

  return (
    <div className="animate-fade-in">
      <div className="mb-6 flex items-center justify-between">
        <h1 className="text-2xl font-bold">{t('settings.title')}</h1>
        <div className="flex items-center gap-2">
          {isDirty && (
            <span className="text-xs text-amber-600 dark:text-amber-400">
              {t('settings.unsavedChanges')}
            </span>
          )}
          {saveStatus === 'saved' && (
            <span className="flex items-center gap-1 text-xs text-green-600 dark:text-green-400">
              <Check size={14} />
              {t('settings.saved')}
            </span>
          )}
          <button
            onClick={handleReset}
            disabled={!isDirty || saveStatus === 'saving'}
            className="btn btn-secondary text-sm"
          >
            <ArrowCounterClockwise size={16} className="mr-1.5" />
            {t('settings.reset')}
          </button>
          <button
            onClick={handleSave}
            disabled={!isDirty || saveStatus === 'saving'}
            className="btn btn-primary text-sm"
          >
            <FloppyDisk size={16} className="mr-1.5" />
            {saveStatus === 'saving' ? t('settings.saving') : t('settings.saveSettings')}
          </button>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-4">
        <aside className="lg:col-span-1">
          <nav className="space-y-1">
            {sections.map((section) => {
              const Icon = section.icon;
              return (
                <button
                  key={section.id}
                  onClick={() => setActiveSection(section.id)}
                  className={`flex w-full items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition-colors ${
                    activeSection === section.id
                      ? 'bg-primary-50 text-primary-700 dark:bg-primary-900/30 dark:text-primary-400'
                      : 'text-slate-600 hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-slate-800'
                  }`}
                >
                  <Icon size={18} />
                  {t(`settings.${section.id}Section`)}
                </button>
              );
            })}
          </nav>
        </aside>

        <div className="lg:col-span-3 space-y-6">
          {activeSection === 'appearance' && (
            <AppearanceSettings settings={localSettings} onChange={handleChange} />
          )}
          {activeSection === 'language' && (
            <LanguageSettings settings={localSettings} onChange={handleChange} />
          )}
          {activeSection === 'budget' && (
            <BudgetSettings settings={localSettings} onChange={handleChange} />
          )}
          {activeSection === 'models' && (
            <ModelAllocationSettings settings={localSettings} onChange={handleChange} />
          )}
          {activeSection === 'llm-config' && (
            <LLMConfigSettings settings={localSettings} onChange={handleChange} />
          )}
          {activeSection === 'embedding' && (
            <EmbeddingSettings settings={localSettings} onChange={handleChange} />
          )}
          {activeSection === 'reranking' && (
            <RerankingSettings settings={localSettings} onChange={handleChange} />
          )}
          {activeSection === 'nli' && (
            <NLISettings settings={localSettings} onChange={handleChange} />
          )}
          {activeSection === 'data' && (
            <DataSettings settings={localSettings} onChange={handleChange} />
          )}
          {activeSection === 'advanced' && (
            <AdvancedSettings settings={localSettings} onChange={handleChange} />
          )}
        </div>
      </div>
    </div>
  );
}

interface SettingsSectionProps {
  settings: any;
  onChange: (path: string, value: any) => void;
}

function AppearanceSettings({ settings, onChange }: SettingsSectionProps) {
  const { theme, setTheme } = useTheme();
  const { t } = useTranslation();

  const handleThemeChange = (newTheme: 'system' | 'light' | 'dark') => {
    setTheme(newTheme);
    onChange('appearance.theme', newTheme);
  };

  return (
    <div className="card p-6">
      <h2 className="mb-4 flex items-center gap-2 text-lg font-semibold">
        <Palette size={20} className="text-primary-500" />
        {t('settings.appearanceTitle')}
      </h2>
      <div className="space-y-6">
        <div>
          <label className="mb-3 block text-sm font-medium">{t('settings.themeMode')}</label>
          <div className="flex gap-3">
            {([
              { id: 'system', label: t('settings.themeSystem') },
              { id: 'light', label: t('settings.themeLight') },
              { id: 'dark', label: t('settings.themeDark') },
            ] as const).map((themeOpt) => (
              <button
                key={themeOpt.id}
                onClick={() => handleThemeChange(themeOpt.id)}
                className={`btn ${theme === themeOpt.id ? 'btn-primary' : 'btn-secondary'}`}
              >
                {themeOpt.label}
              </button>
            ))}
          </div>
        </div>
        <div>
          <label className="mb-2 block text-sm font-medium">{t('settings.fontSize')}</label>
          <select
            value={settings.appearance?.fontSize || 'medium'}
            onChange={e => onChange('appearance.fontSize', e.target.value)}
            className="input max-w-xs"
          >
            <option value="small">{t('settings.fontSmall')}</option>
            <option value="medium">{t('settings.fontMedium')}</option>
            <option value="large">{t('settings.fontLarge')}</option>
          </select>
        </div>
        <div>
          <label className="mb-2 block text-sm font-medium">{t('settings.accentColor')}</label>
          <div className="flex gap-2">
            {['blue', 'purple', 'green', 'orange', 'pink'].map((color) => (
              <button
                key={color}
                onClick={() => onChange('appearance.accentColor', color)}
                className={`h-8 w-8 rounded-full ${
                  settings.appearance?.accentColor === color
                    ? 'ring-2 ring-offset-2 ring-slate-400'
                    : ''
                } ${
                  color === 'blue' ? 'bg-blue-500' :
                  color === 'purple' ? 'bg-purple-500' :
                  color === 'green' ? 'bg-green-500' :
                  color === 'orange' ? 'bg-orange-500' :
                  'bg-pink-500'
                }`}
              />
            ))}
          </div>
        </div>
        <div>
          <label className="mb-2 block text-sm font-medium">{t('settings.density')}</label>
          <select
            value={settings.appearance?.density || 'comfortable'}
            onChange={e => onChange('appearance.density', e.target.value)}
            className="input max-w-xs"
          >
            <option value="compact">{t('settings.densityCompact')}</option>
            <option value="comfortable">{t('settings.densityComfortable')}</option>
            <option value="spacious">{t('settings.densitySpacious')}</option>
          </select>
        </div>
      </div>
    </div>
  );
}

function LanguageSettings({ settings, onChange }: SettingsSectionProps) {
  const { t, i18n } = useTranslation();

  const handleLangChange = (lang: string) => {
    i18n.changeLanguage(lang);
    onChange('language.locale', lang);
  };

  return (
    <div className="card p-6">
      <h2 className="mb-4 flex items-center gap-2 text-lg font-semibold">
        <Translate size={20} className="text-primary-500" />
        {t('settings.languageTitle')}
      </h2>
      <div className="space-y-6">
        <div>
          <label className="mb-3 block text-sm font-medium">{t('settings.interfaceLanguage')}</label>
          <div className="grid gap-3 sm:grid-cols-2">
            {[
              { code: 'zh-CN', label: '简体中文', flag: '🇨🇳' },
              { code: 'en', label: 'English', flag: '🇺🇸' },
            ].map((lang) => (
              <button
                key={lang.code}
                onClick={() => handleLangChange(lang.code)}
                className={`flex items-center gap-3 rounded-lg border p-4 text-left transition-all ${
                  (settings.language?.locale || i18n.language) === lang.code
                    ? 'border-primary-500 bg-primary-50 dark:border-primary-600 dark:bg-primary-900/20'
                    : 'border-slate-200 hover:border-slate-300 dark:border-slate-700 dark:hover:border-slate-600'
                }`}
              >
                <span className="text-2xl">{lang.flag}</span>
                <div>
                  <p className="font-medium">{lang.label}</p>
                  <p className="text-xs text-slate-500 dark:text-slate-400">{lang.code}</p>
                </div>
              </button>
            ))}
          </div>
        </div>
        <div>
          <label className="mb-2 block text-sm font-medium">{t('settings.defaultKnowledgeLang')}</label>
          <select
            value={settings.language?.defaultKnowledgeLang || 'zh-CN'}
            onChange={e => onChange('language.defaultKnowledgeLang', e.target.value)}
            className="input max-w-xs"
          >
            <option value="zh-CN">简体中文</option>
            <option value="en">English</option>
            <option value="auto">{t('settings.autoDetect')}</option>
          </select>
        </div>
        <label className="flex items-center gap-2">
          <input
            type="checkbox"
            checked={settings.language?.autoTranslateEvidence !== false}
            onChange={e => onChange('language.autoTranslateEvidence', e.target.checked)}
            className="h-4 w-4 rounded"
          />
          <span className="text-sm">{t('settings.autoTranslateEvidence')}</span>
        </label>
      </div>
    </div>
  );
}

function BudgetSettings({ settings, onChange }: SettingsSectionProps) {
  const queryClient = useQueryClient();
  const { t } = useTranslation();

  const budgetQuery = useQuery({
    queryKey: ['budget-remaining'],
    queryFn: () => api.getBudgetRemaining(),
    staleTime: 60_000
  });

  const updateBudgetMutation = useMutation({
    mutationFn: (amount: number) => api.updateDailyBudget(amount),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['budget-remaining'] });
    }
  });

  const handleSaveBudget = () => {
    const dailyBudget = settings.budget?.daily;
    if (dailyBudget !== undefined && dailyBudget !== null) {
      updateBudgetMutation.mutate(dailyBudget);
    }
  };

  return (
    <div className="card p-6">
      <h2 className="mb-4 flex items-center gap-2 text-lg font-semibold">
        <Wallet size={20} className="text-primary-500" />
        {t('settings.budgetTitle')}
      </h2>
      <div className="space-y-6">
        {budgetQuery.isLoading ? (
          <div className="text-sm text-slate-500">{t('settings.loadingBudget')}</div>
        ) : budgetQuery.data && (
          <div className="rounded-lg border border-slate-200 bg-slate-50 p-4 dark:border-slate-700 dark:bg-slate-800">
            <div className="flex flex-wrap items-center gap-6">
              <div>
                <p className="text-xs text-slate-500">{t('settings.todayRemaining')}</p>
                <p className="text-lg font-bold text-green-600 dark:text-green-400">
                  ${budgetQuery.data.daily?.toFixed(2) ?? '0.00'}
                </p>
              </div>
              <div>
                <p className="text-xs text-slate-500">{t('settings.todaySpent')}</p>
                <p className="text-lg font-bold text-amber-600 dark:text-amber-400">
                  ${((budgetQuery.data.dailyLimit ?? 0) - (budgetQuery.data.daily ?? 0)).toFixed(2)}
                </p>
              </div>
              <div>
                <p className="text-xs text-slate-500">{t('settings.totalBudget')}</p>
                <p className="text-lg font-bold">
                  ${budgetQuery.data.dailyLimit?.toFixed(2) ?? '0.00'}
                </p>
              </div>
            </div>
          </div>
        )}
        <div className="grid gap-4 sm:grid-cols-3">
          <div>
            <label className="mb-2 block text-sm font-medium">{t('settings.dailyBudgetUSD')}</label>
            <input
              type="number"
              value={settings.budget?.daily ?? 5}
              onChange={e => {
                const val = Math.min(1000, Math.max(0, parseFloat(e.target.value) || 0));
                onChange('budget.daily', val);
              }}
              min={0}
              max={1000}
              step="0.1"
              className="input"
            />
          </div>
          <div>
            <label className="mb-2 block text-sm font-medium">{t('settings.monthlyBudgetUSD')}</label>
            <input
              type="number"
              value={settings.budget?.monthly ?? 50}
              onChange={e => {
                const val = Math.min(10000, Math.max(0, parseFloat(e.target.value) || 0));
                onChange('budget.monthly', val);
              }}
              min={0}
              max={10000}
              step="1"
              className="input"
            />
          </div>
          <div>
            <label className="mb-2 block text-sm font-medium">{t('settings.perQueryBudgetUSD')}</label>
            <input
              type="number"
              value={settings.budget?.perQuery ?? 0.5}
              onChange={e => {
                const val = Math.min(parseFloat(e.target.value) || 0, settings.budget?.daily ?? 5);
                onChange('budget.perQuery', Math.max(0, val));
              }}
              min={0}
              max={settings.budget?.daily ?? 5}
              step="0.01"
              className="input"
            />
          </div>
        </div>
        <div className="space-y-3">
          <label className="flex items-center gap-2">
            <input
              type="checkbox"
              checked={settings.budget?.nightFuse !== false}
              onChange={e => onChange('budget.nightFuse', e.target.checked)}
              className="h-4 w-4 rounded"
            />
            <span className="text-sm">{t('settings.nightFuseDesc')}</span>
          </label>
          <label className="flex items-center gap-2">
            <input
              type="checkbox"
              checked={settings.budget?.alertEnabled !== false}
              onChange={e => onChange('budget.alertEnabled', e.target.checked)}
              className="h-4 w-4 rounded"
            />
            <span className="text-sm">{t('settings.budgetAlert')}</span>
          </label>
          <div>
            <label className="mb-2 block text-sm font-medium">{t('settings.alertThreshold')}</label>
            <input
              type="range"
              min={50}
              max={100}
              value={settings.budget?.alertThreshold ?? 80}
              onChange={e => onChange('budget.alertThreshold', parseInt(e.target.value))}
              className="w-full max-w-xs"
            />
            <span className="ml-2 text-sm text-slate-500">
              {settings.budget?.alertThreshold ?? 80}%
            </span>
          </div>
        </div>
        <button
          onClick={handleSaveBudget}
          disabled={updateBudgetMutation.isPending}
          className="btn btn-primary text-sm"
        >
          <FloppyDisk size={16} className="mr-1.5" />
          {updateBudgetMutation.isPending ? t('settings.saving') : t('settings.saveBudgetSettings')}
        </button>
      </div>
    </div>
  );
}

function ModelAllocationSettings({ settings, onChange }: SettingsSectionProps) {
  const { t } = useTranslation();
  const adaptersQuery = useQuery({
    queryKey: ['llm-adapters'],
    queryFn: () => api.getLlmAdapters(),
    staleTime: 300_000
  });

  const [taskOrder, setTaskOrder] = useState<string[]>([
    'qa', 'summary', 'extraction', 'reasoning', 'rewrite', 'draft'
  ]);

  const tasks = [
    { id: 'qa', label: t('settings.taskQa'), description: t('settings.taskQaDesc') },
    { id: 'summary', label: t('settings.taskSummary'), description: t('settings.taskSummaryDesc') },
    { id: 'extraction', label: t('settings.taskExtraction'), description: t('settings.taskExtractionDesc') },
    { id: 'reasoning', label: t('settings.taskReasoning'), description: t('settings.taskReasoningDesc') },
    { id: 'rewrite', label: t('settings.taskRewrite'), description: t('settings.taskRewriteDesc') },
    { id: 'draft', label: t('settings.taskDraft'), description: t('settings.taskDraftDesc') },
  ];

  const adapters = adaptersQuery.data?.adapters || [];

  const handleDragStart = (e: React.DragEvent, taskId: string) => {
    e.dataTransfer.setData('taskId', taskId);
  };

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
  };

  const handleDrop = (e: React.DragEvent, targetTaskId: string) => {
    e.preventDefault();
    const draggedTaskId = e.dataTransfer.getData('taskId');
    if (draggedTaskId && draggedTaskId !== targetTaskId) {
      const newOrder = [...taskOrder];
      const draggedIndex = newOrder.indexOf(draggedTaskId);
      const targetIndex = newOrder.indexOf(targetTaskId);
      newOrder.splice(draggedIndex, 1);
      newOrder.splice(targetIndex, 0, draggedTaskId);
      setTaskOrder(newOrder);
      onChange('models.taskOrder', newOrder);
    }
  };

  const getTaskById = (id: string) => tasks.find(t => t.id === id);

  return (
    <div className="card p-6">
      <h2 className="mb-4 flex items-center gap-2 text-lg font-semibold">
        <Brain size={20} className="text-primary-500" />
        {t('settings.modelsTitle')}
      </h2>
      <p className="mb-6 text-sm text-slate-500 dark:text-slate-400">
        {t('settings.modelsDesc')}
      </p>
      <div className="space-y-3">
        {taskOrder.map(taskId => {
          const task = getTaskById(taskId);
          if (!task) return null;
          return (
            <div
              key={task.id}
              draggable
              onDragStart={(e) => handleDragStart(e, task.id)}
              onDragOver={handleDragOver}
              onDrop={(e) => handleDrop(e, task.id)}
              className="flex items-center gap-4 rounded-lg border border-slate-200 p-4 transition-all dark:border-slate-700 hover:border-primary-300 hover:shadow-sm dark:hover:border-primary-600 cursor-grab active:cursor-grabbing"
            >
              <div className="cursor-move text-slate-400 hover:text-primary-500 dark:hover:text-primary-400">
                <DotsThreeVertical size={18} />
              </div>
              <div className="flex-1 min-w-0">
                <p className="font-medium">{task.label}</p>
                <p className="text-sm text-slate-500 dark:text-slate-400">{task.description}</p>
              </div>
              <div className="w-64">
                <select
                  value={settings.models?.[task.id] || ''}
                  onChange={e => onChange(`models.${task.id}`, e.target.value)}
                  className="input w-full text-sm"
                >
                  <option value="">{t('settings.autoSelect')}</option>
                  {adapters.map((adapter: any) => (
                    <option key={adapter.id} value={adapter.id}>
                      {adapter.displayName}
                    </option>
                  ))}
                </select>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function EmbeddingSettings({ settings, onChange }: SettingsSectionProps) {
  const { t } = useTranslation();
  return (
    <div className="card p-6">
      <h2 className="mb-4 flex items-center gap-2 text-lg font-semibold">
        <Database size={20} className="text-primary-500" />
        {t('settings.embeddingTitle')}
      </h2>
      <div className="space-y-6">
        <div>
          <label className="mb-2 block text-sm font-medium">{t('settings.embeddingModel')}</label>
          <select
            value={settings.embedding?.model || 'bge-m3'}
            onChange={e => onChange('embedding.model', e.target.value)}
            className="input max-w-md"
          >
            <option value="bge-m3">BAAI/bge-m3（多语言）</option>
            <option value="bge-large-zh">BAAI/bge-large-zh-v1.5（中文）</option>
            <option value="text-embedding-3">text-embedding-3-large（OpenAI）</option>
            <option value="gte-large">thenlper/gte-large</option>
            <option value="custom">{t('settings.customModel', '自定义模型...')}</option>
          </select>
        </div>
        {(settings.embedding?.model === 'custom') && (
          <div>
            <label className="mb-2 block text-sm font-medium">{t('settings.customModelName', '自定义模型名称')}</label>
            <input
              type="text"
              value={settings.embedding?.customModel || ''}
              onChange={e => onChange('embedding.customModel', e.target.value)}
              placeholder="e.g. sentence-transformers/all-MiniLM-L6-v2"
              className="input max-w-md font-mono text-sm"
            />
          </div>
        )}
        <div>
          <label className="mb-2 block text-sm font-medium">{t('settings.embeddingBaseUrl', '嵌入模型 Base URL')}</label>
          <input
            type="text"
            value={settings.embedding?.baseUrl || ''}
            onChange={e => onChange('embedding.baseUrl', e.target.value)}
            placeholder={t('settings.embeddingBaseUrlPlaceholder', '默认端点（留空使用官方）')}
            className="input max-w-md font-mono text-sm"
          />
        </div>
        <div>
          <label className="mb-2 block text-sm font-medium">{t('settings.dimensions')}</label>
          <select
            value={settings.embedding?.dimensions || 1024}
            onChange={e => onChange('embedding.dimensions', parseInt(e.target.value))}
            className="input max-w-xs"
          >
            <option value={512}>{t('settings.dimensionTemplate', { dim: 512 })}</option>
            <option value={768}>{t('settings.dimensionTemplate', { dim: 768 })}</option>
            <option value={1024}>{t('settings.dimensionTemplate', { dim: 1024 })}</option>
            <option value={1536}>{t('settings.dimensionTemplate', { dim: 1536 })}</option>
          </select>
        </div>
        <div>
          <label className="mb-2 block text-sm font-medium">{t('settings.topK')}</label>
          <input
            type="range"
            min={3}
            max={50}
            value={settings.embedding?.topK ?? 10}
            onChange={e => onChange('embedding.topK', parseInt(e.target.value))}
            className="w-full max-w-xs"
          />
          <span className="ml-2 text-sm text-slate-500">
            {t('settings.resultsCount', { count: settings.embedding?.topK ?? 10 })}
          </span>
        </div>
        <label className="flex items-center gap-2">
          <input
            type="checkbox"
            checked={settings.embedding?.hybridSearch !== false}
            onChange={e => onChange('embedding.hybridSearch', e.target.checked)}
            className="h-4 w-4 rounded"
          />
          <span className="text-sm">{t('settings.hybridSearch')}</span>
        </label>
      </div>
    </div>
  );
}

function RerankingSettings({ settings, onChange }: SettingsSectionProps) {
  const { t } = useTranslation();
  return (
    <div className="card p-6">
      <h2 className="mb-4 flex items-center gap-2 text-lg font-semibold">
        <ArrowDown size={20} className="text-primary-500" />
        {t('settings.rerankingTitle')}
      </h2>
      <div className="space-y-6">
        <label className="flex items-center gap-2">
          <input
            type="checkbox"
            checked={settings.reranking?.enabled !== false}
            onChange={e => onChange('reranking.enabled', e.target.checked)}
            className="h-4 w-4 rounded"
          />
          <span className="text-sm">{t('settings.enableReranking')}</span>
        </label>
        <div>
          <label className="mb-2 block text-sm font-medium">{t('settings.rerankingModel')}</label>
          <select
            value={settings.reranking?.model || 'bge-reranker-v2-m3'}
            onChange={e => onChange('reranking.model', e.target.value)}
            disabled={settings.reranking?.enabled === false}
            className="input max-w-md disabled:opacity-50"
          >
            <option value="bge-reranker-v2-m3">BAAI/bge-reranker-v2-m3</option>
            <option value="bge-reranker-large">BAAI/bge-reranker-large</option>
            <option value="cross-encoder">cross-encoder/ms-marco-MiniLM-L-6-v2</option>
          </select>
        </div>
        <div>
          <label className="mb-2 block text-sm font-medium">{t('settings.rerankingTopN')}</label>
          <input
            type="range"
            min={1}
            max={20}
            value={settings.reranking?.topN ?? 5}
            onChange={e => onChange('reranking.topN', parseInt(e.target.value))}
            className="w-full max-w-xs"
            disabled={settings.reranking?.enabled === false}
          />
          <span className="ml-2 text-sm text-slate-500">
            {t('settings.resultsCount', { count: settings.reranking?.topN ?? 5 })}
          </span>
        </div>
      </div>
    </div>
  );
}

function NLISettings({ settings, onChange }: SettingsSectionProps) {
  const { t } = useTranslation();
  return (
    <div className="card p-6">
      <h2 className="mb-4 flex items-center gap-2 text-lg font-semibold">
        <ClipboardText size={20} className="text-primary-500" />
        {t('settings.nliTitle')}
      </h2>
      <p className="mb-6 text-sm text-slate-500 dark:text-slate-400">
        {t('settings.nliDesc')}
      </p>
      <div className="space-y-6">
        <label className="flex items-center gap-2">
          <input
            type="checkbox"
            checked={settings.nli?.enabled !== false}
            onChange={e => onChange('nli.enabled', e.target.checked)}
            className="h-4 w-4 rounded"
          />
          <span className="text-sm">{t('settings.enableNLI')}</span>
        </label>
        <div>
          <label className="mb-2 block text-sm font-medium">{t('settings.nliModel')}</label>
          <select
            value={settings.nli?.model || 'xiaobu-v2'}
            onChange={e => onChange('nli.model', e.target.value)}
            disabled={settings.nli?.enabled === false}
            className="input max-w-md disabled:opacity-50"
          >
            <option value="xiaobu-v2">hfl/xcop-mnli-xiaobu-zh-v2</option>
            <option value="roberta-large-mnli">roberta-large-mnli</option>
            <option value="bart-mnli">facebook/bart-large-mnli</option>
          </select>
        </div>
        <div>
          <label className="mb-2 block text-sm font-medium">{t('settings.entailmentThreshold')}</label>
          <input
            type="range"
            min={0}
            max={100}
            value={(settings.nli?.entailmentThreshold ?? 0.7) * 100}
            onChange={e => onChange('nli.entailmentThreshold', parseInt(e.target.value) / 100)}
            className="w-full max-w-xs"
            disabled={settings.nli?.enabled === false}
          />
          <span className="ml-2 text-sm text-slate-500">
            {((settings.nli?.entailmentThreshold ?? 0.7) * 100).toFixed(0)}%
          </span>
        </div>
        <div>
          <label className="mb-2 block text-sm font-medium">{t('settings.maxReflections')}</label>
          <select
            value={settings.nli?.maxReflections ?? 3}
            onChange={e => onChange('nli.maxReflections', parseInt(e.target.value))}
            disabled={settings.nli?.enabled === false}
            className="input max-w-xs disabled:opacity-50"
          >
            <option value={0}>{t('settings.reflectionDisabled')}</option>
            <option value={1}>{t('settings.reflectionCount', { count: 1 })}</option>
            <option value={2}>{t('settings.reflectionCount', { count: 2 })}</option>
            <option value={3}>{t('settings.reflectionCount', { count: 3 })}</option>
            <option value={5}>{t('settings.reflectionCount', { count: 5 })}</option>
          </select>
        </div>
      </div>
    </div>
  );
}

function DataSettings({ settings, onChange }: SettingsSectionProps) {
  const [cleaningGhost, setCleaningGhost] = useState(false);
  const { addNotification } = useNotification();
  const { t } = useTranslation();
  const handleCleanGhost = async () => {
    if (!confirm(t('settings.cleanGhostConfirm'))) {
      return;
    }
    setCleaningGhost(true);
    try {
      await api.cleanGhostRelations();
      addNotification({
        type: 'system',
        title: t('settings.ghostCleanSuccess'),
        description: t('settings.ghostCleanSuccessDesc')
      });
    } catch (err: any) {
      addNotification({
        type: 'system',
        title: t('settings.ghostCleanFailed'),
        description: err.message || t('settings.ghostCleanFailedDesc')
      });
    } finally {
      setCleaningGhost(false);
    }
  };
  return (
    <div className="card p-6">
      <h2 className="mb-4 flex items-center gap-2 text-lg font-semibold">
        <Folder size={20} className="text-primary-500" />
        {t('settings.dataTitle')}
      </h2>
      <div className="space-y-6">
        <div>
          <label className="mb-2 block text-sm font-medium">{t('settings.libraryPath')}</label>
          <input
            type="text"
            value={settings.data?.libraryPath || './library'}
            onChange={e => onChange('data.libraryPath', e.target.value)}
            className="input font-mono text-sm"
          />
        </div>
        <div>
          <label className="mb-2 block text-sm font-medium">{t('settings.observedPath')}</label>
          <input
            type="text"
            value={settings.data?.observedPath || './observed'}
            onChange={e => onChange('data.observedPath', e.target.value)}
            className="input font-mono text-sm"
          />
        </div>
        <label className="flex items-center gap-2">
          <input
            type="checkbox"
            checked={settings.data?.autoObserve !== false}
            onChange={e => onChange('data.autoObserve', e.target.checked)}
            className="h-4 w-4 rounded"
          />
          <span className="text-sm">{t('settings.autoObserve')}</span>
        </label>
        <label className="flex items-center gap-2">
          <input
            type="checkbox"
            checked={settings.data?.versionControl !== false}
            onChange={e => onChange('data.versionControl', e.target.checked)}
            className="h-4 w-4 rounded"
          />
          <span className="text-sm">{t('settings.versionControl')}</span>
        </label>
        <div>
          <label className="mb-2 block text-sm font-medium">{t('settings.maxVersions')}</label>
          <select
            value={settings.data?.maxVersions ?? 50}
            onChange={e => onChange('data.maxVersions', parseInt(e.target.value))}
            className="input max-w-xs"
          >
            <option value={10}>{t('settings.versionCount', { count: 10 })}</option>
            <option value={25}>{t('settings.versionCount', { count: 25 })}</option>
            <option value={50}>{t('settings.versionCount', { count: 50 })}</option>
            <option value={100}>{t('settings.versionCount', { count: 100 })}</option>
            <option value={0}>{t('settings.keepAll')}</option>
          </select>
        </div>
        <div className="rounded-lg border border-amber-200 bg-amber-50 p-4 dark:border-amber-800 dark:bg-amber-900/20">
          <p className="text-sm font-medium text-amber-800 dark:text-amber-200">{t('settings.dangerZone')}</p>
          <p className="mt-1 text-xs text-amber-700 dark:text-amber-300">
            {t('settings.dangerZoneDesc')}
          </p>
          <button
            onClick={handleCleanGhost}
            disabled={cleaningGhost}
            className="mt-3 btn bg-amber-600 text-white hover:bg-amber-700 text-xs disabled:opacity-50"
          >
            <Trash size={14} className={`mr-1.5 ${cleaningGhost ? 'animate-spin' : ''}`} />
            {cleaningGhost ? t('settings.cleaningGhost') : t('settings.cleanGhost')}
          </button>
        </div>
      </div>
    </div>
  );
}

function AdvancedSettings({ settings, onChange }: SettingsSectionProps) {
  const { t } = useTranslation();
  return (
    <div className="card p-6">
      <h2 className="mb-4 flex items-center gap-2 text-lg font-semibold">
        <SlidersHorizontal size={20} className="text-primary-500" />
        {t('settings.advancedTitle')}
      </h2>
      <div className="space-y-6">
        <label className="flex items-center gap-2">
          <input
            type="checkbox"
            checked={settings.advanced?.shadowEval !== false}
            onChange={e => onChange('advanced.shadowEval', e.target.checked)}
            className="h-4 w-4 rounded"
          />
          <span className="text-sm">{t('settings.shadowEval')}</span>
        </label>
        <label className="flex items-center gap-2">
          <input
            type="checkbox"
            checked={settings.advanced?.semanticRings !== false}
            onChange={e => onChange('advanced.semanticRings', e.target.checked)}
            className="h-4 w-4 rounded"
          />
          <span className="text-sm">{t('settings.semanticRings')}</span>
        </label>
        <div>
          <label className="mb-2 block text-sm font-medium">{t('settings.logLevel')}</label>
          <select
            value={settings.advanced?.logLevel || 'info'}
            onChange={e => onChange('advanced.logLevel', e.target.value)}
            className="input max-w-xs"
          >
            <option value="debug">{t('settings.logDebug')}</option>
            <option value="info">{t('settings.logInfo')}</option>
            <option value="warn">{t('settings.logWarn')}</option>
            <option value="error">{t('settings.logError')}</option>
          </select>
        </div>
        <div>
          <label className="mb-2 block text-sm font-medium">{t('settings.requestTimeout')}</label>
          <input
            type="number"
            value={settings.advanced?.timeout ?? 60}
            onChange={e => onChange('advanced.timeout', parseInt(e.target.value))}
            min={10}
            className="input max-w-xs"
          />
        </div>
        <div>
          <label className="mb-2 block text-sm font-medium">{t('settings.concurrency')}</label>
          <input
            type="number"
            value={settings.advanced?.concurrency ?? 3}
            onChange={e => onChange('advanced.concurrency', parseInt(e.target.value))}
            min={1}
            max={20}
            className="input max-w-xs"
          />
        </div>
      </div>
    </div>
  );
}

function LLMConfigSettings({ settings, onChange }: SettingsSectionProps) {
  const { t } = useTranslation();
  const [showKeys, setShowKeys] = useState<Record<string, boolean>>({});
  const [testingAdapter, setTestingAdapter] = useState<string | null>(null);
  const [testResults, setTestResults] = useState<Record<string, { success: boolean; message: string }>>({});

  const toggleShowKey = (adapterId: string) => {
    setShowKeys(prev => ({ ...prev, [adapterId]: !prev[adapterId] }));
  };

  const handleTestConnection = async (adapterId: string) => {
    const adapterConfig = settings.integration?.llmAdapters?.[adapterId] || {};
    const apiKey = adapterConfig.apiKey || '';
    const model = adapterConfig.defaultModel || '';

    if (!apiKey.trim()) {
      setTestResults(prev => ({ ...prev, [adapterId]: { success: false, message: '请先输入 API Key' } }));
      return;
    }

    setTestingAdapter(adapterId);
    try {
      const result = await api.testLlmConnection(adapterId, apiKey, model);
      if (result.success) {
        setTestResults(prev => ({ ...prev, [adapterId]: { success: true, message: `连接成功 (${result.latency}ms)` } }));
      } else {
        setTestResults(prev => ({ ...prev, [adapterId]: { success: false, message: result.error || '连接失败' } }));
      }
    } catch (err: any) {
      setTestResults(prev => ({ ...prev, [adapterId]: { success: false, message: err.message || '测试失败' } }));
    } finally {
      setTestingAdapter(null);
    }
  };

  const adapterList: Array<{ id: string; name: string; defaultModel: string }> = [
    { id: 'bailian', name: '阿里云百炼（通义千问）', defaultModel: 'qwen-turbo' },
    { id: 'zhipu', name: '智谱 AI（ChatGLM）', defaultModel: 'glm-4-flash' },
    { id: 'moonshot', name: '月之暗面（Kimi）', defaultModel: 'moonshot-v1-8k' },
    { id: 'ernie', name: '百度文心一言', defaultModel: 'ernie-speed-128k' },
    { id: 'spark', name: '科大讯飞星火', defaultModel: 'spark-lite' },
    { id: 'hunyuan', name: '腾讯混元', defaultModel: 'hunyuan-lite' },
    { id: 'minimax', name: 'MiniMax', defaultModel: 'abab6.5-chat' },
    { id: 'deepseek', name: 'DeepSeek', defaultModel: 'deepseek-chat' },
    { id: 'yi', name: '零一万物 Yi', defaultModel: 'yi-large' },
    { id: 'baichuan', name: '百川智能', defaultModel: 'Baichuan2-Turbo' },
  ];

  return (
    <div className="space-y-6">
      {/* Global Parameters */}
      <div className="card p-6">
        <h2 className="mb-4 flex items-center gap-2 text-lg font-semibold">
          <SlidersHorizontal size={20} className="text-primary-500" />
          {t('settings.llmGlobalTitle', '全局参数')}
        </h2>
        <p className="mb-4 text-sm text-slate-500 dark:text-slate-400">
          {t('settings.llmGlobalDesc', '这些参数将作为所有模型的默认值，可在各厂商配置中覆盖。')}
        </p>
        <div className="grid gap-6 sm:grid-cols-3">
          <div>
            <label className="mb-2 flex items-center justify-between text-sm font-medium">
              <span>{t('settings.temperature', '温度')}</span>
              <span className="text-xs text-slate-500">{(settings.llmConfig?.defaultTemperature ?? 0.7).toFixed(2)}</span>
            </label>
            <input
              type="range"
              min={0}
              max={2}
              step={0.01}
              value={settings.llmConfig?.defaultTemperature ?? 0.7}
              onChange={e => onChange('llmConfig.defaultTemperature', parseFloat(e.target.value))}
              className="w-full"
            />
            <p className="mt-1 text-xs text-slate-400">{t('settings.temperatureHint', '越低越确定，越高越有创意')}</p>
          </div>
          <div>
            <label className="mb-2 block text-sm font-medium">
              {t('settings.maxTokens', '上下文窗口')}
            </label>
            <select
              value={settings.llmConfig?.defaultMaxTokens ?? 4096}
              onChange={e => onChange('llmConfig.defaultMaxTokens', parseInt(e.target.value))}
              className="input w-full"
            >
              <option value={1024}>1,024</option>
              <option value={2048}>2,048</option>
              <option value={4096}>4,096</option>
              <option value={8192}>8,192</option>
              <option value={16384}>16,384</option>
              <option value={32768}>32,768</option>
              <option value={65536}>65,536</option>
              <option value={131072}>131,072</option>
            </select>
          </div>
          <div>
            <label className="mb-2 flex items-center justify-between text-sm font-medium">
              <span>{t('settings.topP', 'Top P')}</span>
              <span className="text-xs text-slate-500">{(settings.llmConfig?.defaultTopP ?? 0.9).toFixed(2)}</span>
            </label>
            <input
              type="range"
              min={0}
              max={1}
              step={0.01}
              value={settings.llmConfig?.defaultTopP ?? 0.9}
              onChange={e => onChange('llmConfig.defaultTopP', parseFloat(e.target.value))}
              className="w-full"
            />
            <p className="mt-1 text-xs text-slate-400">{t('settings.topPHint', '核采样概率阈值')}</p>
          </div>
        </div>
      </div>

      {/* Adapter Cards */}
      {adapterList.map(adapter => {
        const adapterConfig = settings.integration?.llmAdapters?.[adapter.id] || {};
        const isEnabled = adapterConfig.enabled || false;
        return (
          <div key={adapter.id} className={`card p-6 transition-all ${isEnabled ? 'border-primary-300 dark:border-primary-700' : ''}`}>
            <div className="flex items-center justify-between mb-4">
              <h3 className="flex items-center gap-2 text-base font-semibold">
                <Brain size={18} className={isEnabled ? 'text-primary-500' : 'text-slate-400'} />
                {adapter.name}
              </h3>
              <label className="flex items-center gap-2 cursor-pointer">
                <span className="text-xs text-slate-500">{t('settings.enabled', '启用')}</span>
                <input
                  type="checkbox"
                  checked={isEnabled}
                  onChange={e => onChange(`integration.llmAdapters.${adapter.id}.enabled`, e.target.checked)}
                  className="h-4 w-4 rounded"
                />
              </label>
            </div>
            {isEnabled && (
              <div className="grid gap-4 sm:grid-cols-2">
                <div>
                  <label className="mb-1 block text-xs font-medium text-slate-500">
                    {t('settings.apiKey', 'API Key')}
                  </label>
                  <div className="flex gap-1">
                    <input
                      type={showKeys[adapter.id] ? 'text' : 'password'}
                      value={adapterConfig.apiKey || ''}
                      onChange={e => onChange(`integration.llmAdapters.${adapter.id}.apiKey`, e.target.value)}
                      placeholder={t('settings.apiKeyPlaceholder', '输入 API Key')}
                      className="input flex-1 font-mono text-sm"
                    />
                    <button
                      onClick={() => toggleShowKey(adapter.id)}
                      className="btn btn-secondary px-2 text-xs"
                      title={showKeys[adapter.id] ? t('settings.hide', '隐藏') : t('settings.show', '显示')}
                    >
                      {showKeys[adapter.id] ? '***' : 'abc'}
                    </button>
                    <button
                      onClick={() => handleTestConnection(adapter.id)}
                      disabled={testingAdapter === adapter.id}
                      className="btn btn-secondary px-2 text-xs whitespace-nowrap"
                    >
                      {testingAdapter === adapter.id ? '测试中...' : '测试连接'}
                    </button>
                  </div>
                  {testResults[adapter.id] && (
                    <div className={`mt-1 text-xs ${testResults[adapter.id].success ? 'text-green-600 dark:text-green-400' : 'text-red-600 dark:text-red-400'}`}>
                      {testResults[adapter.id].message}
                    </div>
                  )}
                </div>
                <div>
                  <label className="mb-1 block text-xs font-medium text-slate-500">
                    {t('settings.baseUrl', 'Base URL')}
                  </label>
                  <input
                    type="text"
                    value={adapterConfig.baseUrl || ''}
                    onChange={e => onChange(`integration.llmAdapters.${adapter.id}.baseUrl`, e.target.value)}
                    placeholder={t('settings.baseUrlPlaceholder', '默认端点（留空使用官方）')}
                    className="input w-full font-mono text-sm"
                  />
                </div>
                <div>
                  <label className="mb-1 block text-xs font-medium text-slate-500">
                    {t('settings.model', '模型')}
                  </label>
                  <input
                    type="text"
                    value={adapterConfig.defaultModel || adapter.defaultModel}
                    onChange={e => onChange(`integration.llmAdapters.${adapter.id}.defaultModel`, e.target.value)}
                    placeholder={adapter.defaultModel}
                    className="input w-full text-sm"
                  />
                </div>
                <div>
                  <label className="mb-1 flex items-center justify-between text-xs font-medium text-slate-500">
                    <span>{t('settings.temperature', '温度')}</span>
                    <span className="text-[10px]">{(adapterConfig.temperature ?? settings.llmConfig?.defaultTemperature ?? 0.7).toFixed(2)}</span>
                  </label>
                  <input
                    type="range"
                    min={0}
                    max={2}
                    step={0.01}
                    value={adapterConfig.temperature ?? settings.llmConfig?.defaultTemperature ?? 0.7}
                    onChange={e => onChange(`integration.llmAdapters.${adapter.id}.temperature`, parseFloat(e.target.value))}
                    className="w-full"
                  />
                </div>
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}
