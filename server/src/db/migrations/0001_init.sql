CREATE EXTENSION IF NOT EXISTS vector;
CREATE EXTENSION IF NOT EXISTS pg_trgm;

CREATE TABLE IF NOT EXISTS _migrations (
  name VARCHAR(255) PRIMARY KEY,
  applied_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS pages (
  id SERIAL PRIMARY KEY,
  slug VARCHAR(255) UNIQUE NOT NULL,
  path VARCHAR(1024) NOT NULL,
  type VARCHAR(50) NOT NULL DEFAULT 'concept',
  contexts TEXT[] NOT NULL DEFAULT '{}',
  raw_md TEXT NOT NULL DEFAULT '',
  parsed_json JSONB NOT NULL DEFAULT '{}',
  content_md TEXT NOT NULL DEFAULT '',
  hash VARCHAR(64) NOT NULL DEFAULT '',
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS page_fts (
  page_id INTEGER PRIMARY KEY REFERENCES pages(id) ON DELETE CASCADE,
  tsv TSVECTOR,
  source_text TEXT NOT NULL DEFAULT ''
);

CREATE TABLE IF NOT EXISTS page_embeddings (
  page_id INTEGER PRIMARY KEY REFERENCES pages(id) ON DELETE CASCADE,
  embedding vector(384),
  model VARCHAR(255) NOT NULL DEFAULT 'all-MiniLM-L6-v2'
);

CREATE TABLE IF NOT EXISTS links (
  id SERIAL PRIMARY KEY,
  source_slug VARCHAR(255) NOT NULL,
  target_slug VARCHAR(255) NOT NULL,
  relation VARCHAR(100) NOT NULL DEFAULT 'related',
  weight REAL NOT NULL DEFAULT 1.0,
  orphaned BOOLEAN NOT NULL DEFAULT FALSE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS timeline_entries (
  id SERIAL PRIMARY KEY,
  slug VARCHAR(255) NOT NULL,
  type VARCHAR(50) NOT NULL,
  payload JSONB NOT NULL DEFAULT '{}',
  ts TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS knowledge_versions (
  id SERIAL PRIMARY KEY,
  slug VARCHAR(255) NOT NULL,
  version INTEGER NOT NULL,
  ts TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  change_summary TEXT NOT NULL DEFAULT '',
  archived BOOLEAN NOT NULL DEFAULT FALSE,
  changelog_path VARCHAR(1024)
);

CREATE TABLE IF NOT EXISTS semantic_rings (
  id SERIAL PRIMARY KEY,
  slug VARCHAR(255) NOT NULL,
  ring_version INTEGER NOT NULL,
  period VARCHAR(100) NOT NULL,
  summary TEXT NOT NULL DEFAULT ''
);

CREATE TABLE IF NOT EXISTS evidence_spans (
  id SERIAL PRIMARY KEY,
  span_id VARCHAR(64) UNIQUE NOT NULL,
  slug VARCHAR(255) NOT NULL,
  source_file_hash VARCHAR(64) NOT NULL,
  source_text_offset INTEGER NOT NULL DEFAULT 0,
  source_text_length INTEGER NOT NULL DEFAULT 0,
  original_location VARCHAR(255),
  span_text TEXT NOT NULL,
  lang VARCHAR(10) NOT NULL DEFAULT 'zh-CN',
  confidence REAL,
  source_type VARCHAR(20)
);

CREATE TABLE IF NOT EXISTS clusters (
  id SERIAL PRIMARY KEY,
  cluster_id VARCHAR(64) UNIQUE NOT NULL,
  name VARCHAR(255) NOT NULL,
  lifecycle VARCHAR(20) NOT NULL DEFAULT 'emerging',
  generated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS cluster_members (
  cluster_id VARCHAR(64) NOT NULL REFERENCES clusters(cluster_id) ON DELETE CASCADE,
  slug VARCHAR(255) NOT NULL,
  PRIMARY KEY (cluster_id, slug)
);

CREATE TABLE IF NOT EXISTS communities (
  id SERIAL PRIMARY KEY,
  community_id VARCHAR(64) UNIQUE NOT NULL,
  label VARCHAR(255) NOT NULL
);

CREATE TABLE IF NOT EXISTS community_reports (
  id SERIAL PRIMARY KEY,
  community_id VARCHAR(64) NOT NULL REFERENCES communities(community_id) ON DELETE CASCADE,
  content TEXT NOT NULL DEFAULT ''
);

CREATE TABLE IF NOT EXISTS clusters_meta (
  id SERIAL PRIMARY KEY,
  key VARCHAR(255) NOT NULL,
  value TEXT NOT NULL DEFAULT ''
);

CREATE TABLE IF NOT EXISTS library_files (
  hash VARCHAR(64) PRIMARY KEY,
  mime VARCHAR(100) NOT NULL,
  original_name VARCHAR(255) NOT NULL,
  size BIGINT NOT NULL DEFAULT 0,
  status VARCHAR(30) NOT NULL DEFAULT 'new',
  ingested_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS pending_diffs (
  id VARCHAR(64) PRIMARY KEY,
  slug VARCHAR(255) NOT NULL,
  type VARCHAR(50) NOT NULL,
  payload JSONB NOT NULL DEFAULT '{}',
  confidence REAL NOT NULL DEFAULT 0.0,
  impact VARCHAR(10) NOT NULL DEFAULT 'low',
  tier VARCHAR(10) NOT NULL DEFAULT 'yellow',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  resolved BOOLEAN NOT NULL DEFAULT FALSE
);

CREATE TABLE IF NOT EXISTS auto_change_log (
  id SERIAL PRIMARY KEY,
  batch_id VARCHAR(64) NOT NULL,
  op VARCHAR(50) NOT NULL,
  target VARCHAR(255) NOT NULL,
  payload JSONB NOT NULL DEFAULT '{}',
  ts TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS shadow_benchmarks (
  id SERIAL PRIMARY KEY,
  type VARCHAR(50) NOT NULL,
  slug VARCHAR(255),
  source_text TEXT NOT NULL,
  expected_output TEXT NOT NULL,
  git_commit VARCHAR(64)
);

CREATE TABLE IF NOT EXISTS nli_cache (
  id SERIAL PRIMARY KEY,
  hash_a VARCHAR(64) NOT NULL,
  hash_b VARCHAR(64) NOT NULL,
  label VARCHAR(20) NOT NULL,
  ts TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(hash_a, hash_b)
);

CREATE TABLE IF NOT EXISTS user_rules (
  id SERIAL PRIMARY KEY,
  pattern VARCHAR(255) NOT NULL,
  mapping VARCHAR(255) NOT NULL,
  hits INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS settings (
  id SERIAL PRIMARY KEY,
  key VARCHAR(100) UNIQUE NOT NULL,
  value JSONB NOT NULL DEFAULT '{}',
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS conversation_logs (
  id SERIAL PRIMARY KEY,
  conversation_id VARCHAR(64) NOT NULL,
  role VARCHAR(20) NOT NULL,
  content TEXT NOT NULL,
  ts TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  tokens INTEGER NOT NULL DEFAULT 0,
  cost REAL NOT NULL DEFAULT 0.0
);

CREATE TABLE IF NOT EXISTS evidence_translations (
  id SERIAL PRIMARY KEY,
  span_id VARCHAR(64) NOT NULL,
  source_text TEXT NOT NULL,
  translated_text TEXT NOT NULL,
  lang VARCHAR(10) NOT NULL,
  model VARCHAR(255) NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  expires_at TIMESTAMPTZ NOT NULL
);

CREATE TABLE IF NOT EXISTS ghost_relations (
  id SERIAL PRIMARY KEY,
  source_slug VARCHAR(255) NOT NULL,
  target_name VARCHAR(255) NOT NULL,
  discovered_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  status VARCHAR(20) NOT NULL DEFAULT 'pending'
);

CREATE TABLE IF NOT EXISTS observed_files (
  id SERIAL PRIMARY KEY,
  file_hash VARCHAR(64) NOT NULL UNIQUE,
  reference_count INTEGER NOT NULL DEFAULT 0,
  first_referenced_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  last_referenced_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS eval_anomaly_flags (
  id VARCHAR(64) PRIMARY KEY,
  metric VARCHAR(100) NOT NULL,
  threshold REAL NOT NULL,
  actual REAL NOT NULL,
  ts TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  message TEXT NOT NULL DEFAULT ''
);

CREATE INDEX IF NOT EXISTS idx_pages_slug ON pages (slug);
CREATE INDEX IF NOT EXISTS idx_pages_type ON pages (type);
CREATE INDEX IF NOT EXISTS idx_page_embeddings_hnsw ON page_embeddings USING hnsw (embedding vector_cosine_ops);
CREATE INDEX IF NOT EXISTS idx_page_fts_gin ON page_fts USING gin (tsv);
CREATE INDEX IF NOT EXISTS idx_links_source ON links (source_slug);
CREATE INDEX IF NOT EXISTS idx_links_target ON links (target_slug);
CREATE INDEX IF NOT EXISTS idx_links_orphaned ON links (orphaned) WHERE orphaned = true;
CREATE INDEX IF NOT EXISTS idx_timeline_slug ON timeline_entries (slug);
CREATE INDEX IF NOT EXISTS idx_timeline_ts ON timeline_entries (ts DESC);
CREATE INDEX IF NOT EXISTS idx_knowledge_versions_slug ON knowledge_versions (slug);
CREATE UNIQUE INDEX IF NOT EXISTS idx_knowledge_versions_unique ON knowledge_versions (slug, version);
CREATE INDEX IF NOT EXISTS idx_semantic_rings_slug ON semantic_rings (slug);
CREATE INDEX IF NOT EXISTS idx_evidence_spans_slug ON evidence_spans (slug);
CREATE INDEX IF NOT EXISTS idx_evidence_spans_hash ON evidence_spans (source_file_hash);
CREATE INDEX IF NOT EXISTS idx_pending_diffs_tier ON pending_diffs (tier, resolved) WHERE resolved = false;
CREATE INDEX IF NOT EXISTS idx_pending_diffs_slug ON pending_diffs (slug);
CREATE INDEX IF NOT EXISTS idx_auto_change_log_batch ON auto_change_log (batch_id);
CREATE INDEX IF NOT EXISTS idx_conversation_logs_conv_id ON conversation_logs (conversation_id);
CREATE INDEX IF NOT EXISTS idx_conversation_logs_ts ON conversation_logs (ts DESC);
CREATE INDEX IF NOT EXISTS idx_ghost_relations_status ON ghost_relations (status) WHERE status = 'pending';
CREATE INDEX IF NOT EXISTS idx_library_files_status ON library_files (status);
CREATE INDEX IF NOT EXISTS idx_observed_files_ref_count ON observed_files (reference_count DESC);
