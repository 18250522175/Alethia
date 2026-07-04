# Alethia AI 知识库 v5.0 — AI 流水线详解

> 生成日期：2026-07-04
> 文档版本：v5.0
> 适用范围：L1 Agent 编排、L2 检索策略、Dream Cycle、Diff 审核、预算控制、LLM 适配器

---

## 目录

1. [L1 Agent 五阶段编排](#1-l1-agent-五阶段编排)
2. [Agent 扩展模块](#2-agent-扩展模块)
3. [L2 混合检索策略（概述）](#3-l2-混合检索策略概述)
4. [Dream Cycle 六阶段详解](#4-dream-cycle-六阶段详解)
5. [分级 Diff 审核机制](#5-分级-diff-审核机制)
6. [影子评估与熔断](#6-影子评估与熔断)
7. [预算控制策略](#7-预算控制策略)
8. [10 家 LLM 适配器架构](#8-10-家-llm-适配器架构)

---

## 1. L1 Agent 五阶段编排

L1 Agent 采用**五阶段流水线**架构，将问答过程拆解为规划→检索→评分→生成→反思的有序流程。每个阶段职责单一，通过结构化数据传递上下文，支持降级与容错。

```
用户问题 → Planner → Retriever → Grader → Generator → Reflector → 回答
                ↑                          ↓
                └────── 继续检索? ←─────────┘
```

### 1.1 Planner（规划器）

**职责定位**

接收用户自然语言问题，生成结构化检索计划，为后续检索阶段提供精准的检索方向。

**输入/输出**

| 类型 | 格式 | 说明 |
|------|------|------|
| 输入 | `string` | 用户原始问题 |
| 输出 | `RetrievalPlan` | 结构化检索计划 |

**核心逻辑**

1. 调用 LLM（`qa_gen` 任务路由）解析用户问题，生成 JSON 格式的检索计划
2. 检索计划包含四个维度：
   - `keywords`：核心关键词数组
   - `contexts`：上下文线索数组
   - `depth`：检索深度（`shallow` / `medium` / `deep`）
   - `entities`：识别出的实体数组
3. 失败降级：当 LLM 调用失败或解析失败时，采用规则式关键词提取策略
   - 去除常见停用词与标点
   - 截取前 5 个关键词
   - 默认深度为 `medium`

**代码引用**

- 主函数：[file:///workspace/server/src/agents/planner.ts#L29-L46](file:///workspace/server/src/agents/planner.ts#L29-L46)
- 数据结构：[file:///workspace/server/src/agents/planner.ts#L7-L12](file:///workspace/server/src/agents/planner.ts#L7-L12)
- 降级策略：[file:///workspace/server/src/agents/planner.ts#L66-L79](file:///workspace/server/src/agents/planner.ts#L66-L79)

---

### 1.2 Retriever（检索器）

**职责定位**

根据 Planner 输出的检索计划，执行多路检索并获取证据片段，为后续评分与生成提供知识支撑。

**输入/输出**

| 类型 | 格式 | 说明 |
|------|------|------|
| 输入 | `RetrievalPlan` | 检索计划 |
| 输出 | `RetrievalResult` | 检索结果 + 证据 + 图上下文 |

**核心逻辑**

1. **检索深度映射**：
   - `shallow` → topK = 5
   - `medium` → topK = 10
   - `deep` → topK = 20，且启用图遍历

2. **执行流程**：
   - 调用 `executeQuery()` 执行混合检索（详细检索策略见第 3 章）
   - 调用 `getEvidenceForPages()` 从 `evidence_spans` 表获取对应页面的证据片段（最多 20 条）
   - 当深度为 `deep` 且有结果时，调用 `graphTraverse()` 获取 1 跳邻居 slug 作为图上下文

3. **证据片段字段**：
   - `span_id` / `slug` / `source_file_hash`
   - `source_text_offset` / `source_text_length`
   - `span_text` / `lang` / `confidence` / `source_type`

**代码引用**

- 主函数：[file:///workspace/server/src/agents/retriever.ts#L14-L41](file:///workspace/server/src/agents/retriever.ts#L14-L41)
- 证据获取：[file:///workspace/server/src/agents/retriever.ts#L43-L74](file:///workspace/server/src/agents/retriever.ts#L43-L74)

---

### 1.3 Grader（评分器）

**职责定位**

对检索结果质量进行多维度评估，为生成阶段提供质量参考，同时为反思阶段是否需要继续检索提供依据。

**输入/输出**

| 类型 | 格式 | 说明 |
|------|------|------|
| 输入 | `question` + `RetrievalResult` | 用户问题 + 检索结果 |
| 输出 | `GradeResult` | 五维评分 + 推理说明 |

**核心逻辑**

1. **四维评分体系**（0.0 - 1.0）：
   - `factual_accuracy`：事实准确度 — 检索结果与问题的事实匹配程度
   - `coverage_completeness`：覆盖完整度 — 对问题各方面的覆盖程度
   - `source_clarity`：来源清晰度 — 来源的可追溯性与权威性
   - `evidence_coverage`：证据覆盖度 — 有证据支撑的内容比例
   - `overall`：综合得分

2. **执行流程**：
   - 构建包含问题、检索结果列表、证据片段的上下文
   - 调用 LLM（`qa_gen` 路由）进行 JSON 模式评分
   - 失败降级：全部维度默认 0.5 分

**代码引用**

- 主函数：[file:///workspace/server/src/agents/grader.ts#L31-L57](file:///workspace/server/src/agents/grader.ts#L31-L57)
- 评分结构：[file:///workspace/server/src/agents/grader.ts#L8-L15](file:///workspace/server/src/agents/grader.ts#L8-L15)
- 上下文构建：[file:///workspace/server/src/agents/grader.ts#L59-L70](file:///workspace/server/src/agents/grader.ts#L59-L70)

---

### 1.4 Generator（生成器）

**职责定位**

基于检索到的知识片段与证据，结合质量评分，生成最终的用户回答。

**输入/输出**

| 类型 | 格式 | 说明 |
|------|------|------|
| 输入 | `question` + `RetrievalResult` + `GradeResult` | 问题 + 检索结果 + 评分 |
| 输出 | `GenerationResult` | 回答 + token 消耗 + 预估费用 |

**核心逻辑**

1. **生成上下文构建**：
   - 知识片段列表（标题 + 摘要）
   - 可用证据片段（span_id + 来源 + 文本 + 语言）
   - 检索质量评估（各维度分数 + 推理说明）

2. **回答生成**：
   - 调用 LLM（`qa_gen` 路由），temperature = 0.4，maxTokens = 2000
   - 要求使用 `[^span_id]` 格式引用证据

3. **降级策略**：
   - 无检索结果 → 返回引导性提示（换关键词、上传文档等）
   - LLM 调用失败 → 返回前 3 条检索结果的摘要
   - 明确标注"AI 生成服务不可用"

**代码引用**

- 主函数：[file:///workspace/server/src/agents/generator.ts#L29-L62](file:///workspace/server/src/agents/generator.ts#L29-L62)
- 上下文构建：[file:///workspace/server/src/agents/generator.ts#L64-L83](file:///workspace/server/src/agents/generator.ts#L64-L83)
- 降级回答：[file:///workspace/server/src/agents/generator.ts#L85-L96](file:///workspace/server/src/agents/generator.ts#L85-L96)

---

### 1.5 Reflector（反思器）

**职责定位**

评估当前轮次的信息增益，判断是否需要继续检索以完善回答，实现多轮迭代检索的闭环控制。

**输入/输出**

| 类型 | 格式 | 说明 |
|------|------|------|
| 输入 | `GradeResult` + 新实体 + 新证据 ID | 评分 + 增量信息 |
| 输出 | `ReflectionResult` | 是否继续 + 完整度 + 缺口 + 下一步动作 |

**核心逻辑**

1. **状态追踪**（`Reflector` 类维护）：
   - `roundCount`：当前轮次
   - `totalEntities`：累计实体集合（去重）
   - `totalEvidence`：累计证据集合（去重）
   - `consecutiveNoGain`：连续无增益轮数

2. **停止条件**（任一触发即停止）：
   - **轮次上限**：达到 `MAX_ROUNDS = 5` 轮
   - **时间上限**：达到 `MAX_DURATION_MS = 3000ms`
   - **无增益**：连续 2 轮无新实体或新证据

3. **决策方式**：
   - 优先调用 LLM（`qa_gen` 路由）进行智能反思
   - 失败降级为规则判断：`overall < 0.8` 且有增益且连续无增益 < 2 → 继续

**代码引用**

- 主类：[file:///workspace/server/src/agents/reflector.ts#L33-L124](file:///workspace/server/src/agents/reflector.ts#L33-L124)
- 反思结果：[file:///workspace/server/src/agents/reflector.ts#L8-L15](file:///workspace/server/src/agents/reflector.ts#L8-L15)
- 规则降级：[file:///workspace/server/src/agents/reflector.ts#L154-L171](file:///workspace/server/src/agents/reflector.ts#L154-L171)

---

## 2. Agent 扩展模块

除核心五阶段外，系统提供四个扩展模块以增强对话体验、知识沉淀与多语言支持。

### 2.1 Compression（对话压缩）

**职责定位**

当对话轮次超过阈值时，将历史对话压缩为简洁摘要，注入下一轮 Planner 提示词，避免上下文过长导致的性能与成本问题。

**核心机制**

| 配置项 | 默认值 | 说明 |
|--------|--------|------|
| 触发阈值 | 5 轮 | `messageCount > DEFAULT_COMPRESSION_THRESHOLD` |
| 输出格式 | 历史摘要 + 追问建议 | 两部分结构化输出 |

**执行流程**

1. 从 `conversation_logs` 表加载对话历史，按时间排序
2. 构建对话 transcript，调用 LLM（`compress` 路由）进行压缩
3. 输出包含两部分：
   - `[历史摘要]`：关键事实、用户意图、已确认结论
   - `[下一轮追问建议]`：1-2 个可继续追问的方向
4. 将压缩结果格式化为 Planner 注入提示词
5. **降级策略**：LLM 失败时使用截断式摘要（最近一轮用户问题 + 最近回答要点）

**代码引用**

- 主函数：[file:///workspace/server/src/agents/compression.ts#L26-L64](file:///workspace/server/src/agents/compression.ts#L26-L64)
- 触发判断：[file:///workspace/server/src/agents/compression.ts#L21-L24](file:///workspace/server/src/agents/compression.ts#L21-L24)
- 降级摘要：[file:///workspace/server/src/agents/compression.ts#L76-L98](file:///workspace/server/src/agents/compression.ts#L76-L98)

---

### 2.2 Observe（静默观察）

**职责定位**

在用户无感知的情况下，追踪文件被引用的频率，当达到阈值时自动触发事实抽取，将非结构化证据转化为结构化 pending_diff。

**核心机制**

| 配置项 | 默认值 | 说明 |
|--------|--------|------|
| 观察阈值 | 3 次 | 文件被引用次数达到此值触发抽取 |
| 存储表 | `observed_files` | 记录 file_hash + 引用计数 + 时间 |

**执行流程**

1. **观察记录**：每次引用文件时，调用 `observeFile()` 更新 `observed_files` 表
   - 首次引用 → 插入记录，计数为 1
   - 重复引用 → `reference_count + 1`，更新最后引用时间

2. **阈值检查**：调用 `checkObservedThreshold()` 判断是否达到抽取条件

3. **事实抽取**（`extractFacts()`）：
   - 加载该文件的所有证据片段（按原文偏移量排序）
   - 调用 LLM（`fact_extract` 路由）识别关键事实
   - 生成 `pending_diff` 候选项，包含字段、新值、上下文、证据 ID、置信度、影响级别、分级
   - 持久化到 `pending_diffs` 表
   - 更新 `library_files.status`：
     - 产生新 diff → `partially_extracted`
     - 无新 diff → `fully_extracted`

**代码引用**

- 观察记录：[file:///workspace/server/src/agents/observe.ts#L27-L46](file:///workspace/server/src/agents/observe.ts#L27-L46)
- 事实抽取：[file:///workspace/server/src/agents/observe.ts#L69-L110](file:///workspace/server/src/agents/observe.ts#L69-L110)
- Diff 持久化：[file:///workspace/server/src/agents/observe.ts#L161-L195](file:///workspace/server/src/agents/observe.ts#L161-L195)

---

### 2.3 Feedback（用户反馈）

**职责定位**

收集用户对回答的正向/负向反馈，将负向反馈转化为影子评估基准用例，并触发相关源文件的重抽取。

**核心机制**

| 反馈类型 | 处理方式 |
|----------|----------|
| `helpful`（正向） | 仅记录日志，无需进一步处理 |
| `wrong`（负向/纠错） | 写入影子基准 + 标记源文件待重抽取 |

**执行流程**

1. 加载对应消息，提取引用的证据 span ID（匹配 `[^span_id]` 模式）
2. **正向反馈**：记录日志后直接返回
3. **负向反馈**（并行执行）：
   - **写入影子基准**：将问题与用户说明（或默认占位）插入 `shadow_benchmarks` 表，类型为 `correction`
   - **标记源文件**：通过 span ID 找到对应源文件，将状态更新为 `partially_extracted`（排除已 `fully_extracted` 和 `superseded` 的文件），触发后续事实重抽取

**代码引用**

- 主函数：[file:///workspace/server/src/agents/feedback.ts#L13-L42](file:///workspace/server/src/agents/feedback.ts#L13-L42)
- 引用提取：[file:///workspace/server/src/agents/feedback.ts#L76-L84](file:///workspace/server/src/agents/feedback.ts#L76-L84)
- 影子基准写入：[file:///workspace/server/src/agents/feedback.ts#L86-L106](file:///workspace/server/src/agents/feedback.ts#L86-L106)

---

### 2.4 Translate（证据翻译）

**职责定位**

为多语言知识库提供证据片段的翻译能力，支持缓存机制以降低翻译成本。

**核心机制**

| 配置项 | 默认值 | 说明 |
|--------|--------|------|
| 目标语言 | `zh-CN` | 默认翻译为简体中文 |
| 缓存 TTL | 90 天 | `CACHE_TTL_DAYS = 90` |
| 存储表 | `evidence_translations` | 翻译结果持久化 |

**执行流程**

1. 加载请求的证据片段，按语言过滤：
   - 已是目标语言 → 直接返回（passthrough 模式）
   - 非目标语言 → 进入翻译流程

2. **缓存查询**：先查 `evidence_translations` 表，命中则直接返回

3. **LLM 翻译**（未命中缓存的部分）：
   - 调用 LLM（`translate` 路由）批量翻译
   - 输出 JSON 数组格式：`[{"spanId": "...", "translatedText": "..."}]`
   - 保留专业术语、数字、代码、引用标记

4. **降级策略**：LLM 失败时返回 `[翻译降级] <原文前200字符>`

5. **缓存写入**：翻译结果写入 `evidence_translations` 表，设置过期时间

**代码引用**

- 主函数：[file:///workspace/server/src/agents/translate.ts#L18-L85](file:///workspace/server/src/agents/translate.ts#L18-L85)
- LLM 翻译：[file:///workspace/server/src/agents/translate.ts#L171-L210](file:///workspace/server/src/agents/translate.ts#L171-L210)
- 缓存管理：[file:///workspace/server/src/agents/translate.ts#L139-L169](file:///workspace/server/src/agents/translate.ts#L139-L169)

---

## 3. L2 混合检索策略（概述）

> 详细实现请参阅《检索引擎文档》（`06_RETRIEVAL_ENGINE.md`），此处仅作架构概述。

### 3.1 五路检索

L2 检索层采用五路并行检索策略，从不同维度召回相关知识：

| 检索通路 | 说明 |
|----------|------|
| 全文检索 | 基于 BM25 的关键词匹配 |
| 向量检索 | 基于 Embedding 的语义相似度 |
| 实体检索 | 基于命名实体的精确匹配 |
| 图谱检索 | 基于知识图谱的关联遍历 |
| 标签检索 | 基于分类标签的过滤 |

### 3.2 RRF 融合

五路检索结果通过 **Reciprocal Rank Fusion（RRF）** 算法进行融合排序：

- 对每条结果在各通路中的排名取倒数加权
- 合并后得到最终的融合排序
- 有效平衡各通路的优势，避免单一检索偏差

### 3.3 三重增强

检索结果经过三重增强处理，提升最终质量：

| 增强层级 | 说明 |
|----------|------|
| 证据增强 | 将非结构化文档切片为可追溯的 evidence span |
| 图谱增强 | 通过知识图谱补充关联实体与关系 |
| 重排序增强 | 可选的 reranker 模型进行精排 |

---

## 4. Dream Cycle 六阶段详解

Dream Cycle 是系统的**夜间知识进化周期**，每晚 02:00 自动触发（通过 `Bun.cron` 注册），对知识库进行系统性的整理、优化与评估。

> 当前实现状态：部分阶段已实现，其余阶段暂跳过（仅记录日志占位）。

### Dream Cycle 总览

```
阶段 1: 预算检查 ──→ 通过?
        │
        ├─ 否 → 中止并返回报告
        │
        └─ 是 → 阶段 2: 关系凝聚（跳过）
                    │
                    └→ 阶段 3: 实体归一化（跳过）
                            │
                            └→ 阶段 4: 幽灵清理（已实现）
                                    │
                                    └→ 阶段 5: 版本归档（跳过）
                                            │
                                            └→ 阶段 6: 影子评估（跳过）
```

**代码引用**：[file:///workspace/server/src/evolution/dream.ts#L35-L118](file:///workspace/server/src/evolution/dream.ts#L35-L118)

---

### 4.1 阶段 1：关系凝聚

> ⚠️ **当前状态**：暂未实现（`communityDetect.skipped = true`）

**触发条件**
- Dream Cycle 启动后，预算检查通过即进入

**操作内容**
- 基于知识图谱进行社区检测（Community Detection）
- 将关联紧密的实体聚类为社区
- 优化图谱结构，减少冗余关系

**输出产物**
- 优化后的知识图谱社区结构
- 社区检测报告

---

### 4.2 阶段 2：实体归一化

> ⚠️ **当前状态**：暂未实现（`nliPre.skipped = true`）

**触发条件**
- 关系凝聚阶段完成后

**操作内容**
- NLI（Natural Language Inference）预检
- 实体消歧与归一化
- 合并指代同一实体的不同表述

**输出产物**
- 归一化后的实体列表
- 实体合并记录

---

### 4.3 阶段 3：矛盾检测

**触发条件**
- 实体归一化阶段完成后

**操作内容**
- 检测不同来源证据之间的事实矛盾
- 标记冲突条目，生成矛盾对
- 按置信度与来源权威性排序

**输出产物**
- 矛盾检测报告
- 待人工审核的冲突列表

---

### 4.4 阶段 4：幽灵清理（已实现）

**触发条件**
- 前序阶段完成后（或跳过）
- 预算检查通过

**操作内容**

本阶段包含三个子任务：

#### 4.4.1 Forget Decay（遗忘衰减）

- **目标**：自动清理长期未处理的低置信度 pending_diff
- **参数**：
  - 时间阈值：`FORGET_DECAY_DAYS = 30` 天
  - 置信度阈值：`FORGET_DECAY_CONFIDENCE = 0.3`
- **操作**：将满足条件（`resolved = false` 且 `confidence < 0.3` 且 `created_at < 30天前`）的 pending_diff 标记为 `resolved = true`
- **代码引用**：[file:///workspace/server/src/evolution/dream.ts#L120-L139](file:///workspace/server/src/evolution/dream.ts#L120-L139)

#### 4.4.2 Lint（轻量检查）

- **目标**：清理过期的幽灵关系标记
- **操作**：将 `ghost_relations` 表中状态为 `pending` 且发现时间超过 14 天的记录标记为 `stale`
- **代码引用**：[file:///workspace/server/src/evolution/dream.ts#L141-L156](file:///workspace/server/src/evolution/dream.ts#L141-L156)

#### 4.4.3 Ghost Cleanup（幽灵清理）

- **目标**：检测并处理悬空链接（指向不存在页面的链接）
- **执行流程**：
  1. 从 `links` 表查找 `orphaned = true` 且尚未在 `ghost_relations` 中记录的悬空链接
  2. 对每条悬空链接：
     - 插入 `ghost_relations` 表，状态为 `pending`
     - 在源 Wiki 页面的「Open Threads」章节追加调查任务
     - 插入 `pending_diffs` 表（类型 `ghost_relation`，分级 `green`，置信度 0.9，影响 `low`）
- **代码引用**：[file:///workspace/server/src/evolution/ghost.ts#L15-L64](file:///workspace/server/src/evolution/ghost.ts#L15-L64)

**输出产物**
- `forgetDecay.decayed`：被遗忘的低置信 diff 数量
- `lint.ok`：lint 是否成功执行
- `ghostCleanup.detected` / `ghostCleanup.marked`：检测到并标记的幽灵链接数

---

### 4.5 阶段 5：版本归档

> ⚠️ **当前状态**：暂未实现（`topicCluster.skipped = true`，`gapAnalysis.skipped = true`）

**触发条件**
- 幽灵清理阶段完成后

**操作内容**
- **主题聚类**（Topic Cluster）：对知识内容进行主题聚类，发现知识盲区
- **缺口分析**（Gap Analysis）：识别主题覆盖缺口，生成补充建议

**输出产物**
- 主题聚类图谱
- 知识缺口分析报告

---

### 4.6 阶段 6：影子评估

> ⚠️ **当前状态**：暂未实现（`enrichExternal.skipped = true`，`diff.skipped = true`，`annualRing.skipped = true`）
>
> 注：影子评估的核心逻辑已独立实现（见第 6 章），但 Dream Cycle 编排中的集成调用暂未启用。

**触发条件**
- 版本归档阶段完成后

**操作内容**
- **外部知识增强**（Enrich External）：可选的外部知识源补充
- **Diff 审核**：批量处理分级 diff
- **年轮生成**（Annual Ring）：生成知识演化的时间快照

**输出产物**
- 外部知识增强报告
- Diff 批量应用记录
- 知识年轮版本

---

## 5. 分级 Diff 审核机制

系统采用**三级红绿灯审核机制**，对知识变更（pending_diff）进行分级管理，在自动化效率与人工审核质量间取得平衡。

### 5.1 PendingDiff 数据结构

**代码引用**：[file:///workspace/shared/types/diff.ts#L5-L21](file:///workspace/shared/types/diff.ts#L5-L21)

| 字段 | 类型 | 说明 |
|------|------|------|
| `id` | `string` | UUID 唯一标识 |
| `slug` | `string` | 关联的知识页面 slug |
| `type` | `DiffType` | Diff 类型（见下表） |
| `payload.field` | `string` | 变更的字段名 |
| `payload.oldValue` | `string?` | 旧值（可选） |
| `payload.newValue` | `string` | 新值 |
| `payload.context` | `string?` | 上下文说明 |
| `payload.evidenceSpanId` | `string?` | 关联的证据 span ID |
| `confidence` | `number` | 置信度（0.0 - 1.0） |
| `impact` | `'low' \| 'medium' \| 'high'` | 影响级别 |
| `tier` | `DiffTier` | 分级（green / yellow / red） |
| `createdAt` | `string` | 创建时间 |
| `resolved` | `boolean` | 是否已处理 |

**DiffType 枚举**：[file:///workspace/shared/types/diff.ts#L3](file:///workspace/shared/types/diff.ts#L3)

| 类型 | 说明 |
|------|------|
| `state` | 状态字段变更 |
| `assessment` | 评估字段变更 |
| `threads` | Open Threads 变更 |
| `relations` | 知识关系变更 |
| `ghost_cleanup` | 幽灵清理相关 |
| `archive` | 归档相关 |

---

### 5.2 🟢 批量区（Green）

**进入条件**

- `tier = 'green'`
- `impact = 'low'`
- 高置信度（通常 ≥ 0.8）
- 变更内容明确、可逆、风险低

**呈现方式**

- 在审核界面以绿色标识
- 汇总显示待批量应用的数量
- 可展开查看详细变更列表

**操作权限**

- ✅ **自动应用**：满足条件的 green diff 可批量自动应用
- ✅ **批量确认**：支持一键批量审核通过
- ✅ **单条跳过**：可对特定条目手动跳过

**典型场景**

- 幽灵链接检测与标记（`ghost_relation` 类型，置信度 0.9，影响 low）
- 小的格式修正
- 标签补充
- 低风险的元数据更新

---

### 5.3 🟡 预览区（Yellow）

**进入条件**

- `tier = 'yellow'`
- `impact = 'medium'`
- 中等置信度（0.5 - 0.8）
- 变更内容需要人工确认但风险可控

**呈现方式**

- 在审核界面以黄色标识
- 按页面分组展示
- 并排显示旧值/新值对比
- 显示证据来源与置信度

**操作权限**

- ⚠️ **需人工确认**：不可自动应用
- ✅ **单条审核**：逐条通过/驳回
- ✅ **批量同页**：同一页面的多条 yellow diff 可批量确认
- ✅ **编辑修改**：支持编辑后应用

**典型场景**

- 实体属性更新
- 关系添加/修改
- 内容扩充
- 来自静默观察的事实抽取结果（默认 yellow）

---

### 5.4 🔴 重点区（Red）

**进入条件**

- `tier = 'red'`
- `impact = 'high'`
- 低置信度（< 0.5）或高影响变更
- 涉及核心知识、矛盾内容或破坏性操作

**呈现方式**

- 在审核界面以红色醒目标识
- 置顶显示，优先处理
- 完整的变更上下文、证据链、风险提示
- 显示冲突对比（如有矛盾）

**操作权限**

- ⛔ **严禁自动应用**：必须人工逐条审核
- ✅ **双人复核**（建议）：高风险变更需多人确认
- ✅ **详细编辑**：支持深度编辑后再应用
- ✅ **驳回备注**：驳回时需填写原因
- ✅ **标记矛盾**：可标记为待矛盾检测

**典型场景**

- 核心事实的颠覆性变更
- 检测到的矛盾内容
- 涉及删除/合并的操作
- 低置信度但高影响的自动抽取结果

---

## 6. 影子评估与熔断

影子评估（Shadow Evaluation）是系统的**质量守门人**，通过在沙箱中运行基准测试集，持续监控问答质量，当指标恶化时触发熔断机制。

**代码引用**：[file:///workspace/server/src/evolution/shadow.ts#L40-L131](file:///workspace/server/src/evolution/shadow.ts#L40-L131)

### 6.1 基准测试集

**存储表**：`shadow_benchmarks`

| 字段 | 说明 |
|------|------|
| `id` | 自增 ID |
| `type` | 用例类型：`correction`（纠错/反例）、`negative`（负例）、正例 |
| `slug` | 关联 slug（可为 null） |
| `source_text` | 输入文本 / 问题 |
| `expected_output` | 期望输出 |
| `git_commit` | 关联的代码版本（可为 null） |

**用例来源**：
- 用户负向反馈自动写入（`correction` 类型）
- 人工添加的回归测试用例
- 历史纠错积累的反例

---

### 6.2 评分维度

影子评估从四个维度衡量问答质量：

| 维度 | 计算方式 | 阈值 | 说明 |
|------|----------|------|------|
| **正确率** | `correct / total` | ≥ 0.7 | 全部用例的通过率 |
| **复现率** | `reproduced / correctionsTotal` | ≥ 0.6 | 纠错反例的复现通过率 |
| **波动幅度** | `previousAccuracy - accuracy` | ≤ 0.15 | 与上一次评估的正确率差值 |
| **新增错误占比** | `newErrors / total` | ≤ 0.3 | 本次评估的错误比例 |

**评分方式**：
1. 对每条基准用例，调用 `qa_gen` 模型生成回答
2. 调用 `contradiction` 模型进行语义等价判定（LLM 判断 yes/no）
3. LLM 判定失败时降级为 Jaccard 相似度匹配（阈值 0.5）

**代码引用**：
- 评分逻辑：[file:///workspace/server/src/evolution/shadow.ts#L153-L180](file:///workspace/server/src/evolution/shadow.ts#L153-L180)
- 异常检测：[file:///workspace/server/src/evolution/shadow.ts#L204-L244](file:///workspace/server/src/evolution/shadow.ts#L204-L244)

---

### 6.3 熔断机制

当任一指标超过阈值时，触发熔断：

1. **写入异常标记**：将异常信息插入 `eval_anomaly_flags` 表
2. **中止后续任务**：返回 `passed = false`，上游任务据此中止
3. **告警通知**：记录错误日志，触发告警流程
4. **保留基线**：不更新 `shadow_eval_last_accuracy` 基线

**异常指标与阈值汇总**：

| 异常 metric | 触发条件 | 默认阈值 |
|-------------|----------|----------|
| `shadow.accuracy` | 正确率过低 | < 0.7 |
| `shadow.reproduction` | 复现率过低 | < 0.6 |
| `shadow.fluctuation` | 正确率波动过大 | > 0.15 |
| `shadow.new_errors` | 新增错误过多 | > 30% |

**基线管理**：
- 评估通过时，将正确率保存至 `settings` 表（key: `shadow_eval_last_accuracy`）
- 下次评估时读取基线用于波动比较
- 评估未通过时不更新基线，避免基线被拉低

**代码引用**：[file:///workspace/server/src/evolution/shadow.ts#L261-L290](file:///workspace/server/src/evolution/shadow.ts#L261-L290)

---

## 7. 预算控制策略

系统通过**三级预算体系**对 LLM 调用费用进行精细化管控，确保在预算范围内稳定运行，超出时自动熔断非关键任务。

**代码引用**：[file:///workspace/server/src/evolution/budget.ts#L33-L228](file:///workspace/server/src/evolution/budget.ts#L33-L228)

### 7.1 三级预算体系

| 预算级别 | 配置项 | 默认值 | 说明 |
|----------|--------|--------|------|
| **单次查询** | `PER_QUERY_BUDGET` | 0.5 元 | 单次问答的费用上限 |
| **日预算** | `DAILY_BUDGET` | 5 元 | 每日总费用上限 |
| **月预算** | `MONTHLY_BUDGET` | 50 元 | 每月总费用上限 |

**配置来源**：环境变量 + `settings.budget` 配置

---

### 7.2 预算检查与熔断

**检查时机**

- Dream Cycle 启动前（`dream_cycle` 任务）
- 各非交互任务执行前
- 由调用方主动调用 `budgetManager.checkBudget(task)`

**检查逻辑**（优先级从高到低）

1. **熔断状态检查**：若已触发熔断，直接拒绝
2. **日预算检查**：`dailyUsed >= dailyBudget` → 触发日熔断
3. **月预算检查**：`monthlyUsed >= monthlyBudget` → 触发月熔断
4. **全部通过**：返回 `{ allowed: true }`

**熔断影响**：
- 非交互任务（如 Dream Cycle、批量处理）被暂停
- 交互查询（用户问答）可能降级或受限
- 当日熔断后，跨日自动解除（日预算重置）
- 当月熔断后，跨月自动解除

**代码引用**：[file:///workspace/server/src/evolution/budget.ts#L54-L69](file:///workspace/server/src/evolution/budget.ts#L54-L69)

---

### 7.3 费用追踪

**记录方式**

- **内存计数器**：`dailyUsed` / `monthlyUsed`，实时累加
- **调用接口**：`budgetManager.recordUsage(tokens, cost, task)`
- **日志记录**：每次记录输出 debug 级别日志

**跨周期重置**（惰性重置）：

- 日计数器：每次检查/记录时比对日期，跨日则重置为 0
- 月计数器：每次检查/记录时比对月份，跨月则重置为 0
- 熔断解除：重置时若使用量低于预算，自动解除熔断状态

**代码引用**：
- 费用记录：[file:///workspace/server/src/evolution/budget.ts#L71-L79](file:///workspace/server/src/evolution/budget.ts#L71-L79)
- 惰性重置：[file:///workspace/server/src/evolution/budget.ts#L153-L177](file:///workspace/server/src/evolution/budget.ts#L153-L177)

---

### 7.4 告警机制

**告警缓冲**

- 内存中维护 `alerts` 数组（最多 100 条，FIFO）
- 仪表盘可通过 `getAlerts()` / `getSnapshot()` 读取

**告警持久化**

- 写入 `eval_anomaly_flags` 表（复用为通用异常表）
- 字段：`metric` / `threshold` / `actual` / `ts` / `message`

**告警结构**：[file:///workspace/server/src/evolution/budget.ts#L16-L22](file:///workspace/server/src/evolution/budget.ts#L16-L22)

**预算调整**：

- `setDailyBudget(amount)`：更新日预算，若新预算高于已用量则解除熔断
- `setMonthlyBudget(amount)`：更新月预算，同理
- 无效值（负数、非数字）被忽略并记录警告

---

## 8. 10 家 LLM 适配器架构

系统采用**适配器模式**集成 10 家主流大模型服务商，通过统一的路由层按任务类型分配最优模型。

### 8.1 基类接口

**LLMAdapter 接口**

定义于 [file:///workspace/shared/types/llm.ts#L25-L31](file:///workspace/shared/types/llm.ts#L25-L31)

| 方法/属性 | 签名 | 说明 |
|-----------|------|------|
| `id` | `AdapterId` | 适配器唯一标识 |
| `displayName` | `string` | 显示名称 |
| `chat()` | `(req: LLMRequest) => Promise<LLMResponse>` | 对话补全 |
| `embed()` | `(text: string) => Promise<number[]>` | 向量嵌入 |
| `probe()` | `() => Promise<{ok, latencyMs, error?}>` | 连通性探测 |

**BaseLLMAdapter 抽象类**

定义于 [file:///workspace/server/src/llm/adapter.ts#L4-L34](file:///workspace/server/src/llm/adapter.ts#L4-L34)

- 实现 `estimateCost()` 方法，内置 20+ 种模型的定价表
- 按 prompt / completion 分别计价，单位：元 / 1000 tokens

**BaseOpenAICompatibleAdapter 类**

定义于 [file:///workspace/server/src/llm/adapter.ts#L36-L158](file:///workspace/server/src/llm/adapter.ts#L36-L158)

- 兼容 OpenAI API 格式的通用适配器基类
- 实现 `chat()` / `embed()` / `probe()` 标准 HTTP 调用
- 支持 `jsonMode`（映射为 `response_format: { type: 'json_object' }`）
- 自动计算 token 用量与预估费用

---

### 8.2 适配器清单（10 家）

| 序号 | AdapterId | 服务商 | 默认模型 | 代码文件 |
|------|-----------|--------|----------|----------|
| 1 | `bailian` | 阿里百炼 | `qwen-turbo` | `adapters/bailian.ts` |
| 2 | `zhipu` | 智谱 AI | `glm-4-flash` | `adapters/zhipu.ts` |
| 3 | `moonshot` | 月之暗面 | `moonshot-v1-8k` | `adapters/moonshot.ts` |
| 4 | `ernie` | 百度文心 | `ernie-speed-128k` | `adapters/ernie.ts` |
| 5 | `spark` | 讯飞星火 | `spark-lite` | `adapters/spark.ts` |
| 6 | `hunyuan` | 腾讯混元 | `hunyuan-lite` | `adapters/hunyuan.ts` |
| 7 | `minimax` | MiniMax | `abab6.5-chat` | `adapters/minimax.ts` |
| 8 | `deepseek` | DeepSeek | `deepseek-chat` | `adapters/deepseek.ts` |
| 9 | `yi` | 零一万物 | `yi-large` | `adapters/yi.ts` |
| 10 | `baichuan` | 百川智能 | `Baichuan2-Turbo` | `adapters/baichuan.ts` |

**初始化逻辑**：[file:///workspace/server/src/llm/router.ts#L25-L49](file:///workspace/server/src/llm/router.ts#L25-L49)

> 所有适配器均继承 `BaseOpenAICompatibleAdapter`，通过不同的 `baseURL` 和 API Key 区分服务商。

---

### 8.3 路由策略

**任务类型（ModelTier）**

系统定义了 13 种任务类型，每种可独立分配模型：

| 任务类型 | 用途说明 |
|----------|----------|
| `qa_gen` | 问答生成（主任务） |
| `fact_extract` | 事实抽取 |
| `whitelist_fix` | 白名单修复 |
| `disambiguate` | 实体消歧 |
| `nli_pre` | NLI 预检 |
| `translate` | 证据翻译 |
| `compress` | 对话压缩 |
| `archive_summary` | 归档摘要 |
| `ring_gen` | 年轮生成 |
| `contradiction` | 矛盾检测/语义判定 |
| `gap_analysis` | 缺口分析 |
| `narrate` | 叙事生成 |
| `embed` | 向量嵌入 |

**路由方式**：[file:///workspace/server/src/llm/router.ts#L55-L67](file:///workspace/server/src/llm/router.ts#L55-L67)

1. 调用 `llmRouter.route(task)` 传入任务类型
2. 查找 `modelAssignment` 配置表，获取对应的 `adapterId` 和 `model`
3. 返回对应适配器实例

**推荐分配（RECOMMENDED_MODEL_ASSIGNMENT）**

默认所有任务均使用 DeepSeek 适配器，具体模型如下：

| 任务 | 适配器 | 模型 |
|------|--------|------|
| 所有文本任务 | `deepseek` | `deepseek-chat` |
| 向量嵌入 | `deepseek` | `text-embedding-v1` |

> 用户可在设置中自定义各任务的模型分配，支持混合使用多家模型。

**代码引用**：[file:///workspace/shared/types/settings.ts#L100-L114](file:///workspace/shared/types/settings.ts#L100-L114)

---

### 8.4 适配器状态管理

**状态查询**：`llmRouter.getAdapterStatuses()`

返回每个适配器的状态信息：
- `id` / `displayName`
- `enabled`：是否启用
- `apiKeyConfigured`：API Key 是否已配置
- `defaultModel`：默认模型名

**配置检测**：`llmRouter.hasAnyConfigured()`

- 检查是否至少有一个适配器配置了 API Key
- 用于判断系统是否具备 LLM 调用能力

**代码引用**：[file:///workspace/server/src/llm/router.ts#L81-L104](file:///workspace/server/src/llm/router.ts#L81-L104)

---

## 附录：关键数据结构索引

| 数据结构 | 定义文件 |
|----------|----------|
| `RetrievalPlan` | [file:///workspace/server/src/agents/planner.ts#L7-L12](file:///workspace/server/src/agents/planner.ts#L7-L12) |
| `RetrievalResult` | [file:///workspace/server/src/agents/retriever.ts#L8-L12](file:///workspace/server/src/agents/retriever.ts#L8-L12) |
| `GradeResult` | [file:///workspace/server/src/agents/grader.ts#L8-L15](file:///workspace/server/src/agents/grader.ts#L8-L15) |
| `GenerationResult` | [file:///workspace/server/src/agents/generator.ts#L9-L13](file:///workspace/server/src/agents/generator.ts#L9-L13) |
| `ReflectionResult` | [file:///workspace/server/src/agents/reflector.ts#L8-L15](file:///workspace/server/src/agents/reflector.ts#L8-L15) |
| `PendingDiff` | [file:///workspace/shared/types/diff.ts#L5-L21](file:///workspace/shared/types/diff.ts#L5-L21) |
| `DreamReport` | [file:///workspace/server/src/evolution/dream.ts#L5-L23](file:///workspace/server/src/evolution/dream.ts#L5-L23) |
| `ShadowEvalResult` | [file:///workspace/server/src/evolution/shadow.ts#L7-L13](file:///workspace/server/src/evolution/shadow.ts#L7-L13) |
| `BudgetCheckResult` | [file:///workspace/server/src/evolution/budget.ts#L6-L9](file:///workspace/server/src/evolution/budget.ts#L6-L9) |
| `LLMAdapter` | [file:///workspace/shared/types/llm.ts#L25-L31](file:///workspace/shared/types/llm.ts#L25-L31) |
| `AdapterStatus` | [file:///workspace/shared/types/llm.ts#L33-L39](file:///workspace/shared/types/llm.ts#L33-L39) |
