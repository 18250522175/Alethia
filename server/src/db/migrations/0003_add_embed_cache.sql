CREATE TABLE IF NOT EXISTS embed_cache (
  key VARCHAR(255) PRIMARY KEY,
  type VARCHAR(50) NOT NULL,
  params JSONB NOT NULL DEFAULT '{}',
  data JSONB NOT NULL DEFAULT '{}',
  cached_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  expires_at TIMESTAMPTZ NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_embed_cache_expires ON embed_cache(expires_at);
CREATE INDEX IF NOT EXISTS idx_embed_cache_type ON embed_cache(type);
