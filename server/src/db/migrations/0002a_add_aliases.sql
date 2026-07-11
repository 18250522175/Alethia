ALTER TABLE pages ADD COLUMN IF NOT EXISTS aliases TEXT[] NOT NULL DEFAULT '{}';
CREATE INDEX IF NOT EXISTS idx_pages_aliases ON pages USING gin(aliases);
