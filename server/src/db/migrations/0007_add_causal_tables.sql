-- 0007: Causal cognitive map tables
-- 因果认知地图相关数据表

-- 因果边缓存表
CREATE TABLE IF NOT EXISTS causal_edges (
  id SERIAL PRIMARY KEY,
  source_slug VARCHAR(255) NOT NULL,
  target_slug VARCHAR(255) NOT NULL,
  relation VARCHAR(100) NOT NULL DEFAULT 'causesIncrease',
  lag VARCHAR(10) DEFAULT '',
  weight REAL DEFAULT 0,
  conf REAL DEFAULT 0.5,
  evidence TEXT[] DEFAULT '{}',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_causal_edges_source ON causal_edges(source_slug);
CREATE INDEX IF NOT EXISTS idx_causal_edges_target ON causal_edges(target_slug);

-- 条件概率表 (CPT)
CREATE TABLE IF NOT EXISTS causal_cpt (
  id SERIAL PRIMARY KEY,
  variable_slug VARCHAR(255) UNIQUE NOT NULL,
  conditions JSONB NOT NULL DEFAULT '{}',
  probabilities JSONB NOT NULL DEFAULT '{}',
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 因果模型版本表
CREATE TABLE IF NOT EXISTS causal_versions (
  id SERIAL PRIMARY KEY,
  version_id VARCHAR(64) NOT NULL,
  snapshot JSONB NOT NULL DEFAULT '{}',
  comment VARCHAR(500) DEFAULT '',
  is_active BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_causal_versions_version ON causal_versions(version_id);

-- 因果预警表
CREATE TABLE IF NOT EXISTS causal_alerts (
  id SERIAL PRIMARY KEY,
  edge_id INTEGER REFERENCES causal_edges(id) ON DELETE CASCADE,
  threshold JSONB NOT NULL DEFAULT '{}',
  enabled BOOLEAN NOT NULL DEFAULT true,
  last_triggered_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);