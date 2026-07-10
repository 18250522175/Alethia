-- 添加 pages.title 列（迁移 0001 创建时遗漏）
ALTER TABLE pages ADD COLUMN IF NOT EXISTS title VARCHAR(512) NOT NULL DEFAULT '';

-- 添加 conversation_logs.compressed 列（对话压缩功能需要）
ALTER TABLE conversation_logs ADD COLUMN IF NOT EXISTS compressed BOOLEAN NOT NULL DEFAULT false;

-- 创建 eval_results 表（健康检查仪表盘需要）
CREATE TABLE IF NOT EXISTS eval_results (
  id SERIAL PRIMARY KEY,
  test_name VARCHAR(255) NOT NULL,
  passed BOOLEAN NOT NULL DEFAULT false,
  score DOUBLE PRECISION,
  details JSONB NOT NULL DEFAULT '{}',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 创建 budget_usage 表（预算管理功能需要）
CREATE TABLE IF NOT EXISTS budget_usage (
  id SERIAL PRIMARY KEY,
  provider VARCHAR(64) NOT NULL,
  model VARCHAR(128) NOT NULL,
  tokens INTEGER NOT NULL,
  cost DOUBLE PRECISION NOT NULL,
  endpoint VARCHAR(255),
  target VARCHAR(256),
  period VARCHAR(10) NOT NULL DEFAULT 'daily',
  recorded_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_budget_usage_provider_model ON budget_usage(provider, model);
CREATE INDEX IF NOT EXISTS idx_budget_usage_period ON budget_usage(period);
CREATE INDEX IF NOT EXISTS idx_budget_usage_recorded_at ON budget_usage(recorded_at);