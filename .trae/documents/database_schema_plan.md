# 数据库 Schema 详解文档生成计划

## 任务目标
基于 `/workspace/server/src/db/migrations/0001_init.sql` 中的真实表结构，生成 `/workspace/docs/03_DATABASE_SCHEMA.md` 数据库 Schema 详解文档。

## 真实 Schema 统计
- **表总数**：26 张（含 `_migrations` 系统表）
- **索引总数**：22 个
- **扩展**：`vector`（pgvector）、`pg_trgm`

## 功能分组调整（严格基于真实 SQL）

> 注：用户原始分组中有部分表在真实 SQL 中不存在，已根据实际表结构调整如下：

### 1. 核心知识表组（6 张）
- `pages` — 知识页面主表
- `page_embeddings` — 页面向量嵌入
- `page_fts` — 页面全文搜索
- `links` — 页面间链接关系
- `evidence_spans` — 证据片段
- `evidence_translations` — 证据翻译缓存

### 2. 时间与版本表组（3 张）
- `timeline_entries` — 时间线条目
- `knowledge_versions` — 知识版本
- `semantic_rings` — 语义环

### 3. 聚类与社区表组（5 张）
- `clusters` — 聚类
- `cluster_members` — 聚类成员
- `communities` — 社区
- `community_reports` — 社区报告
- `clusters_meta` — 聚类元数据

### 4. 文件与变更表组（5 张）
- `library_files` — 库文件
- `pending_diffs` — 待处理差异
- `auto_change_log` — 自动变更日志
- `ghost_relations` — 幽灵关系
- `observed_files` — 观察文件

### 5. 评估与缓存表组（4 张）
- `shadow_benchmarks` — 影子基准测试
- `nli_cache` — 自然语言推理缓存
- `user_rules` — 用户规则
- `eval_anomaly_flags` — 评估异常标记

### 6. 系统配置表组（2 张 + 1 系统表）
- `settings` — 系统设置
- `conversation_logs` — 对话日志
- `_migrations` — 迁移记录表（系统表）

## 文档结构

```
03_DATABASE_SCHEMA.md
├── Schema 概览
│   ├── 设计理念（DB 是纯缓存池）
│   ├── 表统计总览
│   └── ER 关系描述
├── 索引总览表
├── 向量维度自动迁移机制
├── 各表详解（按 6 个功能分组）
│   ├── 每组：组说明
│   └── 每表：表名+说明 / 字段表 / 索引 / 关联关系
└── 注意事项
```

## 每张表的输出格式
```markdown
### 表名 — 中文说明

**说明**：一句话功能描述。

| 字段名 | 类型 | 约束 | 说明 |
|--------|------|------|------|
| ... | ... | ... | ... |

**索引**：
- `index_name` — 说明

**关联关系**：
- 外键 → 关联表.字段
- 被哪些表引用
```

## 执行步骤
1. 编写完整的 Schema 文档内容
2. 写入 `/workspace/docs/03_DATABASE_SCHEMA.md`
3. 验证文件生成成功

## 约束
- 严格基于真实 SQL，不捏造任何表、字段或索引
- 全部中文
- 字段说明基于字段名和类型合理推断功能含义
