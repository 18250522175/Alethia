export type ThemeMode = 'system' | 'light' | 'dark';
export type FontSize = 'small' | 'medium' | 'large';
export type Language = 'zh-CN' | 'en' | 'ja';

export interface AppearanceSettings {
  theme: ThemeMode;
  fontSize: FontSize;
  density?: 'compact' | 'comfortable' | 'spacious';
  accentColor?: 'blue' | 'purple' | 'green' | 'orange' | 'pink';
}

export interface GeneralSettings {
  knowledgeBaseName: string;
  defaultHomePage: string;
  dashboardRefreshInterval: number;
  timeFormat: '24h' | '12h';
}

export interface LanguageSettings {
  translateEvidence: boolean;
  translationModel: string;
  evidenceDisplayMode: 'translation' | 'original' | 'both';
  fallbackLanguage: string;
}

export type ModelTier = 'fact_extract' | 'whitelist_fix' | 'disambiguate' | 'nli_pre' | 'translate' | 'compress' | 'archive_summary' | 'ring_gen' | 'contradiction' | 'gap_analysis' | 'narrate' | 'qa_gen' | 'embed';

export interface ModelAssignment {
  [task: string]: { adapterId: string; model: string };
}

export interface BudgetSettings {
  dailyBudget: number;
  monthlyBudget: number;
  perQueryBudget: number;
  nightlyFuse: boolean;
  modelAssignment: ModelAssignment;
}

export interface SecuritySettings {
  apiKey: string;
  sessionTimeout: number;
  mcpClientIds: string[];
  auditLogEnabled: boolean;
}

export interface PrivacySettings {
  desensitizePatterns: string[];
  customPatterns: { pattern: string; description: string }[];
  placeholder: string;
}

export interface TaskSettings {
  nightlyStart: string;
  communityDetection: boolean;
  contradictionAnalysis: boolean;
  ringGeneration: boolean;
  archiveVersions: boolean;
  ghostCleanup: boolean;
  weeklyEvalDay: number;
  observeThreshold: number;
}

export interface PathSettings {
  rootPath: string;
  libraryPath: string;
  archivePath: string;
  exportsPath: string;
}

export type AdapterId = 'bailian' | 'zhipu' | 'moonshot' | 'ernie' | 'spark' | 'hunyuan' | 'minimax' | 'deepseek' | 'yi' | 'baichuan';

export interface IntegrationSettings {
  mcpHttpEnabled: boolean;
  mcpHttpPort: number;
  corsAllowedOrigins: string[];
  llmAdapters: Record<AdapterId, { apiKey: string; enabled: boolean; defaultModel: string }>;
  reranker: { enabled: boolean; apiKey: string };
  nliProvider: 'hf-inference' | 'local';
  hfApiKey: string;
}

export interface ExperimentalSettings {
  imageRegionAnnotation: boolean;
  externalKnowledgeEnrich: boolean;
  autoTranscribeMedia: boolean;
}

export interface Settings {
  appearance: AppearanceSettings;
  general: GeneralSettings;
  language: Language;
  budget: BudgetSettings;
  security: SecuritySettings;
  privacy: PrivacySettings;
  tasks: TaskSettings;
  paths: PathSettings;
  integration: IntegrationSettings;
  experimental: ExperimentalSettings;
}

export const RECOMMENDED_MODEL_ASSIGNMENT: ModelAssignment = {
  fact_extract: { adapterId: 'deepseek', model: 'deepseek-chat' },
  whitelist_fix: { adapterId: 'deepseek', model: 'deepseek-chat' },
  disambiguate: { adapterId: 'deepseek', model: 'deepseek-chat' },
  nli_pre: { adapterId: 'deepseek', model: 'deepseek-chat' },
  translate: { adapterId: 'deepseek', model: 'deepseek-chat' },
  compress: { adapterId: 'deepseek', model: 'deepseek-chat' },
  archive_summary: { adapterId: 'deepseek', model: 'deepseek-chat' },
  ring_gen: { adapterId: 'deepseek', model: 'deepseek-chat' },
  contradiction: { adapterId: 'deepseek', model: 'deepseek-chat' },
  gap_analysis: { adapterId: 'deepseek', model: 'deepseek-chat' },
  narrate: { adapterId: 'deepseek', model: 'deepseek-chat' },
  qa_gen: { adapterId: 'deepseek', model: 'deepseek-chat' },
  embed: { adapterId: 'deepseek', model: 'text-embedding-v1' }
};

export const defaultSettings: Settings = {
  appearance: { theme: 'system', fontSize: 'medium', density: 'comfortable', accentColor: 'blue' },
  general: {
    knowledgeBaseName: '理想 AI 知识库',
    defaultHomePage: '/',
    dashboardRefreshInterval: 30,
    timeFormat: '24h'
  },
  language: 'zh-CN',
  budget: {
    dailyBudget: 5,
    monthlyBudget: 50,
    perQueryBudget: 0.5,
    nightlyFuse: true,
    modelAssignment: RECOMMENDED_MODEL_ASSIGNMENT
  },
  security: { apiKey: '', sessionTimeout: 3600, mcpClientIds: [], auditLogEnabled: true },
  privacy: {
    desensitizePatterns: ['ID_CARD', 'PHONE', 'EMAIL'],
    customPatterns: [],
    placeholder: '[已脱敏]'
  },
  tasks: {
    nightlyStart: '02:00',
    communityDetection: true,
    contradictionAnalysis: true,
    ringGeneration: true,
    archiveVersions: true,
    ghostCleanup: true,
    weeklyEvalDay: 0,
    observeThreshold: 3
  },
  paths: {
    rootPath: '/data',
    libraryPath: '/data/library',
    archivePath: '/data/changelog',
    exportsPath: '/data/exports'
  },
  integration: {
    mcpHttpEnabled: false,
    mcpHttpPort: 3100,
    corsAllowedOrigins: ['*'],
    llmAdapters: {
      bailian: { apiKey: '', enabled: false, defaultModel: 'qwen-turbo' },
      zhipu: { apiKey: '', enabled: false, defaultModel: 'glm-4-flash' },
      moonshot: { apiKey: '', enabled: false, defaultModel: 'moonshot-v1-8k' },
      ernie: { apiKey: '', enabled: false, defaultModel: 'ernie-speed-128k' },
      spark: { apiKey: '', enabled: false, defaultModel: 'spark-lite' },
      hunyuan: { apiKey: '', enabled: false, defaultModel: 'hunyuan-lite' },
      minimax: { apiKey: '', enabled: false, defaultModel: 'abab6.5-chat' },
      deepseek: { apiKey: '', enabled: false, defaultModel: 'deepseek-chat' },
      yi: { apiKey: '', enabled: false, defaultModel: 'yi-large' },
      baichuan: { apiKey: '', enabled: false, defaultModel: 'Baichuan2-Turbo' }
    },
    reranker: { enabled: false, apiKey: '' },
    nliProvider: 'local',
    hfApiKey: ''
  },
  experimental: {
    imageRegionAnnotation: false,
    externalKnowledgeEnrich: false,
    autoTranscribeMedia: false
  }
};
