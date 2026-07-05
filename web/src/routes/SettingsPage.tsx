import {
  ArrowCounterClockwise,
  ArrowDown,
  Brain,
  Check,
  CheckCircle,
  ClipboardText,
  Database,
  DotsThreeVertical,
  FloppyDisk,
  Folder,
  Lightning,
  Palette,
  Plug,
  SlidersHorizontal,
  Spinner,
  Translate,
  Trash,
  Wallet,
  XCircle
} from '@phosphor-icons/react';
import { useMutation, useQuery } from '@tanstack/react-query';
import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import api from '../lib/api';
import { useSettings } from '../store/SettingsContext';
import { useTheme } from '../store/ThemeContext';

const sections = [
  { id: 'appearance', icon: Palette, label: '外观' },
  { id: 'language', icon: Translate, label: '语言' },
  { id: 'budget', icon: Wallet, label: '预算' },
  { id: 'models', icon: Brain, label: '模型分配' },
  { id: 'embedding', icon: Database, label: '嵌入' },
  { id: 'reranking', icon: ArrowDown, label: '重排序' },
  { id: 'nli', icon: ClipboardText, label: 'NLI' },
  { id: 'data', icon: Folder, label: '数据' },
  { id: 'advanced', icon: SlidersHorizontal, label: '高级' },
  { id: 'diagnostics', icon: Plug, label: '集成诊断' }
];

export default function SettingsPage() {
  const { t } = useTranslation();
  const { settings, isLoading, updateSettings } = useSettings();
  const [activeSection, setActiveSection] = useState('appearance');
  const [localSettings, setLocalSettings] = useState<any>({});
  const [isDirty, setIsDirty] = useState(false);
  const [saveStatus, setSaveStatus] = useState<'idle' | 'saving' | 'saved' | 'error'>('idle');

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
            <span className="text-xs text-amber-600 dark:text-amber-400">有未保存的更改</span>
          )}
          {saveStatus === 'saved' && (
            <span className="flex items-center gap-1 text-xs text-green-600 dark:text-green-400">
              <Check size={14} />
              已保存
            </span>
          )}
          <button
            onClick={handleReset}
            disabled={!isDirty || saveStatus === 'saving'}
            className="btn btn-secondary text-sm"
          >
            <ArrowCounterClockwise size={16} className="mr-1.5" />
            重置
          </button>
          <button
            onClick={handleSave}
            disabled={!isDirty || saveStatus === 'saving'}
            className="btn btn-primary text-sm"
          >
            <FloppyDisk size={16} className="mr-1.5" />
            {saveStatus === 'saving' ? '保存中...' : '保存设置'}
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
                  {section.label}
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
          {activeSection === 'diagnostics' && <DiagnosticsSettings />}
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

  const handleThemeChange = (newTheme: 'system' | 'light' | 'dark') => {
    setTheme(newTheme);
    onChange('appearance.theme', newTheme);
  };

  return (
    <div className="card p-6">
      <h2 className="mb-4 flex items-center gap-2 text-lg font-semibold">
        <Palette size={20} className="text-primary-500" />
        外观设置
      </h2>
      <div className="space-y-6">
        <div>
          <label className="mb-3 block text-sm font-medium">主题模式</label>
          <div className="flex gap-3">
            {(
              [
                { id: 'system', label: '跟随系统' },
                { id: 'light', label: '浅色' },
                { id: 'dark', label: '深色' }
              ] as const
            ).map((t) => (
              <button
                key={t.id}
                onClick={() => handleThemeChange(t.id)}
                className={`btn ${theme === t.id ? 'btn-primary' : 'btn-secondary'}`}
              >
                {t.label}
              </button>
            ))}
          </div>
        </div>
        <div>
          <label className="mb-2 block text-sm font-medium">字体大小</label>
          <select
            value={settings.appearance?.fontSize || 'medium'}
            onChange={(e) => onChange('appearance.fontSize', e.target.value)}
            className="input max-w-xs"
          >
            <option value="small">小</option>
            <option value="medium">中</option>
            <option value="large">大</option>
          </select>
        </div>
        <div>
          <label className="mb-2 block text-sm font-medium">强调色</label>
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
                  color === 'blue'
                    ? 'bg-blue-500'
                    : color === 'purple'
                      ? 'bg-purple-500'
                      : color === 'green'
                        ? 'bg-green-500'
                        : color === 'orange'
                          ? 'bg-orange-500'
                          : 'bg-pink-500'
                }`}
              />
            ))}
          </div>
        </div>
        <div>
          <label className="mb-2 block text-sm font-medium">密度</label>
          <select
            value={settings.appearance?.density || 'comfortable'}
            onChange={(e) => onChange('appearance.density', e.target.value)}
            className="input max-w-xs"
          >
            <option value="compact">紧凑</option>
            <option value="comfortable">舒适</option>
            <option value="spacious">宽松</option>
          </select>
        </div>
      </div>
    </div>
  );
}

function LanguageSettings({ settings, onChange }: SettingsSectionProps) {
  const { i18n } = useTranslation();

  const handleLangChange = (lang: string) => {
    i18n.changeLanguage(lang);
    onChange('language.locale', lang);
  };

  return (
    <div className="card p-6">
      <h2 className="mb-4 flex items-center gap-2 text-lg font-semibold">
        <Translate size={20} className="text-primary-500" />
        语言设置
      </h2>
      <div className="space-y-6">
        <div>
          <label className="mb-3 block text-sm font-medium">界面语言</label>
          <div className="grid gap-3 sm:grid-cols-2">
            {[
              { code: 'zh-CN', label: '简体中文', flag: '🇨🇳' },
              { code: 'en', label: 'English', flag: '🇺🇸' }
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
          <label className="mb-2 block text-sm font-medium">知识库默认语言</label>
          <select
            value={settings.language?.defaultKnowledgeLang || 'zh-CN'}
            onChange={(e) => onChange('language.defaultKnowledgeLang', e.target.value)}
            className="input max-w-xs"
          >
            <option value="zh-CN">简体中文</option>
            <option value="en">English</option>
            <option value="auto">自动检测</option>
          </select>
        </div>
        <label className="flex items-center gap-2">
          <input
            type="checkbox"
            checked={settings.language?.autoTranslateEvidence !== false}
            onChange={(e) => onChange('language.autoTranslateEvidence', e.target.checked)}
            className="h-4 w-4 rounded"
          />
          <span className="text-sm">自动翻译证据片段</span>
        </label>
      </div>
    </div>
  );
}

function BudgetSettings({ settings, onChange }: SettingsSectionProps) {
  return (
    <div className="card p-6">
      <h2 className="mb-4 flex items-center gap-2 text-lg font-semibold">
        <Wallet size={20} className="text-primary-500" />
        预算设置
      </h2>
      <div className="space-y-6">
        <div className="grid gap-4 sm:grid-cols-3">
          <div>
            <label className="mb-2 block text-sm font-medium">日预算（美元）</label>
            <input
              type="number"
              value={settings.budget?.daily ?? 5}
              onChange={(e) => {
                const val = Number.parseFloat(e.target.value);
                onChange('budget.daily', val);
              }}
              min={0}
              step="0.1"
              className="input"
            />
          </div>
          <div>
            <label className="mb-2 block text-sm font-medium">月预算（美元）</label>
            <input
              type="number"
              value={settings.budget?.monthly ?? 50}
              onChange={(e) => onChange('budget.monthly', Number.parseFloat(e.target.value))}
              min={0}
              step="1"
              className="input"
            />
          </div>
          <div>
            <label className="mb-2 block text-sm font-medium">单次问答上限（美元）</label>
            <input
              type="number"
              value={settings.budget?.perQuery ?? 0.5}
              onChange={(e) => onChange('budget.perQuery', Number.parseFloat(e.target.value))}
              min={0}
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
              onChange={(e) => onChange('budget.nightFuse', e.target.checked)}
              className="h-4 w-4 rounded"
            />
            <span className="text-sm">启用夜间熔断（23:00-06:00 限制使用）</span>
          </label>
          <label className="flex items-center gap-2">
            <input
              type="checkbox"
              checked={settings.budget?.alertEnabled !== false}
              onChange={(e) => onChange('budget.alertEnabled', e.target.checked)}
              className="h-4 w-4 rounded"
            />
            <span className="text-sm">预算告警</span>
          </label>
          <div>
            <label className="mb-2 block text-sm font-medium">告警阈值（使用百分比）</label>
            <input
              type="range"
              min={50}
              max={100}
              value={settings.budget?.alertThreshold ?? 80}
              onChange={(e) => onChange('budget.alertThreshold', Number.parseInt(e.target.value))}
              className="w-full max-w-xs"
            />
            <span className="ml-2 text-sm text-slate-500">
              {settings.budget?.alertThreshold ?? 80}%
            </span>
          </div>
        </div>
      </div>
    </div>
  );
}

function ModelAllocationSettings({ settings, onChange }: SettingsSectionProps) {
  const adaptersQuery = useQuery({
    queryKey: ['llm-adapters'],
    queryFn: () => api.getLlmAdapters(),
    staleTime: 300_000
  });

  const tasks = [
    { id: 'qa', label: '问答', description: '用户问答、对话系统' },
    { id: 'summary', label: '摘要', description: '文档摘要、内容概括' },
    { id: 'extraction', label: '提取', description: '信息抽取、实体识别' },
    { id: 'reasoning', label: '推理', description: '复杂推理、多步反思' },
    { id: 'rewrite', label: '改写', description: '知识改写、内容优化' },
    { id: 'draft', label: '草稿', description: '草稿生成、初始写作' }
  ];

  const adapters = adaptersQuery.data?.adapters || [];

  return (
    <div className="card p-6">
      <h2 className="mb-4 flex items-center gap-2 text-lg font-semibold">
        <Brain size={20} className="text-primary-500" />
        模型分配
      </h2>
      <p className="mb-6 text-sm text-slate-500 dark:text-slate-400">
        为不同任务类型分配最适合的模型。拖动调整优先级。
      </p>
      <div className="space-y-3">
        {tasks.map((task) => (
          <div
            key={task.id}
            className="flex items-center gap-4 rounded-lg border border-slate-200 p-4 dark:border-slate-700"
          >
            <div className="cursor-move text-slate-400 hover:text-slate-600 dark:hover:text-slate-300">
              <DotsThreeVertical size={18} />
            </div>
            <div className="flex-1 min-w-0">
              <p className="font-medium">{task.label}</p>
              <p className="text-sm text-slate-500 dark:text-slate-400">{task.description}</p>
            </div>
            <div className="w-64">
              <select
                value={settings.models?.[task.id] || ''}
                onChange={(e) => onChange(`models.${task.id}`, e.target.value)}
                className="input w-full text-sm"
              >
                <option value="">自动选择</option>
                {adapters.map((adapter: any) => (
                  <option key={adapter.id} value={adapter.id}>
                    {adapter.name}
                  </option>
                ))}
              </select>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

function EmbeddingSettings({ settings, onChange }: SettingsSectionProps) {
  return (
    <div className="card p-6">
      <h2 className="mb-4 flex items-center gap-2 text-lg font-semibold">
        <Database size={20} className="text-primary-500" />
        嵌入设置
      </h2>
      <div className="space-y-6">
        <div>
          <label className="mb-2 block text-sm font-medium">嵌入模型</label>
          <select
            value={settings.embedding?.model || 'bge-m3'}
            onChange={(e) => onChange('embedding.model', e.target.value)}
            className="input max-w-md"
          >
            <option value="bge-m3">BAAI/bge-m3（多语言）</option>
            <option value="bge-large-zh">BAAI/bge-large-zh-v1.5（中文）</option>
            <option value="text-embedding-3">text-embedding-3-large（OpenAI）</option>
            <option value="gte-large">thenlper/gte-large</option>
          </select>
        </div>
        <div>
          <label className="mb-2 block text-sm font-medium">向量维度</label>
          <select
            value={settings.embedding?.dimensions || 1024}
            onChange={(e) => onChange('embedding.dimensions', Number.parseInt(e.target.value))}
            className="input max-w-xs"
          >
            <option value={512}>512 维</option>
            <option value={768}>768 维</option>
            <option value={1024}>1024 维</option>
            <option value={1536}>1536 维</option>
          </select>
        </div>
        <div>
          <label className="mb-2 block text-sm font-medium">Top-K 检索数量</label>
          <input
            type="range"
            min={3}
            max={50}
            value={settings.embedding?.topK ?? 10}
            onChange={(e) => onChange('embedding.topK', Number.parseInt(e.target.value))}
            className="w-full max-w-xs"
          />
          <span className="ml-2 text-sm text-slate-500">
            {settings.embedding?.topK ?? 10} 个结果
          </span>
        </div>
        <label className="flex items-center gap-2">
          <input
            type="checkbox"
            checked={settings.embedding?.hybridSearch !== false}
            onChange={(e) => onChange('embedding.hybridSearch', e.target.checked)}
            className="h-4 w-4 rounded"
          />
          <span className="text-sm">启用混合检索（BM25 + 向量）</span>
        </label>
      </div>
    </div>
  );
}

function RerankingSettings({ settings, onChange }: SettingsSectionProps) {
  return (
    <div className="card p-6">
      <h2 className="mb-4 flex items-center gap-2 text-lg font-semibold">
        <ArrowDown size={20} className="text-primary-500" />
        重排序设置
      </h2>
      <div className="space-y-6">
        <label className="flex items-center gap-2">
          <input
            type="checkbox"
            checked={settings.reranking?.enabled !== false}
            onChange={(e) => onChange('reranking.enabled', e.target.checked)}
            className="h-4 w-4 rounded"
          />
          <span className="text-sm">启用重排序</span>
        </label>
        <div>
          <label className="mb-2 block text-sm font-medium">重排序模型</label>
          <select
            value={settings.reranking?.model || 'bge-reranker-v2-m3'}
            onChange={(e) => onChange('reranking.model', e.target.value)}
            disabled={settings.reranking?.enabled === false}
            className="input max-w-md disabled:opacity-50"
          >
            <option value="bge-reranker-v2-m3">BAAI/bge-reranker-v2-m3</option>
            <option value="bge-reranker-large">BAAI/bge-reranker-large</option>
            <option value="cross-encoder">cross-encoder/ms-marco-MiniLM-L-6-v2</option>
          </select>
        </div>
        <div>
          <label className="mb-2 block text-sm font-medium">重排序后保留数量</label>
          <input
            type="range"
            min={1}
            max={20}
            value={settings.reranking?.topN ?? 5}
            onChange={(e) => onChange('reranking.topN', Number.parseInt(e.target.value))}
            className="w-full max-w-xs"
            disabled={settings.reranking?.enabled === false}
          />
          <span className="ml-2 text-sm text-slate-500">
            {settings.reranking?.topN ?? 5} 个结果
          </span>
        </div>
      </div>
    </div>
  );
}

function NLISettings({ settings, onChange }: SettingsSectionProps) {
  return (
    <div className="card p-6">
      <h2 className="mb-4 flex items-center gap-2 text-lg font-semibold">
        <ClipboardText size={20} className="text-primary-500" />
        NLI 设置
      </h2>
      <p className="mb-6 text-sm text-slate-500 dark:text-slate-400">
        自然语言推理用于验证 AI 生成内容与证据的一致性。
      </p>
      <div className="space-y-6">
        <label className="flex items-center gap-2">
          <input
            type="checkbox"
            checked={settings.nli?.enabled !== false}
            onChange={(e) => onChange('nli.enabled', e.target.checked)}
            className="h-4 w-4 rounded"
          />
          <span className="text-sm">启用 NLI 验证</span>
        </label>
        <div>
          <label className="mb-2 block text-sm font-medium">NLI 模型</label>
          <select
            value={settings.nli?.model || 'xiaobu-v2'}
            onChange={(e) => onChange('nli.model', e.target.value)}
            disabled={settings.nli?.enabled === false}
            className="input max-w-md disabled:opacity-50"
          >
            <option value="xiaobu-v2">hfl/xcop-mnli-xiaobu-zh-v2</option>
            <option value="roberta-large-mnli">roberta-large-mnli</option>
            <option value="bart-mnli">facebook/bart-large-mnli</option>
          </select>
        </div>
        <div>
          <label className="mb-2 block text-sm font-medium">蕴含阈值</label>
          <input
            type="range"
            min={0}
            max={100}
            value={(settings.nli?.entailmentThreshold ?? 0.7) * 100}
            onChange={(e) =>
              onChange('nli.entailmentThreshold', Number.parseInt(e.target.value) / 100)
            }
            className="w-full max-w-xs"
            disabled={settings.nli?.enabled === false}
          />
          <span className="ml-2 text-sm text-slate-500">
            {((settings.nli?.entailmentThreshold ?? 0.7) * 100).toFixed(0)}%
          </span>
        </div>
        <div>
          <label className="mb-2 block text-sm font-medium">多轮反思次数</label>
          <select
            value={settings.nli?.maxReflections ?? 3}
            onChange={(e) => onChange('nli.maxReflections', Number.parseInt(e.target.value))}
            disabled={settings.nli?.enabled === false}
            className="input max-w-xs disabled:opacity-50"
          >
            <option value={0}>0 次（禁用反思）</option>
            <option value={1}>1 次</option>
            <option value={2}>2 次</option>
            <option value={3}>3 次</option>
            <option value={5}>5 次</option>
          </select>
        </div>
      </div>
    </div>
  );
}

function DataSettings({ settings, onChange }: SettingsSectionProps) {
  return (
    <div className="card p-6">
      <h2 className="mb-4 flex items-center gap-2 text-lg font-semibold">
        <Folder size={20} className="text-primary-500" />
        数据设置
      </h2>
      <div className="space-y-6">
        <div>
          <label className="mb-2 block text-sm font-medium">知识库目录</label>
          <input
            type="text"
            value={settings.data?.libraryPath || './library'}
            onChange={(e) => onChange('data.libraryPath', e.target.value)}
            className="input font-mono text-sm"
          />
        </div>
        <div>
          <label className="mb-2 block text-sm font-medium">观察目录</label>
          <input
            type="text"
            value={settings.data?.observedPath || './observed'}
            onChange={(e) => onChange('data.observedPath', e.target.value)}
            className="input font-mono text-sm"
          />
        </div>
        <label className="flex items-center gap-2">
          <input
            type="checkbox"
            checked={settings.data?.autoObserve !== false}
            onChange={(e) => onChange('data.autoObserve', e.target.checked)}
            className="h-4 w-4 rounded"
          />
          <span className="text-sm">自动观察文件变化</span>
        </label>
        <label className="flex items-center gap-2">
          <input
            type="checkbox"
            checked={settings.data?.versionControl !== false}
            onChange={(e) => onChange('data.versionControl', e.target.checked)}
            className="h-4 w-4 rounded"
          />
          <span className="text-sm">启用版本控制（自动归档历史版本）</span>
        </label>
        <div>
          <label className="mb-2 block text-sm font-medium">版本保留数量</label>
          <select
            value={settings.data?.maxVersions ?? 50}
            onChange={(e) => onChange('data.maxVersions', Number.parseInt(e.target.value))}
            className="input max-w-xs"
          >
            <option value={10}>10 个版本</option>
            <option value={25}>25 个版本</option>
            <option value={50}>50 个版本</option>
            <option value={100}>100 个版本</option>
            <option value={0}>全部保留</option>
          </select>
        </div>
        <div className="rounded-lg border border-amber-200 bg-amber-50 p-4 dark:border-amber-800 dark:bg-amber-900/20">
          <p className="text-sm font-medium text-amber-800 dark:text-amber-200">危险操作</p>
          <p className="mt-1 text-xs text-amber-700 dark:text-amber-300">
            清理孤立关系，移除指向已删除条目的链接。
          </p>
          <button
            onClick={() => api.cleanGhostRelations()}
            className="mt-3 btn bg-amber-600 text-white hover:bg-amber-700 text-xs"
          >
            <Trash size={14} className="mr-1.5" />
            清理孤立关系
          </button>
        </div>
      </div>
    </div>
  );
}

function AdvancedSettings({ settings, onChange }: SettingsSectionProps) {
  return (
    <div className="card p-6">
      <h2 className="mb-4 flex items-center gap-2 text-lg font-semibold">
        <SlidersHorizontal size={20} className="text-primary-500" />
        高级设置
      </h2>
      <div className="space-y-6">
        <label className="flex items-center gap-2">
          <input
            type="checkbox"
            checked={settings.advanced?.shadowEval !== false}
            onChange={(e) => onChange('advanced.shadowEval', e.target.checked)}
            className="h-4 w-4 rounded"
          />
          <span className="text-sm">启用影子评测（后台自动评估输出质量）</span>
        </label>
        <label className="flex items-center gap-2">
          <input
            type="checkbox"
            checked={settings.advanced?.semanticRings !== false}
            onChange={(e) => onChange('advanced.semanticRings', e.target.checked)}
            className="h-4 w-4 rounded"
          />
          <span className="text-sm">启用语义年轮</span>
        </label>
        <div>
          <label className="mb-2 block text-sm font-medium">日志级别</label>
          <select
            value={settings.advanced?.logLevel || 'info'}
            onChange={(e) => onChange('advanced.logLevel', e.target.value)}
            className="input max-w-xs"
          >
            <option value="debug">Debug（详细）</option>
            <option value="info">Info（信息）</option>
            <option value="warn">Warning（警告）</option>
            <option value="error">Error（错误）</option>
          </select>
        </div>
        <div>
          <label className="mb-2 block text-sm font-medium">请求超时（秒）</label>
          <input
            type="number"
            value={settings.advanced?.timeout ?? 60}
            onChange={(e) => onChange('advanced.timeout', Number.parseInt(e.target.value))}
            min={10}
            className="input max-w-xs"
          />
        </div>
        <div>
          <label className="mb-2 block text-sm font-medium">并发请求数</label>
          <input
            type="number"
            value={settings.advanced?.concurrency ?? 3}
            onChange={(e) => onChange('advanced.concurrency', Number.parseInt(e.target.value))}
            min={1}
            max={20}
            className="input max-w-xs"
          />
        </div>
      </div>
    </div>
  );
}

interface LlmAdapterInfo {
  id: string;
  name: string;
  enabled: boolean;
  apiKeyConfigured?: boolean;
  models?: string[];
}

function DiagnosticsSettings() {
  const { t } = useTranslation();

  const adaptersQuery = useQuery({
    queryKey: ['llm-adapters-diagnostics'],
    queryFn: () => api.getLlmAdapters(),
    staleTime: 60_000
  });

  const adapters: LlmAdapterInfo[] = adaptersQuery.data?.adapters || [];

  return (
    <div className="card p-6">
      <h2 className="mb-4 flex items-center gap-2 text-lg font-semibold">
        <Plug size={20} className="text-primary-500" />
        {t('diagnostics.title', '集成诊断')}
      </h2>
      <p className="mb-6 text-sm text-slate-500 dark:text-slate-400">
        {t('diagnostics.subtitle', '检测每个 LLM 适配器的连通性与 API Key 配置情况。')}
      </p>

      {adaptersQuery.isLoading ? (
        <div className="flex items-center justify-center py-8 text-sm text-slate-500 dark:text-slate-400">
          <Spinner size={18} className="mr-2 animate-spin" />
          {t('common.loading')}
        </div>
      ) : adaptersQuery.isError ? (
        <div className="rounded-lg border border-red-200 bg-red-50 p-4 dark:border-red-800 dark:bg-red-900/20">
          <p className="flex items-center gap-2 text-sm font-medium text-red-700 dark:text-red-300">
            <XCircle size={16} />
            {t('diagnostics.loadFailed', '加载适配器列表失败')}
          </p>
        </div>
      ) : adapters.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-10 text-center text-sm text-slate-400">
          <Plug size={32} className="mb-2" />
          {t('diagnostics.noAdapters', '暂无可用适配器')}
        </div>
      ) : (
        <div className="space-y-3">
          {adapters.map((adapter) => (
            <AdapterDiagnosticRow key={adapter.id} adapter={adapter} />
          ))}
        </div>
      )}
    </div>
  );
}

function AdapterDiagnosticRow({ adapter }: { adapter: LlmAdapterInfo }) {
  const { t } = useTranslation();

  const testMutation = useMutation({
    mutationFn: () => api.testLlmAdapter(adapter.id)
  });

  const isPending = testMutation.isPending;
  const result = testMutation.data;
  const isError = testMutation.isError;

  return (
    <div className="flex flex-wrap items-center gap-3 rounded-lg border border-slate-200 p-4 dark:border-slate-700">
      <div className="flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-lg bg-primary-50 text-primary-600 dark:bg-primary-900/30 dark:text-primary-400">
        <Lightning size={18} />
      </div>
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-2">
          <span className="truncate text-sm font-medium text-slate-800 dark:text-slate-100">
            {adapter.name}
          </span>
          <span
            className={`badge ${adapter.enabled ? 'badge-green' : 'badge-red'}`}
            title={
              adapter.enabled
                ? t('diagnostics.enabled', '已启用')
                : t('diagnostics.disabled', '未启用')
            }
          >
            {adapter.enabled
              ? t('diagnostics.enabled', '已启用')
              : t('diagnostics.disabled', '未启用')}
          </span>
          {adapter.apiKeyConfigured !== undefined && (
            <span
              className={`badge ${adapter.apiKeyConfigured ? 'badge-green' : 'badge-red'}`}
              title={
                adapter.apiKeyConfigured
                  ? t('diagnostics.apiKeyConfigured')
                  : t('diagnostics.apiKeyMissing')
              }
            >
              {adapter.apiKeyConfigured
                ? t('diagnostics.apiKeyConfigured')
                : t('diagnostics.apiKeyMissing')}
            </span>
          )}
        </div>
        {adapter.models && adapter.models.length > 0 && (
          <p className="mt-1 truncate text-xs text-slate-500 dark:text-slate-400">
            {adapter.models.join(' · ')}
          </p>
        )}
      </div>

      <button
        type="button"
        onClick={() => testMutation.mutate()}
        disabled={isPending}
        className="btn btn-secondary text-sm"
      >
        {isPending ? (
          <>
            <Spinner size={14} className="mr-1.5 animate-spin" />
            {t('diagnostics.testing', '测试中...')}
          </>
        ) : (
          <>
            <Plug size={14} className="mr-1.5" />
            {t('diagnostics.testConnection', '测试连接')}
          </>
        )}
      </button>

      <div className="w-full">
        {result && result.ok && (
          <p className="flex items-center gap-1.5 text-xs font-medium text-green-600 dark:text-green-400">
            <CheckCircle size={14} />
            {t('diagnostics.success', '连接成功')} ·{t('diagnostics.latency', '延迟')}：
            {result.latencyMs}
            ms
          </p>
        )}
        {((result && !result.ok) || isError) && (
          <p className="flex items-center gap-1.5 text-xs font-medium text-red-600 dark:text-red-400">
            <XCircle size={14} />
            {t('diagnostics.failed', '连接失败')}
            {result?.error ? `：${result.error}` : ''}
          </p>
        )}
      </div>
    </div>
  );
}
