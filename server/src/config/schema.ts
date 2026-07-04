import { z } from 'zod';

export const ThemeModeSchema = z.enum(['system', 'light', 'dark']);
export const FontSizeSchema = z.enum(['small', 'medium', 'large']);
export const LanguageSchema = z.enum(['zh-CN', 'en', 'ja']);

export const AppearanceSettingsSchema = z.object({
  theme: ThemeModeSchema,
  fontSize: FontSizeSchema
});

export const GeneralSettingsSchema = z.object({
  knowledgeBaseName: z.string(),
  defaultHomePage: z.string(),
  dashboardRefreshInterval: z.number(),
  timeFormat: z.enum(['24h', '12h'])
});

export const LanguageSettingsSchema = z.object({
  translateEvidence: z.boolean(),
  translationModel: z.string(),
  evidenceDisplayMode: z.enum(['translation', 'original', 'both']),
  fallbackLanguage: z.string()
});

export const ModelTierSchema = z.enum([
  'fact_extract', 'whitelist_fix', 'disambiguate', 'nli_pre',
  'translate', 'compress', 'archive_summary', 'ring_gen',
  'contradiction', 'gap_analysis', 'narrate', 'qa_gen', 'embed'
]);

export const ModelAssignmentEntrySchema = z.object({
  adapterId: z.string(),
  model: z.string()
});

export const ModelAssignmentSchema = z.record(ModelAssignmentEntrySchema);

export const BudgetSettingsSchema = z.object({
  dailyBudget: z.number(),
  monthlyBudget: z.number(),
  perQueryBudget: z.number(),
  nightlyFuse: z.boolean(),
  modelAssignment: ModelAssignmentSchema
});

export const SecuritySettingsSchema = z.object({
  apiKey: z.string(),
  sessionTimeout: z.number(),
  mcpClientIds: z.array(z.string()),
  auditLogEnabled: z.boolean()
});

export const PrivacyPatternSchema = z.object({
  pattern: z.string(),
  description: z.string()
});

export const PrivacySettingsSchema = z.object({
  desensitizePatterns: z.array(z.string()),
  customPatterns: z.array(PrivacyPatternSchema),
  placeholder: z.string()
});

export const TaskSettingsSchema = z.object({
  nightlyStart: z.string(),
  communityDetection: z.boolean(),
  contradictionAnalysis: z.boolean(),
  ringGeneration: z.boolean(),
  archiveVersions: z.boolean(),
  ghostCleanup: z.boolean(),
  weeklyEvalDay: z.number(),
  observeThreshold: z.number()
});

export const PathSettingsSchema = z.object({
  rootPath: z.string(),
  libraryPath: z.string(),
  archivePath: z.string(),
  exportsPath: z.string()
});

export const AdapterIdSchema = z.enum([
  'bailian', 'zhipu', 'moonshot', 'ernie', 'spark',
  'hunyuan', 'minimax', 'deepseek', 'yi', 'baichuan'
]);

export const LLMAdapterConfigSchema = z.object({
  apiKey: z.string(),
  enabled: z.boolean(),
  defaultModel: z.string()
});

export const LLMAdaptersRecordSchema = z.record(AdapterIdSchema, LLMAdapterConfigSchema);

export const RerankerConfigSchema = z.object({
  enabled: z.boolean(),
  apiKey: z.string()
});

export const IntegrationSettingsSchema = z.object({
  mcpHttpEnabled: z.boolean(),
  mcpHttpPort: z.number(),
  corsAllowedOrigins: z.array(z.string()),
  llmAdapters: LLMAdaptersRecordSchema,
  reranker: RerankerConfigSchema,
  nliProvider: z.enum(['hf-inference', 'local']),
  hfApiKey: z.string()
});

export const ExperimentalSettingsSchema = z.object({
  imageRegionAnnotation: z.boolean(),
  externalKnowledgeEnrich: z.boolean(),
  autoTranscribeMedia: z.boolean()
});

export const SettingsSchema = z.object({
  appearance: AppearanceSettingsSchema,
  general: GeneralSettingsSchema,
  language: LanguageSchema,
  budget: BudgetSettingsSchema,
  security: SecuritySettingsSchema,
  privacy: PrivacySettingsSchema,
  tasks: TaskSettingsSchema,
  paths: PathSettingsSchema,
  integration: IntegrationSettingsSchema,
  experimental: ExperimentalSettingsSchema
});

export const EnvConfigSchema = z.object({
  DATABASE_URL: z.string(),
  BRAIN_PORT: z.coerce.number().default(3000),
  BRAIN_API_KEY: z.string().default(''),
  LANGUAGE: z.string().default('zh-CN'),
  DAILY_BUDGET: z.coerce.number().default(5),
  MONTHLY_BUDGET: z.coerce.number().default(50),
  PER_QUERY_BUDGET: z.coerce.number().default(0.5),
  BAILIAN_API_KEY: z.string().default(''),
  ZHIPU_API_KEY: z.string().default(''),
  MOONSHOT_API_KEY: z.string().default(''),
  ERNIE_API_KEY: z.string().default(''),
  SPARK_API_KEY: z.string().default(''),
  HUNYUAN_API_KEY: z.string().default(''),
  MINIMAX_API_KEY: z.string().default(''),
  DEEPSEEK_API_KEY: z.string().default(''),
  YI_API_KEY: z.string().default(''),
  BAICHUAN_API_KEY: z.string().default(''),
  EMBEDDING_PROVIDER: z.string().default('local'),
  EMBEDDING_MODEL: z.string().default('all-MiniLM-L6-v2'),
  RERANKER_ENABLED: z.coerce.boolean().default(false),
  ZERANK_API_KEY: z.string().default(''),
  NLI_PROVIDER: z.enum(['hf-inference', 'local']).default('local'),
  HF_API_KEY: z.string().default(''),
  NODE_ENV: z.enum(['development', 'production', 'test']).default('development')
});

export type EnvConfig = z.infer<typeof EnvConfigSchema>;
