# Alethia AI 知识库 v5.0 — 知识模型规范

> 生成日期：2026-07-04
> 版本：v5.0
> 适用范围：Alethia AI 知识库核心系统

---

## 1. 概述

Alethia AI 知识库采用 **Compiled Truth Markdown (CTM)** 作为知识的标准表示格式。每个知识实体以独立的 Markdown 文件存储，通过结构化的区段（Section）和 Frontmatter 元数据实现机器可读与人类可读的统一。

核心设计原则：
- **单一事实源**：每个知识实体有且仅有一个规范 slug
- **语境感知**：同一概念在不同语境下可持有不同语义变体
- **可追溯性**：所有知识变更均有版本记录与证据支撑
- **演化性**：知识通过语义环（Semantic Rings）周期性压缩归档

---

## 2. Compiled Truth Markdown 格式规范

### 2.1 文件结构

每个 CTM 文件由两部分组成：
1. **YAML Frontmatter**：元数据头
2. **结构化区段**：以 `##` 标题分隔的标准区段

解析实现见 `server/src/storage/parser.ts:61` 的 `CompiledTruthParser` 类。

### 2.2 Frontmatter 元数据

| 字段 | 类型 | 必填 | 说明 |
|------|------|------|------|
| `canonical_slug` | string | 是 | 实体的唯一规范标识，如 `concepts/entropy` |
| `title` | string | 是 | 实体显示名称 |
| `type` | string | 是 | 实体类型：`concept` / `person` / `event` / `portal` 等 |
| `contexts` | string[] | 否 | 适用语境列表，如 `[物理学, 信息论]` |
| `aliases` | string[] | 否 | 别名列表，用于重定向与模糊匹配 |
| `version` | string | 否 | 当前语义版本号 |
| `updated_at` | string | 否 | 最后更新时间（ISO 日期） |

**代码引用**：解析逻辑在 `server/src/storage/parser.ts:67-70`

```typescript
const slug = data.canonical_slug || this.slugFromPath(filePath);
const title = data.title || this.extractTitle(content) || slug;
const type = data.type || 'concept';
const contexts = Array.isArray(data.contexts) ? data.contexts : [];
```

### 2.3 标准区段说明

#### 2.3.1 ## State — 状态区

**用途**：存储实体的当前事实状态，即"这个东西是什么"。

**内容要求**：
- 以陈述句描述实体的核心定义与属性
- 可包含子标题（`###`）进行结构化组织
- 支持 Markdown 富文本格式

**代码引用**：存储于 `ParsedPage.state` 字段，见 `server/src/storage/parser.ts:91`

---

#### 2.3.2 ## Assessment — 评估区

**用途**：存储对实体的评估、判断、重要性评级等元认知信息。

**内容要求**：
- 描述该知识的可信度、重要性、应用价值
- 记录当前认知的局限性与边界
- 可包含置信度说明

**代码引用**：存储于 `ParsedPage.assessment` 字段，见 `server/src/storage/parser.ts:92`

---

#### 2.3.3 ## Open Threads — 待解决问题

**用途**：记录尚未解决的疑问、争议点或待研究方向。

**格式**：
```markdown
- [ ] 待解决问题描述
- [x] 已解决的问题（可保留作为历史记录）
```

**解析规则**：匹配 `-\s*\[.\]\s*(.+)` 格式，提取问题文本。
见 `server/src/storage/parser.ts:189-201`

**代码引用**：
```typescript
private parseOpenThreads(text: string): string[] {
  const threads: string[] = [];
  const lines = text.split('\n').filter(l => l.trim().startsWith('-'));
  for (const line of lines) {
    const match = line.match(/-\s*\[.\]\s*(.+)/);
    if (match) {
      threads.push(match[1].trim());
    }
  }
  return threads;
}
```

---

#### 2.3.4 ## Relations — 关系区

**用途**：定义该实体与其他实体之间的语义关系。

**格式**：
```markdown
- [[目标实体名称]] · 关系类型
```

**示例**：
```markdown
- [[热力学]] · belongs_to
- [[信息论]] · belongs_to
- [[科学门户]] · featured_in
```

**解析规则**：匹配 `-\s*\[\[([^\]]+)\]\]\s*[·•-]\s*(.+)` 格式。
见 `server/src/storage/parser.ts:136-151`

**目标 slug 生成**：通过 `nameToSlug` 方法将目标名称转换为 slug，规则为小写化、空格转连字符、保留中文与字母数字。
见 `server/src/storage/parser.ts:233-238`

**数据库存储**：关系存入 `links` 表，含 `source_slug`、`target_slug`、`relation`、`weight`、`orphaned` 字段。
见 `server/src/db/migrations/0001_init.sql:34-42`

---

#### 2.3.5 ## Timeline — 时间线

**用途**：记录与该实体相关的重要事件时间线。

**格式**：
```markdown
- YYYY-MM-DD · 事件类型 · 事件描述
```

**示例**：
```markdown
- 2026-07-01 · 版本变更 · 初始创建
- 2026-07-02 · 内容更新 · 补充信息论定义
- 2026-07-03 · 🗣 问答 · 用户询问了熵的本质与应用
```

**解析规则**：匹配 `-\s*([\d-]+)\s*[·•-]\s*([^·•-]+)[·•-]\s*(.+)` 格式。
见 `server/src/storage/parser.ts:153-169`

**数据库存储**：存入 `timeline_entries` 表，含 `slug`、`type`、`payload`、`ts` 字段。
见 `server/src/db/migrations/0001_init.sql:44-50`

---

#### 2.3.6 ## Version History — 版本历史

**用途**：记录实体的版本演进历史。

**格式**：
```markdown
- 版本号 · YYYY-MM-DD · 变更摘要
```

**示例**：
```markdown
- v3 · 2026-07-03 · 补充信息论定义与公式说明
- v2 · 2026-07-02 · 修正热力学第二定律表述
- v1 · 2026-07-01 · 初始创建
```

**解析规则**：匹配 `-\s*([^\s]+)\s*[·•-]\s*([\d-]+)\s*[·•-]\s*(.+)` 格式。
见 `server/src/storage/parser.ts:171-187`

**数据库存储**：存入 `knowledge_versions` 表，含 `slug`、`version`、`ts`、`change_summary`、`archived`、`changelog_path` 字段。
见 `server/src/db/migrations/0001_init.sql:52-60`

**注意**：版本号在数据库中以整数存储，解析时按列表逆序转换（第一条为最新版本，对应最大版本号）。
见 `server/src/storage/sync.ts:151-153`

---

#### 2.3.7 ## Semantic Rings Archive — 语义环归档

**用途**：存储语义环的历史归档摘要，记录知识语义的演化轨迹。

**格式**：
```markdown
- ring-XXX · 周期 · 摘要描述
```

**示例**：
```markdown
- ring-001 · 2026-07 周 · 「熵」概念在物理学语境稳定，信息论语义正在扩展演化
```

**解析规则**：提取所有以 `-` 开头的行，整行作为语义环记录。
见 `server/src/storage/parser.ts:222-231`

**数据库存储**：存入 `semantic_rings` 表，含 `slug`、`ring_version`、`period`、`summary` 字段。
见 `server/src/db/migrations/0001_init.sql:62-68`

---

#### 2.3.8 ## Evidence — 证据区

**用途**：存储支撑知识的证据片段，建立知识可追溯性。

**格式**（类 footnote 语法）：
```markdown
[^span-XXX]: 来源类型：来源标识 · 证据文本内容
```

**示例**：
```markdown
[^span-001]: library:热力学讲义.pdf · "熵是状态函数，其变化量等于可逆过程的热温商积分"
[^span-002]: library:信息论基础.pdf · "香农熵 H(X) = -Σ p(x) log p(x)，衡量随机变量的平均不确定性"
```

**解析规则**：匹配 `\[([^\]]+)\]:\s*(.+)` 格式，以 `·` 分隔来源与文本。
见 `server/src/storage/parser.ts:203-220`

**数据库存储**：存入 `evidence_spans` 表，含 `span_id`、`slug`、`source_file_hash`、`source_text_offset`、`source_text_length`、`span_text`、`lang`、`confidence`、`source_type` 字段。
见 `server/src/db/migrations/0001_init.sql:70-82`

---

## 3. 完整示例：熵 (Entropy)

以下是一个完整的 Compiled Truth Markdown 示例文件 `wiki/concepts/entropy.md`：

```markdown
---
canonical_slug: concepts/entropy
title: 熵
contexts: [物理学, 信息论]
type: concept
version: v3
updated_at: 2026-07-03
---

# 熵

## State

熵是系统无序度的量度，在热力学与信息论中均有重要定义。

在**热力学**中，熵是状态函数，用于描述系统的混乱程度。热力学第二定律指出，孤立系统的熵不会自发减少。

在**信息论**中，香农熵用于衡量信息的不确定性，单位是比特。熵越大，表示不确定性越高，信息量越大。

### 热力学熵

热力学熵的定义由克劳修斯提出：

> dS = δQ_rev / T

其中 δQ_rev 是可逆过程的热量变化，T 是热力学温度。

### 信息论熵

香农熵的数学表达式：

> H(X) = -Σ p(x) log p(x)

其中 p(x) 是随机变量 X 取 x 值的概率。

## Assessment

熵是一个跨学科的重要概念，在物理学、信息论、计算机科学等领域都有广泛应用。理解熵的概念有助于深入理解复杂系统的行为。

当前知识库对熵的定义涵盖了热力学和信息论两个主要领域，基础定义准确，但应用案例较少。

**置信度**：高（核心定义有明确教科书来源支撑）
**重要性**：高（多学科基础概念）
**局限性**：目前缺少在机器学习、生态学等领域的扩展应用说明

## Open Threads

- [ ] 熵与生命负熵的关系尚有争议
- [ ] 熵在机器学习中的应用（最大熵原理）需要补充
- [ ] 玻尔兹曼熵与吉布斯熵的关系需要更详细说明
- [x] 热力学熵与信息论熵的对应关系已补充

## Relations

- [[热力学]] · belongs_to
- [[信息论]] · belongs_to
- [[科学门户]] · featured_in
- [[克劳修斯]] · coined_by
- [[香农]] · extended_by

## Timeline

- 1865-01-01 · 提出 · 克劳修斯提出热力学熵概念
- 1948-01-01 · 扩展 · 香农提出信息论熵
- 2026-07-01 · 版本变更 · 初始创建知识库条目
- 2026-07-02 · 内容更新 · 补充信息论定义
- 2026-07-03 · 🗣 问答 · 用户询问了熵的本质与应用

## Version History

- v3 · 2026-07-03 · 补充信息论定义与公式说明
- v2 · 2026-07-02 · 修正热力学第二定律表述
- v1 · 2026-07-01 · 初始创建

## Semantic Rings Archive

- ring-001 · 2026-07 第 1 周 · 「熵」概念在物理学语境稳定，信息论语义正在扩展演化
- ring-002 · 2026-07 第 2 周 · 跨语境关联增强，开始涌现与生命科学的潜在联系

## Evidence

[^span-001]: library:热力学讲义.pdf · "熵是状态函数，其变化量等于可逆过程的热温商积分"
[^span-002]: library:信息论基础.pdf · "香农熵 H(X) = -Σ p(x) log p(x)，衡量随机变量的平均不确定性"
[^span-003]: external:维基百科-熵 · "熵的概念由鲁道夫·克劳修斯于1865年提出"
[^span-004]: user_input:session_abc123 · 用户提问："信息熵和热力学熵有什么关系？"
```

---

## 4. 关系模型

### 4.1 关系类型定义

Alethia 支持多种语义关系类型，以下为标准关系集：

| 关系类型 | 方向 | 说明 | 示例 |
|----------|------|------|------|
| `belongs_to` | 从属 | A 属于 B（类别/领域） | 熵 · belongs_to · 热力学 |
| `has_concept` | 包含 | B 包含概念 A | 热力学 · has_concept · 熵 |
| `featured_in` | 展示 | A 在 B 中被收录/展示 | 熵 · featured_in · 科学门户 |
| `causes` | 因果 | A 导致 B | 热传递 · causes · 熵增 |
| `caused_by` | 因果（逆） | A 由 B 导致 | 熵增 · caused_by · 不可逆过程 |
| `part_of` | 组成 | A 是 B 的一部分 | 分子运动 · part_of · 热力学系统 |
| `has_part` | 组成（逆） | B 包含 A 作为部分 | 热力学系统 · has_part · 分子运动 |
| `related_to` | 相关 | A 与 B 相关（默认关系） | 熵 · related_to · 焓 |
| `contrasts_with` | 对比 | A 与 B 形成对比 | 熵 · contrasts_with · 负熵 |
| `instance_of` | 实例 | A 是 B 的具体实例 | 卡诺循环 · instance_of · 热力学循环 |
| `subclass_of` | 上下位 | A 是 B 的子类/下位概念 | 信息熵 · subclass_of · 熵 |
| `coined_by` | 人物关联 | A 由 B 提出/创造 | 熵 · coined_by · 克劳修斯 |
| `extended_by` | 人物关联 | A 由 B 扩展/发展 | 信息熵 · extended_by · 香农 |

> **注意**：关系类型是可扩展的，系统不限制只能使用上表中的关系。解析器会原样保留关系字符串。

### 4.2 悬空链接 (Orphaned Links) 处理机制

当关系指向的目标实体在知识库中不存在时，该链接被标记为**悬空链接**。

**机制实现**：
1. 初始同步时，所有链接默认标记为 `orphaned = true`
   见 `server/src/storage/sync.ts:117-122`

2. 通过 `rebuildGhostRelations()` 方法批量检测悬空状态
   见 `server/src/storage/sync.ts:170-186`

```typescript
async rebuildGhostRelations(): Promise<number> {
  const result = await client.query(`
    UPDATE links
    SET orphaned = true
    WHERE target_slug NOT IN (SELECT slug FROM pages)
  `);
  return result.rowCount || 0;
}
```

3. 数据库索引优化：`idx_links_orphaned` 索引加速悬空链接查询
   见 `server/src/db/migrations/0001_init.sql:231`

4. 幽灵关系追踪：`ghost_relations` 表记录发现的潜在关系，状态为 `pending` 时等待处理
   见 `server/src/db/migrations/0001_init.sql:200-206`

### 4.3 语境感知矛盾检测 (Context Variant)

知识库支持同一概念在不同语境下持有不同语义变体。

**语境标识**：通过 Frontmatter 的 `contexts` 字段声明实体适用的语境范围。

**矛盾检测机制**：
- 基于 `nli_cache` 表缓存自然语言推理结果，避免重复计算
  见 `server/src/db/migrations/0001_init.sql:155-162`
- 使用 NLI（自然语言推理）模型跨语境检测陈述间的蕴含、矛盾、中立关系
- 相同 `(hash_a, hash_b)` 对的推理结果会被缓存，提升性能

** pending_diffs 分级处理**：
- 按 `tier`（yellow/orange/red）分级管理待处理变更
- 按 `impact`（low/medium/high）评估影响范围
- 按 `confidence` 评分排序优先级
见 `server/src/db/migrations/0001_init.sql:125-135`

---

## 5. 版本控制策略

### 5.1 语义化版本号规则

版本号采用 **v{MAJOR}** 格式（当前实现），存储为整数版本号。

**版本递增规则**：
- **MAJOR 版本**：实体核心定义发生变化，或语义发生重大调整
- **版本号映射**：Version History 列表中第一条（最新）对应最大版本号

**代码引用**：版本号计算见 `server/src/storage/sync.ts:151-153`

```typescript
for (let i = 0; i < parsed.versionHistory.length; i++) {
  const entry = parsed.versionHistory[i];
  const versionNum = parsed.versionHistory.length - i;
  // ...
}
```

> **设计说明**：当前实现使用简单的整数版本号。对于更复杂的场景，可扩展为 MAJOR.MINOR.PATCH 语义化版本：
> - **MAJOR**：核心定义变更，可能影响下游依赖
> - **MINOR**：内容扩充（新增证据、补充说明）
> - **PATCH**：文字修正、格式调整

### 5.2 Semantic Rings 压缩归档机制

当版本数量超过阈值时，系统自动将早期版本压缩归档，保持主文件简洁。

**归档触发条件**：
- 活跃版本数 > 50 条（`ARCHIVE_THRESHOLD = 50`）
- 保留最近 20 条活跃版本（`KEEP_RECENT = 20`）

见 `server/src/evolution/archive.ts:15-16`

**归档流程**：
1. 扫描 `knowledge_versions` 表，找出活跃版本超阈值的实体
2. 提取最早的 (count - 20) 条版本记录
3. 调用 LLM 生成 2-3 句归档摘要
4. 将详细版本记录写入 `changelog/<slug>.md` 文件
5. 标记数据库记录为 `archived = true`，记录 `changelog_path`
6. 更新 Markdown 文件的 Version History 区段，添加归档链接
7. 触发全量同步重建索引

**代码引用**：`archiveVersions()` 函数，见 `server/src/evolution/archive.ts:35-80`

**changelog 文件格式**：
```markdown
# Changelog: concepts/entropy

> 本文件由版本归档器自动生成，记录已归档的历史版本。

## 摘要

熵概念在 2026-01 至 2026-06 期间共归档 30 个历史版本，涵盖多次状态与评估演进。
核心演进包括：热力学定义完善、信息论扩展、跨语境关联建立。

## 历史版本 (30 条)

- v30 · 2026-06-25 · 补充最大熵原理应用
- v29 · 2026-06-20 · ...
```

### 5.3 回滚一致性保证

系统提供基于批次的全自动回滚机制，确保变更的可撤销性。

**回滚机制**：
1. 所有自动变更记录于 `auto_change_log` 表，按 `batch_id` 分组
   见 `server/src/db/migrations/0001_init.sql:137-144`

2. 每条变更记录包含：
   - `op`：操作类型（`create` / `update` / `delete`）
   - `target`：目标文件路径
   - `payload`：操作数据（含 `oldValue` 用于回滚）
   - `ts`：时间戳
   - `batch_id`：批次标识

3. 回滚操作（`rollbackBatch()`）：
   - 按时间逆序处理批次内的变更
   - `create` → 删除文件
   - `update` → 恢复 `payload.oldValue`
   - `delete` → 从 `payload.oldValue` 重建文件
   - 完成后触发 `rebuild-struct` 同步索引

见 `server/src/evolution/rollback.ts:29-88`

**原子写入保障**：
文件写入使用 `atomicWrite()` 方法，先写 `.bak` 备份文件，成功后再删除备份，确保写入过程中断不会损坏原文件。
见 `server/src/storage/markdown.ts:69-86`

---

## 6. 集群与语义环

### 6.1 集群数据模型

**clusters 表**：
见 `server/src/db/migrations/0001_init.sql:84-90`

| 字段 | 类型 | 说明 |
|------|------|------|
| `id` | SERIAL | 自增主键 |
| `cluster_id` | VARCHAR(64) UNIQUE | 集群唯一标识 |
| `name` | VARCHAR(255) | 集群名称 |
| `lifecycle` | VARCHAR(20) | 生命周期状态：`emerging` / `active` / `archived` |
| `generated_at` | TIMESTAMPTZ | 生成时间 |

**cluster_members 关联表**：
见 `server/src/db/migrations/0001_init.sql:92-96`

| 字段 | 类型 | 说明 |
|------|------|------|
| `cluster_id` | VARCHAR(64) | 外键 → clusters.cluster_id |
| `slug` | VARCHAR(255) | 成员实体 slug |
| **PRIMARY KEY** | (cluster_id, slug) | 复合主键 |

### 6.2 summaries/*.md 同步集群机制

集群通过 `summaries/` 目录下的 Markdown 文件定义，每个文件对应一个集群。

**文件格式**：
```markdown
---
name: 热力学基础概念集群
lifecycle: active
---

# 热力学基础概念

本集群包含热力学的核心概念集合。

## 成员

- [[熵]]
- [[热力学第一定律]]
- [[热力学第二定律]]
- [[卡诺循环]]
- [[焓]]

## 描述

这些概念共同构成了经典热力学的理论基础...
```

**解析逻辑**：
- 文件名（不含扩展名）作为 `cluster_id`
- Frontmatter 中的 `name` 和 `lifecycle` 作为集群元数据
- 正文中的所有 `[[wikilink]]` 被提取为集群成员

见 `server/src/storage/summary.ts:17-35`

```typescript
export function parseSummaryFile(filePath: string, content: string): ParsedCluster {
  const clusterId = basename(filePath, '.md');
  const { data, content: body } = matter(content);
  const name = data.name || clusterId;
  const lifecycle = data.lifecycle || 'emerging';
  
  const members: string[] = [];
  let match: RegExpExecArray | null;
  while ((match = WIKILINK_REGEX.exec(body)) !== null) {
    const slug = match[1].trim();
    if (slug && !members.includes(slug)) {
      members.push(slug);
    }
  }
  
  return { clusterId, name, members, lifecycle, content: body.trim() };
}
```

**同步流程**（`syncSummaries()`）：
1. 列出 `summaries/` 目录下所有 `.md` 文件
2. 逐个解析文件内容
3.  upsert 到 `clusters` 表（冲突时更新 name 和 lifecycle）
4.  清空并重建该集群在 `cluster_members` 中的关联记录

见 `server/src/storage/summary.ts:37-89`

### 6.3 相关表结构

除了集群表，系统还包含以下相关表：

- **communities / community_reports**：社区检测与报告表
  见 `server/src/db/migrations/0001_init.sql:98-108`

- **clusters_meta**：集群元数据键值存储
  见 `server/src/db/migrations/0001_init.sql:110-114`

---

## 7. 证据链规范

### 7.1 evidence_span 的 span_id 生成规则

证据跨度 ID 采用人类可读的格式：`span-{序号}`

**格式说明**：
- 前缀 `span-` 标识证据跨度
- 序号为三位数零填充，如 `001`、`002`
- 在单篇文档内按出现顺序递增

**示例**：
```
span-001
span-002
span-003
```

**代码引用**：解析器从 Markdown 的 footnote 语法中提取 span_id，原样保留。
见 `server/src/storage/parser.ts:207-210`

> **扩展建议**：对于全局唯一标识，可结合 slug 生成全局 ID，如 `concepts/entropy::span-001`。数据库中 `span_id` 字段长度为 64 字符，支持更复杂的编码方案。

### 7.2 证据来源类型

| 来源类型 | 标识前缀 | 说明 | 示例 |
|----------|----------|------|------|
| `library` | `library:` | 知识库内置库文件 | `library:热力学讲义.pdf` |
| `external` | `external:` | 外部来源（网页、书籍等） | `external:维基百科-熵` |
| `user_input` | `user_input:` | 用户输入/对话记录 | `user_input:session_abc123` |
| `llm_extract` | `llm_extract:` | LLM 提取生成 | `llm_extract:batch_001` |

**数据库对应字段**：`evidence_spans.source_type`
见 `server/src/db/migrations/0001_init.sql:81`

**来源与库文件关联**：
- `source_file_hash` 字段关联到 `library_files.hash`
- `source_text_offset` 和 `source_text_length` 精确标记原文位置
- `original_location` 记录原始页码或章节

### 7.3 证据置信度分级

证据置信度以 0.0 - 1.0 的实数表示，对应以下分级：

| 置信度区间 | 等级 | 说明 | 典型来源 |
|------------|------|------|----------|
| 0.9 - 1.0 | 极高 | 经过严格验证的事实，有多重独立来源佐证 | 教科书、权威论文、原始文献 |
| 0.7 - 0.9 | 高 | 有可靠来源支撑，业界普遍认可 | 专业书籍、知名机构发布 |
| 0.5 - 0.7 | 中 | 有一定来源支撑，但尚存争议或条件限制 | 博客文章、普通论文、LLM 提取 |
| 0.3 - 0.5 | 低 | 来源可信度有限，或属于推测性内容 | 论坛讨论、未验证的用户输入 |
| 0.0 - 0.3 | 极低 | 仅作为线索或假设，需进一步验证 | 初步猜想、梦境启发 |

**数据库对应字段**：`evidence_spans.confidence`（REAL 类型）
见 `server/src/db/migrations/0001_init.sql:80`

**典型默认值**：
- 库文件提取：`0.7`（见 `server/src/storage/sync.ts:280`）
- LLM 提取：`0.7`（可根据模型质量调整）
- 用户输入：`0.5`（需人工审核）

---

## 8. 附录

### 8.1 相关文件索引

| 文件路径 | 功能 |
|----------|------|
| `server/src/storage/parser.ts` | CTM 格式解析器 |
| `server/src/storage/summary.ts` | 集群摘要解析与同步 |
| `server/src/storage/sync.ts` | 全量同步引擎 |
| `server/src/storage/markdown.ts` | Markdown 文件存储 |
| `server/src/evolution/archive.ts` | 版本归档 |
| `server/src/evolution/rollback.ts` | 批次回滚 |
| `server/src/db/migrations/0001_init.sql` | 数据库表结构 |
| `wiki/concepts/entropy.md` | 示例：熵 |
| `wiki/concepts/information-theory.md` | 示例：信息论 |
| `wiki/concepts/thermodynamics.md` | 示例：热力学 |

### 8.2 数据库表清单

| 表名 | 用途 |
|------|------|
| `pages` | 页面/实体主表 |
| `page_fts` | 全文检索索引 |
| `page_embeddings` | 向量嵌入 |
| `links` | 实体间关系链接 |
| `timeline_entries` | 时间线条目 |
| `knowledge_versions` | 版本记录 |
| `semantic_rings` | 语义环归档 |
| `evidence_spans` | 证据跨度 |
| `clusters` | 集群定义 |
| `cluster_members` | 集群成员关联 |
| `pending_diffs` | 待处理变更 |
| `auto_change_log` | 自动变更日志（回滚用） |
| `ghost_relations` | 幽灵关系追踪 |
| `library_files` | 库文件索引 |
| `nli_cache` | NLI 推理缓存 |

---

*本文档基于 Alethia AI 知识库 v5.0 代码生成，如有疑问请查阅源代码。*
