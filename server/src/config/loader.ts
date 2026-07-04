import { EnvConfigSchema, type EnvConfig } from './schema';

let cachedEnv: EnvConfig | null = null;

export function loadEnv(): EnvConfig {
  if (cachedEnv) {
    return cachedEnv;
  }

  const raw = {
    DATABASE_URL: process.env.DATABASE_URL || 'postgres://alethia:alethia@postgres:5432/alethia',
    BRAIN_PORT: process.env.BRAIN_PORT || '3000',
    BRAIN_API_KEY: process.env.BRAIN_API_KEY || '',
    LANGUAGE: process.env.LANGUAGE || 'zh-CN',
    DAILY_BUDGET: process.env.DAILY_BUDGET || '5',
    MONTHLY_BUDGET: process.env.MONTHLY_BUDGET || '50',
    PER_QUERY_BUDGET: process.env.PER_QUERY_BUDGET || '0.5',
    BAILIAN_API_KEY: process.env.BAILIAN_API_KEY || '',
    ZHIPU_API_KEY: process.env.ZHIPU_API_KEY || '',
    MOONSHOT_API_KEY: process.env.MOONSHOT_API_KEY || '',
    ERNIE_API_KEY: process.env.ERNIE_API_KEY || '',
    SPARK_API_KEY: process.env.SPARK_API_KEY || '',
    HUNYUAN_API_KEY: process.env.HUNYUAN_API_KEY || '',
    MINIMAX_API_KEY: process.env.MINIMAX_API_KEY || '',
    DEEPSEEK_API_KEY: process.env.DEEPSEEK_API_KEY || '',
    YI_API_KEY: process.env.YI_API_KEY || '',
    BAICHUAN_API_KEY: process.env.BAICHUAN_API_KEY || '',
    EMBEDDING_PROVIDER: process.env.EMBEDDING_PROVIDER || 'local',
    EMBEDDING_MODEL: process.env.EMBEDDING_MODEL || 'all-MiniLM-L6-v2',
    RERANKER_ENABLED: process.env.RERANKER_ENABLED || 'false',
    ZERANK_API_KEY: process.env.ZERANK_API_KEY || '',
    NLI_PROVIDER: process.env.NLI_PROVIDER || 'local',
    HF_API_KEY: process.env.HF_API_KEY || '',
    NODE_ENV: process.env.NODE_ENV || 'development'
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
