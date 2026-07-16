import type { Settings } from '@shared/index';
import { RECOMMENDED_MODEL_ASSIGNMENT } from '@shared/index';

export const defaultSettings: Settings = {
  appearance: { theme: 'system', fontSize: 'medium' },
  general: {
    knowledgeBaseName: '理想 AI 知识库',
    defaultHomePage: '/',
    dashboardRefreshInterval: 30,
    timeFormat: '24h'
  },
  language: 'zh-CN',
  llmConfig: { defaultTemperature: 0.7, defaultMaxTokens: 4096, defaultTopP: 0.9 },
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
