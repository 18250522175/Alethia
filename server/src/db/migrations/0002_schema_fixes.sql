-- 0002_schema_fixes.sql: 补齐 Schema 与代码不一致的缺失列

-- 1. pending_diffs 表：补充 approved 和 resolved_at 列
ALTER TABLE pending_diffs
  ADD COLUMN IF NOT EXISTS approved BOOLEAN,
  ADD COLUMN IF NOT EXISTS resolved_at TIMESTAMPTZ;

CREATE INDEX IF NOT EXISTS idx_pending_diffs_approved ON pending_diffs (approved) WHERE approved IS NOT NULL;

-- 2. knowledge_versions 表：补充 content 和 batch_id 列，并将 ts 重命名为 created_at
ALTER TABLE knowledge_versions
  ADD COLUMN IF NOT EXISTS content TEXT NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS batch_id VARCHAR(64);

DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'knowledge_versions' AND column_name = 'ts'
  ) AND NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'knowledge_versions' AND column_name = 'created_at'
  ) THEN
    ALTER TABLE knowledge_versions RENAME COLUMN ts TO created_at;
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_knowledge_versions_batch ON knowledge_versions (batch_id);

-- 3. auto_change_log 表：补充 slug 列，并将 ts 重命名为 created_at
ALTER TABLE auto_change_log
  ADD COLUMN IF NOT EXISTS slug VARCHAR(255);

DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'auto_change_log' AND column_name = 'ts'
  ) AND NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'auto_change_log' AND column_name = 'created_at'
  ) THEN
    ALTER TABLE auto_change_log RENAME COLUMN ts TO created_at;
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_auto_change_log_slug ON auto_change_log (slug);

-- 4. conversation_logs 表：将 ts 重命名为 created_at
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'conversation_logs' AND column_name = 'ts'
  ) AND NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'conversation_logs' AND column_name = 'created_at'
  ) THEN
    ALTER TABLE conversation_logs RENAME COLUMN ts TO created_at;
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_conversation_logs_created_at ON conversation_logs (created_at DESC);
