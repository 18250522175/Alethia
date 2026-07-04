# 数据库 Schema 详解

本文档详细描述知识库系统的 PostgreSQL 数据库 Schema，所有内容严格基于 `server/src/db/migrations/0001_init.sql` 中的真实表结构。

---

## 一、Schema 概览

### 1.1 设计理念

**数据库是纯缓存池（Pure Cache Pool）**：数据库中存储的所有数据均可从源文件（Markdown 笔记、库文件等）重新生成。数据库的作用是提供高性能的查询、检索和结构化访问，而非唯一数据源。这意味着：

- 可随时全量重建数据库而不丢失核心知识
- 表设计优先考虑查询性能，而非严格的范式化
- 允许一定程度的数据冗余以换取检索速度
- 所有写操作均为幂等的，可重复执行

### 1.2 启用的扩展

| 扩展 | 用途 |
|------|------|
| `vector` (pgvector) | 向量相似度搜索，支持 HNSW 索引 |
| `pg_trgm` | Trigram 模糊搜索，支持相似度匹配 |

### 1.3 表统计总览

| 分组 | 表数量 | 主要用途 |
|------|--------|----------|
| 核心知识表组 | 6 | 页面、向量、全文、链接、证据 |
| 时间与版本表组 | 3 | 时间线、知识版本、语义环 |
| 聚类与社区表组 | 5 | 聚类、社区、元数据 |
| 文件与变更表组 | 5 | 文件管理、差异、变更日志 |
| 评估与缓存表组 | 4 | 基准测试、缓存、规则、异常 |
| 系统配置表组 | 3 | 设置、对话日志、迁移记录 |
| **合计** | **26** | — |

### 1.4 ER 关系描述

核心实体关系如下：

```
pages (1) —— (1) page_embeddings    [page_id]
pages (1) —— (1) page_fts           [page_id]
pages (1) —— (N) links              [source_slug / target_slug]
pages (1) —— (N) evidence_spans     [slug]
pages (1) —— (N) timeline_entries   [slug]
pages (1) —— (N) knowledge_versions [slug]
pages (1) —— (N) semantic_rings     [slug]
pages (1) —— (N) pending_diffs      [slug]
pages (1) —— (N) ghost_relations    [source_slug]

clusters (1) —— (N) cluster_members [cluster_id]
communities (1) —— (N) community_reports [community_id]

evidence_spans (1) —— (N) evidence_translations [span_id]
library_files (1) —— (N) evidence_spans [source_file_hash]
```

**关系要点**：
- `pages` 是整个 Schema 的核心实体，几乎所有表都通过 `slug` 与页面关联
- `page_embeddings` 和 `page_fts` 与 `pages` 是一对一关系，作为性能扩展表
- 聚类和社区是对页面的聚合分组，通过成员表关联
- `links` 是自引用关系，通过 slug 字符串关联而非外键（允许目标页面不存在的"孤立链接"）

---

## 二、索引总览表

| 序号 | 索引名 | 表名 | 类型 | 字段/表达式 | 说明 |
|------|--------|------|------|-------------|------|
| 1 | `idx_pages_slug` | pages | B-tree | slug | 页面 slug 快速查找 |
| 2 | `idx_pages_type` | pages | B-tree | type | 按页面类型过滤 |
| 3 | `idx_page_embeddings_hnsw` | page_embeddings | HNSW | embedding vector_cosine_ops | 向量余弦相似度搜索 |
| 4 | `idx_page_fts_gin` | page_fts | GIN | tsv | 全文搜索倒排索引 |
| 5 | `idx_links_source` | links | B-tree | source_slug | 按源页面查出站链接 |
| 6 | `idx_links_target` | links | B-tree | target_slug | 按目标页面查入站链接 |
| 7 | `idx_links_orphaned` | links | B-tree | orphaned | 条件索引，仅索引孤立链接 |
| 8 | `idx_timeline_slug` | timeline_entries | B-tree | slug | 按页面查时间线 |
| 9 | `idx_timeline_ts` | timeline_entries | B-tree | ts DESC | 时间线按时间倒序 |
| 10 | `idx_knowledge_versions_slug` | knowledge_versions | B-tree | slug | 按页面查版本历史 |
| 11 | `idx_knowledge_versions_unique` | knowledge_versions | UNIQUE | slug, version | 确保每页版本号唯一 |
| 12 | `idx_semantic_rings_slug` | semantic_rings | B-tree | slug | 按页面查语义环 |
| 13 | `idx_evidence_spans_slug` | evidence_spans | B-tree | slug | 按页面查证据片段 |
| 14 | `idx_evidence_spans_hash` | evidence_spans | B-tree | source_file_hash | 按源文件查证据 |
| 15 | `idx_pending_diffs_tier` | pending_diffs | B-tree | tier, resolved | 条件索引，仅索引未解决的差异 |
| 16 | `idx_pending_diffs_slug` | pending_diffs | B-tree | slug | 按页面查待处理差异 |
| 17 | `idx_auto_change_log_batch` | auto_change_log | B-tree | batch_id | 按批次查变更日志 |
| 18 | `idx_conversation_logs_conv_id` | conversation_logs | B-tree | conversation_id | 按会话查日志 |
| 19 | `idx_conversation_logs_ts` | conversation_logs | B-tree | ts DESC | 对话日志按时间倒序 |
| 20 | `idx_ghost_relations_status` | ghost_relations | B-tree | status | 条件索引，仅索引待处理幽灵关系 |
| 21 | `idx_library_files_status` | library_files | B-tree | status | 按文件状态过滤 |
| 22 | `idx_observed_files_ref_count` | observed_files | B-tree | reference_count DESC | 按引用次数排序 |

---

## 三、向量维度自动迁移机制

### 3.1 当前配置

`page_embeddings` 表的向量列定义为：

```sql
embedding vector(384)
```

对应默认模型 `all-MiniLM-L6-v2`（384 维）。

### 3.2 迁移策略说明

由于 pgvector 的 `vector(N)` 类型的维度是固定的，切换不同维度的嵌入模型时需要迁移向量列。推荐迁移方式：

1. **添加新列**：新增 `embedding_new vector(NEW_DIM)` 列
2. **后台填充**：批量计算并写入新向量
3. **原子切换**：事务内重命名列 `embedding → embedding_old, embedding_new → embedding`
4. **重建索引**：重建 HNSW 索引
5. **清理旧列**：确认无误后删除旧列

该机制确保向量维度切换时服务不中断。

---

## 四、各表详解

### 4.1 核心知识表组

存储知识库的核心内容：页面、向量嵌入、全文索引、链接关系、证据片段。

---

#### pages — 知识页面主表

**说明**：知识库的核心实体表，存储每个知识页面的基本信息和内容。每个页面对应一个唯一的 slug（URL 友好标识符）。

| 字段名 | 类型 | 约束 | 说明 |
|--------|------|------|------|
| `id` | SERIAL | PRIMARY KEY | 自增主键 |
| `slug` | VARCHAR(255) | UNIQUE NOT NULL | 页面唯一标识符，URL 友好 |
| `path` | VARCHAR(1024) | NOT NULL | 源 Markdown 文件的文件系统路径 |
| `type` | VARCHAR(50) | NOT NULL DEFAULT 'concept' | 页面类型，如 concept、person、project 等 |
| `contexts` | TEXT[] | NOT NULL DEFAULT '{}' | 上下文标签数组，用于分类和过滤 |
| `raw_md` | TEXT | NOT NULL DEFAULT '' | 原始 Markdown 内容 |
| `parsed_json` | JSONB | NOT NULL DEFAULT '{}' | 解析后的结构化数据（JSON 格式） |
| `content_md` | TEXT | NOT NULL DEFAULT '' | 处理后的纯内容 Markdown（去除元数据等） |
| `hash` | VARCHAR(64) | NOT NULL DEFAULT '' | 内容哈希值，用于检测变更 |
| `updated_at` | TIMESTAMPTZ | NOT NULL DEFAULT NOW() | 最后更新时间 |

**索引**：
- `idx_pages_slug` — slug 快速查找（B-tree）
- `idx_pages_type` — 按类型过滤（B-tree）

**关联关系**：
- 被 `page_embeddings.page_id` 引用（1:1）
- 被 `page_fts.page_id` 引用（1:1）
- 被 `links.source_slug` / `links.target_slug` 引用（1:N，通过字符串关联）
- 被 `evidence_spans.slug` 引用（1:N，通过字符串关联）
- 被 `timeline_entries.slug` 引用（1:N）
- 被 `knowledge_versions.slug` 引用（1:N）
- 被 `semantic_rings.slug` 引用（1:N）

---

#### page_embeddings — 页面向量嵌入

**说明**：存储每个页面内容的向量嵌入表示，用于语义相似度搜索。与 pages 表是一对一关系。

| 字段名 | 类型 | 约束 | 说明 |
|--------|------|------|------|
| `page_id` | INTEGER | PRIMARY KEY REFERENCES pages(id) ON DELETE CASCADE | 关联页面 ID，同时作为主键 |
| `embedding` | vector(384) | — | 384 维向量嵌入 |
| `model` | VARCHAR(255) | NOT NULL DEFAULT 'all-MiniLM-L6-v2' | 生成向量所用的模型名称 |

**索引**：
- `idx_page_embeddings_hnsw` — HNSW 向量索引，使用余弦相似度（vector_cosine_ops）

**关联关系**：
- 外键 `page_id` → `pages.id`（级联删除）

---

#### page_fts — 页面全文搜索

**说明**：存储每个页面的全文搜索向量（TSVECTOR），用于 PostgreSQL 原生全文检索。与 pages 表是一对一关系。

| 字段名 | 类型 | 约束 | 说明 |
|--------|------|------|------|
| `page_id` | INTEGER | PRIMARY KEY REFERENCES pages(id) ON DELETE CASCADE | 关联页面 ID，同时作为主键 |
| `tsv` | TSVECTOR | — | 全文搜索向量 |
| `source_text` | TEXT | NOT NULL DEFAULT '' | 生成 TSV 的源文本，用于调试和重建 |

**索引**：
- `idx_page_fts_gin` — GIN 倒排索引，加速全文搜索

**关联关系**：
- 外键 `page_id` → `pages.id`（级联删除）

---

#### links — 页面间链接关系

**说明**：存储页面之间的超链接关系，支持有向图遍历。通过 slug 字符串关联而非外键，以支持目标页面可能不存在的"孤立链接"场景。

| 字段名 | 类型 | 约束 | 说明 |
|--------|------|------|------|
| `id` | SERIAL | PRIMARY KEY | 自增主键 |
| `source_slug` | VARCHAR(255) | NOT NULL | 源页面 slug（链接出处） |
| `target_slug` | VARCHAR(255) | NOT NULL | 目标页面 slug（链接指向） |
| `relation` | VARCHAR(100) | NOT NULL DEFAULT 'related' | 链接关系类型，如 related、parent、child 等 |
| `weight` | REAL | NOT NULL DEFAULT 1.0 | 链接权重，用于图算法排序 |
| `orphaned` | BOOLEAN | NOT NULL DEFAULT FALSE | 是否为孤立链接（目标页面不存在） |
| `created_at` | TIMESTAMPTZ | NOT NULL DEFAULT NOW() | 创建时间 |

**索引**：
- `idx_links_source` — 按源页面查出站链接（B-tree）
- `idx_links_target` — 按目标页面查入站链接（B-tree）
- `idx_links_orphaned` — 条件索引，仅索引 `orphaned = true` 的孤立链接（B-tree）

**关联关系**：
- 通过 `source_slug` / `target_slug` 与 `pages.slug` 关联（无外键约束，允许悬停引用）

---

#### evidence_spans — 证据片段

**说明**：存储从源文件中提取的文本证据片段，用于支撑知识页面中的陈述。每个证据片段可追溯到源文件中的具体位置。

| 字段名 | 类型 | 约束 | 说明 |
|--------|------|------|------|
| `id` | SERIAL | PRIMARY KEY | 自增主键 |
| `span_id` | VARCHAR(64) | UNIQUE NOT NULL | 证据片段唯一标识符 |
| `slug` | VARCHAR(255) | NOT NULL | 所属页面的 slug |
| `source_file_hash` | VARCHAR(64) | NOT NULL | 源文件哈希（关联 library_files） |
| `source_text_offset` | INTEGER | NOT NULL DEFAULT 0 | 在源文本中的起始偏移量 |
| `source_text_length` | INTEGER | NOT NULL DEFAULT 0 | 片段文本长度 |
| `original_location` | VARCHAR(255) | — | 原始位置描述（如章节标题） |
| `span_text` | TEXT | NOT NULL | 证据片段的文本内容 |
| `lang` | VARCHAR(10) | NOT NULL DEFAULT 'zh-CN' | 语言代码 |
| `confidence` | REAL | — | 置信度分数 |
| `source_type` | VARCHAR(20) | — | 源类型，如 pdf、markdown、web 等 |

**索引**：
- `idx_evidence_spans_slug` — 按页面 slug 查证据（B-tree）
- `idx_evidence_spans_hash` — 按源文件哈希查证据（B-tree）

**关联关系**：
- 通过 `slug` 与 `pages.slug` 关联（无外键）
- 通过 `source_file_hash` 与 `library_files.hash` 关联（无外键）
- 被 `evidence_translations.span_id` 引用（1:N，通过字符串关联）

---

#### evidence_translations — 证据翻译缓存

**说明**：存储证据片段的翻译结果缓存，避免重复翻译。带过期时间，支持自动失效。

| 字段名 | 类型 | 约束 | 说明 |
|--------|------|------|------|
| `id` | SERIAL | PRIMARY KEY | 自增主键 |
| `span_id` | VARCHAR(64) | NOT NULL | 关联的证据片段 ID |
| `source_text` | TEXT | NOT NULL | 源文本（用于校验缓存有效性） |
| `translated_text` | TEXT | NOT NULL | 翻译后的文本 |
| `lang` | VARCHAR(10) | NOT NULL | 目标语言代码 |
| `model` | VARCHAR(255) | NOT NULL | 使用的翻译模型 |
| `created_at` | TIMESTAMPTZ | NOT NULL DEFAULT NOW() | 翻译时间 |
| `expires_at` | TIMESTAMPTZ | NOT NULL | 缓存过期时间 |

**索引**：无专用索引

**关联关系**：
- 通过 `span_id` 与 `evidence_spans.span_id` 关联（无外键）

---

### 4.2 时间与版本表组

管理知识的时间维度：时间线事件、版本历史、语义演化环。

---

#### timeline_entries — 时间线条目

**说明**：存储与页面相关的时间线事件，用于构建知识的时间维度视图。

| 字段名 | 类型 | 约束 | 说明 |
|--------|------|------|------|
| `id` | SERIAL | PRIMARY KEY | 自增主键 |
| `slug` | VARCHAR(255) | NOT NULL | 关联页面的 slug |
| `type` | VARCHAR(50) | NOT NULL | 事件类型，如 birth、death、event、milestone 等 |
| `payload` | JSONB | NOT NULL DEFAULT '{}' | 事件的详细数据（JSON 格式） |
| `ts` | TIMESTAMPTZ | NOT NULL DEFAULT NOW() | 事件发生时间 |

**索引**：
- `idx_timeline_slug` — 按页面 slug 查时间线（B-tree）
- `idx_timeline_ts` — 按时间倒序排列（B-tree）

**关联关系**：
- 通过 `slug` 与 `pages.slug` 关联（无外键）

---

#### knowledge_versions — 知识版本

**说明**：记录每个知识页面的版本历史，支持版本追溯和变更查看。

| 字段名 | 类型 | 约束 | 说明 |
|--------|------|------|------|
| `id` | SERIAL | PRIMARY KEY | 自增主键 |
| `slug` | VARCHAR(255) | NOT NULL | 关联页面的 slug |
| `version` | INTEGER | NOT NULL | 版本号（从 1 开始递增） |
| `ts` | TIMESTAMPTZ | NOT NULL DEFAULT NOW() | 版本创建时间 |
| `change_summary` | TEXT | NOT NULL DEFAULT '' | 变更摘要描述 |
| `archived` | BOOLEAN | NOT NULL DEFAULT FALSE | 是否已归档 |
| `changelog_path` | VARCHAR(1024) | — | 变更日志文件路径 |

**索引**：
- `idx_knowledge_versions_slug` — 按页面 slug 查版本历史（B-tree）
- `idx_knowledge_versions_unique` — 唯一索引，确保同一页面的版本号不重复（UNIQUE）

**关联关系**：
- 通过 `slug` 与 `pages.slug` 关联（无外键）

---

#### semantic_rings — 语义环

**说明**：记录知识页面在不同时期的语义表示，用于追踪知识的语义演化。每个"环"代表一个时期的语义快照。

| 字段名 | 类型 | 约束 | 说明 |
|--------|------|------|------|
| `id` | SERIAL | PRIMARY KEY | 自增主键 |
| `slug` | VARCHAR(255) | NOT NULL | 关联页面的 slug |
| `ring_version` | INTEGER | NOT NULL | 语义环版本号 |
| `period` | VARCHAR(100) | NOT NULL | 时期描述，如 "2024-Q1" |
| `summary` | TEXT | NOT NULL DEFAULT '' | 该时期的语义摘要 |

**索引**：
- `idx_semantic_rings_slug` — 按页面 slug 查语义环（B-tree）

**关联关系**：
- 通过 `slug` 与 `pages.slug` 关联（无外键）

---

### 4.3 聚类与社区表组

管理知识的聚合结构：自动聚类、社区发现、元数据配置。

---

#### clusters — 聚类

**说明**：存储语义聚类结果，将相似的知识页面聚合为簇。

| 字段名 | 类型 | 约束 | 说明 |
|--------|------|------|------|
| `id` | SERIAL | PRIMARY KEY | 自增主键 |
| `cluster_id` | VARCHAR(64) | UNIQUE NOT NULL | 聚类唯一标识符 |
| `name` | VARCHAR(255) | NOT NULL | 聚类名称（人类可读） |
| `lifecycle` | VARCHAR(20) | NOT NULL DEFAULT 'emerging' | 生命周期状态：emerging、growing、stable、declining 等 |
| `generated_at` | TIMESTAMPTZ | NOT NULL DEFAULT NOW() | 聚类生成时间 |

**索引**：无专用索引（cluster_id 有 UNIQUE 约束隐式索引）

**关联关系**：
- 被 `cluster_members.cluster_id` 引用（1:N）

---

#### cluster_members — 聚类成员

**说明**：聚类与页面的多对多关联表，记录每个聚类包含哪些页面。

| 字段名 | 类型 | 约束 | 说明 |
|--------|------|------|------|
| `cluster_id` | VARCHAR(64) | NOT NULL REFERENCES clusters(cluster_id) ON DELETE CASCADE | 聚类 ID，联合主键之一 |
| `slug` | VARCHAR(255) | NOT NULL | 成员页面 slug，联合主键之一 |

**联合主键**：`(cluster_id, slug)`

**索引**：无专用索引（联合主键隐式索引）

**关联关系**：
- 外键 `cluster_id` → `clusters.cluster_id`（级联删除）
- 通过 `slug` 与 `pages.slug` 关联（无外键）

---

#### communities — 社区

**说明**：存储社区发现结果，社区是比聚类更高层次的页面分组，通常基于链接图的社区检测算法生成。

| 字段名 | 类型 | 约束 | 说明 |
|--------|------|------|------|
| `id` | SERIAL | PRIMARY KEY | 自增主键 |
| `community_id` | VARCHAR(64) | UNIQUE NOT NULL | 社区唯一标识符 |
| `label` | VARCHAR(255) | NOT NULL | 社区标签/名称 |

**索引**：无专用索引（community_id 有 UNIQUE 约束隐式索引）

**关联关系**：
- 被 `community_reports.community_id` 引用（1:N）

---

#### community_reports — 社区报告

**说明**：存储每个社区的分析报告内容。

| 字段名 | 类型 | 约束 | 说明 |
|--------|------|------|------|
| `id` | SERIAL | PRIMARY KEY | 自增主键 |
| `community_id` | VARCHAR(64) | NOT NULL REFERENCES communities(community_id) ON DELETE CASCADE | 关联社区 ID |
| `content` | TEXT | NOT NULL DEFAULT '' | 报告内容 |

**索引**：无专用索引

**关联关系**：
- 外键 `community_id` → `communities.community_id`（级联删除）

---

#### clusters_meta — 聚类元数据

**说明**：键值对形式存储聚类相关的元数据和配置。

| 字段名 | 类型 | 约束 | 说明 |
|--------|------|------|------|
| `id` | SERIAL | PRIMARY KEY | 自增主键 |
| `key` | VARCHAR(255) | NOT NULL | 元数据键名 |
| `value` | TEXT | NOT NULL DEFAULT '' | 元数据值 |

**索引**：无专用索引

**关联关系**：无外键关联，独立配置表

---

### 4.4 文件与变更表组

管理源文件、待处理变更、自动变更日志和幽灵关系。

---

#### library_files — 库文件

**说明**：存储已纳入知识库的源文件元数据，如 PDF、文档等。文件内容本身存储在文件系统，此表仅存元数据。

| 字段名 | 类型 | 约束 | 说明 |
|--------|------|------|------|
| `hash` | VARCHAR(64) | PRIMARY KEY | 文件内容哈希（SHA-256），同时作为主键 |
| `mime` | VARCHAR(100) | NOT NULL | MIME 类型，如 application/pdf |
| `original_name` | VARCHAR(255) | NOT NULL | 原始文件名 |
| `size` | BIGINT | NOT NULL DEFAULT 0 | 文件大小（字节） |
| `status` | VARCHAR(30) | NOT NULL DEFAULT 'new' | 处理状态：new、processing、done、failed 等 |
| `ingested_at` | TIMESTAMPTZ | NOT NULL DEFAULT NOW() | 入库时间 |

**索引**：
- `idx_library_files_status` — 按状态过滤（B-tree）

**关联关系**：
- 通过 `hash` 与 `evidence_spans.source_file_hash` 关联（无外键）

---

#### pending_diffs — 待处理差异

**说明**：存储自动检测到但尚未确认的知识变更建议，等待人工审核或自动处理。

| 字段名 | 类型 | 约束 | 说明 |
|--------|------|------|------|
| `id` | VARCHAR(64) | PRIMARY KEY | 差异唯一标识符 |
| `slug` | VARCHAR(255) | NOT NULL | 关联页面的 slug |
| `type` | VARCHAR(50) | NOT NULL | 差异类型，如 content_update、new_link、fact_update 等 |
| `payload` | JSONB | NOT NULL DEFAULT '{}' | 差异详情（JSON 格式） |
| `confidence` | REAL | NOT NULL DEFAULT 0.0 | AI 推荐的置信度 |
| `impact` | VARCHAR(10) | NOT NULL DEFAULT 'low' | 影响程度：low、medium、high |
| `tier` | VARCHAR(10) | NOT NULL DEFAULT 'yellow' | 处理优先级：red、orange、yellow、green |
| `created_at` | TIMESTAMPTZ | NOT NULL DEFAULT NOW() | 创建时间 |
| `resolved` | BOOLEAN | NOT NULL DEFAULT FALSE | 是否已处理 |

**索引**：
- `idx_pending_diffs_tier` — 条件索引，仅索引 `resolved = false` 的待处理项，按 tier 排序（B-tree）
- `idx_pending_diffs_slug` — 按页面 slug 查待处理差异（B-tree）

**关联关系**：
- 通过 `slug` 与 `pages.slug` 关联（无外键）

---

#### auto_change_log — 自动变更日志

**说明**：记录系统自动执行的所有变更操作，用于审计和回溯。

| 字段名 | 类型 | 约束 | 说明 |
|--------|------|------|------|
| `id` | SERIAL | PRIMARY KEY | 自增主键 |
| `batch_id` | VARCHAR(64) | NOT NULL | 批次 ID，同一次批量操作共享 |
| `op` | VARCHAR(50) | NOT NULL | 操作类型：insert、update、delete 等 |
| `target` | VARCHAR(255) | NOT NULL | 操作目标（页面 slug 或其他标识符） |
| `payload` | JSONB | NOT NULL DEFAULT '{}' | 操作详情（JSON 格式） |
| `ts` | TIMESTAMPTZ | NOT NULL DEFAULT NOW() | 操作时间 |

**索引**：
- `idx_auto_change_log_batch` — 按批次 ID 查操作记录（B-tree）

**关联关系**：无外键关联，独立审计日志表

---

#### ghost_relations — 幽灵关系

**说明**：存储文本中提到但尚未在知识库中创建对应页面的实体引用（"幽灵"实体）。用于发现潜在的新知识节点。

| 字段名 | 类型 | 约束 | 说明 |
|--------|------|------|------|
| `id` | SERIAL | PRIMARY KEY | 自增主键 |
| `source_slug` | VARCHAR(255) | NOT NULL | 提到该实体的源页面 slug |
| `target_name` | VARCHAR(255) | NOT NULL | 被提到的实体名称 |
| `discovered_at` | TIMESTAMPTZ | NOT NULL DEFAULT NOW() | 发现时间 |
| `status` | VARCHAR(20) | NOT NULL DEFAULT 'pending' | 处理状态：pending、created、ignored 等 |

**索引**：
- `idx_ghost_relations_status` — 条件索引，仅索引 `status = 'pending'` 的待处理项（B-tree）

**关联关系**：
- 通过 `source_slug` 与 `pages.slug` 关联（无外键）

---

#### observed_files — 观察文件

**说明**：记录系统观察到的文件及其引用计数，用于资源管理和垃圾回收。

| 字段名 | 类型 | 约束 | 说明 |
|--------|------|------|------|
| `id` | SERIAL | PRIMARY KEY | 自增主键 |
| `file_hash` | VARCHAR(64) | NOT NULL UNIQUE | 文件哈希 |
| `reference_count` | INTEGER | NOT NULL DEFAULT 0 | 引用次数 |
| `first_referenced_at` | TIMESTAMPTZ | NOT NULL DEFAULT NOW() | 首次被引用时间 |
| `last_referenced_at` | TIMESTAMPTZ | NOT NULL DEFAULT NOW() | 最后被引用时间 |

**索引**：
- `idx_observed_files_ref_count` — 按引用次数倒序排列（B-tree）

**关联关系**：无外键关联，独立资源统计表

---

### 4.5 评估与缓存表组

管理评估基准、推理缓存、用户规则和异常标记。

---

#### shadow_benchmarks — 影子基准测试

**说明**：存储影子评估的基准测试用例，用于在后台验证 AI 输出质量而不影响用户。

| 字段名 | 类型 | 约束 | 说明 |
|--------|------|------|------|
| `id` | SERIAL | PRIMARY KEY | 自增主键 |
| `type` | VARCHAR(50) | NOT NULL | 测试类型，如 summarization、extraction、reasoning 等 |
| `slug` | VARCHAR(255) | — | 关联页面的 slug（可选） |
| `source_text` | TEXT | NOT NULL | 输入文本 |
| `expected_output` | TEXT | NOT NULL | 期望输出 |
| `git_commit` | VARCHAR(64) | — | 关联的代码提交哈希 |

**索引**：无专用索引

**关联关系**：无外键关联，独立评估表

---

#### nli_cache — 自然语言推理缓存

**说明**：存储自然语言推理（NLI）的结果缓存，避免重复计算。通过两个文本的哈希组合作为唯一键。

| 字段名 | 类型 | 约束 | 说明 |
|--------|------|------|------|
| `id` | SERIAL | PRIMARY KEY | 自增主键 |
| `hash_a` | VARCHAR(64) | NOT NULL | 前提文本的哈希 |
| `hash_b` | VARCHAR(64) | NOT NULL | 假设文本的哈希 |
| `label` | VARCHAR(20) | NOT NULL | 推理结果：entailment、contradiction、neutral |
| `ts` | TIMESTAMPTZ | NOT NULL DEFAULT NOW() | 缓存时间 |

**唯一约束**：`UNIQUE(hash_a, hash_b)`

**索引**：无专用索引（唯一约束隐式索引）

**关联关系**：无外键关联，独立缓存表

---

#### user_rules — 用户规则

**说明**：存储用户定义的模式映射规则，用于自定义知识提取和转换逻辑。

| 字段名 | 类型 | 约束 | 说明 |
|--------|------|------|------|
| `id` | SERIAL | PRIMARY KEY | 自增主键 |
| `pattern` | VARCHAR(255) | NOT NULL | 匹配模式（正则表达式或通配符） |
| `mapping` | VARCHAR(255) | NOT NULL | 映射规则/目标 |
| `hits` | INTEGER | NOT NULL DEFAULT 0 | 命中次数统计 |
| `created_at` | TIMESTAMPTZ | NOT NULL DEFAULT NOW() | 创建时间 |

**索引**：无专用索引

**关联关系**：无外键关联，独立配置表

---

#### eval_anomaly_flags — 评估异常标记

**说明**：存储评估过程中检测到的异常指标，用于监控系统健康状态。

| 字段名 | 类型 | 约束 | 说明 |
|--------|------|------|------|
| `id` | VARCHAR(64) | PRIMARY KEY | 异常事件唯一标识符 |
| `metric` | VARCHAR(100) | NOT NULL | 指标名称 |
| `threshold` | REAL | NOT NULL | 阈值 |
| `actual` | REAL | NOT NULL | 实际值 |
| `ts` | TIMESTAMPTZ | NOT NULL DEFAULT NOW() | 检测时间 |
| `message` | TEXT | NOT NULL DEFAULT '' | 异常描述信息 |

**索引**：无专用索引

**关联关系**：无外键关联，独立监控表

---

### 4.6 系统配置表组

管理系统设置、对话日志和迁移记录。

---

#### settings — 系统设置

**说明**：键值对形式存储系统配置项，支持 JSON 类型的值以存储复杂结构。

| 字段名 | 类型 | 约束 | 说明 |
|--------|------|------|------|
| `id` | SERIAL | PRIMARY KEY | 自增主键 |
| `key` | VARCHAR(100) | UNIQUE NOT NULL | 设置项键名 |
| `value` | JSONB | NOT NULL DEFAULT '{}' | 设置值（JSON 格式） |
| `updated_at` | TIMESTAMPTZ | NOT NULL DEFAULT NOW() | 最后更新时间 |

**索引**：无专用索引（key 有 UNIQUE 约束隐式索引）

**关联关系**：无外键关联，独立配置表

---

#### conversation_logs — 对话日志

**说明**：记录用户与 AI 助手的对话历史，用于审计、分析和优化。

| 字段名 | 类型 | 约束 | 说明 |
|--------|------|------|------|
| `id` | SERIAL | PRIMARY KEY | 自增主键 |
| `conversation_id` | VARCHAR(64) | NOT NULL | 会话 ID，同一会话共享 |
| `role` | VARCHAR(20) | NOT NULL | 角色：user、assistant、system |
| `content` | TEXT | NOT NULL | 消息内容 |
| `ts` | TIMESTAMPTZ | NOT NULL DEFAULT NOW() | 消息时间戳 |
| `tokens` | INTEGER | NOT NULL DEFAULT 0 | 消耗的 token 数 |
| `cost` | REAL | NOT NULL DEFAULT 0.0 | 估算成本 |

**索引**：
- `idx_conversation_logs_conv_id` — 按会话 ID 查对话历史（B-tree）
- `idx_conversation_logs_ts` — 按时间倒序排列（B-tree）

**关联关系**：无外键关联，独立日志表

---

#### _migrations — 迁移记录表（系统表）

**说明**：数据库迁移框架的内部表，记录已执行的迁移脚本，确保迁移幂等性。

| 字段名 | 类型 | 约束 | 说明 |
|--------|------|------|------|
| `name` | VARCHAR(255) | PRIMARY KEY | 迁移脚本名称 |
| `applied_at` | TIMESTAMPTZ | NOT NULL DEFAULT NOW() | 执行时间 |

**索引**：无专用索引（主键隐式索引）

**关联关系**：无外键关联，系统内部表

---

## 五、注意事项

### 5.1 数据库是纯缓存池

- 所有数据均可从源文件重新生成，数据库不存储唯一真相
- 可随时执行全量重建（清空 + 重新解析 + 重新计算）
- 备份策略应优先保护源文件，而非数据库

### 5.2 外键约束策略

- 有显式外键的表：`page_embeddings`、`page_fts`、`cluster_members`、`community_reports`
- 通过字符串关联但无外键的表：`links`、`evidence_spans`、`timeline_entries` 等（通过 slug 关联）
- 无外键设计是为了支持"悬停引用"（如孤立链接、幽灵关系等场景）

### 5.3 条件索引的使用

Schema 中多处使用了**部分索引（Partial Index）**，如：
- `idx_links_orphaned` WHERE orphaned = true
- `idx_pending_diffs_tier` WHERE resolved = false
- `idx_ghost_relations_status` WHERE status = 'pending'

这种设计显著减小了索引体积，提高了查询效率，因为通常只需要查询"未处理"的记录。

### 5.4 向量索引的性能

- 使用 HNSW 索引进行近似最近邻搜索
- 当前维度 384（all-MiniLM-L6-v2 模型）
- 切换模型需走向量维度迁移流程（见第三章）

### 5.5 时间戳规范

所有时间字段均使用 `TIMESTAMPTZ`（带时区的时间戳），默认值为 `NOW()`，确保时区一致性。
