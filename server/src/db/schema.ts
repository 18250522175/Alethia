/**
 * Drizzle ORM Schema · Alethia 数据库模式定义
 *
 * 本文件是与 server/src/db/migrations/0001_init.sql 完全对等的 TypeScript 描述。
 * 设计原则：
 *   1. 表结构、列类型、约束严格对齐 migration；
 *   2. 复用 pgvector 时，使用 Drizzle 的 customType 包装 vector(N)；
 *   3. 时间戳统一使用 timestamptz；
 *   4. JSONB 字段使用 $type() 进一步细化类型（按需补充）。
 *
 * 此后新增表 / 列请同时更新本文件与对应 migration，保持单一事实来源。
 */

import {
  boolean,
  customType,
  index,
  integer,
  jsonb,
  pgTable,
  primaryKey,
  real,
  serial,
  text,
  timestamp,
  uniqueIndex,
  varchar
} from 'drizzle-orm/pg-core';

// ===== 自定义类型 =====

/** pgvector 的 vector(N) 类型，Drizzle 原生未提供。 */
const vector = customType<{ data: string; driverData: string }>({
  dataType() {
    return 'vector';
  }
});

/** PostgreSQL tsvector 类型，仅用于全文检索。 */
const tsvector = customType<{ data: unknown; driverData: unknown }>({
  dataType() {
    return 'tsvector';
  }
});

// ===== 基础表 =====

export const migrations = pgTable('_migrations', {
  name: varchar('name', { length: 255 }).primaryKey(),
  appliedAt: timestamp('applied_at', { withTimezone: true }).defaultNow().notNull()
});

export const pages = pgTable(
  'pages',
  {
    id: serial('id').primaryKey(),
    slug: varchar('slug', { length: 255 }).notNull().unique(),
    path: varchar('path', { length: 1024 }).notNull(),
    type: varchar('type', { length: 50 }).default('concept').notNull(),
    contexts: text('contexts').array().notNull().default([]),
    rawMd: text('raw_md').default('').notNull(),
    parsedJson: jsonb('parsed_json').default({}).notNull(),
    contentMd: text('content_md').default('').notNull(),
    hash: varchar('hash', { length: 64 }).default('').notNull(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull()
  },
  (t) => [index('idx_pages_slug').on(t.slug), index('idx_pages_type').on(t.type)]
);

export const pageFts = pgTable('page_fts', {
  pageId: integer('page_id')
    .primaryKey()
    .references(() => pages.id, { onDelete: 'cascade' }),
  tsv: tsvector('tsv'),
  sourceText: text('source_text').default('').notNull()
});

export const pageEmbeddings = pgTable(
  'page_embeddings',
  {
    pageId: integer('page_id')
      .primaryKey()
      .references(() => pages.id, { onDelete: 'cascade' }),
    embedding: vector('embedding'),
    model: varchar('model', { length: 255 }).default('all-MiniLM-L6-v2').notNull()
  },
  (t) => [
    // HNSW 向量索引无法在 Drizzle 中直接声明，由 migration 维护
    index('idx_page_embeddings_hnsw').on(t.embedding)
  ]
);

export const links = pgTable(
  'links',
  {
    id: serial('id').primaryKey(),
    sourceSlug: varchar('source_slug', { length: 255 })
      .notNull()
      .references(() => pages.slug, { onDelete: 'cascade' }),
    targetSlug: varchar('target_slug', { length: 255 })
      .notNull()
      .references(() => pages.slug, { onDelete: 'cascade' }),
    relation: varchar('relation', { length: 100 }).default('related').notNull(),
    weight: real('weight').default(1.0).notNull(),
    orphaned: boolean('orphaned').default(false).notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull()
  },
  (t) => [
    index('idx_links_source').on(t.sourceSlug),
    index('idx_links_target').on(t.targetSlug),
    index('idx_links_orphaned').on(t.orphaned)
  ]
);

export const timelineEntries = pgTable(
  'timeline_entries',
  {
    id: serial('id').primaryKey(),
    slug: varchar('slug', { length: 255 })
      .notNull()
      .references(() => pages.slug, { onDelete: 'cascade' }),
    type: varchar('type', { length: 50 }).notNull(),
    payload: jsonb('payload').default({}).notNull(),
    ts: timestamp('ts', { withTimezone: true }).defaultNow().notNull()
  },
  (t) => [index('idx_timeline_slug').on(t.slug), index('idx_timeline_ts').on(t.ts)]
);

export const knowledgeVersions = pgTable(
  'knowledge_versions',
  {
    id: serial('id').primaryKey(),
    slug: varchar('slug', { length: 255 })
      .notNull()
      .references(() => pages.slug, { onDelete: 'cascade' }),
    version: integer('version').notNull(),
    ts: timestamp('ts', { withTimezone: true }).defaultNow().notNull(),
    changeSummary: text('change_summary').default('').notNull(),
    archived: boolean('archived').default(false).notNull(),
    changelogPath: varchar('changelog_path', { length: 1024 })
  },
  (t) => [
    index('idx_knowledge_versions_slug').on(t.slug),
    uniqueIndex('idx_knowledge_versions_unique').on(t.slug, t.version)
  ]
);

export const semanticRings = pgTable(
  'semantic_rings',
  {
    id: serial('id').primaryKey(),
    slug: varchar('slug', { length: 255 })
      .notNull()
      .references(() => pages.slug, { onDelete: 'cascade' }),
    ringVersion: integer('ring_version').notNull(),
    period: varchar('period', { length: 100 }).notNull(),
    summary: text('summary').notNull()
  },
  (t) => [index('idx_semantic_rings_slug').on(t.slug)]
);

export const evidenceSpans = pgTable(
  'evidence_spans',
  {
    id: serial('id').primaryKey(),
    spanId: varchar('span_id', { length: 64 }).notNull().unique(),
    slug: varchar('slug', { length: 255 })
      .notNull()
      .references(() => pages.slug, { onDelete: 'cascade' }),
    sourceFileHash: varchar('source_file_hash', { length: 64 }).notNull(),
    sourceTextOffset: integer('source_text_offset').default(0).notNull(),
    sourceTextLength: integer('source_text_length').default(0).notNull(),
    originalLocation: varchar('original_location', { length: 255 }),
    spanText: text('span_text').notNull(),
    lang: varchar('lang', { length: 10 }).default('zh-CN').notNull(),
    confidence: real('confidence'),
    sourceType: varchar('source_type', { length: 20 })
  },
  (t) => [
    index('idx_evidence_spans_slug').on(t.slug),
    index('idx_evidence_spans_hash').on(t.sourceFileHash)
  ]
);

export const clusters = pgTable('clusters', {
  id: serial('id').primaryKey(),
  clusterId: varchar('cluster_id', { length: 64 }).notNull().unique(),
  name: varchar('name', { length: 255 }).notNull(),
  lifecycle: varchar('lifecycle', { length: 20 }).default('emerging').notNull(),
  generatedAt: timestamp('generated_at', { withTimezone: true }).defaultNow().notNull()
});

export const clusterMembers = pgTable(
  'cluster_members',
  {
    clusterId: varchar('cluster_id', { length: 64 })
      .notNull()
      .references(() => clusters.clusterId, { onDelete: 'cascade' }),
    slug: varchar('slug', { length: 255 }).notNull()
  },
  (t) => [primaryKey({ columns: [t.clusterId, t.slug] })]
);

export const communities = pgTable('communities', {
  id: serial('id').primaryKey(),
  communityId: varchar('community_id', { length: 64 }).notNull().unique(),
  label: varchar('label', { length: 255 }).notNull()
});

export const communityReports = pgTable('community_reports', {
  id: serial('id').primaryKey(),
  communityId: varchar('community_id', { length: 64 })
    .notNull()
    .references(() => communities.communityId, { onDelete: 'cascade' }),
  content: text('content').default('').notNull()
});

export const clustersMeta = pgTable('clusters_meta', {
  id: serial('id').primaryKey(),
  key: varchar('key', { length: 255 }).notNull(),
  value: text('value').default('').notNull()
});

export const libraryFiles = pgTable(
  'library_files',
  {
    hash: varchar('hash', { length: 64 }).primaryKey(),
    mime: varchar('mime', { length: 100 }).notNull(),
    originalName: varchar('original_name', { length: 255 }).notNull(),
    size: integer('size').default(0).notNull(),
    status: varchar('status', { length: 30 }).default('new').notNull(),
    ingestedAt: timestamp('ingested_at', { withTimezone: true }).defaultNow().notNull()
  },
  (t) => [index('idx_library_files_status').on(t.status)]
);

export const pendingDiffs = pgTable(
  'pending_diffs',
  {
    id: varchar('id', { length: 64 }).primaryKey(),
    slug: varchar('slug', { length: 255 })
      .notNull()
      .references(() => pages.slug, { onDelete: 'cascade' }),
    type: varchar('type', { length: 50 }).notNull(),
    payload: jsonb('payload').default({}).notNull(),
    confidence: real('confidence').default(0.0).notNull(),
    impact: varchar('impact', { length: 10 }).default('low').notNull(),
    tier: varchar('tier', { length: 10 }).default('yellow').notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
    resolved: boolean('resolved').default(false).notNull()
  },
  (t) => [
    index('idx_pending_diffs_tier').on(t.tier, t.resolved),
    index('idx_pending_diffs_slug').on(t.slug)
  ]
);

export const autoChangeLog = pgTable(
  'auto_change_log',
  {
    id: serial('id').primaryKey(),
    batchId: varchar('batch_id', { length: 64 }).notNull(),
    op: varchar('op', { length: 50 }).notNull(),
    target: varchar('target', { length: 255 }).notNull(),
    payload: jsonb('payload').default({}).notNull(),
    ts: timestamp('ts', { withTimezone: true }).defaultNow().notNull()
  },
  (t) => [index('idx_auto_change_log_batch').on(t.batchId)]
);

export const shadowBenchmarks = pgTable('shadow_benchmarks', {
  id: serial('id').primaryKey(),
  type: varchar('type', { length: 50 }).notNull(),
  slug: varchar('slug', { length: 255 }),
  sourceText: text('source_text').notNull(),
  expectedOutput: text('expected_output').notNull(),
  gitCommit: varchar('git_commit', { length: 64 })
});

export const nliCache = pgTable(
  'nli_cache',
  {
    id: serial('id').primaryKey(),
    hashA: varchar('hash_a', { length: 64 }).notNull(),
    hashB: varchar('hash_b', { length: 64 }).notNull(),
    label: varchar('label', { length: 20 }).notNull(),
    ts: timestamp('ts', { withTimezone: true }).defaultNow().notNull()
  },
  (t) => [uniqueIndex('nli_cache_hash_a_hash_b_unique').on(t.hashA, t.hashB)]
);

export const userRules = pgTable('user_rules', {
  id: serial('id').primaryKey(),
  pattern: varchar('pattern', { length: 255 }).notNull(),
  mapping: varchar('mapping', { length: 255 }).notNull(),
  hits: integer('hits').default(0).notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull()
});

export const settings = pgTable('settings', {
  id: serial('id').primaryKey(),
  key: varchar('key', { length: 100 }).notNull().unique(),
  value: jsonb('value').default({}).notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull()
});

export const conversationLogs = pgTable(
  'conversation_logs',
  {
    id: serial('id').primaryKey(),
    conversationId: varchar('conversation_id', { length: 64 }).notNull(),
    role: varchar('role', { length: 20 }).notNull(),
    content: text('content').notNull(),
    ts: timestamp('ts', { withTimezone: true }).defaultNow().notNull(),
    tokens: integer('tokens').default(0).notNull(),
    cost: real('cost').default(0.0).notNull()
  },
  (t) => [
    index('idx_conversation_logs_conv_id').on(t.conversationId),
    index('idx_conversation_logs_ts').on(t.ts)
  ]
);

export const evidenceTranslations = pgTable('evidence_translations', {
  id: serial('id').primaryKey(),
  spanId: varchar('span_id', { length: 64 }).notNull(),
  sourceText: text('source_text').notNull(),
  translatedText: text('translated_text').notNull(),
  lang: varchar('lang', { length: 10 }).notNull(),
  model: varchar('model', { length: 255 }).notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  expiresAt: timestamp('expires_at', { withTimezone: true }).notNull()
});

export const ghostRelations = pgTable(
  'ghost_relations',
  {
    id: serial('id').primaryKey(),
    sourceSlug: varchar('source_slug', { length: 255 }).notNull(),
    targetName: varchar('target_name', { length: 255 }).notNull(),
    discoveredAt: timestamp('discovered_at', { withTimezone: true }).defaultNow().notNull(),
    status: varchar('status', { length: 20 }).default('pending').notNull()
  },
  (t) => [index('idx_ghost_relations_status').on(t.status)]
);

export const observedFiles = pgTable(
  'observed_files',
  {
    id: serial('id').primaryKey(),
    fileHash: varchar('file_hash', { length: 64 }).notNull().unique(),
    referenceCount: integer('reference_count').default(0).notNull(),
    firstReferencedAt: timestamp('first_referenced_at', { withTimezone: true })
      .defaultNow()
      .notNull(),
    lastReferencedAt: timestamp('last_referenced_at', { withTimezone: true }).defaultNow().notNull()
  },
  (t) => [index('idx_observed_files_ref_count').on(t.referenceCount)]
);

export const evalAnomalyFlags = pgTable('eval_anomaly_flags', {
  id: varchar('id', { length: 64 }).primaryKey(),
  metric: varchar('metric', { length: 100 }).notNull(),
  threshold: real('threshold').notNull(),
  actual: real('actual').notNull(),
  ts: timestamp('ts', { withTimezone: true }).defaultNow().notNull(),
  message: text('message').notNull()
});

export const budgetUsage = pgTable('budget_usage', {
  key: varchar('key', { length: 64 }).primaryKey(),
  cost: real('cost').default(0.0).notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull()
});

// ===== 类型导出（推导自 schema，无需手写）=====

export type Page = typeof pages.$inferSelect;
export type NewPage = typeof pages.$inferInsert;
export type Link = typeof links.$inferSelect;
export type NewLink = typeof links.$inferInsert;
export type TimelineEntry = typeof timelineEntries.$inferSelect;
export type NewTimelineEntry = typeof timelineEntries.$inferInsert;
export type KnowledgeVersion = typeof knowledgeVersions.$inferSelect;
export type EvidenceSpan = typeof evidenceSpans.$inferSelect;
export type NewEvidenceSpan = typeof evidenceSpans.$inferInsert;
export type Cluster = typeof clusters.$inferSelect;
export type Community = typeof communities.$inferSelect;
export type CommunityReport = typeof communityReports.$inferSelect;
export type LibraryFile = typeof libraryFiles.$inferSelect;
export type PendingDiff = typeof pendingDiffs.$inferSelect;
export type NewPendingDiff = typeof pendingDiffs.$inferInsert;
export type AutoChangeLog = typeof autoChangeLog.$inferSelect;
export type ShadowBenchmark = typeof shadowBenchmarks.$inferSelect;
export type NliCache = typeof nliCache.$inferSelect;
export type ConversationLog = typeof conversationLogs.$inferSelect;
export type NewConversationLog = typeof conversationLogs.$inferInsert;
export type GhostRelation = typeof ghostRelations.$inferSelect;
export type ObservedFile = typeof observedFiles.$inferSelect;
export type EvalAnomalyFlag = typeof evalAnomalyFlags.$inferSelect;
export type BudgetUsage = typeof budgetUsage.$inferSelect;
