import { EnvConfigSchema, type EnvConfig } from './schema';

let cachedEnv: EnvConfig | null = null;

export function loadEnv(): EnvConfig {
  if (cachedEnv) {
    return cachedEnv;
  }

  const raw = {
    DATABASE_URL: process.env.DATABASE_URL || 'postgres://alethia:CHANGE_ME@localhost:5432/alethia',
    BRAIN_PORT: process.env.BRAIN_PORT || '3000',
    BRAIN_API_KEY: process.env.BRAIN_API_KEY || '',
    LANGUAGE: process.env.LANGUAGE || 'zh-CN',
    DAILY_BUDGET: process.env.DAILY_BUDGET || '5',
    MONTHLY_BUDGET: process.env.MONTHLY_BUDGET || '50',
    PER_QUERY_BUDGET: process.env.PER_QUERY_BUDGET || '0.5',
    BAILIAN_API_KEY: process.env.BAILIAN_API_KEY || '',
    BAILIAN_BASE_URL: process.env.BAILIAN_BASE_URL || '',
    ZHIPU_API_KEY: process.env.ZHIPU_API_KEY || '',
    ZHIPU_BASE_URL: process.env.ZHIPU_BASE_URL || '',
    MOONSHOT_API_KEY: process.env.MOONSHOT_API_KEY || '',
    MOONSHOT_BASE_URL: process.env.MOONSHOT_BASE_URL || '',
    ERNIE_API_KEY: process.env.ERNIE_API_KEY || '',
    ERNIE_BASE_URL: process.env.ERNIE_BASE_URL || '',
    SPARK_API_KEY: process.env.SPARK_API_KEY || '',
    SPARK_BASE_URL: process.env.SPARK_BASE_URL || '',
    HUNYUAN_API_KEY: process.env.HUNYUAN_API_KEY || '',
    HUNYUAN_BASE_URL: process.env.HUNYUAN_BASE_URL || '',
    MINIMAX_API_KEY: process.env.MINIMAX_API_KEY || '',
    MINIMAX_BASE_URL: process.env.MINIMAX_BASE_URL || '',
    DEEPSEEK_API_KEY: process.env.DEEPSEEK_API_KEY || '',
    DEEPSEEK_BASE_URL: process.env.DEEPSEEK_BASE_URL || '',
    YI_API_KEY: process.env.YI_API_KEY || '',
    YI_BASE_URL: process.env.YI_BASE_URL || '',
    BAICHUAN_API_KEY: process.env.BAICHUAN_API_KEY || '',
    BAICHUAN_BASE_URL: process.env.BAICHUAN_BASE_URL || '',
    EMBEDDING_PROVIDER: process.env.EMBEDDING_PROVIDER || 'local',
    EMBEDDING_MODEL: process.env.EMBEDDING_MODEL || 'all-MiniLM-L6-v2',
    RERANKER_ENABLED: process.env.RERANKER_ENABLED || 'false',
    ZERANK_API_KEY: process.env.ZERANK_API_KEY || '',
    NLI_PROVIDER: process.env.NLI_PROVIDER || 'local',
    HF_API_KEY: process.env.HF_API_KEY || '',
    NODE_ENV: process.env.NODE_ENV || 'development',
    BRAIN_CORS_ORIGINS: process.env.BRAIN_CORS_ORIGINS || '',
    LIBRARY_PATH: process.env.LIBRARY_PATH || '/data/library',
    WIKI_PATH: process.env.WIKI_PATH || '',
    RAW_PATH: process.env.RAW_PATH || '',
    SUMMARIES_PATH: process.env.SUMMARIES_PATH || '',
    CHANGELOG_PATH: process.env.CHANGELOG_PATH || ''
  };

  const result = EnvConfigSchema.safeParse(raw);
  if (!result.success) {
    console.error('环境变量配置错误:', result.error.errors);
    throw new Error('环境变量配置校验失败');
  }

  cachedEnv = result.data;
  return cachedEnv;
}

export function isDevelopment(): boolean {
  return loadEnv().NODE_ENV === 'development';
}

export function isProduction(): boolean {
  return loadEnv().NODE_ENV === 'production';
}
