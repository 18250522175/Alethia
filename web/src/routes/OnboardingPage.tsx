import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useNavigate } from 'react-router-dom';
import {
  BookOpen,
  Brain,
  ShieldCheck,
  GearSix,
  ArrowLeft,
  ArrowRight,
  Sparkle,
  X,
} from '@phosphor-icons/react';

type Accent = 'primary' | 'knowledge' | 'parchment' | 'slate';

interface OnboardingStep {
  icon: React.ElementType;
  titleKey: string;
  titleDefault: string;
  descKey: string;
  descDefault: string;
  accent: Accent;
}

const ACCENTS: Record<Accent, { iconBg: string; iconText: string }> = {
  primary: {
    iconBg: 'bg-primary-100 dark:bg-primary-900/40',
    iconText: 'text-primary-600 dark:text-primary-400',
  },
  knowledge: {
    iconBg: 'bg-knowledge-100 dark:bg-knowledge-900/40',
    iconText: 'text-knowledge-600 dark:text-knowledge-400',
  },
  parchment: {
    iconBg: 'bg-parchment-100 dark:bg-parchment-900/40',
    iconText: 'text-parchment-600 dark:text-parchment-400',
  },
  slate: {
    iconBg: 'bg-slate-100 dark:bg-slate-700/60',
    iconText: 'text-slate-600 dark:text-slate-300',
  },
};

const STEPS: OnboardingStep[] = [
  {
    icon: BookOpen,
    titleKey: 'onboarding.welcomeTitle',
    titleDefault: '欢迎使用 Alethia 知识库',
    descKey: 'onboarding.welcomeDesc',
    descDefault:
      '一个由 AI 驱动的知识管理系统：自动从文档中提取知识、构建实体图谱，并通过对话问答帮助你探索与理解知识。',
    accent: 'primary',
  },
  {
    icon: Brain,
    titleKey: 'onboarding.qaTitle',
    titleDefault: 'AI 智能问答',
    descKey: 'onboarding.qaDesc',
    descDefault:
      '在问答面板向 AI 提问，每个答案都附带可追溯的来源证据，并支持最多 3 轮反思以提升准确性。',
    accent: 'knowledge',
  },
  {
    icon: GraphIcon,
    titleKey: 'onboarding.graphTitle',
    titleDefault: '知识图谱',
    descKey: 'onboarding.graphDesc',
    descDefault:
      '以可视化图谱浏览实体之间的关系，节点大小反映关联强度，红色虚线标识需要清理的幽灵关系。',
    accent: 'parchment',
  },
  {
    icon: ShieldCheck,
    titleKey: 'onboarding.reviewTitle',
    titleDefault: '审核面板',
    descKey: 'onboarding.reviewDesc',
    descDefault:
      '人类掌权机制：所有 AI 自动提取的知识变更，都需经过你确认后才会写入知识库，确保内容始终可信。',
    accent: 'slate',
  },
  {
    icon: GearSix,
    titleKey: 'onboarding.settingsTitle',
    titleDefault: '设置与个性化',
    descKey: 'onboarding.settingsDesc',
    descDefault:
      '在设置中配置大模型适配器、调整预算上限、外观主题与语言，让知识库完全贴合你的工作方式。',
    accent: 'primary',
  },
];

const STORAGE_KEY = 'onboarding_completed';
const STEP_KEY = 'onboarding_step';

export default function OnboardingPage() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  // 从 localStorage 恢复进度
  const [current, setCurrent] = useState(() => {
    try {
      const saved = localStorage.getItem(STEP_KEY);
      const step = saved ? parseInt(saved, 10) : 0;
      return step >= 0 && step < STEPS.length ? step : 0;
    } catch (err) {
      console.warn('读取新手引导步骤进度失败', err);
      return 0;
    }
  });

  // 保存当前步骤进度
  const saveProgress = (step: number) => {
    try {
      localStorage.setItem(STEP_KEY, String(step));
    } catch (err) {
      console.warn('保存新手引导步骤进度失败', err);
      // localStorage may be unavailable (private mode)
    }
  };

  const total = STEPS.length;
  const step = STEPS[current];
  const isFirst = current === 0;
  const isLast = current === total - 1;
  const accent = ACCENTS[step.accent];
  const StepIcon = step.icon;

  const finish = () => {
    try {
      localStorage.setItem(STORAGE_KEY, 'true');
      localStorage.removeItem(STEP_KEY); // 清除进度
    } catch (err) {
      console.warn('完成新手引导失败', err);
      // localStorage may be unavailable (private mode); proceed anyway
    }
    navigate('/', { replace: true });
  };

  const handleNext = () => {
    if (isLast) {
      finish();
      return;
    }
    const nextStep = current + 1;
    setCurrent(nextStep);
    saveProgress(nextStep);
  };

  const handlePrev = () => {
    if (!isFirst) {
      const prevStep = current - 1;
      setCurrent(prevStep);
      saveProgress(prevStep);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 p-4 backdrop-blur-sm animate-fade-in">
      <div
        role="dialog"
        aria-modal="true"
        aria-label={t('onboarding.title', '新手引导')}
        className="card relative w-full max-w-lg overflow-hidden rounded-2xl shadow-2xl"
      >
        <button
          onClick={finish}
          aria-label={t('common.skip', '跳过')}
          className="absolute right-4 top-4 z-10 rounded-lg p-1.5 text-slate-400 transition-colors hover:bg-slate-100 hover:text-slate-600 dark:hover:bg-slate-700 dark:hover:text-slate-200"
        >
          <X size={18} />
        </button>

        <div className="px-8 pb-8 pt-10 text-center sm:px-12">
          <div className="mb-6 text-xs font-medium uppercase tracking-wider text-slate-400 dark:text-slate-500">
            {t('onboarding.stepLabel', '步骤')} {current + 1} / {total}
          </div>

          <div
            key={`icon-${current}`}
            className={`mx-auto mb-6 flex h-20 w-20 items-center justify-center rounded-2xl ${accent.iconBg} animate-slide-up`}
          >
            <StepIcon size={40} weight="duotone" className={accent.iconText} />
          </div>

          <div key={`text-${current}`} className="animate-slide-up">
            <h2 className="mb-3 text-2xl font-bold text-slate-900 dark:text-slate-100">
              {t(step.titleKey, step.titleDefault)}
            </h2>
            <p className="mx-auto max-w-md text-sm leading-relaxed text-slate-500 dark:text-slate-400">
              {t(step.descKey, step.descDefault)}
            </p>
          </div>

          {/* Progress indicator: dots + connecting lines */}
          <div className="mt-8 flex items-center justify-center">
            {STEPS.map((_, i) => {
              const isCompleted = i < current;
              const isActive = i === current;
              return (
                <div key={i} className="flex items-center">
                  {i > 0 && (
                    <span
                      className={`h-0.5 w-6 rounded-full transition-colors duration-300 sm:w-8 ${
                        i <= current ? 'bg-primary-400' : 'bg-slate-200 dark:bg-slate-700'
                      }`}
                    />
                  )}
                  <span
                    className={`rounded-full transition-all duration-300 ${
                      isActive
                        ? 'h-3 w-3 bg-primary-500'
                        : isCompleted
                          ? 'h-2 w-2 bg-primary-500'
                          : 'h-2 w-2 bg-slate-200 dark:bg-slate-700'
                    }`}
                  />
                </div>
              );
            })}
          </div>

          {/* Navigation actions */}
          <div className="mt-8 flex items-center justify-between gap-3">
            <div className="min-w-[88px] text-left">
              {!isFirst && (
                <button onClick={handlePrev} className="btn btn-ghost">
                  <ArrowLeft size={16} className="mr-1.5" />
                  {t('common.previous', '上一步')}
                </button>
              )}
            </div>
            <div className="flex items-center gap-2">
              <button onClick={finish} className="btn btn-ghost">
                {t('common.skip', '跳过')}
              </button>
              <button onClick={handleNext} className="btn btn-primary">
                {isLast ? (
                  <>
                    <Sparkle size={16} className="mr-1.5" />
                    {t('onboarding.start', '开始使用')}
                  </>
                ) : (
                  <>
                    {t('common.next', '下一步')}
                    <ArrowRight size={16} className="ml-1.5" />
                  </>
                )}
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
