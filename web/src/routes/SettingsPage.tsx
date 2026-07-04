import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import {
  Palette,
  Gauge,
  Translate,
  Wallet,
  Shield,
  Eye,
  ClockCounterClockwise,
  Folder,
  PuzzlePiece,
  Flask,
  Check,
  WifiHigh
} from '@phosphor-icons/react';

const sections = [
  { id: 'appearance', icon: Palette, label: '外观' },
  { id: 'general', icon: Gauge, label: '通用' },
  { id: 'language', icon: Translate, label: '语言' },
  { id: 'budget', icon: Wallet, label: '预算' },
  { id: 'security', icon: Shield, label: '安全' },
  { id: 'privacy', icon: Eye, label: '隐私' },
  { id: 'tasks', icon: ClockCounterClockwise, label: '任务' },
  { id: 'paths', icon: Folder, label: '路径' },
  { id: 'integration', icon: PuzzlePiece, label: '集成' },
  { id: 'experimental', icon: Flask, label: '实验功能' },
];

export default function SettingsPage() {
  const { t } = useTranslation();
  const [activeSection, setActiveSection] = useState('integration');

  return (
    <div className="animate-fade-in">
      <h1 className="mb-6 text-2xl font-bold">{t('settings.title')}</h1>

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

        <div className="lg:col-span-3">
          <div className="card p-6">
            {activeSection === 'integration' && <IntegrationSettings />}
            {activeSection === 'appearance' && <AppearanceSettings />}
            {activeSection === 'general' && <GeneralSettings />}
            {activeSection === 'budget' && <BudgetSettings />}
          </div>
        </div>
      </div>
    </div>
  );
}

function IntegrationSettings() {
  const adapters = [
    { id: 'bailian', name: '阿里云百炼', model: 'qwen-turbo', configured: false },
    { id: 'zhipu', name: '智谱 AI', model: 'glm-4-flash', configured: false },
    { id: 'moonshot', name: '月之暗面 Kimi', model: 'moonshot-v1-8k', configured: false },
    { id: 'ernie', name: '百度文心一言', model: 'ernie-speed-128k', configured: false },
    { id: 'spark', name: '科大讯飞星火', model: 'spark-lite', configured: false },
    { id: 'hunyuan', name: '腾讯混元', model: 'hunyuan-lite', configured: false },
    { id: 'minimax', name: 'MiniMax', model: 'abab6.5-chat', configured: false },
    { id: 'deepseek', name: 'DeepSeek', model: 'deepseek-chat', configured: false },
    { id: 'yi', name: '零一万物 Yi', model: 'yi-large', configured: false },
    { id: 'baichuan', name: '百川智能', model: 'Baichuan2-Turbo', configured: false },
  ];

  return (
    <div>
      <h2 className="mb-4 text-lg font-semibold">大模型适配器</h2>
      <p className="mb-6 text-sm text-slate-500 dark:text-slate-400">
        配置至少一个大模型服务商的 API Key 以启用 AI 功能。所有密钥安全存储在本地服务器。
      </p>

      <div className="space-y-3">
        {adapters.map((adapter) => (
          <div
          key={adapter.id}
          className="flex items-center justify-between rounded-lg border border-slate-200 p-4 dark:border-slate-700"
        >
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-slate-100 dark:bg-slate-700">
              <WifiHigh size={20} className="text-slate-500" />
            </div>
            <div>
              <p className="font-medium">{adapter.name}</p>
              <p className="text-sm text-slate-500 dark:text-slate-400">
                默认模型：{adapter.model}
              </p>
            </div>
          </div>
          <div className="flex items-center gap-3">
            {adapter.configured ? (
            <span className="badge badge-green">已配置</span>
            ) : (
            <span className="badge badge-yellow">未配置</span>
            )}
            <button className="btn btn-secondary text-sm">
              配置
            </button>
          </div>
          </div>
        ))}
      </div>
    </div>
  );
}

function AppearanceSettings() {
  return (
    <div>
      <h2 className="mb-4 text-lg font-semibold">外观设置</h2>
      <div className="space-y-4">
        <div>
          <label className="mb-2 block text-sm font-medium">主题模式</label>
          <div className="flex gap-3">
            {['跟随系统', '浅色', '深色'].map((theme) => (
            <button
              key={theme}
              className="btn btn-secondary"
            >
              {theme}
            </button>
            ))}
          </div>
        </div>
        <div>
          <label className="mb-2 block text-sm font-medium">字体大小</label>
          <select className="input max-w-xs">
            <option>小</option>
            <option>中</option>
            <option>大</option>
          </select>
        </div>
      </div>
    </div>
  );
}

function GeneralSettings() {
  return (
    <div>
      <h2 className="mb-4 text-lg font-semibold">通用设置</h2>
      <div className="space-y-4">
        <div>
          <label className="mb-2 block text-sm font-medium">知识库名称</label>
          <input type="text" defaultValue="理想 AI 知识库" className="input max-w-md" />
        </div>
        <div>
          <label className="mb-2 block text-sm font-medium">仪表盘刷新间隔（秒）</label>
          <input type="number" defaultValue={30} className="input max-w-xs" />
        </div>
        <div>
          <label className="mb-2 block text-sm font-medium">时间格式</label>
          <select className="input max-w-xs">
            <option>24 小时制</option>
            <option>12 小时制</option>
          </select>
        </div>
      </div>
    </div>
  );
}

function BudgetSettings() {
  return (
    <div>
      <h2 className="mb-4 text-lg font-semibold">预算设置</h2>
      <div className="space-y-4">
        <div className="grid gap-4 sm:grid-cols-3">
          <div>
            <label className="mb-2 block text-sm font-medium">日预算（美元）</label>
            <input type="number" defaultValue={5} className="input" />
          </div>
          <div>
            <label className="mb-2 block text-sm font-medium">月预算（美元）</label>
            <input type="number" defaultValue={50} className="input" />
          </div>
          <div>
            <label className="mb-2 block text-sm font-medium">单次问答上限（美元）</label>
            <input type="number" defaultValue={0.5} step="0.1" className="input" />
          </div>
        </div>
        <label className="flex items-center gap-2">
          <input type="checkbox" defaultChecked className="h-4 w-4 rounded" />
          <span className="text-sm">启用夜间熔断</span>
        </label>
      </div>
    </div>
  );
}
