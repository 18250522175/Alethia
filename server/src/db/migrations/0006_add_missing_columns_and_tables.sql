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
-- 使用 key-value 模式：key 为 "daily:2026-07-10" 或 "monthly:2026-07"
-- 通过 ON CONFLICT (key) DO UPDATE 实现原子累加
CREATE TABLE IF NOT EXISTS budget_usage (
  key VARCHAR(256) UNIQUE NOT NULL,
  cost DOUBLE PRECISION NOT NULL DEFAULT 0,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);