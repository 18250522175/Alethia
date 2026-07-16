-- 0009: Add tags column to library_files
ALTER TABLE library_files ADD COLUMN IF NOT EXISTS tags TEXT[] NOT NULL DEFAULT '{}';

CREATE INDEX IF NOT EXISTS idx_library_files_tags ON library_files USING GIN (tags);