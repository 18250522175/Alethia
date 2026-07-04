# 知识模型规范文档生成计划

## 任务目标
创建 `/workspace/docs/04_KNOWLEDGE_MODEL.md` 知识模型规范文档，基于真实代码实现详细描述 Alethia AI 知识库 v5.0 的知识模型。

## 已分析的代码文件
1. `/workspace/server/src/storage/parser.ts` - Compiled Truth Markdown 解析器
2. `/workspace/server/src/storage/summary.ts` - 集群摘要同步
3. `/workspace/server/src/storage/sync.ts` - 同步引擎
4. `/workspace/server/src/storage/markdown.ts` - Markdown 存储
5. `/workspace/server/src/db/migrations/0001_init.sql` - 数据库表结构
6. `/workspace/server/src/evolution/archive.ts` - 版本归档
7. `/workspace/server/src/evolution/rollback.ts` - 回滚机制
8. `/workspace/wiki/concepts/entropy.md` - 熵示例文件
9. `/workspace/wiki/concepts/information-theory.md` - 信息论示例
10. `/workspace/wiki/concepts/thermodynamics.md` - 热力学示例

## 文档结构计划

### 1. 文档头部
- 标题：# Alethia AI 知识库 v5.0 — 知识模型规范
- 生成日期标注（2026-07-04）

### 2. Compiled Truth Markdown 格式规范
- Frontmatter 字段说明（title/type/contexts/canonical_slug/aliases/version/updated_at）
- ## State — 状态区
- ## Assessment — 评估区
- ## Open Threads — 待解决问题
- ## Relations — 关系区
- ## Timeline — 时间线
- ## Version History — 版本历史
- ## Semantic Rings Archive — 语义环归档
- ## Evidence — 证据区

### 3. 完整示例文件
- 以"熵"为主题的完整 Compiled Truth Markdown 示例

### 4. 关系模型
- 关系类型定义（因果/组成/相关/对比/上下位/实例...）
- 悬空链接 orphaned 处理机制
- 语境感知矛盾检测 context_variant

### 5. 版本控制策略
- 语义化版本号规则（MAJOR.MINOR.PATCH）
- Semantic Rings 压缩归档机制
- 回滚一致性保证

### 6. 集群与语义环
- clusters 表模型
- cluster_members 关联
- summaries/*.md 同步集群机制
- 代码引用

### 7. 证据链规范
- evidence_span 的 span_id 生成规则
- 证据来源类型（library/external/user_input/llm_extract）
- 证据置信度分级

## 实现方式
- 直接创建 `/workspace/docs/04_KNOWLEDGE_MODEL.md` 文件
- 所有内容基于真实代码实现，引用具体文件和行号
- 使用中文编写
