-- 0008: Hypergraph tables for Alethia v5.2
-- 超图相关数据表

-- 超边表（多源→多目标的高阶事实边）
CREATE TABLE IF NOT EXISTS hyperedges (
  id SERIAL PRIMARY KEY,
  source_slugs TEXT[] NOT NULL DEFAULT '{}',
  target_slugs TEXT[] NOT NULL DEFAULT '{}',
  type VARCHAR(100) NOT NULL DEFAULT 'jointlyCause',
  params JSONB NOT NULL DEFAULT '{}',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_hyperedges_source_slugs ON hyperedges USING GIN (source_slugs);
CREATE INDEX IF NOT EXISTS idx_hyperedges_target_slugs ON hyperedges USING GIN (target_slugs);
CREATE INDEX IF NOT EXISTS idx_hyperedges_type ON hyperedges(type);

-- 因果超边表（继承超边，额外携带因果参数）
CREATE TABLE IF NOT EXISTS causal_hyperedges (
  id SERIAL PRIMARY KEY,
  hyperedge_id INTEGER REFERENCES hyperedges(id) ON DELETE CASCADE,
  lag VARCHAR(10) DEFAULT '',
  weight REAL DEFAULT 0,
  conf REAL DEFAULT 0.5,
  evidence_spans TEXT[] DEFAULT '{}',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_causal_hyperedges_hyperedge_id ON causal_hyperedges(hyperedge_id);

-- 视图状态表（已保存的用户视图快照）
CREATE TABLE IF NOT EXISTS view_states (
  id SERIAL PRIMARY KEY,
  view_id VARCHAR(128) UNIQUE NOT NULL,
  user_label VARCHAR(256) NOT NULL DEFAULT '',
  snapshot JSONB NOT NULL DEFAULT '{}',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_view_states_view_id ON view_states(view_id);

-- 因果推理缓存表
CREATE TABLE IF NOT EXISTS causal_inference_cache (
  id SERIAL PRIMARY KEY,
  query_hash VARCHAR(64) UNIQUE NOT NULL,
  result JSONB NOT NULL DEFAULT '{}',
  expires_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_causal_inference_cache_expires ON causal_inference_cache(expires_at);