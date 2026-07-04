# 数据库 Schema 详解文档生成计划

## 任务概述
基于 `/workspace/server/src/db/migrations/0001_init.sql` 中的真实表结构，生成完整的数据库 Schema 详解文档。

## 数据源
- **文件路径**: `/workspace/server/src/db/migrations/0001_init.sql`
- **表数量**: 26 张
- **索引数量**: 22 个
- **扩展**: vector, pg_trgm

## 文档结构

### 1. 标题 + 生成日期
- 文档标题：数据库 Schema 详解
- 生成日期：2026-07-04

### 2. Schema 概览
- 总表数统计（26 张）
- 功能分组说明
- ER 关系文字描述

### 3. 按功能分组逐表详细说明

**分组规划：**

#### 核心知识组（5 张表）
- `pages` - 知识页面主表
- `page_fts` - 页面全文搜索
- `page_embeddings` - 页面向量嵌入
- `links` - 页面链接关系
- `evidence_spans` - 证据片段

#### 时间与版本组（3 张表）
- `timeline_entries` - 时间线条目
- `knowledge_versions` - 知识版本
- `semantic_rings` - 语义环

#### 聚类与社区组（5 张表）
- `clusters` - 聚类
- `cluster_members` - 聚类成员
- `communities` - 社区
- `community_reports` - 社区报告
- `clusters_meta` - 聚类元数据

#### 文件与变更组（4 张表）
- `library_files` - 库文件
- `pending_diffs` - 待处理差异
- `auto_change_log` - 自动变更日志
- `observed_files` - 观察文件

#### 评估与缓存组（3 张表）
- `shadow_benchmarks` - 影子基准测试
- `nli_cache` - NLI 缓存
- `eval_anomaly_flags` - 评估异常标记

#### 系统与配置组（6 张表）
- `_migrations` - 迁移记录
- `user_rules` - 用户规则
- `settings` - 系统设置
- `conversation_logs` - 对话日志
- `evidence_translations` - 证据翻译
- `ghost_relations` - 幽灵关系

**每张表包含：**
- 表名 + 功能说明
- 字段表（字段名、类型、约束、默认值、说明）
- 索引列表
- 关联关系

### 4. 索引总览表
- 索引名称
- 所属表
- 索引类型
- 索引字段
- 说明

### 5. 向量维度自动迁移机制
- 基于 `page_embeddings` 表的 vector(384) 类型
- pgvector 扩展说明
- 模型字段设计

### 6. 注意事项
- 数据库作为纯缓存池的设计理念
- 数据可重建性
- 性能优化点

## 输出文件
- **路径**: `/workspace/docs/03_DATABASE_SCHEMA.md`
- **语言**: 中文
- **格式**: Markdown
